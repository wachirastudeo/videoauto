import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  MockTikTokShowcaseAdapter,
  TikTokStudioInternalAdapter,
  OfficialTikTokPartnerAdapter,
  TikTokShowcaseAdapter,
} from '@/lib/tiktok-adapter';
import { ensureProductFolder } from '@/lib/file-manager';

export async function POST() {
  try {
    const db = getDb();
    const settings = db.prepare(`
      SELECT tiktok_api_mode, tiktok_api_url, tiktok_access_token, tiktok_cookie
      FROM settings WHERE id = 'default'
    `).get() as {
      tiktok_api_mode: string;
      tiktok_api_url: string;
      tiktok_access_token: string;
      tiktok_cookie: string;
    } | undefined;

    const mode = settings?.tiktok_api_mode || 'mock';
    let adapter: TikTokShowcaseAdapter;

    if (mode === 'studio') {
      const url = settings?.tiktok_api_url || 'https://shop.tiktok.com/api/v1/streamer_desktop/showcase_product/list';
      adapter = new TikTokStudioInternalAdapter(settings?.tiktok_cookie || '', url);
    } else if (mode === 'official') {
      const url = settings?.tiktok_api_url || 'https://open-api.tiktokglobalshop.com/affiliate/202309/showcase/products/search';
      adapter = new OfficialTikTokPartnerAdapter(settings?.tiktok_access_token || '', url);
    } else {
      adapter = new MockTikTokShowcaseAdapter();
    }

    const products = await adapter.getProducts();
    let createdCount = 0;
    let updatedCount = 0;

    const upsertStmt = db.prepare(`
      INSERT INTO showcase_products (
        id, platform_product_id, name, image_url, price, raw_api_data, folder_path, is_available, last_synced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'), datetime('now'))
      ON CONFLICT(platform_product_id) DO UPDATE SET
        name = excluded.name,
        image_url = excluded.image_url,
        price = excluded.price,
        raw_api_data = excluded.raw_api_data,
        folder_path = excluded.folder_path,
        is_available = 1,
        last_synced_at = datetime('now'),
        updated_at = datetime('now')
    `);

    for (const prod of products) {
      // ตรวจสอบโฟลเดอร์และสร้างอย่างปลอดภัย พร้อมเขียน product.json
      const folderStruct = ensureProductFolder(prod.platform_product_id, prod.name);

      const existing = db.prepare('SELECT id FROM showcase_products WHERE platform_product_id = ?').get(prod.platform_product_id) as { id: string } | undefined;
      const id = existing ? existing.id : `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      upsertStmt.run(
        id,
        prod.platform_product_id,
        prod.name,
        prod.image_url,
        prod.price,
        prod.raw_api_data ? JSON.stringify(prod.raw_api_data) : null,
        folderStruct.productDir
      );

      if (existing) {
        updatedCount++;
      } else {
        createdCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `ซิงก์สินค้าสำเร็จ: เพิ่มใหม่ ${createdCount} รายการ, อัปเดต ${updatedCount} รายการ (โหมด: ${mode})`,
      syncedCount: products.length,
      createdCount,
      updatedCount,
      mode,
    });
  } catch (error) {
    console.error('Error syncing showcase:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during showcase sync'
    }, { status: 500 });
  }
}
