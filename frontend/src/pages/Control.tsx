import { useEffect, useRef, useState } from "react";
import {
  CirclePlay,
  Power,
  ShieldCheck,
  SlidersHorizontal,
  X,
  TriangleAlert,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { useDashboard } from "../hooks/useDashboard";
import { api, ApiError } from "../services/api";
import type { Command, CommandType } from "../types/api";
import { Badge, PageHeading, ErrorNotice } from "../components/ui";
import { PumpPanel } from "../components/PumpPanel";
import { CommandStatus, CommandTable } from "../components/CommandTable";
import { commandLabel, dateTime, humanReason, number } from "../utils/format";
export default function Control() {
  const d = useDashboard();
  const [confirm, setConfirm] = useState(false),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState<Command>();
  const [uncertain, setUncertain] = useState(false);
  const busy = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const commands = d.commands.data || [];
  const observed =
    sent && !commands.some((c) => c.id === sent.id)
      ? [sent, ...commands]
      : commands;
  const newest = commands.find((c) => c.id === sent?.id) || sent;
  const waiting = observed.some((c) =>
    ["PENDING", "DELIVERED"].includes(c.status),
  );
  const offLease = observed.find(
    (c) =>
      c.type === "MANUAL_OFF" &&
      ["PENDING", "DELIVERED", "EXECUTED"].includes(c.status) &&
      Date.parse(c.expiresAt) > d.serverNow,
  );
  useEffect(() => {
    if (confirm) {
      dialog.current?.showModal();
      cancel.current?.focus();
    } else dialog.current?.close();
  }, [confirm]);
  async function send(type: CommandType) {
    if (busy.current || !d.isCurrent || uncertain || offLease || (type !== "MANUAL_OFF" && waiting)) return;
    busy.current = true;
    setSending(true);
    setError("");
    try {
      const command = await api.command(d.session, type, crypto.randomUUID());
      setSent(command);
      setConfirm(false);
      d.commands.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? humanReason(e.message) : "Không thể gửi lệnh.",
      );
      if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
        setUncertain(true);
        setConfirm(false);
      }
    } finally {
      busy.current = false;
      setSending(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ĐIỀU KHIỂN AN TOÀN"
        title="Điều khiển tưới"
        description="Gửi yêu cầu, theo dõi xác nhận. ESP32 luôn là nguồn trạng thái cuối cùng."
      />
      <div className="control-grid">
        <div>
          <section className="panel control-intro">
            <span className="icon-tile icon-green">
              <ShieldCheck size={25} />
            </span>
            <div>
              <h2>Chọn chế độ vận hành</h2>
              <p>
                Điều khiển thủ công không vô hiệu hóa bảo vệ thời tiết, ngưỡng
                đủ ẩm, giới hạn chạy 10 giây hoặc nghỉ 5 giây.
              </p>
            </div>
          </section>
          {!d.isCurrent && (
            <ErrorNotice message="Thiết bị hoặc Backend chưa có kết nối được xác minh. Tạm khóa gửi lệnh; trạng thái bơm bên phải là lần ghi nhận cuối." />
          )}
          {offLease && (
            <ErrorNotice
              message={`Lệnh TẮT #${offLease.id} đang được ưu tiên đến ${dateTime(offLease.expiresAt)}. Không thể thay bằng AUTO/BẬT trước khi hết hiệu lực.`}
            />
          )}
          <div className="control-options">
            <article className="panel control-option">
              <span className="icon-tile icon-green">
                <SlidersHorizontal size={24} />
              </span>
              <div>
                <h3>Tự động thông minh</h3>
                <p>
                  Tưới theo độ ẩm đất và dự báo mưa. Giữ toàn bộ thuật toán an
                  toàn hiện có.
                </p>
              </div>
              <button
                className="button button-white"
                disabled={
                  !d.isCurrent ||
                  sending ||
                  waiting ||
                  Boolean(offLease) ||
                  uncertain
                }
                onClick={() => void send("AUTO")}
              >
                Chọn AUTO
              </button>
            </article>
            <article className="panel control-option">
              <span className="icon-tile icon-blue">
                <CirclePlay size={24} />
              </span>
              <div>
                <h3>Bật tưới thủ công</h3>
                <p>
                  Yêu cầu một chu kỳ tưới tối đa 10 giây. ESP32 có thể từ chối
                  nếu chưa đủ điều kiện.
                </p>
              </div>
              <button
                className="button button-green"
                disabled={
                  !d.isCurrent ||
                  sending ||
                  waiting ||
                  Boolean(offLease) ||
                  uncertain
                }
                onClick={() => setConfirm(true)}
              >
                Bật thủ công
              </button>
            </article>
            <article className="panel control-option control-off">
              <span className="icon-tile icon-red">
                <Power size={24} />
              </span>
              <div>
                <h3>Tắt tưới thủ công</h3>
                <p>
                  Ưu tiên dừng bơm. Lệnh có hạn 15 giây; hết hạn hoặc mất
                  Backend sẽ về AUTO.
                </p>
              </div>
              <button
                className="button button-red"
                disabled={!d.isCurrent || sending || uncertain || Boolean(offLease)}
                onClick={() => void send("MANUAL_OFF")}
              >
                Tắt thủ công
              </button>
            </article>
          </div>
          <div className="notice notice-blue">
            <Clock3 size={18} />
            <span>
              API nhận lệnh ≠ bơm đã bật. Chỉ telemetry và ACK từ ESP32 xác nhận
              việc thực hiện.
            </span>
          </div>
          {error && (
            <div role="alert">
              <ErrorNotice message={error} />
            </div>
          )}
          {uncertain && (
            <div className="notice notice-amber">
              <TriangleAlert size={20} />
              <div>
                <strong>Chưa rõ Server đã nhận yêu cầu hay chưa.</strong>
                <p>
                  Không tự gửi lại để tránh lệnh trùng. Hãy kiểm tra nhật ký bên
                  dưới sau khi kết nối phục hồi.
                </p>
                <button
                  className="text-link"
                  onClick={() => {
                    d.commands.refresh();
                    setUncertain(false);
                  }}
                >
                  Tôi đã kiểm tra nhật ký, cho phép thao tác tiếp
                </button>
              </div>
            </div>
          )}
          {newest && (
            <section className="panel command-feedback" aria-live="polite">
              <div className="panel-heading">
                <h3>Yêu cầu gần nhất · #{newest.id}</h3>
                <CommandStatus command={newest} />
              </div>
              <strong>{commandLabel[newest.type]}</strong>
              <p>
                {newest.status === "REJECTED"
                  ? humanReason(newest.ackReason)
                  : newest.status === "EXECUTED"
                    ? "ESP32 đã xác nhận áp dụng lệnh. Xem trạng thái bơm thực tế trong telemetry."
                    : ["EXPIRED", "SUPERSEDED"].includes(newest.status)
                      ? "Lệnh không còn chờ thực hiện."
                      : "Server đã nhận yêu cầu. Đang chờ ACK từ ESP32, chưa xác nhận bơm thay đổi."}
              </p>
            </section>
          )}
        </div>
        <PumpPanel link={false} />
      </div>
      <section className="panel command-preview">
        <div className="panel-heading">
          <div>
            <h2>Nhật ký điều khiển</h2>
            <p className="muted text-sm">
              100 lệnh gần nhất · cập nhật mỗi 2 giây
            </p>
          </div>
          <Badge tone="blue">ACK từ thiết bị</Badge>
        </div>
        {d.commands.error && (
          <ErrorNotice
            message={`Nhật ký chưa cập nhật: ${d.commands.error.message}`}
          />
        )}
        <CommandTable commands={commands} />
      </section>
      <dialog
        ref={dialog}
        className="confirm-dialog"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        onCancel={() => setConfirm(false)}
      >
        <div className="dialog-heading">
          <span className="icon-tile icon-blue">
            <CirclePlay size={25} />
          </span>
          <button
            className="icon-button"
            aria-label="Đóng xác nhận"
            onClick={() => setConfirm(false)}
            disabled={sending}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="confirm-title">Bật máy bơm thủ công?</h2>
        <p id="confirm-description">
          Gửi yêu cầu tưới tối đa 10 giây. ESP32 chỉ bật nếu các điều kiện an
          toàn cho phép và sẽ gửi ACK.
        </p>
        <div className="confirm-readings">
          <div>
            <span>Độ ẩm đất</span>
            <strong>{number(d.state?.soilMoisturePercent)}%</strong>
          </div>
          <div>
            <span>Xác suất mưa</span>
            <strong>
              {d.state?.rainProbabilityPercent == null
                ? "—"
                : number(d.state.rainProbabilityPercent) + "%"}
            </strong>
          </div>
        </div>
        <p className="confirm-safety">
          <CheckCircle2 size={17} />
          Giữ bảo vệ ngưỡng 70%, thời tiết và cooldown.
        </p>
        {!d.isCurrent && (
          <ErrorNotice message="Kết nối đã gián đoạn. Không thể xác nhận bật." />
        )}
        <div className="dialog-actions">
          <button
            ref={cancel}
            className="button button-white"
            onClick={() => setConfirm(false)}
            disabled={sending}
          >
            Hủy
          </button>
          <button
            className="button button-green"
            onClick={() => void send("MANUAL_ON")}
            disabled={sending || !d.isCurrent || uncertain}
          >
            {sending ? "Đang gửi…" : "Xác nhận bật"}
          </button>
        </div>
      </dialog>
    </>
  );
}
