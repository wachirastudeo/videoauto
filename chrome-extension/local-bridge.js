window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'videoauto-app' || event.data.type !== 'SYNC_SHOWCASE_BACKGROUND') return;
  window.postMessage({ source: 'videoauto-extension', type: 'SYNC_STARTED' }, location.origin);
  chrome.runtime.sendMessage({ type: 'SYNC_SHOWCASE_BACKGROUND', appOrigin: location.origin }, (response) => {
    window.postMessage({
      source: 'videoauto-extension',
      type: 'SYNC_RESULT',
      ...(response || { success: false, error: chrome.runtime.lastError?.message || 'Showcase bridge unavailable' }),
    }, location.origin);
  });
});
