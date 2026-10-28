import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getStorageRoot } from '@/lib/file-manager';
import path from 'path';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const video = db.prepare(`
      SELECT
        v.*,
        p.name as product_name,
        p.platform_product_id,
        p.image_url as product_image_url,
        p.price as product_price
      FROM videos v
      LEFT JOIN showcase_products p ON v.product_id = p.id
      WHERE v.id = ?
    `).get(id);

    if (!video) {
      return NextResponse.json({ success: false, error: 'Video not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, video });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch video'
    }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { product_id, caption_text, voice_path } = body;

    const db = getDb();
    const existing = db.prepare('SELECT id FROM videos WHERE id = ?').get(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Video not found' }, { status: 404 });
    }

    // อัปเดตข้อมูล
    const updates: string[] = ['updated_at = datetime(\'now\')'];
    const values: unknown[] = [];

    if (product_id !== undefined) {
      updates.push('product_id = ?');
      values.push(product_id);
    }
    if (caption_text !== undefined) {
      updates.push('caption_text = ?');
      values.push(caption_text);
    }
    if (voice_path !== undefined) {
      if (voice_path !== null && (typeof voice_path !== 'string' || !path.resolve(voice_path).startsWith(path.resolve(getStorageRoot()) + path.sep))) {
        return NextResponse.json({ success: false, error: 'Invalid voice file path' }, { status: 400 });
      }
      updates.push('voice_path = ?');
      values.push(voice_path);
    }

    values.push(id);

    db.prepare(`UPDATE videos SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return NextResponse.json({ success: true, message: 'อัปเดตข้อมูลวิดีโอเรียบร้อย' });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update video'
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare('DELETE FROM videos WHERE id = ?').run(id);
    return NextResponse.json({ success: true, message: 'ลบวิดีโอเรียบร้อย' });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete video'
    }, { status: 500 });
  }
}
