import { randomBytes } from 'node:crypto';
import { existsSync,readFileSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/env.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const envPath=path.join(root,'.env');
if(!existsSync(envPath)) {
  const template=readFileSync(path.join(root,'.env.example'),'utf8')
    .replace('DEVICE_API_TOKEN=','DEVICE_API_TOKEN='+randomBytes(32).toString('hex'))
    .replace('ADMIN_API_TOKEN=','ADMIN_API_TOKEN='+randomBytes(32).toString('hex'));
  writeFileSync(envPath,template,{flag:'wx',mode:0o600});
}
process.loadEnvFile(envPath);
const config=loadConfig();
const endpoint=process.env.DEVICE_BACKEND_URL||'http://host.wokwi.internal:3001';
const u=new URL(endpoint);
if(u.protocol!=='http:' || u.hostname!=='host.wokwi.internal' || u.username || u.password || u.pathname!=='/' || u.search || u.hash) throw new Error('Local Wokwi HTTP origin required');
const header=path.resolve(root,'../include/BackendLocal.h');
const marker='// GENERATED LOCAL CONFIG - DO NOT COMMIT';
if(existsSync(header) && !readFileSync(header,'utf8').startsWith(marker)) throw new Error('Refusing to overwrite user-owned BackendLocal.h');
writeFileSync(header,`${marker}\n#pragma once\nnamespace BackendLocal {\nconstexpr bool ENABLED=true;\nconstexpr char HOST[]=${JSON.stringify(u.hostname)};\nconstexpr uint16_t PORT=${Number(u.port||80)};\nconstexpr char DEVICE_ID[]=${JSON.stringify(config.deviceId)};\nconstexpr char TOKEN[]=${JSON.stringify(config.deviceToken)};\n}\n`,{mode:0o600});
console.log('Local .env and ignored BackendLocal.h ready. Tokens are not printed. Rebuild firmware.');
