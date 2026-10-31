import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ensureProductFolder } from '@/lib/file-manager';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ success: false, error: 'Same-origin request required' }, { status: 403 });
  try {
    const { id } = await params;
    const product = getDb().prepare('SELECT platform_product_id, name FROM showcase_products WHERE id = ?').get(id) as { platform_product_id: string; name: string } | undefined;
    if (!product) return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    const data = await req.formData();
    const file = data.get('file');
    if (!(file instanceof File) || !file.size || file.size > 50 * 1024 * 1024) return NextResponse.json({ success: false, error: 'Recording must be between 1 byte and 50 MB' }, { status: 400 });
    const extension = ({ 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' } as Record<string, string>)[file.type.split(';')[0]];
    if (!extension) return NextResponse.json({ success: false, error: 'Unsupported recording format' }, { status: 400 });
    const folder = ensureProductFolder(product.platform_product_id, product.name);
    const filename = `voice_${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}.${extension}`;
    const savedPath = path.join(folder.voiceDir, filename);
    await writeFile(savedPath, Buffer.from(await file.arrayBuffer()), { flag: 'wx' });
    return NextResponse.json({ success: true, filename, path: savedPath });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not save recording' }, { status: 500 });
  }
}
