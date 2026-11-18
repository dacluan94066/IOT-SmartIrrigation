import { mkdirSync,writeFileSync } from 'node:fs';
// Chỉ chụp API/SQLite đã nhận. Không tạo telemetry, không in token, không giả log UART.
const label=process.argv[2]||'runtime';
if(!/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error('Invalid evidence label');
const result={capturedAt:new Date().toISOString(),source:'PC readback of backend API; telemetry bootId distinguishes ESP32 from pc-smoke'};
for(const route of ['health',`state?deviceId=${process.env.DEVICE_ID}`,`history?deviceId=${process.env.DEVICE_ID}&limit=100`,`commands?deviceId=${process.env.DEVICE_ID}`]) {
  const r=await fetch('http://127.0.0.1:3001/api/v1/'+route,{headers:{Authorization:`Bearer ${process.env.ADMIN_API_TOKEN}`}});
  if(!r.ok) throw new Error(`Readback HTTP ${r.status}`);
  result[route.split('?')[0]]=await r.json();
}
mkdirSync('test-results',{recursive:true});
writeFileSync(`test-results/${label}.json`,JSON.stringify(result,null,2));
console.log(`Saved test-results/${label}.json (${result.history.meta.total} records in DB)`);
