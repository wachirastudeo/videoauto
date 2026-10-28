import { NextResponse } from 'next/server';
import { scanProductVideos } from '@/lib/file-manager';

export async function POST() {
  try {
    const result = scanProductVideos();
    return NextResponse.json({
      success: true,
      scanned: result.scanned,
      added: result.added,
      message: `สแกนเสร็จสิ้น: ตรวจพบทั้งหมด ${result.scanned} ไฟล์, เพิ่มวิดีโอใหม่ ${result.added} รายการ`,
    });
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error scanning product videos',
    }, { status: 500 });
  }
}
