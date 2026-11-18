# SmartIrrigation — Web Dashboard Giai đoạn 4

React19 + TypeScript7 + Vite8 + **Tailwind CSS4.3** (`@tailwindcss/vite`, CSS `@import "tailwindcss"`) + Recharts + Lucide React + React Router. Giao diện tiếng Việt,4 trang, chạy local; không triển khai public.

## Chạy nhanh

Node.js24.16.x như Backend hiện có. Tại thư mục gốc SmartIrrigation:

```powershell
cd backend
npm.cmd ci
npm.cmd run provision-dashboard
npm.cmd start
```

Backend GĐ3 phải đã có `.env`/device token (nếu clone mới, chạy `npm.cmd run provision` trước). `provision-dashboard` chỉ thêm hash mật khẩu Dashboard, không đổi token thiết bị/quản trị hay firmware. Nếu đã cấu hình, không ghi đè mật khẩu cũ. Mật khẩu local nằm trong `backend/.dashboard-login`, mở file này trong VS Code để đăng nhập, không chia sẻ/commit. Không dùng ADMIN_API_TOKEN làm mật khẩu React.

Terminal thứ hai:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Mở **http://127.0.0.1:5173**, đăng nhập bằng mật khẩu Dashboard. Vite proxy `/api` sang `127.0.0.1:3001`, giữ request cùng origin và cookie; không chèn Bearer token từ Vite. Không chạy hai tiến trình trùng port. `.env.example` chỉ có cấu hình công khai, không có credential.

Trong VS Code: giữ mạch/firmware hiện có, F1 → **Wokwi: Start Simulator**. Không cần Build/upload ESP32 mới cho GĐ4. Chờ REAL/VALID và Backend HTTP201 trong Serial. Dashboard tự nhận telemetry qua Server; không gọi Open-Meteo trực tiếp.

## Bản production local (thuận tiện khi demo)

```powershell
cd frontend
npm.cmd run build
```

Sau đó khởi động/restart Backend đã cập nhật. Backend phục vụ `frontend/dist` và API cùng origin tại **http://127.0.0.1:3001**. Các route `/dieu-khien`, `/lich-su`, `/he-thong` hỗ trợ tải trực tiếp/refresh. Chỉ bind loopback. Nếu vừa Build lại trong khi trình duyệt đang mở bản cũ, reload để lấy bundle mới.

`npm.cmd run preview` cũng dùng port5173, thay cho dev (không chạy đồng thời). Thay BACKEND_PROXY_TARGET trong env chỉ khi cần; đây là cấu hình Node/Vite, không phải secret. Không đổi sang hostname/LAN/public hoặc cấu hình firewall để demo.

## Đăng nhập và bảo mật

- Thêm API `/api/v1/dashboard/session` (GET/POST), `/dashboard/logout` (POST), cùng các bản session-protected `/dashboard/state`, `/dashboard/history`, `/dashboard/commands` (GET/POST) dưới `/api/v1`.
- Session ID ngẫu nhiên32byte; lưu SHA256 trong bảng SQLite `dashboard_sessions`, tồn tại qua restart Backend. Cookie HttpOnly, SameSite=Strict, scope `/api/v1/dashboard`, hạn8h. Logout xóa session phía Server.
- Mật khẩu chỉ lưu scrypt hash trong Backend.env. Giới hạn5 lần đăng nhập sai/15phút. Không có API token/password trong bundle React, localStorage hoặc VITE_*.
- POST yêu cầu Origin allowlist + CSRF token của session; tạo lệnh có Idempotency-Key. API admin/device GĐ3 vẫn yêu cầu token riêng, cookie Dashboard không truy cập được các API đó.
- HTTP + cookie không Secure chỉ dành cho loopback local. Khi chuyển sang môi trường khác cần HTTPS và `DASHBOARD_COOKIE_SECURE=true`; không coi bản local là triển khai public production đã harden đầy đủ.
- CSRF token không phải API token; React chỉ giữ trong bộ nhớ phiên. Token thiết bị/admin không bao giờ được gửi cho React.

## Trang và nguồn dữ liệu

1. **Tổng quan:** đất/nhiệt độ/mưa/lượng mưa/bơm/quyết định/chế độ, tuổi dữ liệu, REAL/SIMULATED và VALID/UNKNOWN/STALE, biểu đồ và hoạt động gần nhất.
2. **Điều khiển tưới:** AUTO, bật có xác nhận, tắt ưu tiên; theo dõi các trạng thái PENDING/DELIVERED/EXECUTED/REJECTED/EXPIRED/SUPERSEDED và lý do ACK thực tế.
3. **Lịch sử và thống kê:** bộ lọc15phút/1h/24h/toàn bộ/tùy chọn UTC+7, filter tại SQLite theo `receivedAt`, phân trang20 dòng, biểu đồ100 mẫu mới nhất trong bộ lọc. Thống kê ghi rõ phạm vi100 mẫu, không đại diện toàn bộ lịch sử.
4. **Hệ thống:** Backend/SQLite, ESP32, thời tiết, boot/sequence/uptime, bảo mật và giới hạn an toàn.

Hợp đồng được kiểm tra bằng Zod theo response Backend thực tế. UNKNOWN/STALE/null dùng dấu `—`, không đổi thành0. Giá trị0mm thực vẫn hiển thị0 đúng nghĩa.

**Giới hạn dữ liệu:** telemetry GĐ3 chưa gửi/lưu/trả độ ẩm không khí. Card hiển thị `— / Chưa được API telemetry cung cấp`. Không giả số, không sửa ESP32 hoặc tự gọi API thời tiết khác để lấp chỗ trống. Frontend sẵn sàng nhận `relativeHumidityPercent` nếu sau này Backend thực sự cung cấp trường này.

## Cập nhật, offline và an toàn

- State+health mỗi3s; commands2s; history30s. Recursive timeout, không bắt đầu request tiếp khi request resource trước chưa xong; timeout7s, AbortController khi unmount/chuyển bộ lọc. Nếu một nhánh health/state lỗi, hủy nhánh còn lại.
- ESP32 ONLINE tính bằng tuổi `receivedAt` so với giờ Server (không dùng Wi-Fi badge/health để suy luận). Ngưỡng mặc định30s, dựa trên telemetry5s và độ chậm Wokwi. Cấu hình Backend `DASHBOARD_OFFLINE_MS`15–120s; có thể override công khai bằng VITE_OFFLINE_AFTER_MS trong cùng giới hạn.
- Backend mất kết nối: giữ dữ liệu cuối có cảnh báo; bơm ghi rõ chưa xác nhận trạng thái hiện tại; khóa gửi lệnh. Sau30s không telemetry sẽ OFFLINE. Server hoạt động lại, polling và session SQLite tự phục hồi, không cần reload/login lại nếu session còn hạn.
- Gửi lệnh không đổi lạc quan trạng thái bơm. Source of truth là telemetry; ACK EXECUTED chỉ xác nhận áp dụng lệnh, không bảo đảm bơm hiện đangON. Có độ trễ lấy mẫu5s + polling3s; không phải giám sát GPIO tức thời.
- Khóa request đang gửi/lệnh cùng loại đang chờ; MANUAL_OFF vẫn có thể ưu tiên thay ON đang chờ. OFF có hiệu lực15s; hết hạn/mất Backend về AUTO. Không phải emergency-stop vật lý vô thời hạn.
- Nếu POST lỗi mạng/5xx, kết quả có thể chưa rõ. Không tự retry lệnh; yêu cầu người dùng kiểm tra nhật ký trước khi thao tác tiếp. Idempotency cache phía Server hữu hạn/in-memory, không cam kết exactly-once qua restart/crash.

## Kiểm thử

```powershell
# Trong frontend/
npm.cmd test
npm.cmd run build
npm.cmd run test:integration
# Trong backend/
npm.cmd test
```

`npm test`: unit fixture, không phải tích hợp ESP32. `test:integration`: cần Vite5173 + Backend3001 + Wokwi đang gửi thật; đăng nhập bằng file local, đọc dữ liệu live, không gửi telemetry giả, kiểm tra credential không nằm trong bundle. Test không điều khiển bơm. Kiểm thử GUI thực tế/ảnh và kết quả chi tiết: [PHASE4_REPORT.md](PHASE4_REPORT.md).

Test demo bằng tay: đặt đất khoảng50%, chờ bơm AUTO tắt → AUTO → bật thủ công/xác nhận → chờ ACK/telemetry → tắt thủ công; đặt đất80% rồi bật thủ công để thấy REJECTED. Đợi OFF lease hết hạn trước AUTO/ON. Tắt Backend trong khi trang đã tải để kiểm tra cảnh báo, tuổi dữ liệu, khóa điều khiển; bật lại và theo dõi phục hồi.

Không có mock data trong ứng dụng. Không sửa GPIO, thuật toán, TLS/NTP hoặc sơ đồ dây.

## Cấu trúc

`src/components` thành phần UI/biểu đồ/bảng; `pages`4 trang và login; `layouts`sidebar/header; `services`REST client; `hooks`polling/context/history; `types`schema/type API; `utils`định dạng/thời gian/chuyển biểu đồ. Route được chia bundle, biểu đồ chỉ tải khi cần. CSS có reduced-motion và responsive390/768/1440 đã kiểm tra.

Tài liệu chính thức sử dụng: [Tailwind4 + Vite](https://tailwindcss.com/docs/installation/using-vite), [Vite](https://vite.dev/guide/), [React](https://react.dev/learn/build-a-react-app-from-scratch), [Recharts](https://recharts.github.io/en-US/api/LineChart/), [OWASP session](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
