# Karuta Top.gg Auto-Voter

A Chrome / Edge / Brave extension that opens the Karuta vote page every 12 hours
and clicks the **Vote** button for you. You still solve the hCaptcha — top.gg
won't accept a vote without it.

## Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and pick the `karuta-vote-extension` folder.
4. Make sure you're already logged into Discord in the same browser.

The extension will:

- Open `https://top.gg/bot/646937666251915264/vote` immediately on first install.
- Auto-click the Vote button when the page loads.
- Wait for you to solve the captcha.
- Detect the success message and schedule the next attempt 12 hours later.
- Retry every hour if a previous attempt didn't complete (e.g., you closed the
  tab without finishing the captcha).

Click the toolbar icon any time to see status or trigger a manual attempt.

<img width="267" height="160" alt="karuta-auto-vote-extension-img" src="https://github.com/user-attachments/assets/7831c6f6-bcc1-4257-9894-95eeb3387d3b" />

## Cons

- **Captcha is unavoidable.** Top.gg uses hCaptcha specifically to block
  automation. This is a reminder + helper, not unattended voting.
- **Top.gg ToS** prohibits automated voting. Use at your own risk; in practice
  this is more like an "open and click" reminder than a vote bot.
- **Selectors may break** if top.gg redesigns the vote page. The content
  script matches by visible button text (`"Vote"`, `"Vote now"`, etc.) which is
  reasonably resilient, but not bulletproof. If it stops working, edit
  `findVoteButton` in `content.js`.
- **Service worker idling** is fine — `chrome.alarms` persists across SW
  shutdowns. The 12-hour timer is reliable as long as the browser runs at least
  briefly around the firing time.

## Files

- `manifest.json` — MV3 manifest, permissions, content-script match.
- `background.js` — Alarm scheduler, vote-tab opener, message router.
- `content.js` — Runs on the vote page; clicks the button, watches for success.
- `popup.html` / `popup.js` — Status popup with a "Vote now" button.
