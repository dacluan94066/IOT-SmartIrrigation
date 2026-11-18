import {
  Server,
  Wifi,
  ShieldCheck,
  CloudSun,
  Radio,
  Cpu,
  CheckCircle2,
  Info,
} from "lucide-react";
import { useDashboard } from "../hooks/useDashboard";
import { Badge, PageHeading } from "../components/ui";
import { dateTime, duration, modeLabel } from "../utils/format";
export default function System() {
  const d = useDashboard(),
    s = d.state;
  return (
    <>
      <PageHeading
        eyebrow="KẾT NỐI & CHẨN ĐOÁN"
        title="Trạng thái hệ thống"
        description="Phân biệt kết nối Server, dữ liệu thiết bị và chất lượng dự báo."
      />
      <div className="system-cards">
        <section className="panel system-card">
          <span
            className={`icon-tile icon-${d.backendConnected ? "green" : "red"}`}
          >
            <Server size={24} />
          </span>
          <Badge tone={d.backendConnected ? "green" : "red"} dot>
            {d.backendConnected ? "KẾT NỐI" : "MẤT KẾT NỐI"}
          </Badge>
          <h2>Backend Node.js</h2>
          <p>REST API và SQLite local</p>
          <dl>
            <div>
              <dt>Health API</dt>
              <dd>{d.backendConnected ? "OK" : "Chưa xác minh"}</dd>
            </div>
            <div>
              <dt>SQLite</dt>
              <dd>{d.backendConnected ? "Hoạt động" : "Chưa xác minh"}</dd>
            </div>
            <div>
              <dt>Giờ Server</dt>
              <dd>
                {d.current.data
                  ? dateTime(d.current.data.health.serverTime)
                  : "Chưa có"}
              </dd>
            </div>
          </dl>
        </section>
        <section className="panel system-card">
          <span className={`icon-tile icon-${d.online ? "green" : "gray"}`}>
            <Wifi size={24} />
          </span>
          <Badge tone={d.online ? "green" : "gray"} dot>
            {d.online ? "ONLINE" : "OFFLINE"}
          </Badge>
          <h2>Thiết bị ESP32</h2>
          <p>{d.session.deviceId} · Wokwi Simulator</p>
          <dl>
            <div>
              <dt>Telemetry cuối</dt>
              <dd>{dateTime(s?.receivedAt)}</dd>
            </div>
            <div>
              <dt>Tuổi bản ghi</dt>
              <dd>{d.age === null ? "Chưa có" : duration(d.age)}</dd>
            </div>
            <div>
              <dt>Ngưỡng offline</dt>
              <dd>{d.offlineMs / 1000} giây</dd>
            </div>
          </dl>
        </section>
        <section className="panel system-card">
          <span className="icon-tile icon-blue">
            <CloudSun size={25} />
          </span>
          <Badge tone={s?.weatherStatus === "VALID" ? "green" : "amber"}>
            {s?.weatherStatus || "UNKNOWN"}
            {!d.isCurrent ? " · bản cuối" : ""}
          </Badge>
          <h2>Dữ liệu thời tiết</h2>
          <p>Được ESP32 cung cấp, không gọi từ trình duyệt</p>
          <dl>
            <div>
              <dt>Nguồn</dt>
              <dd>{s?.weatherSource || "Chưa có"}</dd>
            </div>
            <div>
              <dt>Cập nhật dự báo</dt>
              <dd>{dateTime(s?.weatherUpdatedAt)}</dd>
            </div>
            <div>
              <dt>Độ ẩm không khí</dt>
              <dd>Chưa có trường trong API hiện tại</dd>
            </div>
          </dl>
        </section>
      </div>
      <div className="system-details-grid">
        <section className="panel system-details">
          <div className="panel-heading">
            <h2>
              <Cpu size={19} />
              Phiên thiết bị
            </h2>
            <Badge tone="gray">Chỉ đọc</Badge>
          </div>
          <dl>
            <div>
              <dt>Device ID</dt>
              <dd>{s?.deviceId || d.session.deviceId}</dd>
            </div>
            <div>
              <dt>Boot ID</dt>
              <dd className="monospace">{s?.bootId || "Chưa có"}</dd>
            </div>
            <div>
              <dt>Số thứ tự telemetry</dt>
              <dd>{s?.sequence ?? "—"}</dd>
            </div>
            <div>
              <dt>Uptime ESP32</dt>
              <dd>{s ? duration(s.uptimeMs) : "Chưa có"}</dd>
            </div>
            <div>
              <dt>Thời gian thiết bị</dt>
              <dd>{dateTime(s?.deviceTimestamp)}</dd>
            </div>
            <div>
              <dt>Chế độ ghi nhận</dt>
              <dd>{s ? modeLabel[s.mode] : "Chưa có"}</dd>
            </div>
          </dl>
          <p className="data-note">
            Uptime/giờ ESP32 có thể chậm hơn thời gian thực khi Wokwi mô phỏng
            dưới 100%. ONLINE dùng thời gian nhận tại Server, không dùng uptime.
          </p>
        </section>
        <section className="panel system-details">
          <div className="panel-heading">
            <h2>
              <ShieldCheck size={19} />
              Bảo mật & bảo vệ
            </h2>
          </div>
          <ul className="safety-list">
            <li>
              <CheckCircle2 size={18} />
              <span>
                Session cookie HttpOnly; API token không có trong mã React hoặc
                VITE_*.
              </span>
            </li>
            <li>
              <CheckCircle2 size={18} />
              <span>
                Lệnh POST có kiểm tra nguồn, CSRF và mã yêu cầu chống gửi trùng.
              </span>
            </li>
            <li>
              <CheckCircle2 size={18} />
              <span>
                Firmware giữ ngưỡng độ ẩm 40%/70%, mưa 60%, chạy tối đa 10 giây
                và nghỉ 5 giây.
              </span>
            </li>
            <li>
              <Radio size={18} />
              <span>
                Trạng thái3s, lệnh/ACK2s, lịch sử30s. Request có timeout và
                cleanup.
              </span>
            </li>
            <li>
              <Info size={18} />
              <span>
                OFF thủ công có TTL, không phải nút dừng khẩn cấp vật lý vô thời
                hạn.
              </span>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
