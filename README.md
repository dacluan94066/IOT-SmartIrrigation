# Hệ thống tưới tiêu thông minh — Giai đoạn 4

Web Dashboard React/TypeScript/Vite/Tailwind4 trong [frontend/](frontend/README.md): tổng quan, điều khiển có ACK, lịch sử/biểu đồ, trạng thái hệ thống. Dùng session phía Server, không đưa API token vào React. Build Frontend rồi chạy Backend để demo cùng origin http://127.0.0.1:3001; môi trường dev tại http://127.0.0.1:5173. Phần ESP32 và sơ đồ dây không thay đổi trong GĐ4.

Bản bảo trì sau GĐ4: [phục hồi lỗi socket TLS và log errno](test/results/tls-recovery/REPORT.md). Chỉ bổ sung retry5s/15s/60s có giới hạn cho lỗi mạng TLS/HTTP transport, không thay thuật toán tưới hoặc xác thực HTTPS. Các timeout TLS45s/worker90s vẫn giữ nguyên.

Backend Node.js/Express/SQLite đã được bổ sung trong [backend/](backend/README.md). Đọc hướng dẫn này để tạo token local, chạy Server và Build firmware có telemetry/lệnh thủ công. Không có React Dashboard. Các phần Giai đoạn 2 bên dưới vẫn giữ để tham khảo thời tiết/TLS và kiểm thử trước đó.

ESP32 kết hợp độ ẩm đất giả lập với dự báo mưa Open-Meteo để tưới tự động. Giữ nguyên mạch Giai đoạn 1, hysteresis 40%/70%, giới hạn chạy 10 giây và nghỉ 5 giây. Bơm mặc định tắt khi khởi động.

Phạm vi hiện tại: Arduino Framework, PlatformIO, Wokwi, Wi-Fi/HTTPS và Backend Express/SQLite Giai đoạn 3. Chưa triển khai React Dashboard, database cloud hoặc MQTT.

Báo cáo kiểm thử cuối Giai đoạn 2 (22/10/2026): [Test 1 REAL và Test 2 SIMULATED — kết quả, log và cách tái chạy](test/results/phase2-final/REPORT.md). Phân biệt rõ kiểm thử native, API trên PC và runtime Wokwi; cấu hình cuối đã khôi phục về REAL.

## Chạy nhanh trong VS Code

1. Mở **File > Open Folder** và chọn thư mục `SmartIrrigation` chứa `platformio.ini`.
2. Cài extension **PlatformIO IDE** và **Wokwi Simulator**.
3. Nếu chưa kích hoạt Wokwi, nhấn `F1` > **Wokwi: Request a new License**, làm theo trang đăng nhập và cho phép mở lại VS Code.
4. Chọn **PlatformIO > Project Tasks > esp32dev > General > Build**. Đợi `[SUCCESS]`.
5. Nhấn `F1` > **Wokwi: Start Simulator**.
6. Theo dõi Serial Monitor **của Wokwi** ở 115200 baud. Không cần ESP32 thật, COM port hoặc Upload. Wokwi extension dùng license riêng; không cần `WOKWI_CLI_TOKEN` của Wokwi CI.
7. Chờ các log `WiFi CONNECTED`, NTP đồng bộ, `HTTP_RESPONSE | status=200`, `RESULT_RECEIVED ... accept=yes`, `REAL / Open-Meteo - Cap nhat thanh cong` và `TRANG THAI WEATHER: VALID`.
8. Nhấn potentiometer rồi xoay núm; theo dõi độ ẩm trên Serial. LED xanh biểu thị trạng thái bơm.

Potentiometer mặc định khoảng 50% nên không khởi động tưới mới. ADC `0` = `0%` (khô), ADC `4095` = `100%` (ẩm). Đây là quy ước mô phỏng, chưa phải cảm biến hiệu chuẩn. Thuộc tính `value` của potentiometer Wokwi chỉ có dải 0–1023, khác với kết quả ADC 12 bit của ESP32.

## Cấu trúc code và thư viện

| File | Chức năng |
|---|---|
| `include/Config.h` | GPIO, Wi-Fi, tọa độ, ngưỡng và các khoảng thời gian, cờ demo |
| `include/WiFiService.h`, `src/WiFiService.cpp` | Wi-Fi không chờ vòng lặp; timeout và reconnect; khởi động SNTP |
| `include/TimeSync.h` | Điều kiện mở HTTPS: đã nhận callback SNTP và epoch UTC trong phạm vi hợp lệ |
| `include/WeatherData.h` | Snapshot dữ liệu và phân loại VALID/UNKNOWN/STALE |
| `include/WeatherParser.h`, `src/WeatherParser.cpp` | Kiểm tra JSON, đơn vị, timestamp, ba mốc giờ; tính max xác suất và tổng lượng mưa |
| `include/WeatherCertificates.h` | CA công khai ISRG Root X2 cho HTTPS |
| `include/WeatherService.h`, `src/WeatherService.cpp` | Scheduling, tác vụ HTTPS riêng, queue kết quả, demo |
| `include/WeatherTransport.h`, `src/WeatherTransport.cpp` | Adapter HTTPClient: TCP riêng, TLS mbedTLS có xác thực và I/O có cancellation/idle guard |
| `include/WeatherDnsResolver.h`, `src/WeatherDnsResolver.cpp` | DNS lwIP bất đồng bộ, context sống lâu và không tái sử dụng callback còn pending |
| `include/WeatherRequestLifecycle.h`, `include/WeatherIoPolicy.h` | Quy tắc ID/phiên/deadline/hủy/phục hồi và ngân sách I/O, dùng chung với native tests |
| `include/PumpController.h`, `src/PumpController.cpp` | Quy tắc tưới và thời gian an toàn, độc lập GPIO/network để kiểm thử |
| `src/main.cpp` | Đọc ADC, gọi các dịch vụ, ghi GPIO và hiển thị Serial |
| `test/native/test_main.cpp`, `test/run-native-tests.ps1` | Kiểm thử C++ trên Windows bằng MSVC |

Thư viện ngoài duy nhất: `bblanchon/ArduinoJson @ 7.4.2`, khai báo trong `platformio.ini`. `WiFi`, `HTTPClient`, mbedTLS, lwIP và FreeRTOS có sẵn trong Arduino core ESP32. Bản sửa deadline không thêm thư viện; TLS dùng mbedTLS qua adapter `WeatherTransport` để tách TCP/TLS và kiểm soát I/O.

## Cấu hình

Chỉnh các hằng trong `include/Config.h` rồi **build lại và khởi động lại simulator**:

| Tham số | Mặc định |
|---|---|
| `WIFI_SSID`, `WIFI_PASSWORD`, `WIFI_CHANNEL` | `Wokwi-GUEST`, chuỗi rỗng, `6` |
| `WIFI_CONNECT_TIMEOUT_MS` | 10000 ms |
| `WIFI_RETRY_INTERVAL_MS` | 5000 ms sau khi kết nối thất bại/mất kết nối |
| `NTP_SERVERS` | `time.google.com`, `time.cloudflare.com`, `pool.ntp.org`; luân phiên server ưu tiên khi retry |
| `NTP_RESPONSE_TIMEOUT_MS` | 15000 ms: báo chưa nhận được giờ hợp lệ |
| `NTP_RETRY_INTERVAL_MS` | 30000 ms từ lúc bắt đầu mỗi lần thử; restart SNTP nền nếu vẫn chưa có giờ hợp lệ |
| `NTP_DIAGNOSTIC_INTERVAL_MS` | 5000 ms: in epoch, UTC, UTC+7, callback và trạng thái SNTP |
| `NTP_SYNC_INTERVAL_MS` | 1 giờ: chu kỳ SNTP nền sau khi đã đồng bộ |
| `LATITUDE`, `LONGITUDE` | 10.8231, 106.6297 — TP.HCM |
| `WEATHER_UPDATE_INTERVAL_MS` | 15 phút; đổi thành `60000` để demo API mỗi phút |
| `WEATHER_RETRY_INTERVAL_MS` | 60000 ms khi gọi API thất bại |
| `WEATHER_MAX_AGE_MS` | 20 phút tính từ lúc nhận thành công |
| `WEATHER_DNS_TIMEOUT_MS` | 15000 ms; chờ DNS bất đồng bộ |
| `HTTP_CONNECT_TIMEOUT_MS` | 10000 ms; kết nối TCP tới IP đã phân giải |
| `HTTP_READ_TIMEOUT_MS` | 12000 ms; idle timeout cho header/body, cũng giới hạn chờ ghi GET |
| `TLS_HANDSHAKE_TIMEOUT_SECONDS` | 45 giây, gồm khởi tạo TLS và handshake; tăng từ 30s sau khi đo runtime Wokwi |
| `WEATHER_QUEUE_TIMEOUT_MS` | 5000 ms từ khi đưa request vào queue tới khi worker bắt đầu |
| `WEATHER_REQUEST_DEADLINE_MS` | 90000 ms từ `WORKER_BEGIN`, kể cả scheduling trong khi request đang chạy |
| `WEATHER_RECOVERY_GRACE_MS` | 30000 ms từ lúc hủy; nếu không thu hồi được thì reboot an toàn |
| `WEATHER_WORKER_STACK_BYTES` | 16384 bytes; một worker duy nhất, in stack high-water mark trong log |
| `DEMO_WEATHER_MODE` | `false` — mặc định gọi API thật |
| `DEMO_INITIAL_RAIN_PROBABILITY` | `20`; có thể chọn `85` |

Khi đổi chu kỳ cập nhật, nên để thời gian hết hạn lớn hơn chu kỳ cập nhật. Muốn kiểm tra STALE nhanh: bật demo, để chu kỳ cập nhật 15 phút, tạm đặt `WEATHER_MAX_AGE_MS = 5000`; dữ liệu hết hạn sau 5 giây và bơm phải dừng. Khôi phục cấu hình sau thử nghiệm.

## Open-Meteo và ý nghĩa dữ liệu

URL mặc định (code bổ sung đơn vị Celsius/mm và Unix timestamp):

```text
https://api.open-meteo.com/v1/forecast?latitude=10.8231&longitude=106.6297&hourly=precipitation_probability,precipitation&current=temperature_2m,relative_humidity_2m&forecast_hours=3&timezone=Asia%2FHo_Chi_Minh&timeformat=unixtime&temperature_unit=celsius&precipitation_unit=mm
```

Không cần API key cho endpoint công khai này. Các phản hồi chỉ được chấp nhận sau HTTP 200, JSON hợp lệ và kiểm tra:

- Nhiệt độ/RH đúng kiểu số, hữu hạn, đúng phạm vi và đơn vị.
- Đủ đúng ba timestamp cách nhau 3600 giây và ba xác suất trong 0–100%; không nhận `null`, chuỗi hoặc boolean thay cho số.
- Timestamp `current` không quá cũ; mốc dự báo đầu phải ở giờ hiện tại. Kiểm tra bằng đồng hồ ESP32 đã đồng bộ NTP.
- Lượng mưa được cộng từ ba ô khi đủ dữ liệu đơn vị mm. Nếu thiếu/null, hiển thị `N/A`, không ngầm xem là 0 mm. Sai kiểu hoặc sai đơn vị thì loại phản hồi.

Với `forecast_hours=3`, Open-Meteo trả **ba mốc bắt đầu từ giờ hiện tại**, ví dụ 14:00, 15:00, 16:00 khi gọi lúc 14:25. Hệ thống lấy xác suất cao nhất của ba mốc này. Serial in rõ khoảng timestamp; đây không phải cửa sổ chính xác từ 14:25 đến 17:25. Biến `precipitation` của API là lượng của giờ trước mốc tương ứng, vì vậy log ghi **tổng lượng mưa ba mốc dự báo**, không coi đó là tổng chính xác ba giờ tương lai. Nếu cần cửa sổ ba giờ tương lai đầy đủ, cần mở rộng truy vấn và chọn lại khoảng giờ trong giai đoạn sau.

`current` là điều kiện hiện tại từ mô hình Open-Meteo, không phải số đo cảm biến tại vườn. Nhiệt độ, RH và lượng mưa dùng để quan sát; quyết định tưới dùng độ ẩm đất và **max xác suất mưa**, không cộng xác suất.

HTTPS sử dụng mbedTLS với ISRG Root X2, `MBEDTLS_SSL_VERIFY_REQUIRED`, hostname/SNI `api.open-meteo.com` và kiểm tra verify flags sau handshake; không tắt xác thực chứng chỉ. TCP kết nối tới IP đã phân giải, nhưng TLS vẫn xác thực **hostname**, không xác thực tên bằng địa chỉ IP. SNTP chạy nền sau khi Wi-Fi kết nối. Nếu chưa đồng bộ giờ hoặc TLS lỗi, dữ liệu giữ `UNKNOWN` và bơm bị khóa. Chuỗi CA của nhà cung cấp có thể thay đổi; khi đó cần cập nhật `WeatherCertificates.h`, không thay bằng HTTP hay bỏ xác thực.

## Bản sửa lỗi chờ NTP khi Wi-Fi đã CONNECTED

Log cũ `Cho dong bo NTP; chua the xac thuc HTTPS` được in **trước khi tạo request HTTPS** vì `time(nullptr)` nhỏ hơn mốc 2024-01-01 UTC. Nó không phải mã lỗi chứng chỉ hay HTTP. Wi-Fi CONNECTED chỉ xác nhận kết nối mạng; không chứng minh DNS hoặc UDP NTP đã hoạt động.

Đối chiếu code Arduino core: `configTime(25200, 0, ...)` khởi động SNTP bất đồng bộ và thiết lập múi giờ địa phương. Nó không tự đặt epoch thành giờ hợp lệ. `time(nullptr)` vẫn là UTC; offset +7 giờ chỉ ảnh hưởng cách hiển thị `localtime()`, nên không được cộng 25200 vào epoch để vượt kiểm tra TLS. Trong code cũ, ứng dụng chỉ gọi `configTime()` khi vừa CONNECTED, chưa quản lý timeout/retry/luân phiên server và chưa quan sát kết quả đồng bộ. lwIP vẫn có retry nội bộ; không thể kết luận là thư viện hoàn toàn không retry.

Bản sửa bổ sung:

- Ba hostname NTP cấu hình tập trung; bắt đầu tự động khi kết nối, báo timeout sau 15 giây và thử lại sau mỗi 30 giây chưa có giờ hợp lệ, luân phiên primary. Không có vòng while chờ hoặc `getLocalTime()` với timeout dài.
- Callback SNTP xác nhận đã thực nhận dữ liệu thời gian trong lần khởi động này. Callback chỉ cập nhật timestamp/bộ đếm atomic; loop in log. Không coi trạng thái `SNTP_SYNC_STATUS_RESET` là chắc chắn chưa đồng bộ vì lwIP có thể reset trạng thái sau khi đọc.
- Chỉ mở HTTPS khi có ít nhất một callback và epoch thuộc `[2024-01-01 UTC, 2100-01-01 UTC)`. Không đặt thời gian giả. TLS vẫn tự kiểm tra thời hạn thực của chứng chỉ; khoảng epoch này không thay thế xác thực TLS.
- Log `[TIME ms=...]` mỗi 5 giây và khi đổi trạng thái: epoch, UTC và UTC+7. Log `[NTP ms=...]`: enabled, số callbacks, attempt, elapsed, trạng thái SNTP thực, mode và DNS. Log Wi-Fi có gateway cùng DNS được cấp.
- Phân giải primary NTP trong task chẩn đoán riêng vì `WiFi.hostByName()` có thể chờ nhiều giây. Nó kiểm tra DNS, **không khẳng định đã nhận gói UDP NTP**. Mỗi lần chỉ một tác vụ DNS chẩn đoán được thực hiện.
- Sau khi giờ hợp lệ, log `[NET ms=... id=...]` lần lượt báo DNS API, IP, TCP, TLS và HTTP GET. Tác vụ weather gửi log qua queue; lỗi handshake có mã mbedTLS và verify flags. HTTP=0 trong bản ghi kết quả nghĩa là GET chưa được thực hiện, không phải status do máy chủ trả về.
- URL và `WEATHER_API_HOST` phải khớp `https://api.open-meteo.com/`; giữ hostname/SNI để xác thực tên miền dù socket TCP dùng IP đã DNS.

Kiểm tra lại sau khi **Build rồi Stop/Start Simulator**, không chỉ tiếp tục chạy firmware cũ. Giữ `DEMO_WEATHER_MODE = false`. Các dòng dưới đây là **mẫu trạng thái mong đợi**, không phải log runtime đã thu được:

```text
[WiFi] CONNECTED ...
[NTP ms=...] attempt=1 | reason=WIFI_CONNECTED | primary=time.google.com | UDP/123 ...
[DNS/NTP ms=...] ... time.google.com -> <IP thuc> ...
[NTP] SYNCED - da nhan callback SNTP ...
[TIME ms=...] VALID | epoch=<epoch thuc> | UTC=... | UTC+7=...
[NET ms=... id=1 ...] DNS_END | api.open-meteo.com -> <IP thuc> ...
[NET ms=... id=1 ...] TLS_END | TLS verified ...
[NET ms=... id=1 ...] HTTP_RESPONSE | status=200 ...
[NET ms=... id=1] RESULT_RECEIVED ... accept=yes HTTP=200 ...
TRANG THAI WEATHER: VALID
```

Nếu vẫn WAITING, để simulator chạy qua ít nhất hai lần thử (hơn 60 giây **thời gian mô phỏng**) và giữ log từ lúc khởi động:

| Log | Kết luận có thể rút ra / bước tiếp theo |
|---|---|
| DNS0/DNS1 là 0.0.0.0 hoặc `[DNS/NTP] ... FAILED` | Chưa phân giải được hostname; kiểm tra Internet và gateway Wokwi |
| DNS trả IP nhưng callbacks vẫn 0, epoch gần 1970 | Chưa nhận/áp dụng được thời gian qua SNTP; kiểm tra gói UDP/123 trong PCAP và trạng thái gateway. Chưa đủ bằng chứng để quy kết server hay firewall |
| `[NTP] enabled=no` | SNTP không chạy như mong đợi; giữ log attempt và kiểm tra firmware mới đã được nạp |
| `[NTP] SYNCED` nhưng `TCP_TIMEOUT` hoặc `TLS_HANDSHAKE_ERROR` | NTP đã qua; đọc phase/mã mbedTLS, kiểm tra TCP/443, CA, hostname và giờ thực |
| `TLS_END` rồi HTTP khác 200 | Mạng/TLS đã qua; kiểm tra status API/URL/giới hạn request |

Wokwi hỗ trợ cả TCP và UDP, nên không mặc định kết luận Wokwi không hỗ trợ NTP. Có thể tải Wi-Fi PCAP theo giao diện Wokwi và lọc `dns || udp.port == 123 || tcp.port == 443` trong Wireshark; chỉ có request UDP mà không có reply sẽ thu hẹp nguyên nhân. Khi xem PCAP nhớ rằng timestamp capture dùng đồng hồ mô phỏng. Tài liệu: [Wokwi Wi-Fi](https://docs.wokwi.com/guides/esp32-wifi), [Espressif SNTP](https://docs.espressif.com/projects/esp-idf/en/v4.4.8/esp32/api-reference/system/system_time.html).

Đã đối chiếu lại từ máy tính bằng OpenSSL với **chính PEM đang nhúng** và `-verify_hostname api.open-meteo.com -verify_return_error`: chain `*.open-meteo.com -> YE2 -> Root YE -> ISRG Root X2`, `Verify return code: 0 (ok)`. PEM khớp bản ISRG Root X2 chính thức; không cần đổi CA trong bản sửa này. Đây là kiểm tra TLS từ máy tính, không chứng minh đường mạng/TLS của Wokwi đã chạy thành công.

### Chẩn đoán NTP khác nhau giữa các lần khởi động

Người dùng đã ghi nhận một lần chạy có `callbacks=1`, `TIME VALID`. Điều đó không bảo đảm lần Stop/Start tiếp theo cũng đã đồng bộ: bộ đếm callback nằm trong RAM, khởi tạo lại bằng 0 mỗi lần boot, không được lưu cùng firmware. Build chỉ biên dịch; khi Wokwi nạp firmware và khởi động lại thì phải nhận phản hồi NTP mới. Code trước bản sửa dùng chung `TIME_NOT_VALID` cho cả đang chờ và hết timeout, nên riêng thông báo đó chưa chứng minh SNTP thất bại.

Đối chiếu core đang cài: callback đã được đăng ký trước `configTime()`; hàm này không xóa callback. Không tìm thấy nơi khác trong project ghi đè callback hoặc đặt thời gian. Chưa có bằng chứng để quy kết lỗi CA/TLS, DNS, UDP/123 hay mất callback ở lần chạy lỗi.

Bản sửa tối thiểu giữ nguyên server, múi giờ, timeout 15 giây, retry 30 giây và HTTPS:

- `TIME_WAITING_WIFI`: SNTP chưa bắt đầu; `TIME_WAITING_NTP`: đang trong budget chờ bình thường.
- `TIME_SYNC_TIMEOUT`: hết 15 giây mà chưa đủ callback + epoch. Đây là timeout của lần thử, không phải kết luận server chết. SNTP vẫn chạy, retry theo lịch 30 giây và vẫn chấp nhận callback thật đến muộn.
- `TIME_UNCONFIRMED`: epoch có vẻ hợp lệ nhưng chưa có callback; HTTPS vẫn khóa. Sau 15 giây chuyển thông báo timeout nếu vẫn chưa đủ điều kiện.
- `TIME_INVALID_EPOCH`: đã có callback nhưng epoch ngoài phạm vi; HTTPS vẫn khóa.
- `TIME_VALID`: có callback thật và epoch hợp lệ. Không reset bằng chứng này khi retry/reconnect; tránh restart SNTP không cần thiết khi Wi-Fi kết nối lại và giờ vẫn hợp lệ. Đăng ký callback ngay trước mỗi `configTime()` để làm rõ vòng đời.

Log `BOOT` có `reset_reason`, epoch và callback count; `CALLBACK_OBSERVED` có timestamp callback. Mỗi attempt có timestamp bắt đầu, lý do bắt đầu/retry, primary; log định kỳ/timeout có epoch, callback count, `status`, `completed_seen`, mode, kết quả DNS cùng `dns_attempt`. Nếu DNS cũ còn bận thì `dns_attempt` vẫn chỉ attempt cũ, không gán kết quả đó cho attempt mới. DNS chẩn đoán chạy task nền, không chặn loop cảm biến/bơm.

`status=COMPLETED` bị tiêu thụ khi gọi `get_sync_status()`, lần sau có thể là `RESET`; `completed_seen=yes` lưu lại việc loop đã quan sát COMPLETED trong attempt. Chỉ WiFiService đọc status; không dùng status làm điều kiện thay thế callback. Theo [mã SNTP của Espressif](https://github.com/espressif/esp-idf/blob/v4.4.7/components/lwip/apps/sntp/sntp.c), trạng thái được cập nhật trước khi callback được gọi, vì vậy một snapshot ngắn có epoch/status mới nhưng callback chưa tăng chưa đủ kết luận mất callback. Nếu tình trạng này kéo dài, giữ log nhiều chu kỳ và PCAP để điều tra; không mở TLS bằng epoch đơn thuần. `IN_PROGRESS` là chỉnh giờ smooth, không đồng nghĩa timeout DNS; mode mặc định là IMMED.

Kiểm tra lại trong VS Code: Build, **Wokwi: Stop Simulator** rồi **Wokwi: Start Simulator**, giữ `DEMO_WEATHER_MODE=false`. Thu log từ `BOOT` qua ít nhất 2 lần retry (trên 60 giây theo `millis()` mô phỏng), lặp Stop/Start vài lần. Quan sát WAITING trước mốc 15 giây, TIMEOUT nếu chưa đồng bộ, reason ở mốc 30 giây, rồi CALLBACK_OBSERVED/TIME_VALID khi có phản hồi thật. Đặt đất 20% khi weather UNKNOWN: ADC vẫn đổi nhưng bơm phải TẮT. Nếu callback vẫn 0 và DNS OK, cần PCAP `dns || udp.port == 123` để phân biệt có gửi query/reply NTP hay không. Không thể xác nhận nguyên nhân mạng chỉ bằng unit test.

## Bản sửa HTTPS deadline sau khi NTP đã VALID

Nguyên nhân xác định từ code cũ:

- Deadline 25 giây dùng `lastAttemptAtMs_` tại lúc gửi queue, sau khi NTP đã hợp lệ. **Không tính thời gian chờ NTP hoặc thời gian nghỉ giữa hai lần gọi API**; có tính thời gian chờ queue, scheduling của worker và lúc loop nhận kết quả.
- Sau lookup DNS tường minh, `WiFiClientSecure.connect(hostname)` lại lookup DNS lần nữa. Mỗi lời gọi `WiFi.hostByName()` trong core hiện có có thể chờ khóa DNS 16 giây rồi chờ câu trả lời 15 giây; tổng 25 giây không bao phủ các trường hợp này cùng TCP/TLS/HTTP.
- `HTTPClient::writeToStreamDataBlock()` của core đang cài có nhánh `connected()` nhưng không có dữ liệu mà không kiểm tra idle timeout, nên body dừng giữa chừng có thể giữ worker mãi. Timeout của socket không xử lý được nhánh chỉ hỏi `available()` này.
- Cờ deadline cũ chỉ bỏ kết quả trễ, không yêu cầu worker dừng/đóng kết nối; slot worker có thể bị giữ vĩnh viễn. Từ log deadline đơn lẻ **chưa xác định được lần chạy Wokwi đã chậm ở phase nào**.

Cách xử lý hiện tại:

1. `QUEUED` có budget riêng 5 giây. Worker có tổng budget 90 giây từ khi thực sự nhận request; các timeout từng phase hữu hạn như bảng cấu hình. NTP không nằm trong cả hai budget.
2. DNS dùng callback lwIP bất đồng bộ, timeout 15 giây, không lookup lại khi mở TCP. Context DNS nằm trong service suốt thời gian chạy, không trên stack; callback trễ không truy cập bộ nhớ đã giải phóng. Không mở query khác khi callback cũ còn pending.
3. TCP và TLS thực hiện trên cùng socket. TLS chạy từng bước, nhường CPU và kiểm tra deadline/hủy giữa các bước. HTTPClient tiếp tục xử lý HTTP; adapter trả disconnected khi idle timeout/đã hủy/đã quá hạn để mọi vòng đọc header/body dừng. Stream đọc body cũng kiểm tra cancellation, không busy-loop chiếm CPU.
4. Request có ID và phiên Wi-Fi. Kết quả cần đúng ID/phiên, chưa hủy/quá hạn, thời gian hệ thống hợp lệ và dữ liệu còn mới. Kết quả sai ID không được giải phóng slot của request đang hoạt động. Hủy là trạng thái không thể được một kết quả thành công trễ đảo ngược.
5. Chỉ có **một worker** tạo ở setup; không tạo task mới khi timeout. Loop gửi cờ atomic, worker tự đóng socket/TLS/HTTP qua destructor rồi gửi kết quả; sau đó mới mở slot. Không gọi `vTaskDelete()` hay đóng socket từ task khác khi mbedTLS còn sử dụng.
6. Nếu worker đã bị hủy 30 giây nhưng chưa trả về, service yêu cầu phục hồi. Main cho `UNKNOWN` đi qua controller, đặt GPIO bơm OFF rồi reboot ESP32 để thu hồi toàn bộ tài nguyên. Đây là phương án cuối cho task/thư viện kẹt, không phải báo API thành công. Callback DNS còn pending quá 15+30 giây cũng kích hoạt phục hồi có giới hạn. Reboot có thể lặp lại nếu lỗi mạng/thư viện vẫn tồn tại; xem log trước `[RECOVERY]`.
7. Khi request kết thúc, chu kỳ cập nhật 15 phút hoặc retry 60 giây tính từ lúc loop nhận kết quả. Reconnect yêu cầu dữ liệu mới sau khi request cũ đã được thu hồi.

Mỗi log ghi `ms` tại thời điểm sự kiện trong worker, `id`, `+` thời gian từ worker bắt đầu, `step` thời gian từ sự kiện trước, stack-free (bytes) và heap tại các mốc. `RESULT_RECEIVED` ghi riêng `queue_wait`, `run`, `delivery`. Heartbeat `WORKER_STATUS` mỗi 5 giây ghi phase cuối và số log bị bỏ nếu queue đầy. Stack 16 KiB không phải bằng chứng runtime đủ stack; cần quan sát `stack_free`/heap thực tế trên Wokwi.

Luồng mong đợi, **không phải log đã chạy thành công**:

```text
QUEUED -> WORKER_BEGIN -> DNS_BEGIN/DNS_END
       -> TCP_BEGIN/TCP_END -> TLS_BEGIN/TLS_END
       -> HTTP_GET_BEGIN/HTTP_RESPONSE -> HTTP_BODY_BEGIN/HTTP_BODY_END
       -> JSON_BEGIN/JSON_END -> WORKER_END -> RESULT_RECEIVED
```

| Lỗi | Ý nghĩa |
|---|---|
| `DNS_TIMEOUT` | Chưa có kết quả DNS trước budget 15 giây |
| `DNS_LOOKUP_ERROR` | lwIP trả không có IPv4/lỗi lookup; API callback không cho biết chi tiết NXDOMAIN hay timeout nội bộ, có thể xem PCAP |
| `TCP_TIMEOUT` / `TCP_CONNECT_ERROR` | Không kết nối được socket TCP tới IP:443; chưa bắt đầu TLS |
| `TLS_HANDSHAKE_TIMEOUT` / `TLS_HANDSHAKE_ERROR` | Đã mở TCP; tổng setup + TLS quá 45 giây hoặc có mã lỗi/verify flags |
| `HTTP_IDLE_TIMEOUT` / `HTTP_TIMEOUT` | Không có tiến triển ứng dụng trước idle timeout 12 giây ở GET/header/body |
| `WORKER_DEADLINE_EXCEEDED` | Tổng worker đạt 90 giây, có thể gồm scheduling/crypto và nhiều phase; không đồng nghĩa một lỗi TLS chứng chỉ |
| `QUEUE_TIMEOUT` | Worker chưa bắt đầu trong 5 giây |
| `JSON_PARSE_FAILURE` | Body đã về nhưng JSON/field/unit/time không đạt validation |
| `REQUEST_CANCELLED` / `RESULT_REJECTED` | Request đã hủy/khác phiên/quá hạn; không được đưa dữ liệu vào điều khiển |

Kiểm tra lại: để demo false, Build rồi Stop/Start Wokwi. Giữ log từ `QUEUED` tới `RESULT_RECEIVED` hoặc `[RECOVERY]`. Khi lỗi, gửi cả `WORKER_STATUS` và mốc phase cuối; không chỉ gửi dòng WEATHER UNKNOWN. Wokwi có thể chạy chậm hơn thời gian thật; ngân sách dùng `millis()` mô phỏng và không tự cộng thời gian từ đồng hồ PC. Đã xác thực lại TLS **1.2** bằng OpenSSL trên máy tính với CA nhúng/hostname thật (`Verify return code: 0`); runtime TLS của firmware mới vẫn cần Wokwi xác minh.

### TLS: bằng chứng runtime và bản điều chỉnh 30 → 45 giây

Đã đọc trực tiếp Wokwi trong VS Code với bản chẩn đoán còn budget **30 giây**, không giả lập kết quả API. Request `id=1` ghi nhận:

| Bước | Thời gian / kết quả đo được |
|---|---|
| DNS API | 75 ms, IP `157.90.83.168` (IP có thể thay đổi) |
| TCP thực | 319 ms, `fd=48`, `connect_calls=1` |
| Setup TLS | Khoảng 0,14 giây, suy từ mốc bắt đầu handshake và `total` |
| `SERVER_CERTIFICATE` | 22171 ms, `code=0`, đã nhận 3519 bytes TLS |
| `SERVER_KEY_EXCHANGE` | 4514 ms, `code=0` |
| `CLIENT_KEY_EXCHANGE` | 8633 ms, `code=0`, tổng gửi tăng từ 305 lên 448 bytes |
| `TLS_TIMEOUT` | `total=35980` ms; lần kiểm tra timer kế tiếp cắt request |
| Bộ nhớ lúc timeout | Heap 165604 bytes, largest block 110580 bytes, stack high-water còn 10208 bytes |
| Worker trả kết quả | `queue_wait=1`, `run=36450`, `delivery=36` ms, `HTTP=0`, `accept=no` |

Nguyên nhân đã xác định: **budget 30 giây ngắn hơn tiến trình TLS thực đo được**. Không phải DNS/TCP timeout, không thấy lỗi mbedTLS ở các bước trên, và worker vẫn kết thúc/thu hồi tài nguyên. Các bước mật mã trong `mbedtls_ssl_handshake_step()` không có deadline ứng dụng chen vào giữa phép tính; vì thế kiểm tra budget có thể xảy ra ở 35,98 giây chứ không đúng 30,00 giây. Đây không phải bằng chứng thiếu heap/stack hoặc sai CA. Thời gian một state có thể gồm cả I/O và tính toán; không diễn giải 22,171 giây thành riêng thời gian CPU xác minh chứng chỉ.

Theo [tài liệu Wokwi về CPU frequency](https://docs.wokwi.com/guides/esp32#cpu-frequency-limit), mặc định simulator giới hạn thực thi lệnh khoảng 8 MHz, nhưng không làm chậm timer ngoại vi theo cùng tỷ lệ. Diagram hiện dùng attrs rỗng, tức mặc định. Điều này phù hợp với độ trễ tính toán mật mã đã đo; chưa làm phép thử đối chứng đổi tần số CPU, không sửa diagram. Phần trăm tốc độ mô phỏng so với thời gian PC là khái niệm khác. Deadline vẫn dùng `millis()` mô phỏng, không dùng NTP epoch hay đồng hồ PC.

Điều chỉnh có giới hạn: `TLS_HANDSHAKE_TIMEOUT_SECONDS` **30 → 45**, vẫn gồm setup + handshake; giữ worker **90 giây**, DNS 15 giây, TCP 10 giây, HTTP idle 12 giây và recovery grace 30 giây. Tổng budget cấu hình DNS + TCP + TLS + một HTTP idle = 82 giây, nhỏ hơn 90 giây. Không bảo đảm mọi mạng/chuỗi chứng chỉ tương lai đều nằm trong 45 giây; quá hạn vẫn loại kết quả và giữ weather UNKNOWN/bơm OFF.

Đã kiểm tra code: `tcp_.connect(IP,443,timeout)` chỉ gọi một lần trong `open()`. `mbedtls_ssl_set_bio()` gắn vào chính socket đó, không gọi connect khác. `http.begin()` chỉ phân tích URL trước khi mở socket; sau `TLS_END`, HTTPClient nhận thấy transport đã kết nối nên dùng lại socket. Bốn overload `connect()` của adapter đều từ chối mở lại và nay có log `TCP_RECONNECT_BLOCKED` nếu HTTPClient yêu cầu reconnect.

Log mới tách `TCP_END` (fd, số lần connect, thời gian socket), `TLS_INIT_STEP_BEGIN/END` cho ALLOC_CONTEXT/RNG_SEED/CONFIG_DEFAULTS/CA_PARSE/SSL_SETUP/SET_HOSTNAME_BIO, rồi `TLS_INIT_END`, `TLS_STEP_BEGIN/END`, `TLS_WAIT`, `TLS_TIMEOUT`, `TLS_HANDSHAKE_END`, `TLS_END`. Không log mỗi packet/poll WANT_READ: chỉ chuyển state, bước chậm, lỗi và mỗi 5 giây khi chờ. `dt` trong TLS_STEP_END là thời gian đúng lời gọi mbedTLS đó; `total` tính từ khởi tạo TLS. Các mốc có heap/stack thật từ worker và largest free block; `WORKER_STATUS` chỉ chứa snapshot ở mốc trace gần nhất, không phải đo liên tục bên trong một phép mật mã dài.

`fatal` là lỗi mbedTLS thực sự, `last` là return code gần nhất (có thể là WANT_READ/WANT_WRITE bình thường). `verify=UNAVAILABLE` nghĩa là API chưa cung cấp kết quả xác minh có thể diễn giải, không tự coi `flags=0` mặc định là thành công. `errno` là lỗi socket gần nhất, có thể là EAGAIN/EWOULDBLOCK bình thường của I/O nonblocking; không tự coi đó là TLS fatal. Chỉ `TLS_END` sau peer certificate + verify flags bằng 0 mới xác nhận xác thực TLS thành công.

Đã đối chiếu lại PEM nhúng với ISRG Root X2 chính thức: fingerprint SHA256 `69:72:9B:8E:15:A8:6E:FC:17:7A:57:AF:B7:17:1D:FC:64:AD:D2:8C:2F:CA:8C:F1:50:7E:34:45:3C:CB:14:70`. OpenSSL trên PC với chính CA đó, TLS1.2, SNI và `-verify_hostname api.open-meteo.com -verify_return_error` trả `Verify return code: 0 (ok)`, chain `*.open-meteo.com → YE2 → Root YE → ISRG Root X2`. Leaf có hiệu lực 19/10/2026–17/01/2027, phù hợp epoch runtime ngày 20/10/2026. Đây là xác minh PC, không thay thế log TLS verified trên ESP32. Không đổi CA, hostname, cipher list hay tắt xác thực.

**Bản 45 giây đã Build thành công, 100 checks native đạt nhưng CHƯA xác minh thành công HTTPS trên Wokwi.** Người dùng chọn tự chạy lại sau khi Build. Bản 30 giây có runtime chứng minh timeout như bảng trên; không được coi đó là bản 45 giây đã chạy thành công.

Kiểm tra bản 45 giây: nếu Accessible View còn mở, nhấn Esc (nếu đang tìm kiếm có thể cần Esc hai lần), sau đó `Wokwi: Stop Simulator` rồi `Wokwi: Start Simulator`. Để demo false và cho simulator hiện trên màn hình. Tìm `TLS_BEGIN ... budget=45s(millis)` để chắc đã nạp firmware mới. Sau TIME_VALID, cần lần lượt thấy `TLS_INIT_END`, các state tiến triển, `TLS_END ... verify_flags=0 peer=yes`, `HTTP_RESPONSE status=200`, `JSON_END JSON_OK`, và `RESULT_RECEIVED accept=yes`. Đây là tiêu chí mong đợi, không phải log thành công đã thu được. Nếu vẫn timeout, dòng lỗi nay chỉ rõ phase; không bỏ TLS hay tăng tiếp timeout khi chưa xem state/total/code/tx/rx. Khi UNKNOWN, cảm biến vẫn cập nhật và bơm vẫn phải TẮT.

## Lập lịch và chế độ an toàn

Wi-Fi bắt đầu tự động với channel 6, không có vòng `while` chờ kết nối. Mỗi lần thử có timeout 10 giây rồi nghỉ 5 giây. Khi reconnect, dữ liệu cũ bị vô hiệu và hệ thống yêu cầu bản dự báo mới.

DNS/TCP/TLS/HTTP là các thao tác có thể chặn nên được chạy trong **task FreeRTOS riêng**. Task không sửa GPIO, không cùng ghi snapshot với `loop()`; dữ liệu được sao chép qua queue một phần tử. Chỉ một request được thực hiện tại một thời điểm. Không gọi API liên tục trong `loop()` và không tạo task mới mỗi lần cập nhật.

Trong lúc chờ cập nhật định kỳ, bản dự báo trước còn hợp lệ có thể tiếp tục được dùng. Ngay khi phát hiện lỗi API, mất Wi-Fi, hoặc quá deadline, bản cũ không được dùng để tiếp tục tưới. Kết quả trễ/quay về từ phiên Wi-Fi cũ bị loại. Nếu task mạng chưa trả về thì không mở thêm request; vòng điều khiển vẫn chạy và bơm ở trạng thái an toàn.

| Trạng thái | Ý nghĩa và hành vi |
|---|---|
| `UNKNOWN` | Chưa có dữ liệu, lỗi mạng/HTTP/JSON/thiếu trường, hoặc chưa đồng bộ giờ: không bắt đầu tưới và dừng bơm đang chạy |
| `VALID` | Bản tin thành công, đã kiểm tra, chưa hết hạn: được xét cùng độ ẩm và ngưỡng mưa |
| `STALE` | Bản tin từng hợp lệ nhưng tuổi dữ liệu đạt 20 phút: không bắt đầu tưới và dừng bơm đang chạy |

Vòng điều khiển nhường CPU 10 ms bằng `vTaskDelay`; mọi scheduling Wi-Fi, weather, bơm và Serial dùng `millis()`. Giới hạn 10 giây được kiểm tra mỗi vòng điều khiển, kể cả khi HTTPS chưa xong. Các mốc là thời gian mô phỏng, có thể khác thời gian thực nếu Wokwi chạy chậm. Độ trễ phản ứng thực tế còn phụ thuộc chu kỳ loop/Serial và cần xác minh trên simulator.

## Quyết định tưới

| Điều kiện | Hành vi |
|---|---|
| Độ ẩm từ 70% trở lên | Dừng/giữ bơm tắt bất kể thời tiết |
| Mất Wi-Fi, weather UNKNOWN hoặc STALE | Dừng/khóa bơm; `KHONG CO DU LIEU THOI TIET - TAM DUNG TUOI` |
| Weather hợp lệ, xác suất mưa từ 60% trở lên | Hoãn chu kỳ mới; nếu đang tưới thì dừng ngay khi nhận dữ liệu mới |
| Độ ẩm dưới 40%, weather hợp lệ, mưa dưới 60%, hết cooldown | Bật bơm |
| Độ ẩm 40% đến dưới 70% | Không bật chu kỳ mới; giữ bơm đang chạy nếu weather vẫn cho phép |
| Bơm chạy đủ 10 giây | Dừng, nghỉ 5 giây |

Sau **bất kỳ lần dừng chu kỳ nào**, kể cả do mưa/mất dữ liệu, phải chờ đủ 5 giây mới được bật lại. Nếu đất vẫn khô và điều kiện hợp lệ, bơm có thể chạy chu kỳ tiếp theo.

## Sơ đồ chân

| Linh kiện | Chân linh kiện | Chân ESP32 | Ghi chú |
|---|---|---|---|
| Potentiometer | VCC | 3V3 | Nguồn 3.3 V |
| Potentiometer | GND | GND | Mass chung |
| Potentiometer | SIG | GPIO34 | Ngõ vào ADC1 |
| Relay module | VCC | 5V | Nguồn relay mô phỏng |
| Relay module | GND | GND | Mass chung |
| Relay module | IN | GPIO26 | Điều khiển relay, active HIGH |
| LED xanh | Anode | GPIO27 qua điện trở 220 Ω | Sáng khi bơm bật |
| LED xanh | Cathode | GND | Mass chung |

Các chân tiếp điểm `NO`, `COM`, `NC` của relay không nối tải. Trạng thái bơm được thể hiện bằng LED xanh và Serial Monitor. `diagram.json` và `wokwi.toml` giữ nguyên từ Giai đoạn 1.

Relay Wokwi được đặt thuộc tính `transistor: pnp` để hoạt động theo logic active HIGH: GPIO26 ở mức HIGH tương ứng relay/bơm bật.

## Build bằng PlatformIO

Trong VS Code:

1. Mở thư mục project `SmartIrrigation`.
2. Cài extension **PlatformIO IDE** nếu chưa có.
3. Chọn biểu tượng PlatformIO ở thanh bên, mở **Project Tasks > esp32dev > General > Build**.

Hoặc chạy trong PlatformIO Core CLI:

```powershell
pio run
```

Firmware sau khi build nằm tại `.pio/build/esp32dev/firmware.bin`; file ELF nằm tại `.pio/build/esp32dev/firmware.elf`. `wokwi.toml` đã trỏ đến hai file này.

Nếu `pio` không có trong PATH trên máy này, dùng:

```powershell
& 'C:\Users\Admin\.platformio\penv\Scripts\platformio.exe' run -e esp32dev
```

## Bật/tắt demo và kiểm thử A–H

Mặc định `DEMO_WEATHER_MODE = false`: mọi dữ liệu hiển thị là dữ liệu API đã kiểm tra, không tự chuyển sang dữ liệu giả khi API hỏng.

Để demo có kết quả lặp lại, đổi trong `include/Config.h`:

```cpp
constexpr bool DEMO_WEATHER_MODE = true;
constexpr uint8_t DEMO_INITIAL_RAIN_PROBABILITY = 20;
```

Build lại rồi khởi động lại Wokwi. Mọi báo cáo weather mang nhãn **SIMULATED**. Chỉ giả lập xác suất mưa, nhiệt độ/RH/lượng mưa là `N/A`; không tạo số thời tiết khác để giả làm dữ liệu thật. Wi-Fi vẫn phải kết nối để giữ quy tắc an toàn khi mất mạng.

Trong ô nhập của Serial Monitor Wokwi, gửi một ký tự rồi Enter:

- `1`: cập nhật ngay dữ liệu SIMULATED với xác suất mưa 20%.
- `2`: cập nhật ngay dữ liệu SIMULATED với xác suất mưa 85%.
- `x`: mô phỏng không có dữ liệu/API không phản hồi; giữ UNKNOWN cho đến khi gửi `1` hoặc `2`.

Các lệnh này không thay đổi chế độ API thật. Để quay lại dữ liệu thực, đặt `DEMO_WEATHER_MODE = false`, build và restart. Không cần thay đổi dây hoặc thêm linh kiện.

| Kịch bản | Thao tác trên Wokwi | Kết quả mong đợi |
|---|---|---|
| A | Demo `1`, đất 25% (ADC khoảng 1024) | Tưới khi hết cooldown |
| B | Demo `2`, đất 25% | LED tắt, hoãn vì dự báo mưa |
| C | Demo `1`, đất 80% (ADC khoảng 3276) | Không tưới |
| D | Demo `1`, đất 25% cho bơm bật, tăng lên 75% (ADC khoảng 3071) | Dừng do đạt 70% |
| E | Demo `1`, giữ đất 25% | Dừng sau 10 giây, nghỉ 5 giây rồi có thể tưới lại |
| F | Demo `x`, đất 25% | UNKNOWN, không khởi động; nếu đang chạy thì dừng |
| G | Demo `1`, cho bơm bật rồi gửi `2` trước 10 giây | Dừng do dự báo mưa mới |
| H | Chạy bộ kiểm thử parser bên dưới | JSON lỗi/null/thiếu trường/sai kiểu/đơn vị/timestamp đều bị loại |

F bằng `x` là **fault injection mô phỏng**, chưa xác nhận timeout HTTPS thật. Để kiểm tra lỗi HTTP thật, tạm dùng URL `https://api.open-meteo.com/v1/does-not-exist` trong `WEATHER_API_URL`, để demo false, build và chạy; HTTP khác 200 phải đưa weather về UNKNOWN. Để thử Wi-Fi timeout, tạm đổi SSID thành tên không tồn tại và restart: phải không bật bơm và thử lại sau mỗi đợt timeout. Khôi phục URL/SSID sau kiểm thử. Kiểm tra mất mạng giữa chu kỳ cần ngắt kết nối mạng/gateway đang dùng trong simulator; không cần sửa dây.

Kiểm tra hysteresis riêng: demo `1`, đặt dưới 40% để bật rồi tăng lên 50%: bơm tiếp tục chạy cho đến 70% hoặc giới hạn an toàn. Sau khi dừng, thử giảm xuống 25% trước 5 giây: chưa được bật lại.

## Kiểm thử tự động và phạm vi đã xác minh

Sau khi build (để có ArduinoJson), máy Windows có MSVC C++ Build Tools có thể chạy:

```powershell
.\test\run-native-tests.ps1
```

Script biên dịch **chính `PumpController.cpp`, `WeatherParser.cpp`, các policy request/I/O và clock gate dùng trong firmware**; output nằm trong `.pio/host-tests/`. Fixture trong test là dữ liệu giả được dùng riêng cho kiểm thử. Các kiểm tra gồm A–G, H, hysteresis, biên thời gian/ngưỡng, lỗi dữ liệu, mất Wi-Fi, STALE, tràn `millis()`, request ID/phiên, hủy, kết quả muộn, worker/queue deadline, phục hồi và idle timeout/trickle data. Test native không thực thi socket, callback DNS, task FreeRTOS, GPIO, SNTP hoặc handshake TLS của ESP32.

Đã xác minh trong lần triển khai:

- Sau bản TLS 45 giây: PlatformIO `[SUCCESS]`, RAM 47.684/327.680 bytes (14,6%), Flash 945.109/1.310.720 bytes (72,1%); native **100 checks đạt** (97 trước + 3 kiểm tra budget dựa trên runtime). Native không chạy mbedTLS, socket hay Wokwi. Runtime bản chẩn đoán 30 giây và phần chưa xác minh của bản 45 giây được ghi riêng ở mục TLS phía trên.
- Sau bản sửa chẩn đoán NTP startup/retry: native **97 checks đạt**, gồm 85 checks trước và 12 checks mới cho trạng thái khởi động, biên timeout, callback đến muộn, epoch chưa xác nhận, retry và rollover `millis()`. Đây là test phân loại trạng thái/clock gate, không mô phỏng callback SNTP hay mạng Wokwi.
- Build cuối sau bản sửa NTP `[SUCCESS]`: RAM 47.684/327.680 bytes (14,6%), Flash 942.461/1.310.720 bytes (71,9%); đã tạo lại `firmware.bin` và `firmware.elf` đúng đường dẫn Wokwi.
- PlatformIO build `[SUCCESS]` sau bản sửa HTTPS deadline: RAM 47.652/327.680 bytes (14,5%), Flash 940.877/1.310.720 bytes (71,8%). Có đủ `firmware.bin` và `firmware.elf` tại đường dẫn trong `wokwi.toml`.
- Bộ kiểm thử C++ native sau bản sửa deadline: 85 kiểm tra đạt, bao gồm 59 kiểm tra cũ và 26 kiểm tra mới về vòng đời request, không tạo request chồng, cancellation, kết quả cũ/qua hạn, phục hồi và ngân sách I/O. Test không xác nhận mạng/TLS runtime. Bản ghi phản hồi API thật từ lần triển khai trước vẫn chỉ nằm trong `.pio/host-tests/`, không được dùng trong firmware.
- Endpoint Open-Meteo trả HTTP 200 từ máy tính và body đã được kiểm tra bằng chính parser của firmware; chuỗi TLS được đối chiếu với CA công khai. Chứng chỉ nhúng khớp PEM ISRG Root X2 chính thức.
- JSON của sơ đồ hợp lệ; không thay dây hay GPIO. Wokwi CLI 0.29.0 lint: không lỗi/cảnh báo, chỉ một thông tin về board `board-esp32-devkit-c-v4` chưa được tài liệu hóa đầy đủ trong registry. SHA256 của sơ đồ không đổi so với đầu lượt triển khai.

**Phạm vi runtime:** đã trực tiếp đọc Wi-Fi CONNECTED, SNTP VALID, DNS/TCP thành công và TLS timeout trên Wokwi trong VS Code của bản chẩn đoán 30 giây. Chưa xác minh HTTPS thành công của bản TLS 45 giây, thao tác relay/LED và độ trễ phản ứng; người dùng tự chạy bản mới. Không có token Wokwi CI; quan sát GUI không đồng nghĩa đã chạy toàn bộ kiểm thử tự động. Các kịch bản điều khiển trong bảng vẫn là kết quả mong đợi để kiểm tra; native không chứng minh mạch đã chạy thành công.

## Khi Wi-Fi kết nối nhưng weather vẫn UNKNOWN

- `TIME_WAITING_*`, `TIME_SYNC_TIMEOUT`, `TIME_UNCONFIRMED`, `TIME_INVALID_EPOCH`: xem phần chẩn đoán NTP giữa các lần khởi động; ứng dụng tự retry theo lịch, bơm vẫn khóa trong lúc chờ.
- HTTP âm: lỗi transport như DNS, TCP, TLS hoặc timeout; mã cụ thể được in cùng lỗi HTTPClient. Kiểm tra Internet, đồng hồ, CA và thử chạy lại.
- HTTP 429: bị giới hạn request; không giảm chu kỳ quá thấp. Hệ thống retry theo cấu hình, không spam API.
- HTTP 4xx/5xx: kiểm tra URL/tham số; không dùng body lỗi làm dự báo.
- `JSON loi`/`Thieu`/`Don vi`/`Thoi gian`: phản hồi không đạt validation; hệ thống không dùng số mặc định để bật bơm.
- `STALE`: chưa nhận được bản hợp lệ mới trước hạn; kiểm tra chu kỳ và Internet.
- Không tìm thấy firmware: build lại và mở đúng thư mục chứa `wokwi.toml`. Mỗi lần sửa code/cấu hình cần build và restart mô phỏng.

Tài liệu tham khảo: [Wokwi ESP32 Wi-Fi](https://docs.wokwi.com/guides/esp32-wifi), [Wokwi VS Code](https://docs.wokwi.com/vscode/getting-started), [Open-Meteo Forecast API](https://open-meteo.com/en/docs), [ArduinoJson 7](https://arduinojson.org/v7/).
