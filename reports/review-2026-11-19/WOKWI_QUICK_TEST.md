# Kiểm thử nhanh runtime Wokwi — 19/11/2026

Thử trên phiên Wokwi đang chạy của người dùng, boot `dca71d14-15b51ebc-3bc18239`. Không Build/restart, không bật DEMO, không sửa code/GPIO/mạch/config. Thay đổi duy nhất trên mạch là giá trị potentiometer trong runtime, sau đó trả về512 (khoảng50%). Không xóa/reset SQLite.

## Bằng chứng REAL từ phiên chạy

Ảnh người dùng và Serial trực tiếp có nhiệt độ26,5°C, độ ẩm không khí84%, xác suất mưa0%, lượng mưa0mm; nguồnREAL/Open-Meteo, WEATHERVALID. WeatherupdatedAt là `2026-11-18T17:13:54Z` (19/11/2026 00:13:54UTC+7), uptime cập nhật126369ms. Đồng hồ/NTP đãVALID, callback1 trong Serial. Đây là forecast thực từ Wokwi, không phải phản hồi HTTPS thử riêng trên PC.

API Backend được đọc qua HTTP có xác thực, token không in ra. Snapshot/history thực của thiết bị, không ghi telemetry fixture vào sản phẩm.

| Test nhanh | Kết quả thực tế | Trạng thái |
|---|---|---|
| Đất ban đầu50,1%, AUTO | Stateid1864,soil50.06105%,REAL/VALID,rain0,pumpTAT,KHONG_TUOI; lý do40–70% không bắt đầu chu kỳ mới | PASS |
| Đất khô khoảng22,5% | Đặt pot230; ADC921,soil22.49084%; SerialBAT/TUOI; Backendstateid1873/1875/1876 cũngBAT,AUTO,REAL/VALID,rain0 | PASS |
| Chu kỳ tự động và cooldown | State1873uptime236857BAT →1874uptime241862TAT,lý do chờ5giây →1875uptime246869BAT;1877uptime256875TAT/cooldown | PASS quan sát trạng thái, không phải đo thời gianGPIO |
| Tăng đất lên80,1% | Đặt pot820; Serial `[DUNG TUOI] Do am dat da dat nguong 70%`; state1880–1882soil80.14652%,TAT/KHONG_TUOI,AUTO | PASS |
| Backend sống và SQLite | HealthHTTP200,statusok,databaseok; có các state/history mới cùngboot | PASS |
| Dashboard session/state/history | Tạo session test localHTTP200; state và historyDashboardHTTP200, dữ liệu80.14652%/TAT/REAL/VALID khớp. Logoutsession testHTTP200 sau kiểm tra | PASS tại tầngAPI, không phải kiểm tra renderBrowser |

### Trích bản ghi Backend

```text
id1873 uptime236857 soil22.49084 rain0 REAL/VALID pumpBAT decisionTUOI AUTO
id1874 uptime241862 soil22.49084 rain0 REAL/VALID pumpTAT reason=Dang cho 5 giay sau chu ky truoc
id1875 uptime246869 soil22.49084 rain0 REAL/VALID pumpBAT decisionTUOI AUTO
id1882 seq57 receivedAt2026-11-18T17:18:31.192Z uptime281899
soil80.14652 temp26.5 rain0 precipitation0 REAL/VALID
pumpTAT decisionKHONG_TUOI AUTO reason=Do am dat da dat nguong 70%
```

Các khoảng lấy mẫu telemetry khoảng5giây không cho biết thời điểm chính xác cạnhGPIO. Không nhận rằng đã đo runtime10giây/cooldown5giây bằng logic analyzer. Không nhậnPASSLED vật lý vì LED nằm ngoài phần nhìn rõ khi điều khiển UI.

## Khôi phục và giới hạn

Sau phép thử đã đặt sliderraw512; UI xác nhận512 và Serial đổi về lý do vùng40–70%, giữbơmTAT. StateBackend cuốiid1895,receivedAt2026-11-18T17:19:40.567Z,uptime347074ms xác nhậnsoil50.06105%,REAL/VALID,rain0,TAT/KHONG_TUOI,AUTO. DEMOfalse/AUTO giữ nguyên; giữ Backend và Wokwi đang chạy cho người dùng. Chỉ sessionAPI tạm của bài test đượclogout, không đăng xuất session trình duyệt của người dùng.

Chưa chạy trong lượt này: MANUAL_ON/OFF,REJECTED quaWebGUI,mưa85%,forecastrefresh15phút tiếp theo, mấtBackend/Wi-Fi,soak15phút, đoGPIO và responsive. Không sửa tổng48TC hay các báo cáoGĐ5 cũ từ bài smoke giới hạn này.
