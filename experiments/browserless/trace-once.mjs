// EXPERIMENTAL ONLY: trace Netflix confirmation's HTTP transaction in a disposable browser.
// Read a private one-line URL file, or inspect the most recent already-approved link.
// A real confirmation click requires --confirm and a fresh link. NOT used by the live listener.
// Detailed network capture is 0600 outside Git; console output omits tokens/cookies/POST values.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {launchPersistentContext} from 'cloakbrowser';
import {validateHouseholdLink} from './http-probe.mjs';
const args=process.argv.slice(2);
const shouldConfirm=args.includes('--confirm');
const index=args.indexOf('--url-file');
const stateFile=path.join(os.homedir(),'.local','state','oracle-gmail-listener','state.json');
let link;
if(index>=0) {
 const f=args[index+1];if(!f)throw new Error('Missing --url-file argument');
 if(fs.statSync(f).mode&0o077)throw new Error('Input must be mode 0600');
 link=fs.readFileSync(f,'utf8').trim();
} else if(args.includes('--latest-approved')) {
 const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 link=state.pending?.filter(x=>x.status==='approved').at(-1)?.link;
 if(shouldConfirm)throw new Error('Refusing to retry an already-approved link');
} else throw new Error('Use --latest-approved (read-only) or --url-file PRIVATE_PATH [--confirm]');
validateHouseholdLink(link);
const dir=path.join(os.homedir(),'.local','state','oracle-gmail-listener','traces');
fs.mkdirSync(dir,{recursive:true,mode:0o700});
fs.chmodSync(dir,0o700);
const profile=fs.mkdtempSync(path.join(dir,'browser-profile-'));
let context;
const captured=[];
const tasks=[];
function allowed(url) {try {return new URL(url).hostname.endsWith('.netflix.com')} catch{return false;}}
function safe(u){const url=new URL(u);return url.origin+url.pathname;}
function sanitizeRecord(rec) {
 const r={method:rec.method,status:rec.status,path:rec.path,resourceType:rec.resourceType};
 if(rec.postData){
  try{
   const obj=JSON.parse(rec.postData);
   r.jsonKeys=Object.keys(obj).slice(0,18);
   r.operationName=typeof obj.operationName==='string'?obj.operationName.slice(0,80):undefined;
   r.variableNames=obj.variables&&typeof obj.variables==='object'?Object.keys(obj.variables).slice(0,24):[];
  } catch {r.bodyKind='not-json';}
 }
 return r;
}
try{
 context=await launchPersistentContext({userDataDir:profile,headless:true});
 const page=context.pages()[0]||await context.newPage();
 const requests=new WeakMap();
 page.on('request',request=>{
  if(!allowed(request.url()))return;
  const kind=request.resourceType();
  if(!['xhr','fetch','document'].includes(kind))return;
  const rec={path:safe(request.url()),method:request.method(),resourceType:kind,
    headers:request.headers(),postData:request.postData(),status:null};
  captured.push(rec);requests.set(request,rec);
 });
 page.on('response',response=>{
  if(!allowed(response.url()))return;
  const req=response.request();const rec=requests.get(req);
  if(!rec)return;
  rec.status=response.status();
  const kind=req.resourceType();
  if(['xhr','fetch'].includes(kind)){
   tasks.push((async()=>{
    try{const buf=await response.body();if(buf.byteLength<200_000)rec.responseBody=buf.toString('utf8')}catch{}
   })());
  }
 });
 page.on('requestfailed',request=>{const rec=requests.get(request);if(rec)rec.failure=request.failure()?.errorText});
 await page.goto(link,{waitUntil:'domcontentloaded',timeout:28000});
 await page.waitForTimeout(700);
 const at=new URL(page.url());
 console.log('Navigation path:',at.pathname);
 const confirm=page.locator('[data-uia="set-primary-location-action"]').first();
 const visible=await confirm.isVisible().catch(()=>false);
 console.log('Confirm button present:',visible);
 if(visible&&shouldConfirm){
  await confirm.click({timeout:15000});
  await page.getByText(/you(?: have|'ve) updated your netflix household/i).first().waitFor({timeout:18000});
  console.log('Netflix confirmation page verified: YES');
 }else if(shouldConfirm)console.log('No confirm button; no mutation attempted.');
 else console.log('Read-only capture; did NOT click confirm.');
 await Promise.allSettled(tasks);
 const last=Date.now();
 const output=path.join(dir,'trace-'+last+'.json');
 fs.writeFileSync(output,JSON.stringify({capturedAt:new Date().toISOString(),requests:captured},null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log('PRIVATE full request capture saved:',output);
 console.log('Safe network event summary:',JSON.stringify(captured.filter(r=>['xhr','fetch'].includes(r.resourceType)).map(sanitizeRecord).slice(-24),null,2));
} catch(e){console.log('Trace result:',e.name, String(e.message).replace(/https?:\/\/[^\s]+/g,'<URL>').slice(0,140));process.exitCode=2;}
finally{await context?.close().catch(()=>{});fs.rmSync(profile,{force:true,recursive:true});}
