import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { getStorageRoot } from '@/lib/file-manager';

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: pathSegments } = await params;
    const requestedPath = path.resolve('/', ...pathSegments);
    const storageRoot = path.resolve(getStorageRoot());
    const realRoot = fs.existsSync(storageRoot) ? fs.realpathSync(storageRoot) : storageRoot;
    if (!requestedPath.startsWith(storageRoot + path.sep)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // ตรวจสอบว่าไฟล์มีอยู่จริง
    if (!fs.existsSync(requestedPath)) {
      return new NextResponse('File not found', { status: 404 });
    }
    if (!fs.realpathSync(requestedPath).startsWith(realRoot + path.sep)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const stat = fs.statSync(requestedPath);
    if (!stat.isFile()) {
      return new NextResponse('Not a file', { status: 400 });
    }

    const ext = path.extname(requestedPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    // รองรับ Range requests สำหรับการเล่นวิดีโอแบบ Seek ได้
    const range = req.headers.get('range');
    if (range) {
      if (!/^bytes=\d+-\d*$/.test(range)) {
        return new NextResponse('Invalid range', { status: 416 });
      }
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      if (start >= stat.size || end < start || end >= stat.size) {
        return new NextResponse('Invalid range', { status: 416 });
      }
      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(requestedPath, { start, end });
      const webStream = Readable.toWeb(fileStream);

      return new Response(webStream as unknown as BodyInit, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': contentType,
        },
      });
    }

    const fileStream = fs.createReadStream(requestedPath);
    const webStream = Readable.toWeb(fileStream);

    return new Response(webStream as unknown as BodyInit, {
      headers: {
        'Content-Length': stat.size.toString(),
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('Media streaming error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
