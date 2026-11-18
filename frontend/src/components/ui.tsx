import type { ReactNode, ComponentType } from "react";
import { CircleAlert, Database, LoaderCircle } from "lucide-react";
export type Tone = "green" | "blue" | "amber" | "red" | "gray";
export function Badge({
  children,
  tone = "gray",
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="status-dot" />}
      {children}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function EmptyState({
  title = "Chưa có dữ liệu",
  description = "Dữ liệu sẽ xuất hiện khi ESP32 gửi telemetry về Backend.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <Database size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="notice notice-amber" role="status">
      <CircleAlert size={18} />
      <span>{message}</span>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={20} />
      Đang tải dữ liệu…
    </div>
  );
}
export function MetricCard({
  label,
  value,
  unit,
  description,
  icon: Icon,
  tone = "green",
  tag,
}: {
  label: string;
  value: string;
  unit?: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
  tone?: Tone;
  tag?: ReactNode;
}) {
  return (
    <article className="metric-card panel">
      <div className="metric-top">
        <span className={`icon-tile icon-${tone}`}>
          <Icon size={21} />
        </span>
        {tag}
      </div>
      <p className="metric-label">{label}</p>
      <div className="metric-value">
        {value}
        <span>{value === "—" ? "" : unit}</span>
      </div>
      <p className="metric-description">{description}</p>
    </article>
  );
}
