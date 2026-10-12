import test from 'node:test';
import assert from 'node:assert/strict';
import {extractHouseholdRequest,isTrustedNetflixLink} from '../src/parse.js';
import {simpleParser} from 'mailparser';

const base='https://www.netflix.com/household/confirm?token=test';
const email=(from,html,subject='Did you request to update your Netflix household?')=>
  ['From: '+from,'To: test@example.com','Subject: '+subject,'MIME-Version: 1.0',
   'Content-Type: text/html; charset=utf-8','Message-ID: <example@netflix.com>','','<html><body>'+html+'</body></html>'].join('\r\n');

test('accepts exact Netflix sender and explicit household button',async()=>{
 const parsed=await simpleParser(email('Netflix <info@account.netflix.com>',`<p>Requested by Alex from a Samsung - Smart TV on 12 October 5:41 pm IST</p><a href="${base}">Yes, this was me</a>`));
 const out=extractHouseholdRequest(parsed);
 assert.ok(out);
 assert.equal(out.link,base);
 assert.match(out.requester,/Alex/);
});
test('rejects impersonated sender',async()=>{
 const parsed=await simpleParser(email('Netflix <info@account.netflix.com.evil.test>',`<a href="${base}">Yes, this was me</a>`));
 assert.equal(extractHouseholdRequest(parsed),null);
});
test('rejects phishing link and non-HTTPS URL',async()=>{
 const parsed=await simpleParser(email('Netflix <info@account.netflix.com>',`<a href="https://netflix.com.evil.test/x">Yes, this was me</a>`));
 assert.equal(extractHouseholdRequest(parsed),null);
 assert.equal(isTrustedNetflixLink('javascript:alert(1)'),false);
 assert.equal(isTrustedNetflixLink('http://netflix.com/abc'),false);
 assert.equal(isTrustedNetflixLink('https://netflix.com.evil.test/abc'),false);
 assert.equal(isTrustedNetflixLink(base),true);
});
test('rejects ambiguous buttons',async()=>{
 const parsed=await simpleParser(email('Netflix <info@account.netflix.com>',`<a href="${base}">Yes, this was me</a><a href="https://netflix.com/other">Yes, this was me</a>`));
 assert.equal(extractHouseholdRequest(parsed),null);
});
test('ignores other Netflix emails',async()=>{
 const parsed=await simpleParser(email('Netflix <info@account.netflix.com>',`<a href="${base}">Yes, this was me</a>`,'Your Netflix receipt'));
 assert.equal(extractHouseholdRequest(parsed),null);
});
test('auto-approval only accepts the update-primary-location path',async()=>{
 const {isApprovalLink}=await import('../src/household-approve.js');
 assert.equal(isApprovalLink('https://www.netflix.com/account/update-primary-location?nftoken=x'),true);
 assert.equal(isApprovalLink('https://www.netflix.com/password'),false);
 assert.equal(isApprovalLink('https://netflix.com.evil.test/account/update-primary-location'),false);
});
