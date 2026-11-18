#pragma once

#include "WeatherData.h"

enum class IrrigationDecision { Watering, NotWatering, Postponed };
enum class PumpMode { Auto, ManualOn, ManualOff };
enum class PumpReason {
  Startup, SoilDry, SoilWet, SoilSufficient, WeatherUnavailable,
  RainExpected, RuntimeLimit, Cooldown, ManualOn, ManualOff
};

// Chỉ tính trạng thái; thao tác GPIO nằm ở main.cpp.
class PumpController {
 public:
  void update(float soilPercent, bool wifiConnected, WeatherState weatherState,
              float rainProbabilityPercent, uint32_t nowMs, PumpMode mode = PumpMode::Auto);
  bool isOn() const { return on_; }
  IrrigationDecision decision() const { return decision_; }
  PumpReason reason() const { return reason_; }
  const char *decisionText() const;
  const char *reasonText() const;

 private:
  void stop(uint32_t nowMs);
  bool on_ = false;
  bool hasCompletedCycle_ = false;
  uint32_t startedAtMs_ = 0;
  uint32_t stoppedAtMs_ = 0;
  IrrigationDecision decision_ = IrrigationDecision::NotWatering;
  PumpReason reason_ = PumpReason::Startup;
};
