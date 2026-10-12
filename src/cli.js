import {readState,saveState} from './state.js';
import {isTrustedNetflixLink} from './parse.js';

const command=process.argv[2] || 'pending';
const state=readState();
if(command==='pending') {
  const pending=state.pending.filter(p=>p.status==='pending');
  if(!pending.length) console.log('No pending household-change requests.');
  for(const p of pending) {
    console.log(`${p.id} | ${p.foundAt} | ${p.requester} | ${p.subject}`);
  }
} else if(command==='inspect') {
  const p=state.pending.find(x=>x.id===process.argv[3]);
  if(!p) {console.error('Unknown request ID');process.exitCode=1;}
  else console.log(JSON.stringify({id:p.id,status:p.status,subject:p.subject,requester:p.requester,foundAt:p.foundAt,receivedAt:p.receivedAt,from:p.from,linkHost:new URL(p.link).hostname},null,2));
} else if(command==='show-link') {
  const p=state.pending.find(x=>x.id===process.argv[3]);
  if(!p || !isTrustedNetflixLink(p.link)) {console.error('Unknown request ID or untrusted URL');process.exitCode=1;}
  else if(process.argv[4]!=='--understand-household-change') {
    console.error('This is a Netflix HOUSEHOLD CHANGE link, not a temporary access code. To reveal its URL, run: npm run review -- show-link <id> --understand-household-change');
    process.exitCode=1;
  } else {
    // The URL contains a sensitive approval token. Do not paste it into public logs or chats.
    console.log(p.link);
  }
} else if(command==='dismiss') {
  const p=state.pending.find(x=>x.id===process.argv[3]);
  if(!p){console.error('Unknown request ID');process.exitCode=1;}
  else {p.status='dismissed';saveState(state);console.log('Dismissed '+p.id);}
} else {
  console.error('Commands: pending | inspect <id> | show-link <id> --understand-household-change | dismiss <id>');
  process.exitCode=1;
}
