#pragma once

#include <stdint.h>
#include "Config.h"

namespace TimeSync {
// Epoch là UTC, không cộng múi giờ vào time(nullptr) để kiểm tra TLS.
// Callback xác nhận đã thật sự nhận thời gian qua SNTP ở lần khởi động này.
inline bool isReady(int64_t epoch, bool receivedNtpResponse) {
  return receivedNtpResponse && epoch >= Config::MIN_VALID_UNIX_TIME &&
         epoch < Config::MAX_VALID_UNIX_TIME;
}

enum class State : uint32_t { NotStarted, Waiting, TimedOut, ClockUnconfirmed, InvalidEpoch, Ready };

// Phân biệt chờ bình thường và hết budget của lần thử, không nới điều kiện TLS.
inline State classify(int64_t epoch, bool receivedNtpResponse, bool started, uint32_t elapsedMs) {
  if (isReady(epoch, receivedNtpResponse)) { return State::Ready; }
  if (receivedNtpResponse) { return State::InvalidEpoch; }
  // Sau timeout vẫn báo timeout, kể cả đồng hồ đang có epoch có vẻ hợp lệ.
  if (started && elapsedMs >= Config::NTP_RESPONSE_TIMEOUT_MS) { return State::TimedOut; }
  if (epoch >= Config::MIN_VALID_UNIX_TIME && epoch < Config::MAX_VALID_UNIX_TIME) {
    return State::ClockUnconfirmed;
  }
  return started ? State::Waiting : State::NotStarted;
}

inline const char *message(State state) {
  switch (state) {
    case State::NotStarted: return "TIME_WAITING_WIFI: SNTP chua bat dau";
    case State::Waiting: return "TIME_WAITING_NTP: dang cho phan hoi, chua het timeout";
    case State::TimedOut: return "TIME_SYNC_TIMEOUT: het budget NTP, chua du callback + epoch; cho retry";
    case State::ClockUnconfirmed: return "TIME_UNCONFIRMED: epoch co ve hop le nhung chua co callback SNTP";
    case State::InvalidEpoch: return "TIME_INVALID_EPOCH: da co callback nhung epoch ngoai pham vi";
    case State::Ready: return "TIME_VALID";
  }
  return "TIME_NOT_VALID";
}

bool ready();
uint32_t notifications();
const char *pendingReason();
}  // namespace TimeSync
