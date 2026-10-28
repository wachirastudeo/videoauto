import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { previewOutputFilename } from '@/lib/naming';

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
      storage_root ?? null
    );

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
