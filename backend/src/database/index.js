import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000;
    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL, boot_id TEXT NOT NULL, sequence INTEGER NOT NULL,
      received_at TEXT NOT NULL, device_timestamp TEXT,
      soil_moisture_percent REAL NOT NULL, temperature_c REAL, rain_probability_percent REAL,
      precipitation_mm REAL, weather_source TEXT NOT NULL, weather_status TEXT NOT NULL,
      pump_state TEXT NOT NULL, decision TEXT NOT NULL, reason TEXT NOT NULL,
      mode TEXT NOT NULL, uptime_ms INTEGER NOT NULL, weather_updated_at TEXT,
      UNIQUE(device_id, boot_id, sequence)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS telemetry_device_latest ON telemetry(device_id, id DESC);
    CREATE TABLE IF NOT EXISTS commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('AUTO','MANUAL_ON','MANUAL_OFF')),
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING','DELIVERED','EXECUTED','REJECTED','EXPIRED','SUPERSEDED')),
      delivered_boot_id TEXT, delivered_at TEXT, ack_at TEXT, ack_reason TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS commands_device_status ON commands(device_id, status, id DESC);
    PRAGMA user_version=1;`);
  return db;
}
