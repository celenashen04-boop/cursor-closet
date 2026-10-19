// Chrome only runs content scripts on pages loaded after the extension is installed or
// reloaded. Inject into tabs that were already open so the cursor shows up right away.
chrome.runtime.onInstalled.addListener(injectIntoOpenTabs);

async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    // Chrome's own pages and the Web Store can't be scripted.
    if (!tab.id || !/^(https?|file):/.test(tab.url ?? '')) continue;
    chrome.scripting
      .executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] })
      .catch(() => {});
  }
}
