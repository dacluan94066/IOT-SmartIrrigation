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
      type TEXT NOT NULL CHECK(type IN ('AUTO','MANUAL_ON','MANUAL_OFF','DEMO_SET','DEMO_STOP')),
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING','DELIVERED','EXECUTED','REJECTED','EXPIRED','SUPERSEDED')),
      delivered_boot_id TEXT, delivered_at TEXT, ack_at TEXT, ack_reason TEXT,
      demo_soil_percent REAL, demo_rain_percent REAL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS commands_device_status ON commands(device_id, status, id DESC);
    `);
  // Migration v2: giữ mọi bản ghi/ID/ACK và sequence, không reset database.
  db.exec('BEGIN IMMEDIATE');
  try {
    const commandSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='commands'").get().sql;
    if (!commandSql.includes('DEMO_SET')) {
      const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='commands'").get()?.seq || 0;
      db.exec(`DROP INDEX IF EXISTS commands_device_status;
        ALTER TABLE commands RENAME TO commands_before_demo;
        CREATE TABLE commands (
          id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('AUTO','MANUAL_ON','MANUAL_OFF','DEMO_SET','DEMO_STOP')),
          created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('PENDING','DELIVERED','EXECUTED','REJECTED','EXPIRED','SUPERSEDED')),
          delivered_boot_id TEXT, delivered_at TEXT, ack_at TEXT, ack_reason TEXT,
          demo_soil_percent REAL, demo_rain_percent REAL
        ) STRICT;
        INSERT INTO commands(id,device_id,type,created_at,expires_at,status,delivered_boot_id,delivered_at,ack_at,ack_reason)
          SELECT id,device_id,type,created_at,expires_at,status,delivered_boot_id,delivered_at,ack_at,ack_reason FROM commands_before_demo;
        DROP TABLE commands_before_demo;
        CREATE INDEX commands_device_status ON commands(device_id,status,id DESC);`);
      db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='commands'").run(sequence);
      db.prepare("INSERT INTO sqlite_sequence(name,seq) SELECT 'commands',? WHERE NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='commands')").run(sequence);
    }
    const columns = new Set(db.prepare('PRAGMA table_info(telemetry)').all().map(c => c.name));
    for (const [name, definition] of Object.entries({
      raw_soil_moisture_percent: 'REAL', soil_source: "TEXT NOT NULL DEFAULT 'REAL'",
      demo_supported: 'INTEGER NOT NULL DEFAULT 0', demo_active: 'INTEGER NOT NULL DEFAULT 0',
      demo_command_id: 'INTEGER', demo_remaining_ms: 'INTEGER NOT NULL DEFAULT 0', demo_expires_at: 'TEXT',
    })) if (!columns.has(name)) db.exec(`ALTER TABLE telemetry ADD COLUMN ${name} ${definition}`);
    db.exec('PRAGMA user_version=2; COMMIT');
  } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  return db;
}
