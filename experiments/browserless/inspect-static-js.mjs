// Passive static probe of publicly served Netflix JS assets. No account token, no confirmation.
import {load as loadHtml} from 'cheerio';
const html=await fetch('https://www.netflix.com/login',{signal:AbortSignal.timeout(15000)}).then(r=>r.text());
const $=loadHtml(html);
const srcs=[...new Set($('script[src]').map((_,e)=>new URL($(e).attr('src'),'https://www.netflix.com').href).get())].filter(u=>new URL(u).protocol==='https:');
const hints=[
 'set-primary-location-action','update-primary-location','upl-invalid-token',
 'setPrimaryLocation','updatePrimaryLocation','nftoken','confirmPrimaryLocation'
];
console.log('Public login JS assets:',srcs.length);
for (const [i,src] of srcs.slice(0,35).entries()){
 try{
   const r=await fetch(src,{signal:AbortSignal.timeout(9000)});
   if(!r.ok)continue;
   const length=Number(r.headers.get('content-length'))||0;
   if(length>8000000){console.log('skip huge script index',i,'length',length);continue;}
   const t=await r.text();
   const found=hints.filter(h=>t.toLowerCase().includes(h.toLowerCase()));
   if(found.length) {
     const x=new URL(src);
     console.log('Script #',i,'host',x.hostname,'path',x.pathname.slice(-125),'bytes',t.length,'matching labels:',found.join(','));
     // Only short static snippet surrounding selector; no URLs or secrets.
     for(const hint of found.slice(0,3)){
       const j=t.toLowerCase().indexOf(hint.toLowerCase());
       const sample=t.slice(Math.max(0,j-60),Math.min(t.length,j+hint.length+90));
       console.log('  context for',hint, sample.replace(/https?:\/\/[^ "'<>]+/g,'<url>').slice(0,180));
     }
   }
 }catch(e){ console.log('Asset #'+i+': '+e.name); }
}
