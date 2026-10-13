// Decides how one household link gets approved: an optional direct HTTP attempt, then the
// browser. Kept apart from the listener so the fallback rules can be tested.
export const UNCONFIRMED='Confirm request was sent but not answered, and the link is now used up; probably approved';

// Returns {status:'approved'|'failed'|'unconfirmed',detail}.
export async function approveWithFallback(link,{id,httpFirst,http,browser,isSpent,log}) {
 let unanswered=false;
 if(httpFirst) {
  const result=await http(link);
  if(result.ok) return {status:'approved',detail:result.detail};
  unanswered=Boolean(result.unanswered);
  log(`HTTP approval failed for id=${id}: ${result.detail}. Falling back to the browser.`);
 }
 let result=await browser(link);
 // The HTTP request may have reached Netflix. A used-up link then means it most likely worked,
 // and another browser run could not change the outcome.
 if(!result.ok && unanswered && await isSpent(link)) return {status:'unconfirmed',detail:UNCONFIRMED};
 if(!result.ok) {log(`Approval attempt failed for id=${id}: ${result.detail}. Retrying once.`);result=await browser(link);}
 return {status:result.ok?'approved':'failed',detail:result.detail};
}
