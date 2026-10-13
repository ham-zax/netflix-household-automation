// HTTP-only, read-only probe for Netflix Household update authorization links.
// No Chromium, Playwright, CloakBrowser, cookies copied or POSTs. Never logs token/query values.
import {load as parseHtml} from 'cheerio';

export class ProbeError extends Error {
 constructor(code, message) {super(message);this.name='ProbeError';this.code=code;}
}
export function validateHouseholdLink(input) {
 let u;
 try{u=new URL(input);} catch{throw new ProbeError('INVALID_URL','Not a URL');}
 if(u.protocol!=='https:' || u.hostname!=='www.netflix.com' ||
    u.pathname!=='/account/update-primary-location' ||
    u.username || u.password || u.port || !u.searchParams.has('nftoken'))
    throw new ProbeError('UNTRUSTED_LINK','Not an expected Netflix Household authorization link');
 return u;
}
export function safePath(input) {
 try{return new URL(input).pathname;}catch{return 'invalid';}
}
export async function probeApprovedLink(input,{transport=fetch,maxRedirects=2}={}) {
 const initial=validateHouseholdLink(input);
 let current=initial;
 const hops=[];
 for(let n=0;n<=maxRedirects;n++){
   const response=await transport(current.href,{
      method:'GET',redirect:'manual',signal:AbortSignal.timeout(13000),
      headers:{'accept':'text/html,application/xhtml+xml;q=0.9',
        'user-agent':'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'}
   });
   const header=response.headers.get('location');
   const next=header?new URL(header,current):null;
   const type=response.headers.get('content-type')||'';
   const html=type.includes('html')?await response.text():'';
   const $=parseHtml(html);
   const body=$('body').text().replace(/\s+/g,' ').slice(0,260);
   const buttons=$('button').map((_,el)=>({
      label:$(el).text().replace(/\s+/g,' ').trim().slice(0,65),
      dataUia:$(el).attr('data-uia')||''
   })).get().slice(0,12);
   const forms=$('form').map((_,el)=>({
      method:($(el).attr('method')||'GET').toUpperCase(),
      action:$(el).attr('action')?safePath(new URL($(el).attr('action'),current)):current.pathname
   })).get().slice(0,6);
   hops.push({status:response.status,path:current.pathname,
      redirectTo:next?next.pathname:null,
      hasConfirmButton:buttons.some(b=>b.dataUia==='set-primary-location-action'),
      buttonCount:buttons.length,formCount:forms.length,
      htmlLength:html.length,bodyPreview:body});
   if(next){
      if(next.protocol!=='https:' || next.hostname!=='www.netflix.com' || next.port)
         throw new ProbeError('UNTRUSTED_REDIRECT','Unexpected cross-origin redirect');
      if(next.pathname.includes('/login'))return {result:'LOGIN_REDIRECT',hops};
      current=next;continue;
   }
   return {result:hops.at(-1).hasConfirmButton?'CONFIRM_PAGE':'NON_CONFIRM_PAGE',hops};
 }
 return {result:'REDIRECT_LIMIT',hops};
}
