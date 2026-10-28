import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const history = db.prepare(`
      SELECT
        h.*,
        j.video_id,
        j.status as job_status,
        v.source_filename,
        v.output_filename,
        v.anchor_status,
        p.name as product_name,
        p.platform_product_id
      FROM publishing_history h
      JOIN publishing_jobs j ON h.publishing_job_id = j.id
      JOIN videos v ON j.video_id = v.id
      LEFT JOIN showcase_products p ON v.product_id = p.id
      ORDER BY h.created_at DESC
      LIMIT 100
    `).all();

    return NextResponse.json({ success: true, history });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch publishing history'
    }, { status: 500 });
  }
}
