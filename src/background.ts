import browser from "webextension-polyfill";

console.log("Hello from the background!");

browser.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed:", details);
});

browser.tabs.onCreated.addListener((tab) => {
  console.log("Tab created", tab);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log("Tab updated", tabId, changeInfo, tab);

  if (changeInfo.url) {
    console.log("URL changed", changeInfo.url);
  }
  browser.tabs.get(tabId).then((fetchedTab) => {
    console.log({ fetchedTab });
  });
});

// browser.browserAction.onClicked.addListener((tab, info) => {
//   console.log("Browser action clicked", tab, info);
// });

// browser.runtime

// const observer = new MutationObserver(() => {})
