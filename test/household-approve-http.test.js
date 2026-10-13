import test from 'node:test';
import assert from 'node:assert/strict';
import {approveHouseholdHttp,buildConfirmRequest,isLinkSpent,readPageContext} from '../src/household-approve-http.js';

// Invented values in the shape of Netflix's page; nothing here comes from a real account.
const link='https://www.netflix.com/account/update-primary-location?nftoken=fake';
const context=(over={})=>({models:{
 signupContext:{data:{flow:{mode:'mhuUpdateHouseholdConfirm',flow:'memberSimplicity',
  fields:{abAllocations:[{testId:202,cellId:1},{testId:101,cellId:2}]},...over.flow}}},
 userInfo:{data:{authURL:'c1.123.abc/de+f==',esn:'TEST-ESN-1',userLocale:{locale:{id:'en-IN'}},...over.user}},
 abContext:{data:{headers:{'X-Netflix.uiVersion':'vtest','X-Netflix.browserVersion':146}}},
 serverDefs:{data:{stack:'prod'}}
}});
// Netflix escapes "/" and "+" as \xNN inside the inline script.
const page=ctx=>'<html><script>window.netflix = window.netflix || {}; netflix.reactContext = '+
 JSON.stringify(ctx).replaceAll('/','\\x2F').replaceAll('+','\\x2B')+';</script></html>';
const reply=mode=>JSON.stringify({jsonGraph:{aui:{moneyball:{next:{value:{result:{mode}}}}}}});
function fakeFetch(responses) {
 const calls=[];
 const fetchImpl=async(url,init)=>{calls.push({url,init});return responses[calls.length-1];};
 return {calls,fetchImpl};
}
const html=(body,headers)=>new Response(body,{status:200,headers});

test('reads the page context including escaped characters',()=>{
 const ctx=readPageContext(page(context()));
 assert.equal(ctx.models.userInfo.data.authURL,'c1.123.abc/de+f==');
 assert.equal(readPageContext('<html>no context</html>'),null);
});
test('builds the confirm request from the page values',()=>{
 const req=buildConfirmRequest(context(),link);
 assert.equal(req.url,'https://www.netflix.com/api/aui/pathEvaluator/web/%5E2.0.0?landingURL=%2Faccount%2Fupdate-primary-location'+
  '&landingOrigin=https%3A%2F%2Fwww.netflix.com&inapp=false&languages=en-IN&netflixClientPlatform=browser&flow=memberSimplicity'+
  '&mode=mhuUpdateHouseholdConfirm&method=call&falcor_server=0.1.0&callPath=%5B%22aui%22%2C%22moneyball%22%2C%22next%22%5D');
 assert.equal(req.body,'param=%7B%22action%22%3A%22mhuUpdateHouseholdAction%22%2C%22fields%22%3A%7B%22previousMode%22%3A%22%22%7D%7D'+
  '&allocations%5B101%5D=2&allocations%5B202%5D=1&esn=TEST-ESN-1&authURL=c1.123.abc%2Fde%2Bf%3D%3D');
 assert.equal(req.headers['x-netflix.uiversion'],'vtest');
 assert.equal(req.headers['x-netflix.browserversion'],'146');
 assert.equal(req.headers.referer,link);
});
test('refuses to build when the page is not the confirm step or lacks a value',()=>{
 assert.match(buildConfirmRequest(context({flow:{mode:'login'}}),link).error,/not the confirm step/);
 assert.match(buildConfirmRequest(context({user:{authURL:''}}),link).error,/missing authURL/);
 assert.match(buildConfirmRequest(null,link).error,/not the confirm step/);
});
test('approves when Netflix answers with the success mode and sends the page cookies back',async()=>{
 const headers=new Headers({'content-type':'text/html'});
 headers.append('set-cookie','NetflixId=abc; Path=/; HttpOnly');
 headers.append('set-cookie','nfvdid=xyz; Path=/');
 const {calls,fetchImpl}=fakeFetch([html(page(context()),headers),html(reply('mhuUpdateHouseholdSuccess'))]);
 const out=await approveHouseholdHttp(link,{fetchImpl});
 assert.deepEqual({ok:out.ok,sent:out.sent},{ok:true,sent:true});
 assert.equal(calls.length,2);
 assert.equal(calls[0].url,link);
 assert.equal(calls[1].init.method,'POST');
 assert.equal(calls[1].init.headers.cookie,'NetflixId=abc; nfvdid=xyz');
});
test('does not send the confirm request when the link redirects to login',async()=>{
 const {calls,fetchImpl}=fakeFetch([new Response(null,{status:302,headers:{location:'/login'}})]);
 const out=await approveHouseholdHttp(link,{fetchImpl});
 assert.deepEqual({ok:out.ok,sent:out.sent},{ok:false,sent:false});
 assert.equal(calls.length,1);
});
test('does not send the confirm request when the page lacks the needed values',async()=>{
 const {calls,fetchImpl}=fakeFetch([html('<html>Sign in</html>')]);
 const out=await approveHouseholdHttp(link,{fetchImpl});
 assert.deepEqual({ok:out.ok,sent:out.sent},{ok:false,sent:false});
 assert.equal(calls.length,1);
});
test('reports failure, without retrying, when Netflix does not confirm',async()=>{
 for(const second of [html(reply('mhuUpdateHouseholdConfirm')),html('not json'),new Response('',{status:403})]) {
  const {calls,fetchImpl}=fakeFetch([html(page(context())),second]);
  const out=await approveHouseholdHttp(link,{fetchImpl});
  assert.deepEqual({ok:out.ok,sent:out.sent},{ok:false,sent:true});
  assert.equal(calls.length,2);
 }
});
test('rejects links that are not the household page and network errors',async()=>{
 const {calls,fetchImpl}=fakeFetch([]);
 assert.equal((await approveHouseholdHttp('https://www.netflix.com/password',{fetchImpl})).ok,false);
 assert.equal(calls.length,0);
 const out=await approveHouseholdHttp(link,{fetchImpl:async()=>{throw new Error('connect timeout');}});
 assert.deepEqual(out,{ok:false,sent:false,unanswered:false,detail:'connect timeout'});
});
test('marks the outcome unanswered when the confirm request gets no reply',async()=>{
 let n=0;
 const fetchImpl=async()=>{if(n++) throw new Error('socket hang up');return html(page(context()));};
 assert.deepEqual(await approveHouseholdHttp(link,{fetchImpl}),{ok:false,sent:true,unanswered:true,detail:'socket hang up'});
});
test('recognises a used-up link only by its redirect to login',async()=>{
 const answer=r=>isLinkSpent(link,{fetchImpl:async()=>r});
 assert.equal(await answer(new Response(null,{status:302,headers:{location:'/login?nextpage=x'}})),true);
 assert.equal(await answer(html(page(context()))),false);
 assert.equal(await answer(new Response(null,{status:302,headers:{location:'/in/'}})),false);
 assert.equal(await isLinkSpent(link,{fetchImpl:async()=>{throw new Error('down');}}),false);
});
