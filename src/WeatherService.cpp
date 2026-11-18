#include "WeatherService.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <mbedtls/error.h>
#include <mbedtls/net_sockets.h>
#include <memory>
#include <new>
#include <stdio.h>
#include <time.h>
#include "Config.h"
#include "TimeSync.h"
#include "WeatherCertificates.h"
#include "WeatherParser.h"
#include "WeatherTransport.h"

namespace {
class BoundedBody : public Stream {
 public:
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}
  size_t write(uint8_t value) override { return write(&value, 1); }
  size_t write(const uint8_t *bytes, size_t count) override {
    if (count > Config::MAX_WEATHER_RESPONSE_BYTES - size_) {
      overflowed_ = true;
      return 0;
    }
    memcpy(buffer_ + size_, bytes, count);
    size_ += count;
    buffer_[size_] = '\0';
    return count;
  }
  const char *body() const { return buffer_; }
  size_t size() const { return size_; }
  bool overflowed() const { return overflowed_; }
 private:
  char buffer_[Config::MAX_WEATHER_RESPONSE_BYTES + 1] = {};
  size_t size_ = 0;
  bool overflowed_ = false;
};

const char *failureName(NetworkFailure failure) {
  switch (failure) {
    case NetworkFailure::Cancelled: return "REQUEST_CANCELLED";
    case NetworkFailure::WorkerDeadline: return "WORKER_DEADLINE_EXCEEDED";
    case NetworkFailure::TcpTimeout: return "TCP_TIMEOUT";
    case NetworkFailure::TcpError: return "TCP_CONNECT_ERROR";
    case NetworkFailure::TlsTimeout: return "TLS_HANDSHAKE_TIMEOUT";
    case NetworkFailure::TlsError: return "TLS_HANDSHAKE_ERROR";
    case NetworkFailure::HttpTimeout: return "HTTP_IDLE_TIMEOUT";
    case NetworkFailure::TlsIoError: return "TLS_IO_ERROR";
    case NetworkFailure::NoMemory: return "OUT_OF_MEMORY";
    default: return "HTTP_ERROR";
  }
}

void describeTransportError(WeatherTransport &client, char *error, size_t capacity) {
  char detail[96] = {};
  if (client.tlsError()) {
    mbedtls_strerror(client.tlsError(), detail, sizeof(detail));
  }
  // Một số bản ESP32 không có chuỗi net error trong mbedtls_strerror().
  if (client.tlsError() == MBEDTLS_ERR_NET_SEND_FAILED) {
    snprintf(detail, sizeof(detail), "SOCKET_SEND_FAILED");
  } else if (client.tlsError() == MBEDTLS_ERR_NET_RECV_FAILED) {
    snprintf(detail, sizeof(detail), "SOCKET_RECV_FAILED");
  } else if (client.tlsError() == MBEDTLS_ERR_NET_CONN_RESET) {
    snprintf(detail, sizeof(detail), "SOCKET_CONNECTION_RESET");
  }
  char flags[24] = "UNAVAILABLE";
  if (client.verifyFlagsKnown()) {
    snprintf(flags, sizeof(flags), "0x%lx", static_cast<unsigned long>(client.verifyFlags()));
  }
  snprintf(error, capacity, "%s: phase=%s fatal=%d last=%d errno=%d verify=%s %s",
           failureName(client.failure()), client.tlsPhase(), client.tlsError(),
           client.lastTlsCode(), client.socketError(), flags, detail);
}
}  // namespace

const char *WeatherService::stageName(Stage stage) {
  switch (stage) {
    case Stage::Worker: return "WORKER";
    case Stage::Dns: return "DNS";
    case Stage::Tcp: return "TCP";
    case Stage::Tls: return "TLS";
    case Stage::Http: return "HTTP_GET/HEADERS";
    case Stage::Body: return "HTTP_BODY";
    case Stage::Json: return "JSON";
    case Stage::Done: return "DONE";
    default: return "QUEUED";
  }
}

bool WeatherService::begin() {
  demoRainProbability_ = Config::DEMO_INITIAL_RAIN_PROBABILITY;
  if (Config::DEMO_WEATHER_MODE) {
    Serial.println("[Weather] SIMULATED - Khong goi Open-Meteo.");
    Serial.println("[Demo] Gui 1: mua 20%; 2: mua 85%; x: du lieu UNKNOWN.");
    return true;
  }
  requests_ = xQueueCreate(1, sizeof(Request));
  results_ = xQueueCreate(1, sizeof(Result));
  progress_ = xQueueCreate(24, sizeof(Progress));
  if (requests_ && results_ && progress_ &&
      xTaskCreate(taskEntry, "weather-https", Config::WEATHER_WORKER_STACK_BYTES,
                  this, 1, &task_) == pdPASS) {
    Serial.printf("[Weather] Mot worker HTTPS, stack=%lu bytes, queue=%lu ms, worker=%lu ms\n",
                  static_cast<unsigned long>(Config::WEATHER_WORKER_STACK_BYTES),
                  static_cast<unsigned long>(Config::WEATHER_QUEUE_TIMEOUT_MS),
                  static_cast<unsigned long>(Config::WEATHER_REQUEST_DEADLINE_MS));
    return true;
  }
  if (requests_) { vQueueDelete(requests_); requests_ = nullptr; }
  if (results_) { vQueueDelete(results_); results_ = nullptr; }
  if (progress_) { vQueueDelete(progress_); progress_ = nullptr; }
  invalidate("Khong tao duoc tac vu/queue thoi tiet; bom bi khoa");
  return false;
}

void WeatherService::invalidate(const char *reason) {
  valid_ = false;
  snprintf(lastError_, sizeof(lastError_), "%s", reason);
}

WeatherState WeatherService::state(uint32_t nowMs) const {
  return classifyWeather(valid_, hasSample_, data_.updatedAtMs, nowMs,
                         Config::WEATHER_MAX_AGE_MS);
}

void WeatherService::selectDemoRain(uint8_t probabilityPercent) {
  if (!Config::DEMO_WEATHER_MODE ||
      (probabilityPercent != 20 && probabilityPercent != 85)) { return; }
  demoRainProbability_ = probabilityPercent;
  demoUnavailable_ = false;
  demoRefreshRequested_ = true;
}

void WeatherService::simulateUnavailable() {
  if (Config::DEMO_WEATHER_MODE) {
    demoUnavailable_ = true;
    invalidate("SIMULATED: mo phong API khong phan hoi");
  }
}

void WeatherService::updateDemo(uint32_t nowMs) {
  if (demoUnavailable_) { return; }
  if (!demoRefreshRequested_ && hasSample_ &&
      nowMs - data_.updatedAtMs < Config::WEATHER_UPDATE_INTERVAL_MS) { return; }
  data_ = WeatherData{};
  data_.simulated = true;
  data_.maxRainProbabilityPercent = demoRainProbability_;
  const time_t epoch = time(nullptr);
  data_.updatedAtEpoch = epoch >= Config::MIN_VALID_UNIX_TIME ? epoch : 0;
  data_.updatedAtMs = nowMs;
  valid_ = hasSample_ = true;
  demoRefreshRequested_ = false;
  lastError_[0] = '\0';
  Serial.printf("[Weather] SIMULATED - Xac suat mua: %u%%\n",
                static_cast<unsigned int>(demoRainProbability_));
}

void WeatherService::cancelActive(const char *reason, uint32_t nowMs) {
  invalidate(reason);
  lastAttemptSucceeded_ = false;
  retryPolicy_.completed(false, false);
  if (lifecycle_.busy() && !lifecycle_.cancelled()) {
    lifecycle_.cancel(nowMs);
    allowedRequestId_.store(0, std::memory_order_release);
    Serial.printf("[NET ms=%lu id=%lu] CANCEL | phase=%s | %s\n",
                  static_cast<unsigned long>(nowMs), static_cast<unsigned long>(lifecycle_.id()),
                  stageName(workerStage_.load()), reason);
  }
}

void WeatherService::update(bool wifiConnected, uint32_t wifiSession, uint32_t nowMs) {
  // Kể cả mất WiFi vẫn phải lấy kết quả để thu hồi slot của worker đã kết thúc.
  if (!wifiConnected) {
    cancelActive("WIFI_DISCONNECTED: can cap nhat lai sau khi ket noi", nowMs);
  } else if (wifiSession != lastWifiSession_) {
    lastWifiSession_ = wifiSession;
    retryImmediately_ = demoRefreshRequested_ = true;
    if (lifecycle_.busy() && lifecycle_.session() != wifiSession) {
      cancelActive("WIFI_SESSION_CHANGED: huy request phien cu", nowMs);
    } else {
      invalidate("Phien WiFi moi; dang cho du lieu moi");
    }
  }
  if (!Config::DEMO_WEATHER_MODE && !TimeSync::ready()) {
    cancelActive(TimeSync::pendingReason(), nowMs);
  }

  if (progress_) {
    Progress progress;
    // Giới hạn log mỗi loop để không chiếm hết chu kỳ điều khiển bơm.
    for (uint8_t i = 0; i < 4 && xQueueReceive(progress_, &progress, 0) == pdTRUE; ++i) {
      Serial.printf("[NET ms=%lu id=%lu +%lu step=%lu] %s | %s | stack_free=%lu heap=%lu\n",
                    static_cast<unsigned long>(progress.atMs),
                    static_cast<unsigned long>(progress.requestId),
                    static_cast<unsigned long>(progress.workerElapsedMs),
                    static_cast<unsigned long>(progress.stepElapsedMs), progress.event, progress.message,
                    static_cast<unsigned long>(progress.stackFreeBytes),
                    static_cast<unsigned long>(progress.freeHeapBytes));
    }
  }
  // nowMs từ main có thể đã cũ sau khi in Serial.
  nowMs = millis();
  if (lifecycle_.busy() &&
      workerStartedId_.load(std::memory_order_acquire) == lifecycle_.id()) {
    lifecycle_.started(lifecycle_.id(), workerStartedAtMs_.load());
  }
  const RequestDeadline deadline = lifecycle_.deadline(nowMs);
  if (deadline != RequestDeadline::None && !lifecycle_.cancelled()) {
    cancelActive(deadline == RequestDeadline::Queue ? "QUEUE_TIMEOUT: worker chua bat dau trong 5s"
                                                   : "WORKER_DEADLINE_EXCEEDED: 90s tinh tu WORKER_BEGIN",
                 nowMs);
  }

  if (results_) {
    Result result;
    if (xQueueReceive(results_, &result, 0) == pdTRUE) {
      nowMs = millis();
      lifecycle_.started(result.request.id, result.startedAtMs);
      const bool matches = lifecycle_.busy() && result.request.id == lifecycle_.id();
      const bool eligible = lifecycle_.accepts(result.request.id, wifiSession, nowMs) &&
                          result.request.wifiSession == wifiSession && wifiConnected &&
                          WiFi.status() == WL_CONNECTED && TimeSync::ready();
      const int64_t epoch = static_cast<int64_t>(time(nullptr));
      const bool fresh = classifyWeather(true, result.success, result.data.updatedAtMs,
                                          nowMs, Config::WEATHER_MAX_AGE_MS) == WeatherState::Valid &&
                         result.data.updatedAtEpoch <= epoch + 120 &&
                         epoch - result.data.updatedAtEpoch <= Config::WEATHER_MAX_AGE_MS / 1000 &&
                         result.data.currentTimeEpoch <= epoch + 120 &&
                         epoch - result.data.currentTimeEpoch <= 1800;
      const bool accept = eligible && result.success && fresh;
      Serial.printf("[NET ms=%lu id=%lu] RESULT_RECEIVED | queue_wait=%lu run=%lu delivery=%lu ms"
                    " | accept=%s HTTP=%d | stack_free=%lu heap=%lu | %s\n",
                    static_cast<unsigned long>(nowMs), static_cast<unsigned long>(result.request.id),
                    static_cast<unsigned long>(result.startedAtMs - result.request.queuedAtMs),
                    static_cast<unsigned long>(result.finishedAtMs - result.startedAtMs),
                    static_cast<unsigned long>(nowMs - result.finishedAtMs), accept ? "yes" : "no",
                    result.httpCode, static_cast<unsigned long>(result.stackFreeBytes),
                    static_cast<unsigned long>(result.freeHeapBytes),
                    result.success ? "JSON_OK" : result.error);
      if (accept) {
        data_ = result.data;
        valid_ = hasSample_ = true;
        lastAttemptSucceeded_ = true;
        retryPolicy_.completed(true, false);
        lastError_[0] = '\0';
        Serial.println("[Weather] REAL / Open-Meteo - Cap nhat thanh cong.");
      } else if (matches && !lifecycle_.cancelled()) {
        lastAttemptSucceeded_ = false;
        retryPolicy_.completed(false, eligible && result.retryableSocketError);
        invalidate(eligible && !result.success ? result.error
                                            : "RESULT_REJECTED: qua han/phien cu/du lieu khong con hop le");
      }
      // Kết quả sai ID không được giải phóng request hiện tại.
      if (lifecycle_.finish(result.request.id)) {
        allowedRequestId_.store(0, std::memory_order_release);
        lastFinishedAtMs_ = nowMs;
        if (!lastAttemptSucceeded_) {
          Serial.printf("[NET ms=%lu] RETRY_SCHEDULE | socket_error=%s delay=%lu ms; worker slot released\n",
                        static_cast<unsigned long>(nowMs),
                        result.retryableSocketError ? "yes" : "no",
                        static_cast<unsigned long>(retryPolicy_.interval(false)));
        }
      }
    }
  }

  nowMs = millis();
  if (lifecycle_.busy() &&
      nowMs - lastHeartbeatAtMs_ >= Config::WEATHER_WORKER_HEARTBEAT_MS) {
    lastHeartbeatAtMs_ = nowMs;
    Serial.printf("[NET ms=%lu id=%lu] WORKER_STATUS | phase=%s elapsed=%lu cancelled=%s"
                  " | stack_free=%lu heap=%lu dropped_logs=%lu\n",
                  static_cast<unsigned long>(nowMs), static_cast<unsigned long>(lifecycle_.id()),
                  stageName(workerStage_.load()),
                  static_cast<unsigned long>(nowMs - (lifecycle_.hasStarted()
                                                 ? lifecycle_.startedAt() : lifecycle_.queuedAt())),
                  lifecycle_.cancelled() ? "yes" : "no",
                  static_cast<unsigned long>(workerStackFreeBytes_.load()),
                  static_cast<unsigned long>(workerFreeHeapBytes_.load()),
                  static_cast<unsigned long>(droppedProgress_.load()));
  }
  if (lifecycle_.needsRecovery(nowMs) && !recoveryRequired_) {
    recoveryRequired_ = true;
    invalidate("WORKER_STUCK: huy 30s chua tra ve; yeu cau reboot sau khi bom OFF");
    Serial.printf("[NET ms=%lu] %s\n", static_cast<unsigned long>(nowMs), lastError_);
  }
  if (dns_.stalled(nowMs) && !recoveryRequired_) {
    recoveryRequired_ = true;
    cancelActive("DNS_CALLBACK_STUCK: query qua han va het grace; yeu cau reboot an toan", nowMs);
  }
  if (!wifiConnected) { return; }
  if (Config::DEMO_WEATHER_MODE) { updateDemo(nowMs); return; }
  if (!task_ || recoveryRequired_ || lifecycle_.busy() || !TimeSync::ready()) { return; }

  const uint32_t interval = retryPolicy_.interval(lastAttemptSucceeded_);
  if (attempted_ && !retryImmediately_ && nowMs - lastFinishedAtMs_ < interval) { return; }
  Request request;
  if (++nextRequestId_ == 0) { ++nextRequestId_; }
  request.id = nextRequestId_;
  request.wifiSession = wifiSession;
  request.queuedAtMs = nowMs;
  if (!lifecycle_.begin(request.id, wifiSession, nowMs)) { return; }
  workerStartedId_.store(0, std::memory_order_release);
  workerStage_.store(Stage::Queued);
  allowedRequestId_.store(request.id, std::memory_order_release);
  attempted_ = true;
  retryImmediately_ = false;
  lastHeartbeatAtMs_ = nowMs;
  if (xQueueSend(requests_, &request, 0) != pdTRUE) {
    allowedRequestId_.store(0, std::memory_order_release);
    lifecycle_.finish(request.id);
    lastFinishedAtMs_ = nowMs;
    lastAttemptSucceeded_ = false;
    retryPolicy_.completed(false, false);
    invalidate("REQUEST_QUEUE_ERROR: khong gui duoc cong viec");
  } else {
    Serial.printf("[NET ms=%lu id=%lu] QUEUED | session=%lu\n",
                  static_cast<unsigned long>(nowMs), static_cast<unsigned long>(request.id),
                  static_cast<unsigned long>(wifiSession));
  }
}

void WeatherService::taskEntry(void *context) {
  auto *service = static_cast<WeatherService *>(context);
  Request request;
  for (;;) {
    if (xQueueReceive(service->requests_, &request, portMAX_DELAY) == pdTRUE) {
      const uint32_t startedAt = millis();
      service->workerStartedAtMs_.store(startedAt);
      service->workerLastTraceAtMs_.store(startedAt);
      service->workerStartedId_.store(request.id, std::memory_order_release);
      service->reportProgress(request.id, Stage::Worker, "WORKER_BEGIN", "Nhan request tu queue");
      Result result = service->fetch(request, startedAt);
      // fetch đã kết thúc: socket, TLS, HTTP và bộ đệm đã được destructor thu hồi.
      service->reportProgress(request.id, Stage::Done, "WORKER_END",
                              result.success ? "OK; da dong tai nguyen" : result.error);
      result.finishedAtMs = millis();
      result.stackFreeBytes = uxTaskGetStackHighWaterMark(nullptr);
      result.freeHeapBytes = ESP.getFreeHeap();
      xQueueOverwrite(service->results_, &result);
    }
  }
}

void WeatherService::reportProgress(uint32_t requestId, Stage stage, const char *event,
                                    const char *message) {
  Progress progress;
  progress.requestId = requestId;
  progress.atMs = millis();
  progress.workerElapsedMs = progress.atMs - workerStartedAtMs_.load();
  progress.stepElapsedMs = progress.atMs - workerLastTraceAtMs_.exchange(progress.atMs);
  progress.stackFreeBytes = uxTaskGetStackHighWaterMark(nullptr);  // ESP-IDF: bytes
  progress.freeHeapBytes = ESP.getFreeHeap();
  workerStackFreeBytes_.store(progress.stackFreeBytes);
  workerFreeHeapBytes_.store(progress.freeHeapBytes);
  workerStage_.store(stage);
  snprintf(progress.event, sizeof(progress.event), "%s", event);
  snprintf(progress.message, sizeof(progress.message), "%s", message);
  if (xQueueSend(progress_, &progress, 0) != pdTRUE) { droppedProgress_.fetch_add(1); }
}

void WeatherService::transportTrace(void *context, const char *event, const char *message) {
  auto *service = static_cast<WeatherService *>(context);
  const Stage stage = strncmp(event, "TCP", 3) == 0 ? Stage::Tcp : Stage::Tls;
  service->reportProgress(service->workerStartedId_.load(), stage, event, message);
}

bool WeatherService::shouldAbort(const Request &request, uint32_t startedAt, Result &result) {
  const uint32_t now = millis();
  const char *reason = nullptr;
  if (startedAt - request.queuedAtMs >= Config::WEATHER_QUEUE_TIMEOUT_MS) {
    reason = "QUEUE_TIMEOUT";
  } else if (now - startedAt >= Config::WEATHER_REQUEST_DEADLINE_MS) {
    reason = "WORKER_DEADLINE_EXCEEDED";
  } else if (allowedRequestId_.load(std::memory_order_acquire) != request.id) {
    reason = "REQUEST_CANCELLED";
  } else if (WiFi.status() != WL_CONNECTED) {
    reason = "WIFI_DISCONNECTED";
  } else if (!TimeSync::ready()) {
    reason = "TIME_NOT_VALID";
  }
  if (!reason) { return false; }
  snprintf(result.error, sizeof(result.error), "%s", reason);
  return true;
}

WeatherService::Result WeatherService::fetch(const Request &request, uint32_t startedAt) {
  Result result;
  result.request = request;
  result.startedAtMs = startedAt;
  if (shouldAbort(request, startedAt, result)) { return result; }

  char url[512];
  snprintf(url, sizeof(url),
           "%s?latitude=%.4f&longitude=%.4f"
           "&hourly=precipitation_probability,precipitation"
           "&current=temperature_2m,relative_humidity_2m"
           "&forecast_hours=%u&timezone=Asia%%2FHo_Chi_Minh"
           "&timeformat=unixtime&temperature_unit=celsius&precipitation_unit=mm",
           Config::WEATHER_API_URL, Config::LATITUDE, Config::LONGITUDE,
           static_cast<unsigned int>(Config::FORECAST_HOURS));
  const String expectedPrefix = String("https://") + Config::WEATHER_API_HOST + "/";
  if (!String(url).startsWith(expectedPrefix)) {
    snprintf(result.error, sizeof(result.error), "HTTPS_HOST_CONFIG_ERROR");
    return result;
  }

  reportProgress(request.id, Stage::Dns, "DNS_BEGIN", Config::WEATHER_API_HOST);
  IPAddress address;
  const uint32_t dnsStartedAt = millis();
  const DnsOutcome dnsOutcome = dns_.resolve(Config::WEATHER_API_HOST, address,
                                             allowedRequestId_, request.id, startedAt);
  const bool resolved = dnsOutcome == DnsOutcome::Success;
  const uint32_t dnsElapsed = millis() - dnsStartedAt;
  char diagnostic[160];
  snprintf(diagnostic, sizeof(diagnostic), "%s -> %s (%lu ms)", Config::WEATHER_API_HOST,
           resolved ? address.toString().c_str() : "FAILED", static_cast<unsigned long>(dnsElapsed));
  reportProgress(request.id, Stage::Dns, "DNS_END", diagnostic);
  if (shouldAbort(request, startedAt, result)) { return result; }
  if (!resolved) {
    snprintf(result.error, sizeof(result.error), "%s: %lu ms",
             dnsOutcome == DnsOutcome::Timeout ? "DNS_TIMEOUT" :
             dnsOutcome == DnsOutcome::Busy ? "DNS_PREVIOUS_QUERY_PENDING" : "DNS_LOOKUP_ERROR",
             static_cast<unsigned long>(dnsElapsed));
    return result;
  }

  WeatherTransport tls(allowedRequestId_, request.id, startedAt, transportTrace, this);
  HTTPClient http;
  http.setConnectTimeout(Config::HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(Config::HTTP_READ_TIMEOUT_MS);
  http.setReuse(false);
  // Phân tích URL khi socket còn đóng, tránh HTTPClient tự ngắt TLS vừa tạo.
  if (!http.begin(tls, url)) {
    snprintf(result.error, sizeof(result.error), "HTTP_INIT_ERROR");
    return result;
  }
  if (!tls.open(address, Config::WEATHER_API_HOST, WEATHER_ROOT_CA)) {
    result.retryableSocketError = tls.retryableSocketFailure();
    describeTransportError(tls, result.error, sizeof(result.error));
    reportProgress(request.id, workerStage_.load(), "CONNECT_FAILED", result.error);
    return result;
  }
  if (shouldAbort(request, startedAt, result)) { return result; }
  tls.beginHttp();
  http.setTimeout(Config::HTTP_READ_TIMEOUT_MS);
  http.addHeader("Accept", "application/json");
  reportProgress(request.id, Stage::Http, "HTTP_GET_BEGIN", "Gui GET; cho response header");
  result.httpCode = http.GET();
  snprintf(diagnostic, sizeof(diagnostic), "status=%d Content-Length=%d",
           result.httpCode, http.getSize());
  reportProgress(request.id, Stage::Http, "HTTP_RESPONSE", diagnostic);
  if (shouldAbort(request, startedAt, result)) { return result; }
  if (tls.failure() != NetworkFailure::None) {
    result.retryableSocketError = tls.retryableSocketFailure();
    describeTransportError(tls, result.error, sizeof(result.error));
    return result;
  }
  if (result.httpCode != HTTP_CODE_OK) {
    // TLS đã xác thực xong nhưng peer có thể đóng socket trước response.
    // Chỉ retry các lỗi transport âm; không ép HTTP4xx/5xx thành thành công.
    result.retryableSocketError = result.httpCode == HTTPC_ERROR_NOT_CONNECTED ||
                                  result.httpCode == HTTPC_ERROR_CONNECTION_LOST ||
                                  result.httpCode == HTTPC_ERROR_SEND_HEADER_FAILED ||
                                  result.httpCode == HTTPC_ERROR_SEND_PAYLOAD_FAILED;
    snprintf(result.error, sizeof(result.error), "%s: status=%d %s",
             result.httpCode == HTTPC_ERROR_READ_TIMEOUT ? "HTTP_TIMEOUT" : "HTTP_STATUS_ERROR",
             result.httpCode, result.httpCode < 0
                 ? HTTPClient::errorToString(result.httpCode).c_str() : "API khong tra ve 200");
    return result;
  }
  if (http.getSize() > static_cast<int>(Config::MAX_WEATHER_RESPONSE_BYTES)) {
    snprintf(result.error, sizeof(result.error), "HTTP_BODY_TOO_LARGE");
    return result;
  }
  std::unique_ptr<BoundedBody> body(new (std::nothrow) BoundedBody());
  if (!body) {
    snprintf(result.error, sizeof(result.error), "OUT_OF_MEMORY: HTTP body");
    return result;
  }
  reportProgress(request.id, Stage::Body, "HTTP_BODY_BEGIN", "Doc body co idle/deadline guard");
  const int transferred = http.writeToStream(body.get());
  snprintf(diagnostic, sizeof(diagnostic), "transferred=%d buffered=%u overflow=%s",
           transferred, static_cast<unsigned int>(body->size()), body->overflowed() ? "yes" : "no");
  reportProgress(request.id, Stage::Body, "HTTP_BODY_END", diagnostic);
  if (shouldAbort(request, startedAt, result)) { return result; }
  if (tls.failure() != NetworkFailure::None) {
    result.retryableSocketError = tls.retryableSocketFailure();
    describeTransportError(tls, result.error, sizeof(result.error));
    return result;
  }
  if (transferred <= 0 || body->overflowed()) {
    snprintf(result.error, sizeof(result.error), "%s: transferred=%d",
             body->overflowed() ? "HTTP_BODY_TOO_LARGE" : "HTTP_BODY_READ_ERROR", transferred);
    return result;
  }

  reportProgress(request.id, Stage::Json, "JSON_BEGIN", "Kiem tra du lieu va timestamp");
  const int64_t epoch = static_cast<int64_t>(time(nullptr));
  char parseError[160];
  result.success = parseWeatherJson(body->body(), body->size(), epoch, result.data,
                                    parseError, sizeof(parseError));
  reportProgress(request.id, Stage::Json, "JSON_END", result.success ? "JSON_OK" : parseError);
  if (shouldAbort(request, startedAt, result)) { result.success = false; return result; }
  if (!result.success) {
    snprintf(result.error, sizeof(result.error), "JSON_PARSE_FAILURE: %s", parseError);
  } else {
    result.data.updatedAtEpoch = epoch;
    result.data.updatedAtMs = millis();
  }
  return result;
}
