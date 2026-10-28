chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'READ_SHOWCASE') return;
  (async () => {
    if (!location.pathname.startsWith('/streamer/showcase/product/list')) {
      throw new Error('Please log in to TikTok Shop and open Showcase Products, then click Sync again.');
    }
    const products = [];
    const seen = new Set();
    for (let offset = 0; offset < 2000; offset += 100) {
      const url = new URL('/api/v1/streamer_desktop/showcase_product/list', location.origin);
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('count', '100');
      const response = await fetch(url, { credentials: 'include' });
      if (response.status === 401 || response.status === 403) throw new Error('TikTok login expired. Log in and click Sync again.');
      if (!response.ok) throw new Error(`TikTok Showcase HTTP ${response.status}`);
      const json = await response.json();
      if (json.code !== 0) throw new Error(`TikTok Showcase ${json.code}: ${json.message || 'Unknown error'}`);
      const page = json.data?.products;
      if (!Array.isArray(page)) throw new Error('TikTok Showcase response has no products array.');
      for (const product of page) {
        const id = String(product.product_id || '');
        if (!/^\d+$/.test(id) || seen.has(id)) continue;
        seen.add(id);
        const cover = product.cover;
        const image = typeof cover === 'string' ? cover : cover?.url_list?.[0] || cover?.thumb_url_list?.[0] || cover?.url || product.images?.[0]?.url_list?.[0] || product.images?.[0]?.url || '';
        products.push({
          platform_product_id: id,
          name: String(product.title || 'Untitled product'),
          image_url: String(image),
          price: Number(String(product.format_available_price || '').replace(/[^\d.]/g, '')) || 0,
          stock_num: Number(product.stock_num || 0),
          shop_name: String(product.seller_info?.shop_name || ''),
          commission_rate: Number(product.affiliate_info?.commission_rate || 0),
        });
      }
      if (page.length === 0 || offset + page.length >= Number(json.data?.total || 0)) break;
    }
    if (products.length === 0) throw new Error('No products found in your TikTok Showcase.');
    sendResponse({ success: true, products });
  })().catch((error) => sendResponse({ success: false, error: error.message }));
  return true;
});
