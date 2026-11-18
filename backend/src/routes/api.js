import { Router } from 'express';
import { authenticate } from '../middleware/http.js';
import { dashboardRoutes } from '../middleware/dashboard.js';
export function routes(c, config, db, clock) {
  const r=Router(), device=authenticate(config.deviceToken), admin=authenticate(config.adminToken);
  r.get('/health',c.health);
  r.use('/dashboard',dashboardRoutes(config,db,c,clock));
  r.post('/telemetry',device,c.telemetry);
  r.get('/state',admin,c.state);
  r.get('/history',admin,c.history);
  r.post('/commands',admin,c.createCommand);
  r.get('/commands',admin,c.commands);
  r.get('/device/commands',device,c.poll);
  r.post('/device/commands/:id/ack',device,c.ack);
  return r;
}
