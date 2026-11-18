#include "WiFiService.h"

#include <Arduino.h>
#include <WiFi.h>
#include <atomic>
#include <stdio.h>
#include <time.h>
#include <esp_sntp.h>
#include <esp_system.h>
#include "Config.h"
#include "TimeSync.h"

namespace {
std::atomic<uint32_t> ntpNotifications{0};
std::atomic<uint32_t> lastNtpCallbackAtMs{0};
std::atomic<TimeSync::State> timeState{TimeSync::State::NotStarted};

const char *sntpStatusName(uint8_t status) {
  switch (status) {
    case SNTP_SYNC_STATUS_RESET: return "RESET";
    case SNTP_SYNC_STATUS_COMPLETED: return "COMPLETED";
    case SNTP_SYNC_STATUS_IN_PROGRESS: return "IN_PROGRESS";
    default: return "UNKNOWN";
  }
}

void onTimeSynchronized(struct timeval *) {
  // Callback chạy trong task lwIP: không Serial, không GPIO hoặc chờ ở đây.
  lastNtpCallbackAtMs.store(millis(), std::memory_order_relaxed);
  ntpNotifications.fetch_add(1, std::memory_order_release);
}
}  // namespace

uint32_t TimeSync::notifications() {
  return ntpNotifications.load(std::memory_order_acquire);
}

bool TimeSync::ready() {
  return isReady(static_cast<int64_t>(time(nullptr)), notifications() > 0);
}

const char *TimeSync::pendingReason() {
  return message(timeState.load(std::memory_order_acquire));
}

void WiFiService::begin(uint32_t nowMs) {
  esp_sntp_set_time_sync_notification_cb(onTimeSynchronized);
  Serial.printf("[NTP ms=%lu] BOOT | reset_reason=%d | callback=registered | callbacks=%lu | epoch=%lld\n",
                static_cast<unsigned long>(nowMs), static_cast<int>(esp_reset_reason()),
                static_cast<unsigned long>(TimeSync::notifications()),
                static_cast<long long>(time(nullptr)));
  // hostByName() của Arduino core có thể chờ DNS 15 giây (và đợi khóa DNS).
  // Vì vậy chẩn đoán DNS cũng phải chạy task riêng, tuyệt đối không ở loop().
  dnsRequests_ = xQueueCreate(1, sizeof(DnsRequest));
  dnsResults_ = xQueueCreate(1, sizeof(DnsResult));
  if (!dnsRequests_ || !dnsResults_ ||
      xTaskCreate(dnsTaskEntry, "ntp-dns", 4096, this, 1, &dnsTask_) != pdPASS) {
    if (dnsRequests_) { vQueueDelete(dnsRequests_); dnsRequests_ = nullptr; }
    if (dnsResults_) { vQueueDelete(dnsResults_); dnsResults_ = nullptr; }
    Serial.println("[DNS/NTP] Khong tao duoc task chan doan; SNTP van se thu ket noi.");
  }
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);  // Tự quản lý retry để có timeout rõ ràng.
  startAttempt(nowMs);
}

bool WiFiService::connected() const {
  return WiFi.status() == WL_CONNECTED;
}

void WiFiService::startAttempt(uint32_t nowMs) {
  connecting_ = true;
  attemptStartedAtMs_ = nowMs;
  Serial.printf("[WiFi] DISCONNECTED - Dang ket noi %s, channel %d...\n",
                Config::WIFI_SSID, Config::WIFI_CHANNEL);
  WiFi.begin(Config::WIFI_SSID, Config::WIFI_PASSWORD, Config::WIFI_CHANNEL);
}

void WiFiService::update(uint32_t nowMs) {
  if (connected()) {
    connecting_ = false;
    if (!wasConnected_) {
      wasConnected_ = true;
      ++session_;
      Serial.printf("[WiFi] CONNECTED - IP: %s\n", WiFi.localIP().toString().c_str());
      Serial.printf("[WiFi] Gateway: %s | DNS0: %s | DNS1: %s\n",
                    WiFi.gatewayIP().toString().c_str(),
                    WiFi.dnsIP(0).toString().c_str(), WiFi.dnsIP(1).toString().c_str());
      // Reconnect không cần restart SNTP nếu lần boot này đã đồng bộ thành công.
      if (!TimeSync::ready()) { startNtpAttempt(nowMs, "WIFI_CONNECTED"); }
    }
    updateNtp(nowMs);
    return;
  }

  if (wasConnected_) {
    wasConnected_ = false;
    lastDisconnectedAtMs_ = nowMs;
    Serial.println("[WiFi] DISCONNECTED - Bom se dung; cho ket noi lai.");
  }
  if (connecting_) {
    if (nowMs - attemptStartedAtMs_ >= Config::WIFI_CONNECT_TIMEOUT_MS) {
      WiFi.disconnect();
      connecting_ = false;
      lastDisconnectedAtMs_ = nowMs;
      Serial.println("[WiFi] Timeout 10 giay; se thu lai sau 5 giay.");
    }
  } else if (nowMs - lastDisconnectedAtMs_ >= Config::WIFI_RETRY_INTERVAL_MS) {
    startAttempt(nowMs);
  }
}

void WiFiService::startNtpAttempt(uint32_t nowMs, const char *reason) {
  // Callback có thể vừa đến sau khi loop kiểm tra timeout. Không restart lúc đó.
  if (TimeSync::ready()) { return; }
  const uint8_t first = ntpAttempt_ % Config::NTP_SERVER_COUNT;
  ++ntpAttempt_;
  ntpAttemptStarted_ = true;
  ntpTimeoutReported_ = false;
  ntpStartedAtMs_ = nowMs;
  lastNtpDiagnosticAtMs_ = nowMs - Config::NTP_DIAGNOSTIC_INTERVAL_MS;
  sntpCompletedSeen_ = false;

  // configTime() khởi động lại SNTP nền; không phải lệnh chờ đồng bộ.
  // Đổi server đầu mỗi lần để một server/DNS lỗi không chiếm mọi lần thử.
  // Đăng ký trước khi start, không xóa bằng chứng callback khi retry/reconnect.
  esp_sntp_set_time_sync_notification_cb(onTimeSynchronized);
  configTime(Config::LOCAL_UTC_OFFSET_SECONDS, 0,
             Config::NTP_SERVERS[first],
             Config::NTP_SERVERS[(first + 1) % Config::NTP_SERVER_COUNT],
             Config::NTP_SERVERS[(first + 2) % Config::NTP_SERVER_COUNT]);
  esp_sntp_set_sync_interval(Config::NTP_SYNC_INTERVAL_MS);
  timeState.store(TimeSync::classify(static_cast<int64_t>(time(nullptr)),
                                    TimeSync::notifications() > 0, true, 0),
                  std::memory_order_release);
  Serial.printf("[NTP ms=%lu] attempt=%lu | reason=%s | primary=%s | UDP/123 | timeout=%lu ms | retry=%lu ms\n",
                static_cast<unsigned long>(nowMs), static_cast<unsigned long>(ntpAttempt_),
                reason, Config::NTP_SERVERS[first],
                static_cast<unsigned long>(Config::NTP_RESPONSE_TIMEOUT_MS),
                static_cast<unsigned long>(Config::NTP_RETRY_INTERVAL_MS));

  if (dnsRequests_ && !dnsBusy_) {
    DnsRequest request;
    request.session = session_;
    request.attempt = ntpAttempt_;
    request.serverIndex = first;
    dnsBusy_ = xQueueSend(dnsRequests_, &request, 0) == pdTRUE;
    if (dnsBusy_) {
      dnsAttempt_ = ntpAttempt_;
      dnsStatus_ = "PENDING";
      Serial.printf("[DNS/NTP ms=%lu] attempt=%lu | lookup=%s | background=yes\n",
                    static_cast<unsigned long>(nowMs), static_cast<unsigned long>(ntpAttempt_),
                    Config::NTP_SERVERS[first]);
    }
  }
}

void WiFiService::updateNtp(uint32_t nowMs) {
  if (dnsResults_) {
    DnsResult result;
    if (xQueueReceive(dnsResults_, &result, 0) == pdTRUE) {
      dnsBusy_ = false;
      dnsStatus_ = result.request.session == session_ ? (result.resolved ? "OK" : "FAILED") : "OLD_SESSION";
      if (result.request.session == session_) {
        Serial.printf("[DNS/NTP ms=%lu] attempt=%lu | %s -> %s | %lu ms\n",
                      static_cast<unsigned long>(nowMs),
                      static_cast<unsigned long>(result.request.attempt),
                      Config::NTP_SERVERS[result.request.serverIndex],
                      result.resolved ? result.ip : "FAILED (chua the ket luan loi UDP)",
                      static_cast<unsigned long>(result.elapsedMs));
      }
    }
  }

  // get_sync_status() tiêu thụ COMPLETED rồi trả RESET ở lần đọc sau.
  // Chỉ đọc tại đây; RESET không phủ nhận callback đã nhận trước đó.
  const uint8_t previousStatus = sntpStatus_;
  sntpStatus_ = static_cast<uint8_t>(esp_sntp_get_sync_status());
  if (sntpStatus_ == SNTP_SYNC_STATUS_COMPLETED) { sntpCompletedSeen_ = true; }
  const uint32_t callbacks = TimeSync::notifications();
  const TimeSync::State state = TimeSync::classify(static_cast<int64_t>(time(nullptr)), callbacks > 0,
                                                  ntpAttemptStarted_, nowMs - ntpStartedAtMs_);
  const bool stateChanged = timeState.exchange(state, std::memory_order_acq_rel) != state;
  const bool callbackChanged = callbacks != observedNotifications_;
  if (callbackChanged) {
    observedNotifications_ = callbacks;
    Serial.printf("[NTP ms=%lu] CALLBACK_OBSERVED | attempt=%lu | callbacks=%lu | callback_ms=%lu\n",
                  static_cast<unsigned long>(nowMs), static_cast<unsigned long>(ntpAttempt_),
                  static_cast<unsigned long>(callbacks),
                  static_cast<unsigned long>(lastNtpCallbackAtMs.load()));
  }
  const bool ready = TimeSync::ready();
  if (ready != wasTimeReady_) {
    wasTimeReady_ = ready;
    Serial.println(ready ? "[NTP] SYNCED - da nhan callback SNTP, cho phep xac thuc HTTPS."
                         : "[NTP] INVALID - khoa HTTPS va du lieu weather.");
    printTimeDiagnostics(nowMs);
  }
  if (!ready && ntpAttemptStarted_) {
    if (!ntpTimeoutReported_ &&
        nowMs - ntpStartedAtMs_ >= Config::NTP_RESPONSE_TIMEOUT_MS) {
      ntpTimeoutReported_ = true;
      Serial.printf("[NTP ms=%lu] attempt=%lu | TIMEOUT | %s\n",
                    static_cast<unsigned long>(nowMs), static_cast<unsigned long>(ntpAttempt_),
                    TimeSync::pendingReason());
      Serial.println("[NTP] Neu DNS OK nhung khong SYNCED: kiem tra UDP/123 va gateway/PCAP, khong bo TLS.");
    }
    if (nowMs - ntpStartedAtMs_ >= Config::NTP_RETRY_INTERVAL_MS) {
      printTimeDiagnostics(nowMs);  // Giữ lại bằng chứng trước khi restart SNTP.
      startNtpAttempt(nowMs, !esp_sntp_enabled() ? "SNTP_DISABLED"
                               : callbacks == 0 ? "NO_CALLBACK_AFTER_RETRY_INTERVAL"
                                                : "CALLBACK_BUT_INVALID_EPOCH");
      return;  // Loop sau đọc trạng thái SNTP mới, không gán snapshot cũ cho attempt mới.
    }
  }
  if (stateChanged || callbackChanged || previousStatus != sntpStatus_ ||
      nowMs - lastNtpDiagnosticAtMs_ >= Config::NTP_DIAGNOSTIC_INTERVAL_MS) {
    printTimeDiagnostics(nowMs);
  }
}

void WiFiService::printTimeDiagnostics(uint32_t nowMs) {
  lastNtpDiagnosticAtMs_ = nowMs;
  const time_t epoch = time(nullptr);
  struct tm utcTime;
  struct tm localTime;
  char utcText[32] = "N/A";
  char localText[32] = "N/A";
  if (gmtime_r(&epoch, &utcTime)) {
    strftime(utcText, sizeof(utcText), "%Y-%m-%d %H:%M:%S", &utcTime);
  }
  if (localtime_r(&epoch, &localTime)) {
    strftime(localText, sizeof(localText), "%Y-%m-%d %H:%M:%S", &localTime);
  }
  Serial.printf("[TIME ms=%lu] %s | epoch=%lld | UTC=%s | UTC+7=%s | %s\n",
                static_cast<unsigned long>(nowMs),
                TimeSync::ready() ? "VALID" : "WAITING/INVALID",
                static_cast<long long>(epoch), utcText, localText, TimeSync::pendingReason());
  Serial.printf("[NTP ms=%lu] enabled=%s | callbacks=%lu | attempt=%lu | elapsed=%lu ms"
                " | status=%s | completed_seen=%s | mode=%s | DNS=%s dns_attempt=%lu task=%s\n",
                static_cast<unsigned long>(nowMs),
                esp_sntp_enabled() ? "yes" : "no",
                static_cast<unsigned long>(TimeSync::notifications()),
                static_cast<unsigned long>(ntpAttempt_),
                static_cast<unsigned long>(nowMs - ntpStartedAtMs_),
                sntpStatusName(sntpStatus_), sntpCompletedSeen_ ? "yes" : "no",
                esp_sntp_get_sync_mode() == SNTP_SYNC_MODE_IMMED ? "IMMED" : "SMOOTH",
                dnsStatus_, static_cast<unsigned long>(dnsAttempt_),
                dnsBusy_ ? "BUSY" : "IDLE");
}

void WiFiService::dnsTaskEntry(void *context) {
  WiFiService *service = static_cast<WiFiService *>(context);
  DnsRequest request;
  for (;;) {
    if (xQueueReceive(service->dnsRequests_, &request, portMAX_DELAY) == pdTRUE) {
      DnsResult result;
      result.request = request;
      const uint32_t startedAt = millis();
      IPAddress ip;
      result.resolved = WiFi.hostByName(Config::NTP_SERVERS[request.serverIndex], ip) == 1;
      result.elapsedMs = millis() - startedAt;
      if (result.resolved) { snprintf(result.ip, sizeof(result.ip), "%s", ip.toString().c_str()); }
      xQueueOverwrite(service->dnsResults_, &result);
    }
  }
}
