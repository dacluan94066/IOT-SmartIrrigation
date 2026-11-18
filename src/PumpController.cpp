#include "PumpController.h"

#include <math.h>
#include "Config.h"

void PumpController::stop(uint32_t nowMs) {
  if (on_) {
    on_ = false;
    hasCompletedCycle_ = true;
    stoppedAtMs_ = nowMs;
  }
}

void PumpController::update(float soilPercent, bool wifiConnected,
                            WeatherState weatherState, float rainPercent,
                            uint32_t nowMs, PumpMode mode) {
  // OFF ưu tiên mọi chế độ; vẫn ghi nhận chu kỳ để giữ cooldown.
  if (mode == PumpMode::ManualOff) {
    stop(nowMs);
    decision_ = IrrigationDecision::NotWatering;
    reason_ = PumpReason::ManualOff;
    return;
  }
  // Đủ ẩm luôn dừng, không phụ thuộc kết quả tác vụ mạng.
  if (soilPercent >= Config::SOIL_HIGH_THRESHOLD) {
    stop(nowMs);
    decision_ = IrrigationDecision::NotWatering;
    reason_ = PumpReason::SoilWet;
    return;
  }

  if (!wifiConnected || weatherState != WeatherState::Valid ||
      !isfinite(rainPercent) || rainPercent < 0 || rainPercent > 100 ||
      !isfinite(soilPercent) || soilPercent < 0) {
    stop(nowMs);
    decision_ = IrrigationDecision::Postponed;
    reason_ = PumpReason::WeatherUnavailable;
    return;
  }

  if (rainPercent >= Config::RAIN_PROBABILITY_THRESHOLD) {
    stop(nowMs);
    decision_ = IrrigationDecision::Postponed;
    reason_ = PumpReason::RainExpected;
    return;
  }

  if (on_) {
    if (nowMs - startedAtMs_ >= Config::MAX_PUMP_RUNTIME_MS) {
      stop(nowMs);
      decision_ = IrrigationDecision::NotWatering;
      reason_ = PumpReason::RuntimeLimit;
    } else {
      // Trong vùng 40%-69.9%, giữ bơm đang chạy theo hysteresis.
      decision_ = IrrigationDecision::Watering;
      reason_ = mode == PumpMode::ManualOn ? PumpReason::ManualOn : PumpReason::SoilDry;
    }
    return;
  }

  decision_ = IrrigationDecision::NotWatering;
  if (mode != PumpMode::ManualOn && soilPercent >= Config::SOIL_LOW_THRESHOLD) {
    reason_ = PumpReason::SoilSufficient;
  } else if (hasCompletedCycle_ &&
             nowMs - stoppedAtMs_ < Config::PUMP_COOLDOWN_MS) {
    reason_ = PumpReason::Cooldown;
  } else {
    on_ = true;
    startedAtMs_ = nowMs;
    decision_ = IrrigationDecision::Watering;
    reason_ = mode == PumpMode::ManualOn ? PumpReason::ManualOn : PumpReason::SoilDry;
  }
}

const char *PumpController::decisionText() const {
  switch (decision_) {
    case IrrigationDecision::Watering: return "TUOI";
    case IrrigationDecision::Postponed: return "TAM HOAN";
    default: return "KHONG TUOI";
  }
}

const char *PumpController::reasonText() const {
  switch (reason_) {
    case PumpReason::ManualOn: return "MANUAL_ON; van giu bao ve thoi tiet, 70%, 10 giay va cooldown";
    case PumpReason::ManualOff: return "MANUAL_OFF - uu tien tat bom";
    case PumpReason::SoilDry: return "Dat kho; tiep tuc chu ky den 70% hoac gioi han an toan";
    case PumpReason::SoilWet: return "Do am dat da dat nguong 70%";
    case PumpReason::SoilSufficient: return "Do am tu 40% den duoi 70%; khong bat chu ky moi";
    case PumpReason::WeatherUnavailable: return "KHONG CO DU LIEU THOI TIET - TAM DUNG TUOI";
    case PumpReason::RainExpected: return "TAM HOAN TUOI - DU BAO SAP MUA";
    case PumpReason::RuntimeLimit: return "Dat gioi han chay bom 10 giay";
    case PumpReason::Cooldown: return "Dang cho 5 giay sau chu ky truoc";
    default: return "Khoi dong: bom mac dinh TAT";
  }
}
