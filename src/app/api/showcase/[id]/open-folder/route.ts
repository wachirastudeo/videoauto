import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '@/lib/db';
import { getStorageRoot } from '@/lib/file-manager';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (req.headers.get('origin') !== req.nextUrl.origin || !['localhost', '127.0.0.1'].includes(req.nextUrl.hostname)) {
    return NextResponse.json({ success: false, error: 'Local app only' }, { status: 403 });
  }
  if (process.platform !== 'darwin') {
    return NextResponse.json({ success: false, error: 'Opening folders is available on macOS' }, { status: 501 });
  }

  const { id } = await params;
  const product = getDb().prepare('SELECT folder_path FROM showcase_products WHERE id = ?').get(id) as { folder_path: string | null } | undefined;
  if (!product?.folder_path) {
    return NextResponse.json({ success: false, error: 'Product folder not found' }, { status: 404 });
  }

  try {
    const productsRoot = fs.realpathSync(path.join(getStorageRoot(), 'products'));
    const folder = fs.realpathSync(product.folder_path);
    const relative = path.relative(productsRoot, folder);
    if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative) || !fs.statSync(folder).isDirectory()) {
      return NextResponse.json({ success: false, error: 'Invalid product folder' }, { status: 400 });
    }
    await execFileAsync('/usr/bin/open', [folder], { timeout: 10000 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Could not open folder' }, { status: 500 });
  }
}
