#include "BackendService.h"
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <esp_system.h>
#include <time.h>
#include "Config.h"

namespace {
void epochJson(JsonDocument &doc, const char *key, int64_t epoch) {
  if (epoch < Config::MIN_VALID_UNIX_TIME || epoch >= Config::MAX_VALID_UNIX_TIME) { doc[key] = nullptr; return; }
  const time_t t = static_cast<time_t>(epoch); struct tm utc;
  gmtime_r(&t, &utc); char value[32];
  strftime(value, sizeof(value), "%Y-%m-%dT%H:%M:%SZ", &utc); doc[key] = value;
}
}

bool BackendService::begin() {
  if (!BackendLocal::ENABLED || !BackendLocal::TOKEN[0]) {
    Serial.println("[Backend] DISABLED: chay npm run provision trong backend/ roi Build lai.");
    return false;
  }
  snprintf(bootId_, sizeof(bootId_), "%08lx-%08lx-%08lx",
           static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()));
  jobs_ = xQueueCreate(1, sizeof(Job)); results_ = xQueueCreate(1, sizeof(Result));
  if (!jobs_ || !results_ || xTaskCreate(workerEntry,"backend-http",BackendConfig::STACK_BYTES,this,1,&worker_) != pdPASS) {
    if (jobs_) vQueueDelete(jobs_);
    if (results_) vQueueDelete(results_);
    jobs_ = results_ = nullptr; worker_ = nullptr;
    Serial.println("[Backend] Khong du RAM cho worker; AUTO van hoat dong."); return false;
  }
  lastPublishAt_ = millis() - BackendConfig::TELEMETRY_INTERVAL_MS;
  lastPollAt_ = millis() - BackendConfig::POLL_INTERVAL_MS;
  Serial.printf("[Backend] host=%s:%u | device=%s | boot=%s | HTTP local gateway only\n",BackendLocal::HOST,BackendLocal::PORT,BackendLocal::DEVICE_ID,bootId_);
  return true;
}

bool BackendService::healthy(uint32_t now) const {
  return hasPoll_ && now-lastPollOkAt_ < BackendConfig::CONTROL_LEASE_MS;
}

void BackendService::publish(float soil, const WeatherData &w, WeatherState state,
                             const PumpController &pump, const char *mode, uint32_t now,
                             float rawSoil, const DemoSession &demo, bool demoEnded) {
  const bool changed = pump.isOn()!=lastPublishedPump_ || demo.active()!=lastPublishedDemo_;
  if (!worker_ || (!forcePublish_ && !changed && now-lastPublishAt_ < BackendConfig::TELEMETRY_INTERVAL_MS)) return;
  forcePublish_ = false; lastPublishedPump_ = pump.isOn(); lastPublishedDemo_ = demo.active();
  lastPublishAt_ = now; JsonDocument d;
  d["deviceId"] = BackendLocal::DEVICE_ID; d["bootId"] = bootId_; d["sequence"] = ++sequence_;
  d["soilMoisturePercent"] = soil;
  d["temperatureC"] = nullptr; d["rainProbabilityPercent"] = nullptr; d["precipitationMm"] = nullptr;
  if (state == WeatherState::Valid) {
    if (w.hasCurrentConditions) d["temperatureC"] = w.temperatureC;
    d["rainProbabilityPercent"] = w.maxRainProbabilityPercent;
    if (w.hasPrecipitation) d["precipitationMm"] = w.totalPrecipitationMm;
  }
  d["weatherSource"] = w.simulated || Config::DEMO_WEATHER_MODE ? "SIMULATED" : "REAL";
  d["rawSoilMoisturePercent"] = rawSoil;
  d["soilSource"] = demo.active() ? "SIMULATED" : "REAL";
  d["demoSupported"] = Config::REMOTE_DEMO_ENABLED; d["demoActive"] = demo.active();
  if (demo.active()) d["demoCommandId"] = demo.id(); else d["demoCommandId"] = nullptr;
  d["demoRemainingMs"] = demo.remaining(now);
  d["weatherStatus"] = weatherStateName(state);
  d["pumpState"] = pump.isOn() ? "BAT" : "TAT";
  d["decision"] = pump.decision() == IrrigationDecision::Watering ? "TUOI" : pump.decision() == IrrigationDecision::Postponed ? "TAM_HOAN" : "KHONG_TUOI";
  d["reason"] = demoEnded ? "DEMO_ENDED: da dung chu ky demo; tro ve du lieu that va giu cooldown" : pump.reasonText(); d["mode"] = mode; d["uptimeMs"] = now;
  epochJson(d,"deviceTimestamp",time(nullptr));
  epochJson(d,"weatherUpdatedAt",w.updatedAtEpoch);
  if (measureJson(d) >= sizeof(telemetry_)) { Serial.println("[Backend] Telemetry qua lon; bo snapshot"); return; }
  serializeJson(d, telemetry_, sizeof(telemetry_)); pendingTelemetry_ = true;
}

void BackendService::schedule(Operation op, uint32_t now) {
  Job job; job.operation = op; job.id = ++nextId_; job.session = session_; job.queuedAt = now;
  if (op == Operation::Poll) {
    snprintf(job.path,sizeof(job.path),"/api/v1/device/commands?deviceId=%s&bootId=%s",BackendLocal::DEVICE_ID,bootId_);
    lastPollAt_ = now;
  } else if (op == Operation::Ack) {
    snprintf(job.path,sizeof(job.path),"/api/v1/device/commands/%lu/ack",static_cast<unsigned long>(ackId_));
    snprintf(job.body,sizeof(job.body),"%s",ackBody_);
  } else {
    snprintf(job.path,sizeof(job.path),"/api/v1/telemetry"); snprintf(job.body,sizeof(job.body),"%s",telemetry_);
    pendingTelemetry_ = false;
  }
  allowedId_.store(job.id);
  if (xQueueSend(jobs_,&job,0) == pdTRUE) { busy_ = true; cancelled_ = false; queuedAt_ = now; }
}

void BackendService::update(bool connected, uint32_t session, uint32_t now) {
  if (!worker_) return;
  if (!connected || session != session_) { hasPoll_ = false; allowedId_.store(0); session_ = session; }
  if (busy_ && !cancelled_ && now-queuedAt_ >= BackendConfig::REQUEST_DEADLINE_MS) {
    allowedId_.store(0); cancelled_ = true; hasPoll_ = false;
    Serial.printf("[Backend ms=%lu] REQUEST_DEADLINE; cho worker cu ket thuc, khong tao task moi\n",static_cast<unsigned long>(now));
  }
  Result result;
  if (xQueueReceive(results_,&result,0) == pdTRUE) {
    busy_ = false;
    const bool current = !cancelled_ && connected && result.session == session_ &&
                         allowedId_.load() == result.id && now-result.queuedAt < BackendConfig::REQUEST_DEADLINE_MS;
    const bool success = current && result.status >= 200 && result.status < 300;
    failed_ = !success;
    if (!success) { lastFailureAt_ = now; hasPoll_ = false; }
    Serial.printf("[Backend ms=%lu] RESULT id=%lu HTTP=%d accept=%s stack_free=%u heap=%u\n",static_cast<unsigned long>(now),static_cast<unsigned long>(result.id),result.status,success?"yes":"no",static_cast<unsigned int>(uxTaskGetStackHighWaterMark(worker_)),ESP.getFreeHeap());
    if (result.operation == Operation::Ack) {
      // 409/404 = lệnh đã hết hạn/superseded, không retry ACK vô hạn.
      if (success || (current && (result.status == 409 || result.status == 404))) ackId_ = 0;
    }
    if (success && result.operation == Operation::Poll) {
      JsonDocument doc; const auto error = deserializeJson(doc,result.body);
      if (!error && doc["success"] == true && doc["data"].is<JsonObject>()) {
        hasPoll_ = true; lastPollOkAt_ = now;
        const JsonVariant lease = doc["data"]["controlLease"];
        if (lease["id"].is<uint32_t>() && lease["remainingTtlMs"].is<uint32_t>()) {
          leaseId_ = lease["id"];
          const uint32_t remaining = lease["remainingTtlMs"];
          leaseRemainingMs_ = remaining > now-result.queuedAt ? remaining-(now-result.queuedAt) : 0;
          leaseReady_ = true;
        } else { hasPoll_ = false; }
        JsonVariant c = doc["data"]["command"];
        if (!c.isNull() && c["id"].is<uint32_t>() && c["remainingTtlMs"].is<uint32_t>()) {
          const char *type = c["type"] | "";
          const uint32_t ttl = c["remainingTtlMs"].as<uint32_t>();
          // Trừ cả round-trip kể từ lúc enqueue; kết quả trễ không kéo dài lease.
          const uint32_t elapsed = now-result.queuedAt;
          const bool demoSet = !strcmp(type,"DEMO_SET"), demoStop = !strcmp(type,"DEMO_STOP");
          const bool control = !strcmp(type,"AUTO") || !strcmp(type,"MANUAL_ON") || !strcmp(type,"MANUAL_OFF");
          const bool demoValues = !demoSet || (c["soilMoisturePercent"].is<float>() && c["rainProbabilityPercent"].is<float>() &&
              isfinite(c["soilMoisturePercent"].as<float>()) && isfinite(c["rainProbabilityPercent"].as<float>()) &&
              c["soilMoisturePercent"].as<float>()>=0 && c["soilMoisturePercent"].as<float>()<=100 &&
              c["rainProbabilityPercent"].as<float>()>=0 && c["rainProbabilityPercent"].as<float>()<=100);
          if (ttl > elapsed && ttl <= BackendConfig::MAX_COMMAND_TTL_MS && (control || demoSet || demoStop) && demoValues) {
            command_.id = c["id"]; command_.remainingMs = ttl-elapsed;
            command_.mode = !strcmp(type,"MANUAL_OFF") ? PumpMode::ManualOff : !strcmp(type,"MANUAL_ON") ? PumpMode::ManualOn : PumpMode::Auto;
            command_.kind = demoSet ? BackendCommand::Kind::DemoSet : demoStop ? BackendCommand::Kind::DemoStop : BackendCommand::Kind::Control;
            if (demoSet) { command_.soilPercent=c["soilMoisturePercent"]; command_.rainPercent=c["rainProbabilityPercent"]; }
            commandReady_ = true;
          }
        }
      } else { hasPoll_ = false; Serial.println("[Backend] JSON/envelope khong hop le; khong nhan lenh"); }
    }
  }
  if (busy_ || commandReady_ || !connected || (failed_ && now-lastFailureAt_ < BackendConfig::RETRY_INTERVAL_MS)) return;
  if (ackId_) schedule(Operation::Ack,now);
  else if (now-lastPollAt_ >= BackendConfig::POLL_INTERVAL_MS) schedule(Operation::Poll,now);
  else if (pendingTelemetry_) schedule(Operation::Telemetry,now);
}

bool BackendService::takeCommand(BackendCommand &command) {
  if (!commandReady_) return false;
  command = command_; commandReady_ = false; return true;
}
bool BackendService::takeLease(uint32_t &id, uint32_t &remainingMs) {
  if (!leaseReady_) return false;
  id = leaseId_; remainingMs = leaseRemainingMs_; leaseReady_ = false; return true;
}
void BackendService::acknowledge(uint32_t id, bool executed, const char *reason) {
  forcePublish_ = true;
  JsonDocument d; d["deviceId"] = BackendLocal::DEVICE_ID; d["bootId"] = bootId_;
  d["status"] = executed ? "EXECUTED" : "REJECTED"; d["reason"] = reason;
  serializeJson(d,ackBody_,sizeof(ackBody_)); ackId_ = id;
}

void BackendService::workerEntry(void *context) {
  auto *self = static_cast<BackendService *>(context);
  for (;;) {
    Job job;
    if (xQueueReceive(self->jobs_,&job,portMAX_DELAY) != pdTRUE) continue;
    Result result; result.operation = job.operation; result.id = job.id;
    result.session = job.session; result.queuedAt = job.queuedAt;
    self->perform(job,result);
    xQueueSend(self->results_,&result,portMAX_DELAY);
  }
}

void BackendService::perform(const Job &job, Result &result) {
  const uint32_t start = millis();
  auto active = [&]() { return allowedId_.load() == job.id && millis()-job.queuedAt < BackendConfig::REQUEST_DEADLINE_MS; };
  if (!active()) return;
  IPAddress ip;
  const auto dns = dns_.resolve(BackendLocal::HOST,ip,allowedId_,job.id,start);
  Serial.printf("[Backend ms=%lu] DNS outcome=%d host=%s ip=%s elapsed=%lu\n",static_cast<unsigned long>(millis()),static_cast<int>(dns),BackendLocal::HOST,ip.toString().c_str(),static_cast<unsigned long>(millis()-start));
  if (dns != DnsOutcome::Success || !active()) return;
  WiFiClient client; client.setTimeout(2);
  const uint32_t tcpAt = millis();
  const bool tcp = client.connect(ip,BackendLocal::PORT,BackendConfig::CONNECT_TIMEOUT_MS);
  Serial.printf("[Backend ms=%lu] TCP %s %s:%u elapsed=%lu\n",static_cast<unsigned long>(millis()),tcp?"OK":"FAIL",ip.toString().c_str(),BackendLocal::PORT,static_cast<unsigned long>(millis()-tcpAt));
  if (!tcp || !active()) { client.stop(); return; }
  HTTPClient http;
  // IP đã resolve + socket đã connect: HTTPClient tái sử dụng socket, không DNS/TCP thứ hai.
  const String url = String("http://")+ip.toString()+":"+BackendLocal::PORT+job.path;
  if (!http.begin(client,url)) { client.stop(); return; }
  http.setConnectTimeout(BackendConfig::CONNECT_TIMEOUT_MS); http.setTimeout(BackendConfig::READ_TIMEOUT_MS);
  http.setReuse(false); http.useHTTP10(true);
  http.addHeader("Authorization",String("Bearer ")+BackendLocal::TOKEN);
  http.addHeader("Content-Type","application/json");
  result.status = job.operation == Operation::Poll ? http.GET() : http.POST(reinterpret_cast<uint8_t *>(const_cast<char *>(job.body)),strlen(job.body));
  Serial.printf("[Backend ms=%lu] HTTP=%d path=%s elapsed=%lu\n",static_cast<unsigned long>(millis()),result.status,job.path,static_cast<unsigned long>(millis()-start));
  // Server local trả Content-Length; từ chối response không giới hạn/chunked.
  const int length = http.getSize();
  if (result.status > 0 && length >= 0 && length <= static_cast<int>(BackendConfig::MAX_BODY_BYTES) && active()) {
    auto *stream = http.getStreamPtr(); size_t used = 0; uint32_t lastByte = millis();
    while (used < static_cast<size_t>(length) && active() && millis()-lastByte < BackendConfig::READ_TIMEOUT_MS) {
      const int available = stream->available();
      if (available > 0) {
        const int n = stream->read(reinterpret_cast<uint8_t *>(result.body)+used, min(static_cast<size_t>(available),static_cast<size_t>(length)-used));
        if (n > 0) { used += n; lastByte = millis(); }
      } else if (!stream->connected()) break;
      else vTaskDelay(1);
    }
    result.body[used] = '\0';
    if (used != static_cast<size_t>(length)) result.status = -1;
  } else { result.status = -1; }
  http.end(); client.stop();
}
