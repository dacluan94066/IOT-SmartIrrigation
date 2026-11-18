# Báo cáo Giai đoạn 4 — SmartIrrigation Dashboard

Kiểm thử ngày 22/10/2026, giờ Việt Nam UTC+7. Chạy local trên Windows, Node.js24.16.0. Không triển khai Internet, không sửa firmware ESP32.

## Kết quả bàn giao

React + TypeScript + Vite + Tailwind4 (`@tailwindcss/vite`), Recharts, Lucide, React Router. Bốn trang tiếng Việt: Tổng quan, Điều khiển tưới, Lịch sử & thống kê, Trạng thái hệ thống. Có đăng nhập, biểu đồ dữ liệu thật, phân trang/lọc thời gian tại Server, trạng thái kết nối và nhật ký ACK.

Backend thực tế đã được đọc trước khi xây giao diện, bao gồm README, PHASE3_REPORT, routes/controllers, validation, telemetry và command lifecycle. Frontend dùng schema kiểm tra response, không giả định API trả một cấu trúc khác.

## Bảng kiểm thử

| Loại | Bài kiểm thử | Kết quả thực tế | Kết luận |
|---|---|---|---|
| Cài đặt | npm install tại frontend | Hoàn tất, audit0 ở lần cài đặt | PASS |
| Build | npm run build | TypeScript và Vite8.3.5 thành công, 2625 module | PASS |
| Unit Frontend | npm test | 6/6: định dạng, dữ liệu thiếu, freshness, biểu đồ và thời gian UTC+7 | PASS — fixture, không phải Wokwi |
| Backend HTTP + SQLite | npm test | 33/33, gồm hồi quy GĐ3 và session/CSRF/Origin/idempotency/filter/logout/expiry/throttling | PASS — kiểm thử PC riêng, không phải ESP32 |
| Tích hợp live | npm run test:integration | 4/4 qua Vite5173 → Backend3001; telemetry Wokwi và ACK thật; không thấy API token/mật khẩu trong assets | PASS |
| Trình duyệt | Đăng nhập và 4 trang | Dữ liệu REAL/VALID, đất13%, nhiệt độ25,1°C, mưa4%, lượng mưa0mm | PASS |
| Wokwi / AUTO | Lệnh GUI #9 | ACK EXECUTED từ ESP32 | PASS |
| Wokwi / MANUAL_ON | Đất50,1%, xác nhận hộp thoại, GUI #10 | PENDING chưa đổi trạng thái bơm; ACK EXECUTED; telemetry sau đó BẬT/MANUAL_ON | PASS |
| Wokwi / MANUAL_OFF | GUI #11 | ACK EXECUTED, telemetry TẮT | PASS |
| Wokwi / REJECTED | Đất80,1%, GUI #12 MANUAL_ON | ACK REJECTED, lý do ngưỡng70%, bơm TẮT; hiển thị lý do tiếng Việt | PASS |
| Mất Backend | Dừng tiến trình Server thực, không ngắt trình duyệt/Wokwi | Mất Backend; giữ bản ghi cuối; sau30s ESP32 OFFLINE; cả3 nút gửi lệnh bị khóa | PASS |
| Phục hồi | Bật Server lại | Không reload/login; session còn hiệu lực; polling tự nhận dữ liệu mới, ESP32 cùng bootId | PASS |
| Responsive | 4 trang ×390/768/1440px | 12 lượt không tràn ngang trang; menu mobile hoạt động; đổi route về đầu trang | PASS |
| Thời gian GPIO chính xác | Đo độc lập xung relay10s/cooldown5s | Không đo bằng logic analyzer/UART trace trong GĐ4; firmware không đổi, chỉ hiển thị giới hạn và quan sát telemetry | CHƯA KIỂM CHỨNG LẠI |
| Thiết bị vật lý | ESP32/bơm thật | Chỉ chạy Wokwi, không có phần cứng thật | CHƯA KIỂM CHỨNG |

Không dùng telemetry giả để báo PASS tích hợp. Unit/Backend test dùng DB tạm/fixture và được phân biệt rõ. Chỉ thay giá trị potentiometer qua UI Wokwi khi kiểm thử; không sửa dây hoặc code. Đã trả potentiometer về133/1023 (~13%), MODE AUTO, DEMO_WEATHER_MODE=false sau kiểm thử.

## Bằng chứng runtime

Các lệnh dưới đây được gửi từ giao diện trình duyệt và ACK bởi firmware đang chạy Wokwi. Timestamp API là UTC; giao diện hiển thị UTC+7.

```text
#9  AUTO       created=2026-10-21T19:26:18.334Z
    EXECUTED   ack=2026-10-21T19:26:19.288Z
#10 MANUAL_ON  created=2026-10-21T19:29:29.709Z
    EXECUTED   ack=2026-10-21T19:29:30.605Z
    MANUAL_ON; van giu bao ve thoi tiet, 70%, 10 giay va cooldown
#11 MANUAL_OFF created=2026-10-21T19:29:46.119Z
    EXECUTED   ack=2026-10-21T19:29:46.912Z
    MANUAL_OFF - uu tien tat bom
#12 MANUAL_ON  created=2026-10-21T19:34:21.180Z
    REJECTED   ack=2026-10-21T19:34:22.379Z
    Do am dat da dat nguong 70%
```

Sau khi khởi động Backend lại, đọc API thật lúc `2026-10-21T19:43:36.631Z`:

```text
deviceId=esp32-01
bootId=ffb9c5e9-abf2fe13-b3711cac (không đổi qua lần dừng Backend)
sequence=610, uptimeMs=3055438
receivedAt=2026-10-21T19:43:35.246Z
soilMoisturePercent=12.99145
temperatureC=25.1, rainProbabilityPercent=4, precipitationMm=0
weatherSource=REAL, weatherStatus=VALID
weatherUpdatedAt=2026-10-21T19:36:56Z
pumpState=BAT, decision=TUOI, mode=AUTO
reason=Dat kho; tiep tuc chu ky den 70% hoac gioi han an toan
history.meta.total=601
```

Lần live test tiếp theo lấy mẫu bơm TAT trong cùng chu kỳ vận hành; đây là trạng thái thật tại các thời điểm lấy mẫu khác nhau, không ép bơm giữ ON để chụp ảnh. ACK không được dùng thay thế telemetry để suy luận bơm luôn bật. Với chu kỳ telemetry5s và polling3s, không dùng ảnh Dashboard để khẳng định độ chính xác thời gian GPIO.

Bằng chứng local (bị ignore khỏi Git, không chứa credential):

- [Ảnh tổng quan cuối](test-results/dashboard-final.png), [ACK điều khiển](test-results/control-ack.png), [ACK từ chối](test-results/rejected-ack.png).
- [Mất Backend và ESP32 offline](test-results/backend-offline.png), [tự phục hồi](test-results/backend-recovery.png).
- [Ảnh mobile](test-results/390-overview.png); ảnh4 trang ở390/768/1440 trong cùng thư mục.
- [DOM đã quan sát và số đo responsive](test-results/browser-evidence.json), [log Build/test](test-results/final-checks.txt).
- [API/SQLite trước khi dừng](../backend/test-results/phase4-before-outage.json), [sau phục hồi](../backend/test-results/phase4-after-recovery.json). Đây là đọc lại API bằng HTTP client trên PC, không phải log UART.

## Những thay đổi Backend cần thiết

Không thể dùng admin/device token trong React hoặc VITE_* vì bundle trình duyệt là công khai. Thêm lớp session riêng phía Server, tái sử dụng controller/service hiện có; không sửa quyền các route admin/device GĐ3:

- `GET/POST /api/v1/dashboard/session`, `POST /api/v1/dashboard/logout`.
- `GET /api/v1/dashboard/state`, `/history`, `/commands`; `POST /api/v1/dashboard/commands`.
- Password hash scrypt, cookie HttpOnly/SameSiteStrict, session SQLite8h, CSRF và Origin allowlist, throttle đăng nhập, idempotency hữu hạn.
- Filter lịch sử `from/to` tại SQLite để phân trang/count đúng theo khoảng thời gian. Tái sử dụng payload/trạng thái ACK GĐ3.
- Phục vụ bản Build từ `frontend/dist` và SPA fallback để demo local cùng port3001.
- Có lỗi CORS thực tế403 khi module production gửi Origin của chính Server3001; chỉ bổ sung origin loopback của Server vào allowlist. Không mở `*`, không bỏ xác thực.

Các test Backend mới bao phủ các thay đổi này. Session vẫn sống qua restart nhờ SQLite; cache idempotency chỉ ở RAM, không cam kết exactly-once qua crash.

## Danh sách file

Tạo mới toàn bộ `frontend/`:

- Cấu hình: `package.json`, `package-lock.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `.env.example`, `.gitignore`, `index.html`, `public/favicon.svg`.
- `src/main.tsx`, `App.tsx`, `index.css`.
- `src/components/{ui,PumpPanel,HistoryCharts,CommandTable}.tsx`.
- `src/layouts/DashboardLayout.tsx`.
- `src/pages/{Login,Overview,Control,History,System}.tsx`.
- `src/services/api.ts`, `src/types/api.ts`.
- `src/hooks/{usePolling.ts,useHistory.ts,useDashboard.tsx}`.
- `src/utils/{format.ts,format.test.ts}`, `test/integration.test.mjs`.
- `README.md`, `PHASE4_REPORT.md` và bằng chứng local trong `test-results/`.

Backend tạo mới: `src/middleware/dashboard.js`, `scripts/provision-dashboard.js`, `test/dashboard.test.js`.

Backend chỉnh sửa: `src/config/env.js`, `src/routes/api.js`, `src/app.js`, `src/services/validation.js`, `src/services/irrigation.js`, `package.json`, `.env.example`, `.gitignore`, `README.md`.

Cấu hình riêng local: thêm hash Dashboard vào `backend/.env`; tạo `backend/.dashboard-login` đã ignore, không thay token GĐ3. SQLite hiện có thêm bảng `dashboard_sessions` và lưu telemetry/lệnh kiểm thử thật. Root `README.md`/`.gitignore` cập nhật hướng dẫn và ignore Frontend/credential.

Không sửa `src/` ESP32, `include/Config.h`, GPIO34/26/27, `platformio.ini`, `diagram.json`, `wokwi.toml`, thuật toán tưới hoặc TLS/NTP. Đối chiếu SHA256 trước/sau của main.cpp, PumpController.cpp, BackendService.cpp và3 file cấu hình/mạch xác nhận không đổi. Không cần Build lại firmware khi chỉ thêm Web và Backend; không tuyên bố đã Build lại PlatformIO trong GĐ4.

## Giới hạn và cách chạy

**Độ ẩm không khí chưa được telemetry GĐ3 cung cấp.** Card hiển thị dấu `—` và giải thích; không tự điền0, không gọi Open-Meteo từ React, không sửa ESP32 ngoài phạm vi. Vì vậy chưa có dữ liệu thật cho chỉ số này.

Trạng thái DELIVERED/EXPIRED/SUPERSEDED được hỗ trợ và kiểm thử hợp đồng/lifecycle phía Backend; không khẳng định đã bắt được tất cả trạng thái thoáng qua đó trên GUI Wokwi trong lượt này. Chưa stress-test nhiều người dùng hoặc triển khai HTTPS public; cookie không Secure chỉ dùng loopback HTTP local.

Đọc [README](README.md) để chạy/dev/demo. Bản đã Build dùng **http://127.0.0.1:3001**, Backend phải chạy. Mật khẩu xem local trong `backend/.dashboard-login`, không ghi vào source/VITE_* và không chia sẻ. F1 → Wokwi: Start Simulator trong VS Code với firmware/mạch cũ. Chỉ bấm lệnh khi telemetry ONLINE; mọi quyết định bảo vệ cuối cùng vẫn do ESP32 thực hiện.

Khi bàn giao: Backend3001 đang chạy trên127.0.0.1, Wokwi vẫn chạy. Đã dừng tiến trình Vite dev5173 do lượt kiểm thử tạo ra; bản production3001 vẫn hoạt động. Nếu muốn chạy lại `test:integration` hoặc phát triển giao diện, mở terminal frontend và chạy `npm.cmd run dev` trước.
