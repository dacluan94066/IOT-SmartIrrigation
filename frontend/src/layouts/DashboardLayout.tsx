import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  SlidersHorizontal,
  ChartNoAxesCombined,
  Sprout,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useDashboard } from "../hooks/useDashboard";
import { Badge, ErrorNotice } from "../components/ui";
import { dateTime, duration } from "../utils/format";
const links = [
  { to: "/", name: "Tổng quan", icon: LayoutDashboard },
  { to: "/dieu-khien", name: "Điều khiển tưới", icon: SlidersHorizontal },
  { to: "/lich-su", name: "Lịch sử & thống kê", icon: ChartNoAxesCombined },
  { to: "/he-thong", name: "Trạng thái hệ thống", icon: Activity },
];
export function DashboardLayout({ onLogout }: { onLogout: () => void }) {
  const d = useDashboard();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Đến nội dung chính
      </a>
      {open && (
        <button
          className="sidebar-backdrop"
          aria-label="Đóng điều hướng"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <NavLink to="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark">
            <Sprout size={25} />
          </span>
          <span>
            Smart<span className="brand-light">Irrigation</span>
            <small>CHĂM ĐẤT · DƯỠNG XANH</small>
          </span>
        </NavLink>
        <button
          className="mobile-close icon-button"
          aria-label="Đóng menu"
          onClick={() => setOpen(false)}
        >
          <X size={20} />
        </button>
        <p className="nav-caption">KHÔNG GIAN QUẢN LÝ</p>
        <nav aria-label="Điều hướng chính">
          {links.map(({ to, name, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `nav-link ${isActive ? "nav-active" : ""}`
              }
            >
              <Icon size={20} />
              <span>{name}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-device">
          <span className="sidebar-device-icon">
            <Activity size={19} />
          </span>
          <div>
            <strong>{d.session.deviceId}</strong>
            <span>ESP32 · Wokwi</span>
          </div>
          <span
            className={`device-dot ${d.online ? "device-dot-online" : ""}`}
          />
        </div>
        <div className="sidebar-bottom">
          <div className="safety-card">
            <ShieldCheck size={20} />
            <strong>An toàn từ thiết bị</strong>
            <p>Giới hạn bơm luôn được bảo vệ bởi firmware ESP32.</p>
          </div>
          <p className="sidebar-version">
            Đồ án IoT <span>Giai đoạn 04</span>
          </p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="app-header">
          <div className="header-left">
            <button
              className="mobile-menu icon-button"
              aria-label="Mở menu"
              onClick={() => setOpen(true)}
            >
              <Menu size={23} />
            </button>
            <span className="breadcrumb">
              Không gian làm việc<span>/</span>
              <strong>Vườn thông minh</strong>
            </span>
          </div>
          <div className="header-right">
            <Badge
              tone={
                d.backendConnected
                  ? "green"
                  : d.current.initialLoading
                    ? "gray"
                    : "red"
              }
              dot
            >
              {d.backendConnected
                ? "Backend kết nối"
                : d.current.initialLoading
                  ? "Đang kết nối"
                  : "Mất Backend"}
            </Badge>
            <button
              className="icon-button refresh-button"
              title="Cập nhật dữ liệu"
              aria-label="Cập nhật dữ liệu"
              onClick={d.refresh}
            >
              <RefreshCw size={18} />
            </button>
            <div className="header-divider" />
            <span className="avatar" title="Phiên quản trị local">
              QT
            </span>
            <button
              className="icon-button"
              aria-label="Đăng xuất"
              title="Đăng xuất"
              onClick={onLogout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {d.current.error && (
            <ErrorNotice
              message={`${d.current.error.message} Các giá trị còn hiển thị là bản ghi cuối, không phải dữ liệu mới.`}
            />
          )}{" "}
          {!d.online && !d.current.initialLoading && d.state && (
            <ErrorNotice
              message={`ESP32 OFFLINE: chưa nhận telemetry trong ${duration(d.age || 0)}. Điều khiển tạm khóa; không xác nhận trạng thái bơm hiện tại.`}
            />
          )}
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            <span
              className={`device-dot ${d.online ? "device-dot-online" : ""}`}
            />
            ESP32 {d.online ? "ONLINE" : "OFFLINE"}
            {d.state ? ` · Nhận lúc ${dateTime(d.state.receivedAt)}` : ""}
          </span>
          <span>
            SmartIrrigation <span className="footer-dot">·</span> Giờ Việt Nam
            UTC+7
          </span>
        </footer>
      </div>
    </div>
  );
}
