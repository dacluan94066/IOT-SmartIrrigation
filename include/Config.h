#pragma once

#include <stdint.h>

// Tất cả thông số thường thay đổi nằm tại đây.
namespace Config {
constexpr uint8_t SOIL_SENSOR_PIN = 34;
constexpr uint8_t RELAY_PIN = 26;
constexpr uint8_t PUMP_LED_PIN = 27;
constexpr uint16_t ADC_DRY = 0;
constexpr uint16_t ADC_WET = 4095;

constexpr float SOIL_LOW_THRESHOLD = 40.0F;
constexpr float SOIL_HIGH_THRESHOLD = 70.0F;
constexpr float RAIN_PROBABILITY_THRESHOLD = 60.0F;
constexpr uint32_t MAX_PUMP_RUNTIME_MS = 10000;
constexpr uint32_t PUMP_COOLDOWN_MS = 5000;
constexpr uint32_t SERIAL_REPORT_INTERVAL_MS = 1000;
constexpr uint32_t CONTROL_INTERVAL_MS = 10;

constexpr char WIFI_SSID[] = "Wokwi-GUEST";
constexpr char WIFI_PASSWORD[] = "";
constexpr int WIFI_CHANNEL = 6;
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 10000;
constexpr uint32_t WIFI_RETRY_INTERVAL_MS = 5000;

// SNTP chạy nền. Retry của ứng dụng dùng millis(), không chờ trong loop().
constexpr const char *NTP_SERVERS[] = {
    "time.google.com", "time.cloudflare.com", "pool.ntp.org"};
constexpr uint8_t NTP_SERVER_COUNT = sizeof(NTP_SERVERS) / sizeof(NTP_SERVERS[0]);
constexpr uint32_t NTP_RESPONSE_TIMEOUT_MS = 15000;
constexpr uint32_t NTP_RETRY_INTERVAL_MS = 30000;
constexpr uint32_t NTP_DIAGNOSTIC_INTERVAL_MS = 5000;
constexpr uint32_t NTP_SYNC_INTERVAL_MS = 60UL * 60UL * 1000UL;

constexpr double LATITUDE = 10.8231;
constexpr double LONGITUDE = 106.6297;
constexpr char WEATHER_API_URL[] = "https://api.open-meteo.com/v1/forecast";
constexpr char WEATHER_API_HOST[] = "api.open-meteo.com";
constexpr uint8_t FORECAST_HOURS = 3;
constexpr uint32_t WEATHER_UPDATE_INTERVAL_MS = 15UL * 60UL * 1000UL;
// Khi demo API nhanh hơn có thể đổi WEATHER_UPDATE_INTERVAL_MS thành 60000.
constexpr uint32_t WEATHER_RETRY_INTERVAL_MS = 60000;
constexpr uint32_t WEATHER_MAX_AGE_MS = 20UL * 60UL * 1000UL;
constexpr uint32_t WEATHER_DNS_TIMEOUT_MS = 15000;  // DNS bất đồng bộ có deadline riêng
constexpr uint32_t HTTP_CONNECT_TIMEOUT_MS = 10000;
constexpr uint16_t HTTP_READ_TIMEOUT_MS = 12000;  // Idle timeout, cả header/body
// Wokwi đo được ~36s cho xác thực chuỗi CA + trao đổi khóa. Budget vẫn hữu hạn.
constexpr uint32_t TLS_HANDSHAKE_TIMEOUT_SECONDS = 45;
constexpr uint32_t WEATHER_QUEUE_TIMEOUT_MS = 5000;
// Tính từ khi worker thực sự bắt đầu; NTP và chu kỳ 15 phút không nằm trong đó.
constexpr uint32_t WEATHER_REQUEST_DEADLINE_MS = 90000;
// Chờ worker tự đóng tài nguyên. Nếu vẫn kẹt, yêu cầu reboot sau khi bơm đã OFF.
constexpr uint32_t WEATHER_RECOVERY_GRACE_MS = 30000;
constexpr uint32_t WEATHER_WORKER_STACK_BYTES = 16384;
constexpr uint32_t WEATHER_WORKER_HEARTBEAT_MS = 5000;
constexpr unsigned int MAX_WEATHER_RESPONSE_BYTES = 8192;
constexpr int64_t MIN_VALID_UNIX_TIME = 1704067200LL;  // 2024-01-01 UTC
constexpr int64_t MAX_VALID_UNIX_TIME = 4102444800LL;  // Trước 2100-01-01 UTC
constexpr long LOCAL_UTC_OFFSET_SECONDS = 7L * 3600L;

constexpr bool DEMO_WEATHER_MODE = false;
// Chỉ cho bản mô phỏng Wokwi: vẫn cần Backend REMOTE_DEMO_ENABLED=true và xác nhận Web.
// Mỗi lần boot không có phiên demo; không bật cờ này cho bơm phần cứng thực.
constexpr bool REMOTE_DEMO_ENABLED = true;
constexpr uint8_t DEMO_INITIAL_RAIN_PROBABILITY = 20;  // Chỉ chọn 20 hoặc 85

static_assert(SOIL_LOW_THRESHOLD < SOIL_HIGH_THRESHOLD, "Nguong hysteresis sai");
static_assert(WEATHER_UPDATE_INTERVAL_MS > 0 && WEATHER_MAX_AGE_MS > 0,
              "Chu ky thoi tiet phai lon hon 0");
static_assert(DEMO_INITIAL_RAIN_PROBABILITY == 20 ||
                  DEMO_INITIAL_RAIN_PROBABILITY == 85,
              "Demo chi ho tro xac suat mua 20% hoac 85%");
static_assert(NTP_SERVER_COUNT == 3 && NTP_RETRY_INTERVAL_MS > NTP_RESPONSE_TIMEOUT_MS,
              "Can 3 may chu NTP va retry lon hon timeout");
static_assert(WEATHER_REQUEST_DEADLINE_MS >
                  WEATHER_DNS_TIMEOUT_MS + HTTP_CONNECT_TIMEOUT_MS +
                  TLS_HANDSHAKE_TIMEOUT_SECONDS * 1000UL + HTTP_READ_TIMEOUT_MS,
              "Budget tong phai du cho DNS, TCP, TLS va HTTP header");
}  // namespace Config
