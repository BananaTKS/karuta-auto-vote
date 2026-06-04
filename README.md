# Karuta Top.gg Auto-Voter

A Chrome / Edge / Brave extension that drives the Karuta vote flow off the
**real cooldown reported by top.gg itself**. Every 10 minutes it opens the
vote page in a hidden background tab, reads the cooldown text, sends it back,
and closes the tab — so the timer survives voting on a phone or another
browser. When the cooldown is up, it opens the vote page for you to solve
the captcha and vote.

## How it works

1. A 10-minute alarm fires.
2. The extension opens `https://top.gg/bot/646937666251915264/vote#check` as a
   hidden background tab (`active: false`, no focus).
3. The content script sees `#check` in the URL, reads phrases like
   _"vote again in 11h 23m"_ off the rendered page, and reports the cooldown
   back to the service worker.
4. The service worker reschedules the next vote alarm to match, then closes
   the hidden tab.
5. When the cooldown alarm fires (cooldown == 0), the extension opens the
   vote page for real (active tab) so you can complete the captcha. Top.gg's
   hCaptcha is unavoidable — this is a reminder + helper, not unattended
   voting.

## Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`, `opera://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and pick the `karuta-auto-vote` folder.
4. Make sure you're logged into top.gg in the same browser so the cooldown
   reads against your account.

Click the toolbar icon any time to see status, force a check, or trigger a
manual vote attempt.

<img width="288" height="244" alt="extension" src="https://github.com/user-attachments/assets/fd83f239-26ff-48a1-949c-915fb00a3790" />

## Cons

- **Captcha is unavoidable.** Top.gg uses hCaptcha specifically to block
  automation. The cooldown check only reads text — it doesn't click anything.
- **Top.gg ToS** prohibits automated voting. The cooldown check is just an
  unattended page read; the actual vote is still you, clicking through and
  solving the captcha. Use at your own risk.
- **Selectors / phrases may break.** `readCooldownMs` in `content.js` matches
  phrases like _"vote again in"_ / _"next vote in"_ and parses an `Xh Ym`
  pattern out of them. If top.gg changes the wording, update the regexes.

## Files

- `manifest.json` — MV3 manifest, permissions, content-script match.
- `background.js` — Alarm scheduler, vote-tab opener, hidden-check-tab manager,
  message router. Owns the 10-min cooldown alarm and the vote alarm.
- `content.js` — Runs on the top.gg vote page. In `#check` mode it reads the
  cooldown and exits silently; otherwise it clicks Vote and watches for
  success.
- `popup.html` / `popup.js` — Status popup with **Vote now**, **Check cooldown
  now**, and last-checked / next-attempt timestamps.
