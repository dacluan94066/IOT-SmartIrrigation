import express from 'express';
import cors from 'cors';
import { ApiError,errorHandler } from './middleware/http.js';
import { createService } from './services/irrigation.js';
import { controllers } from './controllers/api.js';
import { routes } from './routes/api.js';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export function createApp(config,db,clock) {
  const app=express(); app.disable('x-powered-by');
  const allowedOrigins=new Set([...config.corsOrigins,`http://127.0.0.1:${config.port||3001}`,`http://localhost:${config.port||3001}`]);
  app.use(cors({ origin(origin,cb) { cb(origin && !allowedOrigins.has(origin) ? new ApiError(403,'ORIGIN_FORBIDDEN','Origin not allowed') : null,Boolean(origin)); },methods:['GET','POST'],allowedHeaders:['Content-Type','Authorization'] }));
  app.use(express.json({limit:'8kb',strict:true}));
  app.use('/api/v1',routes(controllers(createService(db,config.deviceId,clock,{demoEnabled:config.remoteDemoEnabled===true,offlineAfterMs:config.dashboardOfflineMs}),db),config,db,clock));
  // Bản build local production cùng origin, cookie không cần trao token cho JS.
  const dist=fileURLToPath(new URL('../../frontend/dist/',import.meta.url));
  if(existsSync(path.join(dist,'index.html'))){
    app.use((req,res,next)=>{res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");res.set('X-Content-Type-Options','nosniff');next();});
    app.use(express.static(dist,{index:false}));
    app.use((req,res,next)=>req.method==='GET'&&!req.path.startsWith('/api/')&&req.accepts('html')?res.sendFile(path.join(dist,'index.html')):next());
  }
  app.use((req,res,next)=>next(new ApiError(404,'NOT_FOUND','Route not found')));
  app.use(errorHandler); return app;
}
