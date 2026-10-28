import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin !== req.nextUrl.origin || !['localhost', '127.0.0.1'].includes(req.nextUrl.hostname)) {
    return NextResponse.json({ success: false, error: 'Local app only' }, { status: 403 });
  }
  if (process.platform !== 'darwin') {
    return NextResponse.json({ success: false, error: 'Folder picker is available on macOS' }, { status: 501 });
  }
  try {
    const { stdout } = await execFileAsync('/usr/bin/osascript', [
      '-e', 'tell application "Finder" to activate',
      '-e', 'tell application "Finder" to get POSIX path of (choose folder with prompt "Choose product storage folder")',
    ], { timeout: 120000 });
    return NextResponse.json({ success: true, path: path.resolve(stdout.trim()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Folder picker failed';
    if (message.includes('User canceled') || message.includes('(-128)')) {
      return NextResponse.json({ success: false, cancelled: true });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
