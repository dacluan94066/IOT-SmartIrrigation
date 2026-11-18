#pragma once

#include <stdint.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>

class WiFiService {
 public:
  void begin(uint32_t nowMs);
  void update(uint32_t nowMs);
  bool connected() const;
  uint32_t session() const { return session_; }

 private:
  struct DnsRequest {
    uint32_t session = 0;
    uint32_t attempt = 0;
    uint8_t serverIndex = 0;
  };
  struct DnsResult {
    DnsRequest request;
    bool resolved = false;
    uint32_t elapsedMs = 0;
    char ip[40] = {};
  };
  void startAttempt(uint32_t nowMs);
  void startNtpAttempt(uint32_t nowMs, const char *reason);
  void updateNtp(uint32_t nowMs);
  void printTimeDiagnostics(uint32_t nowMs);
  static void dnsTaskEntry(void *context);
  QueueHandle_t dnsRequests_ = nullptr;
  QueueHandle_t dnsResults_ = nullptr;
  TaskHandle_t dnsTask_ = nullptr;
  bool dnsBusy_ = false;
  bool ntpAttemptStarted_ = false;
  bool ntpTimeoutReported_ = false;
  bool wasTimeReady_ = false;
  uint8_t sntpStatus_ = 0;
  bool sntpCompletedSeen_ = false;
  uint32_t observedNotifications_ = 0;
  const char *dnsStatus_ = "NOT_REQUESTED";
  uint32_t dnsAttempt_ = 0;
  uint32_t ntpAttempt_ = 0;
  uint32_t ntpStartedAtMs_ = 0;
  uint32_t lastNtpDiagnosticAtMs_ = 0;
  bool connecting_ = false;
  bool wasConnected_ = false;
  uint32_t attemptStartedAtMs_ = 0;
  uint32_t lastDisconnectedAtMs_ = 0;
  uint32_t session_ = 0;
};
