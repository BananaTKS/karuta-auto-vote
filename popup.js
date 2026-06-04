function fmt(ts) {
  if (!ts) return "never";
  const now = Date.now();
  const diff = ts - now;
  if (Math.abs(diff) < 60_000) return "just now";
  if (diff > 0) {
    const mins = Math.round(diff / 60_000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem ? `in ${hrs}h ${rem}m` : `in ${hrs}h`;
  }
  const mins = Math.round(-diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

async function render() {
  const {
    lastVotedAt,
    nextVoteAt,
    cooldownLastCheckedAt,
    cooldownSource,
    cooldownLastError,
    cooldownLastErrorAt,
  } = await chrome.storage.local.get([
    "lastVotedAt",
    "nextVoteAt",
    "cooldownLastCheckedAt",
    "cooldownSource",
    "cooldownLastError",
    "cooldownLastErrorAt",
  ]);
  document.getElementById("last").textContent = fmt(lastVotedAt);
  document.getElementById("next").textContent = fmt(nextVoteAt);
  document.getElementById("checked").textContent = fmt(cooldownLastCheckedAt);
  document.getElementById("source").textContent = cooldownSource || "local";

  const errBox = document.getElementById("error");
  const errIsCurrent = cooldownLastError &&
    (!cooldownLastCheckedAt || (cooldownLastErrorAt || 0) >= cooldownLastCheckedAt);
  if (errIsCurrent) {
    errBox.textContent = `Error: ${cooldownLastError}`;
    errBox.classList.add("show");
  } else {
    errBox.classList.remove("show");
  }
}

document.getElementById("voteNow").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "voteNow" });
  window.close();
});

document.getElementById("checkNow").addEventListener("click", async () => {
  const btn = document.getElementById("checkNow");
  btn.disabled = true;
  btn.textContent = "Checking…";

  const before = (await chrome.storage.local.get("cooldownLastCheckedAt"))
    .cooldownLastCheckedAt || 0;
  try {
    await chrome.runtime.sendMessage({ type: "checkNow" });
  } catch (_) {}

  // Poll storage until the cooldownLastCheckedAt timestamp moves forward,
  // up to ~60s (matches the background timeout).
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    await new Promise((r) => setTimeout(r, 500));
    const cur = (await chrome.storage.local.get("cooldownLastCheckedAt"))
      .cooldownLastCheckedAt || 0;
    if (cur > before) break;
  }

  await render();
  btn.disabled = false;
  btn.textContent = "Check cooldown now";
});

render();
