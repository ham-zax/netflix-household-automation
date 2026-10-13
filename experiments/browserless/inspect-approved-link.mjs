// Passive investigation only. Fetch a previously approved Netflix email link using Node HTTP.
// Never prints URL/query/cookies or triggers confirmation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {load as cheerioLoad} from 'cheerio';
const file=path.join(os.homedir(),'.local/state/oracle-gmail-listener/state.json');
const data=JSON.parse(fs.readFileSync(file,'utf8'));
const latest=data.pending?.filter(x=>x.status==='approved'&&x.link).at(-1);
if(!latest) throw new Error('No completed request found');
const link=new URL(latest.link);
if(link.protocol!=='https:' || link.hostname!=='www.netflix.com' || link.pathname!=='/account/update-primary-location') throw new Error('Unexpected URL');
const safe=(value)=>{try{const u=new URL(value);return u.hostname+u.pathname}catch{return 'relative-or-invalid'}};
const req=async(url)=>{
 const r=await fetch(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'user-agent':'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36','accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','accept-language':'en-US,en;q=0.9'}});
 const html=await r.text();
 const $=cheerioLoad(html);
 const namedInputs=$('input').map((_,el)=>({name:$(el).attr('name')||'',type:$(el).attr('type')||'',id:$(el).attr('id')||''})).get().filter(o=>o.name||o.id).slice(0,15);
 const scripts=$('script[src]').map((_,el)=>safe(new URL($(el).attr('src'),url))).get().slice(-16);
 const forms=$('form').map((_,el)=>({method:$(el).attr('method')||'GET',action:safe(new URL($(el).attr('action')||'',url))})).get().slice(0,8);
 const text=$('body').text().replace(/\s+/g,' ').slice(0,230);
 console.log(JSON.stringify({url:safe(url),status:r.status,contentType:r.headers.get('content-type'),location:r.headers.get('location')?safe(new URL(r.headers.get('location'),url)):null,length:html.length,title:$('title').first().text().slice(0,90),formCount:forms.length,forms,inputs:namedInputs,scriptCount:$('script[src]').length,scripts,bodySnippet:text},null,2));
 return {location:r.headers.get('location'),r};
};
const {location}=await req(link.href);
if(location){const next=new URL(location,link);if(next.hostname==='www.netflix.com') await req(next.href);}
