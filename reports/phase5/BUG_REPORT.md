# Tồn đọng và rủi ro Giai đoạn 5

Chốt22/10/2026. Không sửa chức năng trong lượt chốt. Phân biệt lỗi được xác nhận, vấn đề công cụ và giới hạn chưa kiểm chứng.

## CRITICAL / HIGH

**CRITICAL: chưa có lỗi được chứng minh tại phạm vi đã kiểm tra.** Không có nghĩa đã chứng nhận an toàn điện/tải bơm thật.

### H01 — HIGH — Artifact firmware còn DEMO sau khi khôi phục source

- Trạng thái: **OPEN / khôi phục artifact BLOCKED**.
- Bằng chứng: Config.h false/initial20, nhưng firmware.bin839120bytes, SHA256 `e48d4bde86c8d7c279751a8c7e4d2eb68c38ee5d0244c33b6bfc4a7ae300ff82`, còn chuỗi nhánh SIMULATED. Build DEMO trước đó thành công; Build REAL cuối bị PermissionError tại PlatformIO platforms.lock/.cache.
- Nguyên nhân xác định: bước khôi phục source thành công nhưng Build lại bị chặn quyền, nên artifact cũ không được thay thế. Không phải bằng chứng C++ compile failure, TLS failure hoặc source DEMO vẫn true.
- Ảnh hưởng: chạy Wokwi bằng đường dẫn firmware hiện tại có thể tiếp tục bản SIMULATED85, không chứng minh được demo Open-Meteo thật mặc dù nhìn Config thấy false.
- Điều kiện đóng trong một lượt được cho phép sau này: Build REAL một lần với môi trường PlatformIO có quyền truy cập đúng, xác nhận artifact được cập nhật; không cần lặp lại toàn bộ48TC. Không hạ bảo mật/không dùng setInsecure để giải quyết lỗi quyền.
- Lượt chốt: không Build lại vì source đã false và người dùng yêu cầu chỉ tổng hợp. Đây là lý do chính kết luận **NOT READY** hiện tại.

## MEDIUM / LOW

| Mã | Mức độ, loại | Bằng chứng và tác động | Đề xuất/trạng thái |
|---|---|---|---|
| M01 | MEDIUM, thiếu dữ liệu chức năng | Độ ẩm không khí chưa đi qua đầy đủ firmware → Backend/SQLite; UI hiện — thay vì bịa0. Đã biết từ GĐ4, rà soát lại source/UI lượt5 | Ghi rõ không hỗ trợ ở bản hiện tại; chỉ bổ sung khi được mở phạm vi. OPEN, không sửa khi chốt |
| M02 | MEDIUM, câu chữ UI | Runtime SIMULATED85 có nhãn đúng nhưng câu mô tả thời tiết tĩnh vẫn ám chỉ đã nhận Open-Meteo | Có thể gây nhầm dữ liệu giả lập là thật; sửa copy ở lượt riêng. OPEN; ảnh simulated85 |
| M03 | MEDIUM, khoảng trống xác minh | TC05/06 không có phép đo cạnh GPIO; soak14:01,179 chưa đủ15phút và có gián đoạn; TC45 chưa đủ viewport | Không coi là lỗi thuật toán. CHƯA KIỂM CHỨNG; chỉ tiếp tục nếu người dùng yêu cầu lượt mới |
| M04 | MEDIUM, môi trường mô phỏng | Ẩn panel Wokwi làm đồng hồ mô phỏng ngừng tiến/chậm, trong khi server/browser dùng wall-clock | Ảnh hưởng quan sát timeout/TTL/freshness và thu telemetry; giữ panel hoạt động khi demo sau này, không tăng timeout vô hạn. Quan sát môi trường, không kết luận firmware treo |
| M05 | MEDIUM, rủi ro kết nối kế thừa | Có lịch sử TLS/network thất bại và phục hồi trong báo cáo TLS trước; lượt5 chỉ có forecast REAL cache còn hạn, chưa có HTTPS refresh mới | Không mở lại sửa TLS/NTP khi chưa có lỗi mới. Không tuyên bố TLS luôn ổn định; trạng thái rủi ro chưa được loại trừ |
| L01 | LOW, tài liệu | Một số mô tả cũ còn nói chưa có React dù GĐ4 đã tồn tại | Không ảnh hưởng runtime; cập nhật README ở phạm vi tài liệu sau này. Chưa sửa |

## Không được kết luận thành lỗi đã chứng minh

- Chưa có bằng chứng memory leak, task tích lũy hoặc GPIO sai; cũng chưa đủ dữ liệu chứng minh chúng không xảy ra dài hạn.
- Sáu fetch errors của endurance có liên quan bài dừng Backend chủ động, không tự phân loại thành sáu lỗi sản phẩm.
- Không thử mất Wi-Fi hay API timeout thật trong GĐ5; không gán FAIL dựa trên việc chưa thử.
- Chưa có đo relay điện thật, dòng khởi động bơm, hiệu chuẩn cảm biến thật hoặc chống nước. Potentiometer chỉ là dữ liệu giả lập.
- Bundle scan chỉ kiểm tra credential cấu hình đã biết, không phải pentest toàn diện. Workspace không có Git repository để chứng nhận lịch sử commit không lộ secret.

Danh sách48TC có0FAIL vì tại tầng đã chạy không có assertion trái kỳ vọng. H01 là điều kiện bàn giao artifact ngoài48TC; không che giấu bằng cách cộng nhầm thành một TC chức năng khác.
