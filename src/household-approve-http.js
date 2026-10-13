// Browserless approval of a Netflix "update household" email link: load the page over plain
// HTTP, read the values its Confirm button would send, and send that one request directly.
// Built from a real browser capture (2026-10-13). It is deliberately strict: anything it does
// not recognise returns ok:false, so the caller can fall back to the browser approver.
import {randomUUID} from 'node:crypto';
import {isApprovalLink} from './household-approve.js';
import {writeTrace} from './trace.js';

const ORIGIN='https://www.netflix.com';
const PAGE='/account/update-primary-location';
const CONFIRM_MODE='mhuUpdateHouseholdConfirm';
const SUCCESS_MODE='mhuUpdateHouseholdSuccess';
const ACTION='mhuUpdateHouseholdAction';
const ROUTING='{"path":"/nq/aui/endpoint/%5E1.0.0-web/pathEvaluator","control_tag":"auinqweb"}';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const TIMEOUT=15000;

// The page embeds its state as a JS object literal that is JSON apart from \xNN escapes.
export function readPageContext(html) {
 const m=/netflix\.reactContext\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(html||'');
 if(!m) return null;
 try {return JSON.parse(m[1].replace(/\\x([0-9A-Fa-f]{2})/g,'\\u00$1'));} catch {return null;}
}

// Returns {url,headers,body} for the Confirm request, or {error} when the page is not the
// expected confirm step or a needed value is missing.
export function buildConfirmRequest(context,link) {
 const models=context?.models||{};
 const flow=models.signupContext?.data?.flow||{};
 const user=models.userInfo?.data||{};
 const locale=user.userLocale?.locale?.id||models.geo?.data?.locale?.id;
 const allocations=flow.fields?.abAllocations;
 if(flow.mode!==CONFIRM_MODE) return {error:'Page is not the confirm step (mode='+String(flow.mode).slice(0,40)+')'};
 const missing=Object.entries({flow:flow.flow,authURL:user.authURL,esn:user.esn,locale})
  .filter(([,v])=>typeof v!=='string' || !v).map(([k])=>k);
 if(!Array.isArray(allocations)) missing.push('allocations');
 if(missing.length) return {error:'Page is missing '+missing.join(', ')};
 const enc=encodeURIComponent;
 const query=[['landingURL',PAGE],['landingOrigin',ORIGIN],['inapp','false'],['languages',locale],
  ['netflixClientPlatform','browser'],['flow',flow.flow],['mode',CONFIRM_MODE],['method','call'],
  ['falcor_server','0.1.0'],['callPath','["aui","moneyball","next"]']];
 const form=[['param',JSON.stringify({action:ACTION,fields:{previousMode:''}})],
  // The page's own code sends these keyed by test id, which orders them numerically.
  ...[...allocations].sort((a,b)=>a.testId-b.testId).map(a=>['allocations['+a.testId+']',String(a.cellId)]),
  ['esn',user.esn],['authURL',user.authURL]];
 const pairs=list=>list.map(([k,v])=>enc(k)+'='+enc(v)).join('&');
 const headers={};
 for(const [k,v] of Object.entries(models.abContext?.data?.headers||{})) headers[k.toLowerCase()]=String(v);
 Object.assign(headers,{
  'content-type':'application/x-www-form-urlencoded',accept:'*/*',origin:ORIGIN,referer:link,'user-agent':UA,
  'x-netflix-ftl-bypass':'true','x-netflix.client.request.name':'ui/xhrUnclassified',
  'x-netflix.context.ui-flavor':'akira','x-netflix.esn':user.esn,
  'x-netflix.nq.stack':models.serverDefs?.data?.stack||'prod','x-netflix.request.attempt':'1',
  'x-netflix.request.client.context':'{"appstate":"foreground"}',
  'x-netflix.request.id':randomUUID().replaceAll('-',''),'x-netflix.request.routing':ROUTING
 });
 return {url:ORIGIN+'/api/aui/pathEvaluator/web/%5E2.0.0?'+pairs(query),headers,body:pairs(form)};
}

function keepCookies(jar,response) {
 for(const line of response.headers.getSetCookie?.()||[]) {
  const pair=line.split(';')[0],at=pair.indexOf('=');
  if(at>0) jar.set(pair.slice(0,at).trim(),pair.slice(at+1).trim());
 }
}
const cookieHeader=jar=>[...jar].map(([k,v])=>k+'='+v).join('; ');

// True when Netflix sends the link to the login page, as it does once a link is used.
export async function isLinkSpent(link,{fetchImpl=fetch}={}) {
 try {
  const page=await fetchImpl(link,{redirect:'manual',signal:AbortSignal.timeout(TIMEOUT),headers:{'user-agent':UA}});
  return page.status>=300 && page.status<400 && /\/login/.test(page.headers.get('location')||'');
 } catch {return false;}
}

// `sent` tells the caller whether the Confirm request left this machine.
export async function approveHouseholdHttp(link,{fetchImpl=fetch}={}) {
 if(!isApprovalLink(link)) return {ok:false,sent:false,detail:'Not an update-primary-location link'};
 const jar=new Map(),steps=[];
 let sent=false;
 try {
  const page=await fetchImpl(link,{redirect:'manual',signal:AbortSignal.timeout(TIMEOUT),headers:{
   'user-agent':UA,accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
   'accept-language':'en','upgrade-insecure-requests':'1'}});
  keepCookies(jar,page);
  steps.push({step:'page',status:page.status,headers:Object.fromEntries(page.headers),cookieNames:[...jar.keys()]});
  if(page.status!==200) return {ok:false,sent,detail:'Page returned HTTP '+page.status};
  const html=await page.text();
  steps.push({step:'html',html});
  const request=buildConfirmRequest(readPageContext(html),link);
  if(request.error) {steps.push({step:'build',error:request.error});return {ok:false,sent,detail:request.error};}
  if(jar.size) request.headers.cookie=cookieHeader(jar);
  steps.push({step:'request',url:request.url,headers:request.headers,body:request.body});
  sent=true;
  const response=await fetchImpl(request.url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(TIMEOUT),
   headers:request.headers,body:request.body});
  const text=await response.text();
  steps.push({step:'confirm',status:response.status,headers:Object.fromEntries(response.headers),
   setCookieNames:(response.headers.getSetCookie?.()||[]).map(c=>c.split('=')[0]),body:text.slice(0,200000)});
  let mode;
  try {mode=JSON.parse(text)?.jsonGraph?.aui?.moneyball?.next?.value?.result?.mode;} catch {}
  if(response.status===200 && mode===SUCCESS_MODE) return {ok:true,sent,detail:'Netflix confirmed the household update (HTTP, no browser)'};
  return {ok:false,sent,detail:'Confirm returned HTTP '+response.status+', mode='+String(mode).slice(0,60)};
 } catch(e) {
  steps.push({step:'error',message:String(e.message),cause:String(e.cause?.code||e.cause?.message||''),name:e.name});
  // `unanswered`: the Confirm request left but no reply arrived, so its outcome is unknown.
  return {ok:false,sent,unanswered:sent,detail:String(e.message).split('\n')[0].slice(0,160)};
 } finally {
  writeTrace('http',{steps});
 }
}
