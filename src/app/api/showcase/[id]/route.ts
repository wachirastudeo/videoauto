import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (req.headers.get('origin') !== req.nextUrl.origin) {
    return NextResponse.json({ success: false, error: 'Invalid origin' }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json() as { hidden?: boolean };
  if (typeof body.hidden !== 'boolean') {
    return NextResponse.json({ success: false, error: 'Invalid visibility' }, { status: 400 });
  }
  const db = getDb();
  const result = db.prepare("UPDATE showcase_products SET hidden_locally = ?, updated_at = datetime('now') WHERE id = ? AND sync_source = 'studio'").run(body.hidden ? 1 : 0, id);
  if (!result.changes) return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
