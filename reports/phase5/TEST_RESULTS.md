# Kết quả kiểm thử Giai đoạn 5

Chốt ngày 22/10/2026 (UTC+7); bổ sung bằng chứng người dùng cung cấp và kiểm tra tĩnh artifact hiện tại. Không chạy Build, test, Browser, Backend hoặc Wokwi trong lượt cập nhật.

## Bổ sung sau chốt: runtime mới và nguồn gốc firmware

Người dùng thông báo bằng chứng Wokwi mới nhất: **Backend CONNECTED, Backend API HTTP200, Wi-Fi CONNECTED, nguồn REAL / Open-Meteo, WEATHER VALID, mode AUTO**. Đây là bằng chứng runtime do người dùng cung cấp, không phải log được công cụ thu trực tiếp trong lượt này; không có raw log mới kèm timestamp/boot/request ID để đối chiếu với artifact. HTTP200 được báo là của Backend, không tự suy ra HTTP200 của Open-Meteo hoặc một lần TLS/forecast refresh mới.

Kiểm tra file trực tiếp, độc lập với Serial, cho thấy:

| Hạng mục kiểm tra tĩnh | Kết quả mới |
|---|---|
| `include/Config.h` | `constexpr bool DEMO_WEATHER_MODE = false;` |
| Artifact Wokwi trỏ tới | `.pio/build/esp32dev/firmware.bin`, cùng ELF tại thư mục đó theo `wokwi.toml` |
| Kích thước binary | **967728 byte**, khác binary DEMO cũ 839120 byte |
| Thời gian sửa binary | **2026-10-22T06:05:21.9925018Z** (13:05:21 UTC+7) |
| SHA256 hiện tại | `f23400a2a3e816a7f7f933f76959ad128d08595dfff1d3af51aa7f2bb5dd13de` |
| Chuỗi nhánh DEMO | Không thấy `[Weather] SIMULATED - Khong goi Open-Meteo.` và chuỗi hướng dẫn `[Demo] Gui 1: mua 20%; 2: mua 85%; x: du lieu UNKNOWN.` trong binary hiện tại |
| Chuỗi REAL/TLS | Có `api.open-meteo.com` và chuỗi `TLS` |
| Object/ELF | WeatherService.cpp.o có mtime06:05:16Z; ELF có mtime06:05:21Z ngày22/10, nhất quán với thời điểm binary được tạo |
| Log SUCCESS tìm được | `evidence/platformio-build.log` ngày21/10 lúc20:44:07Z; `backend/test-results/firmware-build.log` ngày21/10 lúc18:56:40Z. Cả hai cũ hơn artifact mới, không chứng minh nguồn gốc lần Build này |

Các dấu hiệu tĩnh **phù hợp với nhánh REAL**, và chắc chắn artifact không còn có hash của bản DEMO cũ. Tuy nhiên, chỉ việc thiếu chuỗi DEMO/có hostname, timestamp và source false không chứng minh đầy đủ cờ cấu hình lúc biên dịch hay kết quả Build SUCCESS gắn với đúng hash hiện tại. **Chưa tìm thấy bằng chứng Build REAL SUCCESS cho artifact hiện tại trong các log/kết quả đã lưu được kiểm tra.**

H01 được cập nhật trong hai báo cáo kết quả/tổng kết thành **PENDING VERIFICATION — chưa xác minh nguồn gốc Build REAL**; không còn khẳng định binary hiện tại là DEMO. Chưa đủ điều kiện đóng H01, cũng chưa có bằng chứng artifact hiện tại sai. Các mô tả H01 tại BUG_REPORT/TEST_PLAN/SYSTEM_EVALUATION/DEMO_SCRIPT là kết luận lịch sử trước bổ sung này; đánh giá hiện hành là tại đây và FINAL_REPORT. Không sửa các file đó theo phạm vi yêu cầu chỉ cập nhật hai báo cáo.

**Cách hoàn tất xác minh ở lượt sau:** cung cấp log Build thành công tương ứng lần06:05Z cùng snapshot `Config.h=false` và SHA256 artifact; nếu không có log, chạy một Build firmware có ghi log (`pio run -e esp32dev -v`) trong môi trường PlatformIO hoạt động bình thường, lưu kết quả SUCCESS/exit code, cấu hình nguồn dùng cho Build và hash binary sau Build. Nếu cần loại trừ object cache không rõ nguồn gốc, dùng Clean rồi Build ở lượt được phép. Không cần chạy lại48test hoặc mô phỏng để xác minh riêng bước Build. Các thao tác này chỉ là hướng dẫn, **chưa được thực hiện trong lượt cập nhật**.

Giữ **43 PASS / 0 FAIL / 2 NOT_RUN / 3 BLOCKED**. Không chuyển TC10 sang PASS vì chưa có raw log/timestamp chứng minh forecast mới; không thay đổi TC05/06/16/45. Kết luận hiện hành vẫn **NOT READY cho nghiệm thu artifact REAL**, nhưng lý do chuyển từ “binary DEMO đã xác định” sang “thiếu bằng chứng Build REAL của binary mới”. Chưa đủ căn cứ nâng READY WITH ISSUES; sau khi xác minh Build, có thể đánh giá mức đó với các giới hạn đo GPIO/soak/responsive được công bố.

## Tổng hợp 48 test case

| Trạng thái | Số lượng | Test |
|---|---:|---|
| PASS | 43 | Các TC còn lại ngoài năm TC bên dưới; chỉ ở tầng đã ghi |
| FAIL | 0 | Không ghi nhận kết quả trái kỳ vọng tại tầng đã xác minh |
| NOT_RUN | 2 | TC10, TC16 |
| BLOCKED | 3 | TC05, TC06, TC45 |
| Tổng | 48 | Không cộng Build, số assertion hoặc bài soak vào tổng này |

Không có FAIL không đồng nghĩa hệ thống đã đủ điều kiện bàn giao. H01 trước đây là tồn đọng HIGH về artifact; hiện **chưa xác minh Build REAL cho artifact mới**, không còn kết luận binary hiện tại là DEMO. Kết luận vẫn **NOT READY** theo điều kiện nghiệm thu artifact. [BUG_REPORT.md](BUG_REPORT.md) lưu mô tả lịch sử; phần bổ sung ở đầu báo cáo này thay thế đánh giá trạng thái H01 cũ.

Chín TC PASS chỉ ở NATIVE: TC04, TC07, TC08, TC11, TC13, TC14, TC15, TC17, TC18. Những TC còn lại phải đọc giới hạn cụ thể trong [TEST_CASES.md](TEST_CASES.md), không suy rộng sang đo điện/phần cứng.

## Build và kiểm thử tự động đã lưu

| Nhóm | Kết quả lượt trước | Phạm vi/giới hạn |
|---|---|---|
| PlatformIO REAL đầu lượt | SUCCESS, 10,09s; RAM 50524/327680 (15,4%); Flash 961157/1310720 (73,3%) | Chứng minh bản REAL đầu lượt Build được, không chứng minh artifact cuối |
| Native C++ | 147 checks PASS | Controller/parser/SNTP/request lifecycle/cancellation/I/O budgets trên PC, không phải runtime TLS/FreeRTOS/GPIO |
| Backend | 33/33 PASS, fail0 | HTTP + SQLite riêng; có auth, TTL/ACK/lease, validation, session/CSRF/CORS |
| Frontend unit | 6/6 PASS | Logic unit, không phải browser E2E |
| Frontend production Build | TypeScript + Vite SUCCESS; 2625 modules | Có bundle build, không thay cho kiểm tra UI |
| Live integration read-only | 4/4 theo output công cụ lượt trước | API/state/history/ACK và kiểm tra credential bundle; không có file stdout riêng được lưu |
| PlatformIO DEMO85 | SUCCESS, 21,10s; RAM49888; Flash832545 | Artifact lịch sử lúc chốt trước; binary hiện tại đã khác hash/kích thước |
| Artifact mới ngày22/10 lúc06:05Z | Chưa có log Build REAL SUCCESS tương ứng | Binary967728byte, không thấy chuỗi DEMO; nguồn false. Dấu hiệu tĩnh chưa thay cho bằng chứng Build gắn với hash |
| Build khôi phục REAL cuối lượt trước | BLOCKED | PermissionError tại PlatformIO platforms.lock/.cache; không phải lỗi biên dịch C++ |
| Native sau khôi phục | BLOCKED trước khi chạy | PowerShell execution policy; không phải assertion FAIL |

Có 186 checks/test tự động PASS trong các log native147 + Backend33 + Frontend6, tách khỏi 48 TC. Bốn live checks là quan sát output lượt trước, không giả tạo thành file log mới. Không chạy lại bất cứ nhóm nào khi chốt.

## Runtime và end-to-end đã xác minh

| Kịch bản | Bằng chứng thực tế | Kết luận trong phạm vi |
|---|---|---|
| A: AUTO đất khô, ít mưa | REAL/VALID, soil22,49084%, rain4%, temp25,2°C; BAT/TUOI/AUTO qua Backend → SQLite → Web; sau đó thấy TAT/cooldown | Luồng E2E chức năng đã quan sát; đúng 10s/5s tại GPIO chưa đo |
| B: DEMO sắp mưa | Boot3aa471e7…, SIMULATED/VALID, soil22,49084%, rain85%, TAT/TAM_HOAN | PASS runtime DEMO85; nhiệt độ/precipitation null, không giả dữ liệu thật |
| C: Web gửi lệnh | #19 AUTO EXECUTED; #20 MANUAL_ON EXECUTED và telemetry BAT; #21 MANUAL_OFF EXECUTED/TAT | PASS lệnh/ACK/trạng thái. #21 gửi sau khi bơm đã tắt, không chứng minh ngắt khi đang ON |
| D: Mất/phục hồi Backend | Wokwi tiếp tục AUTO; Web offline/khóa; sau phục hồi cùng boot54ecc9ff… có seq563/id1312 mới, Web ONLINE | PASS mất Backend/phục hồi, không phải ngắt Wi-Fi/API weather |
| E: An toàn đất 80% | #22 MANUAL_ON REJECTED, reason ngưỡng70%, TAT; Web giải thích | PASS runtime từ chối theo bảo vệ firmware |

### Dữ liệu/ACK tiêu biểu

Trích từ JSON lưu, không phải dựng lại log Serial. Timestamp dưới đây là UTC; giao diện hiển thị UTC+7.

```text
REAL snapshot: boot=54ecc9ff-d982d7ce-17595310
receivedAt=2026-10-21T20:53:13.192Z seq=563 stateId=1312
soil=22.49084% temperature=25.2C rainProbability=4% precipitation=0mm
source=REAL WEATHER=VALID pump=BAT decision=TUOI mode=AUTO
weatherUpdatedAt=2026-10-21T20:34:22Z

#19 AUTO       ACK=EXECUTED 2026-10-21T20:48:05.323Z
reason=Do am tu 40% den duoi 70%; khong bat chu ky moi
#20 MANUAL_ON  ACK=EXECUTED 2026-10-21T20:48:31.760Z
reason=MANUAL_ON; van giu bao ve thoi tiet, 70%, 10 giay va cooldown
#21 MANUAL_OFF ACK=EXECUTED 2026-10-21T20:48:48.049Z
reason=MANUAL_OFF - uu tien tat bom
#22 MANUAL_ON  ACK=REJECTED 2026-10-21T20:49:39.407Z
reason=Do am dat da dat nguong 70%

SIMULATED snapshot: boot=3aa471e7-ed616288-7867152b
receivedAt=2026-10-21T20:55:32.358Z stateId=1339
soil=22.49084% rainProbability=85% temperature=null precipitation=null
source=SIMULATED WEATHER=VALID pump=TAT decision=TAM_HOAN mode=AUTO
reason=TAM HOAN TUOI - DU BAO SAP MUA
```

REAL/VALID là forecast nhận trước thời điểm bắt đầu ghi nhận Giai đoạn5. Các mẫu REAL ghi cùng weatherUpdatedAt20:34:22Z; không có log mới chứng minh chu trình NTP/DNS/TLS/HTTP thành công trong lượt này. Vì vậy TC10 NOT_RUN cho lần lấy dự báo mới, không coi dữ liệu cache là lỗi API nhưng cũng không nhận PASS mới.

Log native riêng chứng minh mốc logic, **không phải đo GPIO**:

```text
[NATIVE SIMULATED Test1] ms=100 soil=22.5% rain=20.0% WEATHER=VALID pump=ON
[NATIVE SIMULATED Test1] ms=10100 ... pump=OFF reason=Dat gioi han chay bom 10 giay
[NATIVE SIMULATED Test1] ms=15099 ... pump=OFF reason=Dang cho 5 giay sau chu ky truoc
[NATIVE SIMULATED Test1] ms=15100 ... pump=ON
[NATIVE SIMULATED Test2] ms=100 ... rain=20.0% pump=ON
[NATIVE SIMULATED Test2] ms=200 ... rain=85.0% pump=OFF
```

## Độ ổn định và tải

- `endurance.json`: requested900000ms; elapsed**841179ms = 14 phút 1,179 giây**, `completed=false`, 85 mẫu, 6 fetch errors trong khoảng chủ động dừng Backend.
- Khoảng ghi từ20:42:44.967Z đến20:56:46.142Z ngày21/10/2026 (03:42–03:56 ngày22/10 UTC+7). Có hai boot, REAL → SIMULATED, chủ động dừng Backend và ẩn Wokwi làm mô phỏng ngừng tiến. Không phải soak liên tục ổn định một boot.
- **Ổn định 15 phút: CHƯA KIỂM CHỨNG.** Không đủ bằng chứng kết luận không rò RAM, không tăng task dài hạn hoặc không watchdog reset trong mọi điều kiện.
- Burst API riêng: 1000 request, concurrency20, 1000 hàng SQLite, 3604,6696ms; p95 latency83,0878ms, max177,7279ms, integrityok. Đây là PC HTTP/SQLite tạm, không phải telemetry ESP32 thật hay stress15 phút.
- RAM/Flash Build là số tĩnh, không phải heap tối thiểu/stack high-water runtime. Chưa có đồ thị heap/stack dài hạn.

## Responsive: giới hạn bằng chứng

Các file `390-*`, `768-*`, `1440-*` được đặt tên theo kích thước yêu cầu, nhưng lượt đầu actual DOM width vẫn **1440** vì override nhầm tab. Không dùng tên ảnh để xác nhận viewport. Sau sửa tab chỉ có xác nhận width390/documentWidth375, chưa lặp đủ bốn trang ở390 hoặc kiểm tra768. TC45 BLOCKED; desktop bốn trang đã quan sát. Kết quả responsive Giai đoạn4 là kế thừa, không tính thành PASS lượt5.

## Đối chiếu cấu hình và artifact tại lần chốt trước

Phần dưới lưu kết quả lịch sử. Đối chiếu artifact hiện tại nằm ở phần bổ sung đầu báo cáo; manifest85file là kết quả lần chốt trước, không được quét lại toàn bộ trong lượt cập nhật này.

| Hạng mục | Kết quả đọc, không chạy dịch vụ/test |
|---|---|
| DEMO nguồn | `include/Config.h`: false; initial demo rain20 |
| GPIO/thuật toán | 34/26/27; ngưỡng40/70%, rain60%, max10000ms, cooldown5000ms giữ nguyên |
| Manifest | 85 file nguồn/cấu hình trong baseline khớp SHA256 hiện tại; không có thay đổi trong tập này |
| Backend public config | HOST127.0.0.1, PORT3001, DB ./data/irrigation.sqlite; firmware URL http://host.wokwi.internal:3001 |
| Frontend | Chỉ .env.example, không có .env thử nghiệm active; Vite/preview127.0.0.1:5173, proxy mặc định127.0.0.1:3001 |
| TLS/NTP | Không chỉnh; TLS45s/worker90s và telemetry5s giữ nguyên |
| SQLite sản phẩm | Không xóa/reset; dữ liệu thật được giữ |
| QA scripts | scripts/ còn là công cụ test độc lập, DB tạm/port riêng; không được nhập vào ứng dụng |
| Potentiometer runtime | Lần cuối khoảng22,5%, chưa trả13% ban đầu; diagram file không đổi. Không mở Wokwi để khôi phục trong lượt chốt |
| Tiến trình dịch vụ | Không kiểm tra hoặc thay đổi trạng thái trong lượt chốt; không khẳng định mọi tiến trình test đã dừng |

Firmware **tại lần chốt trước** `.pio/build/esp32dev/firmware.bin`: 839120bytes; mtime2026-10-21T20:53:53.411Z; SHA256 `e48d4bde86c8d7c279751a8c7e4d2eb68c38ee5d0244c33b6bfc4a7ae300ff82`. Binary khi đó còn chuỗi `[Weather] SIMULATED - Khong goi Open-Meteo.` thuộc nhánh DEMO; khớp artifact Build DEMO trước khôi phục. Binary này đã được thay thế bởi artifact mới mô tả ở đầu báo cáo. **Nguồn restored không đồng nghĩa có bằng chứng đầy đủ về lần Build của binary.**

Build khôi phục trước lúc bị dừng gặp PermissionError ở `C:\Users\Admin\.platformio\platforms.lock` và cache. Đây là lỗi công cụ lịch sử, không chứng minh lần tạo binary mới cũng bị lỗi quyền và không phải bằng chứng lỗi C++. Các lượt chốt/cập nhật không Build lại. Chưa có log SUCCESS gắn với binary hiện tại để viện dẫn.

## Danh mục bằng chứng

| Mã | Tài liệu/kết quả | Cách sử dụng |
|---|---|---|
| E01 | [baseline.json](evidence/baseline.json) | Baseline manifest/cấu hình; đối chiếu85file thực hiện bằng đọc trong lượt chốt |
| E02 | [platformio-build.log](evidence/platformio-build.log) | REAL Build đầu lượt, không phải Build artifact cuối |
| E03 | [native-tests.log](evidence/native-tests.log) | 147checks và log SIMULATED native |
| E04 | [backend-tests.log](evidence/backend-tests.log) | 33 HTTP/SQLite test riêng |
| E05 | [frontend-tests-build.log](evidence/frontend-tests-build.log) | 6unit và production Build |
| E06 | [after-recovery-visible](../../backend/test-results/phase5-after-recovery-visible.json), [after-recovery](../../backend/test-results/phase5-after-recovery.json) | Snapshot live; bản visible là bằng chứng phục hồi cuối, bản trước còn cũ. Có state/history/commands được lưu |
| E07 | [simulated85](../../backend/test-results/phase5-simulated85.json) | Runtime DEMO85, boot mới |
| E08 | [dry-pump-on](evidence/dry-pump-on.png), [manual-on](evidence/manual-on.png), [rejected-80](evidence/rejected-80.png), [offline](evidence/backend-offline.png), [recovered](evidence/backend-recovered.png), [DEMO85](evidence/simulated85.png), [empty](evidence/empty-overview.png), [history desktop](evidence/1440-history.png), [overview REAL](evidence/real-overview.png) | Ảnh UI, không đo GPIO; không suy viewport từ tên ảnh |
| E09 | [load-test.json](evidence/load-test.json) | Burst1000requests DB tạm |
| E10 | [endurance.json](evidence/endurance.json) | Bài ghi nhận chưa hoàn tất |
| E11 | Output công cụ trong phiên kiểm thử trước | Live4/4, một số quan sát DOM/Serial, Build DEMO và lỗi restore. Không có file raw stdout/Serial đầy đủ; không tạo lại log như đã ghi trực tiếp |

Kế thừa, không tính là chạy lại: [Phase2](../../test/results/phase2-final/REPORT.md), [Phase4](../../frontend/PHASE4_REPORT.md), [TLS recovery](../../test/results/tls-recovery/REPORT.md). Không viện dẫn các tài liệu này để lấp phép đo GPIO/soak/HTTPS refresh còn thiếu của Giai đoạn5.
