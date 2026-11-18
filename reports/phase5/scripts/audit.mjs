// QA readback: không tạo telemetry/lệnh vào DB sản phẩm, không xuất credential.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const evidence=path.join(root,'reports/phase5/evidence');mkdirSync(evidence,{recursive:true});
const mode=process.argv[2]||'baseline';
const get=async route=>{
  const res=await fetch('http://127.0.0.1:3001/api/v1/'+route,{headers:{Authorization:`Bearer ${process.env.ADMIN_API_TOKEN}`},signal:AbortSignal.timeout(5000)});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);return res.json();
};
function manifest(){
  const result={};
  function walk(dir){for(const entry of readdirSync(path.join(root,dir),{withFileTypes:true})){
    const rel=path.posix.join(dir,entry.name);
    if(entry.isDirectory()){if(!['node_modules','dist','data','test-results','results'].includes(entry.name))walk(rel);}
    else if(!['BackendLocal.h','.env','.dashboard-login'].includes(entry.name)&&!entry.name.endsWith('.tsbuildinfo'))result[rel]=createHash('sha256').update(readFileSync(path.join(root,rel))).digest('hex');
  }}
  for(const dir of ['src','include','backend','frontend','test'])walk(dir);
  for(const file of ['platformio.ini','diagram.json','wokwi.toml'])result[file]=createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex');
  return result;
}
async function snapshot(){
  const [health,state,history,commands]=await Promise.all(['health',`state?deviceId=${process.env.DEVICE_ID}`,`history?deviceId=${process.env.DEVICE_ID}&limit=100`,`commands?deviceId=${process.env.DEVICE_ID}`].map(get));
  const dbPath=path.resolve(root,'backend',process.env.DATABASE_PATH||'./data/irrigation.sqlite');
  const db=new DatabaseSync(dbPath,{readOnly:true});
  try{
    const latest=db.prepare('SELECT * FROM telemetry ORDER BY id DESC LIMIT 1').get();
    const apiRow=state.data?db.prepare('SELECT * FROM telemetry WHERE id=?').get(state.data.id):null;
    const stats=db.prepare('SELECT COUNT(*) AS count,MIN(received_at) AS first,MAX(received_at) AS last FROM telemetry').get();
    return {capturedAt:new Date().toISOString(),source:'Live API + read-only SQLite, no synthetic POST',health,state,history,commands,sqlite:{quickCheck:db.prepare('PRAGMA quick_check').get(),stats,apiRow,latest},dbBytes:statSync(dbPath).size};
  }finally{db.close();}
}
if(mode==='baseline'||mode==='final'){
  const report={capturedAt:new Date().toISOString(),node:process.version,manifest:manifest(),publicConfig:{demo:false,backendOfflineMs:Number(process.env.DASHBOARD_OFFLINE_MS||30000),telemetryIntervalMs:5000},live:await snapshot()};
  // demo thực sự đọc từ Config, không giả định giá trị baseline.
  report.publicConfig.demo=/DEMO_WEATHER_MODE\s*=\s*true/.test(readFileSync(path.join(root,'include/Config.h'),'utf8'));
  writeFileSync(path.join(evidence,`${mode}.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify({mode,at:report.capturedAt,weather:report.live.state.data?.weatherStatus,boot:report.live.state.data?.bootId,rows:report.live.sqlite.stats.count}));
}else if(mode==='soak'){
  const started=Date.now(),duration=15*60*1000, samples=[];
  console.log(`FUNCTIONAL ENDURANCE BEGIN ${new Date(started).toISOString()} durationMs=${duration}; planned UI/outage actions logged separately`);
  do{
    const at=Date.now();try{const [h,s]=await Promise.all([get('health'),get(`state?deviceId=${process.env.DEVICE_ID}`)]);
      samples.push({at:new Date(at).toISOString(),health:h.data.status,elapsedMs:Date.now()-at,state:s.data});
    }catch(e){samples.push({at:new Date(at).toISOString(),error:e.message});}
    writeFileSync(path.join(evidence,'endurance.json'),JSON.stringify({startedAt:new Date(started).toISOString(),requestedDurationMs:duration,elapsedMs:Date.now()-started,completed:Date.now()-started>=duration,samples},null,2));
    if(samples.length%3===1)console.log(JSON.stringify({samples:samples.length,elapsedSeconds:Math.round((Date.now()-started)/1000),weather:samples.at(-1).state?.weatherStatus,error:samples.at(-1).error}));
    if(Date.now()-started<duration)await new Promise(r=>setTimeout(r,10000));
  }while(Date.now()-started<duration);
  const end=Date.now();writeFileSync(path.join(evidence,'endurance.json'),JSON.stringify({startedAt:new Date(started).toISOString(),finishedAt:new Date(end).toISOString(),requestedDurationMs:duration,elapsedMs:end-started,completed:true,samples},null,2));
  console.log(`FUNCTIONAL ENDURANCE END elapsedMs=${end-started} samples=${samples.length}`);
}else{throw new Error('Unknown audit mode');}
