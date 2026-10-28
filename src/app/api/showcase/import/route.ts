import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ensureProductFolder } from '@/lib/file-manager';
import crypto from 'node:crypto';

type ImportedProduct = {
  platform_product_id: string;
  name: string;
  image_url?: string;
  price?: number;
  stock_num?: number;
  shop_name?: string;
  commission_rate?: number;
};

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get('origin');
    if (origin && !origin.startsWith('chrome-extension://')) {
      return NextResponse.json({ success: false, error: 'Showcase bridge required' }, { status: 403 });
    }
    const body = await req.json() as { products?: ImportedProduct[] };
    if (!Array.isArray(body.products) || body.products.length === 0 || body.products.length > 2000) {
      return NextResponse.json({ success: false, error: 'Invalid Showcase product list' }, { status: 400 });
    }
    const products = body.products.map((p) => ({
      id: String(p.platform_product_id || ''),
      name: String(p.name || '').trim(),
      image: String(p.image_url || ''),
      price: Number(p.price || 0),
      raw: p,
    }));
    if (products.some((p) => !/^\d+$/.test(p.id) || !p.name || p.name.length > 500 || !Number.isFinite(p.price) || p.price < 0)) {
      return NextResponse.json({ success: false, error: 'Invalid Showcase product data' }, { status: 400 });
    }
    const db = getDb();
    const upsert = db.prepare(`
      INSERT INTO showcase_products (id, platform_product_id, name, image_url, price, raw_api_data, folder_path, sync_source, is_available, last_synced_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'studio', 1, datetime('now'), datetime('now'), datetime('now'))
      ON CONFLICT(platform_product_id) DO UPDATE SET
        name = excluded.name, image_url = excluded.image_url, price = excluded.price,
        raw_api_data = excluded.raw_api_data, folder_path = excluded.folder_path,
        sync_source = 'studio', is_available = 1, last_synced_at = datetime('now'), updated_at = datetime('now')
    `);
    for (const product of products) {
      const folder = ensureProductFolder(product.id, product.name);
      upsert.run(crypto.randomUUID(), product.id, product.name, product.image, product.price, JSON.stringify(product.raw), folder.productDir);
    }
    db.prepare("UPDATE settings SET tiktok_api_mode = 'studio', updated_at = datetime('now') WHERE id = 'default'").run();
    return NextResponse.json({ success: true, message: `Synced ${products.length} real Showcase products`, syncedCount: products.length });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Showcase import failed' }, { status: 500 });
  }
}
