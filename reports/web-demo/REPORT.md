# Demo kịch bản tưới trên Web — 19/11/2026

## Kết luận

**READY cho demo local trên Wokwi.** Đã chạy Web → Backend → ESP32 → ACK → telemetry với các đầu vào mô phỏng, không chèn telemetry giả vào SQLite thật để báo PASS. Open-Meteo thật vẫn chạy riêng. Không thay GPIO34/26/27, sơ đồ dây, `platformio.ini`, `wokwi.toml` hoặc thuật toán trong `PumpController.cpp`.

Đây là báo cáo tính năng demo mới, không thay thế hay cộng lại thống kê kiểm thử Giai đoạn 5 trước đó. Chưa kiểm tra phần cứng thật, độ chính xác thời gian GPIO hoặc chạy ổn định 15 phút cho tính năng mới.

## Cách sử dụng

Mở `http://127.0.0.1:3001/dieu-khien` và Ctrl+F5 để lấy bundle mới. Backend và Wokwi cần đang chạy, ESP32 ONLINE. Bật chế độ demo, xác nhận rồi chọn một trong bốn kịch bản; hoặc kéo đất/xác suất mưa rồi bấm Áp dụng. Kéo thanh chưa gửi lệnh. Chờ ACK và dữ liệu ESP32, không suy luận bơm BẬT từ HTTP201.

Nút Thoát demo trở về dữ liệu thật. Mỗi lần áp dụng hết hạn sau tối đa 60 giây, không tự gia hạn; mất Backend cũng hủy demo. Firmware dừng chu kỳ demo và giữ cooldown trước khi tiếp tục AUTO thật. AUTO thật có thể bật bơm lại nếu đất/thời tiết thật cho phép. Đây không phải lệnh khóa bơm vô thời hạn.

Thanh mưa là xác suất %, vì controller dùng ngưỡng 60%. Không giả lập mm, nhiệt độ hoặc độ ẩm không khí. Các trường thiếu được giữ null/hiển thị `—`. Mọi dữ liệu demo được gắn SIMULATED; potentiometer gốc vẫn đọc và gửi riêng.

## Kiểm thử tự động

| Nhóm | Kết quả | Phạm vi bằng chứng |
|---|---|---|
| Backend Node test | PASS — 45/45, 0 fail | API HTTP, session/CSRF, validation, ID/TTL/ACK, OFF priority, firmware capability, migration v1→v2 bằng DB tạm; không phải Wokwi |
| Frontend Vitest | PASS — 8/8 | Schema tương thích, định dạng, phân biệt nguồn và countdown không gia hạn từ telemetry cũ |
| C++ native | PASS — 177 checks | Controller production, demo session, rollover/expiry/loss, duplicate/lease, hysteresis, runtime limit/cooldown; clock/đầu vào mô phỏng |
| Frontend TypeScript + Vite Build | PASS | Bundle production đã được Backend phục vụ và mở kiểm thử qua trình duyệt |
| PlatformIO ESP32 Build | PASS | esp32dev/Arduino; RAM 50.572/327.680 bytes, flash 969.017/1.310.720 bytes |

Log lưu cùng báo cáo hoặc trong `evidence/`. Số test các nhóm có đơn vị khác nhau, không cộng thành một tổng PASS duy nhất.

## Runtime thực tế trên Wokwi

Firmware cuối được nạp trên boot `0efc19d8-6e1c0894-66e1b4f1`; bảng dưới dùng kết quả sau khi sửa lỗi lease lúc đổi preset. Timestamp SQLite là UTC; giao diện hiển thị UTC+7. Không dùng kết quả bản thử đầu #25–27 làm bằng chứng cho bản cuối.

| Test | Điều kiện và bằng chứng | Kết quả |
|---|---|---|
| Bật demo đất khô | Lệnh #28/#30/#33, đất 22%, mưa 20%, SIMULATED/VALID; ACK EXECUTED, Web và telemetry bơm BAT | PASS |
| Đất 50% khi đang tắt | Lệnh #29, soil 50/rain20; không bắt đầu chu kỳ mới | PASS |
| Hysteresis khi đang chạy | #30→#31: row2454 uptime102360 soil22 BAT; row2455 uptime104348 soil50 BAT; row2456 uptime109348 soil50 BAT | PASS |
| Không reset timer khi đổi đầu vào | Row2457 uptime112370 TAT, reason `Dat gioi han chay bom 10 giay`, dù #31 vừa đổi soil50 | PASS theo telemetry; chưa đo GPIO |
| Cooldown | #35: row2493 uptime280941 TAT/runtime10s; row2494 uptime285947 BAT, chênh5006ms; native kiểm biên4999/5000ms | PASS theo telemetry + native; chưa đo GPIO |
| Đất quá ẩm | #32 soil80/rain20, ACK EXECUTED; bơm TAT, lý do đạt70% | PASS |
| Mưa cao dừng bơm đang chạy | #33 soil22/rain20 Web BẬT → #34 soil22/rain85 ACK EXECUTED, TAT/TAM_HOAN, lý do dự báo mưa | PASS |
| Hết hạn không tự gia hạn | #34 expires18:19:31.100Z; row2482 tại18:20:05.241Z demoActive=false, soil/raw50.06105, REAL/VALID, AUTO/TAT | PASS cho kết thúc phiên; không đo chính xác thời điểm GPIO |
| Mất Backend/phục hồi | #35 expires18:21:47.600Z; tắt Backend có giới hạn và khởi động lại, row2496 tại18:21:39.092Z đã demoActive=false/REAL/TAT trên cùng boot, trước hạn lệnh | PASS cho fallback và phục hồi; chưa đo đúng độ trễ dừng trong lúc mất Server |
| Thoát bằng nút Web | #36 đất80/rain20 đang demo → #37 DEMO_STOP ACK EXECUTED18:26:19.004Z; UI mất banner, về AUTO/TAT/dữ liệu thật | PASS |
| Hộp thoại và bàn phím | Bật demo phải xác nhận; Escape đóng hộp thoại và chưa gửi; thanh đất chỉnh bằng phím đến80% | PASS |
| Responsive | Kiểm tra390×844,768×1024,1440×1000 không tràn ngang; đã quan sát hình desktop/mobile, reset viewport sau kiểm thử | PASS |
| MANUAL_OFF đồng thời DEMO_STOP | Đã có test API và native; chưa gửi cặp lệnh này trên Wokwi bản cuối | NOT_RUN ở runtime |
| Demo qua reboot ESP32 | Test native/API chứng minh không khôi phục/replay; chưa reboot chủ động khi demo đang chạy | NOT_RUN ở runtime |
| Stability15phút, đo GPIO chính xác | Không chạy bài soak/VCD/logic analyzer cho thay đổi này | NOT_RUN — CHƯA KIỂM CHỨNG |

Runtime xác nhận chuỗi Web/Backend/firmware, không đồng nghĩa đã đo relay/LED vật lý hoặc độ trễ tức thời. Ảnh tại `evidence/dashboard-demo.jpg`, `evidence/mobile-demo.jpg`; capture dữ liệu chỉ chứa telemetry/lệnh, không chứa credential.

## Vấn đề phát hiện và đã sửa

Ở bản thử đầu, response poll mang lệnh demo mới và lease ID mới nhưng loop kiểm lease trước khi áp dụng lệnh. Phiên cũ bị hủy nhầm, tạo một lần dừng/cooldown khi đổi preset. Đã đổi đúng thứ tự: nhận command trước rồi xác nhận lease cùng response; thêm native regression. Runtime #30→#31 chứng minh đổi đất22→50 không làm bơm dừng nhầm, vẫn dừng đúng runtime limit.

DEMO_STOP không được supersede MANUAL_OFF đang chờ; đã sửa và có API/native regression. Bổ sung telemetry ngay khi bơm/demo thay đổi hoặc ACK để giao diện không phải chờ hoàn toàn chu kỳ gửi định kỳ. Không sửa scheduling/TLS/NTP để triển khai demo.

## Dữ liệu và cấu hình cuối

- `DEMO_WEATHER_MODE=false`, giữ dịch vụ Open-Meteo thật.
- `Config::REMOTE_DEMO_ENABLED=true` và Backend local `.env` có `REMOTE_DEMO_ENABLED=true` để người dùng demo. `.env.example` mặc định false, không có secret.
- Phiên demo đã thoát, không còn override hoạt động; AUTO, REAL/VALID, đất/raw khoảng50.1%, bơm TẮT. Backend đã được phục hồi và đang lắng nghe loopback3001.
- SQLite schema2, integrity_check=`ok`. Trước migration:2393telemetry/24commands; sau kiểm thử:2551telemetry/37commands và tiếp tục nhận dữ liệu. Không reset/xóa DB.
- Bản sao trước migration: `backend/data/irrigation.before-web-demo-1795025467107.sqlite` (local, được ignore). Migration giữ lịch sử, ID, ACK, session và sequence.
- Firmware `.pio/build/esp32dev/firmware.bin`: SHA256 `B662435EAFA240BE3B0F004C9A35B96BD39978BF9625578457B5582F3695015C`, dài975600bytes, Build từ cấu hình REAL ở trên. Không commit/chia sẻ binary có device token.
- Không thay ngưỡng40/70%, mưa60%, max10s/cooldown5s, GPIO hoặc dây Wokwi. Bản sửa CA X1+X2 của lượt trước vẫn được giữ, không vô hiệu hóa TLS.

## File thay đổi cho tính năng này

- Backend: `.env.example`, `src/app.js`, `src/config/env.js`, `src/database/index.js`, `src/middleware/dashboard.js`, `src/services/validation.js`, `src/services/irrigation.js`, `test/demo.test.js`, `README.md`. `.env` local chỉ bật cờ demo, không đổi credential.
- Firmware: mới `include/DemoSession.h`, sửa `include/Config.h`, `include/RemoteControl.h`, `include/BackendService.h`, `src/BackendService.cpp`, `src/main.cpp`.
- Frontend: mới `src/components/DemoPanel.tsx`; sửa `src/types/api.ts`, `src/services/api.ts`, `src/utils/format.ts`, `src/utils/format.test.ts`, `src/layouts/DashboardLayout.tsx`, `src/pages/Control.tsx`, `src/pages/Overview.tsx`, `src/pages/History.tsx`, `src/index.css`, `README.md`.
- Test/tài liệu: mới `test/native/web_demo.h`, sửa `test/native/test_main.cpp`, root `README.md`, báo cáo/log tại `reports/web-demo/`.

Các file CA/TLS có thay đổi từ lượt sửa trước không thuộc tính năng demo này. Mã nguồn và báo cáo được quản lý bằng Git; credential, SQLite, binary firmware và ảnh/capture local được loại khỏi bản đẩy GitHub.

## Giới hạn

Chỉ dành cho Wokwi/local có đăng nhập. Không dùng làm chế độ vận hành bơm thật. Các thao tác vẫn có độ trễ poll/HTTP/telemetry; OFF TTL không phải nút emergency-stop vật lý. Khi Backend offline không có telemetry liên tục để xác nhận thời điểm chuyển trạng thái GPIO. Worker Backend cũ vẫn có thể chậm telemetry nếu request poll bị kéo dài; bài thử lần này không chứng minh đã loại bỏ mọi tình huống nghẽn mạng. Không bổ sung buffer offline, Dashboard cloud hoặc cơ chế điều khiển phần cứng mới.
