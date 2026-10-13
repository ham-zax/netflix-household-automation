import test from 'node:test';
import assert from 'node:assert/strict';
import {approveWithFallback,UNCONFIRMED} from '../src/approve-flow.js';

const link='https://www.netflix.com/account/update-primary-location?nftoken=fake';
function run({httpFirst=true,http,browser,spent=false}) {
 const calls={http:0,browser:0,spent:0,logs:[]};
 const queue=[...browser];
 return approveWithFallback(link,{id:'t1',httpFirst,
  http:async()=>{calls.http++;return http;},
  browser:async()=>{calls.browser++;return queue.shift();},
  isSpent:async()=>{calls.spent++;return spent;},
  log:m=>calls.logs.push(m)}).then(out=>({out,calls}));
}
const fail={ok:false,detail:'no button'},pass={ok:true,detail:'done'};

test('HTTP success needs no browser',async()=>{
 const {out,calls}=await run({http:{ok:true,sent:true,detail:'http done'},browser:[]});
 assert.deepEqual(out,{status:'approved',detail:'http done'});
 assert.equal(calls.browser,0);
});
test('browser transport never calls HTTP',async()=>{
 const {out,calls}=await run({httpFirst:false,http:pass,browser:[pass]});
 assert.equal(out.status,'approved');
 assert.equal(calls.http,0);
});
test('a refused HTTP attempt falls back to the browser with one retry',async()=>{
 const {out,calls}=await run({http:{ok:false,sent:true,detail:'HTTP 403'},browser:[fail,pass],spent:true});
 assert.equal(out.status,'approved');
 assert.deepEqual([calls.browser,calls.spent],[2,0]);
});
test('unanswered HTTP plus a used-up link is recorded as unconfirmed without a second browser run',async()=>{
 const {out,calls}=await run({http:{ok:false,sent:true,unanswered:true,detail:'timeout'},browser:[fail],spent:true});
 assert.deepEqual(out,{status:'unconfirmed',detail:UNCONFIRMED});
 assert.equal(calls.browser,1);
});
test('unanswered HTTP with a still-valid link keeps the browser retry',async()=>{
 const {out,calls}=await run({http:{ok:false,sent:true,unanswered:true,detail:'timeout'},browser:[fail,fail]});
 assert.deepEqual(out,{status:'failed',detail:'no button'});
 assert.equal(calls.browser,2);
});
test('unanswered HTTP still counts as approved when the browser succeeds',async()=>{
 const {out,calls}=await run({http:{ok:false,sent:true,unanswered:true,detail:'timeout'},browser:[pass]});
 assert.equal(out.status,'approved');
 assert.equal(calls.spent,0);
});
