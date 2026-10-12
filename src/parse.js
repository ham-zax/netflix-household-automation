import {createHash} from 'node:crypto';
import {load as loadHtml} from 'cheerio';

const householdSubject = /(?:update|change|confirm|verify).*netflix household|netflix household.*(?:update|change|confirm|verify)/i;
const buttonText = /yes,?\s*this\s*was\s*me/i;
const netflixHost = /(?:^|\.)netflix\.com$/i;
export function isTrustedNetflixLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && netflixHost.test(url.hostname) &&
       !url.username && !url.password && !url.port;
  } catch { return false; }
}
export function parseFrom(parsed) {
  return parsed.from?.value?.map(v=>v.address?.toLowerCase()).filter(Boolean) || [];
}
export function extractHouseholdRequest(parsed, options={}) {
  const expectedSender = (options.sender || 'info@account.netflix.com').toLowerCase();
  const senders = parseFrom(parsed);
  if (senders.length !== 1 || senders[0] !== expectedSender) return null;
  const subject = parsed.subject || '';
  if (!householdSubject.test(subject)) return null;
  const html = typeof parsed.html === 'string' ? parsed.html : '';
  const $ = loadHtml(html);
  const matches = [];
  $('a[href]').each((_,el)=>{
    const label = $(el).text().replace(/\s+/g,' ').trim();
    const href = $(el).attr('href')?.trim();
    if (buttonText.test(label) && href && isTrustedNetflixLink(href)) matches.push(href);
  });
  // Forwarded templates occasionally display the link text outside anchor tags.
  // Do not guess links or auto-follow shortened/tracking URLs.
  const unique = [...new Set(matches)];
  if (unique.length !== 1) return null;
  const fullText = $.text().replace(/\s+/g,' ').trim() || parsed.text || '';
  const requested = fullText.match(/Requested by\s+(.{1,140}?)\s+on\s+\d{1,2}\s+\w+\s+\d{1,2}[:.]\d{2}/i);
  const when = parsed.date && Number.isFinite(+parsed.date) ? parsed.date : null;
  const idSeed = parsed.messageId || `${subject}:${when?.toISOString() || ''}:${unique[0]}`;
  return {
    id:createHash('sha256').update(idSeed).digest('hex').slice(0,16),
    subject,
    from: expectedSender,
    receivedAt: when ? when.toISOString() : null,
    requester: requested?.[1]?.trim() || 'Not identified',
    link: unique[0]
  };
}
