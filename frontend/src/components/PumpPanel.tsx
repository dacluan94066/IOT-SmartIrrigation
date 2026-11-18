import { Waves, ShieldCheck, Timer, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useDashboard } from "../hooks/useDashboard";
import { Badge } from "./ui";
import { decisionLabel, humanReason, modeLabel } from "../utils/format";
export function PumpPanel({ link = true }: { link?: boolean }) {
  const { state, isCurrent } = useDashboard();
  const on = state?.pumpState === "BAT";
  return (
    <section className="panel pump-panel">
      <div className="panel-heading">
        <h2>Trạm bơm tưới</h2>
        <Badge tone={isCurrent ? (on ? "green" : "gray") : "amber"} dot>
          {isCurrent ? (on ? "Đang bật" : "Đang tắt") : "Trạng thái cuối"}
        </Badge>
      </div>
      <div
        className={`pump-illustration ${on && isCurrent ? "pump-active" : ""}`}
      >
        <div className="pump-ring">
          <Waves size={46} strokeWidth={1.6} />
        </div>
        <span className="pump-pipe" />
      </div>
      <p className="pump-state" data-testid="pump-state">
        {state ? (on ? "BẬT" : "TẮT") : "—"}
      </p>
      <p className="muted text-sm">
        {!isCurrent
          ? "Chưa có xác nhận trạng thái hiện tại"
          : state
            ? decisionLabel[state.decision]
            : "Đang chờ telemetry"}
      </p>
      <div className="pump-details">
        <div>
          <span>Chế độ ESP32</span>
          <strong>{state ? modeLabel[state.mode] : "Chưa có"}</strong>
        </div>
        <div>
          <span>
            <Timer size={14} />
            Giới hạn chu kỳ
          </span>
          <strong>10 giây</strong>
        </div>
        <div>
          <span>
            <ShieldCheck size={14} />
            Nghỉ giữa chu kỳ
          </span>
          <strong>5 giây</strong>
        </div>
      </div>
      <p className="pump-reason">
        {state
          ? humanReason(state.reason)
          : "Bơm mặc định tắt khi ESP32 khởi động."}
      </p>
      {link && (
        <Link to="/dieu-khien" className="text-link">
          Đi đến điều khiển
          <ArrowUpRight size={16} />
        </Link>
      )}
    </section>
  );
}
