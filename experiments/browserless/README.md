# Browserless Netflix Household HTTP experiment

**Not production-ready; not wired into systemd, the listener, package.json, or the canonical browser approver.**

The established pipeline in `src/listener.js` remains unchanged. It scans new messages in Gmail All Mail, checks the exact sender, a subject regex, the exact approval button text and trusted Netflix confirmation URL, then launches a disposable CloakBrowser to perform the actual approval when `APPROVAL_MODE=auto`.

## Findings (2026-10-13)

1. The already-approved email links stored in the private listener state now redirect `302` to Netflix login when opened by Node's HTTP client. They are not reusable evidence of the first-approval request.
2. The same consumed token, opened in a fresh CloakBrowser instance, also lands on login with no confirmation button.
3. Netflix's public login JavaScript bundle includes routes for `/account/update-primary-location`, `/account/set-primary-location`, and GraphQL operations, but **the actual confirmation HTTP operation and its required variables/headers have not been identified or verified**.
4. A browserless replacement is feasible in principle only if the confirmation button triggers a reproducible HTTP operation and the email token can supply all required authorization/context. No claim of completion is warranted without a fresh-link capture and a successful independent HTTP-only confirmation.

## Commands

```sh
# Unit-test the HTTP GET-only probe (safe, no household changes).
node --test experiments/browserless/probe.test.mjs

# Inspect the redirect result of an already-approved link (never outputs token).
node experiments/browserless/probe.mjs --latest-approved

# Capture the redirect/network trace of a consumed link in a disposable CloakBrowser.
# IMPORTANT: This last command requires a browser and is only a *diagnostic*
# for developing the future browserless version.
node experiments/browserless/trace-once.mjs --latest-approved
```

For an authorized, fresh, single-use token, capture the flow **outside** the live listener by writing the URL into a private `chmod 600` file and using `trace-once.mjs --url-file PRIVATE_PATH`. The optional `--confirm` switch actually performs the household change and must only be used when that change is desired. Already-approved tokens cannot be replayed for this purpose, and the production listener may consume a newly received email before the manual capture.

The trace contains sensitive links, response bodies, and headers. It is saved with permissions 0600 under `~/.local/state/oracle-gmail-listener/traces/` and must not be sent to third parties or committed. Only safe summaries are printed.

Do not rewrite `src/household-approve.js` or alter `APPROVAL_MODE` unless a browserless implementation has been independently validated and its effects reviewed.
