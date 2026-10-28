const SHOWCASE_URL = 'https://shop.tiktok.com/streamer/showcase/product/list';

function waitForTab(tabId) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }, 15000);
    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'SYNC_SHOWCASE' || !/^http:\/\/(localhost|127\.0\.0\.1):3000$/.test(message.appOrigin) || !sender.tab?.url?.startsWith(message.appOrigin + '/')) return;
  (async () => {
    const matches = await chrome.tabs.query({ url: 'https://shop.tiktok.com/streamer/showcase/product/list*' });
    let tab = matches[0];
    if (!tab?.id) {
      tab = await chrome.tabs.create({ url: SHOWCASE_URL, active: true });
      await waitForTab(tab.id);
    }
    let read;
    try {
      read = await chrome.tabs.sendMessage(tab.id, { type: 'READ_SHOWCASE' });
    } catch {
      await chrome.tabs.update(tab.id, { active: true });
      return { success: false, login_required: true, error: 'Log in to TikTok Shop in the opened tab, then click Sync again.' };
    }
    if (!read?.success) {
      await chrome.tabs.update(tab.id, { active: true });
      return read || { success: false, error: 'Could not read TikTok Showcase.' };
    }
    const response = await fetch(`${message.appOrigin}/api/showcase/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: read.products }),
    });
    return await response.json();
  })().then(sendResponse).catch((error) => sendResponse({ success: false, error: error.message }));
  return true;
});
