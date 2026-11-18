#pragma once

#include <WiFiClient.h>
#include <atomic>
#include <memory>
#include "WeatherIoPolicy.h"

// Adapter cho HTTPClient; dùng mbedTLS có sẵn trong ESP32, không thêm thư viện.
// Tách TCP và TLS thực trên cùng socket; worker là chủ sở hữu duy nhất.
class WeatherTransport : public WiFiClient {
 public:
  using Trace = void (*)(void *, const char *, const char *);
  WeatherTransport(std::atomic<uint32_t> &allowed, uint32_t id,
                   uint32_t startedAt, Trace trace, void *context);
  ~WeatherTransport() override;
  bool open(IPAddress address, const char *hostname, const char *ca);
  void beginHttp();
  NetworkFailure failure() const { return failure_; }
  int tlsError() const { return tlsError_; }
  int lastTlsCode() const { return lastTlsCode_; }
  const char *tlsPhase() const { return tlsPhase_; }
  bool verifyFlagsKnown() const { return verifyFlagsKnown_; }
  uint32_t verifyFlags() const { return verifyFlags_; }
  int socketError() const { return socketErrno_; }
  bool retryableSocketFailure() const;

  // Không tự reconnect ngầm trong HTTPClient: mỗi request chỉ mở một socket.
  int connect(IPAddress, uint16_t) override { return rejectReconnect(); }
  int connect(IPAddress, uint16_t, int32_t) override { return rejectReconnect(); }
  int connect(const char *, uint16_t) override { return rejectReconnect(); }
  int connect(const char *, uint16_t, int32_t) override { return rejectReconnect(); }
  int setTimeout(uint32_t seconds) override;
  size_t write(uint8_t value) override;
  size_t write(const uint8_t *data, size_t size) override;
  int available() override;
  int read() override;
  int read(uint8_t *data, size_t size) override;
  size_t readBytes(char *data, size_t size) override;
  size_t readBytes(uint8_t *data, size_t size) override;
  int peek() override;
  void flush() override {}
  void stop() override;
  uint8_t connected() override;
  int fd() const override;

 private:
  struct TlsContext;
  std::unique_ptr<TlsContext> tls_;
  WiFiClient tcp_;
  std::atomic<uint32_t> &allowed_;
  WeatherIoPolicy budget_;
  Trace trace_;
  void *context_;
  bool open_ = false;
  int peeked_ = -1, tlsError_ = 0;
  uint32_t verifyFlags_ = 0;
  bool verifyFlagsKnown_ = false;
  const char *tlsPhase_ = "NOT_STARTED";
  uint32_t tlsStartedAtMs_ = 0, tlsPhaseAtMs_ = 0;
  uint32_t sentBytes_ = 0, receivedBytes_ = 0, tcpConnects_ = 0;
  int lastTlsCode_ = 0, socketErrno_ = 0;
  NetworkFailure failure_ = NetworkFailure::None;
  bool aborted();
  void trace(const char *phase, const char *message);
  void traceTls(const char *event, uint32_t elapsedMs, int code);
  void beginTlsSetupStep(const char *phase);
  bool finishTlsSetupStep(int code);
  void captureVerification();
  int rejectReconnect();
  static int sendTls(void *context, const unsigned char *data, size_t size);
  static int receiveTls(void *context, unsigned char *data, size_t size);
};
