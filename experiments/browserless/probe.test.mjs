import test from 'node:test';
import assert from 'node:assert/strict';
import {probeApprovedLink,validateHouseholdLink,ProbeError} from './http-probe.mjs';
const link='https://www.netflix.com/account/update-primary-location?nftoken=fake-test-token';
const response=(body='',status=200,headers={})=>new Response(body,{status,headers});
test('rejects off-domain or wrong path before network request',async()=>{
 for(const url of [
   'https://netflix.com.evil.test/account/update-primary-location?nftoken=abc',
   'https://www.netflix.com/account/update-primary-location',
   'http://www.netflix.com/account/update-primary-location?nftoken=abc',
   'https://www.netflix.com/login?nftoken=abc'
 ])assert.throws(()=>validateHouseholdLink(url),ProbeError);
});
test('HTTP probe only issues a GET, never mutates account',async()=>{
 const actions=[];
 const mock=async(_url,opts)=>{
   actions.push({method:opts.method,redirect:opts.redirect});
   return response('<html><body><button data-uia="set-primary-location-action">Confirm Update</button></body></html>',200,{'content-type':'text/html'});
 };
 const result=await probeApprovedLink(link,{transport:mock});
 assert.deepEqual(actions,[{method:'GET',redirect:'manual'}]);
 assert.equal(result.result,'CONFIRM_PAGE');
 assert.equal(result.hops[0].hasConfirmButton,true);
});
test('expired/used token redirects to sign in',async()=>{
 const result=await probeApprovedLink(link,{transport:async()=>response('',302,{location:'/login'})});
 assert.equal(result.result,'LOGIN_REDIRECT');
});
test('rejects cross-origin redirect without following',async()=>{
 let calls=0;
 await assert.rejects(()=>probeApprovedLink(link,{transport:async()=>{
  calls++;return response('',302,{location:'https://example.org/steal'});
 }}),e=>e.code==='UNTRUSTED_REDIRECT');
 assert.equal(calls,1);
});
test('recognizes non-html and cannot falsely assert success',async()=>{
 const result=await probeApprovedLink(link,{transport:async()=>response('{}',200,{'content-type':'application/json'})});
 assert.equal(result.result,'NON_CONFIRM_PAGE');
});
