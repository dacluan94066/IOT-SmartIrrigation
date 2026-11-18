# Đánh giá hệ thống SmartIrrigation

Ngày chốt22/10/2026. Đánh giá dựa trên bằng chứng lưu; không phải điểm chính thức của giảng viên.

## Kiến trúc và mức hoàn thành

Hệ thống thể hiện chuỗi IoT hai chiều: ESP32 đọc ADC và quyết định cục bộ → HTTP Gateway → Backend/SQLite → React; chiều ngược lại là lệnh Web → Backend → ESP32 → ACK và telemetry. Quyết định thực tế của ESP32, không phải HTTP chấp nhận lệnh, là nguồn xác nhận bơm cuối cùng.

| Tiêu chí | Đánh giá theo bằng chứng | Giới hạn |
|---|---|---|
| Tính thực tiễn | Kết hợp độ ẩm và mưa để tránh tưới không cần thiết | Không có đánh giá lượng nước tiết kiệm thực nghiệm |
| Phần cứng mô phỏng | GPIO34/26/27 và sơ đồ giữ nguyên; ADC thay đổi lên Web | Không có bơm tải thật/cảm biến hiệu chuẩn; chưa đo timing GPIO |
| Điều khiển tự động | Hysteresis40/70%, mưa60%, max10s/cooldown5s có native và quan sát chu kỳ | Thời gian chính xác mới được chứng minh bằng clock native, không phải GPIO runtime |
| Weather | REAL/VALID có nhiệt độ/mưa thật đã nhận; DEMO85 phân biệt nguồn | Chưa chứng minh HTTPS fetch mới trong GĐ5; artifact cuối còn DEMO |
| Mạng | Telemetry/ACK qua Gateway thực và phục hồi Backend cùng boot | Không có test Wi-Fi loss/API stall ESP32 trong lượt5 |
| Backend/SQLite | 33test đạt; TTL, idempotency, lease, ACK, phân quyền, dữ liệu lưu thật | Burst test trên PC DB riêng không thay soak production dài hạn |
| Dashboard | Bốn trang, biểu đồ/history thật, command ACK/reject, offline/empty state | Responsive đủ390/768/1440 chưa hoàn tất; độ ẩm không khí thiếu |
| Bảo mật | Session server, cookie/CSRF/Origin, token phân vai; scan credential bundle đạt trong phạm vi | Không pentest, không chứng nhận lịch sử Git; không mở công khai Internet |
| Độc lập điều khiển | Mất Backend vẫn AUTO với weather còn hợp lệ, sau đó phục hồi | Không có backfill toàn bộ khoảng offline; không suy thành weather mất mạng vẫn luôn dùng được |
| Hiệu năng/ổn định | Build nằm trong RAM/Flash, burst1000request integrityok | Soak14:01 có gián đoạn; chưa đo heap/stack/task dài hạn |
| Khả năng trình diễn | Các luồng A–E đã có quan sát chức năng và snapshot | Bị chặn bàn giao hiện tại bởi binary/source mismatch H01 |

## Điểm mạnh

- Điều khiển bơm ở thiết bị, không phụ thuộc Dashboard để duy trì vòng điều khiển.
- Cơ chế thời tiết không hợp lệ, cooldown, thời gian chạy tối đa và ngưỡng an toàn không bị nút MANUAL_ON bỏ qua.
- Theo dõi lệnh PENDING/EXECUTED/REJECTED, TTL hữu hạn và ACK; không tô bơm ON chỉ vì POST thành công.
- SQLite lưu nhận tại server cùng thông tin thiết bị; UI phân biệt trạng thái cuối/thiết bị offline và dữ liệu thiếu.
- Có bằng chứng kết nối ESP32 thật trong Wokwi, không chỉ mock HTTP từ PC.

## Hạn chế và ưu tiên sau khi chốt

1. Ưu tiên HIGH: hoàn tất Build REAL khôi phục artifact trong môi trường có quyền PlatformIO đúng. Đây là bước cần thiết trước demo thật; không yêu cầu chạy lại toàn bộ test đã đạt.
2. Công bố các phép đo thiếu: GPIO chính xác,15phút liên tục,viewport768 và đủ trang390; không gán PASS từ ảnh tên file hoặc native.
3. Phân biệt forecast REAL đã cache với một lần HTTPS mới; tình huống mạng thực có thể khác Wokwi.
4. Không tuyên bố chất lượng tưới trên cây thật/tiết kiệm nước/an toàn điện khi chỉ mô phỏng.
5. Cải thiện sau này, ngoài phạm vi đóng lượt: dữ liệu độ ẩm không khí, copy SIMULATED, tài liệu cũ, giám sát heap và đo tải thật.

## Kết luận nghiệm thu

**NOT READY cho bản artifact demo API thật đang có.** Mức tích hợp chức năng đã có bằng chứng đáng kể (43/48TC PASS tại tầng ghi rõ), nhưng nguồn false và binary DEMO chưa đồng bộ. Không có CRITICAL được chứng minh; có1HIGH đang mở. Sau khi H01 được đóng trong lượt được cho phép, có thể đánh giá lại mức sẵn sàng mà không lặp toàn bộ kiểm thử; các phép đo chưa hoàn tất vẫn phải được công bố, không tự chuyển READY trong báo cáo này.
