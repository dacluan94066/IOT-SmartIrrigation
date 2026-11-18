#include "WeatherParser.h"

#include <ArduinoJson.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include "Config.h"

namespace {
bool fail(char *error, size_t capacity, const char *message) {
  snprintf(error, capacity, "%s", message);
  return false;
}

bool numberInRange(JsonVariantConst value, float minimum, float maximum) {
  if (!value.is<float>()) {
    return false;  // Loại bỏ null, bool và chuỗi "20" thay vì ép về số 0.
  }
  const float number = value.as<float>();
  return isfinite(number) && number >= minimum && number <= maximum;
}
}  // namespace

bool parseWeatherJson(const char *json, size_t length, int64_t nowEpoch,
                      WeatherData &output, char *error, size_t errorCapacity) {
  // Xóa đầu ra từ trước để không dùng nhầm một kết quả cũ khi parser lỗi.
  output = WeatherData{};
  if (nowEpoch < Config::MIN_VALID_UNIX_TIME) {
    return fail(error, errorCapacity, "Chua dong bo dong ho de kiem tra du lieu");
  }
  JsonDocument document;
  const DeserializationError jsonError = deserializeJson(
      document, json, length, DeserializationOption::NestingLimit(8));
  if (jsonError) {
    snprintf(error, errorCapacity, "JSON loi: %s", jsonError.c_str());
    return false;
  }
  if (!document.is<JsonObject>() || document["error"].as<bool>()) {
    return fail(error, errorCapacity, "API tra ve doi tuong loi");
  }

  const JsonObjectConst current = document["current"].as<JsonObjectConst>();
  const JsonArrayConst times = document["hourly"]["time"].as<JsonArrayConst>();
  const JsonArrayConst probabilities =
      document["hourly"]["precipitation_probability"].as<JsonArrayConst>();
  if (!numberInRange(current["temperature_2m"], -90, 65) ||
      !numberInRange(current["relative_humidity_2m"], 0, 100) ||
      !current["time"].is<int64_t>() ||
      times.size() != Config::FORECAST_HOURS ||
      probabilities.size() != Config::FORECAST_HOURS) {
    return fail(error, errorCapacity, "Thieu/sai nhiet do, do am, thoi gian hoac 3 xac suat mua");
  }
  if (strcmp(document["current_units"]["temperature_2m"] | "", "\xC2\xB0" "C") != 0 ||
      strcmp(document["current_units"]["relative_humidity_2m"] | "", "%") != 0 ||
      strcmp(document["hourly_units"]["precipitation_probability"] | "", "%") != 0 ||
      strcmp(document["current_units"]["time"] | "", "unixtime") != 0 ||
      strcmp(document["hourly_units"]["time"] | "", "unixtime") != 0) {
    return fail(error, errorCapacity, "Don vi API khong hop le");
  }

  WeatherData candidate;
  candidate.currentTimeEpoch = current["time"].as<int64_t>();
  if (candidate.currentTimeEpoch > nowEpoch + 120 ||
      nowEpoch - candidate.currentTimeEpoch > 1800) {
    return fail(error, errorCapacity, "Thoi gian current cua API da cu/nam trong tuong lai");
  }
  for (uint8_t i = 0; i < Config::FORECAST_HOURS; ++i) {
    if (!times[i].is<int64_t>() || !numberInRange(probabilities[i], 0, 100)) {
      return fail(error, errorCapacity, "Moc gio hoac xac suat mua khong hop le");
    }
    const int64_t timestamp = times[i].as<int64_t>();
    if (i == 0) {
      candidate.forecastStartEpoch = timestamp;
      if (timestamp > nowEpoch + 120 || nowEpoch - timestamp > 3600) {
        return fail(error, errorCapacity, "Du bao khong bat dau tai gio hien tai");
      }
    } else if (timestamp != candidate.forecastStartEpoch + 3600LL * i) {
      return fail(error, errorCapacity, "Cac moc du bao khong lien tiep 1 gio");
    }
    candidate.forecastEndEpoch = timestamp;
    const float probability = probabilities[i].as<float>();
    if (probability > candidate.maxRainProbabilityPercent) {
      candidate.maxRainProbabilityPercent = probability;
    }
  }

  // Lượng mưa là tùy chọn. Một ô null làm toàn bộ tổng không khả dụng,
  // không được tự thay null bằng 0 mm. Sai kiểu/đơn vị thì loại bản tin.
  JsonVariantConst precipitationValue = document["hourly"]["precipitation"];
  if (!precipitationValue.isNull()) {
    const JsonArrayConst amounts = precipitationValue.as<JsonArrayConst>();
    if (amounts.size() != Config::FORECAST_HOURS ||
        strcmp(document["hourly_units"]["precipitation"] | "", "mm") != 0) {
      return fail(error, errorCapacity, "Mang luong mua/don vi mm khong hop le");
    }
    candidate.hasPrecipitation = true;
    for (JsonVariantConst amount : amounts) {
      if (amount.isNull()) {
        candidate.hasPrecipitation = false;
      } else if (!numberInRange(amount, 0, 2000)) {
        return fail(error, errorCapacity, "Luong mua sai kieu hoac ngoai pham vi");
      } else {
        candidate.totalPrecipitationMm += amount.as<float>();
      }
    }
    if (!candidate.hasPrecipitation) {
      candidate.totalPrecipitationMm = 0;
    }
  }

  candidate.hasCurrentConditions = true;
  candidate.temperatureC = current["temperature_2m"].as<float>();
  candidate.relativeHumidityPercent = current["relative_humidity_2m"].as<float>();
  output = candidate;
  error[0] = '\0';
  return true;
}
