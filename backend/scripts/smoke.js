// HTTP client trên PC: không phải bằng chứng ESP32/Wokwi.
const base='http://127.0.0.1:3001/api/v1';
async function request(route,method='GET',body,device=false) {
  const r=await fetch(base+route,{method,headers:{Authorization:`Bearer ${device?process.env.DEVICE_API_TOKEN:process.env.ADMIN_API_TOKEN}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const json=await r.json(); if(!r.ok) throw new Error(`${r.status}: ${JSON.stringify(json)}`);
  return json;
}
const action=process.argv[2]||'smoke', deviceId=process.env.DEVICE_ID;
if(action==='smoke') {
  console.log('PC HTTP health:',JSON.stringify(await request('/health')));
  console.log('PC synthetic telemetry:',JSON.stringify(await request('/telemetry','POST',{deviceId,bootId:'pc-smoke',sequence:Date.now()%4294967296,soilMoisturePercent:22.5,temperatureC:null,rainProbabilityPercent:85,precipitationMm:null,weatherSource:'SIMULATED',weatherStatus:'VALID',pumpState:'TAT',decision:'TAM_HOAN',reason:'PC SMOKE ONLY - not ESP32 runtime',deviceTimestamp:new Date().toISOString(),uptimeMs:0},true)));
  console.log('state:',JSON.stringify(await request(`/state?deviceId=${deviceId}`)));
  console.log('history:',JSON.stringify(await request(`/history?deviceId=${deviceId}&page=1&limit=3`)));
} else if(action==='state' || action==='commands' || action==='history') console.log(JSON.stringify(await request(`/${action}?deviceId=${deviceId}${action==='history'?'&limit=100':''}`),null,2));
else if(['AUTO','MANUAL_ON','MANUAL_OFF'].includes(action)) console.log(JSON.stringify(await request('/commands','POST',{deviceId,type:action,ttlSeconds:Number(process.argv[3]||15)}),null,2));
else throw new Error('Use smoke/state/history/commands/AUTO/MANUAL_ON/MANUAL_OFF');
