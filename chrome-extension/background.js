const SHOWCASE_URL = 'https://shop.tiktok.com/streamer/showcase/product/list';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'SYNC_SHOWCASE_BACKGROUND' || !/^http:\/\/(localhost|127\.0\.0\.1):3000$/.test(message.appOrigin) || !sender.tab?.url?.startsWith(message.appOrigin + '/')) return;
  (async () => {
    // Read from an existing signed-in TikTok tab without activating or navigating it.
    const matches = await chrome.tabs.query({ url: 'https://shop.tiktok.com/*' });
    const tab = matches.find(tab => tab.url?.startsWith(SHOWCASE_URL)) || matches[0];
    if (!tab?.id) return { success: false, login_required: true, error: 'Please log in to TikTok Shop in Chrome first, then click Sync. No tab will be opened automatically.' };
    let read;
    try {
      read = await chrome.tabs.sendMessage(tab.id, { type: 'READ_SHOWCASE' });
    } catch {
      return { success: false, login_required: true, error: 'Refresh your signed-in TikTok Shop tab, then click Sync again.' };
    }
    if (!read?.success) return read || { success: false, error: 'Could not read TikTok Showcase.' };
    const response = await fetch(`${message.appOrigin}/api/showcase/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: read.products }),
    });
    return await response.json();
  })().then(sendResponse).catch((error) => sendResponse({ success: false, error: error.message }));
  return true;
});
