import { NextRequest, NextResponse } from 'next/server';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const location = path.join(process.cwd(), 'app-data', 'gemini-key');
export async function GET() {
  const key = process.env.GEMINI_API_KEY || await readFile(location, 'utf8').catch(() => '');
  return NextResponse.json({ configured: Boolean(key.trim()) });
}
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ error: 'Same-origin request required' }, { status: 403 });
  const { key } = await req.json();
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(key.trim())) return NextResponse.json({ error: 'Invalid API key' }, { status: 400 });
  await mkdir(path.dirname(location), { recursive: true });
  await writeFile(location, key.trim(), { mode: 0o600 });
  return NextResponse.json({ success: true });
}
