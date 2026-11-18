# Báo cáo chốt Giai đoạn 5 — SmartIrrigation

Ngày22/10/2026, múi giờ UTC+7. Chốt từ bằng chứng lượt kiểm thử trước đã bị người dùng dừng; sau đó cập nhật theo thông tin runtime mới của người dùng và kiểm tra tĩnh artifact. Lượt cập nhật chỉ sửa TEST_RESULTS.md và FINAL_REPORT.md, không chạy Build/Wokwi/Browser/Backend/test, không chờ, không thêm tính năng.

## Kết luận

**NOT READY cho nghiệm thu nguồn gốc artifact REAL hiện tại.** Bằng chứng mới người dùng báo cho thấy runtime Backend CONNECTED/HTTP200, Wi-Fi CONNECTED, REAL/Open-Meteo, WEATHER VALID, AUTO. Kiểm tra file xác nhận binary đã thay đổi và không còn hai chuỗi nhận diện DEMO. Vì vậy **không còn khẳng định firmware.bin hiện tại là DEMO**. Tuy nhiên chưa tìm thấy log Build REAL SUCCESS tương ứng binary mới để xác nhận nó được Build từ `DEMO_WEATHER_MODE=false`; H01 giữ **chưa xác minh**, không coi là lỗi binary đã được chứng minh.

Chưa nâng READY WITH ISSUES/READY khi điều kiện xác minh artifact còn mở. Sau khi có bằng chứng Build gắn với đúng artifact, có thể đánh giá READY WITH ISSUES với các giới hạn còn lại; báo cáo này không tự giả định bước đó đã hoàn tất.

| Hạng mục | Kết quả chốt |
|---|---|
| Tổng TC chức năng | 48 |
| PASS | **43** — tại tầng ghi rõ, gồm9TC chỉ native |
| FAIL | **0** — không có kết quả trái kỳ vọng tại tầng đã xác minh |
| NOT_RUN | **2** — TC10 HTTPS lấy dự báo mới; TC16 API timeout trên ESP32 |
| BLOCKED | **3** — TC05 đo10s GPIO; TC06 đo5s GPIO; TC45 đủ viewport390/768/1440 |
| CRITICAL đã chứng minh | 0 |
| H01 — ưu tiên HIGH, chưa đóng | **PENDING VERIFICATION: chưa có bằng chứng Build REAL SUCCESS gắn với binary mới**. Không còn xác nhận lỗi binary DEMO ở artifact hiện tại |
| Ổn định15phút | **CHƯA KIỂM CHỨNG**:14phút1,179giây, completed=false, có gián đoạn và hai boot |
| Đo chính xác GPIO | **CHƯA KIỂM CHỨNG**, không có VCD/logic analyzer |

Các điều kiện Build/artifact/soak không cộng vào48TC. Giữ nguyên43PASS/0FAIL/2NOT_RUN/3BLOCKED; thông tin bổ sung chưa đủ để đổi từng TC hoặc chứng minh phép đo còn thiếu. Không có lỗi CRITICAL mới hay lỗi HIGH chức năng mới được xác nhận; H01 là tồn đọng xác minh artifact mang ưu tiên HIGH.

## Bằng chứng bổ sung sau chốt

- Nguồn: thông báo người dùng về lần Wokwi mới nhất, không phải log công cụ thu lại trong lượt cập nhật. Nội dung: Backend CONNECTED; Backend API HTTP200; Wi-Fi CONNECTED; nguồn REAL/Open-Meteo; WEATHER VALID; AUTO.
- Phạm vi: bổ sung bằng chứng vận hành kết nối Backend và trạng thái runtime REAL. HTTP200 của Backend không phải HTTP200 Open-Meteo; không có timestamp/boot/request ID hoặc log HTTPS mới để đối chiếu lần forecast mới, nên TC10 vẫn NOT_RUN.
- Kiểm tra tĩnh trực tiếp: Config.h vẫn false; wokwi.toml trỏ `.pio/build/esp32dev/firmware.bin` và ELF cùng thư mục. Binary hiện tại **967728byte**, mtime**2026-10-22T06:05:21.9925018Z** (13:05:21 UTC+7), SHA256 **`f23400a2a3e816a7f7f933f76959ad128d08595dfff1d3af51aa7f2bb5dd13de`**.
- Không còn chuỗi thông báo/hướng dẫn DEMO trong binary; có hostnameapi.open-meteo.com và chuỗiTLS. ObjectWeatherService/ELF có thời điểm gần binary. Đây là các dấu hiệu nhất quán với REAL, không chỉ suy luận từ Serial, nhưng không đủ chứng minh cấu hình tại Build hoặc trạng thái SUCCESS của lần Build đó.
- Hai logSUCCESS tìm được là ngày21/10: evidence/platformio-build.log20:44:07Z và backend/test-results/firmware-build.log18:56:40Z, đều trước artifact22/10. Không dùng chúng làm chứng cứ Build thành công cho hash mới.
- Kết luận H01 mới ở hai báo cáo này thay thế nhận định “binary hiện vẫn DEMO” trong bộ báo cáo chốt cũ. BUG_REPORT/TEST_PLAN/SYSTEM_EVALUATION/DEMO_SCRIPT được giữ nguyên theo phạm vi chỉ sửa hai file, nên các nhận định artifact trong chúng là lịch sử.

## Những gì đã có bằng chứng

- AUTO đất22,5%, REAL/VALID, mưa4%, nhiệt độ25,2°C: bơmBAT/TUOI, telemetry lên SQLite và Web; sau đó quan sátTAT/cooldown. Forecast này được nhận trước thời gian thu thập GĐ5; không chứng minh HTTPS refresh mới.
- DEMO85%, đất22,5%: SIMULATED/VALID, TAT/TAM_HOAN; không giả nhiệt độ/lượng mưa thiếu thành0.
- Web lệnh#19AUTO EXECUTED; #20MANUAL_ON EXECUTED và có telemetryBAT; #21MANUAL_OFF EXECUTED/TAT; #22MANUAL_ON tại80,1% REJECTED vì ngưỡng70%.
- Mất Backend: ESP32 tiếp tụcAUTO, Web cảnh báo/khóa. Phục hồi cùng bootREAL có telemetry mới, UI tựONLINE. Không chứng minh backfill thời gian offline hoặc mất Wi-Fi.
- Build REAL đầu lượt thành công; native147checks, Backend33tests, Frontend6unit và productionBuild thành công. BurstAPI1000request trên DB test riêng đạt integrityok, không thay thế soakESP32.
- Bốn trangWeb desktop, empty state với DB riêng, session/login/logout, ACK/reject và phân biệt dữ liệu cũ được kiểm tra trong phạm vi báo cáo.

Xem số liệu, ảnh, log, tầng kiểm thử và giới hạn tại [TEST_RESULTS.md](TEST_RESULTS.md), toàn bộ48case tại [TEST_CASES.md](TEST_CASES.md). Không sử dụng mock để nhận PASS luồng tích hợp thật.

## Cấu hình khôi phục: nguồn false, Build artifact mới chưa xác minh

| Thành phần | Trạng thái |
|---|---|
| DEMO_WEATHER_MODE | **false** trong source; demo initial rain20 |
| Backend/Frontend | Không còn cấu hình thử nghiệm active trong nguồn đã đối chiếu; loopback3001/5173, proxy bình thường; không đưa credential vào báo cáo |
| GPIO/mạch/thuật toán | Giữ34/26/27,40/70%,rain60%,10s/5s. Manifest85file nguồn/cấu hình khớp bản đầu lượt |
| TLS/NTP/Open-Meteo | Không sửa trong lượt chốt; không setInsecure/giả thời gian/bỏ xác thực |
| SQLite | Không xóa/reset; giữ dữ liệu thật |
| Firmware.bin | **Đã thay bản cũ; phù hợp dấu hiệu REAL nhưng chưa xác minh Build REAL SUCCESS** cho hash hiện tại |
| Wokwi runtime slider | Lần cuối22,5%, không khôi phục13% ban đầu vì không được mở mô phỏng; diagramfile không đổi |
| Dịch vụ đang chạy | Lượt chốt không kiểm tra/khởi động/dừng; không khẳng định mọi tiến trình test đã được tắt |

Lịch sử H01: Build REAL khôi phục trước khi tác vụ cũ bị dừng gặp lỗi quyềnPlatformIO, khi đó để lại binaryDEMO839120byte, hash`e48d4bde86c8d7c279751a8c7e4d2eb68c38ee5d0244c33b6bfc4a7ae300ff82`. **Hash này không còn là artifact hiện tại.** Không suy rằng lỗi quyền lịch sử còn tồn tại ở lần Build mới hoặc binary mới vẫnDEMO. Điều còn thiếu hiện nay là bằng chứng Build tương ứng, không phải bằng chứng compilefailure.

Để đóng H01: cung cấp logSUCCESS tương ứng artifact mới, có cấu hìnhfalse lúcBuild và hash đầu ra; hoặc khi được phép, chạy một Build có lưu log (`pio run -e esp32dev -v`), xác nhậnSUCCESS/exitcode và ghi snapshotConfigfalse cùngSHA256binary sauBuild. Nếu cần loại trừ cache không rõ nguồn gốc, Clean rồiBuild ở lượt được phép. Không cần chạy lại48TC. Lượt cập nhật không thực hiện Build và không tự đóng vấn đề dựa trên Serial, kích thước hay timestamp.

## Hạn chế còn lại

1. Soak15phút chưa hoàn tất; dữ liệu14:01 có dừngBackend/đổiboot/chậm mô phỏng, không chứng minh ổn định liên tục hay không ròRAM/task.
2. Chính xác thời gianGPIO chưa đo; mốc10s/5s được chứng minh ở logicnative, không thay cho đoGPIO.
3. ResponsiveGĐ5 chưa đủ: nhómảnh390/768lượt đầu actualwidth1440; chỉ xác nhận390sau sửa tab, chưa đủbốntrang/768.
4. Chưa có runtimeAPIstall/Wi-Fifault/JSONfault/STALEinjection của lượt5; cácTCnative ghi rõ mức kiểm chứng. Chưa có bằng chứng HTTPSrefresh mới.
5. MANUAL_OFFđãACK khi bơm vốnTAT; chưa đo ngắt chủ động bơm đangON. Chưa kiểm tra vật lý phần cứng thật, hiệu chuẩn cảm biến hoặc an toàn điện.
6. Độ ẩm không khí chưa được cấp dữ liệu; copyweatherSIMULATEDcòn gây hiểu nhầm. Bundle credentialscan có phạm vi giới hạn, không phải pentest/lịch sửGit audit.

Chi tiết lỗi/rủi ro tại [BUG_REPORT.md](BUG_REPORT.md); không suy từ thiếu dữ liệu thành lỗi firmware đã chứng minh.

## Hồ sơ bàn giao và phạm vi sửa đổi

**Lượt cập nhật kết luận chỉ sửa TEST_RESULTS.md và FINAL_REPORT.md.** Không tạo bằng chứng runtime/Build mới, không đổi test counts, không sửa source/config/SQLite. Các file còn lại giữ kết quả lịch sử của lần chốt trước; phần bổ sung và kết luận ở hai file này là đánh giá hiện hành về artifact.

Lượt chốt chỉ hoàn thiện đúng7fileMarkdown dưới `reports/phase5/`:

1. [TEST_PLAN.md](TEST_PLAN.md) — cập nhật kế hoạch với trạng thái đóng và tiêu chí bằng chứng.
2. [TEST_CASES.md](TEST_CASES.md) —48TC với input,thao tác,kỳ vọng,thực tế,tầng,trạng thái,bằng chứng.
3. [TEST_RESULTS.md](TEST_RESULTS.md) — thống kê,Build/tests,E2E,cấu hình,artifact và danh mụclog/ảnh.
4. [BUG_REPORT.md](BUG_REPORT.md) —1HIGH cùng các vấn đề/rủi ro được phân loại.
5. [SYSTEM_EVALUATION.md](SYSTEM_EVALUATION.md) — đánh giá theo tiêu chíIoT, không chấm điểm chính thức.
6. [DEMO_SCRIPT.md](DEMO_SCRIPT.md) — hướng dẫn cho lần demo tương lai, không ghi là đã thực hiện.
7. [FINAL_REPORT.md](FINAL_REPORT.md) — tổng hợp và kết luận này.

Không sửa sourceứng dụng, firmwareconfig, backend/frontendconfig, sơ đồ haySQLite trong lượt chốt hoặc lượt cập nhật. Các QA scripts/log/ảnh đã tồn tại được giữ nguyên. Không có Build/test mới. **Công việc dừng sau cập nhật hai báo cáo, không tiếp tục chạy dịch vụ/mô phỏng hoặc kiểm thử.**
