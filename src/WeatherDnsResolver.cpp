#include "WeatherDnsResolver.h"

#include <Arduino.h>
#include <lwip/dns.h>
#include <lwip/tcpip.h>
#include <stdio.h>
#include "Config.h"

void WeatherDnsResolver::complete(const ip_addr_t *address) {
  const uint32_t ip = address && IP_IS_V4(address) ? ip4_addr_get_u32(ip_2_ip4(address)) : 0;
  address_.store(ip);
  // Là thao tác cuối của callback: từ đây worker được phép đọc kết quả/reuse query.
  complete_.store(true, std::memory_order_release);
}

void WeatherDnsResolver::dnsFound(const char *, const ip_addr_t *address, void *context) {
  static_cast<WeatherDnsResolver *>(context)->complete(address);
}

void WeatherDnsResolver::startQuery(void *context) {
  auto *resolver = static_cast<WeatherDnsResolver *>(context);
  ip_addr_t address;
  const err_t status = dns_gethostbyname(resolver->hostname_, &address, dnsFound, resolver);
  if (status == ERR_OK) { resolver->complete(&address); }
  else if (status != ERR_INPROGRESS) { resolver->complete(nullptr); }
}

DnsOutcome WeatherDnsResolver::resolve(const char *hostname, IPAddress &address,
                                       const std::atomic<uint32_t> &allowedId,
                                       uint32_t requestId, uint32_t workerStartedAt) {
  if (pending_.load(std::memory_order_acquire) && !complete_.load(std::memory_order_acquire)) {
    return DnsOutcome::Busy;
  }
  snprintf(hostname_, sizeof(hostname_), "%s", hostname);
  address_.store(0);
  complete_.store(false);
  startedAt_.store(millis());
  pending_.store(true, std::memory_order_release);
  // dns_gethostbyname phải chạy trên TCP/IP core; không dùng API chặn hostByName().
  if (tcpip_callback(startQuery, this) != ERR_OK) {
    pending_.store(false, std::memory_order_release);
    return DnsOutcome::LookupError;
  }
  for (;;) {
    const uint32_t now = millis();
    if (now - workerStartedAt >= Config::WEATHER_REQUEST_DEADLINE_MS) {
      return DnsOutcome::WorkerDeadline;
    }
    if (allowedId.load(std::memory_order_acquire) != requestId) { return DnsOutcome::Cancelled; }
    // Kết quả chỉ được chấp nhận trước DNS deadline, kể cả callback vừa về.
    if (now - startedAt_.load() >= Config::WEATHER_DNS_TIMEOUT_MS) { return DnsOutcome::Timeout; }
    if (complete_.load(std::memory_order_acquire)) {
      const uint32_t ip = address_.load();
      address = IPAddress(ip);
      pending_.store(false, std::memory_order_release);
      return ip ? DnsOutcome::Success : DnsOutcome::LookupError;
    }
    vTaskDelay(1);
  }
}

bool WeatherDnsResolver::stalled(uint32_t now) const {
  return pending_.load(std::memory_order_acquire) && !complete_.load(std::memory_order_acquire) &&
         now - startedAt_.load() >= Config::WEATHER_DNS_TIMEOUT_MS + Config::WEATHER_RECOVERY_GRACE_MS;
}
