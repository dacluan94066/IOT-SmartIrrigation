#pragma once

#include <IPAddress.h>
#include <atomic>
#include <lwip/ip_addr.h>

enum class DnsOutcome { Success, LookupError, Timeout, Cancelled, WorkerDeadline, Busy };

// Object sống suốt chương trình: callback DNS đến trễ không trỏ vào biến trên stack.
// Không tái sử dụng query chưa hoàn thành, không cấp thêm query/task khi timeout.
class WeatherDnsResolver {
 public:
  DnsOutcome resolve(const char *hostname, IPAddress &address,
                     const std::atomic<uint32_t> &allowedId,
                     uint32_t requestId, uint32_t workerStartedAt);
  bool stalled(uint32_t now) const;

 private:
  static void startQuery(void *context);
  static void dnsFound(const char *, const ip_addr_t *address, void *context);
  void complete(const ip_addr_t *address);
  std::atomic<bool> pending_{false}, complete_{false};
  std::atomic<uint32_t> startedAt_{0}, address_{0};
  char hostname_[128] = {};
};
