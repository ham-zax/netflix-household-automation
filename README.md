# Netflix household automation

Confirms Netflix "update your Netflix household" requests automatically, so nobody has to open the email and click through when a TV says it is not part of the household.

A small Node.js service watches a Gmail inbox over IMAP. When Netflix sends the household update email, the service opens the email's confirmation link in a headless [CloakBrowser](https://www.npmjs.com/package/cloakbrowser) (a Chromium build), clicks **Confirm Update**, checks that Netflix reports success, and closes the browser again. Between emails only the idle mail listener is running; no browser stays open.

No Netflix password, login or cookie is used: the link in the email carries its own one-time token.

Not affiliated with Netflix. Use it only with your own account and in line with Netflix's terms.

## How it works

1. You (or a family member) choose **Update Netflix Household** on the TV and ask for the email.
2. Netflix emails "Important: How to update your Netflix household" with a **Yes, this was me** button.
3. The listener sees the new message, usually within seconds, and checks the sender, the subject and that the button points to `https://www.netflix.com/account/update-primary-location`.
4. A throwaway browser profile opens that link, clicks **Confirm Update** and waits for "You have updated your Netflix Household". One retry on failure.
5. The result is logged and the temporary profile is deleted.

## Requirements

- Linux with systemd (tested on Ubuntu 24.04, ARM64)
- Node.js 20.19 or newer
- A Gmail account that receives the Netflix emails, with 2-Step Verification and an [app password](https://myaccount.google.com/apppasswords)

## Install

```bash
git clone https://github.com/ham-zax/netflix-household-automation.git
cd netflix-household-automation
bash scripts/install.sh
```

The script installs the Node dependencies, downloads the CloakBrowser Chromium binary, creates `~/.config/oracle-gmail-listener/config.env` from `.env.example`, and installs the `oracle-gmail-listener` systemd user service.

Then fill in the two Gmail values and start it:

```bash
$EDITOR ~/.config/oracle-gmail-listener/config.env
systemctl --user enable --now oracle-gmail-listener.service
sudo loginctl enable-linger "$USER"   # keep it running after logout
```

If Chromium does not start, install its system libraries with `sudo npx playwright-core install-deps chromium`.

## Configuration

All settings live in `~/.config/oracle-gmail-listener/config.env` (see `.env.example`).

| Setting | Meaning |
|---|---|
| `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD` | Inbox to watch |
| `APPROVAL_MODE` | `auto` confirms every request; `review` only queues them |
| `APPROVAL_TRANSPORT` | `browser` (default) confirms in the headless browser; `http-first` sends the confirmation as a direct HTTP request and uses the browser only if that fails (confirmed on live requests: about 1 s from mail to approval, no browser) |
| `MAX_EMAIL_AGE_MINUTES` | Ignore older emails (links expire after about 15 minutes) |
| `POLL_INTERVAL_SECONDS` | Fallback check interval |
| `QUICK_CHECK_SECONDS` | `0` (default) relies on Gmail's push, which can lag by several seconds; `1`-`30` also asks Gmail for new mail that often |
| `GMAIL_MAILBOX` | `[Gmail]/All Mail` (default) also sees mail that filters archived; `INBOX` can notice new mail sooner with `QUICK_CHECK_SECONDS` if Netflix mail stays in the inbox |
| `NETFLIX_SENDER` | Rarely needs changing |

Emails that already existed when the service first started are never acted on.

## Operating it

```bash
systemctl --user status oracle-gmail-listener.service
journalctl --user -u oracle-gmail-listener.service -f   # watch approvals happen
npm run review                                          # requests still pending (review mode)
npm test
```

Each request is recorded as `pending`, `approved`, `failed` or `unconfirmed` (the HTTP request was sent, got no answer, and the link is now used up) in `~/.local/state/oracle-gmail-listener/state.json`.

## Limits

- Only the household update email is handled. Sign-in codes and temporary access codes must be typed on the device itself, so a server cannot complete them.
- Every approval moves the household to the requesting location, so devices elsewhere may be asked to update next.
- Netflix can change its emails or pages at any time; a failed approval shows up in the log with the page text it saw.

## Optional German VPN

The optional WireGuard service routes selected TVs through this server. It has
separate on/off controls and does not stop the Gmail listener. See
[VPN setup and router instructions](docs/vpn.md). VPN routing does not guarantee
Netflix household acceptance.

## Privacy

The config file holds your Gmail app password and the state file holds approval links; both are created with mode 600, live outside the repository, and must not be committed. Log lines never include links or tokens.
