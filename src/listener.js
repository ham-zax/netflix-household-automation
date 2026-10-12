import {ImapFlow} from 'imapflow';
import {simpleParser} from 'mailparser';
import {loadConfig} from './config.js';
import {readState, saveState, addRequest} from './state.js';
import {extractHouseholdRequest} from './parse.js';
import {approveHousehold} from './household-approve.js';

const config = loadConfig();
let stop=false;
let activeClient=null;
const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));

function log(message) { console.log(new Date().toISOString(),message); }

// Returns the requests queued by this pass.
async function synchronize(client) {
  const added=[];
  const lock=await client.getMailboxLock(config.mailbox);
  try {
    const state=readState();
    const validity=String(client.mailbox.uidValidity);
    if(state.mailbox !== config.mailbox || state.uidValidity !== validity || state.lastUid === null) {
      state.mailbox=config.mailbox;
      state.uidValidity=validity;
      state.lastUid=Math.max(0,Number(client.mailbox.uidNext)-1);
      saveState(state);
      log('Initialized mailbox UID cursor for '+config.mailbox+'. Existing emails were not acted on.');
      return added;
    }
    const start=state.lastUid+1;
    // The cached mailbox.uidNext goes stale on a long-lived connection, so ask the server
    // with start:*. That range returns the newest message when nothing is new; the uid
    // check below drops it.
    for await (const message of client.fetch(`${start}:*`,{source:true,internalDate:true},{uid:true})) {
      if(!message.uid || message.uid<=state.lastUid) continue;
      try {
        const ageMs=Date.now()-(message.internalDate?.getTime() || Date.now());
        if(ageMs >= 0 && ageMs <= config.maxAgeMinutes*60_000) {
          const parsed=await simpleParser(message.source);
          const request=extractHouseholdRequest(parsed,{sender:config.sender});
          if(request && addRequest(state,request)) {
            added.push(request.id);
            log(`Netflix household request id=${request.id}; requester=${JSON.stringify(request.requester)}.`);
          }
        }
      } catch(err) {
        // Stop rather than skip an unparsed message, to allow safe retry after troubleshooting.
        log('Could not parse message UID '+message.uid+': '+err.message);
        throw err;
      }
      state.lastUid=message.uid;
      saveState(state);
    }
  } finally {lock.release();}
  return added;
}

// Runs outside the mailbox lock: a browser run takes several seconds.
async function autoApprove(ids) {
  for(const id of ids) {
    const state=readState();
    const request=state.pending.find(p=>p.id===id);
    if(!request || request.status!=='pending') continue;
    let result=await approveHousehold(request.link);
    if(!result.ok) {log(`Approval attempt failed for id=${id}: ${result.detail}. Retrying once.`);result=await approveHousehold(request.link);}
    const fresh=readState();
    const entry=fresh.pending.find(p=>p.id===id);
    if(entry) {
      entry.status=result.ok?'approved':'failed';
      entry.detail=result.detail;
      if(result.ok) entry.approvedAt=new Date().toISOString();
      saveState(fresh);
    }
    log(`Household request id=${id} ${result.ok?'APPROVED':'FAILED'}: ${result.detail}`);
  }
}

async function runConnection(){
  const client=new ImapFlow({
    host:'imap.gmail.com',port:993,secure:true,
    auth:{user:config.email,pass:config.password},
    logger:false,emitLogs:false,
    maxIdleTime:300000,
    socketTimeout:10*60*1000
  });
  activeClient=client;
  let queued=false;
  let syncing=false;
  async function drain(){
    queued=true;
    if(syncing) return;
    syncing=true;
    try {
      while(queued && !stop && client.usable) {
        queued=false;
        const added=await synchronize(client);
        if(config.approvalMode==='auto') await autoApprove(added);
      }
    } finally { syncing=false; }
  }
  const onExists=()=>{void drain().catch(e=>{log('Sync failed: '+e.message);void client.close();});};
  client.on('error',err=>log('IMAP error: '+err.message));
  try {
    await client.connect();
    await client.mailboxOpen(config.mailbox);
    client.on('exists',onExists);
    log('Connected to Gmail mailbox '+config.mailbox+' on '+config.email);
    await drain();
    while(!stop && client.usable) {
      await wait(config.pollSeconds*1000);
      if(!stop && client.usable) await drain();
    }
  } finally {
    client.off('exists',onExists);
    await client.logout().catch(()=>{});
    activeClient=null;
  }
}
process.on('SIGTERM',()=>{stop=true; void activeClient?.close().catch(()=>{});});
process.on('SIGINT',()=>{stop=true; void activeClient?.close().catch(()=>{});});
log(config.approvalMode==='auto'
  ? 'Starting Gmail listener; AUTO mode: household update requests are approved automatically.'
  : 'Starting Gmail listener; review-only mode; no household changes can be automatically approved.');
let delay=5000;
while(!stop) {
  try {await runConnection();delay=5000;}
  catch(e){log('Disconnected or failed: '+e.message);}
  if(!stop){await wait(delay);delay=Math.min(delay*2,60000);}
}
log('Listener stopped.');
