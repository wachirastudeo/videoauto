import { getDb } from './db';

export async function readShowcaseApi() {
  const settings = getDb().prepare("SELECT tiktok_cookie FROM settings WHERE id = 'default'").get() as { tiktok_cookie?: string } | undefined;
  const cookie = process.env.TIKTOK_SHOP_COOKIE || settings?.tiktok_cookie;
  if (!cookie?.trim()) throw new Error('TikTok API session is missing. Configure TIKTOK_SHOP_COOKIE on the server.');
  const products: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < 2000; offset += 100) {
    const response = await fetch(`https://shop.tiktok.com/api/v1/streamer_desktop/showcase_product/list?offset=${offset}&count=100`, { headers: { Cookie: cookie.trim(), Accept: 'application/json', Referer: 'https://shop.tiktok.com/streamer/showcase/product/list' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`TikTok API HTTP ${response.status}. Check your session or try again later.`);
    const result = await response.json();
    if (result.code !== 0 || !Array.isArray(result.data?.products)) throw new Error('TikTok API rejected the session. Please renew your TikTok Shop login session.');
    for (const product of result.data.products) {
      const id = String(product.product_id || '');
      if (!/^\d+$/.test(id) || seen.has(id)) continue;
      seen.add(id);
      const cover = product.cover;
      products.push({ platform_product_id: id, name: product.title || 'Untitled product', image_url: typeof cover === 'string' ? cover : cover?.url_list?.[0] || cover?.thumb_url_list?.[0] || cover?.url || product.imgs?.[0] || '', price: Number(String(product.format_available_price || '').replace(/[^\d.]/g, '')) || 0, stock_num: Number(product.stock_num || 0), shop_name: product.seller_info?.shop_name || '', commission_rate: Number(product.affiliate_info?.commission_rate || 0) });
    }
    if (!result.data.products.length || (result.data.total !== undefined && offset + result.data.products.length >= Number(result.data.total)) || result.data.products.length < 100) break;
    if (offset === 1900) throw new Error('Showcase exceeds the 2000-product sync limit. No partial import was saved.');
  }
  return products;
}
