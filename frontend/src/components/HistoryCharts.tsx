import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import type { Telemetry } from "../types/api";
import { chartRows, shortTime, number, dateTime } from "../utils/format";
import { EmptyState } from "./ui";
export function HistoryCharts({
  rows,
  offlineMs,
}: {
  rows: Telemetry[];
  offlineMs: number;
}) {
  if (!rows.length)
    return (
      <div className="panel col-span-full">
        <EmptyState
          title="Chưa có mẫu trong khoảng thời gian này"
          description="Thử chọn khoảng thời gian khác hoặc chờ telemetry mới từ ESP32."
        />
      </div>
    );
  const data = chartRows(rows, offlineMs);
  const tooltip = {
    contentStyle: {
      border: "1px solid #e4eae7",
      borderRadius: 12,
      boxShadow: "0 8px 24px #183e2a12",
      fontSize: 12,
    },
    labelFormatter: (
      v: unknown,
      items: ReadonlyArray<{ payload?: { source?: string | null } }>,
    ) =>
      dateTime(new Date(Number(v)).toISOString()) +
      (items[0]?.payload?.source ? " · " + items[0].payload.source : ""),
  };
  return (
    <div className="chart-grid">
      <section className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ĐẤT & NGƯỠNG TƯỚI</p>
            <h2>Độ ẩm đất theo thời gian</h2>
          </div>
          <span className="chart-unit">% độ ẩm</span>
        </div>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart
              data={data}
              margin={{ top: 14, right: 12, left: -18, bottom: 6 }}
            >
              <defs>
                <linearGradient id="soil-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#12a775" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#12a775" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 5"
                vertical={false}
                stroke="#e9eeed"
              />
              <XAxis
                dataKey="at"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={shortTime}
                minTickGap={45}
                tick={{ fontSize: 11, fill: "#7c8885" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "#7c8885" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                {...tooltip}
                formatter={(v) => [
                  `${number(typeof v === "number" ? v : null)}%`,
                  "Độ ẩm đất",
                ]}
              />
              <ReferenceLine
                y={40}
                stroke="#d9a334"
                strokeDasharray="5 5"
                label={{
                  value: "Khô · 40%",
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "#a77b24",
                }}
              />
              <ReferenceLine y={70} stroke="#91b7a6" strokeDasharray="5 5" />
              <Area
                type="monotone"
                dataKey="soil"
                name="Độ ẩm đất"
                stroke="#0c976b"
                strokeWidth={2.5}
                fill="url(#soil-fill)"
                connectNulls={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="chart-footnote">
          {rows.length} mẫu mới nhất • Ngưỡng bắt đầu 40%, dừng 70%
        </p>
      </section>
      <section className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">THỜI TIẾT TỪ ESP32</p>
            <h2>Nhiệt độ & khả năng mưa</h2>
          </div>
          <span className="chart-unit">°C / %</span>
        </div>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart
              data={data}
              margin={{ top: 14, right: 0, left: -18, bottom: 6 }}
            >
              <CartesianGrid
                strokeDasharray="3 5"
                vertical={false}
                stroke="#e9eeed"
              />
              <XAxis
                dataKey="at"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={shortTime}
                minTickGap={45}
                tick={{ fontSize: 11, fill: "#7c8885" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="temp"
                tick={{ fontSize: 11, fill: "#7c8885" }}
                axisLine={false}
                tickLine={false}
                unit="°"
              />
              <YAxis
                yAxisId="rain"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "#7c8885" }}
                axisLine={false}
                tickLine={false}
                unit="%"
                width={42}
              />
              <Tooltip
                {...tooltip}
                formatter={(v, name) => [
                  `${number(typeof v === "number" ? v : null)}${name === "Nhiệt độ" ? " °C" : " %"}`,
                  name,
                ]}
              />
              <Legend
                iconType="circle"
                iconSize={7}
                wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
              />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="temperature"
                name="Nhiệt độ"
                stroke="#e9a437"
                dot={false}
                strokeWidth={2.5}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="rain"
                type="monotone"
                dataKey="rain"
                name="Xác suất mưa"
                stroke="#438ef0"
                dot={false}
                strokeWidth={2.5}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="chart-footnote">
          Giờ Việt Nam (UTC+7) • Để trống khi UNKNOWN/STALE hoặc mất mẫu
        </p>
      </section>
    </div>
  );
}
