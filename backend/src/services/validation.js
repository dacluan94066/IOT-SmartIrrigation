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
  uptimeMs: z.number().int().min(0).max(4294967295),
  rawSoilMoisturePercent: percent.nullable().default(null),
  soilSource: z.enum(['REAL','SIMULATED']).default('REAL'),
  demoSupported: z.boolean().default(false), demoActive: z.boolean().default(false),
  demoCommandId: z.number().int().min(1).max(4294967295).nullable().default(null),
  demoRemainingMs: z.number().int().min(0).max(60000).default(0)
}).strict().superRefine((v, c) => {
  if (v.weatherStatus === 'VALID' && v.rainProbabilityPercent === null) c.addIssue({ code: 'custom', path: ['rainProbabilityPercent'], message: 'VALID requires rain probability' });
  if (v.weatherStatus !== 'VALID' && (v.temperatureC !== null || v.rainProbabilityPercent !== null || v.precipitationMm !== null)) c.addIssue({ code: 'custom', message: 'Unavailable weather values must be null, not fabricated zero' });
  if ((v.pumpState === 'BAT') !== (v.decision === 'TUOI')) c.addIssue({ code: 'custom', message: 'Pump and decision disagree' });
  if (v.demoActive && (!v.demoSupported || v.soilSource !== 'SIMULATED' || v.weatherSource !== 'SIMULATED' || v.mode !== 'AUTO' || !v.demoCommandId || !v.demoRemainingMs || v.rawSoilMoisturePercent === null)) c.addIssue({code:'custom',message:'Active demo requires simulated inputs, raw sensor, AUTO, supported firmware and finite lease'});
  if (!v.demoActive && (v.soilSource !== 'REAL' || v.demoCommandId !== null || v.demoRemainingMs !== 0)) c.addIssue({code:'custom',message:'Inactive demo must not carry simulated soil or a demo lease'});
});
export const deviceQuery = z.object({ deviceId }).strict();
export const historyQuery = z.object({ deviceId, page: z.coerce.number().int().min(1).max(1000000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),from:timestamp.optional(),to:timestamp.optional() }).strict().refine(v=>!v.from||!v.to||Date.parse(v.from)<=Date.parse(v.to),{message:'from must not exceed to'});
const ttl = z.number().int().min(1).max(60);
export const commandSchema = z.discriminatedUnion('type', [
  z.object({deviceId,type:z.enum(['AUTO','MANUAL_ON','MANUAL_OFF']),ttlSeconds:ttl.default(15)}).strict(),
  z.object({deviceId,type:z.literal('DEMO_SET'),ttlSeconds:ttl.default(60),soilMoisturePercent:percent,rainProbabilityPercent:percent}).strict(),
  z.object({deviceId,type:z.literal('DEMO_STOP'),ttlSeconds:ttl.default(15)}).strict(),
]);
export const pollSchema = z.object({ deviceId, bootId }).strict();
export const ackSchema = z.object({ deviceId, bootId, status: z.enum(['EXECUTED', 'REJECTED']), reason: z.string().trim().min(1).max(240) }).strict();
export const commandIdSchema = z.coerce.number().int().min(1).max(4294967295);
