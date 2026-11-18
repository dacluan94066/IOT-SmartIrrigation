import { randomBytes,scryptSync } from 'node:crypto';
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const envFile=fileURLToPath(new URL('../.env',import.meta.url));
const credentialsFile=fileURLToPath(new URL('../.dashboard-login',import.meta.url));
if(!existsSync(envFile))throw new Error('Run npm run provision first');
let env=readFileSync(envFile,'utf8');
if(/^DASHBOARD_PASSWORD_HASH=/m.test(env)&&!process.argv.includes('--reset')){
  console.log('Dashboard password is already configured. Use --reset explicitly to rotate.');
}else{
  const password=process.env.DASHBOARD_PASSWORD||randomBytes(18).toString('base64url');
  if(password.length<12||password.length>128)throw new Error('Password must be12–128 characters');
  const salt=randomBytes(16).toString('hex'), hash=`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`;
  env=env.replace(/^DASHBOARD_PASSWORD_HASH=.*\r?\n?/m,'');
  writeFileSync(envFile,env.trimEnd()+`\nDASHBOARD_PASSWORD_HASH=${hash}\n`,{mode:0o600});
  writeFileSync(credentialsFile,JSON.stringify({password},null,2)+'\n',{mode:0o600});
  console.log('Dashboard password hash saved in .env. Local login password is in backend/.dashboard-login (ignored). Password/tokens are not printed. Restart Backend.');
}
