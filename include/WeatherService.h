#pragma once

#include <atomic>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include "WeatherData.h"
#include "WeatherRequestLifecycle.h"
#include "WeatherDnsResolver.h"
#include "WeatherIoPolicy.h"

class WeatherService {
 public:
  bool begin();
  void update(bool wifiConnected, uint32_t wifiSession, uint32_t nowMs);
  WeatherState state(uint32_t nowMs) const;
  const WeatherData &data() const { return data_; }
  const char *lastError() const { return lastError_; }
  bool recoveryRequired() const { return recoveryRequired_; }
  void selectDemoRain(uint8_t probabilityPercent);
  void simulateUnavailable();

 private:
  enum class Stage : uint32_t { Queued, Worker, Dns, Tcp, Tls, Http, Body, Json, Done };
  struct Request {
    uint32_t id = 0, wifiSession = 0, queuedAtMs = 0;
  };
  struct Result {
    Request request;
    uint32_t startedAtMs = 0, finishedAtMs = 0;
    uint32_t stackFreeBytes = 0, freeHeapBytes = 0;
    bool success = false;
    bool retryableSocketError = false;
    int httpCode = 0;
    WeatherData data;
    char error[192] = {};
  };
  struct Progress {
    uint32_t requestId = 0, atMs = 0, workerElapsedMs = 0, stepElapsedMs = 0;
    uint32_t stackFreeBytes = 0, freeHeapBytes = 0;
    char event[24] = {}, message[160] = {};
  };
  static void taskEntry(void *context);
  static void transportTrace(void *context, const char *event, const char *message);
  static const char *stageName(Stage stage);
  Result fetch(const Request &request, uint32_t startedAt);
  bool shouldAbort(const Request &request, uint32_t startedAt, Result &result);
  void reportProgress(uint32_t requestId, Stage stage, const char *event, const char *message);
  void cancelActive(const char *reason, uint32_t nowMs);
  void invalidate(const char *reason);
  void updateDemo(uint32_t nowMs);

  QueueHandle_t requests_ = nullptr, results_ = nullptr, progress_ = nullptr;
  TaskHandle_t task_ = nullptr;
  // loop không gọi stop()/vTaskDelete() trên tài nguyên đang thuộc worker.
  std::atomic<uint32_t> allowedRequestId_{0}, workerStartedId_{0}, workerStartedAtMs_{0};
  std::atomic<uint32_t> workerLastTraceAtMs_{0}, workerStackFreeBytes_{0}, workerFreeHeapBytes_{0};
  std::atomic<uint32_t> droppedProgress_{0};
  std::atomic<Stage> workerStage_{Stage::Queued};
  WeatherRequestLifecycle lifecycle_;
  WeatherRetryPolicy retryPolicy_;
  WeatherDnsResolver dns_;
  WeatherData data_;
  bool valid_ = false, hasSample_ = false, attempted_ = false;
  bool lastAttemptSucceeded_ = false, retryImmediately_ = true, recoveryRequired_ = false;
  uint32_t nextRequestId_ = 0, lastWifiSession_ = 0, lastFinishedAtMs_ = 0;
  uint32_t lastHeartbeatAtMs_ = 0;
  uint8_t demoRainProbability_ = 20;
  bool demoUnavailable_ = false, demoRefreshRequested_ = true;
  char lastError_[192] = "Chua cap nhat thoi tiet thanh cong";
};
