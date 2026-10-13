// Unattended approval of a Netflix "update household" email link.
// Verified 2026-10-12: the link works signed out and from the server's own IP, so each run
// uses a throwaway profile and a direct connection. No Netflix login or cookies are involved.
import fs from 'node:fs';
import path from 'node:path';
import {launchPersistentContext} from 'cloakbrowser';
import {STATE_DIR} from './config.js';
import {isTrustedNetflixLink} from './parse.js';
import {startTrace} from './trace.js';

const CONFIRM='[data-uia="set-primary-location-action"]';
const DONE=/you(?: have|'ve) updated your netflix household/i;
export function isApprovalLink(value) {
 return isTrustedNetflixLink(value) && new URL(value).pathname==='/account/update-primary-location';
}
export async function approveHousehold(link) {
 if(!isApprovalLink(link)) return {ok:false,detail:'Not an update-primary-location link'};
 fs.mkdirSync(STATE_DIR,{recursive:true,mode:0o700});
 const profile=fs.mkdtempSync(path.join(STATE_DIR,'approve-'));
 let context,trace;
 try {
  context=await launchPersistentContext({userDataDir:profile,headless:true});
  const page=context.pages()[0]||await context.newPage();
  trace=startTrace(page);
  await page.goto(link,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator(CONFIRM).first().click({timeout:20000});
  await page.getByText(DONE).first().waitFor({timeout:20000});
  return {ok:true,detail:'Netflix confirmed the household update'};
 } catch(e) {
  let seen='';
  try {seen=(await context?.pages()[0]?.innerText('body',{timeout:2000})||'').replace(/\s+/g,' ').trim().slice(0,160);} catch {}
  return {ok:false,detail:String(e.message).split('\n')[0].slice(0,160)+(seen?' | page: '+seen:'')};
 } finally {
  if(context) await trace?.save(context);
  await context?.close().catch(()=>{});
  fs.rmSync(profile,{recursive:true,force:true});
 }
}
