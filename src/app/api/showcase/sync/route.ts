import { NextRequest, NextResponse } from 'next/server';
import { scanProductVideos } from '@/lib/file-manager';
import { readExistingChromeShowcase } from '@/lib/chrome-showcase';
import { POST as importProducts } from '../import/route';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin || !['localhost', '127.0.0.1'].includes(req.nextUrl.hostname)) return NextResponse.json({ success: false, error: 'Local app only' }, { status: 403 });
  try {
    const products = await readExistingChromeShowcase();
    const imported = await importProducts(new NextRequest(new URL('/api/showcase/import', req.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ products }) }));
    const result = await imported.json();
    if (!result.success) return NextResponse.json(result, { status: imported.status });
    const scan = scanProductVideos();
    return NextResponse.json({ ...result, ...scan, message: `Synced ${products.length} products, removed ${result.removedCount} unavailable products from view and prepared folders. Scanned ${scan.scanned} videos, added ${scan.added} new clips.` });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Showcase sync failed' }, { status: 500 });
  }
}
