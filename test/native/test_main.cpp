#include <ArduinoJson.h>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <limits>
#include <string>
#include "Config.h"
#include "PumpController.h"
#include "WeatherParser.h"
#include "TimeSync.h"
#include "WeatherRequestLifecycle.h"
#include "WeatherIoPolicy.h"

namespace {
int checks = 0;
void check(bool condition, const char *name) {
  ++checks;
  if (!condition) {
    std::fprintf(stderr, "FAIL: %s\n", name);
    std::exit(1);
  }
}

void testPump() {
  const WeatherState valid = WeatherState::Valid;
  PumpController a;
  check(!a.isOn(), "Startup OFF");
  a.update(25, true, valid, 20, 100);
  check(a.isOn(), "A: soil25 rain20 starts watering");
  a.update(50, true, valid, 20, 200);
  check(a.isOn(), "Hysteresis: 50% keeps running");
  a.update(75, true, valid, 20, 300);
  check(!a.isOn() && a.reason() == PumpReason::SoilWet, "D: 75% stops");
  a.update(25, true, valid, 20, 5299);
  check(!a.isOn() && a.reason() == PumpReason::Cooldown, "Cooldown at 4999ms");
  a.update(25, true, valid, 20, 5300);
  check(a.isOn(), "Cooldown completes at 5000ms");
  a.update(25, true, valid, 20, 15299);
  check(a.isOn(), "Runtime 9999ms still on");
  a.update(25, true, valid, 20, 15300);
  check(!a.isOn() && a.reason() == PumpReason::RuntimeLimit, "E: 10000ms stops");

  PumpController b;
  b.update(25, true, valid, 85, 0);
  check(!b.isOn() && b.reason() == PumpReason::RainExpected, "B: rain85 postpones");
  b.update(80, true, valid, 20, 100);
  check(!b.isOn(), "C: soil80 stays off");
  b.update(50, true, valid, 20, 200);
  check(!b.isOn(), "50% does not start new cycle");
  b.update(40, true, valid, 20, 300);
  check(!b.isOn(), "Exactly40 does not start");
  b.update(39.9F, true, valid, 60, 400);
  check(!b.isOn(), "Exactly60 rain blocks");
  b.update(39.9F, true, valid, 59.9F, 500);
  check(b.isOn(), "Below40 and below60 starts");
  b.update(70, true, valid, 20, 600);
  check(!b.isOn(), "Exactly70 stops");

  PumpController f;
  f.update(25, true, WeatherState::Unknown, 0, 0);
  check(!f.isOn() && f.reason() == PumpReason::WeatherUnavailable,
        "F: API unknown blocks new cycle");
  f.update(25, true, valid, 20, 100);
  f.update(25, true, valid, 85, 200);
  check(!f.isOn() && f.reason() == PumpReason::RainExpected,
        "G: new rain85 stops running pump");
  f.update(25, true, valid, 20, 5200);
  check(f.isOn(), "Can resume only after cooldown");
  f.update(25, false, valid, 20, 5300);
  check(!f.isOn(), "WiFi loss stops running pump even with valid cache");
  f.update(25, false, valid, 20, 20000);
  check(!f.isOn(), "WiFi loss blocks start");
  f.update(25, true, valid, 20, 20100);
  f.update(25, true, WeatherState::Unknown, 20, 20200);
  check(!f.isOn(), "API failure stops running pump");
  f.update(25, true, valid, 20, 25200);
  f.update(25, true, WeatherState::Stale, 20, 25300);
  check(!f.isOn(), "STALE stops running pump");

  PumpController wrap;
  const uint32_t start = UINT32_MAX - 100;
  wrap.update(25, true, valid, 20, start);
  wrap.update(25, true, valid, 20, static_cast<uint32_t>(start + 10000U));
  check(!wrap.isOn(), "Runtime handles millis rollover");
  wrap.update(25, true, valid, 20, static_cast<uint32_t>(start + 14999U));
  check(!wrap.isOn(), "Cooldown handles millis rollover");
  wrap.update(25, true, valid, 20, static_cast<uint32_t>(start + 15000U));
  check(wrap.isOn(), "Restart after rollover cooldown");
  wrap.update(25, true, valid, std::numeric_limits<float>::quiet_NaN(),
              static_cast<uint32_t>(start + 15010U));
  check(!wrap.isOn(), "NaN rain fails closed");
}

void testFreshness() {
  check(classifyWeather(false, false, 0, 0, 1000) == WeatherState::Unknown,
        "Never updated is UNKNOWN");
  check(classifyWeather(true, true, 100, 1099, 1000) == WeatherState::Valid,
        "Before expiry VALID");
  check(classifyWeather(true, true, 100, 1100, 1000) == WeatherState::Stale,
        "At expiry STALE");
  check(classifyWeather(false, true, 100, 200, 1000) == WeatherState::Unknown,
        "API failure invalidates previous success");
  check(classifyWeather(true, true, UINT32_MAX - 100, 899, 1000) == WeatherState::Stale,
        "Freshness handles millis rollover");
}

// Kiểm thử cuối GĐ2: chạy chính controller, clock/dự báo ở đây là SIMULATED.
// Không được xem các dòng này là log GPIO hay runtime Wokwi.
void traceFinal(const char *source, uint32_t ms, float soil, float rain,
                const PumpController &pump) {
  std::printf("[%s] ms=%u soil=%.1f%% rain=%.1f%% WEATHER=VALID pump=%s reason=%s\n",
              source, static_cast<unsigned>(ms), soil, rain, pump.isOn() ? "ON" : "OFF",
              pump.reasonText());
}

void testFinalPhase2() {
  constexpr float soil = 22.5F;
  PumpController dry;
  dry.update(soil, true, WeatherState::Valid, 20, 100);
  check(dry.isOn(), "Final Test1 SIMULATED dry22.5 rain20 starts");
  traceFinal("NATIVE SIMULATED Test1", 100, soil, 20, dry);
  dry.update(soil, true, WeatherState::Valid, 20, 10099);
  check(dry.isOn(), "Final Test1 running at elapsed9999");
  dry.update(soil, true, WeatherState::Valid, 20, 10100);
  check(!dry.isOn() && dry.reason() == PumpReason::RuntimeLimit,
        "Final Test1 shuts off exactly at elapsed10000");
  traceFinal("NATIVE SIMULATED Test1", 10100, soil, 20, dry);
  bool offThroughoutCooldown = true;
  for (uint32_t ms = 10101; ms < 15100; ++ms) {
    dry.update(soil, true, WeatherState::Valid, 20, ms);
    offThroughoutCooldown = offThroughoutCooldown && !dry.isOn() &&
                           dry.reason() == PumpReason::Cooldown;
  }
  check(offThroughoutCooldown, "Final Test1 OFF for every millisecond before cooldown5000");
  traceFinal("NATIVE SIMULATED Test1", 15099, soil, 20, dry);
  dry.update(soil, true, WeatherState::Valid, 20, 15100);
  check(dry.isOn(), "Final Test1 can restart at cooldown5000");
  traceFinal("NATIVE SIMULATED Test1", 15100, soil, 20, dry);

  PumpController rain;
  rain.update(soil, true, WeatherState::Valid, 85, 0);
  check(!rain.isOn() && rain.decision() == IrrigationDecision::Postponed &&
        rain.reason() == PumpReason::RainExpected, "Final Test2 dry22.5 rain85 postpones");
  traceFinal("NATIVE SIMULATED Test2", 0, soil, 85, rain);
  rain.update(soil, true, WeatherState::Valid, 20, 100);
  check(rain.isOn(), "Final Test2 changing85 to20 permits start");
  traceFinal("NATIVE SIMULATED Test2", 100, soil, 20, rain);
  rain.update(soil, true, WeatherState::Valid, 85, 200);
  check(!rain.isOn() && rain.reason() == PumpReason::RainExpected,
        "Final Test2 changing20 to85 stops pump before runtime limit");
  traceFinal("NATIVE SIMULATED Test2", 200, soil, 85, rain);
  rain.update(soil, true, WeatherState::Valid, 20, 5199);
  check(!rain.isOn() && rain.reason() == PumpReason::Cooldown,
        "Final Test2 rain stop also enforces4999ms cooldown");
  rain.update(soil, true, WeatherState::Valid, 20, 5200);
  check(rain.isOn(), "Final Test2 rain stop cooldown completes at5000ms");
}

void testClockGate() {
  check(!TimeSync::isReady(0, false), "Boot epoch1970 cannot enable TLS");
  check(!TimeSync::isReady(0, true), "Callback with invalid epoch cannot enable TLS");
  check(!TimeSync::isReady(Config::MIN_VALID_UNIX_TIME - 1, true), "Epoch below minimum rejected");
  check(!TimeSync::isReady(1792523154, false), "Plausible epoch without SNTP confirmation rejected");
  check(TimeSync::isReady(1792523154, true), "Actual SNTP confirmation with plausible UTC enables TLS");
  check(TimeSync::isReady(Config::MIN_VALID_UNIX_TIME, true), "Minimum valid UTC boundary accepted");
  check(!TimeSync::isReady(Config::MAX_VALID_UNIX_TIME, true), "Implausible future clock rejected");

  using TimeState = TimeSync::State;
  check(TimeSync::classify(0, false, false, 0) == TimeState::NotStarted,
        "Before WiFi no NTP attempt is reported failed");
  check(TimeSync::classify(0, false, true, 0) == TimeState::Waiting,
        "Fresh boot waits normally, not TIMEOUT");
  check(TimeSync::classify(0, false, true, Config::NTP_RESPONSE_TIMEOUT_MS - 1) == TimeState::Waiting,
        "NTP waits until exact timeout boundary");
  check(TimeSync::classify(0, false, true, Config::NTP_RESPONSE_TIMEOUT_MS) == TimeState::TimedOut,
        "NTP response budget expired is distinct from startup waiting");
  check(TimeSync::classify(1792523154, false, true, 100) == TimeState::ClockUnconfirmed,
        "Plausible epoch cannot substitute for missing callback");
  check(TimeSync::classify(1792523154, false, true, Config::NTP_RESPONSE_TIMEOUT_MS) == TimeState::TimedOut,
        "Unconfirmed plausible clock also times out");
  check(TimeSync::classify(0, true, true, 100) == TimeState::InvalidEpoch,
        "Callback with bad epoch is diagnosed separately");
  check(TimeSync::classify(1792523154, true, true, Config::NTP_RETRY_INTERVAL_MS) == TimeState::Ready,
        "Late genuine callback recovers without changing TLS gate");
  check(TimeSync::classify(1792523154, false, true, 0) == TimeState::ClockUnconfirmed,
        "New boot does not inherit callback proof from prior boot");
  check(TimeSync::classify(0, false, true, 0) == TimeState::Waiting,
        "Retry starts a fresh response budget");
  const uint32_t ntpStart = UINT32_MAX - 100;
  check(TimeSync::classify(0, false, true, static_cast<uint32_t>(ntpStart +
          Config::NTP_RESPONSE_TIMEOUT_MS) - ntpStart) == TimeState::TimedOut,
        "NTP elapsed computation handles millis rollover");
  check(std::string(TimeSync::message(TimeState::Waiting)).find("TIME_WAITING_NTP") == 0 &&
        std::string(TimeSync::message(TimeState::TimedOut)).find("TIME_SYNC_TIMEOUT") == 0,
        "Weather diagnostics distinguish waiting and timeout");

  PumpController controller;
  controller.update(25, true, WeatherState::Unknown, 0, 100);
  check(!controller.isOn(), "Dry soil stays OFF while NTP blocks weather");
}

void testRequestLifecycle() {
  WeatherRequestLifecycle request;
  check(request.begin(1, 10, 60000), "Queue begins after NTP; earlier uptime not charged");
  check(!request.begin(2, 10, 60001), "Cannot dispatch second request while busy");
  request.started(1, 62000);
  check(request.accepts(1, 10, 62000 + Config::WEATHER_REQUEST_DEADLINE_MS - 1),
        "Execution deadline counted from actual worker start, not enqueue");
  check(!request.accepts(1, 10, 62000 + Config::WEATHER_REQUEST_DEADLINE_MS),
        "Result at exact worker deadline rejected");
  check(!request.accepts(1, 11, 63000), "Result from old WiFi session rejected");
  check(!request.finish(99) && request.busy(), "Wrong result ID cannot release active slot");
  request.cancel(64000);
  check(!request.accepts(1, 10, 64001), "Late successful result cannot revive cancelled request");
  check(!request.begin(2, 11, 64002), "Cancelled request still owns worker slot until retirement");
  check(!request.needsRecovery(64000 + Config::WEATHER_RECOVERY_GRACE_MS - 1),
        "Recovery grace does not reboot early");
  check(request.needsRecovery(64000 + Config::WEATHER_RECOVERY_GRACE_MS),
        "Wedged worker requests bounded recovery");
  check(request.finish(1) && !request.busy(), "Worker completion releases cancelled request");
  check(!request.needsRecovery(200000), "Clean cancellation does not require reboot");
  check(request.begin(2, 11, 200000), "Next request allowed only after previous finishes");
  request.started(2, 200001);
  check(!request.accepts(1, 10, 200002), "Stale generation cannot affect replacement request");
  check(!request.finish(1) && request.busy(), "Stale completion cannot clear replacement");

  WeatherRequestLifecycle queue;
  queue.begin(3, 20, 1000);
  check(queue.deadline(1000 + Config::WEATHER_QUEUE_TIMEOUT_MS) == RequestDeadline::Queue,
        "No worker start produces queue timeout, not HTTP timeout");
  queue.started(3, 1000 + Config::WEATHER_QUEUE_TIMEOUT_MS);
  check(!queue.accepts(3, 20, 7000), "Worker starting after queue deadline stays rejected");

  WeatherRequestLifecycle wrap;
  const uint32_t start = UINT32_MAX - 100;
  wrap.begin(4, 30, start);
  wrap.started(4, static_cast<uint32_t>(start + 50U));
  check(wrap.accepts(4, 30, 100), "Request timing survives millis rollover");
  check(wrap.deadline(static_cast<uint32_t>(start + 50U + Config::WEATHER_REQUEST_DEADLINE_MS))
            == RequestDeadline::Worker, "Worker deadline survives rollover");
}

void testIoBudget() {
  WeatherRetryPolicy retry;
  check(retry.interval(false) == Config::WEATHER_RETRY_INTERVAL_MS,
        "Normal errors keep existing retry interval");
  retry.completed(false, true);
  check(retry.interval(false) == 5000, "First TLS socket failure retries after5s");
  retry.completed(false, true);
  check(retry.interval(false) == 15000, "Second TLS socket failure backs off15s");
  for (int i = 0; i < 300; ++i) { retry.completed(false, true); }
  check(retry.interval(false) == Config::WEATHER_RETRY_INTERVAL_MS,
        "Persistent socket failures cap retry rate without counter overflow");
  retry.completed(true, false);
  check(retry.interval(true) == Config::WEATHER_UPDATE_INTERVAL_MS,
        "Success restores normal15minute update schedule");
  retry.completed(false, true);
  check(retry.interval(false) == 5000, "Success resets transient failure streak");
  retry.completed(false, false);
  check(retry.interval(false) == Config::WEATHER_RETRY_INTERVAL_MS,
        "Certificate timeout cancellation or JSON errors never use fast retry");

  check(Config::TLS_HANDSHAKE_TIMEOUT_SECONDS * 1000UL > 35980,
        "TLS budget covers observed Wokwi 35980ms crypto progress, not old 30s");
  check(Config::TLS_HANDSHAKE_TIMEOUT_SECONDS <= 60,
        "TLS budget remains finite and at most 60 seconds");
  check(Config::WEATHER_DNS_TIMEOUT_MS + Config::HTTP_CONNECT_TIMEOUT_MS +
            Config::TLS_HANDSHAKE_TIMEOUT_SECONDS * 1000UL + Config::HTTP_READ_TIMEOUT_MS <
            Config::WEATHER_REQUEST_DEADLINE_MS,
        "Worker budget still covers configured DNS TCP TLS and HTTP idle phase");
  WeatherIoPolicy idle(1, 0);
  check(idle.check(20000, 1) == NetworkFailure::None, "HTTP idle clock not started during TLS");
  idle.beginHttp(30000);
  check(idle.check(30000 + Config::HTTP_READ_TIMEOUT_MS - 1, 1) == NetworkFailure::None,
        "Stalled body allowed until configured idle timeout");
  check(idle.check(30000 + Config::HTTP_READ_TIMEOUT_MS, 1) == NetworkFailure::HttpTimeout,
        "Stalled HTTP body times out even while TCP remains open");

  WeatherIoPolicy progress(2, 0);
  progress.beginHttp(30000);
  progress.activity(40000);
  check(progress.check(50000, 2) == NetworkFailure::None, "Real body progress renews idle budget");
  check(progress.check(50000, 0) == NetworkFailure::Cancelled, "Cancellation stops active body I/O");
  progress.activity(Config::WEATHER_REQUEST_DEADLINE_MS - 1);
  check(progress.check(Config::WEATHER_REQUEST_DEADLINE_MS, 2) == NetworkFailure::WorkerDeadline,
        "Trickle data cannot extend total worker deadline indefinitely");

  const uint32_t start = UINT32_MAX - 1000;
  WeatherIoPolicy wrap(3, start);
  wrap.beginHttp(start);
  check(wrap.check(static_cast<uint32_t>(start + Config::HTTP_READ_TIMEOUT_MS), 3)
            == NetworkFailure::HttpTimeout, "HTTP idle timeout handles millis rollover");
}

// Fixture CHỈ dùng cho unit test, không đi vào firmware hay log thời tiết thật.
const char *fixture = R"JSON({
  "current_units":{"time":"unixtime","temperature_2m":"\u00b0C","relative_humidity_2m":"%"},
  "current":{"time":1792519200,"temperature_2m":29,"relative_humidity_2m":70},
  "hourly_units":{"time":"unixtime","precipitation_probability":"%","precipitation":"mm"},
  "hourly":{"time":[1792519200,1792522800,1792526400],
    "precipitation_probability":[10,85,20],"precipitation":[0.1,1.2,0.3]}
})JSON";

bool parse(const std::string &json, WeatherData &weather) {
  char error[160];
  return parseWeatherJson(json.data(), json.size(), 1792519500,
                           weather, error, sizeof(error));
}

std::string encode(const JsonDocument &document) {
  std::string json;
  serializeJson(document, json);
  return json;
}

void testParser() {
  WeatherData data;
  check(parse(fixture, data), "Valid JSON accepted");
  check(data.maxRainProbabilityPercent == 85, "Maximum uses all three hours");
  check(data.hasPrecipitation && std::fabs(data.totalPrecipitationMm - 1.6F) < 0.001F,
        "Precipitation sums all three slots");
  check(data.hasCurrentConditions && data.temperatureC == 29 && !data.simulated,
        "Real values/source preserved");
  check(!parse("{broken", data), "H: malformed JSON rejected");
  check(!data.hasCurrentConditions, "Error clears prior parsed output");

  JsonDocument document;
  deserializeJson(document, fixture);
  document["hourly"]["precipitation_probability"][1] = nullptr;
  check(!parse(encode(document), data), "H: null probability rejected");
  document["hourly"]["precipitation_probability"][1] = "20";
  check(!parse(encode(document), data), "String probability rejected");
  document["hourly"]["precipitation_probability"][1] = true;
  check(!parse(encode(document), data), "Bool probability rejected");
  document["hourly"]["precipitation_probability"][1] = 101;
  check(!parse(encode(document), data), "Out of range probability rejected");
  deserializeJson(document, fixture);
  document["hourly"]["precipitation_probability"].as<JsonArray>().remove(2);
  check(!parse(encode(document), data), "Less than three slots rejected");
  deserializeJson(document, fixture);
  document["current"].remove("temperature_2m");
  check(!parse(encode(document), data), "Missing temperature rejected");
  deserializeJson(document, fixture);
  document["current"]["relative_humidity_2m"] = -1;
  check(!parse(encode(document), data), "Invalid humidity rejected");
  deserializeJson(document, fixture);
  document["hourly_units"]["precipitation_probability"] = "mm";
  check(!parse(encode(document), data), "Wrong probability unit rejected");
  deserializeJson(document, fixture);
  document["hourly"]["time"][2] = 1792522800;
  check(!parse(encode(document), data), "Nonconsecutive timestamps rejected");
  deserializeJson(document, fixture);
  document["current"]["time"] = 1792500000;
  check(!parse(encode(document), data), "Old API timestamp rejected");
  deserializeJson(document, fixture);
  document["hourly"].remove("precipitation");
  check(parse(encode(document), data) && !data.hasPrecipitation,
        "Absent optional precipitation is N/A, not fabricated zero");
  deserializeJson(document, fixture);
  document["hourly"]["precipitation"][1] = nullptr;
  check(parse(encode(document), data) && !data.hasPrecipitation,
        "Partial null precipitation is N/A");
  document["hourly"]["precipitation"][1] = "abc";
  check(!parse(encode(document), data), "Malformed precipitation rejected");
  deserializeJson(document, fixture);
  document["error"] = true;
  check(!parse(encode(document), data), "API error object rejected");
}
}  // namespace

// Kịch bản GĐ3 dùng cùng controller, không cần Arduino/FreeRTOS trên PC.
#include "phase3.h"

int main(int argc, char **argv) {
  testPump();
  testFreshness();
  testParser();
  testClockGate();
  testRequestLifecycle();
  testIoBudget();
  testFinalPhase2();
  testPhase3();
  if (argc == 3) {
    std::ifstream file(argv[1]);
    check(file.good(), "Live API capture file opens");
    const std::string json((std::istreambuf_iterator<char>(file)),
                            std::istreambuf_iterator<char>());
    WeatherData data;
    char error[160];
    const bool ok = parseWeatherJson(json.data(), json.size(), std::strtoll(argv[2], nullptr, 10),
                                     data, error, sizeof(error));
    if (!ok) { std::fprintf(stderr, "Live parser: %s\n", error); }
    check(ok, "Actual Open-Meteo response accepted by production parser");
    check(!data.simulated, "Real API response is never relabeled SIMULATED");
    // Integration trên PC: JSON thật + parser thật + controller thật.
    // GPIO, Wi-Fi/NTP/TLS ESP32 và LED không được thực thi ở đây.
    PumpController live;
    const float rain = data.maxRainProbabilityPercent;
    live.update(22.5F, true, WeatherState::Valid, rain, 100);
    traceFinal("PC REAL API + NATIVE controller", 100, 22.5F, rain, live);
    if (rain >= Config::RAIN_PROBABILITY_THRESHOLD) {
      check(!live.isOn() && live.reason() == PumpReason::RainExpected,
            "Live forecast >=60 correctly blocks watering");
      std::puts("REAL API Test1: BLOCKED by actual rain forecast >=60%; no forced PASS.");
    } else {
      check(live.isOn(), "Live forecast below60 permits dry-soil watering in native controller");
      live.update(22.5F, true, WeatherState::Valid, rain, 10100);
      check(!live.isOn() && live.reason() == PumpReason::RuntimeLimit,
            "Live API integration respects10000ms runtime");
      traceFinal("PC REAL API + NATIVE controller", 10100, 22.5F, rain, live);
      live.update(22.5F, true, WeatherState::Valid, rain, 15099);
      check(!live.isOn() && live.reason() == PumpReason::Cooldown,
            "Live API integration respects4999ms cooldown");
      live.update(22.5F, true, WeatherState::Valid, rain, 15100);
      check(live.isOn(), "Live API integration permits restart at5000ms cooldown");
      traceFinal("PC REAL API + NATIVE controller", 15100, 22.5F, rain, live);
    }
  }
  std::printf("PASS: %d checks (pump, parser, SNTP, request lifecycle, cancellation, I/O budgets)\n", checks);
  return 0;
}
