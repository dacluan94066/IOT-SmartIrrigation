#pragma once
#include <stdint.h>
#include "PumpController.h"

enum class CommandAcceptance { Accepted, Duplicate, Expired, OffPriority };

// Chỉ loop() truy cập object này. Lease dùng millis(), không phụ thuộc timezone/NTP.
class RemoteControl {
 public:
  void update(bool backendHealthy, uint32_t now) {
    if (!backendHealthy || (mode_ != PumpMode::Auto && now - since_ >= ttl_)) mode_ = PumpMode::Auto;
  }
  CommandAcceptance receive(uint32_t id, PumpMode mode, uint32_t remainingMs, uint32_t now) {
    if (id <= lastId_) return CommandAcceptance::Duplicate;
    lastId_ = id;
    if (!remainingMs || remainingMs > 60000) return CommandAcceptance::Expired;
    if (mode_ == PumpMode::ManualOff && mode != PumpMode::ManualOff) return CommandAcceptance::OffPriority;
    mode_ = mode; since_ = now; ttl_ = remainingMs;
    return CommandAcceptance::Accepted;
  }
  void finishManualOn() { if (mode_ == PumpMode::ManualOn) mode_ = PumpMode::Auto; }
  void confirmLease(uint32_t id, uint32_t remainingMs, uint32_t now) {
    if (mode_ == PumpMode::Auto) return;
    if (id != lastId_ || !remainingMs || now-since_ >= ttl_) { mode_ = PumpMode::Auto; return; }
    const uint32_t localRemaining = ttl_-(now-since_);
    ttl_ = remainingMs < localRemaining ? remainingMs : localRemaining;
    since_ = now;  // Chỉ rút ngắn hạn, không gia hạn từ response cũ.
  }
  PumpMode mode() const { return mode_; }
  const char *modeName() const {
    return mode_ == PumpMode::ManualOn ? "MANUAL_ON" : mode_ == PumpMode::ManualOff ? "MANUAL_OFF" : "AUTO";
  }
 private:
  PumpMode mode_ = PumpMode::Auto;
  uint32_t lastId_ = 0, since_ = 0, ttl_ = 0;
};
