import { z } from "zod";
import {
  telemetrySchema,
  commandSchema,
  healthSchema,
  sessionSchema,
  historySchema,
} from "../types/api";
import type { CommandType, Session } from "../types/api";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
  signal?: AbortSignal,
  whole = false,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 7000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const r = await fetch("/api/v1/" + path, {
      ...options,
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const json = await r.json().catch(() => {
      throw new ApiError(
        r.status,
        "INVALID_RESPONSE",
        "Server không trả về JSON hợp lệ.",
      );
    });
    if (!r.ok || json.success !== true)
      throw new ApiError(
        r.status,
        json.error?.code || "API_ERROR",
        json.error?.message || "Không thể kết nối Backend.",
      );
    const result = schema.safeParse(whole ? json : json.data);
    if (!result.success)
      throw new ApiError(
        r.status,
        "CONTRACT_ERROR",
        "Dữ liệu API không đúng hợp đồng. Không sử dụng giá trị này.",
      );
    return result.data;
  } catch (error) {
    if (timedOut)
      throw new ApiError(0, "TIMEOUT", "Backend chưa phản hồi sau 7 giây.");
    if (controller.signal.aborted) throw error;
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Mất kết nối Backend. Đang tự động thử lại.",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
const query = (data: Record<string, string | number | undefined>) =>
  new URLSearchParams(
    Object.entries(data)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
export const api = {
  session: (signal?: AbortSignal) =>
    request("dashboard/session", sessionSchema, {}, signal),
  login: (password: string) =>
    request("dashboard/session", sessionSchema, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  logout: (session: Session) =>
    request("dashboard/logout", sessionSchema, {
      method: "POST",
      headers: { "X-CSRF-Token": session.csrfToken },
    }),
  health: (signal?: AbortSignal) => request("health", healthSchema, {}, signal),
  state: (id: string, signal?: AbortSignal) =>
    request(
      "dashboard/state?" + query({ deviceId: id }),
      telemetrySchema.nullable(),
      {},
      signal,
    ),
  commands: (id: string, signal?: AbortSignal) =>
    request(
      "dashboard/commands?" + query({ deviceId: id }),
      z.array(commandSchema),
      {},
      signal,
    ),
  history: (
    id: string,
    page: number,
    limit: number,
    from?: string,
    to?: string,
    signal?: AbortSignal,
  ) =>
    request(
      "dashboard/history?" + query({ deviceId: id, page, limit, from, to }),
      historySchema,
      {},
      signal,
      true,
    ),
  command: (session: Session, type: Exclude<CommandType, "DEMO_SET" | "DEMO_STOP">, key: string) =>
    request("dashboard/commands", commandSchema, {
      method: "POST",
      headers: { "X-CSRF-Token": session.csrfToken, "Idempotency-Key": key },
      body: JSON.stringify({
        deviceId: session.deviceId,
        type,
        ttlSeconds: 15,
      }),
    }),
  demo: (session: Session, values: { soilMoisturePercent: number; rainProbabilityPercent: number } | null, key: string) =>
    request("dashboard/commands", commandSchema, {
      method: "POST",
      headers: { "X-CSRF-Token": session.csrfToken, "Idempotency-Key": key },
      body: JSON.stringify({ deviceId: session.deviceId, type: values ? "DEMO_SET" : "DEMO_STOP", ttlSeconds: values ? 60 : 15, ...(values || {}) }),
    }),
};
