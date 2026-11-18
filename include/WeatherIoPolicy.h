#pragma once

#include <stdint.h>
#include "Config.h"

enum class NetworkFailure {
  None, Cancelled, WorkerDeadline, TcpTimeout, TcpError,
  TlsTimeout, TlsError, HttpTimeout, TlsIoError, NoMemory
};

// Retry nhanh CHỈ cho lỗi I/O socket TLS; không áp dụng lỗi CA/thời gian/JSON.
// Sau hai lần liên tiếp, trở lại lịch 60s cũ, không tạo worker mới song song.
class WeatherRetryPolicy {
 public:
  void completed(bool success, bool transientSocketError) {
    if (success || !transientSocketError) { socketFailures_ = 0; }
    else if (socketFailures_ < 3) { ++socketFailures_; }
  }
  uint32_t interval(bool success) const {
    if (success) { return Config::WEATHER_UPDATE_INTERVAL_MS; }
    if (socketFailures_ == 1) { return 5000; }
    if (socketFailures_ == 2) { return 15000; }
    return Config::WEATHER_RETRY_INTERVAL_MS;
  }
 private:
  uint8_t socketFailures_ = 0;
};

// Chính sách thực dùng bởi transport; độc lập socket để thử stalled/trickle I/O.
class WeatherIoPolicy {
 public:
  WeatherIoPolicy(uint32_t id, uint32_t start) : id_(id), startedAt_(start) {}
  void beginHttp(uint32_t now) { http_ = true; lastActivityAt_ = now; }
  void activity(uint32_t now) { lastActivityAt_ = now; }
  void setIdleTimeout(uint32_t interval) { idleTimeoutMs_ = interval; }
  NetworkFailure check(uint32_t now, uint32_t allowedId) const {
    if (now - startedAt_ >= Config::WEATHER_REQUEST_DEADLINE_MS) {
      return NetworkFailure::WorkerDeadline;
    }
    if (allowedId != id_) { return NetworkFailure::Cancelled; }
    if (http_ && now - lastActivityAt_ >= idleTimeoutMs_) {
      return NetworkFailure::HttpTimeout;
    }
    return NetworkFailure::None;
  }
 private:
  uint32_t id_, startedAt_, lastActivityAt_ = 0;
  uint32_t idleTimeoutMs_ = Config::HTTP_READ_TIMEOUT_MS;
  bool http_ = false;
};
