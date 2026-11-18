# Kế hoạch kiểm thử nghiệm thu — Giai đoạn 5

## Trạng thái chốt ngày 22/10/2026 (UTC+7)

Đã dừng thực thi theo yêu cầu người dùng. Nội dung kế hoạch bên dưới mô tả phạm vi dự kiến của lượt kiểm thử trước, **không phải cam kết đã thực hiện đầy đủ**. Lượt chốt chỉ đọc bằng chứng/cấu hình và ghi báo cáo; không khởi động Wokwi, Browser, Backend, không chạy lại test, không chờ và không sửa chức năng.

Kết quả 48 TC: **43 PASS, 0 FAIL, 2 NOT_RUN, 3 BLOCKED**. PASS chỉ có ý nghĩa ở tầng được ghi trong [TEST_CASES.md](TEST_CASES.md); không chuyển kết quả native thành kết quả GPIO/Wokwi. Các kiểm tra Build và điều kiện nghiệm thu được tổng hợp riêng, không cộng vào 48 TC.

**Kết luận: NOT READY cho bản bàn giao demo API thật hiện tại.** Nguồn đã khôi phục `DEMO_WEATHER_MODE=false`, nhưng firmware.bin còn là bản DEMO. Build khôi phục ở lượt trước bị chặn quyền PlatformIO; lượt chốt không chạy lại Build vì nguồn đã false và người dùng yêu cầu dừng. Bài ổn định chỉ ghi được 14 phút 1 giây, có gián đoạn/chuyển boot; đo GPIO chính xác chưa được xác minh. Xem [FINAL_REPORT.md](FINAL_REPORT.md).

### Quy tắc nghiệm thu cuối

- PASS: có bằng chứng đáp ứng tại tầng ghi rõ. FAIL: có bằng chứng trái kỳ vọng; không đồng nhất thiếu bằng chứng với FAIL.
- NOT_RUN: chưa thực hiện hoặc chưa có bằng chứng thực thi phù hợp. BLOCKED: không hoàn tất do công cụ/quyền/điều kiện.
- TC05/06 yêu cầu xác minh thời gian GPIO nên BLOCKED dù native kiểm tra đúng 10 giây/5 giây.
- TC10 không tính dữ liệu REAL đã có trước lượt kiểm thử là bằng chứng một lần HTTPS mới thành công trong Giai đoạn 5.
- Manifest 85 file nguồn/cấu hình khớp bản đầu lượt không chứng minh artifact biên dịch đã được khôi phục.
- Không xóa/reset SQLite. Không chỉnh GPIO, mạch, thuật toán, TLS/NTP hoặc Backend/Frontend trong lượt chốt.

## Kế hoạch ban đầu và phương pháp

Ngày bắt đầu:22/10/2026, Windows, workspace SmartIrrigation hiện tại. Chỉ kiểm thử/đánh giá, không tái cấu trúc. Báo cáo này không phải điểm số chính thức của giảng viên.

## Phạm vi và thứ tự

1. Chụp manifest SHA256 và cấu hình công khai; rà soát firmware/mạch, Backend, Dashboard, test và báo cáo cũ.
2. Build PlatformIO/Frontend, chạy native C++, Backend HTTP+SQLite và unit Frontend.
3. Kiểm thử API live bằng quyền đọc, đối chiếu SQLite read-only. Validation/load test dùng DB tạm riêng; không đẩy telemetry giả vào DB sản phẩm.
4. Quan sát Wokwi và tương tác potentiometer; kiểm tra luồng lên Web và lệnh từ Web/ACK thật.
5. Kiểm tra mất/phục hồi Backend chỉ sau khi xác minh đúng tiến trình project; không dừng tiến trình lạ. Khôi phục ngay sau phép thử.
6. Kiểm tra responsive, login/logout, dữ liệu rỗng, token bundle và polling.
7. Thu thập15phút endurance đọc telemetry thật nếu môi trường cho phép. Mọi restart/ngắt Backend chủ động được chú thích, không coi đây là đo memory leak hay stress tải lớn.
8. Ghi đủ TC01–TC48 và kịch bản E2E A–E, tồn đọng và kết luận READY/READY WITH ISSUES/NOT READY.

## Môi trường

ESP32 esp32dev Arduino/PlatformIO, potentiometer GPIO34, relay26, LED27; Wokwi VS Code, Open-Meteo HTTPS có CA/SNI và NTP. Backend Node24/Express/SQLite loopback3001; React/TS/Vite/Tailwind4, Recharts, REST polling. Không thay sơ đồ để thêm Logic Analyzer; nếu không có công cụ đo tương đương sẵn, ghi BLOCKED cho phép đo xung GPIO chính xác.

## Phân tầng bằng chứng

- NATIVE: controller/parser/clock/request policies production chạy trên PC với fixture. Không chứng minh GPIO, Wi-Fi hay TLS ESP32.
- API-ISOLATED: Express HTTP thật + SQLite DB tạm/fixture. Không phải Wokwi.
- API-LIVE/SQL: dữ liệu ESP32 thật đã nhận qua Gateway, đối chiếu DB read-only; không phải đo trực tiếp relay.
- WOKWI: Serial/UI mô phỏng chạy firmware thật, ghi boot/timestamp nếu có.
- BROWSER: DOM/ảnh và thao tác trên Dashboard thật; kiểm tra cùng dữ liệu API/SQL.
- GPIO: chỉ được dùng khi có VCD/logic analyzer đo trực tiếp; không suy từ polling/Serial.
- INHERITED: bằng chứng GĐ1–4 hoặc bản bảo trì trước lượt này, ghi riêng và không tính là chạy lại GĐ5.

## Tiêu chí

PASS chỉ khi có kiểm tra đúng kỳ vọng và bằng chứng tại tầng đã ghi. FAIL khi thực tế trái kỳ vọng. BLOCKED khi thiếu điều kiện/công cụ/quyền. NOT_RUN khi chưa thực hiện. Một TC PASS ở native không nâng thành PASS E2E; TEST_CASES phải ghi giới hạn runtime riêng. Không có dữ liệu dùng null/—, không giả số0. Forecast thật mưa cao sẽ chặn kịch bản khô/ít mưa, không sửa dữ liệu API để ép PASS.

## An toàn và phục hồi

Không ghi token/mật khẩu/cookie/CSRF vào bằng chứng hoặc ảnh login đã điền. Không đọc in BackendLocal.h/.env. Không xóa/reset DB sản phẩm. Không dùng setInsecure, thời gian giả hay đổi ngưỡng tưới. Cấu hình DEMO cuối phải false. Ghi manifest sau cùng, trả potentiometer/chế độ về ban đầu khi an toàn. Báo cáo mọi sửa nhỏ và chạy lại test liên quan.
