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
      tiktok_api_mode: string;
      tiktok_api_url: string;
      tiktok_access_token: string;
      tiktok_cookie: string;
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
        ...settings,
        include_product_id: Boolean(settings.include_product_id),
        tiktok_cookie: settings.tiktok_cookie || '',
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
      tiktok_api_mode,
      tiktok_api_url,
      tiktok_access_token,
      tiktok_cookie,
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
        tiktok_api_mode = COALESCE(?, tiktok_api_mode),
        tiktok_api_url = COALESCE(?, tiktok_api_url),
        tiktok_access_token = COALESCE(?, tiktok_access_token),
        tiktok_cookie = COALESCE(?, tiktok_cookie),
        updated_at = datetime('now')
      WHERE id = 'default'
    `).run(
      prefix ?? null,
      separator ?? null,
      date_format ?? null,
      include_product_id !== undefined ? (include_product_id ? 1 : 0) : null,
      sequence_number ?? null,
      storage_root ?? null,
      tiktok_api_mode ?? null,
      tiktok_api_url ?? null,
      tiktok_access_token ?? null,
      tiktok_cookie ?? null
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
