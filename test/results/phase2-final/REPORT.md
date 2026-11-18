# Kiểm thử cuối Giai đoạn 2 — Test 1 và Test 2

Ngày kiểm thử: 22/10/2026, UTC+7. Project: SmartIrrigation.

## Kết luận

Hai kịch bản chức năng đã được điều khiển và quan sát trực tiếp trên **Wokwi extension trong VS Code**, không chỉ chạy bằng fixture/native. Test 1 dùng dữ liệu Open-Meteo thật: dự báo tối đa 4%, do đó **không bị chặn bởi điều kiện mưa**. Test 2 dùng firmware DEMO, dữ liệu được ghi SIMULATED và không gọi Open-Meteo.

Chưa đo xung GPIO bằng logic analyzer/VCD: không khẳng định thời lượng ON/OFF thực của GPIO chính xác đến mili-giây hoặc chứng minh giới hạn vật lý tuyệt đối <=10000 ms. Log runtime xác nhận dừng vì giới hạn 10 giây, cooldown và bật lại. Biên 10000/5000 ms được kiểm thử chính xác bằng **controller native + clock mô phỏng**, không đánh đồng với phép đo GPIO trên Wokwi.

## Bảng kết quả

| Test | Điều kiện | Kết quả thực tế | PASS/FAIL/CHƯA KIỂM CHỨNG |
|---|---|---|---|
| PlatformIO Build REAL | DEMO=false, cấu hình ban đầu và cuối | SUCCESS; RAM 47684/327680, Flash 945109/1310720 bytes | PASS |
| PlatformIO Build DEMO | DEMO=true, mưa ban đầu85 | SUCCESS; RAM46752, Flash784681 bytes | PASS |
| Unit Test | Controller/parser/policy thật, clock và dự báo fixture SIMULATED | 110 checks đạt; gồm 100 checks trước và 10 checks cuối GĐ2 | PASS |
| Real API Test trên PC | HTTPS, cùng URL/tham số firmware, body không chỉnh sửa | HTTP200; nhiệt độ25.3°C; probabilities=[4,2,3], max4% | PASS |
| Integration PC: real API + parser + controller | Body thật tại epoch ghi trong metadata, soil22.5, clock controller mô phỏng | 117 checks đạt tổng cộng, thêm7 checks API/integration; không thực thi ESP32/GPIO | PASS |
| Test1 — Wokwi REAL | ADC921, đất22.5%, mưa4%, WEATHER VALID, Wi-Fi CONNECTED | Bơm BẬT, LED xanh sáng; sau đó TẮT do runtime limit, LED tắt; cooldown rồi bật lại | PASS chức năng |
| Test1 — Giới hạn/cooldown native | Đất22.5, mưa20 giả lập và mưa4 từ API thật trong integration PC | ON ở9999ms; OFF ở10000ms; OFF suốt4999ms cooldown; được bật ở5000ms | PASS native, không phải GPIO runtime |
| Test1 — Đo chính xác thời lượng GPIO Wokwi | <=10000ms ON; >=5000ms OFF | Không thêm logic analyzer, không ghi VCD, log chuyển bơm hiện không kèm timestamp riêng | CHƯA KIỂM CHỨNG |
| Test2 — Wokwi SIMULATED85 | Đất22.5%, demo85%, WEATHER VALID | TẠM HOÃN TƯỚI, bơm/LED TẮT, lý do dự báo sắp mưa | PASS |
| Test2 mở rộng — Wokwi85→20 | Gửi UART `1`, soil22.5 | SIMULATED20%, bơm BẬT, LED xanh sáng | PASS |
| Test2 mở rộng — Wokwi20→85 khi đang ON | Gửi UART `2` khi bơm đang chạy | DUNG TUOI vì DU BAO SAP MUA; LED tắt, không phải đợi runtime limit | PASS |
| Khôi phục | DEMO=false, initial rain20, pot133 như trước test | Hash Config.h trùng đầu lượt; Build REAL lại SUCCESS; quan sát REAL/VALID sau khôi phục | PASS |

## Phương pháp và giới hạn chứng cứ

- Không có `WOKWI_CLI_TOKEN`; không cài công cụ, không đăng nhập, không tạo token hay dùng CI trả phí. Runtime được chạy bằng công cụ tự động điều khiển Windows qua giao diện Wokwi đang có sẵn.
- Đã đọc code trước khi test. Không sửa `src/main.cpp`, controller, GPIO34/26/27, TLS/NTP/DNS/Wi-Fi hay sơ đồ dây.
- Potentiometer runtime trước test là133/1023 (ADC532,13%). Đặt tạm230/1023, đo được ADC921,22.5%. Cuối test trả133/1023; không sửa diagram.json. Cấu hình file của potentiometer vẫn giữ nguyên như ban đầu.
- Quan sát trực quan LED PUMP sáng xanh khi Serial báo BAT và tối khi Serial báo TAT; không lưu screenshot thành file. Các log đi kèm là văn bản lấy từ Accessible View của VS Code; API accessibility làm phẳng xuống dòng, không phải raw UART capture có timestamp mỗi byte.
- Test1 đã restart mô phỏng với soil22.5 để chạy lại Wi-Fi/NTP/HTTPS. Chụp trạng thái sau đó có REAL/VALID, nhiệt độ25.3°C, mưa4%, và NTP TIME_VALID. Log lưu tập trung vào các chu kỳ bơm; không giữ đầy đủ trace DNS/TCP/TLS/HTTP từ đầu boot. Không dùng log PC để giả làm HTTP runtime ESP32.
- Tại Test2, mưa20 được cập nhật ở uptime29234ms; mưa85 ở36625ms. Khoảng hai mốc cập nhật khoảng7.4s, nhỏ hơn10s; Serial ghi dừng vì mưa, không vì runtime limit. Đây là timestamp cập nhật weather, **không phải phép đo xung GPIO chính xác**.
- Nhiệt độ/RH/precipitation trong demo là N/A đúng thiết kế; demo chỉ giả lập xác suất mưa, không tự tạo nhiệt độ thật.
- Dữ liệu API tại PC và Wokwi đều được quan sát max4%; không sửa xác suất hoặc timestamp API để ép PASS. Nếu lần chạy sau mưa>=60%, Test1 điều kiện không mưa sẽ bị chặn; không đổi API, dùng bài SIMULATED20/native riêng để kiểm tra nhánh cho phép tưới.

## Trích bằng chứng Wokwi

Các trích đoạn sau lấy từ log runtime, chỉ xuống dòng lại cho dễ đọc:

### Test1 — REAL

```text
Wi-Fi: CONNECTED | ADC: 921 | DO AM DAT: 22.5%
NGUON WEATHER: REAL / Open-Meteo | TRANG THAI WEATHER: VALID
NHIET DO: 25.3 C | DO AM KHONG KHI: 100.0%
XAC SUAT MUA CAO NHAT 3 MOC GIO: 4.0%
MAY BOM: BAT | QUYET DINH: TUOI
NGUYEN NHAN: Dat kho; tiep tuc chu ky den 70% hoac gioi han an toan
[DUNG TUOI] Dat gioi han chay bom 10 giay
[Bom] Cho 5 giay truoc khi duoc bat lai.
[Quyet dinh] KHONG TUOI - Dang cho 5 giay sau chu ky truoc
```

Đã quan sát cả LED sáng và tắt, rồi BAT/TUOI ở chu kỳ tiếp theo. Native bổ sung kiểm tra mọi mili-giây của cooldown và biên thời gian; xem native-unit.log.

### Test2 — SIMULATED

```text
Wi-Fi: CONNECTED | ADC: 921 | DO AM DAT: 22.5%
NGUON WEATHER: SIMULATED | TRANG THAI WEATHER: VALID
XAC SUAT MUA CAO NHAT 3 MOC GIO: 20.0%
CAP NHAT THANH CONG LUC: 2026-10-22 01:25:24 UTC+7 | Uptime: 29234 ms
MAY BOM: BAT | QUYET DINH: TUOI
[Weather] SIMULATED - Xac suat mua: 85%
[DUNG TUOI] TAM HOAN TUOI - DU BAO SAP MUA
XAC SUAT MUA CAO NHAT 3 MOC GIO: 85.0%
CAP NHAT THANH CONG LUC: 2026-10-22 01:25:31 UTC+7 | Uptime: 36625 ms
MAY BOM: TAT | QUYET DINH: TAM HOAN
NGUYEN NHAN: TAM HOAN TUOI - DU BAO SAP MUA
```

Trước lệnh `1`, đã quan sát trạng thái ban đầu SIMULATED85/VALID, bơm và LED tắt. Log Accessible View được lưu về cuối run nên đoạn đầu boot/trạng thái85 ban đầu không còn đầy đủ trong file; đoạn20→85 vẫn được lưu.

## Tái chạy

### Unit / integration trên PC

```powershell
.\test\run-native-tests.ps1
.\test\run-native-tests.ps1 -ApiCapture test\results\phase2-final\open-meteo-real.json -ApiCaptureEpoch 1792606707
```

Lệnh thứ hai kiểm tra **bản ghi API thật đã thu** tại thời điểm epoch ghi trong open-meteo-request.json, không gọi API lại và không dùng epoch đó trong firmware.

### Wokwi Test1

1. Giữ DEMO_WEATHER_MODE=false. Build PlatformIO rồi Stop/Start Wokwi; đóng Accessible View bằng Esc nếu còn mở.
2. Chỉnh núm đất đến20–25% (230/1023 cho ra22.5% ở lần đo này). Không sửa dây/GPIO.
3. Chờ REAL/VALID. Chỉ kiểm tra nhánh tưới nếu max mưa thật<60%; nếu>=60% ghi rõ bị chặn.
4. Quan sát BAT/TUOI và LED sáng, sau đó DUNG TUOI vì10 giây, LED tắt, chờ5 giây rồi có thể bật lại. Muốn kết luận thời lượng GPIO chính xác cần đo riêng; log hiện tại không đủ độ phân giải.

### Wokwi Test2

1. Tạm DEMO_WEATHER_MODE=true, DEMO_INITIAL_RAIN_PROBABILITY=85. Build rồi Stop/Start Wokwi.
2. Đất20–25%, chờ Wi-Fi CONNECTED và SIMULATED/VALID85; bơm/LED phải tắt, lý do DU BAO SAP MUA.
3. Click **Wokwi Terminal** (không phải PowerShell), nhấn `1`. Khi đủ điều kiện, bơm/LED bật với SIMULATED20.
4. Trong lúc đang ON, nhấn `2` trước khi hết10 giây. Phải dừng vì mưa85, LED tắt. Không tăng mưa trong nguồn REAL.
5. Khôi phục DEMO=false và initial rain20; Build lại, Stop/Start Wokwi. Trong lượt kiểm thử này đã khôi phục cả source và firmware REAL.

## File và cấu hình cuối

Thay đổi giữ lại: bổ sung test vào `test/native/test_main.cpp`, các bằng chứng/báo cáo trong `test/results/phase2-final/`, và đường dẫn báo cáo trong README.md. `include/Config.h` chỉ thay tạm cho demo rồi khôi phục chính xác.

Hash trước/sau đã đối chiếu trùng:

| File | SHA256 |
|---|---|
| include/Config.h | D6FA912F6CC11737E2A148CA3916F635D167FD47975FDAD6AFF671F05B6098A9 |
| diagram.json | 76EE712B20EBD1FF25F403B8DC72E2FD371C3DDD63CFAD0BCFDEB0DBB52F71F5 |
| wokwi.toml | 33554A90AE5ECF15E34AB55BA0424D01EFE313B9D8CE5BEBC9025D139197C313 |
| src/PumpController.cpp | C43DAAD52279E2599F2DD0705DAB21DFF5265A666F467F52A60A714A2DFEC50C |
| src/main.cpp | 532ED84CCEDC2262D1A46900C61A379CDD680F3577C8A6D18D9CB339A1F0BB72 |

WiFiService.cpp, WeatherService.cpp và WeatherTransport.cpp cũng không thay đổi trong lượt kiểm thử. Không triển khai Backend/Dashboard/Database.
