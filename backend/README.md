# SmartIrrigation — Backend Giai đoạn 3

## Bổ sung cho Dashboard Giai đoạn 4

Đã thêm session browser, không đưa ADMIN/DEVICE token xuống React. Chạy `npm.cmd run provision-dashboard` một lần và restart Backend; mật khẩu local ở `.dashboard-login` (ignored), scrypt hash ở `.env`. Session HttpOnly/SameSite=Strict lưu hash ID trong bảng SQLite `dashboard_sessions` để còn hiệu lực qua restart. POST Dashboard yêu cầu Origin + CSRF, tạo lệnh có Idempotency-Key; token API GĐ3 không thay đổi.

Các route mới: GET/POST `/api/v1/dashboard/session`, POST `/api/v1/dashboard/logout`, GET `/api/v1/dashboard/state`, GET `/api/v1/dashboard/history`, GET/POST `/api/v1/dashboard/commands`. Lịch sử thêm query `from`/`to` ISO để lọc ở Server; các query GĐ3 cũ vẫn tương thích. Các origin loopback của chính Server được cho phép để tải module JavaScript same-origin; không dùng CORS `*`.

Sau khi Build `frontend/`, Backend có thể phục vụ Dashboard local tại http://127.0.0.1:3001. Hướng dẫn và giới hạn: [frontend/README.md](../frontend/README.md). Độ ẩm không khí vẫn chưa có trong telemetry hiện tại; không chế tạo dữ liệu và không sửa firmware ở GĐ4.

Node.js 24.16.x + Express 5 + SQLite tích hợp `node:sqlite`. Không cần cài SQLite server/native addon. SQLite API đồng bộ phù hợp một thiết bị, lưu lượng thấp của đồ án; chưa phải kiến trúc tải lớn. Chưa có React, MQTT hoặc database cloud.

[Báo cáo kiểm thử Giai đoạn 3 và bằng chứng Wokwi](PHASE3_REPORT.md).

## Chạy Backend và ESP32

Từ thư mục gốc SmartIrrigation, mở PowerShell:

```powershell
cd backend
npm.cmd ci
npm.cmd run provision
npm.cmd test
npm.cmd start
```

`provision` tạo `.env` nếu chưa có, sinh hai token ngẫu nhiên khác nhau, rồi tạo `../include/BackendLocal.h` cho firmware. Không in token. Không ghi đè `.env` có sẵn; nếu tự tạo từ `.env.example`, phải điền token >=32 ký tự trước. Đổi token/DEVICE_ID/DEVICE_BACKEND_URL thì chạy provision và Build lại. `BackendLocal.h`, `.env`, SQLite và node_modules đều được ignore. Token vẫn có trong firmware đã biên dịch: không chia sẻ `.bin/.elf` có secret.

Server mặc định chỉ bind `127.0.0.1:3001`; cấu hình từ chối bind công khai. Không tạo tunnel, port-forward router, tắt firewall hay đưa server lên Internet. HTTP có Bearer token chỉ dành cho Gateway local tin cậy, không bảo mật như HTTPS trên mạng không tin cậy. HTTPS Open-Meteo và CA/NTP cũ không bị thay đổi.

Trong VS Code, giữ Backend chạy ở terminal riêng. Chọn PlatformIO **Build** → F1 → **Wokwi: Start Simulator**. Firmware dùng `http://host.wokwi.internal:3001`, không dùng localhost ESP32. VS Code có Gateway tích hợp; không cần cài Gateway/token CLI riêng nếu Gateway hiện có đã hoạt động.

Thiếu `BackendLocal.h`: firmware vẫn Build được, Backend DISABLED, GĐ2 AUTO hoạt động độc lập. `DEMO_WEATHER_MODE` không cần bật cho GĐ3; giữ false để dùng thời tiết thật.

## API và xác thực

Tất cả response: `{ "success": true, "data": ..., "meta": ... }` hoặc `{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }`.

| Method/endpoint | Token | Chức năng |
|---|---|---|
| GET `/api/v1/health` | Không | Liveness + truy vấn SQLite |
| POST `/api/v1/telemetry` | DEVICE_API_TOKEN | Lưu snapshot, retry idempotent |
| GET `/api/v1/state?deviceId=esp32-01` | ADMIN_API_TOKEN | Snapshot nhận gần nhất hoặc null |
| GET `/api/v1/history?deviceId=esp32-01&page=1&limit=20` | ADMIN_API_TOKEN | Lịch sử giảm dần theo id, limit1–100 |
| POST `/api/v1/commands` | ADMIN_API_TOKEN | Tạo AUTO/MANUAL_ON/MANUAL_OFF |
| GET `/api/v1/commands?deviceId=esp32-01` | ADMIN_API_TOKEN | 100 lệnh gần nhất và ACK để chẩn đoán |
| GET `/api/v1/device/commands?deviceId=esp32-01&bootId=...` | DEVICE_API_TOKEN | Claim/poll lệnh còn hiệu lực |
| POST `/api/v1/device/commands/:id/ack` | DEVICE_API_TOKEN | Xác nhận thực thi hoặc từ chối |

Header: `Authorization: Bearer <token>`. ADMIN không dùng được API thiết bị và ngược lại. Một thiết bị được scope bởi DEVICE_ID trong env; ID khác bị403. Không dùng token trong query string. Request JSON tối đa8KB, chỉ nhận schema đã định nghĩa. CORS allowlist lấy từ CORS_ORIGINS, không thay thế xác thực.

### Telemetry

```json
{
  "deviceId": "esp32-01", "bootId": "random-per-boot", "sequence": 1,
  "soilMoisturePercent": 22.5, "temperatureC": 25.3,
  "rainProbabilityPercent": 4, "precipitationMm": 0,
  "weatherSource": "REAL", "weatherStatus": "VALID",
  "pumpState": "BAT", "decision": "TUOI",
  "reason": "Dat kho", "mode": "AUTO",
  "deviceTimestamp": "2026-10-21T18:44:00Z",
  "weatherUpdatedAt": "2026-10-21T18:43:55Z", "uptimeMs": 45000
}
```

Giá trị không có dùng `null`, không chế tạo số0. Khi UNKNOWN/STALE, temperature/rain/precipitation phải null; VALID bắt buộc rain0–100. Nhiệt độ nullable cho demo. Source luôn REAL/SIMULATED đúng nguồn. `deviceTimestamp` nullable trước NTP; mọi bản ghi đều có `receivedAt` UTC do server tạo. `weatherUpdatedAt` là thời điểm forecast được cập nhật, khác thời gian snapshot.

Unique `(device_id,boot_id,sequence)` chống lưu trùng khi retry. Response201 cho mới,200 + meta.duplicate cho retry. Lịch sử sắp theo thời điểm server nhận/id, không tin clock thiết bị để sắp xếp.

### Lệnh

```json
{ "deviceId": "esp32-01", "type": "MANUAL_ON", "ttlSeconds": 15 }
```

TTL1–60 giây, mặc định15. Poll trả id, remainingTtlMs, expiresAt và serverTime; `controlLease` xác nhận hạn theo clock Server ở mỗi poll, chỉ được rút ngắn lease trên ESP32, không gia hạn. Việc này tránh giữ chế độ thủ công quá lâu khi đồng hồ mô phỏng Wokwi chạy chậm hơn thời gian thực. Khi mất Server, watchdog liên lạc6s vẫn dùng millis của ESP32. ACK:

```json
{ "deviceId": "esp32-01", "bootId": "random-per-boot", "status": "EXECUTED", "reason": "MANUAL_OFF - uu tien tat bom" }
```

`EXECUTED` = đã áp dụng chế độ lên controller, không có nghĩa bơm luôn bật. MANUAL_ON bị safety chặn sẽ ACK REJECTED kèm lý do. MANUAL_ON bỏ qua riêng ngưỡng bắt đầu40%, không bỏ qua ngưỡng dừng70%, weather VALID/mưa<60, Wi-Fi, giới hạn10s hoặc cooldown5s. Không reset timer khi có lệnh ON mới lúc bơm đang chạy.

MANUAL_OFF đang hiệu lực ưu tiên AUTO/ON: Backend trả409 nếu cố thay thế trước hết lease. Mất liên lạc Backend hoặc hết lease → AUTO, vẫn giữ hysteresis và bảo vệ GĐ2. Đây là OFF tạm thời có TTL, **không phải emergency-stop vật lý giữ vô hạn**.

MANUAL_ON chỉ một chu kỳ. ID đã thấy không chạy lại, kể cả ACK lỗi; command đã giao cho boot trước không phát lại sau reboot. PENDING/DELIVERED hết TTL → EXPIRED. Lệnh mới supersede lệnh đang chờ; ACK muộn409/404 được coi là terminal, không retry vô hạn. Không bảo đảm exactly-once khi ESP32 mất điện giữa thao tác GPIO và ACK; ưu tiên không chạy lại lệnh đã giao.

## Worker và khi Backend offline

Một task HTTP riêng, một request tại một thời điểm; queue hữu hạn, không sinh worker mới khi timeout. Telemetry5s, poll2s, retry3s; connect/read1.5s, deadline tổng8s. Chỉ nhận response còn đúng request ID, Wi-Fi session và deadline. Poll thành công cấp lease liên lạc6s theo millis. MAIN không gọi DNS/TCP/HTTP, tiếp tục đọc đất/cập nhật GPIO mỗi10ms.

Ưu tiên ACK/poll trước telemetry. Khi offline, coalesce snapshot mới nhất, không giữ hàng đợi lịch sử vô hạn: có thể thiếu bản ghi trong thời gian mất kết nối. Không có durable offline buffer trong phạm vi GĐ3. Nếu worker chưa trả thì không xóa task mạng cưỡng bức và không tạo thêm task; điều khiển AUTO không phụ thuộc worker Backend.

## Kiểm thử trên PC

```powershell
npm.cmd test
node --env-file=.env scripts/smoke.js
node --env-file=.env scripts/smoke.js state
node --env-file=.env scripts/smoke.js history
node --env-file=.env scripts/smoke.js MANUAL_ON 15
node --env-file=.env scripts/smoke.js MANUAL_OFF 15
node --env-file=.env scripts/smoke.js commands
```

`smoke` ghi một mẫu PC đánh dấu SIMULATED, bootId=pc-smoke, reason=PC SMOKE ONLY; **không phải bằng chứng ESP32**. Các lệnh state/history/commands chỉ đọc; lệnh MANUAL_* thực sự gửi điều khiển cho thiết bị mô phỏng. Chỉ dùng với mạch mô phỏng/thiết bị đã kiểm tra an toàn.

Ở thư mục gốc: `.\test\run-native-tests.ps1` chạy test controller + lease; clock/weather trong native là mô phỏng, không thay thế runtime Wokwi.

## SQLite

File mặc định `backend/data/irrigation.sqlite`, WAL, busy timeout2s, schema version1. Không commit dữ liệu/token. Không tự động xóa lịch sử; cần quản lý dung lượng nếu để chạy lâu.

- `telemetry`: id, device_id, boot_id, sequence, received_at, device_timestamp, soil_moisture_percent, temperature_c, rain_probability_percent, precipitation_mm, weather_source, weather_status, pump_state, decision, reason, mode, uptime_ms, weather_updated_at. Index `(device_id,id DESC)`, unique identity mỗi snapshot.
- `commands`: id, device_id, type, created_at, expires_at, status, delivered_boot_id, delivered_at, ack_at, ack_reason. Status PENDING/DELIVERED/EXECUTED/REJECTED/EXPIRED/SUPERSEDED; index `(device_id,status,id DESC)`.

## Chẩn đoán Gateway (không đổi kiến trúc trước khi kiểm tra)

1. PC: `Invoke-RestMethod http://127.0.0.1:3001/api/v1/health`; nếu lỗi, sửa tiến trình/port/env trước.
2. Firmware phải báo DNS outcome0 cho host.wokwi.internal; DNS lỗi: kiểm tra Gateway tích hợp đang chạy cùng VS Code/project, không suy ra API Open-Meteo lỗi.
3. Có IP nhưng TCP FAIL: kiểm tra process LISTEN3001, URL/port trong BackendLocal.h, Gateway logs và firewall. Không tự mở firewall/tắt bảo mật; nếu có prompt cần người dùng xử lý.
4. HTTP401: token device/env/header lệch, provision và Build lại.403: DEVICE_ID không đúng.400: validation xem error.details.409 ACK: lệnh hết hạn/superseded/sai boot, không gọi là lỗi TLS.
5. PC localhost thành công không chứng minh Wokwi truy cập được. Chỉ xác nhận khi có log Backend HTTP201/accept=yes và bản ghi SQLite bootId firmware.

Tài liệu chính thức: [Wokwi VS Code Gateway](https://docs.wokwi.com/vscode/project-config#iot-gateway-esp32-wifi), [hostname host.wokwi.internal](https://docs.wokwi.com/guides/esp32-wifi#connecting-to-your-local-machine), [Node24 SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html).
