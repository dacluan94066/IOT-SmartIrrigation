import { useState } from "react";
import type { FormEvent } from "react";
import {
  Sprout,
  LockKeyhole,
  ArrowRight,
  ShieldCheck,
  Droplets,
  CloudSun,
  Eye,
  EyeOff,
} from "lucide-react";
import { api } from "../services/api";
import type { Session } from "../types/api";
export default function Login({
  onLogin,
  initialError,
  onRetry,
}: {
  onLogin: (session: Session) => void;
  initialError?: string;
  onRetry: () => void;
}) {
  const [password, setPassword] = useState(""),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const session = await api.login(password);
      if (session.authenticated) {
        setPassword("");
        onLogin(session);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đăng nhập.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-shell">
      <section className="login-visual">
        <a href="/" className="brand">
          <span className="brand-mark">
            <Sprout size={27} />
          </span>
          <span>
            Smart<span className="brand-light">Irrigation</span>
          </span>
        </a>
        <div className="login-hero-content">
          <span className="hero-tag">
            <Sprout size={15} />
            KẾT NỐI CÙNG THIÊN NHIÊN
          </span>
          <h1>
            Mỗi giọt nước.
            <br />
            Một mầm xanh.
          </h1>
          <p>
            Chăm sóc khu vườn thông minh hơn với dữ liệu đất và dự báo thời
            tiết, ngay trong tầm tay.
          </p>
          <div className="login-illustration" aria-hidden="true">
            <div className="illustration-sun" />
            <div className="illustration-soil" />
            <div className="illustration-stem" />
            <div className="illustration-leaf leaf-one" />
            <div className="illustration-leaf leaf-two" />
            <div className="illustration-leaf leaf-three" />
            <span className="illustration-widget widget-water">
              <Droplets size={23} />
              Dữ liệu từ đất
            </span>
            <span className="illustration-widget widget-weather">
              <CloudSun size={24} />
              Đón trước thời tiết
            </span>
          </div>
        </div>
        <p className="login-visual-footer">ESP32 · OPEN-METEO · WOKWI</p>
      </section>
      <section className="login-form-side">
        <div className="login-form-wrap">
          <span className="icon-tile icon-green">
            <LockKeyhole size={26} />
          </span>
          <p className="eyebrow">KHÔNG GIAN QUẢN TRỊ</p>
          <h2>Chào mừng trở lại</h2>
          <p className="login-intro">
            Đăng nhập để theo dõi khu vườn và điều khiển tưới an toàn.
          </p>
          <form onSubmit={(e) => void submit(e)}>
            <label htmlFor="password">Mật khẩu Dashboard</label>
            <div className="password-input">
              <input
                id="password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                required
                maxLength={128}
                placeholder="Nhập mật khẩu được cấp"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                onClick={() => setVisible((v) => !v)}
              >
                {visible ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
            {(error || initialError) && (
              <div className="login-error" role="alert">
                {error || initialError}
              </div>
            )}
            <button
              className="button button-green login-submit"
              disabled={busy}
            >
              {busy ? "Đang xác thực…" : "Vào Dashboard"}
              <ArrowRight size={18} />
            </button>
          </form>
          {initialError && (
            <button className="text-link" onClick={onRetry}>
              Kiểm tra kết nối lại
            </button>
          )}
          <div className="login-security">
            <ShieldCheck size={19} />
            <p>
              Phiên đăng nhập được bảo vệ. Token thiết bị và quản trị được giữ
              tại Server, không lưu trong trình duyệt.
            </p>
          </div>
          <p className="login-footnote">
            Đồ án IoT · Hệ thống tưới tiêu thông minh
          </p>
        </div>
      </section>
    </main>
  );
}
