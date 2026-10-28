import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const queuedVideos = db.prepare(`
      SELECT
        v.*,
        p.name as product_name,
        p.platform_product_id,
        p.image_url as product_image_url
      FROM videos v
      LEFT JOIN showcase_products p ON v.product_id = p.id
      WHERE v.upload_status IN ('queued', 'uploading', 'needs_verification')
      ORDER BY v.updated_at ASC
    `).all();

    return NextResponse.json({ success: true, queue: queuedVideos });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch queue'
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { video_ids } = body as { video_ids: string[] };

    if (!Array.isArray(video_ids) || video_ids.length === 0) {
      return NextResponse.json({ success: false, error: 'No video IDs provided' }, { status: 400 });
    }

    const db = getDb();
    const placeholders = video_ids.map(() => '?').join(',');

    // ปรับ upload_status เป็น queued เฉพาะคลิปที่ยังไม่ได้ published หรือกำลัง uploading
    const info = db.prepare(`
      UPDATE videos
      SET upload_status = 'queued', updated_at = datetime('now')
      WHERE id IN (${placeholders}) AND upload_status NOT IN ('uploading', 'published', 'needs_verification') AND output_path IS NOT NULL
    `).run(...video_ids);

    return NextResponse.json({
      success: true,
      queuedCount: info.changes,
      message: `นำเข้าคิวอัปโหลด ${info.changes} รายการเรียบร้อย`,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to queue videos'
    }, { status: 500 });
  }
}
