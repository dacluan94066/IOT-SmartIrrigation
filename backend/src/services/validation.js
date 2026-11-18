import { z } from 'zod';
const deviceId = z.string().regex(/^[A-Za-z0-9_-]{1,48}$/);
const bootId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const percent = z.number().finite().min(0).max(100);
const timestamp = z.iso.datetime({ offset: true });
export const telemetrySchema = z.object({
  deviceId, bootId, sequence: z.number().int().min(0).max(4294967295),
  soilMoisturePercent: percent,
  temperatureC: z.number().finite().min(-100).max(100).nullable(),
  rainProbabilityPercent: percent.nullable(),
  precipitationMm: z.number().finite().min(0).max(10000).nullable(),
  weatherSource: z.enum(['REAL', 'SIMULATED']),
  weatherStatus: z.enum(['VALID', 'UNKNOWN', 'STALE']),
  pumpState: z.enum(['BAT', 'TAT']), decision: z.enum(['TUOI', 'KHONG_TUOI', 'TAM_HOAN']),
  reason: z.string().trim().min(1).max(240),
  mode: z.enum(['AUTO', 'MANUAL_ON', 'MANUAL_OFF']).default('AUTO'),
  deviceTimestamp: timestamp.nullable(),
  weatherUpdatedAt: timestamp.nullable().default(null),
  uptimeMs: z.number().int().min(0).max(4294967295)
}).strict().superRefine((v, c) => {
  if (v.weatherStatus === 'VALID' && v.rainProbabilityPercent === null) c.addIssue({ code: 'custom', path: ['rainProbabilityPercent'], message: 'VALID requires rain probability' });
  if (v.weatherStatus !== 'VALID' && (v.temperatureC !== null || v.rainProbabilityPercent !== null || v.precipitationMm !== null)) c.addIssue({ code: 'custom', message: 'Unavailable weather values must be null, not fabricated zero' });
  if ((v.pumpState === 'BAT') !== (v.decision === 'TUOI')) c.addIssue({ code: 'custom', message: 'Pump and decision disagree' });
});
export const deviceQuery = z.object({ deviceId }).strict();
export const historyQuery = z.object({ deviceId, page: z.coerce.number().int().min(1).max(1000000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),from:timestamp.optional(),to:timestamp.optional() }).strict().refine(v=>!v.from||!v.to||Date.parse(v.from)<=Date.parse(v.to),{message:'from must not exceed to'});
export const commandSchema = z.object({ deviceId, type: z.enum(['AUTO', 'MANUAL_ON', 'MANUAL_OFF']), ttlSeconds: z.number().int().min(1).max(60).default(15) }).strict();
export const pollSchema = z.object({ deviceId, bootId }).strict();
export const ackSchema = z.object({ deviceId, bootId, status: z.enum(['EXECUTED', 'REJECTED']), reason: z.string().trim().min(1).max(240) }).strict();
export const commandIdSchema = z.coerce.number().int().min(1).max(4294967295);
