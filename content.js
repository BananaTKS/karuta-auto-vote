// Runs on https://top.gg/bot/646937666251915264/vote*
// Two modes selected by URL hash:
//   - default: try to vote (click Vote, watch for success). User solves the captcha.
//   - #check: read the cooldown text off the page and report it back, no clicking.
//             The background script closes this tab once the cooldown is read.

(function () {
  const isCheckMode = window.location.hash === "#check";
  const log = (...a) => console.log("[karuta-vote/topgg]", ...a);

  const SUCCESS_PHRASES = [
    "thanks for voting",
    "thank you for voting",
    "vote received",
    "you have already voted",
    "you've already voted",
    "next vote in",
    "vote again in",
  ];

  function findVoteButton() {
    const candidates = document.querySelectorAll("button, a, [role='button']");
    for (const el of candidates) {
      const text = (el.innerText || el.textContent || "").trim().toLowerCase();
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      if (!visible || el.disabled) continue;
      if (text === "vote" || text === "vote now" || /^vote for /.test(text)) {
        return el;
      }
    }
    return null;
  }

  function pageIndicatesSuccess() {
    const body = (document.body?.innerText || "").toLowerCase();
    return SUCCESS_PHRASES.some((p) => body.includes(p));
  }

  // Returns ms until next vote, 0 if vote is ready, or null if undetermined.
  function readCooldownMs() {
    const body = document.body?.innerText || "";
    if (!body) return null;

    const phrasePatterns = [
      /vote again in[^.\n]*/i,
      /next vote in[^.\n]*/i,
      /come back in[^.\n]*/i,
      /you can vote again[^.\n]*/i,
    ];
    let phrase = null;
    for (const re of phrasePatterns) {
      const m = body.match(re);
      if (m) { phrase = m[0]; break; }
    }
    if (!phrase) return null;
    log("cooldown phrase:", JSON.stringify(phrase));

    let ms = 0;
    const h = phrase.match(/(\d+)\s*h(?:ours?|rs?)?\b/i);
    const m = phrase.match(/(\d+)\s*m(?:in(?:utes?)?)?\b/i);
    if (h) ms += parseInt(h[1], 10) * 3_600_000;
    if (m) ms += parseInt(m[1], 10) * 60_000;
    if (ms === 0) {
      const longH = phrase.match(/(\d+)\s+hours?/i);
      if (longH) ms += parseInt(longH[1], 10) * 3_600_000;
      const longM = phrase.match(/(\d+)\s+minutes?/i);
      if (longM) ms += parseInt(longM[1], 10) * 60_000;
    }
    return ms > 0 ? ms : null;
  }

  function reportSuccess() {
    try { chrome.runtime.sendMessage({ type: "voted" }); } catch (_) {}
  }

  function reportCooldown(cooldownMs) {
    try { chrome.runtime.sendMessage({ type: "voteCooldown", cooldownMs }); } catch (_) {}
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // Poll the page for a concrete signal — cooldown text, "voted" indicator,
  // or a vote button that's been stable for long enough to trust. We do NOT
  // bail out on weak signals like "body has some text", because top.gg's
  // initial loading shell satisfies that before the cooldown actually renders.
  async function runCheckMode() {
    log("check mode");

    // Initial settling — let React/JS hydrate after document_idle. Hidden
    // tabs are timer-throttled so this is also a buffer for that.
    await sleep(3000);

    const start = Date.now();
    const TIMEOUT_MS = 50_000;
    const READY_MIN_WAIT_MS = 6_000;   // before declaring "ready", give the page time
    const VOTED_MIN_WAIT_MS = 8_000;   // same for the parseless "voted" fallback

    let lastState = "(none yet)";

    while (Date.now() - start < TIMEOUT_MS) {
      // 1. Cooldown phrase parsed → definitive
      const cooldown = readCooldownMs();
      if (cooldown !== null) {
        log("cooldown:", Math.round(cooldown / 60_000), "min");
        reportCooldown(cooldown);
        return;
      }

      const elapsed = Date.now() - start;
      const btn = findVoteButton();
      const voted = pageIndicatesSuccess();

      const state = `btn=${!!btn} voted=${voted} t=${Math.round(elapsed / 1000)}s`;
      if (state !== lastState) { log("state:", state); lastState = state; }

      // 2. Voted indicator without a parseable cooldown — fall back to 12h.
      // Wait long enough that we're sure the cooldown text isn't still rendering.
      if (voted && !btn && elapsed > VOTED_MIN_WAIT_MS) {
        log("voted-state, no parsable cooldown — defaulting to 12h");
        reportCooldown(12 * 3_600_000);
        return;
      }

      // 3. Vote button visible with no voted-state indicator → ready to vote.
      // Require it to remain that way for at least READY_MIN_WAIT_MS so we
      // don't race a late-rendering cooldown overlay.
      if (btn && !voted && elapsed > READY_MIN_WAIT_MS) {
        log("vote button visible, ready to vote");
        reportCooldown(0);
        return;
      }

      await sleep(1500);
    }

    // Final attempt at the timeout — read whatever's there.
    const finalCooldown = readCooldownMs();
    if (finalCooldown !== null) {
      log("(timeout) cooldown:", Math.round(finalCooldown / 60_000), "min");
      reportCooldown(finalCooldown);
      return;
    }
    if (findVoteButton()) {
      log("(timeout) vote button visible — assuming ready");
      reportCooldown(0);
      return;
    }
    if (pageIndicatesSuccess()) {
      log("(timeout) voted-state, no parseable cooldown — defaulting to 12h");
      reportCooldown(12 * 3_600_000);
      return;
    }
    log("(timeout) no signal — reporting null");
    reportCooldown(null);
  }

  async function clickUntilDone() {
    const start = Date.now();
    const TIMEOUT_MS = 10 * 60 * 1000;
    let lastClickAt = 0;
    while (Date.now() - start < TIMEOUT_MS) {
      if (pageIndicatesSuccess()) {
        reportSuccess();
        return;
      }
      const btn = findVoteButton();
      if (btn && Date.now() - lastClickAt > 3000) {
        btn.click();
        lastClickAt = Date.now();
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  if (isCheckMode) {
    runCheckMode();
  } else {
    clickUntilDone();
  }
})();
