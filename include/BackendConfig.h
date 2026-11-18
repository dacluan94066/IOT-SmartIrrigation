#pragma once
#include <stdint.h>
#include <stddef.h>
#if __has_include("BackendLocal.h")
#include "BackendLocal.h"
#else
// Không có token local: chỉ tắt Backend, hệ thống GĐ2 vẫn hoạt động độc lập.
namespace BackendLocal {
constexpr bool ENABLED = false;
constexpr char HOST[] = "host.wokwi.internal";
constexpr uint16_t PORT = 3001;
constexpr char DEVICE_ID[] = "esp32-01";
constexpr char TOKEN[] = "";
}
#endif
namespace BackendConfig {
constexpr uint32_t TELEMETRY_INTERVAL_MS = 5000;
constexpr uint32_t POLL_INTERVAL_MS = 2000;
constexpr uint32_t RETRY_INTERVAL_MS = 3000;
constexpr uint32_t REQUEST_DEADLINE_MS = 8000;
constexpr uint32_t CONNECT_TIMEOUT_MS = 1500;
constexpr uint16_t READ_TIMEOUT_MS = 1500;
constexpr uint32_t CONTROL_LEASE_MS = 6000;
constexpr uint32_t MAX_COMMAND_TTL_MS = 60000;
constexpr uint32_t STACK_BYTES = 12288;
constexpr size_t MAX_BODY_BYTES = 3072;
}
