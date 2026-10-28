import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { previewOutputFilename } from '@/lib/naming';
import fs from 'node:fs';
import path from 'node:path';

export async function GET() {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings WHERE id = ?').get('default') as {
      prefix: string;
      separator: string;
      date_format: 'YYYYMMDD' | 'YYMMDD' | 'NONE';
      include_product_id: number;
      sequence_number: number;
      storage_root: string;
    };

    const preview = previewOutputFilename({
      prefix: settings.prefix,
      separator: settings.separator,
      date_format: settings.date_format,
      include_product_id: Boolean(settings.include_product_id),
      sequence_number: settings.sequence_number,
    });

    return NextResponse.json({
      success: true,
      settings: {
        prefix: settings.prefix,
        separator: settings.separator,
        date_format: settings.date_format,
        include_product_id: Boolean(settings.include_product_id),
        sequence_number: settings.sequence_number,
        storage_root: settings.storage_root,
      },
      preview,
      resolved_storage_root: path.resolve(settings.storage_root),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch settings'
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prefix,
      separator,
      date_format,
      include_product_id,
      sequence_number,
      storage_root,
    } = body;

    const db = getDb();
    const previous = db.prepare("SELECT storage_root FROM settings WHERE id = 'default'").get() as { storage_root: string };
    const oldRoot = path.resolve(previous.storage_root);
    const requestedRoot = storage_root === undefined ? previous.storage_root : String(storage_root).trim();
    if (!requestedRoot) {
      return NextResponse.json({ success: false, error: 'Storage folder is required' }, { status: 400 });
    }
    const newRoot = path.resolve(requestedRoot);
    const moving = newRoot !== oldRoot;
    if (moving && (newRoot === path.parse(newRoot).root || newRoot.startsWith(oldRoot + path.sep) || oldRoot.startsWith(newRoot + path.sep))) {
      return NextResponse.json({ success: false, error: 'Choose a separate storage folder' }, { status: 400 });
    }
    if (moving && fs.existsSync(newRoot) && (!fs.statSync(newRoot).isDirectory() || fs.readdirSync(newRoot).length > 0)) {
      return NextResponse.json({ success: false, error: 'Choose an empty destination folder.' }, { status: 409 });
    }
    let moved = false;
    let removedEmptyTarget = false;
    let transactionStarted = false;
    try {
      if (moving && fs.existsSync(oldRoot)) {
        fs.mkdirSync(path.dirname(newRoot), { recursive: true });
        if (fs.existsSync(newRoot)) {
          fs.rmdirSync(newRoot);
          removedEmptyTarget = true;
        }
        fs.renameSync(oldRoot, newRoot);
        moved = true;
      }
      db.exec('BEGIN');
      transactionStarted = true;
      if (moving) {
        const products = db.prepare('SELECT id, folder_path FROM showcase_products WHERE folder_path IS NOT NULL').all() as Array<{ id: string; folder_path: string }>;
        const updateProduct = db.prepare('UPDATE showcase_products SET folder_path = ? WHERE id = ?');
        for (const product of products) {
          if (product.folder_path.startsWith(oldRoot + path.sep)) updateProduct.run(newRoot + product.folder_path.slice(oldRoot.length), product.id);
        }
        const videos = db.prepare('SELECT id, source_path, output_path, voice_path, thumbnail_path FROM videos').all() as Array<Record<string, string | null>>;
        const updateVideo = db.prepare('UPDATE videos SET source_path = ?, output_path = ?, voice_path = ?, thumbnail_path = ? WHERE id = ?');
        for (const video of videos) {
          const mapped = ['source_path', 'output_path', 'voice_path', 'thumbnail_path'].map((key) => {
            const value = video[key];
            return value?.startsWith(oldRoot + path.sep) ? newRoot + value.slice(oldRoot.length) : value;
          });
          updateVideo.run(...mapped, video.id);
        }
      }
      db.prepare(`
      UPDATE settings SET
        prefix = COALESCE(?, prefix),
        separator = COALESCE(?, separator),
        date_format = COALESCE(?, date_format),
        include_product_id = COALESCE(?, include_product_id),
        sequence_number = COALESCE(?, sequence_number),
        storage_root = COALESCE(?, storage_root),
        updated_at = datetime('now')
      WHERE id = 'default'
    `).run(
      prefix ?? null,
      separator ?? null,
      date_format ?? null,
      include_product_id !== undefined ? (include_product_id ? 1 : 0) : null,
      sequence_number ?? null,
      requestedRoot
    );
      db.exec('COMMIT');
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) db.exec('ROLLBACK');
      if (moved) fs.renameSync(newRoot, oldRoot);
      if (removedEmptyTarget) fs.mkdirSync(newRoot);
      throw error;
    }

    const preview = previewOutputFilename({
      prefix,
      separator,
      date_format,
      include_product_id,
      sequence_number,
    });

    return NextResponse.json({
      success: true,
      message: 'บันทึกการตั้งค่าเรียบร้อย',
      preview,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save settings'
    }, { status: 500 });
  }
}
