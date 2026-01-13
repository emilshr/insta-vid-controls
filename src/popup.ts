import browser from "webextension-polyfill";

document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("extensionToggle") as HTMLInputElement;

  if (!toggle) return;

  // Load initial state
  const data = await browser.storage.sync.get({ extensionEnabled: true });
  toggle.checked = data.extensionEnabled;

  // Save state on change
  toggle.addEventListener("change", async () => {
    await browser.storage.sync.set({ extensionEnabled: toggle.checked });
    console.log(
      "[InstaControl] Extension enabled state changed to:",
      toggle.checked
    );
  });
});

console.log("Hello from the popup!", { id: browser.runtime.id });
