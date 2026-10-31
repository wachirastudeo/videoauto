import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
const execute = promisify(execFile);

// Chrome's Apple Events interface uses the user's already-open profile.
async function runInTikTok(script: string) {
  const appleScript = `tell application "Google Chrome"
    repeat with browserWindow in windows
      repeat with browserTab in tabs of browserWindow
        if (URL of browserTab as text) starts with "https://shop.tiktok.com/" then
          return execute browserTab javascript ${JSON.stringify(script)}
        end if
      end repeat
    end repeat
    repeat with browserWindow in windows
      repeat with browserTab in tabs of browserWindow
        if (URL of browserTab as text) starts with "https://www.tiktok.com/tiktokstudio" or (URL of browserTab as text) starts with "https://tiktok.com/tiktokstudio" then
          return execute browserTab javascript ${JSON.stringify(script)}
        end if
      end repeat
    end repeat
    error "Open your signed-in TikTok Studio tab in Chrome first."
  end tell`;
  try {
    const { stdout } = await execute('/usr/bin/osascript', ['-e', appleScript], { timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
    return stdout.trim();
  } catch (cause) {
    const details = String((cause as { stderr?: string }).stderr || '');
    const reason = details.includes('(-1743)') ? 'macOS denied permission to control Chrome.' : details.includes('syntax error') ? 'Chrome automation script syntax error.' : details.includes('Open your signed-in') ? 'Open your signed-in TikTok Studio tab in Chrome first.' : details.includes('JavaScript') ? 'Enable View > Developer > Allow JavaScript from Apple Events in Chrome.' : 'Chrome automation failed.';
    throw new Error(reason + ' ' + (details.match(/(?:execution|syntax) error: ([^\n]+)/)?.[1] || '').slice(0, 400) + ' No new window was opened.');
  }
}

export async function readExistingChromeShowcase() {
  const slot = `__videoauto_${randomUUID().replaceAll('-', '')}`;
  const script = `(() => {
    const slot = ${JSON.stringify(slot)};
    window[slot] = { pending: true };
    (async () => {
      const products = []; const seen = new Set();
      for (let offset = 0; offset < 2000; offset += 100) {
        const response = await fetch('https://shop.tiktok.com/api/v1/streamer_desktop/showcase_product/list?offset=' + offset + '&count=100', { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error('TikTok API HTTP ' + response.status);
        const json = await response.json();
        if (json.code !== 0 || !Array.isArray(json.data?.products)) throw new Error('TikTok Shop session is not authorized. Your TikTok Studio login may not include TikTok Shop access.');
        for (const p of json.data.products) {
          const id = String(p.product_id || '');
          if (!/^\\d+$/.test(id) || seen.has(id)) continue;
          seen.add(id);
          const cover = p.cover;
          products.push({ platform_product_id: id, name: String(p.title || 'Untitled product'), image_url: typeof cover === 'string' ? cover : cover?.url_list?.[0] || cover?.thumb_url_list?.[0] || cover?.url || '', price: Number(String(p.format_available_price || '').replace(/[^\\d.]/g, '')) || 0, commission_rate: Number(p.affiliate_info?.commission_rate || 0), stock_num: Number(p.stock_num || 0), shop_name: p.seller_info?.shop_name || '' });
        }
        if (!json.data.products.length || json.data.products.length < 100 || (json.data.total !== undefined && offset + json.data.products.length >= Number(json.data.total))) return products;
      }
      throw new Error('More than 2000 products; no partial import was saved.');
    })().then(products => { window[slot] = { products }; }).catch(error => { window[slot] = { error: error.message === 'Failed to fetch' ? 'Chrome blocked the TikTok Studio to Shop API request. Open TikTok Shop in the same Chrome profile and retry; Sync will not open a tab automatically.' : error.message }; });
    return 'started';
  })()`;
  await runInTikTok(script);
  try {
    for (let attempt = 0; attempt < 180; attempt++) {
      const text = await runInTikTok(`JSON.stringify(window[${JSON.stringify(slot)}] || { error: 'TikTok tab changed during sync' })`);
      const result = JSON.parse(text);
      if (result.error) throw new Error(result.error);
      if (Array.isArray(result.products)) return result.products;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('TikTok sync timed out.');
  } finally {
    await runInTikTok(`delete window[${JSON.stringify(slot)}]; 'cleared'`).catch(() => {});
  }
}
