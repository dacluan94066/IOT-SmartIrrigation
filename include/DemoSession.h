#pragma once
#include <stdint.h>
#include <math.h>
#include "WeatherData.h"

// Chỉ loop() sở hữu. Demo là đầu vào thay thế, không điều khiển GPIO trực tiếp.
class DemoSession {
 public:
  bool activate(uint32_t id, float soil, float rain, uint32_t ttl, uint32_t now, int64_t epoch) {
    if (!id || !ttl || ttl > 60000 || !isfinite(soil) || !isfinite(rain) ||
        soil < 0 || soil > 100 || rain < 0 || rain > 100) return false;
    active_ = true; id_ = id; soil_ = soil; rain_ = rain;
    since_ = appliedAt_ = now; ttl_ = ttl; epoch_ = epoch;
    return true;
  }
  void stop() { if (active_) { active_ = false; ended_ = true; } }
  void update(bool backendHealthy, uint32_t now) {
    if (active_ && (!backendHealthy || now-since_ >= ttl_)) stop();
  }
  void confirmLease(uint32_t id, uint32_t remaining, uint32_t now) {
    if (!active_) return;
    const uint32_t local = this->remaining(now);
    if (id != id_ || !remaining || !local) { stop(); return; }
    ttl_ = remaining < local ? remaining : local; since_ = now;
  }
  bool takeEnded() { const bool ended = ended_; ended_ = false; return ended; }
  bool active() const { return active_; }
  uint32_t id() const { return active_ ? id_ : 0; }
  uint32_t remaining(uint32_t now) const { return active_ && now-since_ < ttl_ ? ttl_-(now-since_) : 0; }
  float soil() const { return soil_; }
  WeatherData weather() const {
    WeatherData data;
    data.simulated = true; data.maxRainProbabilityPercent = rain_;
    data.updatedAtMs = appliedAt_; data.updatedAtEpoch = epoch_;
    return data; // Không chế tạo nhiệt độ, độ ẩm không khí hoặc lượng mưa mm.
  }
 private:
  bool active_ = false, ended_ = false;
  uint32_t id_ = 0, since_ = 0, ttl_ = 0, appliedAt_ = 0;
  int64_t epoch_ = 0;
  float soil_ = 0, rain_ = 0;
};
