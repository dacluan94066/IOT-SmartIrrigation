// Chỉ phục vụ DB trống tạm trên localhost3002 cho TC46. Không dùng DB sản phẩm.
import { openDatabase } from '../../../backend/src/database/index.js';
import { createApp } from '../../../backend/src/app.js';
import { loadConfig } from '../../../backend/src/config/env.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'smart-irrigation-phase5-empty-'));
const config=loadConfig({...process.env,PORT:'3002',DATABASE_PATH:path.join(dir,'empty.sqlite')});
const db=openDatabase(config.databasePath),server=createApp(config,db).listen(3002,'127.0.0.1',()=>console.log('PHASE5 EMPTY TEST ONLY http://localhost:3002; temporary SQLite; production untouched'));
server.on('error',e=>{console.error(e.code);db.close();process.exitCode=1;});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>{db.close();process.exit(0);}));
