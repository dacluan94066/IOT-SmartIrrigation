# Sửa lỗi Open-Meteo UNKNOWN do thiếu CA — 19/11/2026

## Nguyên nhân đã đối chiếu

Trước sửa, Wokwi vẫn Wi-Fi/BackendCONNECTED, NTPVALID nhưng báo:

```text
TLS_HANDSHAKE_ERROR: phase=SERVER_CERTIFICATE fatal=-9984 last=-9984
errno=11 verify=0x8 X509 - Certificate verification failed
```

Header mbedTLS của Arduino core định nghĩa `0x08=MBEDTLS_X509_BADCERT_NOT_TRUSTED`, khác với expired/future. Bundle firmware cũ chỉ có ISRG Root X2. PC dùng chính CA đó lỗi `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`; kho CA mặc định vẫn xác thực HTTPS thành công/HTTP200, chuỗi quan sát là `open-meteo.com -> YR1 -> Root YR -> ISRG Root X1`.

Đây là thiếu trust anchor cho chuỗi X1, không phải lỗi login/React/Backend hoặc bằng chứng NTP mất đồng bộ. Theo [chuỗi CA chính thức Let's Encrypt](https://letsencrypt.org/certificates/), nhánh YR dẫn tới X1 và các nhánh YE có đường dẫn X2. Chỉ thay X2 bằng X1 có thể lại bỏ sót đường dẫn còn lại, nên giữ cả hai.

Firmware vô hiệu forecast khi cập nhật lỗi rồi gửi UNKNOWN/null lên Backend. Vì vậy Web hiển thị UNKNOWN đúng telemetry, dù lần trước đã nhận forecast thành công. Timestamp cũ vẫn là thời điểm lần thành công cuối, không phải dấu hiệu Web đã cập nhật forecast mới.

## Thay đổi trong bản sửa

1. `include/WeatherCertificates.h`: thêm CA tự ký X1 chính thức vào PEM bundle trước X2; không pin leaf/intermediate ngắn hạn và không nạp toàn bộ kho CA không cần thiết.
2. `src/WeatherTransport.cpp`: thêm log `TLS_CA_READY trusted_roots=<count>` sau khi parse toàn bundle. Logic từ chối parse lỗi/một phần vẫn giữ nguyên.
3. `test/weather-certificates.test.mjs`: kiểm tra fingerprint, tính CA/tự ký/thời hạn, source invariant xác thực TLS; kiểm tra HTTPS thật cho X1/X2/Open-Meteo và từ chối hostname sai khi bật live.
4. `README.md`: cập nhật tài liệu trust bundle, cách test và nạp lại firmware.
5. Báo cáo/log trong thư mục này. Không sửa Backend, Frontend, database, GPIO, thuật toán, ngưỡng hoặc lịch NTP/retry/timeout.

`MBEDTLS_SSL_VERIFY_REQUIRED`, hostname/SNIapi.open-meteo.com, peer certificate/verify flags và điều kiện thời gian đều giữ nguyên. Không setInsecure, không HTTPthayHTTPS, không thời gian giả. `DEMO_WEATHER_MODE=false` giữ nguyên; GPIO34/26/27,40/70%,rain60%,10s/5s không đổi.

### Nguồn CA và fingerprint SHA256

- [ISRG Root X1 PEM chính thức](https://letsencrypt.org/certs/isrgrootx1.pem): `96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6`.
- [ISRG Root X2 PEM chính thức](https://letsencrypt.org/certs/isrg-root-x2.pem): `69:72:9B:8E:15:A8:6E:FC:17:7A:57:AF:B7:17:1D:FC:64:AD:D2:8C:2F:CA:8C:F1:50:7E:34:45:3C:CB:14:70`.

## Kết quả kiểm tra

| Kiểm tra | Kết quả | Giới hạn |
|---|---|---|
| Fingerprint/root bundle | PASS | Đúng2CA, fingerprint chính thức; cả hai tự ký/CA và chưa hết thời hạn chứng chỉ |
| Mandatory verification source invariants | PASS | Kiểm tra sourcekhông phải chạy mbedTLS trong native |
| Official X1 endpoint qua bundle | PASS HTTP200, xác thựcTLS | TừPC, không phải Wokwi |
| Official X2 endpoint qua bundle | PASS HTTP200, xác thựcTLS | TừPC, không phải Wokwi |
| Open-Meteo thật qua bundle | PASS HTTP200, nhiệt độ26,5°C, rain[0,0,0],issuerYR1 | TừPC, không phải Wokwi |
| Hostname sai | PASS: bị từ chối `ERR_TLS_CERT_ALTNAME_INVALID` | TLS thực trênPC, mỗi test bắt tay mới |
| Tổng Node CA tests cuối cùng | **7/7 PASS,0FAIL,0SKIP** | Có3testoffline/source và4testlivePC |
| Native C++ controller/parser/policies | **147checksPASS** | Không phải đoGPIO/FreeRTOS/TLS runtime |
| PlatformIO | **SUCCESS18,87s**,RAM50524/327680,Flash963229/1310720 | Build firmwareREAL mới; [log](platformio-build.log) |
| Wokwi firmware mới | **REAL/VALID** sau tự reload | Đã quan sát Serial có cập nhật thành công00:42:43UTC+7; bootmới bên dưới |
| Backend nhận forecast mới | **PASS HTTP200/stateREAL/VALID**,telemetrymới | Không dùng snapshot cũ của boottrước để nhậnPASS |
| Dashboard trình duyệt | Đã quan sát card**REAL/VALID**,“Khả năng mưa thấp”,26,5°C,đất50,1%,bơmTẮT | Không nhận là kiểm tra toàn bộUI hoặc responsive |

Bài negative-hostname đầu tiên của test mới bị ảnh hưởng bởi TLS session cache của Node (callback kiểm tra tên không được chạy lại). Helper đã dùng `agent:false` để buộc handshake mới và test xác nhận callback được gọi; chạy lại toàn bộ7test đạt. Đây là điều chỉnh test harness, không phải bỏ xác thực trong firmware hoặc đổi assertion để cho qua.

### Snapshot thiết bị sau sửa

APIreadback lúc2026-11-18T17:43:56Z, UTC+7 là19/11/2026 00:43:56:

```json
{
  "id":2160,
  "bootId":"3437bba1-a4e40d82-9155b511",
  "sequence":14,
  "receivedAt":"2026-11-18T17:43:52.589Z",
  "weatherUpdatedAt":"2026-11-18T17:42:43Z",
  "uptimeMs":66732,
  "soilMoisturePercent":50.06105,
  "temperatureC":26.5,
  "rainProbabilityPercent":0,
  "precipitationMm":0,
  "weatherSource":"REAL",
  "weatherStatus":"VALID",
  "mode":"AUTO",
  "pumpState":"TAT",
  "decision":"KHONG_TUOI",
  "reason":"Do am tu 40% den duoi 70%; khong bat chu ky moi"
}
```

Boottrước `dca71d14-15b51ebc-3bc18239` có weatherUpdatedAt17:13:54Z vàUNKNOWN. Bootmới/update17:42:43Z sauBuild chứng minh đã nhận forecast mới, không phải chỉ xóa lỗi trênWeb hoặc dùng bản cũ.

### Artifact Build

Firmware969808bytes,mtime2026-11-18T17:42:28.754Z; SHA256:

```text
ed718b8126a800030792b16d7266219870baa8e64a3426119e125357be558d61
```

ELF/bin chứa credentiallocal, vẫn ignored, không đưa lênGitHub. GPIO/config/diagram không thay đổi, `git diff --check` không báo lỗi whitespace. [Native log](native-tests.log).

## Cách kiểm tra lại, không cần thay dây

Tại thư mục gốc project:

```powershell
node --test test/weather-certificates.test.mjs
$env:WEATHER_TLS_LIVE_TESTS='1'
node --test test/weather-certificates.test.mjs
Remove-Item Env:\WEATHER_TLS_LIVE_TESTS
& 'C:\Users\Admin\.platformio\penv\Scripts\platformio.exe' run -e esp32dev
```

Live test kết nối Internet từPC và có timeout12giây/request; lỗi mạng phải ghi nhận riêng, không bỏ xác thực để nhậnPASS. Các lệnh trên là hướng dẫn cho lần sau, không cần lặp lại khi bản này đã được nạp.

Wokwi đã tự nạp lại firmware trong lượt sửa và có dữ liệu mới. Nếu sau này vẫn đang chạy artifact cũ, Stop/StartSimulator sauBuild. Giữ Backend3001 chạy; Dashboard polling tự nhận dữ liệu, không cầnBuildFrontend/restartBackend. Log mong đợi làTIMEVALID,CAready2,TLS_ENDverifyflags0peer=yes,HTTP200,JSONOK,RESULTacceptyes,REAL/VALID. Không khẳng định đã lưu đầy đủ rawSerial của từng bước: bằng chứng lượt này là quan sát UI/Serial và snapshot Backend bên trên.

## Giới hạn và bàn giao

Không chờ thêm15phút để thử chu kỳforecast tiếp theo, không chạy soak/timingGPIO và không sửa vấn đề telemetryscheduler hoặc thiếuRH trênDashboard. Hai CA hiện tại đã được đối chiếu; không bảo đảm nhà cung cấp không thay CA trong tương lai. Nếuverify0x8 tái diễn, đối chiếu chuỗi thật và fingerprintchính thức, không tắtTLS.

Backend/Wokwi được giữ chạy; pot50%,AUTO,bơmTẮT. Browserđã hiển thịVALID. Không resetSQLite/credential, không cài thư viện, không thay timeout hoặc tựpush/commitGitHub trong lượt này. Các báo cáoGĐ5 lịch sử được giữ nguyên; kết quả mới ở đây không tự biến các phép đo thiếu thànhPASS.
