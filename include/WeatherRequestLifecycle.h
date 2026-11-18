#pragma once

#include <stdint.h>
#include "Config.h"

enum class RequestDeadline { None, Queue, Worker };

// Chỉ loop() sửa trạng thái này. Worker trao đổi qua queue và atomic riêng.
class WeatherRequestLifecycle {
 public:
  bool begin(uint32_t id, uint32_t session, uint32_t now) {
    if (busy_ || id == 0) { return false; }
    busy_ = true;
    started_ = cancelled_ = false;
    id_ = id;
    session_ = session;
    queuedAt_ = now;
    return true;
  }
  void started(uint32_t id, uint32_t now) {
    if (busy_ && id == id_ && !started_) { started_ = true; startedAt_ = now; }
  }
  RequestDeadline deadline(uint32_t now) const {
    if (!busy_) { return RequestDeadline::None; }
    // Kể cả worker bắt đầu muộn, queue budget vẫn không được bỏ qua.
    if ((!started_ && now - queuedAt_ >= Config::WEATHER_QUEUE_TIMEOUT_MS) ||
        (started_ && startedAt_ - queuedAt_ >= Config::WEATHER_QUEUE_TIMEOUT_MS)) {
      return RequestDeadline::Queue;
    }
    if (started_ && now - startedAt_ >= Config::WEATHER_REQUEST_DEADLINE_MS) {
      return RequestDeadline::Worker;
    }
    return RequestDeadline::None;
  }
  void cancel(uint32_t now) {
    if (busy_ && !cancelled_) { cancelled_ = true; cancelledAt_ = now; }
  }
  bool accepts(uint32_t id, uint32_t session, uint32_t now) const {
    return busy_ && started_ && !cancelled_ && id == id_ && session == session_ &&
           deadline(now) == RequestDeadline::None;
  }
  bool finish(uint32_t id) {
    if (!busy_ || id != id_) { return false; }
    busy_ = false;
    return true;
  }
  bool needsRecovery(uint32_t now) const {
    return busy_ && cancelled_ &&
           now - cancelledAt_ >= Config::WEATHER_RECOVERY_GRACE_MS;
  }
  bool busy() const { return busy_; }
  bool cancelled() const { return cancelled_; }
  bool hasStarted() const { return started_; }
  uint32_t id() const { return id_; }
  uint32_t session() const { return session_; }
  uint32_t queuedAt() const { return queuedAt_; }
  uint32_t startedAt() const { return startedAt_; }

 private:
  bool busy_ = false;
  bool started_ = false;
  bool cancelled_ = false;
  uint32_t id_ = 0, session_ = 0, queuedAt_ = 0, startedAt_ = 0, cancelledAt_ = 0;
};
