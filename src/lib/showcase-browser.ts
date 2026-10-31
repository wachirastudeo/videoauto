import { chromium, type BrowserContext } from 'playwright';
import path from 'node:path';
const state = globalThis as typeof globalThis & { showcaseBrowser?: Promise<BrowserContext> };
export async function getShowcaseBrowser() {
  if (!state.showcaseBrowser) {
    state.showcaseBrowser = chromium.launchPersistentContext(path.join(process.cwd(), 'app-data', 'tiktok-browser'), { channel: 'chrome', headless: false }).then(context => {
      context.on('close', () => { state.showcaseBrowser = undefined; });
      return context;
    }).catch(error => { state.showcaseBrowser = undefined; throw error; });
  }
  return state.showcaseBrowser;
}
export async function readShowcase() {
  if (!state.showcaseBrowser) throw new Error('Connect TikTok in Settings first. Sync will not open a new Chrome window.');
  const context = await state.showcaseBrowser;
  const page = context.pages().find(page => page.url().startsWith('https://shop.tiktok.com/'));
  if (!page) throw new Error('Open TikTok Shop in the connected Chrome window first.');
  return page.evaluate(async () => {
    const products: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (let offset = 0; offset < 2000; offset += 100) {
      const response = await fetch(`/api/v1/streamer_desktop/showcase_product/list?offset=${offset}&count=100`, { credentials: 'include' });
      if (!response.ok) throw new Error(`TikTok HTTP ${response.status}: log in to TikTok Shop in the Chrome window, then sync again.`);
      const result = await response.json();
      if (result.code !== 0 || !Array.isArray(result.data?.products)) throw new Error('Log in to TikTok Shop in the Chrome window, complete any security check, then sync again.');
      for (const product of result.data.products) {
        const id = String(product.product_id || '');
        if (!/^\d+$/.test(id) || seen.has(id)) continue;
        seen.add(id);
        const cover = product.cover;
        products.push({ platform_product_id: id, name: product.title || 'Untitled product', image_url: typeof cover === 'string' ? cover : cover?.url_list?.[0] || cover?.thumb_url_list?.[0] || cover?.url || '', price: Number(String(product.format_available_price || '').replace(/[^\d.]/g, '')) || 0, stock_num: Number(product.stock_num || 0), shop_name: product.seller_info?.shop_name || '', commission_rate: Number(product.affiliate_info?.commission_rate || 0) });
      }
      if (!result.data.products.length || offset + result.data.products.length >= Number(result.data.total || 0)) break;
    }
    return products;
  });
}
