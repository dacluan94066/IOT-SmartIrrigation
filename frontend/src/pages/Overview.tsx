import { Link } from "react-router-dom";
import {
  Droplets,
  Thermometer,
  CloudRain,
  CloudSun,
  Wind,
  Gauge,
  ArrowUpRight,
  ShieldCheck,
  Leaf,
} from "lucide-react";
import { useDashboard } from "../hooks/useDashboard";
import { useHistory } from "../hooks/useHistory";
import {
  Badge,
  MetricCard,
  PageHeading,
  ErrorNotice,
  Loading,
} from "../components/ui";
import { PumpPanel } from "../components/PumpPanel";
import { HistoryCharts } from "../components/HistoryCharts";
import { CommandTable } from "../components/CommandTable";
import {
  decisionLabel,
  humanReason,
  number,
  dateTime,
  duration,
} from "../utils/format";
export default function Overview() {
  const d = useDashboard(),
    s = d.state;
  const history = useHistory();
  const valid = s?.weatherStatus === "VALID";
  return (
    <>
      <PageHeading
        eyebrow="GIÁM SÁT THỜI GIAN THỰC"
        title="Tổng quan khu vườn"
        description="Hiểu độ ẩm đất. Đón trước thời tiết. Tưới đúng lúc."
        action={
          <Link className="button button-white" to="/dieu-khien">
            Điều khiển tưới
            <ArrowUpRight size={17} />
          </Link>
        }
      />
      <div className="overview-top">
        <section className="garden-hero">
          <div className="hero-copy">
            <div className="hero-tags">
              <span className="hero-tag">
                <Leaf size={14} />
                VƯỜN THÔNG MINH
              </span>
              <span className="hero-source">
                {s?.weatherSource === "SIMULATED"
                  ? "DỮ LIỆU MÔ PHỎNG"
                  : "DỮ LIỆU TỪ ESP32"}
              </span>
            </div>
            <h2>
              {!d.isCurrent
                ? "Chờ kết nối khu vườn"
                : s
                  ? decisionLabel[s.decision]
                  : "Sẵn sàng chăm sóc"}
            </h2>
            <p>
              {s
                ? humanReason(s.reason)
                : "Đang chờ bản ghi đầu tiên từ thiết bị. Không có dữ liệu giả lập trên giao diện."}
            </p>
            <div className="hero-meta">
              <ShieldCheck size={17} />
              <span>
                {d.isCurrent
                  ? "Bảo vệ tự động đang hoạt động"
                  : "Chỉ hiển thị bản ghi cuối nếu có"}
              </span>
            </div>
          </div>
          <div
            className="soil-gauge"
            role="img"
            aria-label={`Độ ẩm đất ${s ? number(s.soilMoisturePercent) + " phần trăm" : "chưa có dữ liệu"}`}
          >
            <svg viewBox="0 0 180 180">
              <circle
                cx="90"
                cy="90"
                r="73"
                fill="none"
                stroke="#ffffff20"
                strokeWidth="9"
              />
              <circle
                cx="90"
                cy="90"
                r="73"
                fill="none"
                stroke="#c9f995"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={`${((s?.soilMoisturePercent || 0) / 100) * 458.67} 458.67`}
                transform="rotate(-90 90 90)"
              />
            </svg>
            <div>
              <Droplets size={22} />
              <strong>
                {number(s?.soilMoisturePercent)}
                <small>{s ? "%" : ""}</small>
              </strong>
              <span>ĐỘ ẨM ĐẤT</span>
            </div>
          </div>
        </section>
        <section className="panel weather-summary">
          <div className="weather-summary-head">
            <span className="icon-tile icon-blue">
              <CloudSun size={24} />
            </span>
            <Badge tone={s?.weatherSource === "SIMULATED" ? "amber" : "blue"}>
              {s?.weatherSource || "Chưa có nguồn"}
            </Badge>
          </div>
          <p className="eyebrow">DỰ BÁO 3 MỐC GIỜ</p>
          <h2>
            {valid
              ? s.rainProbabilityPercent !== null &&
                s.rainProbabilityPercent >= 60
                ? "Khả năng mưa cao"
                : "Khả năng mưa thấp"
              : "Chờ thời tiết hợp lệ"}
          </h2>
          <p>
            Dự báo do ESP32 nhận từ Open-Meteo. Dashboard không gọi API thời
            tiết riêng.
          </p>
          <div className="weather-summary-foot">
            <Badge
              tone={
                valid
                  ? "green"
                  : s?.weatherStatus === "STALE"
                    ? "amber"
                    : "gray"
              }
            >
              {s?.weatherStatus || "UNKNOWN"}
            </Badge>
            <span>
              {d.isCurrent ? "Theo telemetry mới nhất" : "Bản ghi cuối"}
            </span>
          </div>
        </section>
      </div>
      <div className="overview-body">
        <div className="metrics-grid">
          <MetricCard
            label="Độ ẩm đất"
            value={number(s?.soilMoisturePercent)}
            unit="%"
            icon={Droplets}
            description="GPIO34 · cảm biến mô phỏng"
            tag={
              <Badge tone={s && s.soilMoisturePercent < 40 ? "amber" : "green"}>
                {s
                  ? s.soilMoisturePercent < 40
                    ? "Đất khô"
                    : "Đủ ẩm"
                  : "Chưa có"}
              </Badge>
            }
          />
          <MetricCard
            label="Nhiệt độ hiện tại"
            value={number(valid ? s?.temperatureC : null)}
            unit="°C"
            icon={Thermometer}
            tone="amber"
            description="Điều kiện hiện tại từ ESP32"
          />
          <MetricCard
            label="Độ ẩm không khí"
            value={number(valid ? s?.relativeHumidityPercent : null)}
            unit="%"
            icon={Wind}
            tone="blue"
            description={
              s?.relativeHumidityPercent == null
                ? "Chưa được API telemetry cung cấp"
                : "Điều kiện hiện tại từ ESP32"
            }
          />
          <MetricCard
            label="Xác suất mưa cao nhất"
            value={number(valid ? s?.rainProbabilityPercent : null, 0)}
            unit="%"
            icon={CloudRain}
            tone="blue"
            description="Cao nhất trong 3 mốc dự báo"
          />
          <MetricCard
            label="Lượng mưa dự báo"
            value={number(valid ? s?.precipitationMm : null, 2)}
            unit="mm"
            icon={Gauge}
            tone="blue"
            description="Tổng của 3 mốc dự báo"
          />
          <MetricCard
            label="Cập nhật gần nhất"
            value={d.age !== null ? `${Math.floor(d.age / 1000)}` : "—"}
            unit="giây trước"
            icon={Leaf}
            description={
              s ? dateTime(s.receivedAt) : "Theo thời gian nhận tại Server"
            }
            tag={
              <Badge tone={d.online ? "green" : "gray"} dot>
                {d.online ? "ONLINE" : "OFFLINE"}
              </Badge>
            }
          />
        </div>
        <PumpPanel />
      </div>
      <div className="section-heading">
        <div>
          <h2>Nhịp sống khu vườn</h2>
          <p>100 mẫu gần nhất trong 1 giờ · cập nhật mỗi 30 giây</p>
        </div>
        <Link className="text-link" to="/lich-su">
          Xem lịch sử
          <ArrowUpRight size={16} />
        </Link>
      </div>
      {history.error && (
        <ErrorNotice
          message={`Lịch sử chưa cập nhật: ${history.error.message}`}
        />
      )}{" "}
      {history.result ? (
        <HistoryCharts rows={history.result.data} offlineMs={d.offlineMs} />
      ) : (
        <div className="panel">
          <Loading />
        </div>
      )}
      <section className="panel command-preview">
        <div className="panel-heading">
          <div>
            <h2>Hoạt động điều khiển gần đây</h2>
            <p className="muted text-sm">
              ACK thực tế từ thiết bị, không suy đoán trạng thái bơm.
            </p>
          </div>
          <Link className="text-link" to="/dieu-khien">
            Tất cả lệnh
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <CommandTable commands={(d.commands.data || []).slice(0, 3)} />
      </section>
      <p className="data-note">
        {d.isCurrent
          ? "Dữ liệu thiết bị đang được nhận định kỳ."
          : `Dữ liệu cuối được giữ để tham khảo${d.age !== null ? `, cách đây ${duration(d.age)}` : ""}.`}{" "}
        Không thay giá trị chưa có bằng số 0.
      </p>
    </>
  );
}
