import fs from 'node:fs';
import path from 'node:path';
import {STATE_DIR} from './config.js';

export const STATE_PATH = path.join(STATE_DIR,'state.json');
function ensureDir() { fs.mkdirSync(STATE_DIR,{recursive:true,mode:0o700}); fs.chmodSync(STATE_DIR,0o700); }
export function readState() {
  ensureDir();
  try {
    const state=JSON.parse(fs.readFileSync(STATE_PATH,'utf8'));
    if (state && typeof state === 'object' && Array.isArray(state.pending)) return state;
  } catch (err) { if (err.code !== 'ENOENT') throw err; }
  return {uidValidity:null,lastUid:null,pending:[]};
}
export function saveState(state) {
  ensureDir();
  const tmp=path.join(STATE_DIR,`.state-${process.pid}.tmp`);
  try {
    fs.writeFileSync(tmp,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'w'});
    fs.renameSync(tmp,STATE_PATH);
    fs.chmodSync(STATE_PATH,0o600);
  } finally { try {fs.unlinkSync(tmp);}catch{} }
}
export function addRequest(state,request) {
  if(state.pending.some(p=>p.id===request.id)) return false;
  state.pending.push({...request, status:'pending',foundAt:new Date().toISOString()});
  state.pending=state.pending.slice(-100);
  return true;
}
