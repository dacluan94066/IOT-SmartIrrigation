#pragma once

#include <stdint.h>

enum class WeatherState { Unknown, Valid, Stale };

struct WeatherData {
  bool simulated = false;
  bool hasCurrentConditions = false;
  float temperatureC = 0;
  float relativeHumidityPercent = 0;
  float maxRainProbabilityPercent = 0;
  bool hasPrecipitation = false;
  float totalPrecipitationMm = 0;
  int64_t currentTimeEpoch = 0;
  int64_t forecastStartEpoch = 0;
  int64_t forecastEndEpoch = 0;
  int64_t updatedAtEpoch = 0;
  uint32_t updatedAtMs = 0;
};

// Dùng cùng một hàm trong firmware và kiểm thử trên máy tính.
inline WeatherState classifyWeather(bool valid, bool hasSample,
                                   uint32_t updatedAtMs, uint32_t nowMs,
                                   uint32_t maximumAgeMs) {
  if (!valid || !hasSample) {
    return WeatherState::Unknown;
  }
  return nowMs - updatedAtMs >= maximumAgeMs ? WeatherState::Stale
                                           : WeatherState::Valid;
}

inline const char *weatherStateName(WeatherState state) {
  switch (state) {
    case WeatherState::Valid: return "VALID";
    case WeatherState::Stale: return "STALE";
    default: return "UNKNOWN";
  }
}
