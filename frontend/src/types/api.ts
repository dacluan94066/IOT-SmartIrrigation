import { z } from "zod";
export const telemetrySchema = z.object({
  id: z.number(),
  deviceId: z.string(),
  bootId: z.string(),
  sequence: z.number(),
  receivedAt: z.iso.datetime({ offset: true }),
  deviceTimestamp: z.string().nullable(),
  soilMoisturePercent: z.number().min(0).max(100),
  temperatureC: z.number().nullable(),
  rainProbabilityPercent: z.number().min(0).max(100).nullable(),
  precipitationMm: z.number().nullable(),
  relativeHumidityPercent: z.number().min(0).max(100).nullable().optional(),
  weatherSource: z.enum(["REAL", "SIMULATED"]),
  weatherStatus: z.enum(["VALID", "UNKNOWN", "STALE"]),
  pumpState: z.enum(["BAT", "TAT"]),
  decision: z.enum(["TUOI", "KHONG_TUOI", "TAM_HOAN"]),
  reason: z.string(),
  mode: z.enum(["AUTO", "MANUAL_ON", "MANUAL_OFF"]),
  uptimeMs: z.number(),
  weatherUpdatedAt: z.string().nullable(),
  rawSoilMoisturePercent: z.number().min(0).max(100).nullable().default(null),
  soilSource: z.enum(["REAL", "SIMULATED"]).default("REAL"),
  demoSupported: z.boolean().default(false),
  demoActive: z.boolean().default(false),
  demoCommandId: z.number().nullable().default(null),
  demoRemainingMs: z.number().min(0).max(60000).default(0),
  demoExpiresAt: z.string().nullable().default(null),
});
export const commandSchema = z.object({
  id: z.number(),
  deviceId: z.string(),
  type: z.enum(["AUTO", "MANUAL_ON", "MANUAL_OFF", "DEMO_SET", "DEMO_STOP"]),
  soilMoisturePercent: z.number().min(0).max(100).optional(),
  rainProbabilityPercent: z.number().min(0).max(100).optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
  status: z.enum([
    "PENDING",
    "DELIVERED",
    "EXECUTED",
    "REJECTED",
    "EXPIRED",
    "SUPERSEDED",
  ]),
  ackAt: z.string().nullable(),
  ackReason: z.string().nullable(),
});
export const sessionSchema = z.discriminatedUnion("authenticated", [
  z.object({ authenticated: z.literal(false) }),
  z.object({
    authenticated: z.literal(true),
    csrfToken: z.string(),
    deviceId: z.string(),
    offlineAfterMs: z.number(),
    statePollMs: z.number(),
    historyPollMs: z.number(),
    expiresAt: z.string(),
    serverTime: z.string(),
    demoEnabled: z.boolean().default(false),
  }),
]);
export const healthSchema = z.object({
  status: z.literal("ok"),
  database: z.literal("ok"),
  serverTime: z.string(),
});
export type Telemetry = z.infer<typeof telemetrySchema>;
export type Command = z.infer<typeof commandSchema>;
export type CommandType = Command["type"];
export type Session = Extract<
  z.infer<typeof sessionSchema>,
  { authenticated: true }
>;
export type Health = z.infer<typeof healthSchema>;
export const historySchema = z.object({
  data: z.array(telemetrySchema),
  meta: z.object({ page: z.number(), limit: z.number(), total: z.number() }),
});
export type HistoryResult = z.infer<typeof historySchema>;
