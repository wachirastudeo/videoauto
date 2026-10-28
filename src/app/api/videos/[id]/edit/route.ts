import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateNextOutputFilename } from '@/lib/naming';
import { processVideoWithFFmpeg, generateThumbnail, isFfmpegAvailable } from '@/lib/ffmpeg';
import { ensureProductFolder } from '@/lib/file-manager';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { voiceVolume, originalVolume } = body;

    const db = getDb();
    const video = db.prepare(`
      SELECT
        v.*,
        p.name as product_name,
        p.platform_product_id
      FROM videos v
      LEFT JOIN showcase_products p ON v.product_id = p.id
      WHERE v.id = ?
    `).get(id) as {
      id: string;
      product_id: string;
      source_path: string;
      source_filename: string;
      voice_path: string | null;
      product_name?: string;
      platform_product_id?: string;
    } | undefined;

    if (!video) {
      return NextResponse.json({ success: false, error: 'Video not found' }, { status: 404 });
    }

    if (!fs.existsSync(video.source_path)) {
      return NextResponse.json({ success: false, error: 'Source video file does not exist on disk' }, { status: 400 });
    }

    // ระบุ output folder
    let outputDir: string;
    if (video.platform_product_id && video.product_name) {
      const folderStruct = ensureProductFolder(video.platform_product_id, video.product_name);
      outputDir = folderStruct.outputDir;
    } else {
      outputDir = path.join(path.dirname(video.source_path), '..', 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
    }

    // สร้างชื่อไฟล์ Output ตาม Naming Rule อย่างปลอดภัย
    const { filename: outputFilename, fullPath: outputFilePath } = generateNextOutputFilename(
      outputDir,
      video.platform_product_id
    );

    // ปรับสถานะเป็น 'editing'
    db.prepare('UPDATE videos SET edit_status = ?, updated_at = datetime(\'now\') WHERE id = ?').run('editing', id);

    let processSuccess = false;
    let processError: string | undefined;

    if (isFfmpegAvailable()) {
      const result = await processVideoWithFFmpeg({
        inputPath: video.source_path,
        outputPath: outputFilePath,
        voicePath: video.voice_path,
        cropToVertical: true,
        voiceVolume: voiceVolume ?? 1.2,
        originalVolume: originalVolume ?? 0.3,
      });

      processSuccess = result.success;
      processError = result.error;
    } else {
      processError = 'FFmpeg is required to edit videos. Install FFmpeg and try again.';
    }

    if (!processSuccess) {
      db.prepare('UPDATE videos SET edit_status = ?, updated_at = datetime(\'now\') WHERE id = ?').run('failed', id);
      return NextResponse.json({
        success: false,
        error: processError || 'Video editing failed',
      }, { status: 500 });
    }

    // สกัด thumbnail จาก output
    const thumbPath = await generateThumbnail(outputFilePath, outputDir);

    // อัปเดตข้อมูลไฟล์ output ในฐานข้อมูล
    db.prepare(`
      UPDATE videos SET
        output_path = ?,
        output_filename = ?,
        thumbnail_path = COALESCE(?, thumbnail_path),
        edit_status = 'approved',
        updated_at = datetime('now')
      WHERE id = ?
    `).run(outputFilePath, outputFilename, thumbPath, id);

    return NextResponse.json({
      success: true,
      outputFilename,
      outputFilePath,
      message: `ตัดต่อวิดีโอสำเร็จเป็น ${outputFilename}`,
    });
  } catch (error) {
    console.error('Edit error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error processing video'
    }, { status: 500 });
  }
}
