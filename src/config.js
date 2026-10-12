import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { config as dotenvConfig } from 'dotenv';

const home = os.homedir();
export const CONFIG_PATH = process.env.LISTENER_CONFIG_PATH ||
  path.join(home, '.config', 'oracle-gmail-listener', 'config.env');
export const STATE_DIR = process.env.LISTENER_STATE_DIR ||
  path.join(home, '.local', 'state', 'oracle-gmail-listener');

export function loadConfig({requireCredentials = true} = {}) {
  if (fs.existsSync(CONFIG_PATH)) dotenvConfig({path:CONFIG_PATH, quiet:true});
  const cfg = {
    email: process.env.GMAIL_ADDRESS?.trim() || '',
    password: process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g,'') || '',
    sender: (process.env.NETFLIX_SENDER || 'info@account.netflix.com').toLowerCase().trim(),
    mailbox: process.env.GMAIL_MAILBOX || '[Gmail]/All Mail',
    maxAgeMinutes: Number(process.env.MAX_EMAIL_AGE_MINUTES || 15),
    pollSeconds: Number(process.env.POLL_INTERVAL_SECONDS || 60),
    approvalMode: process.env.APPROVAL_MODE || 'review'
  };
  if (requireCredentials && (!cfg.email || !cfg.password ||
    cfg.password === 'replace-with-new-app-password')) {
    throw new Error('Missing Gmail address/app password: set them in '+ CONFIG_PATH);
  }
  if (!['review','auto'].includes(cfg.approvalMode)) throw new Error('APPROVAL_MODE must be review or auto.');
  if (!(cfg.maxAgeMinutes > 0 && cfg.maxAgeMinutes <= 60)) throw new Error('Invalid MAX_EMAIL_AGE_MINUTES');
  if (!(cfg.pollSeconds >= 30 && cfg.pollSeconds <= 3600)) throw new Error('Invalid POLL_INTERVAL_SECONDS');
  return cfg;
}
