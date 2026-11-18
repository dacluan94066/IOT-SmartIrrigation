#pragma once

#include <stddef.h>
#include "WeatherData.h"

// Hàm thuần: không gọi mạng/GPIO; chỉ nhận dữ liệu sau khi xác minh toàn bộ.
bool parseWeatherJson(const char *json, size_t length, int64_t nowEpoch,
                      WeatherData &output, char *error, size_t errorCapacity);
