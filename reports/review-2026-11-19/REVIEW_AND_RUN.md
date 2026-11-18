# Rà soát và hướng dẫn chạy SmartIrrigation — 19/11/2026

## Kết luận ngắn

Các bài kiểm thử hiện có và Build đều đạt. Đã **Clean rồi Build firmware REAL thành công**, không chỉ suy luận từ Serial hoặc artifact cũ. Chưa chạy lại Wokwi/browser E2E trong lượt này; không coi kết quả PC là bằng chứng phần cứng/mô phỏng runtime mới.

Có một vấn đề lập lịch telemetry trong điều kiện poll chậm được tái hiện ở mức logic, cùng các thiếu sót dữ liệu/câu chữ/tài liệu bên dưới. Chỉ chẩn đoán, không sửa tính năng, thuật toán, GPIO, TLS/NTP hoặc cấu hình. Không xóa/reset SQLite sản phẩm. Không khởi động dịch vụ sản phẩm; các HTTP test dùng SQLite riêng/in-memory và đã kết thúc.

## Kiểm thử vừa thực hiện

| Hạng mục | Kết quả | Phạm vi |
|---|---|---|
| Backend `npm.cmd test` | **33/33 PASS**, fail0 | HTTP thật + SQLite test riêng, không phải telemetry Wokwi mới |
| Frontend `npm.cmd test` | **6/6 PASS** | Unit fixture; không phải browser E2E |
| Frontend `npm.cmd run build` | **PASS** | TypeScript và Vite,2625modules,1,74s |
| C++ `.\test\run-native-tests.ps1` | **147 checks PASS** | Production controller/parser/policies trên PC, không phải GPIO/socket/FreeRTOS runtime |
| PlatformIO Build ban đầu | **SUCCESS**,16,22s | Incremental; sau đó đã Clean/Build để xác minh lại từ đầu |
| PlatformIO Clean + Build | **SUCCESS**,Clean1,45s,Build62,95s | Biên dịch lại source và thư viện, tạo firmware.bin/ELF mới với Configfalse |
| Diagram JSON | **PASS** | Parse JSON thành công,5parts/9connections; không thay thế lint toàn bộ registry Wokwi |
| HTTP smoke production assets | **PASS** | Server kiểm thử cổng ngẫu nhiên + DBmemory: health200; /,/dieu-khien,/lich-su,/he-thong đều200HTML; JSasset200; state chưa login401 |
| Open-Meteo trên PC | **PASS HTTP200/TLS1.2, authorized=true** | Dùng chính CA nhúng, SNIapi.open-meteo.com và rejectUnauthorized=true; không setInsecure. Không chứng minh TLS/NTP trong Wokwi |
| Wokwi/live proxy integration/browser controls | **NOT_RUN trong lượt này** | Khi kiểm tra không có listener3001/5173. Không chạy test:integration với fixture để nhận PASS giả |
| Soak15phút, timingGPIO, responsive đầy đủ | **NOT_RUN trong lượt này** | Không thay thế các khoảng trống đã công bố ở GĐ5 |

Tổng186checks/tests thuộc ba bộ native147+Backend33+Frontend6; không cộng vào48TCGĐ5. Không sửa thống kê43PASS/0FAIL/2NOT_RUN/3BLOCKED của lần GĐ5 cũ.

Log mới: [Build sạch](firmware-clean-build.log), [Backend](backend-tests.log), [Native](native-tests.log). Các kết quả Frontend, smoke, cấu hình và PC HTTPS được đọc từ output công cụ trong lượt kiểm tra và ghi tóm tắt tại đây, không giả lập file log raw chưa có.

## Bằng chứng firmware REAL hiện tại

- Trước/sau Build, `include/Config.h` có `constexpr bool DEMO_WEATHER_MODE = false;`, demo initial20. Không sửa file giữa các bước.
- ConfigSHA256: `d6fa912f6cc11737e2a148ca3916f635d167fd47975fdad6aff671f05b6098a9`.
- Đã chạy PlatformIO `run -e esp32dev -t clean` thành công, sau đó `run -e esp32dev` thành công. Log có biên dịch lại WeatherService/main/BackendService và bước tạo firmware.bin.
- `.pio/build/esp32dev/firmware.bin`:967728bytes; SHA256 `f23400a2a3e816a7f7f933f76959ad128d08595dfff1d3af51aa7f2bb5dd13de`.
- Mtime mới:2026-11-18T17:05:06.0101125Z =19/11/2026 00:05:06 UTC+7. Hash trùng binary22/10không phải bằng chứng chưa Build: lần này có log Clean/compile/link/createbin mới. Build có thể tạo binary giống hệt từ cùng source.
- Không có thông báo nhánhDEMO trong binary; có hostnameOpen-Meteo. Đây là đối chiếu bổ sung, **bằng chứng chính là Build sạch với sourcefalse**.
- RAM50524/327680(15,4%); Flash961157/1310720(73,3%). ELF tồn tại; wokwi.toml trỏ đúng hai file.

Tồn đọng cũ “thiếu bằng chứng BuildREAL cho artifact” đã được giải quyết tại tầngBuild bằng lần chạy này. Không tự cập nhật các báo cáo GĐ5 lịch sử hoặc chuyển TC10/soak/GPIO sangPASS; cần runtime riêng để chứng minh những mục đó.

## Cấu hình hiện tại đã kiểm tra, không công khai secret

Nodev24.16.0, npm11.13.0 phù hợp engines của project. Dependencies đã có, không cần cài lại chỉ để chạy.

- Backendenv hợp lệ:HOST127.0.0.1,PORT3001,SQLite `backend/data/irrigation.sqlite`.
- CORS có cả `http://localhost:5173` và `http://127.0.0.1:5173`.
- BackendLocalenabled=true,hosthost.wokwi.internal,port3001,deviceesp32-01. Token/ID firmware khớp envBackend; chỉ ghi kết quả boolean, không in token.
- Có cấu hình Dashboard và filemật khẩu local; mật khẩu trong file khớp hashserver. Không reset hoặc tạo lại credential.
- Frontend chỉ có `.env.example`, Vite/previewport5173, proxyAPI127.0.0.1:3001.
- GPIO34/26/27; ngưỡng40/70%,mưa60%,max10s/cooldown5s; DEMOfalse giữ nguyên.

## Vấn đề còn lại

### R01 — MEDIUM: poll chậm có thể làm telemetry không được gửi

Vị trí: `src/BackendService.cpp` dòng69 và128–131; `include/BackendConfig.h` poll2000ms.

`lastPollAt_` được đặt lúc enqueue. Sau khi worker hoàn thành, scheduler ưu tiên ACK rồi poll nếu `now-lastPollAt_ >= 2000`, cuối cùng mới telemetry. Nếu mọi poll thành công mất từ2giây trở lên nhưng vẫn dưới deadline8giây, lần rảnh nào cũng lại chọn poll; `pendingTelemetry_` có thể bị bỏ đói. Backend có thể vẫn healthy theo poll, nhưng Dashboard không nhận snapshot mới và báo ESP32OFFLINE.

Đã tái hiện lựa chọn nhánh trên PC bằng cách trích block scheduler production, đổi cú pháp member/namespace C++ sangJS và giả lập thời điểm hoàn thành; **không biên dịch/chạy đầy đủ BackendService ESP32 và không phải runtime Wokwi**:

| Timing giả lập | Kết quả lựa chọn |
|---|---|
| Mỗi lượt100ms,8lượt | Poll1,Telemetry1,pendingTelemetry=false |
| Mỗi poll2100ms,8lượt | Poll8,Telemetry0,pendingTelemetry=true |

Đây là lỗi logic có điều kiện được suy ra từ code/tái hiện mức nhánh, chưa chứng minh đang xảy ra trong môi trường mạng thật. Đề xuất lượt sửa riêng: bảo đảm fairness/budget telemetry giữa poll, giữ ưu tiên OFF/ACK và kiểm tra lease; bổ sung test scheduler. **Chưa sửa theo phạm vi yêu cầu kiểm tra.**

### R02 — MEDIUM: độ ẩm không khí không tới Dashboard

WeatherParser đã đọc RH thật; nhưng `BackendService::publish` không serialize `relativeHumidityPercent`; schema strictBackend và SQLite cũng không có trường này. Frontend có card nhưng chỉ hiển thị—. Đây là thiếu đường dữ liệu, không phải lỗi React hay Open-Meteo. Chưa sửa hợp đồng API/database/firmware.

### R03 — LOW: câu mô tả nguồn dự báo gây nhầm trong DEMO

`frontend/src/pages/Overview.tsx` dòng140 luôn ghi “Dự báo do ESP32 nhận từ Open-Meteo”, kể cả nhãnSIMULATED. DEMOfalse hiện tại không chịu ảnh hưởng hiển thị này; nếu bậtDEMO để trình diễn phải giải thích rõ là mô phỏng. Chưa sửa giao diện.

### R04 — LOW: README có thông tin mâu thuẫn

READMEgốc dòng7/11 và backend/README dòng11 còn ghi chưa cóReact dù project cóFrontend hoàn chỉnh. Nên sửa tài liệu ở lượt được phép. Hướng dẫn chạy bên dưới theo code thực tế, không theo đoạn README cũ đó.

### Khoảng trống không được nhận PASS

Chưa kiểm tra lại Wokwi/IoTGateway, ACKruntime, thao tác điều khiển, mất mạng,15phút ổn định,GPIO chính xác hoặc responsive trong lượt này. PC HTTPS thành công không loại trừ TLS chậm/lỗi trong simulator. Không phát hiện compilefailure/assertionfailure trong các bộ hiện có; không khẳng định “không còn lỗi” hoặc đã nghiệm thu phần cứng thật.

## Cách chạy đơn giản nhất trên máy hiện tại

Không cần tạo lại project, token, mật khẩu hoặc SQLite; không cần cài dependency lại khi máy vẫn có node_modules hiện tại.

### 1. Chạy Web và Backend cùng một cổng

Mở terminalPowerShell trong VSCode:

```powershell
cd D:\DaiHocNam4\IOT\SmartIrrigation\frontend
npm.cmd run build
cd ..\backend
npm.cmd start
```

Giữ terminal này chạy. Backendphục vụ cả API và `frontend/dist`. Mở **http://127.0.0.1:3001**. Không cần `npm run dev` trong cách này. Nếu báoEADDRINUSE, không mở thêm server hoặc tắt tiến trình lạ; kiểm tra xem Backendcũ đã chạy rồi chưa.

Mật khẩu: mở `backend/.dashboard-login` trongVSCode, lấy giá trị trường`password` để đăng nhập. Không dùng tokenAPI làm mật khẩu, không đưa file này vàoGit/chia sẻ màn hình. File đã có và khớp ở lần rà soát này.

### 2. Chạy ESP32 trên Wokwi

1. VSCode → File/OpenFolder đúng `D:\DaiHocNam4\IOT\SmartIrrigation`.
2. Cần extensionPlatformIOIDE vàWokwiSimulator đã kích hoạt theo cấu hình máy. Firmware vừa được BuildREAL; chỉ cần Buildlại khi đổi code/config.
3. Nếu cần Build: PlatformIO → ProjectTasks → esp32dev → General → Build. Hoặc mở terminal thứ hai tại thư mục gốc và chạy:

```powershell
& 'C:\Users\Admin\.platformio\penv\Scripts\platformio.exe' run -e esp32dev
```

4. F1 → **Wokwi: Start Simulator**. Không dùng Upload/COMport vì đây là mô phỏng. Nếu đang có phiênWokwi cũ, StoprồiStart để dùng firmware mới.
5. Giữ panelWokwi hiện và mô phỏng đang chạy. Chờ Wi-FiCONNECTED,NTPVALID,WeatherREAL/VALID vàBackendHTTP200/201accept=yes. Wi-FiCONNECTED hayBackendHTTP200 riêng lẻ chưa chứng minh Open-Meteo thành công.
6. Dashboard cần timestamptelemetry mới/ESP32ONLINE; dữ liệu lịch sử còn trongSQLite không có nghĩa ESP32đang online.
7. Xoay potentiometer về khoảng20–25%: AUTOchỉ bật khi weatherVALID,mưa<60% vàhếtcooldown. Mưa thật cao thì hoãn là đúng. Khoảng50% không bắt đầu chu kỳAUTO mới; từ70%trởlên bơm dừng.
8. ManualON cần xác nhận, chờACKrồi xem telemetry bơm thật; bị từ chối vìđất80%,mưa/UNKNOWN/cooldown là bảo vệ, không ép bỏ qua.

### 3. Nếu muốn chế độ phát triển Frontend

Giữ Backend3001 chạy; terminalkhác:

```powershell
cd D:\DaiHocNam4\IOT\SmartIrrigation\frontend
npm.cmd run dev
```

Mởhttp://127.0.0.1:5173. Đây là lựa chọn thay choWebproduction3001 khi sửaUI, không phải bước bắt buộc để demo. Viteproxy `/api` về3001.

### 4. Chẩn đoán nhanh khi chạy

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/v1/health
```

- PChealthlỗi: kiểmtra Backendterminal/port/env trước.
- PChealthđược nhưngESP32BackendOFFLINE: xem DNShost.wokwi.internal,TCP3001,GatewayVSCode vàHTTPstatus; không đổi ESP32thànhlocalhost, không tắtfirewall/xác thực.
- UIBackendCONNECTED nhưngESP32OFFLINE: chờ/kiểmtra telemetry mới, không dùng dữliệuSQLitecũ để nhậnPASS. Nếu pollchậm≥2s liên tục, xemR01.
- WEATHERUNKNOWN: đọc TIME/TLS/HTTP/JSONlog, không bậtDEMO để giả thành thời tiết thật và không setInsecure.

Máy mới thiếu dependency/config: dùng `npm.cmd ci` từng thư mục; chỉ khi chưa có credential mới dùng các scriptprovision theoBackendREADME rồi Buildlại. Không provision/resetmật khẩu hoặc SQLite vô cớ trên máy hiện tại.

## Thay đổi trong lượt rà soát

Chỉ bổ sung hồ sơ này và các log dưới `reports/review-2026-11-19/`; các artifact `.pio/`,Frontenddist/tsbuildinfo được công cụ Build tạo lại. Không sửa sourceứng dụng,config,GPIO,sơđồ haydatabase sản phẩm. Không chạy hoặc để lại Backend/Frontenddevserver sản phẩm. Các công cụ kiểmthửHTTP tạm đã đóng saukhi kiểmtra.
