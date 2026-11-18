import type { Command, Telemetry } from "../types/api";
export const dateTime = (v?: string | null) =>
  v
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(new Date(v))
    : "Chưa có";
export const shortTime = (v: number) =>
  new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(v));
export const number = (v?: number | null, digits = 1) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(
        v,
      );
export const decisionLabel = {
  TUOI: "Tưới nước",
  KHONG_TUOI: "Không tưới",
  TAM_HOAN: "Tạm hoãn",
};
export const modeLabel = {
  AUTO: "Tự động",
  MANUAL_ON: "Bật thủ công",
  MANUAL_OFF: "Tắt thủ công",
};
export const commandLabel = {
  AUTO: "Chuyển tự động",
  MANUAL_ON: "Bật thủ công",
  MANUAL_OFF: "Tắt thủ công",
  DEMO_SET: "Áp dụng kịch bản DEMO",
  DEMO_STOP: "Thoát DEMO, dùng dữ liệu thật",
};
export const statusLabel: Record<Command["status"], string> = {
  PENDING: "Đang chờ",
  DELIVERED: "ESP32 đã nhận",
  EXECUTED: "Đã thực hiện",
  REJECTED: "Bị từ chối",
  EXPIRED: "Hết hạn",
  SUPERSEDED: "Đã thay thế",
};
export function humanReason(v?: string | null) {
  if (!v) return "Đang chờ ESP32 xác nhận.";
  const s = v.toLowerCase();
  if (s.startsWith("demo_applied")) return "ESP32 đã áp dụng đầu vào SIMULATED. Thuật toán AUTO vẫn quyết định bơm và giữ các bảo vệ.";
  if (s.startsWith("demo_stopped")) return "Đã thoát demo và trở về dữ liệu thật; giữ cooldown trước chu kỳ mới.";
  if (s.startsWith("demo_ended")) return "Đã kết thúc phiên demo và dừng chu kỳ mô phỏng. Trở về dữ liệu thật, giữ cooldown.";
  if (s.startsWith("demo_not_supported")) return "Firmware chưa hỗ trợ demo từ Web. Cần Build và nạp lại ESP32.";
  if (s.startsWith("demo_active")) return "Hãy thoát demo trước khi chuyển AUTO hoặc bật thủ công.";
  if (s.includes("da dat nguong 70"))
    return "Độ ẩm đất đã đạt ngưỡng an toàn 70%. Không thể bật máy bơm.";
  if (s.includes("du bao sap mua"))
    return "Tạm hoãn tưới vì dự báo có mưa lớn (xác suất từ 60%).";
  if (s.includes("khong co du lieu thoi tiet"))
    return "Chưa có thời tiết hợp lệ. Tạm dừng tưới để bảo đảm an toàn.";
  if (s.includes("gioi han chay bom"))
    return "Đã dừng bơm do đạt giới hạn chạy 10 giây.";
  if (s.includes("dang cho 5"))
    return "Đang nghỉ 5 giây sau chu kỳ tưới trước.";
  if (s.includes("manual_off_priority") || s.includes("wait for manual_off"))
    return "Lệnh TẮT đang được ưu tiên. Hãy đợi lệnh hết hiệu lực.";
  if (s.includes("manual_off"))
    return "Đã áp dụng lệnh tắt thủ công, ưu tiên dừng máy bơm.";
  if (s.includes("manual_on"))
    return "Tưới thủ công, vẫn tuân thủ thời tiết và các giới hạn an toàn.";
  if (s.includes("do am tu 40"))
    return "Độ ẩm đã đủ để không bắt đầu chu kỳ tưới mới.";
  if (s.includes("dat kho"))
    return "Đất khô và thời tiết cho phép. Tiếp tục tưới đến ngưỡng an toàn.";
  if (s === "device_rebooted")
    return "Thiết bị đã khởi động lại. Không thực thi lại lệnh của phiên cũ.";
  return v;
}
export function telemetryAge(
  value: Telemetry | null | undefined,
  serverNow: number,
) {
  if (!value) return null;
  const t = Date.parse(value.receivedAt);
  if (!Number.isFinite(t) || t > serverNow + 5000) return null;
  return Math.max(0, serverNow - t);
}
export function isDeviceOnline(
  value: Telemetry | null | undefined,
  serverNow: number,
  threshold: number,
) {
  const age = telemetryAge(value, serverNow);
  return age !== null && age < threshold;
}
export const duration = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return s >= 3600
    ? `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút`
    : s >= 60
      ? `${Math.floor(s / 60)} phút ${s % 60} giây`
      : `${s} giây`;
};
// Đếm theo hạn Server và tuổi telemetry; không coi bản ghi cũ là một lease mới.
export function demoSeconds(value: Telemetry | null | undefined, serverNow: number) {
  if (!value?.demoActive || !value.demoExpiresAt) return 0;
  const age = telemetryAge(value, serverNow);
  if (age === null) return 0;
  return Math.max(0, Math.ceil(Math.min(value.demoRemainingMs - age, Date.parse(value.demoExpiresAt) - serverNow) / 1000));
}
export const vietnamInputToISO = (value: string) =>
  new Date(value + (value.length === 16 ? ":00" : "") + "+07:00").toISOString();
export function chartRows(rows: Telemetry[], offlineMs: number) {
  const result: Array<{
    at: number;
    soil: number | null;
    temperature: number | null;
    rain: number | null;
    source: string | null;
  }> = [];
  for (const row of [...rows].sort(
    (a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt),
  )) {
    const at = Date.parse(row.receivedAt),
      prev = result.at(-1);
    if (prev && at - prev.at > offlineMs)
      result.push({
        at: (at + prev.at) / 2,
        soil: null,
        temperature: null,
        rain: null,
        source: null,
      });
    result.push({
      at,
      soil: row.soilMoisturePercent,
      temperature: row.weatherStatus === "VALID" ? row.temperatureC : null,
      rain: row.weatherStatus === "VALID" ? row.rainProbabilityPercent : null,
      source: row.weatherSource,
    });
  }
  return result;
}
