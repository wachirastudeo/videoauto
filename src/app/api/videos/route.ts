import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ensureProductFolder, calculateFileHash } from '@/lib/file-manager';
import { generateThumbnail } from '@/lib/ffmpeg';
import path from 'path';
import fs from 'fs';

export async function GET() {
  try {
    const db = getDb();
    // หนึ่งรายการต่อหนึ่งวิดีโอ!
    const videos = db.prepare(`
      SELECT
        v.*,
        p.name as product_name,
        p.platform_product_id,
        p.image_url as product_image_url,
        p.price as product_price,
        p.folder_path as product_folder_path
      FROM videos v
      LEFT JOIN showcase_products p ON v.product_id = p.id
      ORDER BY v.created_at DESC
    `).all();

    return NextResponse.json({
      success: true,
      videos,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch videos'
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const productId = formData.get('product_id') as string | null;
    const file = formData.get('file') as File | null;
    const voiceFile = formData.get('voice_file') as File | null;
    const caption = (formData.get('caption') as string) || '';

    if (!file) {
      return NextResponse.json({ success: false, error: 'No video file uploaded' }, { status: 400 });
    }

    const db = getDb();
    let productDir = '';
    let productRow: { id: string; platform_product_id: string; name: string; folder_path: string } | undefined;

    if (productId) {
      productRow = db.prepare('SELECT id, platform_product_id, name, folder_path FROM showcase_products WHERE id = ?').get(productId) as typeof productRow;
      if (!productRow) {
        return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
      }
      if (productRow) {
        const folderStruct = ensureProductFolder(productRow.platform_product_id, productRow.name);
        productDir = folderStruct.productDir;
      }
    }

    // หากไม่มีสินค้า ผูก default folder
    if (!productDir) {
      const folderStruct = ensureProductFolder('unassigned', 'Unassigned_Videos');
      productDir = folderStruct.productDir;
    }

    const inputDir = path.join(productDir, 'input');
    const voiceDir = path.join(productDir, 'voice');

    // บันทึกไฟล์วิดีโอ
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(inputDir, filename);
    fs.writeFileSync(filePath, buffer);

    const hash = calculateFileHash(filePath);

    // บันทึกไฟล์เสียงพากย์ถ้ามี
    let voicePath: string | null = null;
    if (voiceFile && voiceFile.size > 0) {
      const vBytes = await voiceFile.arrayBuffer();
      const vBuffer = Buffer.from(vBytes);
      const vFilename = `${Date.now()}_${voiceFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      voicePath = path.join(voiceDir, vFilename);
      fs.writeFileSync(voicePath, vBuffer);
    }

    // สร้าง thumbnail อัตโนมัติถ้าทำได้
    const thumbPath = await generateThumbnail(filePath, inputDir);

    const videoId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const finalCaption = caption || (productRow ? `รีวิว ${productRow.name} คุ้มค่า คุณภาพดี ห้ามพลาด! #TikTokShop #นายหน้าTikTok` : '');

    db.prepare(`
      INSERT INTO videos (
        id, product_id, source_path, source_filename, voice_path, caption_text, file_hash, thumbnail_path,
        edit_status, upload_status, anchor_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready_to_edit', 'idle', 'not_started', datetime('now'), datetime('now'))
    `).run(
      videoId,
      productRow?.id || null,
      filePath,
      filename,
      voicePath,
      finalCaption,
      hash,
      thumbPath
    );

    return NextResponse.json({
      success: true,
      videoId,
      message: 'อัปโหลดวิดีโอเข้าโฟลเดอร์สินค้าและสร้างบันทึกเรียบร้อย',
    });
  } catch (error) {
    console.error('Error adding video:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add video'
    }, { status: 500 });
  }
}
