import { useEffect, useRef, useState } from "react";
import { FlaskConical, Droplets, CloudRain, Leaf, Sun, RotateCcw, X, Clock3 } from "lucide-react";
import { useDashboard } from "../hooks/useDashboard";
import { api, ApiError } from "../services/api";
import type { Command } from "../types/api";
import { Badge, ErrorNotice } from "./ui";
import { CommandStatus } from "./CommandTable";
import { demoSeconds, humanReason, number } from "../utils/format";

const presets = [
  { name: "Đất khô, ít mưa", soil: 22, rain: 20, icon: Sun, hint: "Cho phép AUTO tưới khi hết cooldown" },
  { name: "Đất đủ ẩm", soil: 50, rain: 20, icon: Leaf, hint: "Không bật chu kỳ mới; đang tưới vẫn giữ hysteresis" },
  { name: "Đất quá ẩm", soil: 80, rain: 20, icon: Droplets, hint: "Đạt ngưỡng 70%: dừng hoặc giữ tắt" },
  { name: "Sắp có mưa", soil: 22, rain: 85, icon: CloudRain, hint: "Hoãn tưới; đang chạy thì dừng theo dự báo" },
];

export function DemoPanel() {
  const d = useDashboard(), state = d.state;
  const [soil, setSoil] = useState(22), [rain, setRain] = useState(20);
  const [confirm, setConfirm] = useState(false), [sending, setSending] = useState(false);
  const [error, setError] = useState(""), [uncertain, setUncertain] = useState(false);
  const [sent, setSent] = useState<Command>();
  const busy = useRef(false), dialog = useRef<HTMLDialogElement>(null), cancel = useRef<HTMLButtonElement>(null);
  const commands = d.commands.data || [];
  const last = commands.find(c => c.id === sent?.id) || sent;
  const pending = [last, ...commands].some(c => c && ["PENDING", "DELIVERED"].includes(c.status));
  const off = commands.some(c => c.type === "MANUAL_OFF" && ["PENDING", "DELIVERED", "EXECUTED"].includes(c.status) && Date.parse(c.expiresAt) > d.serverNow);
  const active = Boolean(state?.demoActive), seconds = demoSeconds(state, d.serverNow);
  const capable = d.session.demoEnabled && Boolean(state?.demoSupported);
  const canSet = capable && d.isCurrent && !sending && !pending && !off && !uncertain;
  const canStop = d.isCurrent && !sending && !uncertain && (active || (last?.type === "DEMO_SET" && ["PENDING", "DELIVERED"].includes(last.status)));
  useEffect(() => {
    if (confirm) { dialog.current?.showModal(); cancel.current?.focus(); }
    else dialog.current?.close();
  }, [confirm]);

  async function send(values: { soilMoisturePercent: number; rainProbabilityPercent: number } | null) {
    if (busy.current || (values ? !canSet : !canStop)) return;
    busy.current = true; setSending(true); setError("");
    try {
      const command = await api.demo(d.session, values, crypto.randomUUID());
      setSent(command); setConfirm(false); d.commands.refresh(); d.current.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể gửi lệnh demo.");
      if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) { setUncertain(true); setConfirm(false); }
    } finally { busy.current = false; setSending(false); }
  }
  return (
    <section className={`panel demo-panel ${active ? "demo-panel-active" : ""}`} aria-labelledby="demo-title" aria-busy={sending}>
      <div className="demo-heading">
        <span className="icon-tile icon-blue"><FlaskConical size={24} /></span>
        <div className="demo-title"><p className="eyebrow">PHÒNG THỬ NGHIỆM · WOKWI</p><h2 id="demo-title">Demo kịch bản tưới</h2><p>Thay đầu vào, không ép bật bơm. ESP32 vẫn chạy thuật toán AUTO.</p></div>
        <Badge tone={active ? "amber" : "gray"}>{active ? "SIMULATED" : "Chưa bật demo"}</Badge>
      </div>
      {active && <div className="demo-live" role="region" aria-label="Trạng thái demo ESP32">
        <strong>DỮ LIỆU MÔ PHỎNG · {d.isCurrent ? seconds ? `còn tối đa ${seconds} giây` : "đang chờ ESP32 xác nhận kết thúc" : "bản ghi cuối, chưa xác minh hiện tại"}</strong>
        <span>Đang dùng: đất {number(state?.soilMoisturePercent)}% · mưa {number(state?.rainProbabilityPercent)}%. Potentiometer thật: {number(state?.rawSoilMoisturePercent)}%.</span>
      </div>}
      {!d.session.demoEnabled && <ErrorNotice message="Backend chưa cho phép demo. Bật REMOTE_DEMO_ENABLED=true trên bản Wokwi rồi khởi động lại Backend." />}
      {d.session.demoEnabled && !state?.demoSupported && <ErrorNotice message="Chưa nhận firmware hỗ trợ demo từ Web. Cần Build/nạp lại Wokwi và chờ telemetry mới." />}
      {!d.isCurrent && <p className="demo-help">Chỉ gửi lệnh khi Backend kết nối và ESP32 ONLINE.</p>}
      <div className="demo-sliders">
        <label htmlFor="demo-soil"><span><Droplets size={17} /> Độ ẩm đất mô phỏng <output htmlFor="demo-soil">{soil}%</output></span>
          <input id="demo-soil" type="range" min="0" max="100" step="1" value={soil} onChange={e => setSoil(Number(e.target.value))} disabled={sending} />
          <small>Khô dưới 40% · dừng từ 70%</small>
        </label>
        <label htmlFor="demo-rain"><span><CloudRain size={17} /> Xác suất mưa mô phỏng <output htmlFor="demo-rain">{rain}%</output></span>
          <input id="demo-rain" type="range" min="0" max="100" step="1" value={rain} onChange={e => setRain(Number(e.target.value))} disabled={sending} />
          <small>Hoãn từ 60% · đây là %, không phải lượng mưa mm</small>
        </label>
      </div>
      <div className="demo-presets">
        {presets.map(p => <button key={p.name} type="button" className="demo-preset" disabled={!active || !canSet} onClick={() => { setSoil(p.soil); setRain(p.rain); void send({soilMoisturePercent:p.soil,rainProbabilityPercent:p.rain}); }}>
          <p.icon size={22} aria-hidden="true" /><strong>{p.name}</strong><span>Đất {p.soil}% · Mưa {p.rain}%</span><small>{p.hint}</small>
        </button>)}
      </div>
      <div className="demo-actions">
        {active ? <button className="button button-green" disabled={!canSet} onClick={() => void send({soilMoisturePercent:soil,rainProbabilityPercent:rain})}>{sending ? "Đang gửi…" : "Áp dụng giá trị đã chọn"}</button>
          : <button className="button button-green" disabled={!canSet} onClick={() => setConfirm(true)}><FlaskConical size={17} /> Bật chế độ demo</button>}
        <button className="button button-white" disabled={!canStop} onClick={() => void send(null)}><RotateCcw size={17} /> Thoát demo → dữ liệu thật</button>
        <span><Clock3 size={16} /> Mỗi lần áp dụng tối đa 60 giây, không tự gia hạn.</span>
      </div>
      <p className="demo-help">Kéo thanh chỉ chọn giá trị; cần bấm Áp dụng. Giữ giới hạn bơm 10 giây, nghỉ 5 giây và ưu tiên TẮT. Thoát/hết hạn/mất Backend sẽ kết thúc demo, dừng chu kỳ demo rồi về AUTO thật.</p>
      {off && <ErrorNotice message="Lệnh TẮT đang được ưu tiên. Không thể bật/cập nhật demo trước khi lệnh hết hiệu lực." />}
      {error && <div role="alert"><ErrorNotice message={error} /></div>}
      {uncertain && <div className="notice notice-amber"><div><strong>Chưa rõ Server đã nhận lệnh hay chưa.</strong><p>Kiểm tra nhật ký trước khi thao tác lại; không tự gửi lại lệnh.</p><button className="text-link" onClick={() => { d.commands.refresh(); setUncertain(false); }}>Tôi đã kiểm tra nhật ký, cho phép thao tác tiếp</button></div></div>}
      {last && <div className="demo-feedback" aria-live="polite"><CommandStatus command={last} /><span>Lệnh #{last.id}: {last.status === "EXECUTED" ? "Đã ACK. Xem dữ liệu/bơm ESP32 xác nhận; API nhận lệnh không có nghĩa bơm đã bật." : last.status === "REJECTED" ? humanReason(last.ackReason) : ["EXPIRED","SUPERSEDED"].includes(last.status) ? "Lệnh không còn chờ thực hiện." : "Đang chờ ESP32 nhận và ACK; chưa xác nhận đổi đầu vào."}</span></div>}
      <dialog ref={dialog} className="confirm-dialog" aria-labelledby="demo-confirm-title" onCancel={() => setConfirm(false)}>
        <div className="dialog-heading"><span className="icon-tile icon-blue"><FlaskConical size={25} /></span><button className="icon-button" aria-label="Đóng xác nhận demo" disabled={sending} onClick={() => setConfirm(false)}><X size={20} /></button></div>
        <h2 id="demo-confirm-title">Bật demo trên ESP32/Wokwi?</h2>
        <p>Áp dụng đất {soil}% và xác suất mưa {rain}% tối đa 60 giây. Đây là dữ liệu SIMULATED; relay/LED trong Wokwi có thể tự bật theo AUTO. Không dùng chế độ này cho bơm ngoài thực tế.</p>
        <p className="demo-help">Không sửa dữ liệu Open-Meteo thật. Khi thoát sẽ dùng lại potentiometer và dự báo thật hợp lệ.</p>
        <div className="dialog-actions"><button ref={cancel} className="button button-white" disabled={sending} onClick={() => setConfirm(false)}>Hủy</button><button className="button button-green" disabled={!canSet} onClick={() => void send({soilMoisturePercent:soil,rainProbabilityPercent:rain})}>{sending ? "Đang gửi…" : "Xác nhận bật demo"}</button></div>
      </dialog>
    </section>
  );
}
