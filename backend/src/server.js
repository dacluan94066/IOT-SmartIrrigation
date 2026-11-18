import { loadConfig } from './config/env.js';
import { openDatabase } from './database/index.js';
import { createApp } from './app.js';
try {
  const config=loadConfig(), db=openDatabase(config.databasePath);
  const server=createApp(config,db).listen(config.port,config.host,()=>console.log(`[Backend] http://${config.host}:${config.port} | SQLite ready | device=${config.deviceId}`));
  server.requestTimeout=10000; server.headersTimeout=10000;
  server.on('error',e=>{ console.error('[Backend]',e.code); db.close(); process.exitCode=1; });
  for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
} catch(e) { console.error('[Backend] Invalid configuration/startup:',e.issues ? e.issues.map(i=>i.path.join('.')).join(', ') : e.message); process.exitCode=1; }
