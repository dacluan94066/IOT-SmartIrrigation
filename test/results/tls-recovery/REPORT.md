# Khắc phục phục hồi sau lỗi socket TLS — 22/10/2026

## Bằng chứng và giới hạn kết luận

Ảnh runtime của người dùng: `TLS_HANDSHAKE_ERROR: phase=CLIENT_CHANGE_CIPHER fatal=-78 last=-78 verify=UNAVAILABLE`. SDK đang cài định nghĩa `-78 == -0x004E == MBEDTLS_ERR_NET_SEND_FAILED`: callback gửi socket thất bại. `UNAVAILABLE` không chứng minh CA sai. Trước khi thay code, đã quan sát cùng firmware tự phục hồi thành REAL/VALID, nhiệt độ25,3°C, mưa4%, nên không có bằng chứng CA/NTP luôn sai.

Trong lượt chạy kiểm tra còn thấy `HTTP_STATUS_ERROR: status=-5 connection lost`, rồi `status=-4 not connected`. Đường code chỉ tới HTTP GET sau khi `tls.open()` thành công với peer certificate, verify flags0, hostname và CA bắt buộc. Các lỗi HTTP này khác lỗi chứng chỉ; không gọi chúng là HTTP200.

**Chưa xác định được vì sao mạng/peer đóng socket lần đầu:** ảnh không có errno của lần lỗi, log đó không còn ở vùng terminal đọc được. Không kết luận chắc chắn lỗi Gateway, server Open-Meteo, RAM hay chứng chỉ. Công cụ nhập UI bị NVIDIA Overlay che; đã dừng input sau lỗi và chỉ tiếp tục quan sát log/đọc API.

## Vấn đề xử lý trong code đã sửa

- Tất cả lỗi trước đây cùng phải chờ60s mới thử lại; mất socket tạm thời làm WEATHER UNKNOWN kéo dài dù lần kết nối tiếp theo có thể thành công.
- `describeTransportError()` không giữ errno trong thông báo cuối; SDK có thể chỉ in `UNKNOWN ERROR CODE (004E)`, không đủ phân biệt reset và lỗi gửi khác.
- Callback cũ gộp EPIPE/ECONNRESET vào SEND_FAILED/RECV_FAILED. Nay phân biệt CONNECTION_RESET theo cách ánh xạ của mbedTLS, giữ errno chụp ngay sau syscall.

## Thay đổi

1. `include/WeatherIoPolicy.h`: policy retry sau socket I/O lỗi:5s,15s, rồi60s cố định cho các lỗi liên tiếp. Thành công reset streak và trở về lịch15phút; lỗi không thuộc socket vẫn60s. Counter bão hòa, không tràn.
2. `include/WeatherTransport.h`, `src/WeatherTransport.cpp`: getter errno, phân loại lỗi net SEND/RECV/RESET để retry. Không coi cancellation/deadline là lỗi net dù callback trả mã net để thoát.
3. `include/WeatherService.h`, `src/WeatherService.cpp`: chuyển cờ lỗi qua result queue; chỉ cập nhật policy với kết quả đúng request/session/chưa hủy; chờ slot worker cũ giải phóng rồi mới retry. Lỗi HTTP transport NOT_CONNECTED/CONNECTION_LOST/SEND_HEADER/SEND_PAYLOAD sau TLS cũng dùng policy này. HTTP4xx/5xx, TLS certificate, NTP/time, JSON vẫn bị từ chối; không retry nhanh các lỗi đó.
4. `test/native/test_main.cpp`:7 kiểm tra mới cho policy retry, backoff, reset và saturation.

Không reconnect giữa handshake, không resume phiên TLS đã lỗi. Mỗi request mới tạo socket/TLS riêng, destructor thu hồi request cũ. Không thêm worker, không gọi setInsecure, không thay CA, SNI/hostname, clock gate, TLS45s hoặc worker90s. Không thay Wi-Fi/NTP, BackendService, main, GPIO34/26/27, PumpController, Config, diagram hoặc wokwi.toml.

Ví dụ cấu trúc log lỗi mới (minh họa, **không phải log runtime đã thu được**):

```text
TLS_HANDSHAKE_ERROR: phase=... fatal=-78 last=-78 errno=<errno thực> verify=... SOCKET_SEND_FAILED
[NET ms=...] RETRY_SCHEDULE | socket_error=yes delay=5000 ms; worker slot released
```

## Kiểm thử

- PlatformIO `run -e esp32dev` bản cuối: SUCCESS (14,54s). RAM50524/327680 (15,4%), Flash961157/1310720 (73,3%).
- Native `test/run-native-tests.ps1`:147 checks PASS (140 cũ +7 mới). Chạy controller/parser/policy thật trên PC, không chạy handshake/socket ESP32 và không giả log Wokwi.
- Backend `npm test`:33/33 PASS; Backend không sửa trong lượt này.
- SHA256 main.cpp/PumpController.cpp/BackendService.cpp/WiFiService.cpp/Config.h/diagram.json/wokwi.toml/platformio.ini giữ nguyên trước/sau.
- PC Node HTTPS dùng đúng CA nhúng, `rejectUnauthorized=true`, ép TLS1.2: HTTP200, authorized=true, cipher ECDHE-ECDSA-AES128-GCM-SHA256. Đây là kiểm tra PC, không phải Wokwi.
- Runtime bản cuối boot `54ecc9ff-d982d7ce-17595310`: Wokwi tự reload sau Build; Backend tiếp tục nhận telemetry thật, đất13%, khi UNKNOWN bơm TAT. Vẫn quan sát HTTP `-5 connection lost`; ở uptime125439ms worker request3 đang TLS, elapsed30067ms, cancelled=no, stack_free10200, heap144952, dropped_logs0. Chưa có bằng chứng tràn stack/RAM từ các snapshot này; không loại trừ mọi lỗi bộ nhớ chỉ bằng một snapshot.

### Kết quả runtime cuối: đã phục hồi REAL/VALID

Sau các lần mất socket, **cùng boot của bản cuối** đã tự lấy được Open-Meteo thật. Quan sát trực tiếp Wokwi thấy REAL/VALID,25,3°C, độ ẩm không khí99%, mưa4%, lượng mưa0mm; cập nhật lúc03:03:15 UTC+7 ở uptime128377ms. Không gửi dữ liệu giả vào Backend, không đổi DEMO=false, CA hoặc hostname để tạo kết quả này.

Đọc lại API Backend lúc20:05:16.065Z: boot `54ecc9ff-d982d7ce-17595310`, uptime161839ms, WEATHER VALID, nhiệt độ25.3, mưa4, pump BAT. Lần chụp đầy đủ tiếp theo lúc20:05:41.577Z:

```text
receivedAt=2026-10-21T20:05:37.088Z
bootId=54ecc9ff-d982d7ce-17595310 sequence=38 uptimeMs=186864
soilMoisturePercent=12.99145
weatherSource=REAL weatherStatus=VALID
temperatureC=25.3 rainProbabilityPercent=4 precipitationMm=0
weatherUpdatedAt=2026-10-21T20:03:15Z
pumpState=TAT decision=KHONG_TUOI mode=AUTO
reason=Dang cho 5 giay sau chu ky truoc
```

[JSON API/SQLite chụp thực tế](../../../backend/test-results/tls-recovery-final.json) do script capture có sẵn tạo ra; đây không phải log UART. Bơm BAT rồi TAT/cooldown ở hai thời điểm lấy mẫu khác nhau là vận hành đúng; không dùng polling5s để khẳng định độ chính xác xung GPIO.

Kết luận: **Build và native tests PASS; bản mới đã phục hồi dữ liệu thật trên Wokwi sau lỗi mạng.** Chưa ép lỗi socket có kiểm soát hoặc đo trực tiếp mốc retry5s/15s bằng UART đầy đủ; policy được kiểm thử native và dùng trong firmware. Chưa có errno của lỗi -78 ban đầu nên không kết luận nguyên nhân mạng gốc đã bị loại bỏ vĩnh viễn. Thay đổi khắc phục lịch phục hồi chậm và thiếu chẩn đoán, không hứa Internet/Gateway sẽ không gián đoạn nữa.

## Chạy lại

Build firmware, mở Wokwi bằng F1 → Wokwi: Start Simulator. Extension hiện tự reload khi firmware.bin thay đổi. Chờ NTP hợp lệ rồi theo dõi `TLS_END ... verify_flags=0 peer=yes`, `HTTP_RESPONSE status=200`, `JSON_END JSON_OK`, `RESULT_RECEIVED accept=yes`, `WEATHER VALID`. Khi UNKNOWN bơm vẫn TẮT. Backend HTTP201 chỉ xác nhận gửi telemetry, không chứng minh Open-Meteo thành công.

Nếu lỗi socket tái phát, log cuối nay có errno và tên lỗi rõ ràng; xem RETRY_SCHEDULE5s/15s/60s. Không tăng timeout hoặc bỏ xác thực để ép thành công. Thời gian millis là thời gian mô phỏng, có thể khác thời gian thực khi Wokwi chạy dưới100% tốc độ.
