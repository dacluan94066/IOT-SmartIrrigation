import { ok, validate } from '../middleware/http.js';
import { telemetrySchema, deviceQuery, historyQuery, commandSchema, pollSchema, ackSchema, commandIdSchema } from '../services/validation.js';

export function controllers(service, db) {
  return {
    health: (req,res) => { db.prepare('SELECT 1').get(); ok(res,{ status:'ok', database:'ok', serverTime:new Date().toISOString() }); },
    telemetry: (req,res) => { const r=service.telemetry(validate(telemetrySchema,req.body)); ok(res,r.record,r.duplicate?200:201,{duplicate:r.duplicate}); },
    state: (req,res) => ok(res,service.state(validate(deviceQuery,req.query).deviceId)),
    history: (req,res) => { const {records,...meta}=service.history(validate(historyQuery,req.query)); ok(res,records,200,meta); },
    createCommand: (req,res) => ok(res,service.createCommand(validate(commandSchema,req.body)),201),
    commands: (req,res) => ok(res,service.commands(validate(deviceQuery,req.query).deviceId)),
    poll: (req,res) => ok(res,service.poll(validate(pollSchema,req.query))),
    ack: (req,res) => ok(res,service.ack(validate(commandIdSchema,req.params.id),validate(ackSchema,req.body)))
  };
}
