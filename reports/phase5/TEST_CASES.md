# Danh mục kiểm thử Giai đoạn 5

Chốt ngày 22/10/2026, UTC+7. **43 PASS / 0 FAIL / 2 NOT_RUN / 3 BLOCKED = 48 TC.**

Mỗi dòng ghi input, thao tác đã thực hiện, kỳ vọng và thực tế. PASS chỉ áp dụng tại tầng nêu trong dòng; không mặc nhiên là PASS trên phần cứng hoặc toàn bộ Wokwi. Các test không được chạy lại khi chốt. Mã E trỏ tới [danh mục bằng chứng](TEST_RESULTS.md#danh-mục-bằng-chứng).

Tầng: NATIVE = logic production chạy PC với fixture/clock giả lập; API = HTTP thật + SQLite test riêng; LIVE = telemetry/ACK ESP32 thực đã lưu; WEB = Dashboard thực; WOKWI = runtime mô phỏng. Fixture không được ghi vào SQLite sản phẩm.

## ESP32 và điều khiển tưới

| Test | Input và thao tác | Kỳ vọng | Thực tế, tầng và giới hạn | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| TC01 | Đặt potentiometer khoảng 22,5%; REAL/VALID, mưa 4%; AUTO | Đất khô, thời tiết cho phép thì bật | WOKWI → LIVE → WEB nhận 22,49084%, BAT/TUOI. Không ép dữ liệu API thật | PASS | E06, E08 dry-pump-on |
| TC02 | Chuyển đất khoảng 50%; chờ bơm tắt/AUTO | Không bắt đầu chu kỳ tự động mới | Khoảng 50,1%, TAT, lý do độ ẩm từ 40% đến dưới 70%, không bật chu kỳ mới | PASS | E06 lệnh 19; quan sát lượt trước |
| TC03 | Đặt đất khoảng 80% | Bơm tắt | WEB/WOKWI khoảng 80,1%, TAT. Không phải phép đo cạnh GPIO | PASS | E08 rejected-80 |
| TC04 | NATIVE đang chạy, đưa độ ẩm đến đúng 70% | Dừng ở ngưỡng | Production controller đạt kiểm tra biên. Chưa thực hiện bước đúng 70% kèm đo GPIO trên Wokwi | PASS | E03; chỉ NATIVE |
| TC05 | Giữ đất khô, thời tiết cho phép; theo dõi chu kỳ | Tự dừng sau tối đa 10 giây, đo thời gian GPIO26 | Native ms=100 ON → ms=10100 OFF; runtime có ON rồi OFF/cooldown. Không có VCD/logic analyzer, không chứng minh xung GPIO chính xác | BLOCKED | E03, E08 |
| TC06 | Sau khi dừng, giữ điều kiện cho phép | Chờ đủ cooldown 5 giây, đo GPIO | Native ms=15099 OFF → ms=15100 ON; runtime thấy lý do cooldown nhưng không có đo cạnh GPIO | BLOCKED | E03 |
| TC07 | NATIVE thử các biên 40/70%, đang bật và đang tắt | Hysteresis, không rung trạng thái | Các kiểm tra controller đạt. Chưa bắt được đầy đủ chuỗi AUTO đang ON tại 50% trong runtime trước khi hết 10 giây | PASS | E03; chỉ NATIVE |
| TC08 | NATIVE khởi tạo controller | Bơm mặc định OFF | Trạng thái khởi tạo đạt kiểm tra. Không có phép đo điện lúc cấp nguồn | PASS | E03; chỉ NATIVE |
| TC09 | Firmware DEMO được nạp lại trong lượt trước | Khởi động lại an toàn, không tự giữ lệnh cũ | Boot mới 3aa471e7…, AUTO, mưa SIMULATED 85%, TAT. Chống phát lại qua boot còn được kiểm tra API riêng; không phải thử cắt điện khi đang bơm | PASS | E07, E04 |

## Dự báo thời tiết

| Test | Input và thao tác | Kỳ vọng | Thực tế, tầng và giới hạn | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| TC10 | Nhận một dự báo REAL mới qua Wi-Fi/NTP/DNS/TLS/HTTP | Chứng minh lần gọi Open-Meteo mới thành công | Có REAL/VALID trong telemetry, nhưng weatherUpdatedAt=20:34:22Z, trước lúc bắt đầu thu thập 20:42:44Z. Không có bằng chứng một HTTPS refresh mới thành công trong lượt này | NOT_RUN | E06, E10; thành công cũ là INHERITED |
| TC11 | NATIVE đất 22,5%, VALID, mưa 20% | Cho phép tưới | Log SIMULATED native ghi ON; không có runtime DEMO 20% của Giai đoạn 5 | PASS | E03; chỉ NATIVE |
| TC12 | WOKWI DEMO 85%, đất 22,5% | Hoãn tưới, bơm tắt, đánh dấu SIMULATED | SIMULATED/VALID, rain=85, TAT/TAM_HOAN; WEB hiển thị 85% và hoãn | PASS | E07, E08 simulated85 |
| TC13 | NATIVE đang tưới, đổi mưa 20% → 85% | Dừng do mưa cao | ms=100 ON, ms=200 OFF, lý do dự báo sắp mưa. Chưa có runtime chuyển động này trong Giai đoạn 5 | PASS | E03; chỉ NATIVE |
| TC14 | NATIVE weather UNKNOWN/không có dữ liệu | Không tưới với dữ liệu không hợp lệ | Controller từ chối/bảo vệ theo fixture. Không gây lỗi API thật để xác minh runtime lượt này | PASS | E03; chỉ NATIVE |
| TC15 | NATIVE trạng thái kết nối/dữ liệu mất hợp lệ | Không dùng dữ liệu không hợp lệ để tưới | Logic freshness/trạng thái an toàn đạt; không ngắt Wi-Fi Wokwi trong lượt này. Không suy rằng mất Wi-Fi nhất thiết xóa ngay mọi forecast còn hạn | PASS | E03; chỉ NATIVE |
| TC16 | ESP32 gặp API timeout trong khi điều khiển | Worker không treo vòng điều khiển | Native lifecycle/I/O budgets đạt một phần; không có fault injection API timeout trên ESP32 đang chạy Giai đoạn 5 | NOT_RUN | E03 một phần |
| TC17 | NATIVE JSON lỗi/thiếu trường, ba mốc giờ | Loại dữ liệu lỗi; lấy max xác suất mưa trong ba mốc giờ hợp lệ | Parser production đạt fixture, không tự dùng 0 thay dữ liệu thiếu. Không thay response Open-Meteo thật | PASS | E03; chỉ NATIVE |
| TC18 | NATIVE thời gian vượt freshness | Chuyển STALE và ngăn quyết định dựa trên dữ liệu hết hạn | Clock/freshness policy đạt; không có runtime cố ý đợi forecast hết hạn trong lượt này | PASS | E03; chỉ NATIVE |
| TC19 | So sánh boot REAL và boot DEMO 85% | Không nhập nhằng nguồn | REAL/VALID mưa 4%, nhiệt độ 25,2°C; SIMULATED/VALID mưa 85%, nhiệt độ null. Có lỗi câu mô tả tĩnh đã ghi BUG_REPORT | PASS | E06, E07, E08 |

## Backend và lưu trữ

| Test | Input và thao tác | Kỳ vọng | Thực tế, tầng và giới hạn | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| TC20 | Backend local port 3001 chạy ở lượt trước | Khởi động được | Server đã phục vụ telemetry/API; không khởi động lại trong lượt chốt | PASS | E06, E04 |
| TC21 | GET health | JSON hợp lệ, DB khả dụng | HTTP test đạt; live integration lượt trước cũng đọc được Backend | PASS | E04, E11 |
| TC22 | ESP32 gửi telemetry thật | Backend nhận và lưu | Boot/sequence/receivedAt và dữ liệu thật có trong bản chụp API/SQLite | PASS | E06, E07 |
| TC23 | Đối chiếu dữ liệu và mở lại SQLite test | Lưu đúng giá trị/timestamp/null | API integration mở file DB độc lập đạt; dữ liệu live đối chiếu read-only. Không reset DB sản phẩm | PASS | E04, E06 |
| TC24 | GET state sau telemetry | Trả trạng thái mới nhất | Bản phục hồi id1312, seq563, receivedAt20:53:13.192Z khớp trạng thái WEB | PASS | E06 |
| TC25 | GET history với filter, limit/page | Lịch sử đúng, phân trang giới hạn | API-ISOLATED đạt filter/count/paging; WEB đọc lịch sử thật. Không tuyên bố thao tác lại mọi bộ lọc GUI trong lượt này | PASS | E04, E08 history |
| TC26 | Request sai kiểu, ngoài miền, JSON lỗi/quá lớn | Từ chối, JSON lỗi thống nhất | API test đạt trên DB riêng, không đưa dữ liệu lỗi vào sản phẩm | PASS | E04 |
| TC27 | Lệnh TTL, lease, ACK lặp, đổi boot | Không gia hạn vô hạn, không phát lại sai | API-ISOLATED đạt; lệnh live 19–22 có ACK cuối. Không phải fault injection mọi race trên ESP32 | PASS | E04, E06 |
| TC28 | Token sai vai trò, session, CSRF/Origin | Bảo vệ API và credential | 33 test Backend gồm phân quyền/session đạt. Không phải penetration test | PASS | E04 |
| TC29 | Dừng Backend có kiểm soát khi Wokwi REAL đang AUTO | ESP32 vẫn điều khiển độc lập | WOKWI tiếp tục BAT rồi TAT/cooldown; thời tiết REAL/VALID còn hạn. Không coi mất Backend là mất Wi-Fi | PASS | E08 backend-offline; E10 |
| TC30 | Backend phục hồi, Wokwi tiếp tục | Telemetry được gửi lại | Cùng boot 54ecc9ff…, state id1312 mới, seq563, BAT/AUTO; không chứng minh backfill dữ liệu trong thời gian mất kết nối | PASS | E06 |

## Dashboard và điều khiển hai chiều

| Test | Input và thao tác | Kỳ vọng | Thực tế, tầng và giới hạn | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| TC31 | Đăng nhập bằng cấu hình local hợp lệ | Vào Dashboard | Đã quan sát login và vào Dashboard; không lưu mật khẩu trong báo cáo | PASS | Quan sát WEB lượt trước; E04 session |
| TC32 | Nhập mật khẩu sai | Từ chối | WEB báo “Mật khẩu không đúng.”; HTTP test cũng từ chối | PASS | E04, quan sát WEB lượt trước |
| TC33 | Đọc state thật từ ESP32 | Không hiển thị mock như dữ liệu thật | REAL/VALID, boot/sequence thực; bốn trang được truy cập | PASS | E06, E08, E11 |
| TC34 | Xoay potentiometer 13% → 22,5% → 50,1% → 80,1% | Web cập nhật độ ẩm | Giá trị Web thay đổi theo telemetry; không có đo latency end-to-end chính xác | PASS | E08 dry-pump-on, manual-on, rejected-80 |
| TC35 | Quan sát BAT/TAT thật | Web theo trạng thái thiết bị | Quan sát ON rồi OFF; API nhận lệnh không bị coi là xác nhận ON | PASS | E06, E08 |
| TC36 | Đọc nhiệt độ/xác suất mưa từ telemetry REAL | Hiển thị đúng, không gọi API weather riêng | 25,2°C, mưa 4%; DEMO null nhiệt độ được giữ thiếu dữ liệu. Không chứng minh fetch HTTPS mới | PASS | E06, E07 |
| TC37 | Gửi AUTO từ Web | Có ACK và trở về AUTO | Lệnh #19 EXECUTED, lý do vùng 40–70% không bắt đầu chu kỳ mới | PASS | E06 |
| TC38 | Xác nhận MANUAL_ON ở đất khoảng 50,1%, mưa 4% | Theo dõi pending → ACK → bơm thật | #20 EXECUTED; lúc đầu PENDING/TAT, sau đó telemetry BAT/MANUAL_ON. Không bỏ qua bảo vệ | PASS | E06, E08 manual-on |
| TC39 | Gửi MANUAL_OFF | ACK và trạng thái TAT | #21 EXECUTED, lý do ưu tiên tắt; bơm đã TAT trước khi gửi nên chưa chứng minh preemption khi đang chạy | PASS | E06; ưu tiên logic còn có E04 |
| TC40 | MANUAL_ON tại đất khoảng 80,1% | REJECTED, bơm không bật | #22 REJECTED, “Do am dat da dat nguong 70%”, TAT | PASS | E06, E08 rejected-80 |
| TC41 | Đọc ACK REJECTED #22 | Lý do rõ ràng | WEB giải thích ngưỡng an toàn độ ẩm, không báo đã bật | PASS | E08 rejected-80 |
| TC42 | Backend offline | Cảnh báo, khóa điều khiển; không coi trạng thái cũ là hiện tại | WEB mất Backend, sau ngưỡng báo ESP32 OFFLINE; ba nút khóa, ghi trạng thái cuối | PASS | E08 backend-offline |
| TC43 | Backend hoạt động lại, telemetry mới | Tự phục hồi Web | ONLINE, nút được mở lại, không reload/login lại; trạng thái mới được lưu | PASS | E06, E08 backend-recovered |
| TC44 | Mở trang lịch sử/biểu đồ | Dùng SQLite thực | WEB đọc lịch sử sản phẩm, không seed mock vào DB thật | PASS | E08 history, E11 |
| TC45 | Kiểm tra bốn trang tại 390/768/1440px | Responsive đủ ba kích thước | Lượt chụp đầu actual DOM width=1440 ở cả ba nhóm tên file. Sau sửa tab chỉ xác nhận width390, chưa kiểm tra lại đủ trang/768. Không dùng tên ảnh để nhận PASS | BLOCKED | E08; xem TEST_RESULTS |
| TC46 | Mở Dashboard với DB test rỗng riêng | Empty state, không giả số 0 | DB tạm port3002: —/UNKNOWN/OFFLINE, biểu đồ/lệnh rỗng; không xóa dữ liệu thật | PASS | E08 empty-overview |
| TC47 | Logout rồi vào trang bảo vệ | Chuyển về login, session mất hiệu lực | Quan sát logout/login; test HTTP xác nhận vô hiệu session server-side | PASS | E04, quan sát WEB lượt trước |
| TC48 | Kiểm tra JS/CSS bundle với credential cấu hình hiện hành | Không có token/mật khẩu server trong bundle | Live integration lượt trước đạt kiểm tra các credential đã biết. Không chứng minh mọi dạng secret hoặc lịch sử Git sạch | PASS | E11; phạm vi scan giới hạn |

## Điều kiện nghiệm thu riêng, không cộng vào 48 TC

| Điều kiện | Kết quả |
|---|---|
| Firmware artifact REAL sau khôi phục | BLOCKED — source false nhưng binary DEMO; xem H01 |
| 15 phút ổn định liên tục | CHƯA KIỂM CHỨNG — ghi 841179ms, completed=false, có thay boot và gián đoạn |
| Đo chính xác GPIO26/27 | BLOCKED — không có VCD/logic analyzer, không suy từ polling/Serial |
| Phần cứng thật và tải bơm thật | NOT_RUN — ngoài bằng chứng mô phỏng hiện có |
