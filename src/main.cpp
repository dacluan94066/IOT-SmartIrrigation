#include <Arduino.h>
#include <time.h>
#include "Config.h"
#include "PumpController.h"
#include "WeatherService.h"
#include "WiFiService.h"
#include "BackendService.h"
#include "RemoteControl.h"

WiFiService wifiService;
WeatherService weatherService;
PumpController pumpController;
BackendService backendService;
RemoteControl remoteControl;
DemoSession demoSession;
uint32_t lastSerialReportAtMs = 0;
bool previousPumpState = false;
PumpReason previousReason = PumpReason::Startup;

uint16_t readSoilAdc() {
  return static_cast<uint16_t>(analogRead(Config::SOIL_SENSOR_PIN));
}

float convertAdcToMoisture(uint16_t adcValue) {
  // Dữ liệu giả lập, chưa phải cảm biến độ ẩm đã hiệu chuẩn.
  const uint16_t adc = constrain(adcValue, Config::ADC_DRY, Config::ADC_WET);
  return static_cast<float>(adc - Config::ADC_DRY) * 100.0F /
         static_cast<float>(Config::ADC_WET - Config::ADC_DRY);
}

void handleDemoCommands() {
  // Giới hạn input mỗi vòng để Serial không chiếm vòng điều khiển.
  for (uint8_t i = 0; i < 16 && Serial.available(); ++i) {
    const char command = static_cast<char>(Serial.read());
    if (command == '\r' || command == '\n' || command == ' ') { continue; }
    if (!Config::DEMO_WEATHER_MODE) {
      Serial.println("[Demo] Dang TAT. Bat DEMO_WEATHER_MODE trong include/Config.h de dung lenh.");
    } else if (command == '1') {
      weatherService.selectDemoRain(20);
    } else if (command == '2') {
      weatherService.selectDemoRain(85);
    } else if (command == 'x' || command == 'X') {
      weatherService.simulateUnavailable();
    } else {
      Serial.println("[Demo / SIMULATED] 1: mua 20%; 2: mua 85%; x: UNKNOWN.");
    }
  }
}

void applyPumpOutputs() {
  const bool on = pumpController.isOn();
  digitalWrite(Config::RELAY_PIN, on ? HIGH : LOW);
  digitalWrite(Config::PUMP_LED_PIN, on ? HIGH : LOW);
  if (on != previousPumpState) {
    Serial.printf("[%s] %s\n", on ? "BAT DAU TUOI" : "DUNG TUOI",
                  pumpController.reasonText());
    if (!on) { Serial.println("[Bom] Cho 5 giay truoc khi duoc bat lai."); }
    previousPumpState = on;
  } else if (pumpController.reason() != previousReason) {
    Serial.printf("[Quyet dinh] %s - %s\n", pumpController.decisionText(),
                  pumpController.reasonText());
  }
  previousReason = pumpController.reason();
}

void printLocalTime(int64_t epoch) {
  if (epoch < Config::MIN_VALID_UNIX_TIME) {
    Serial.print("N/A (chua dong bo gio)");
    return;
  }
  // UTC+7 rõ ràng, không phụ thuộc timezone máy tính chạy Wokwi.
  const time_t localEpoch = static_cast<time_t>(epoch + Config::LOCAL_UTC_OFFSET_SECONDS);
  struct tm localTime;
  gmtime_r(&localEpoch, &localTime);
  char formatted[32];
  strftime(formatted, sizeof(formatted), "%Y-%m-%d %H:%M:%S UTC+7", &localTime);
  Serial.print(formatted);
}

void printSystemStatus(uint16_t adcValue, float soilPercent, uint32_t nowMs) {
  const WeatherState state = demoSession.active() ? WeatherState::Valid : weatherService.state(nowMs);
  const WeatherData weather = demoSession.active() ? demoSession.weather() : weatherService.data();
  Serial.println("\n---------- SMART IRRIGATION - GIAI DOAN 3 ----------");
  Serial.printf("BACKEND: %s | MODE: %s\n",backendService.healthy(nowMs)?"CONNECTED":"OFFLINE (AUTO doc lap)",remoteControl.modeName());
  Serial.printf("Wi-Fi: %s | ADC: %u | DO AM DAT: %.1f%%\n",
                wifiService.connected() ? "CONNECTED" : "DISCONNECTED",
                static_cast<unsigned int>(adcValue), soilPercent);
  Serial.printf("NGUON WEATHER: %s | TRANG THAI WEATHER: %s\n",
                weather.simulated || Config::DEMO_WEATHER_MODE ? "SIMULATED" : "REAL / Open-Meteo",
                weatherStateName(state));
  if (demoSession.active()) Serial.printf("[WEB DEMO] SIMULATED | soil=%.1f%% | raw=%.1f%% | remaining=%lu ms\n",soilPercent,convertAdcToMoisture(adcValue),static_cast<unsigned long>(demoSession.remaining(nowMs)));
  if (state == WeatherState::Valid) {
    if (weather.hasCurrentConditions) {
      Serial.printf("NHIET DO: %.1f C | DO AM KHONG KHI: %.1f%%\n",
                    weather.temperatureC, weather.relativeHumidityPercent);
    } else {
      Serial.println("NHIET DO: N/A | DO AM KHONG KHI: N/A (demo chi gia lap xac suat mua)");
    }
    Serial.printf("XAC SUAT MUA CAO NHAT 3 MOC GIO: %.1f%%\n",
                  weather.maxRainProbabilityPercent);
    if (weather.hasPrecipitation) {
      Serial.printf("TONG LUONG MUA 3 MOC DU BAO: %.2f mm\n", weather.totalPrecipitationMm);
    } else {
      Serial.println("LUONG MUA: N/A (khong co du lieu day du)");
    }
    Serial.print("CAP NHAT THANH CONG LUC: ");
    printLocalTime(weather.updatedAtEpoch);
    Serial.printf(" | Uptime: %lu ms | Tuoi du lieu: %lu s\n",
                  static_cast<unsigned long>(weather.updatedAtMs),
                  static_cast<unsigned long>((nowMs - weather.updatedAtMs) / 1000));
    if (!weather.simulated) {
      Serial.print("KHOANG MOC DU BAO: ");
      printLocalTime(weather.forecastStartEpoch);
      Serial.print(" -> ");
      printLocalTime(weather.forecastEndEpoch);
      Serial.println();
    }
  } else {
    Serial.println("NHIET DO: N/A | XAC SUAT MUA: N/A | LUONG MUA: N/A");
    Serial.println("KHONG CO DU LIEU THOI TIET - TAM DUNG TUOI");
    Serial.printf("LOI WEATHER: %s\n", state == WeatherState::Stale
                      ? "Du lieu qua han; khong duoc phep dieu khien bom"
                      : weatherService.lastError());
  }
  Serial.printf("MAY BOM: %s | QUYET DINH: %s\nNGUYEN NHAN: %s\n",
                pumpController.isOn() ? "BAT" : "TAT",
                pumpController.decisionText(), pumpController.reasonText());
}

void setup() {
  // Bơm OFF trước khi khởi tạo dịch vụ mạng.
  digitalWrite(Config::RELAY_PIN, LOW);
  digitalWrite(Config::PUMP_LED_PIN, LOW);
  pinMode(Config::RELAY_PIN, OUTPUT);
  pinMode(Config::PUMP_LED_PIN, OUTPUT);
  pinMode(Config::SOIL_SENSOR_PIN, INPUT);
  analogReadResolution(12);
  Serial.begin(115200);
  Serial.println("\n=== SMART IRRIGATION - GIAI DOAN 3 ===");
  Serial.println("ADC 0 = 0% (kho); ADC 4095 = 100% (am). Bom mac dinh TAT.");
  Serial.printf("WEATHER MODE: %s\n", Config::DEMO_WEATHER_MODE ? "SIMULATED" : "REAL / Open-Meteo");
  if (!weatherService.begin()) {
    Serial.printf("[Weather] %s\n", weatherService.lastError());
  }
  wifiService.begin(millis());
  backendService.begin();
  lastSerialReportAtMs = millis() - Config::SERIAL_REPORT_INTERVAL_MS;
}

void loop() {
  wifiService.update(millis());
  handleDemoCommands();
  weatherService.update(wifiService.connected(), wifiService.session(), millis());
  const uint16_t adc = readSoilAdc();
  const float rawSoilPercent = convertAdcToMoisture(adc);
  const uint32_t nowMs = millis();
  backendService.update(wifiService.connected(),wifiService.session(),nowMs);
  remoteControl.update(wifiService.connected() && backendService.healthy(nowMs),nowMs);
  demoSession.update(wifiService.connected() && backendService.healthy(nowMs),nowMs);
  uint32_t leaseId = 0, leaseRemainingMs = 0;
  const bool hasLease = backendService.takeLease(leaseId,leaseRemainingMs);
  BackendCommand command;
  const bool hasCommand = backendService.takeCommand(command);
  CommandAcceptance acceptance = CommandAcceptance::Expired;
  bool demoCommand = false;
  const char *demoReason = nullptr;
  bool blockedByDemo = false;
  if (hasCommand) {
    demoCommand = command.kind != BackendCommand::Kind::Control;
    if (demoCommand) {
      acceptance = remoteControl.receiveDemo(command.id,command.kind==BackendCommand::Kind::DemoStop,command.remainingMs,nowMs);
      if (acceptance == CommandAcceptance::Accepted) {
        if (command.kind == BackendCommand::Kind::DemoStop) {
          demoSession.stop(); demoReason="DEMO_STOPPED: tro ve du lieu that";
        } else if (Config::REMOTE_DEMO_ENABLED && demoSession.activate(command.id,command.soilPercent,command.rainPercent,command.remainingMs,nowMs,time(nullptr))) {
          demoReason="DEMO_APPLIED: SIMULATED, AUTO; giu bao ve 70%, mua, 10s va cooldown";
        } else { demoReason="DEMO_NOT_SUPPORTED"; }
      }
    } else {
      blockedByDemo = demoSession.active() && command.mode != PumpMode::ManualOff;
      acceptance = remoteControl.receive(command.id,blockedByDemo ? PumpMode::Auto : command.mode,command.remainingMs,nowMs);
      if (acceptance==CommandAcceptance::Accepted && command.mode==PumpMode::ManualOff) demoSession.stop();
    }
  }
  // Cùng một response có thể chứa lệnh demo mới và lease ID mới.
  // Áp dụng lệnh trước, rồi kiểm tra lease: không hủy nhầm phiên khi chỉ đổi giá trị.
  if (hasLease) {
    remoteControl.confirmLease(leaseId,leaseRemainingMs,nowMs);
    demoSession.confirmLease(leaseId,leaseRemainingMs,nowMs);
  }
  // Thoát/hết hạn/mất Backend: OFF ít nhất một vòng, ghi cooldown trước AUTO thật.
  const bool demoEnded = demoSession.takeEnded();
  if (demoEnded) Serial.println("[WEB DEMO] ENDED: tro ve du lieu that; dung chu ky demo va giu cooldown");
  const float soilPercent = demoSession.active() ? demoSession.soil() : rawSoilPercent;
  const WeatherData effectiveWeather = demoSession.active() ? demoSession.weather() : weatherService.data();
  const WeatherState effectiveState = demoSession.active() ? WeatherState::Valid : weatherService.state(nowMs);
  pumpController.update(soilPercent, wifiService.connected(),
                        effectiveState,effectiveWeather.maxRainProbabilityPercent,nowMs,
                        demoEnded ? PumpMode::ManualOff : remoteControl.mode());
  applyPumpOutputs();
  if (hasCommand) {
    const bool executed = acceptance == CommandAcceptance::Accepted && !blockedByDemo &&
                          (demoCommand ? demoReason && strcmp(demoReason,"DEMO_NOT_SUPPORTED") &&
                            (command.kind!=BackendCommand::Kind::DemoSet || (demoSession.active() && demoSession.id()==command.id))
                           : command.mode != PumpMode::ManualOn || pumpController.isOn());
    const char *reason = acceptance == CommandAcceptance::Duplicate ? "DUPLICATE_NOT_REEXECUTED" :
                         acceptance == CommandAcceptance::OffPriority ? "MANUAL_OFF_PRIORITY" :
                         acceptance == CommandAcceptance::Expired ? "COMMAND_EXPIRED" : blockedByDemo ? "DEMO_ACTIVE: thoat demo truoc" : demoCommand ? (demoReason ? demoReason : "DEMO_REJECTED") : pumpController.reasonText();
    backendService.acknowledge(command.id,executed,reason);
    Serial.printf("[Command ms=%lu] id=%lu status=%s mode=%s pump=%s reason=%s\n",static_cast<unsigned long>(nowMs),static_cast<unsigned long>(command.id),executed?"EXECUTED":"REJECTED",remoteControl.modeName(),pumpController.isOn()?"BAT":"TAT",reason);
  }
  // MANUAL_ON chỉ một chu kỳ: không tự bật lại vì lease/HTTP retry còn hiệu lực.
  if (remoteControl.mode() == PumpMode::ManualOn && !pumpController.isOn()) remoteControl.finishManualOn();
  backendService.publish(soilPercent,effectiveWeather,effectiveState,pumpController,remoteControl.modeName(),nowMs,rawSoilPercent,demoSession,demoEnded);
  if (weatherService.recoveryRequired() && !pumpController.isOn()) {
    // Không xóa ngang task TLS vì có thể làm rò RAM/khóa nội bộ.
    // UNKNOWN đã đi qua controller và GPIO đã OFF trước khi phục hồi toàn bộ ESP32.
    Serial.println("[RECOVERY] Bom da OFF; reboot de thu hoi worker mang bi ket.");
    ESP.restart();
    return;
  }
  if (nowMs - lastSerialReportAtMs >= Config::SERIAL_REPORT_INTERVAL_MS) {
    lastSerialReportAtMs = nowMs;
    printSystemStatus(adc, soilPercent, nowMs);
  }
  // Nhường CPU cho WiFi/HTTPS; không chờ kết nối hay HTTP trong loop().
  vTaskDelay(pdMS_TO_TICKS(Config::CONTROL_INTERVAL_MS));
}
