// Read-only CLI. Use existing approved token by default; never outputs URL or token.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {probeApprovedLink} from './http-probe.mjs';
const args=process.argv.slice(2);
let link;
if(args.length===1 && args[0]==='--latest-approved'){
 const state=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local','state','oracle-gmail-listener','state.json'),'utf8'));
 link=state.pending?.filter(x=>x.status==='approved').at(-1)?.link;
}else if(args.length===2 && args[0]==='--url-file'){
 const s=fs.statSync(args[1]);
 if(s.mode & 0o077)throw Error('The URL file must have owner-only permissions.');
 link=fs.readFileSync(args[1],'utf8').trim();
}else {console.error('Usage: node experiments/browserless/probe.mjs --latest-approved | --url-file PRIVATE_PATH'); process.exit(1);}
if(!link) throw Error('No link available');
try {
 const result=await probeApprovedLink(link);
 console.log(JSON.stringify(result,null,2));
} catch(error) {
 console.error('Probe failed:',error.code||error.name);
 process.exitCode=2;
}
