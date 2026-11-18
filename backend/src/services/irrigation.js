import { ApiError } from '../middleware/http.js';

const view = r => r ? ({
  id: r.id, deviceId: r.device_id, bootId: r.boot_id, sequence: r.sequence,
  receivedAt: r.received_at, deviceTimestamp: r.device_timestamp,
  soilMoisturePercent: r.soil_moisture_percent, temperatureC: r.temperature_c,
  rainProbabilityPercent: r.rain_probability_percent, precipitationMm: r.precipitation_mm,
  weatherSource: r.weather_source, weatherStatus: r.weather_status, pumpState: r.pump_state,
  decision: r.decision, reason: r.reason, mode: r.mode, uptimeMs: r.uptime_ms, weatherUpdatedAt: r.weather_updated_at
}) : null;
const commandView = r => r ? ({ id: r.id, deviceId: r.device_id, type: r.type, createdAt: r.created_at, expiresAt: r.expires_at, status: r.status, ackAt: r.ack_at, ackReason: r.ack_reason }) : null;

export function createService(db, deviceId, clock = () => Date.now()) {
  const checkDevice = id => { if (id !== deviceId) throw new ApiError(403, 'DEVICE_FORBIDDEN', 'Token/config does not authorize this device'); };
  const expire = now => db.prepare("UPDATE commands SET status='EXPIRED' WHERE expires_at<=? AND status IN ('PENDING','DELIVERED')").run(now);
  return {
    checkDevice,
    telemetry(p) {
      checkDevice(p.deviceId);
      const now = new Date(clock()).toISOString();
      const result = db.prepare(`INSERT INTO telemetry (device_id,boot_id,sequence,received_at,device_timestamp,soil_moisture_percent,temperature_c,rain_probability_percent,precipitation_mm,weather_source,weather_status,pump_state,decision,reason,mode,uptime_ms,weather_updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(device_id,boot_id,sequence) DO NOTHING`).run(p.deviceId,p.bootId,p.sequence,now,p.deviceTimestamp,p.soilMoisturePercent,p.temperatureC,p.rainProbabilityPercent,p.precipitationMm,p.weatherSource,p.weatherStatus,p.pumpState,p.decision,p.reason,p.mode,p.uptimeMs,p.weatherUpdatedAt);
      const record = db.prepare('SELECT * FROM telemetry WHERE device_id=? AND boot_id=? AND sequence=?').get(p.deviceId,p.bootId,p.sequence);
      // Một retry chỉ trả bản ghi cũ, không ghi đè lịch sử hoặc server timestamp.
      return { record: view(record), duplicate: result.changes === 0 };
    },
    state(id) { checkDevice(id); return view(db.prepare('SELECT * FROM telemetry WHERE device_id=? ORDER BY id DESC LIMIT 1').get(id)); },
    history({ deviceId: id, page, limit, from, to }) {
      checkDevice(id);
      const where='device_id=?'+(from?' AND received_at>=?':'')+(to?' AND received_at<=?':'');
      const args=[id,...(from?[new Date(from).toISOString()]:[]),...(to?[new Date(to).toISOString()]:[])];
      return { records: db.prepare(`SELECT * FROM telemetry WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args,limit,(page-1)*limit).map(view), page, limit, total: db.prepare(`SELECT COUNT(*) AS n FROM telemetry WHERE ${where}`).get(...args).n };
    },
    createCommand(p) {
      checkDevice(p.deviceId);
      const now = new Date(clock()).toISOString(); expire(now);
      // OFF đang hiệu lực chặn cả AUTO/ON mới; không thể bị mất vì request đồng thời.
      const off = db.prepare("SELECT id FROM commands WHERE device_id=? AND type='MANUAL_OFF' AND expires_at>? AND status IN ('PENDING','DELIVERED','EXECUTED') LIMIT 1").get(p.deviceId,now);
      if (off && p.type !== 'MANUAL_OFF') throw new ApiError(409,'MANUAL_OFF_PRIORITY','Wait for MANUAL_OFF lease to expire');
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare("UPDATE commands SET status='SUPERSEDED' WHERE device_id=? AND status IN ('PENDING','DELIVERED')").run(p.deviceId);
        const r = db.prepare("INSERT INTO commands(device_id,type,created_at,expires_at,status) VALUES(?,?,?,?,'PENDING')").run(p.deviceId,p.type,now,new Date(clock()+p.ttlSeconds*1000).toISOString());
        const row = db.prepare('SELECT * FROM commands WHERE id=?').get(r.lastInsertRowid);
        db.exec('COMMIT'); return commandView(row);
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    poll({ deviceId: id, bootId }) {
      checkDevice(id); const ms = clock(), now = new Date(ms).toISOString(); expire(now);
      // Không phát lại lệnh đã giao cho một boot trước, kể cả ACK bị mất.
      db.prepare("UPDATE commands SET status='REJECTED',ack_at=?,ack_reason='DEVICE_REBOOTED' WHERE device_id=? AND status='DELIVERED' AND delivered_boot_id<>?").run(now,id,bootId);
      const r = db.prepare("SELECT * FROM commands WHERE device_id=? AND status IN ('PENDING','DELIVERED') ORDER BY CASE type WHEN 'MANUAL_OFF' THEN 0 ELSE 1 END,id DESC LIMIT 1").get(id);
      if (r) db.prepare("UPDATE commands SET status='DELIVERED',delivered_boot_id=?,delivered_at=COALESCE(delivered_at,?) WHERE id=?").run(bootId,now,r.id);
      const lease = db.prepare("SELECT id,expires_at FROM commands WHERE device_id=? AND delivered_boot_id=? AND status IN ('DELIVERED','EXECUTED') ORDER BY id DESC LIMIT 1").get(id,bootId);
      // Xác nhận lại hạn dùng bằng clock server: không kéo dài TTL khi Wokwi chạy chậm.
      return { serverTime: now, controlLease: lease ? { id: lease.id, remainingTtlMs: Math.max(0,Date.parse(lease.expires_at)-ms) } : { id: 0, remainingTtlMs: 0 }, command: r ? { ...commandView({ ...r, status: 'DELIVERED' }), remainingTtlMs: Math.max(0,Date.parse(r.expires_at)-ms) } : null };
    },
    ack(id,p) {
      checkDevice(p.deviceId); const now = new Date(clock()).toISOString(); expire(now);
      const r = db.prepare('SELECT * FROM commands WHERE id=? AND device_id=?').get(id,p.deviceId);
      if (!r) throw new ApiError(404,'COMMAND_NOT_FOUND','Command not found');
      if (r.delivered_boot_id !== p.bootId) throw new ApiError(409,'WRONG_BOOT','Command belongs to another boot');
      if (r.status === p.status && r.ack_reason === p.reason) return commandView(r);
      if (r.status !== 'DELIVERED') throw new ApiError(409,'COMMAND_NOT_ACTIVE',`Command is ${r.status}`);
      db.prepare('UPDATE commands SET status=?,ack_at=?,ack_reason=? WHERE id=?').run(p.status,now,p.reason,id);
      return commandView(db.prepare('SELECT * FROM commands WHERE id=?').get(id));
    },
    commands(id) { checkDevice(id); expire(new Date(clock()).toISOString()); return db.prepare('SELECT * FROM commands WHERE device_id=? ORDER BY id DESC LIMIT 100').all(id).map(commandView); }
  };
}
