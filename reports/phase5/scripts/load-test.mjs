// Synthetic load test: DB tạm riêng, port ngẫu nhiên; không gửi tới production3001.
import { openDatabase } from '../../../backend/src/database/index.js';
import { createApp } from '../../../backend/src/app.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const dir=mkdtempSync(path.join(tmpdir(),'smart-irrigation-phase5-load-'));
const db=openDatabase(path.join(dir,'test.sqlite'));
const config={deviceId:'phase5-test',deviceToken:randomBytes(32).toString('hex'),adminToken:randomBytes(32).toString('hex'),corsOrigins:[],port:0};
const server=createApp(config,db).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}/api/v1`,latencies=[];
const start=performance.now();
try{
 for(let batch=0;batch<50;batch++)await Promise.all(Array.from({length:20},async(_,j)=>{
   const sequence=batch*20+j,begin=performance.now();
   const response=await fetch(base+'/telemetry',{method:'POST',headers:{Authorization:`Bearer ${config.deviceToken}`,'Content-Type':'application/json'},body:JSON.stringify({deviceId:config.deviceId,bootId:'phase5-load-fixture',sequence,soilMoisturePercent:50,temperatureC:25,rainProbabilityPercent:20,precipitationMm:0,weatherSource:'SIMULATED',weatherStatus:'VALID',pumpState:'TAT',decision:'KHONG_TUOI',reason:'PHASE5 ISOLATED LOAD FIXTURE, not ESP32',deviceTimestamp:null,uptimeMs:sequence*5000,mode:'AUTO'})});
   assert.equal(response.status,201);await response.json();latencies.push(performance.now()-begin);
 }));
 const elapsedMs=performance.now()-start;
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM telemetry').get().n,1000);
 const state=await(await fetch(base+'/state?deviceId='+config.deviceId,{headers:{Authorization:`Bearer ${config.adminToken}`}})).json();
 assert.equal(state.data.id,db.prepare('SELECT MAX(id) AS n FROM telemetry').get().n);
 assert.equal(Object.values(db.prepare('PRAGMA quick_check').get())[0],'ok');
 latencies.sort((a,b)=>a-b);
 const result={source:'PC synthetic HTTP + temporary SQLite, not Wokwi; no production writes',at:new Date().toISOString(),requests:1000,concurrency:20,batches:50,rows:1000,elapsedMs,p95ClientLatencyMs:latencies[Math.ceil(latencies.length*.95)-1],maxClientLatencyMs:latencies.at(-1),integrity:'ok',passed:true};
 writeFileSync(new URL('../evidence/load-test.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();}
