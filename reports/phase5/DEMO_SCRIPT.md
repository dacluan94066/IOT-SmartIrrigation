# Kịch bản trình diễn dành cho lần chạy sau

**Tài liệu hướng dẫn, không phải log đã thực hiện. Lượt chốt không chạy bất kỳ bước nào dưới đây.** Trạng thái hiện tại NOT READY do H01; không dùng artifact DEMO hiện có để tuyên bố API thật hoạt động.

## Chuẩn bị khi người dùng chủ động chạy lại

1. Xác nhận `include/Config.h` có `DEMO_WEATHER_MODE=false` và Build REAL thành công trong PlatformIO được cấp quyền phù hợp. Không dùng bản firmware.bin cũ nếu Build thất bại. Không sửa ngưỡng/GPIO/TLS hoặc tắt bảo mật để demo.
2. Theo README hiện có của Backend/Frontend: chạy Backend local3001 và Dashboard local5173 hoặc bản phục vụ đã cấu hình. Dùng cấu hình bí mật phía server; không chiếu .env/password/token lên màn hình.
3. Khởi chạy Wokwi từ VS Code, giữ panel hiển thị/đang chạy. ESP32 gọi `host.wokwi.internal:3001`, không gọi localhost của ESP32 như máy Windows.
4. Đăng nhập Dashboard. Xác nhận telemetry mới, ONLINE theo timestamp, modeAUTO. Kiểm tra REAL/VALID và thời điểm weather, không chỉ nhãn Backend kết nối.
5. Dừng demo nếu chưa có WEATHER hợp lệ; không lấy SIMULATED để nói là dữ liệu Open-Meteo thật. Forecast thật mưa từ60% trở lên thì mô tả đúng rằng AUTO bị hoãn.

## Trình tự thuyết trình ngắn

| Bước | Thao tác người demo | Quan sát cần giải thích |
|---|---|---|
| 1. Tổng quan | Mở Dashboard, chỉ telemetry mới và nguồn forecast | ESP32 → Backend → SQLite → Web; null hiển thị —, không bịa0 |
| 2. AUTO | Đặt đất khoảng20–25%, thời tiết hợp lệ/mưa dưới60%, hết cooldown | Bơm thực bật, Web theo telemetry; sau giới hạn dừng rồi chờ. Không gọi quan sát bằng mắt là đo GPIO chính xác |
| 3. Đất ẩm | Đưa khoảng80% | Không tưới; ngưỡng bảo vệ không bị điều khiển Web vô hiệu |
| 4. Manual hợp lệ | Đặt khoảng50%, bơm đang OFF, đủ cooldown, weather cho phép; xác nhận MANUAL_ON | Chờ lệnh/ACK rồi trạng thái thật. Lệnh được nhận không đồng nghĩa bơm đã bật |
| 5. Manual OFF/AUTO | Nếu bơm đang chạy, gửi OFF; sau đó AUTO theo trình tự an toàn | ACK, lý do và telemetry; không bỏ qua thời hạn lệnh. Lượt5 trước chưa đo preemption khi bơm đang ON |
| 6. Từ chối | Đặt80%, gửi MANUAL_ON có xác nhận | REJECTED, lý do độ ẩm đã vượt ngưỡng an toàn, bơm không bật |
| 7. Lịch sử | Mở history/nhật ký lệnh | Thời gian nhận, dữ liệu thật SQLite, ACK và lý do từ chối |

MANUAL_OFF có lease hữu hạn, không phải nút dừng khẩn cấp điện vật lý. Không dùng demo cho tải bơm thật khi chưa có bảo vệ phần cứng phù hợp.

## Minh họa sắp mưa khi được phép đổi DEMO

Chỉ thực hiện trong một lượt riêng có chủ động cho phép thay cấu hình/Build: DEMO true, mưa85%, đất20–25% → SIMULATED/VALID, TAT/TAM_HOAN; luôn giải thích đây là dữ liệu mô phỏng. Nếu đổi20% →85% trong lúc tưới thì quan sát dừng theo mưa, không bịa là đã thử runtime chuyển động này trong GĐ5.

Sau đó bắt buộc false và Build REAL thành công trước khi bàn giao; source false mà binary DEMO không phải khôi phục đầy đủ. Nếu không được đổi cấu hình, dùng ảnh/snapshot DEMO85 đã lưu và giới thiệu là bằng chứng lần thử trước.

## Dự phòng mất mạng/dịch vụ

- Backend lỗi: UI cảnh báo/khóa lệnh, ESP32 AUTO độc lập khi các điều kiện cục bộ và thời tiết còn hợp lệ. Không thể điều khiển Web offline và không giả dữ liệu là mới.
- Weather UNKNOWN/STALE: giải thích tạm hoãn tưới vì an toàn; không setInsecure, không nhập timestamp giả, không ép forecast thật thấp hơn60%.
- Wokwi bị ẩn/chậm: thời gian mô phỏng khác wall-clock, không dùng đồng hồ quay video để kết luận sai10s/5s.
- Dùng [snapshot REAL](../../backend/test-results/phase5-after-recovery-visible.json), [DEMO85](../../backend/test-results/phase5-simulated85.json), ảnh và log đã lưu để thuyết trình bằng chứng lịch sử; nói rõ không phải runtime mới.
- Không reset SQLite hoặc seed dữ liệu giả vào DB thật để làm đẹp biểu đồ.

Các bước này là hướng dẫn lần chạy tương lai, không mở rộng phạm vi lượt chốt và không tự khởi động dịch vụ.
