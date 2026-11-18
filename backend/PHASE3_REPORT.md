# Báo cáo Giai đoạn 3 — Backend và kết nối ESP32

Ngày thực hiện: 22/10/2026, UTC+7. Chỉ GĐ3, không tạo React Dashboard.

## Kết luận

Backend Express/SQLite và firmware tích hợp đã Build, chạy kiểm thử PC và **chạy thực tế trên Wokwi extension trong VS Code**. ESP32 gửi telemetry thật qua `host.wokwi.internal:3001`; Server lưu được dữ liệu REAL/VALID. AUTO/MANUAL_ON/MANUAL_OFF và ACK đã được thực hiện. Đã tắt riêng tiến trình Backend, quan sát ESP32 vẫn điều khiển độc lập, bật lại Server và nhận dữ liệu từ cùng boot ID.

Backend hiện để chạy trên `127.0.0.1:3001`, không bind ra LAN/Internet. Firmware và núm potentiometer đã về trạng thái sử dụng bình thường: DEMO=false, núm133/1023 như đầu lượt, MODE=AUTO. Cấu hình/dây/GPIO/WeatherService/WiFiService/TLS/NTP cũ không thay đổi.

## Kết quả kiểm thử

| Test | Điều kiện / phương pháp | Kết quả thực tế | PASS/FAIL/CHƯA KIỂM CHỨNG |
|---|---|---|---|
| PlatformIO Build cuối | esp32dev, firmware REAL + Backend | SUCCESS; RAM50524/327680 (15.4%), Flash960721/1310720 (73.3%) | PASS |
| API integration trên PC | HTTP tới Express thật, SQLite file tạm thật | 20 test đạt,0 lỗi; auth/validation/CORS/body size/state/history/TTL/ACK/reboot/dedup | PASS |
| Native firmware logic | Controller/parser/policy production, clock/forecast mô phỏng | 140 checks, gồm110 trước +30 GĐ3 | PASS native |
| Health live | GET /api/v1/health | HTTP200, SQLite ok | PASS |
| PC smoke | POST mẫu đánh dấu SIMULATED/pc-smoke | Lưu SQLite, state/history lấy đúng mẫu; không gọi là ESP32 | PASS PC |
| Wokwi telemetry | ESP32 thật trong simulator → Gateway → Node/SQLite | DNS10.13.37.254, TCP OK3001, POST HTTP201, accept=yes | PASS runtime |
| REAL weather sau tích hợp | DEMO=false, HTTPS Open-Meteo hiện có | REAL/VALID,25.2°C,mưa4%,precipitation0mm được lưu lên Server | PASS runtime |
| AUTO command | Command id4, firmware cuối | ACK EXECUTED, modeAUTO | PASS runtime |
| MANUAL_ON | Đất50.1%, REAL/VALID,mưa4% | Bơm/LED bật dù AUTO không khởi động mới ở50%; ACK EXECUTED, id5 | PASS runtime |
| MANUAL_OFF | Gửi id6 khi MANUAL_ON đang bật | ACK EXECUTED, reason MANUAL_OFF - uu tien tat bom; bơm tắt | PASS runtime |
| MANUAL_ON bị từ chối | Đất80.1%, command id8 | ACK REJECTED: Do am dat da dat nguong70%; bơm/LED tắt | PASS runtime |
| Backend offline | Dừng đúng Node server LISTEN3001, không ngắt Wi-Fi | DNS vẫn OK, TCP FAIL; OFFLINE/AUTO, REAL/VALID,đất22.5%,bơm có các chu kỳ/cooldown | PASS chức năng runtime |
| Phục hồi Backend | Start lại Server, không restart ESP32 | Telemetry tiếp tục từ boot ffb9c5e9-abf2fe13-b3711cac, sequence tăng | PASS runtime |
| Mất Backend trong MANUAL_OFF | Id7 đã ACK EXECUTED, sau đó dừng Server | Quan sát MODE trở lại AUTO khi offline, không giữ manual vô hạn | PASS chức năng; không đo riêng độ trễ chính xác |
| Thời gian bảo vệ manual | Clock native: ON9999ms/OFF10000ms; cooldown4999/5000ms; rollover; server lease chỉ rút ngắn | Đạt toàn bộ checks | PASS native |
| Đo thời lượng GPIO chính xác | ON<=10000ms/OFF>=5000ms bằng logic analyzer/VCD | Chưa đo mới trong GĐ3; quan sát chu kỳ/LED không thay phép đo xung | CHƯA KIỂM CHỨNG chính xác runtime |
| Stress/soak/mất điện ở giữa GPIO và ACK | Nhiều giờ, memory fragmentation, crash injection | Chưa chạy | CHƯA KIỂM CHỨNG |

Không dùng Wokwi CLI/token, không cài Gateway mới, không sửa firewall, không mở tunnel. Điều khiển GUI dùng skill computer-use với Wokwi extension đã có sẵn. Nhãn Wi-Fi UI hiển thị Public IoT Gateway nhưng kết nối local đã được chứng minh bằng DNS/TCP/HTTP201 và bản ghi SQLite; không suy luận khả năng local chỉ từ nhãn đó.

## Bằng chứng

### Firmware / Gateway

Trích accessibility text từ Wokwi, xuống dòng lại để dễ đọc:

```text
[Backend ms=212058] HTTP=201 path=/api/v1/telemetry elapsed=185
[Backend ms=212066] RESULT id=130 HTTP=201 accept=yes stack_free=4740 heap=191720
[Backend ms=212089] DNS outcome=0 host=host.wokwi.internal ip=10.13.37.254 elapsed=7
[Backend ms=212107] TCP OK 10.13.37.254:3001 elapsed=17
[Backend ms=212235] HTTP=200 path=/api/v1/device/commands?deviceId=esp32-01&bootId=ffb9c5e9-abf2fe13-b3711cac elapsed=153
BACKEND: CONNECTED | MODE: MANUAL_OFF
Wi-Fi: CONNECTED | ADC: 921 | DO AM DAT: 22.5%
NGUON WEATHER: REAL / Open-Meteo | TRANG THAI WEATHER: VALID
MAY BOM: TAT | QUYET DINH: KHONG TUOI
NGUYEN NHAN: MANUAL_OFF - uu tien tat bom
```

Khi Server bị tắt:

```text
[Backend ms=160777] TCP FAIL 10.13.37.254:3001 elapsed=26
[Backend ms=160787] RESULT id=96 HTTP=0 accept=no stack_free=4740 heap=192092
BACKEND: OFFLINE (AUTO doc lap) | MODE: AUTO
```

Screenshot đã được quan sát trực tiếp: cùng run có WEATHER REAL/VALID,soil22.5%,mưa4%,bơmBAT/LED sáng khi BackendOFFLINE; cũng quan sát cooldown và chu kỳ tiếp theo. Không lưu screenshot/VCD thành file; accessibility snapshots không liên tục, có thể chỉ chứa một phần khung Serial. Thời điểm `at` trong file quan sát là lúc trích xuất, không phải timestamp chính xác của GPIO/hình đã thấy trước đó.

### SQLite / API readback sau phục hồi (không phải fixture)

```json
{
  "id": 88,
  "bootId": "ffb9c5e9-abf2fe13-b3711cac",
  "sequence": 41,
  "receivedAt": "2026-10-21T18:53:30.434Z",
  "deviceTimestamp": "2026-10-21T18:52:58Z",
  "soilMoisturePercent": 22.49084,
  "temperatureC": 25.2,
  "rainProbabilityPercent": 4,
  "precipitationMm": 0,
  "weatherSource": "REAL",
  "weatherStatus": "VALID",
  "pumpState": "BAT",
  "decision": "TUOI",
  "mode": "AUTO",
  "uptimeMs": 201838
}
```

Mốc Server và thiết bị không đồng nhất khi simulator chậm; database giữ cả hai, không chỉnh clock ESP32 để giả trùng. Thời tiết trong bài offline là bản REAL đã lấy trước đó, vẫn VALID theo policy GĐ2. Chưa ép một lần refresh Open-Meteo mới trong chính khoảng BackendOFFLINE.

ACK thực tế id5 MANUAL_ON: EXECUTED lúc18:51:15.604Z; id6 MANUAL_OFF: EXECUTED lúc18:51:23.807Z; id8 MANUAL_ON: REJECTED lúc18:54:51.489Z, reason đủẩm70%. Các mốc ACK là thời gian nhận Server, không phải thời gian đóng/cắt GPIO. Boot ID của firmware cuối giữ nguyên qua hai lần tắt/bật Backend.

## File bằng chứng local

Thư mục `test-results/` được ignore để không commit dữ liệu thực:

- `backend-tests.log`, `native-tests.log`, `firmware-build.log`: stdout các lệnh kiểm thử cuối.
- `wokwi-observations.json`: accessibility snapshots và đoạn Accessible View thật, không phải raw UART liên tục.
- `manual-before-lease-confirm.json`: snapshot ở revision trước bổ sung xác nhận clock Server; giữ riêng, không đánh đồng với firmware cuối.
- `final-manual.json`, `before-outage.json`, `after-recovery.json`, `manual-off-before-disconnect.json`, `second-recovery.json`, `rejected-manual-on.json`, `final.json`: đọc lại API/SQLite, không chèn telemetry mới.

`final.json` ghi121 bản ghi trong DB tại thời điểm capture; Server tiếp tục chạy nên số này sẽ tăng. Một bản ghi đầu tiên là PC smoke có bootId=pc-smoke và reason ghi rõ, không được dùng làm bằng chứng ESP32. Dữ liệu ESP32 có boot ID ngẫu nhiên khác. History API tối đa100 dòng mỗi trang; các snapshot lấy ở các mốc để giữ bằng chứng trước đó.

## API, database, cấu hình và an toàn

Xem [README Backend](README.md) cho đầy đủ endpoint, payload, Bearer token, schema2 bảng telemetry/commands, lệnh chạy và chẩn đoán DNS/TCP/HTTP. Endpoint ACK chuẩn là `/api/v1/device/commands/:id/ack` (dấu `//ack` trong yêu cầu được hiểu là vị trí command ID).

Không có secret hardcode trong file chia sẻ: `npm run provision` sinh `.env` và `include/BackendLocal.h` local/ignored. Firmware binary vẫn chứa device token theo thiết kế token đơn giản, không chia sẻ binary có token. CORS là allowlist và không thay thế token. Server chỉ nhận một DEVICE_ID theo cấu hình.

Worker Backend không chặn loop10ms, chỉ có một task/HTTP request tại một thời điểm. Response trễ/cancel/session cũ bị loại. Khi offline chỉ giữ snapshot mới nhất, **không backfill lịch sử offline**. Manual là lease, không thay thế nút emergency-stop vật lý. Không bảo đảm exactly-once qua sự cố mất điện giữa GPIO và ACK; ưu tiên không replay lệnh đã giao cho boot cũ.

MANUAL_ON chỉ bỏ qua ngưỡng bắt đầu40%, vẫn giữ đủẩm70%,weatherVALID/mưa<60,Wi-Fi,max10s,cooldown5s. Các nhánh AUTO không thay ngưỡng/hysteresis. Không reset timer khi ON mới đến lúc đang chạy. MANUAL_OFF có ưu tiên trong lease; hết hạn/mất Backend → AUTO theo yêu cầu.

## Danh sách file tạo/sửa

Tạo mới:

- `backend/package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `README.md`, `PHASE3_REPORT.md`.
- `backend/src/config/env.js`, `routes/api.js`, `controllers/api.js`, `services/irrigation.js`, `services/validation.js`, `database/index.js`, `middleware/http.js`, `app.js`, `server.js`.
- `backend/scripts/provision-device.js`, `smoke.js`, `capture.js`; `backend/test/api.test.js`.
- `include/BackendConfig.h`, `BackendService.h`, `RemoteControl.h`; `src/BackendService.cpp`; `test/native/phase3.h`.
- File local được sinh: `backend/.env`, `include/BackendLocal.h`, `backend/data/irrigation.sqlite` (+WAL/SHM khi chạy), `backend/test-results/*`; node_modules/build artifacts không phải source chia sẻ.

Chỉnh sửa: `.gitignore`, `README.md`, `include/PumpController.h`, `src/PumpController.cpp` (hook manual có defaultAUTO), `src/main.cpp` (tích hợp dịch vụ/ACK/telemetry), `test/native/test_main.cpp` (gọi test GĐ3).

Đối chiếu SHA256 trước/sau trùng cho diagram.json, wokwi.toml, include/Config.h, src/WiFiService.cpp, src/WeatherService.cpp, src/WeatherTransport.cpp. GPIO34/26/27, DEMO=false, ngưỡng40/70/mưa60%, max10s/cooldown5s đều giữ nguyên. Không thay platformio.ini/thêm thư viện firmware.

## Chạy lại

```powershell
cd backend
npm.cmd ci
npm.cmd run provision
npm.cmd test
npm.cmd start
```

Terminal khác từ thư mục gốc: Build PlatformIO, chạy `.\test\run-native-tests.ps1`, rồi F1 → Wokwi: Start Simulator. Theo dõi Backend HTTP201/accept=yes và dùng `node --env-file=.env scripts/smoke.js state` trong backend để đọc lại dữ liệu. Hướng dẫn lệnh điều khiển và chẩn đoán Gateway ở README; không dùng localhost trong ESP32 để trỏ về Windows.
