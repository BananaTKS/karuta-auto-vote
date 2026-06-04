const VOTE_URL = "https://top.gg/bot/646937666251915264/vote";
const CHECK_URL = `${VOTE_URL}#check`;

const VOTE_INTERVAL_MIN = 12 * 60;   // fallback if a cooldown read fails
const RETRY_INTERVAL_MIN = 60;       // retry hourly if a vote attempt didn't complete
const CHECK_INTERVAL_MIN = 10;       // poll top.gg every 10 min for the real cooldown
const CHECK_TIMEOUT_MS = 60_000;     // close the hidden check tab if it stalls (content.js polls up to 50s)
const VOTE_ALARM = "karuta-vote";
const CHECK_ALARM = "karuta-cooldown-check";

const log = (...a) => console.log("[karuta-vote]", ...a);
const warn = (...a) => console.warn("[karuta-vote]", ...a);

chrome.runtime.onInstalled.addListener(async () => {
  // Defer the first vote attempt past the first cooldown check so we never
  // open top.gg while still on cooldown.
  await scheduleVoteAlarm(CHECK_INTERVAL_MIN);
  scheduleCheckAlarm(0);
});

chrome.runtime.onStartup.addListener(async () => {
  const { nextVoteAt } = await chrome.storage.local.get("nextVoteAt");
  const delayMin = nextVoteAt ? Math.max(0, (nextVoteAt - Date.now()) / 60_000) : 0;
  chrome.alarms.create(VOTE_ALARM, { delayInMinutes: delayMin });
  scheduleCheckAlarm(0);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === VOTE_ALARM) {
    await openVoteTab();
  } else if (alarm.name === CHECK_ALARM) {
    await runCooldownCheck();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "voted") {
    handleVoteSuccess().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "voteNow") {
    openVoteTab().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "checkNow") {
    runCooldownCheck().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "voteCooldown") {
    handleCooldownReport(msg.cooldownMs, sender.tab?.id, sender.tab?.url)
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

function scheduleCheckAlarm(initialDelayMin) {
  chrome.alarms.create(CHECK_ALARM, {
    delayInMinutes: Math.max(0, initialDelayMin || 0),
    periodInMinutes: CHECK_INTERVAL_MIN,
  });
}

async function runCooldownCheck() {
  log("opening hidden check tab");
  const tab = await chrome.tabs.create({ url: CHECK_URL, active: false });
  await chrome.storage.local.set({ checkTabId: tab.id, checkTabOpenedAt: Date.now() });

  // Fallback: if no cooldown report arrives within the timeout, close the tab
  // so it doesn't sit around eating memory.
  setTimeout(async () => {
    const { checkTabId } = await chrome.storage.local.get("checkTabId");
    if (checkTabId !== tab.id) return;
    warn("check tab timed out, closing");
    await chrome.storage.local.set({
      cooldownLastError: "timeout reading top.gg cooldown",
      cooldownLastErrorAt: Date.now(),
    });
    await chrome.tabs.remove(tab.id).catch(() => {});
    await chrome.storage.local.remove("checkTabId");
  }, CHECK_TIMEOUT_MS);
}

async function handleCooldownReport(cooldownMs, tabId, tabUrl) {
  const isCheckTab = !!tabUrl && tabUrl.includes("#check");
  log("cooldown reported:", cooldownMs, "isCheckTab:", isCheckTab);

  await chrome.storage.local.set({
    cooldownLastCheckedAt: Date.now(),
    cooldownLastError: null,
  });

  if (typeof cooldownMs === "number") {
    await chrome.storage.local.set({ cooldownSource: "topgg" });
    const delayMin = cooldownMs <= 0 ? 0 : cooldownMs / 60_000;
    await scheduleVoteAlarm(delayMin);
    log("rescheduled vote alarm for", Math.round(delayMin), "min");
  }

  // Close the hidden check tab. Never close the user's active vote tab.
  if (tabId && isCheckTab) {
    const { checkTabId } = await chrome.storage.local.get("checkTabId");
    if (tabId === checkTabId) {
      await chrome.tabs.remove(tabId).catch(() => {});
      await chrome.storage.local.remove("checkTabId");
      log("closed hidden check tab");
    }
  }
}

async function openVoteTab() {
  await chrome.tabs.create({ url: VOTE_URL, active: true });
  await chrome.storage.local.set({ lastAttemptAt: Date.now() });
  // Retry alarm in case the user closes the tab without finishing the captcha.
  await scheduleVoteAlarm(RETRY_INTERVAL_MIN);
  setBadge("…", "#888");
}

async function handleVoteSuccess() {
  await chrome.storage.local.set({ lastVotedAt: Date.now() });
  // Schedule a fallback 12h alarm — the next periodic check will tighten it
  // up with the precise cooldown read off the page.
  await scheduleVoteAlarm(VOTE_INTERVAL_MIN);
  setBadge("✓", "#2a9d4a");
  setTimeout(() => setBadge("", "#000"), 5 * 60 * 1000);
}

async function scheduleVoteAlarm(delayMin) {
  const safe = Math.max(0, delayMin);
  const nextVoteAt = Date.now() + safe * 60_000;
  await chrome.storage.local.set({ nextVoteAt });
  chrome.alarms.create(VOTE_ALARM, { delayInMinutes: safe });
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (text) chrome.action.setBadgeBackgroundColor({ color });
}
