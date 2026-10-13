// Optional diagnostic: record the approval page's HTTP traffic so a browserless approver can be
// built from a real run. Off unless HOUSEHOLD_TRACE=1. The file holds the one-time link, headers
// and response bodies, so it is written 0600 under the private state directory and never logged.
import fs from 'node:fs';
import path from 'node:path';
import {STATE_DIR} from './config.js';

const KINDS=['document','xhr','fetch'];
const isNetflix=url=>{try {return new URL(url).hostname.endsWith('.netflix.com');} catch {return false;}};
const enabled=()=>process.env.HOUSEHOLD_TRACE==='1';

export function writeTrace(prefix,data) {
 if(!enabled()) return;
 try {
  const dir=path.join(STATE_DIR,'traces');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(dir,prefix+'-'+Date.now()+'.json'),JSON.stringify(data)+'\n',{mode:0o600});
 } catch {}
}

export function startTrace(page) {
 if(!enabled()) return null;
 const records=[],byRequest=new WeakMap(),bodies=[];
 page.on('request',request=>{
  if(!isNetflix(request.url()) || !KINDS.includes(request.resourceType())) return;
  const rec={at:Date.now(),url:request.url(),method:request.method(),resourceType:request.resourceType(),
   headers:request.headers(),postData:request.postData(),status:null};
  records.push(rec);byRequest.set(request,rec);
 });
 page.on('response',response=>{
  const rec=byRequest.get(response.request());
  if(!rec) return;
  rec.status=response.status();rec.responseHeaders=response.headers();
  // headers() leaves out Set-Cookie; the raw list shows which response set which cookie.
  bodies.push(response.headersArray().then(list=>{
   rec.setCookieNames=list.filter(h=>h.name.toLowerCase()==='set-cookie').map(h=>h.value.split('=')[0]);
  }).catch(()=>{}));
  bodies.push(response.body().then(buf=>{if(buf.byteLength<1_500_000) rec.responseBody=buf.toString('utf8');}).catch(()=>{}));
 });
 return {
  async save(context) {
   try {
    await Promise.race([Promise.allSettled(bodies),new Promise(r=>setTimeout(r,5000))]);
    const cookies=await context.cookies().catch(()=>[]);
    writeTrace('approve',{requests:records,cookies});
   } catch {}
  }
 };
}
