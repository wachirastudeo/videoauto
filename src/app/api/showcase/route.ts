import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const mode = 'studio';
    const products = db.prepare(`
      SELECT
        p.*,
        COUNT(v.id) as video_count
      FROM showcase_products p
      LEFT JOIN videos v ON v.product_id = p.id
      WHERE p.sync_source = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all(mode);

    return NextResponse.json({
      success: true,
      products,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch showcase products'
    }, { status: 500 });
  }
}
