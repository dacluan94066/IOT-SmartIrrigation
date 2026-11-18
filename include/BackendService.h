#pragma once
#include <Arduino.h>
#include <atomic>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include "BackendConfig.h"
#include "PumpController.h"
#include "WeatherDnsResolver.h"
#include "DemoSession.h"

struct BackendCommand {
  enum class Kind { Control, DemoSet, DemoStop };
  uint32_t id = 0, remainingMs = 0;
  PumpMode mode = PumpMode::Auto;
  Kind kind = Kind::Control;
  float soilPercent = 0, rainPercent = 0;
};

// Một worker HTTP độc lập. Không gọi DNS/TCP/HTTP từ loop điều khiển.
class BackendService {
 public:
  bool begin();
  void update(bool wifiConnected, uint32_t session, uint32_t now);
  void publish(float soil, const WeatherData &weather, WeatherState state,
               const PumpController &pump, const char *mode, uint32_t now,
               float rawSoil, const DemoSession &demo, bool demoEnded = false);
  bool takeCommand(BackendCommand &command);
  bool takeLease(uint32_t &id, uint32_t &remainingMs);
  void acknowledge(uint32_t id, bool executed, const char *reason);
  bool healthy(uint32_t now) const;
 private:
  enum class Operation { Telemetry, Poll, Ack };
  struct Job {
    Operation operation = Operation::Poll;
    uint32_t id = 0, session = 0, queuedAt = 0;
    char path[192] = {}, body[2048] = {};
  };
  struct Result {
    Operation operation = Operation::Poll;
    uint32_t id = 0, session = 0, queuedAt = 0;
    int status = 0;
    char body[BackendConfig::MAX_BODY_BYTES + 1] = {};
  };
  static void workerEntry(void *context);
  void perform(const Job &job, Result &result);
  void schedule(Operation operation, uint32_t now);
  QueueHandle_t jobs_ = nullptr, results_ = nullptr;
  TaskHandle_t worker_ = nullptr;
  WeatherDnsResolver dns_;
  std::atomic<uint32_t> allowedId_{0};
  uint32_t nextId_ = 0, sequence_ = 0, session_ = 0, queuedAt_ = 0;
  uint32_t lastPollAt_ = 0, lastPollOkAt_ = 0, lastPublishAt_ = 0, lastFailureAt_ = 0;
  uint32_t ackId_ = 0;
  bool busy_ = false, cancelled_ = false, failed_ = false, hasPoll_ = false;
  bool pendingTelemetry_ = false, commandReady_ = false;
  bool forcePublish_ = true, lastPublishedPump_ = false, lastPublishedDemo_ = false;
  BackendCommand command_;
  bool leaseReady_ = false;
  uint32_t leaseId_ = 0, leaseRemainingMs_ = 0;
  char bootId_[40] = {}, telemetry_[2048] = {}, ackBody_[512] = {};
};
