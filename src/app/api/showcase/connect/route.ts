import { NextRequest, NextResponse } from 'next/server';
import { getShowcaseBrowser } from '@/lib/showcase-browser';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin || !['localhost', '127.0.0.1'].includes(req.nextUrl.hostname)) return NextResponse.json({ error: 'Local app only' }, { status: 403 });
  try {
    const context = await getShowcaseBrowser();
    const page = context.pages().find(page => page.url().startsWith('https://shop.tiktok.com/')) || context.pages()[0] || await context.newPage();
    if (!page.url().startsWith('https://shop.tiktok.com/')) await page.goto('https://shop.tiktok.com/', { waitUntil: 'domcontentloaded' });
    await page.bringToFront();
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Could not connect TikTok browser' }, { status: 500 }); }
}
