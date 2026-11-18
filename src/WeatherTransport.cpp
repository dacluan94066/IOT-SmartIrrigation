#include "WeatherTransport.h"

#include <Arduino.h>
#include <errno.h>
#include <esp_heap_caps.h>
#include <lwip/sockets.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/entropy.h>
#include <mbedtls/net_sockets.h>
#include <mbedtls/ssl.h>
#include <mbedtls/x509_crt.h>
#include <mbedtls/version.h>
#include <new>
#include "Config.h"

namespace {
const char *tlsStateName(int state) {
  switch (state) {
    case MBEDTLS_SSL_HELLO_REQUEST: return "HELLO_REQUEST";
    case MBEDTLS_SSL_CLIENT_HELLO: return "CLIENT_HELLO";
    case MBEDTLS_SSL_SERVER_HELLO: return "SERVER_HELLO";
    case MBEDTLS_SSL_SERVER_CERTIFICATE: return "SERVER_CERTIFICATE";
    case MBEDTLS_SSL_SERVER_KEY_EXCHANGE: return "SERVER_KEY_EXCHANGE";
    case MBEDTLS_SSL_CERTIFICATE_REQUEST: return "CERTIFICATE_REQUEST";
    case MBEDTLS_SSL_SERVER_HELLO_DONE: return "SERVER_HELLO_DONE";
    case MBEDTLS_SSL_CLIENT_CERTIFICATE: return "CLIENT_CERTIFICATE";
    case MBEDTLS_SSL_CLIENT_KEY_EXCHANGE: return "CLIENT_KEY_EXCHANGE";
    case MBEDTLS_SSL_CERTIFICATE_VERIFY: return "CERTIFICATE_VERIFY";
    case MBEDTLS_SSL_CLIENT_CHANGE_CIPHER_SPEC: return "CLIENT_CHANGE_CIPHER";
    case MBEDTLS_SSL_CLIENT_FINISHED: return "CLIENT_FINISHED";
    case MBEDTLS_SSL_SERVER_CHANGE_CIPHER_SPEC: return "SERVER_CHANGE_CIPHER";
    case MBEDTLS_SSL_SERVER_FINISHED: return "SERVER_FINISHED";
    case MBEDTLS_SSL_FLUSH_BUFFERS: return "FLUSH_BUFFERS";
    case MBEDTLS_SSL_HANDSHAKE_WRAPUP: return "HANDSHAKE_WRAPUP";
    case MBEDTLS_SSL_HANDSHAKE_OVER: return "HANDSHAKE_OVER";
    case MBEDTLS_SSL_SERVER_NEW_SESSION_TICKET: return "SERVER_SESSION_TICKET";
    default: return "OTHER";
  }
}
}  // namespace

struct WeatherTransport::TlsContext {
  mbedtls_ssl_context ssl;
  mbedtls_ssl_config config;
  mbedtls_ctr_drbg_context random;
  mbedtls_entropy_context entropy;
  mbedtls_x509_crt ca;
  TlsContext() {
    mbedtls_ssl_init(&ssl);
    mbedtls_ssl_config_init(&config);
    mbedtls_ctr_drbg_init(&random);
    mbedtls_entropy_init(&entropy);
    mbedtls_x509_crt_init(&ca);
  }
  ~TlsContext() {
    mbedtls_ssl_free(&ssl);
    mbedtls_ssl_config_free(&config);
    mbedtls_x509_crt_free(&ca);
    mbedtls_ctr_drbg_free(&random);
    mbedtls_entropy_free(&entropy);
  }
};

WeatherTransport::WeatherTransport(std::atomic<uint32_t> &allowed, uint32_t id,
                                   uint32_t startedAt, Trace traceFunction, void *context)
    : allowed_(allowed), budget_(id, startedAt), trace_(traceFunction), context_(context) {
  setTimeout((Config::HTTP_READ_TIMEOUT_MS + 999) / 1000);
}

WeatherTransport::~WeatherTransport() { stop(); }

void WeatherTransport::trace(const char *phase, const char *message) {
  if (trace_) { trace_(context_, phase, message); }
}

int WeatherTransport::rejectReconnect() {
  trace("TCP_RECONNECT_BLOCKED", "HTTPClient yeu cau connect; khong mo them socket");
  return 0;
}

void WeatherTransport::captureVerification() {
  // flags=0 trước khi nhận chứng chỉ không phải bằng chứng TLS đã xác thực.
  if (tls_) { verifyFlags_ = mbedtls_ssl_get_verify_result(&tls_->ssl); }
  verifyFlagsKnown_ = tls_ && (mbedtls_ssl_get_peer_cert(&tls_->ssl) != nullptr ||
                              (verifyFlags_ != 0 && verifyFlags_ != UINT32_MAX));
}

bool WeatherTransport::retryableSocketFailure() const {
  // Hủy/quá deadline không được biến thành lỗi mạng để thử lại nhanh.
  return (failure_ == NetworkFailure::TlsError || failure_ == NetworkFailure::TlsIoError) &&
         (tlsError_ == MBEDTLS_ERR_NET_SEND_FAILED ||
          tlsError_ == MBEDTLS_ERR_NET_RECV_FAILED ||
          tlsError_ == MBEDTLS_ERR_NET_CONN_RESET);
}

void WeatherTransport::traceTls(const char *event, uint32_t elapsedMs, int code) {
  char detail[160];
  snprintf(detail, sizeof(detail),
           "phase=%s dt=%lu total=%lu code=%d fd=%d tx=%lu rx=%lu errno=%d largest=%u",
           tlsPhase_, static_cast<unsigned long>(elapsedMs),
           static_cast<unsigned long>(millis() - tlsStartedAtMs_), code, tcp_.fd(),
           static_cast<unsigned long>(sentBytes_), static_cast<unsigned long>(receivedBytes_),
           socketErrno_, static_cast<unsigned int>(heap_caps_get_largest_free_block(MALLOC_CAP_8BIT)));
  trace(event, detail);  // Queue hiện có chụp thêm heap/stack từ chính worker.
}

void WeatherTransport::beginTlsSetupStep(const char *phase) {
  tlsPhase_ = phase;
  tlsPhaseAtMs_ = millis();
  traceTls("TLS_INIT_STEP_BEGIN", 0, 0);
}

bool WeatherTransport::finishTlsSetupStep(int code) {
  lastTlsCode_ = code;
  traceTls("TLS_INIT_STEP_END", millis() - tlsPhaseAtMs_, code);
  if (!code) { return true; }
  tlsError_ = code;
  failure_ = NetworkFailure::TlsError;
  return false;
}

bool WeatherTransport::aborted() {
  if (failure_ != NetworkFailure::None) { return true; }
  failure_ = budget_.check(millis(), allowed_.load(std::memory_order_acquire));
  return failure_ != NetworkFailure::None;
}

bool WeatherTransport::open(IPAddress address, const char *hostname, const char *ca) {
  if (aborted()) { return false; }
  trace("TCP_BEGIN", "Mo TCP toi IP da DNS; khong lookup lan hai");
  const uint32_t tcpStarted = millis();
  ++tcpConnects_;
  const bool tcpConnected = tcp_.connect(address, 443, Config::HTTP_CONNECT_TIMEOUT_MS) == 1;
  const uint32_t tcpElapsed = millis() - tcpStarted;
  if (aborted()) { return false; }
  if (!tcpConnected || tcpElapsed >= Config::HTTP_CONNECT_TIMEOUT_MS) {
    failure_ = tcpElapsed >= Config::HTTP_CONNECT_TIMEOUT_MS
                   ? NetworkFailure::TcpTimeout : NetworkFailure::TcpError;
    return false;
  }
  char detail[160];
  snprintf(detail, sizeof(detail), "IP=%s port=443 fd=%d connect_calls=%lu dt=%lu",
           address.toString().c_str(), tcp_.fd(), static_cast<unsigned long>(tcpConnects_),
           static_cast<unsigned long>(tcpElapsed));
  trace("TCP_END", detail);
  snprintf(detail, sizeof(detail), "host/SNI=%s CA=required epoch=%lld mbedTLS=%s budget=%lus(millis)",
           hostname, static_cast<long long>(time(nullptr)), MBEDTLS_VERSION_STRING,
           static_cast<unsigned long>(Config::TLS_HANDSHAKE_TIMEOUT_SECONDS));
  trace("TLS_BEGIN", detail);
  const uint32_t tlsStarted = millis();
  tlsStartedAtMs_ = tlsStarted;
  beginTlsSetupStep("ALLOC_CONTEXT");
  tls_.reset(new (std::nothrow) TlsContext());
  if (!tls_) {
    traceTls("TLS_ALLOC_FAILED", millis() - tlsPhaseAtMs_, MBEDTLS_ERR_SSL_ALLOC_FAILED);
    failure_ = NetworkFailure::NoMemory;
    return false;
  }
  finishTlsSetupStep(0);

  const unsigned char personalization[] = "smart-irrigation-weather";
  beginTlsSetupStep("RNG_SEED");
  int code = mbedtls_ctr_drbg_seed(&tls_->random, mbedtls_entropy_func, &tls_->entropy,
                                   personalization, sizeof(personalization) - 1);
  if (!finishTlsSetupStep(code)) { return false; }
  beginTlsSetupStep("CONFIG_DEFAULTS");
  code = mbedtls_ssl_config_defaults(&tls_->config, MBEDTLS_SSL_IS_CLIENT,
                                    MBEDTLS_SSL_TRANSPORT_STREAM, MBEDTLS_SSL_PRESET_DEFAULT);
  if (!finishTlsSetupStep(code)) { return false; }
  beginTlsSetupStep("CA_PARSE");
  code = mbedtls_x509_crt_parse(&tls_->ca,
                              reinterpret_cast<const unsigned char *>(ca), strlen(ca) + 1);
  // Cả kết quả parse dương (PEM lỗi một phần) cũng không được chấp nhận.
  if (!finishTlsSetupStep(code)) { return false; }
  unsigned int rootCount = 0;
  for (const mbedtls_x509_crt *root = &tls_->ca; root; root = root->next) {
    if (root->raw.p) { ++rootCount; }
  }
  snprintf(detail, sizeof(detail), "trusted_roots=%u; certificate/hostname/time verification required", rootCount);
  trace("TLS_CA_READY", detail);
  mbedtls_ssl_conf_authmode(&tls_->config, MBEDTLS_SSL_VERIFY_REQUIRED);
  mbedtls_ssl_conf_ca_chain(&tls_->config, &tls_->ca, nullptr);
  mbedtls_ssl_conf_rng(&tls_->config, mbedtls_ctr_drbg_random, &tls_->random);
  beginTlsSetupStep("SSL_SETUP");
  code = mbedtls_ssl_setup(&tls_->ssl, &tls_->config);
  if (!finishTlsSetupStep(code)) { return false; }
  beginTlsSetupStep("SET_HOSTNAME_BIO");
  code = mbedtls_ssl_set_hostname(&tls_->ssl, hostname);
  if (!finishTlsSetupStep(code)) { return false; }
  mbedtls_ssl_set_bio(&tls_->ssl, this, sendTls, receiveTls, nullptr);
  traceTls("TLS_INIT_END", millis() - tlsStarted, code);

  // Một bước handshake mỗi lượt để nhường CPU/kiểm tra cancellation.
  // Budget cấu hình tính cả setup; từng bước mật mã có thể vượt một lượt loop.
  const uint32_t handshakeStarted = millis();
  int loggedState = -1;
  uint32_t lastWaitLog = handshakeStarted;
  while (tls_->ssl.state != MBEDTLS_SSL_HANDSHAKE_OVER) {
    if (aborted()) { return false; }
    if (millis() - tlsStarted >= Config::TLS_HANDSHAKE_TIMEOUT_SECONDS * 1000UL) {
      captureVerification();
      traceTls("TLS_TIMEOUT", millis() - handshakeStarted, lastTlsCode_);
      failure_ = NetworkFailure::TlsTimeout;
      return false;
    }
    const int state = tls_->ssl.state;
    if (state != loggedState) {
      loggedState = state;
      tlsPhase_ = tlsStateName(state);
      traceTls("TLS_STEP_BEGIN", millis() - handshakeStarted, lastTlsCode_);
    }
    const uint32_t stepStarted = millis();
    code = mbedtls_ssl_handshake_step(&tls_->ssl);
    lastTlsCode_ = code;
    const uint32_t stepElapsed = millis() - stepStarted;
    if (tls_->ssl.state != state || stepElapsed >= 500 ||
        (code && code != MBEDTLS_ERR_SSL_WANT_READ && code != MBEDTLS_ERR_SSL_WANT_WRITE)) {
      traceTls("TLS_STEP_END", stepElapsed, code);
    } else if (millis() - lastWaitLog >= Config::WEATHER_WORKER_HEARTBEAT_MS) {
      lastWaitLog = millis();
      traceTls("TLS_WAIT", millis() - handshakeStarted, code);
    }
    if (code && code != MBEDTLS_ERR_SSL_WANT_READ && code != MBEDTLS_ERR_SSL_WANT_WRITE) {
      tlsError_ = code;
      captureVerification();
      if (!aborted()) { failure_ = NetworkFailure::TlsError; }
      return false;
    }
    vTaskDelay(1);
  }
  if (aborted()) { return false; }
  if (millis() - tlsStarted >= Config::TLS_HANDSHAKE_TIMEOUT_SECONDS * 1000UL) {
    captureVerification();
    traceTls("TLS_TIMEOUT", millis() - handshakeStarted, lastTlsCode_);
    failure_ = NetworkFailure::TlsTimeout;
    return false;
  }
  captureVerification();
  if (!mbedtls_ssl_get_peer_cert(&tls_->ssl) || verifyFlags_ != 0) {
    failure_ = NetworkFailure::TlsError;
    return false;
  }
  open_ = true;
  tlsPhase_ = "HANDSHAKE_OVER";
  traceTls("TLS_HANDSHAKE_END", millis() - handshakeStarted, 0);
  snprintf(detail, sizeof(detail), "TLS verified: %s %s verify_flags=0 peer=yes fd=%d",
           mbedtls_ssl_get_version(&tls_->ssl), mbedtls_ssl_get_ciphersuite(&tls_->ssl), tcp_.fd());
  trace("TLS_END", detail);
  return true;
}

int WeatherTransport::sendTls(void *context, const unsigned char *data, size_t size) {
  auto *client = static_cast<WeatherTransport *>(context);
  if (client->aborted()) { return MBEDTLS_ERR_NET_SEND_FAILED; }
  const int count = lwip_send(client->tcp_.fd(), data, size, MSG_DONTWAIT);
  if (count >= 0) { client->sentBytes_ += count; return count; }
  client->socketErrno_ = errno;
  // Dùng bản chụp errno, không để lời gọi log/thư viện sau đó ghi đè.
  if (client->socketErrno_ == EPIPE || client->socketErrno_ == ECONNRESET) {
    return MBEDTLS_ERR_NET_CONN_RESET;
  }
  return (client->socketErrno_ == EAGAIN || client->socketErrno_ == EWOULDBLOCK ||
          client->socketErrno_ == EINTR)
             ? MBEDTLS_ERR_SSL_WANT_WRITE : MBEDTLS_ERR_NET_SEND_FAILED;
}

int WeatherTransport::receiveTls(void *context, unsigned char *data, size_t size) {
  auto *client = static_cast<WeatherTransport *>(context);
  if (client->aborted()) { return MBEDTLS_ERR_NET_RECV_FAILED; }
  const int count = lwip_recv(client->tcp_.fd(), data, size, MSG_DONTWAIT);
  if (count >= 0) { client->receivedBytes_ += count; return count; }
  client->socketErrno_ = errno;
  if (client->socketErrno_ == ECONNRESET) { return MBEDTLS_ERR_NET_CONN_RESET; }
  return (client->socketErrno_ == EAGAIN || client->socketErrno_ == EWOULDBLOCK ||
          client->socketErrno_ == EINTR)
             ? MBEDTLS_ERR_SSL_WANT_READ : MBEDTLS_ERR_NET_RECV_FAILED;
}

void WeatherTransport::beginHttp() { budget_.beginHttp(millis()); }

int WeatherTransport::setTimeout(uint32_t seconds) {
  budget_.setIdleTimeout(seconds * 1000UL);
  Stream::setTimeout(seconds * 1000UL);
  return 0;
}

uint8_t WeatherTransport::connected() { return open_ && !aborted(); }
int WeatherTransport::fd() const { return tcp_.fd(); }
void WeatherTransport::stop() { open_ = false; tcp_.stop(); tls_.reset(); peeked_ = -1; }

size_t WeatherTransport::write(uint8_t value) { return write(&value, 1); }
size_t WeatherTransport::write(const uint8_t *data, size_t size) {
  size_t offset = 0;
  while (connected() && offset < size) {
    const int count = mbedtls_ssl_write(&tls_->ssl, data + offset, size - offset);
    if (count > 0) { offset += count; budget_.activity(millis()); }
    else if (count == MBEDTLS_ERR_SSL_WANT_READ || count == MBEDTLS_ERR_SSL_WANT_WRITE) {
      vTaskDelay(1);
    } else {
      tlsError_ = count;
      if (!aborted()) { failure_ = NetworkFailure::TlsIoError; }
      open_ = false;
    }
  }
  return offset;
}

int WeatherTransport::read(uint8_t *data, size_t size) {
  if (!size || !connected()) { return 0; }
  if (peeked_ >= 0) { data[0] = static_cast<uint8_t>(peeked_); peeked_ = -1; return 1; }
  const int count = mbedtls_ssl_read(&tls_->ssl, data, size);
  if (count > 0) { budget_.activity(millis()); return count; }
  if (count == MBEDTLS_ERR_SSL_WANT_READ || count == MBEDTLS_ERR_SSL_WANT_WRITE) { return 0; }
  if (count != 0 && count != MBEDTLS_ERR_SSL_PEER_CLOSE_NOTIFY) {
    tlsError_ = count;
    if (!aborted()) { failure_ = NetworkFailure::TlsIoError; }
  }
  open_ = false;
  return 0;
}

int WeatherTransport::read() {
  uint8_t value;
  if (read(&value, 1) == 1) { return value; }
  // Stream::readStringUntil() gọi read() liên tục khi chờ một phần header/chunk.
  // Nhường CPU cả trong đường đi này, không để busy-loop chiếm lõi.
  vTaskDelay(1);
  return -1;
}
size_t WeatherTransport::readBytes(char *data, size_t size) {
  return readBytes(reinterpret_cast<uint8_t *>(data), size);
}
size_t WeatherTransport::readBytes(uint8_t *data, size_t size) {
  size_t offset = 0;
  while (connected() && offset < size) {
    const int count = read(data + offset, size - offset);
    if (count > 0) { offset += count; }
    else { vTaskDelay(1); }
  }
  return offset;
}
int WeatherTransport::available() {
  if (!connected()) { return 0; }
  if (peeked_ >= 0) { return 1 + mbedtls_ssl_get_bytes_avail(&tls_->ssl); }
  const int value = read();
  if (value < 0) { return 0; }
  peeked_ = value;
  return 1 + mbedtls_ssl_get_bytes_avail(&tls_->ssl);
}
int WeatherTransport::peek() { available(); return peeked_; }
