import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Droplets,
  CloudRain,
  Database,
} from "lucide-react";
import { useDashboard } from "../hooks/useDashboard";
import { useHistory } from "../hooks/useHistory";
import type { TimeRange } from "../hooks/useHistory";
import {
  PageHeading,
  Badge,
  EmptyState,
  ErrorNotice,
  Loading,
} from "../components/ui";
import { HistoryCharts } from "../components/HistoryCharts";
import {
  dateTime,
  number,
  decisionLabel,
  humanReason,
  vietnamInputToISO,
} from "../utils/format";
export default function History() {
  const d = useDashboard();
  const [period, setPeriod] = useState("3600000"),
    [range, setRange] = useState<TimeRange>({ period: 3600000 }),
    [page, setPage] = useState(1),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [error, setError] = useState("");
  const table = useHistory(page, 20, range),
    chart = useHistory(1, 100, range);
  const records = chart.result?.data || [];
  const total = table.result?.meta.total || 0;
  const average = records.length
    ? records.reduce((s, r) => s + r.soilMoisturePercent, 0) / records.length
    : null;
  const rains = records
    .map((r) => r.rainProbabilityPercent)
    .filter((n): n is number => n !== null);
  function selectPeriod(value: string) {
    setPeriod(value);
    if (value !== "custom") {
      setRange({ period: Number(value) });
      setPage(1);
      setError("");
    }
  }
  function apply() {
    if (!from || !to || from > to) {
      setError(
        "Chọn đầy đủ thời gian bắt đầu/kết thúc, với bắt đầu không lớn hơn kết thúc.",
      );
      return;
    }
    setRange({
      period: 0,
      from: vietnamInputToISO(from),
      to: vietnamInputToISO(to),
    });
    setPage(1);
    setError("");
  }
  return (
    <>
      <PageHeading
        eyebrow="DỮ LIỆU & XU HƯỚNG"
        title="Lịch sử và thống kê"
        description="Theo dõi khu vườn qua từng bản ghi. Lọc theo thời gian nhận tại Server."
      />
      <section className="panel filter-bar">
        <div className="filter-title">
          <CalendarDays size={19} />
          <strong>Khoảng thời gian</strong>
        </div>
        <label className="sr-only" htmlFor="period">
          Khoảng thời gian
        </label>
        <select
          id="period"
          value={period}
          onChange={(e) => selectPeriod(e.target.value)}
        >
          <option value="900000">15 phút gần nhất</option>
          <option value="3600000">1 giờ gần nhất</option>
          <option value="86400000">24 giờ gần nhất</option>
          <option value="0">Toàn bộ lịch sử</option>
          <option value="custom">Tùy chọn thời gian</option>
        </select>
        {period === "custom" && (
          <div className="custom-range">
            <label>
              Từ
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Đến
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button className="button button-green" onClick={apply}>
              Áp dụng
            </button>
          </div>
        )}
        <span className="filter-note">Giờ Việt Nam · UTC+7</span>
      </section>
      {error && <ErrorNotice message={error} />}
      <div className="history-stats">
        <article className="panel">
          <span className="icon-tile icon-green">
            <Droplets size={21} />
          </span>
          <div>
            <span>Độ ẩm đất trung bình</span>
            <strong>
              {number(average)}
              <small>{average !== null ? "%" : ""}</small>
            </strong>
            <p>Trong {records.length} mẫu biểu đồ đang hiển thị</p>
          </div>
        </article>
        <article className="panel">
          <span className="icon-tile icon-blue">
            <CloudRain size={21} />
          </span>
          <div>
            <span>Xác suất mưa cao nhất</span>
            <strong>
              {number(rains.length ? Math.max(...rains) : null, 0)}
              <small>{rains.length ? "%" : ""}</small>
            </strong>
            <p>Không tính các giá trị chưa có</p>
          </div>
        </article>
        <article className="panel">
          <span className="icon-tile icon-amber">
            <Database size={21} />
          </span>
          <div>
            <span>Bản ghi trong bộ lọc</span>
            <strong>{table.result ? number(total, 0) : "—"}</strong>
            <p>Theo tổng đếm từ SQLite</p>
          </div>
        </article>
      </div>
      {(chart.error || table.error) && (
        <ErrorNotice
          message={`Lịch sử chưa cập nhật: ${(chart.error || table.error)?.message}`}
        />
      )}{" "}
      {chart.result ? (
        <HistoryCharts rows={records} offlineMs={d.offlineMs} />
      ) : (
        <div className="panel">
          <Loading />
        </div>
      )}
      <p className="data-note">
        Biểu đồ lấy tối đa 100 mẫu mới nhất của bộ lọc, không phải toàn bộ dữ
        liệu. Bảng bên dưới phân trang đầy đủ. Không nối khoảng mất mẫu như thể
        vẫn có dữ liệu.
      </p>
      <section className="panel history-table">
        <div className="panel-heading">
          <div>
            <h2>Nhật ký tưới & cảm biến</h2>
            <p className="muted text-sm">
              Thời gian nhận Server; nguồn REAL/SIMULATED giữ nguyên từ ESP32.
            </p>
          </div>
          <Badge tone="gray">20 bản ghi / trang</Badge>
        </div>
        {!table.result ? (
          <Loading />
        ) : !table.result.data.length ? (
          <EmptyState
            title="Không tìm thấy bản ghi"
            description="Thử thay đổi bộ lọc hoặc chờ ESP32 gửi dữ liệu."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Thời gian (UTC+7)</th>
                  <th>Độ ẩm đất</th>
                  <th>Dự báo mưa</th>
                  <th>Máy bơm</th>
                  <th>Quyết định</th>
                  <th>Nguyên nhân</th>
                </tr>
              </thead>
              <tbody>
                {table.result.data.map((r) => (
                  <tr key={r.id}>
                    <td className="no-wrap">
                      {dateTime(r.receivedAt)}
                      <span className="table-sub">
                        #{r.id} · {r.weatherSource}
                      </span>
                    </td>
                    <td className="numeric">
                      <strong>{number(r.soilMoisturePercent)}%</strong>
                    </td>
                    <td>
                      {r.rainProbabilityPercent === null
                        ? "—"
                        : number(r.rainProbabilityPercent) + "%"}
                      <span className="table-sub">{r.weatherStatus}</span>
                    </td>
                    <td>
                      <Badge tone={r.pumpState === "BAT" ? "green" : "gray"}>
                        {r.pumpState === "BAT" ? "BẬT" : "TẮT"}
                      </Badge>
                    </td>
                    <td>{decisionLabel[r.decision]}</td>
                    <td className="reason-cell">{humanReason(r.reason)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            Trang {page} / {Math.max(1, Math.ceil(total / 20))} · {total} bản
            ghi
          </span>
          <div>
            <button
              className="button button-white"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
              Trước
            </button>
            <button
              className="button button-white"
              disabled={!table.result || page * 20 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
