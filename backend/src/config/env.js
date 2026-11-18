import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  HOST: z.enum(['127.0.0.1', '::1']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_PATH: z.string().min(1).default('./data/irrigation.sqlite'),
  DEVICE_ID: z.string().regex(/^[A-Za-z0-9_-]{1,48}$/),
  DEVICE_API_TOKEN: z.string().min(32).max(256),
  ADMIN_API_TOKEN: z.string().min(32).max(256),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DASHBOARD_PASSWORD_HASH: z.string().regex(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/).optional(),
  DASHBOARD_OFFLINE_MS: z.coerce.number().int().min(15000).max(120000).default(30000),
  DASHBOARD_COOKIE_SECURE: z.enum(['true','false']).default('false'),
  REMOTE_DEMO_ENABLED: z.enum(['true','false']).default('false')
});

export function loadConfig(env = process.env) {
  const v = schema.parse(env);
  if (v.DEVICE_API_TOKEN === v.ADMIN_API_TOKEN) throw new Error('Device/admin tokens must differ');
  const origins = v.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  for (const origin of origins) {
    const u = new URL(origin);
    if (!['http:', 'https:'].includes(u.protocol) || u.origin !== origin) throw new Error('Invalid CORS origin');
  }
  return {
    host: v.HOST, port: v.PORT, databasePath: path.resolve(v.DATABASE_PATH),
    deviceId: v.DEVICE_ID, deviceToken: v.DEVICE_API_TOKEN,
    adminToken: v.ADMIN_API_TOKEN, corsOrigins: origins,
    dashboardPasswordHash:v.DASHBOARD_PASSWORD_HASH,dashboardOfflineMs:v.DASHBOARD_OFFLINE_MS,
    dashboardCookieSecure:v.DASHBOARD_COOKIE_SECURE==='true',remoteDemoEnabled:v.REMOTE_DEMO_ENABLED==='true'
  };
}
