import { spawn, execSync, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface VideoProcessOptions {
  inputPath: string;
  outputPath: string;
  voicePath?: string | null;
  cropToVertical?: boolean; // ปรับเป็น 9:16 (1080x1920)
  voiceVolume?: number; // 0.0 - 2.0 (default 1.0)
  originalVolume?: number; // 0.0 - 1.0 (default 0.3 เมื่อมีเสียงพากย์)
}

export function isFfmpegAvailable(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * ดึงภาพ Thumbnail 1 เฟรมจากวิดีโอ
 */
export async function generateThumbnail(videoPath: string, outputDir: string): Promise<string | null> {
  if (!isFfmpegAvailable() || !fs.existsSync(videoPath)) {
    return null;
  }

  const thumbFilename = `thumb_${path.basename(videoPath, path.extname(videoPath))}.jpg`;
  const thumbPath = path.join(outputDir, thumbFilename);

  return new Promise((resolve) => {
    const args = [
      '-y',
      '-ss', '00:00:01',
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      '-vf', 'scale=480:-1',
      thumbPath,
    ];

    const proc = spawn('ffmpeg', args);
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(thumbPath)) {
        resolve(thumbPath);
      } else {
        resolve(null);
      }
    });
    proc.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * แปลงวิดีโอ 9:16 และผสมเสียงพากย์ด้วย FFmpeg
 */
export async function processVideoWithFFmpeg(options: VideoProcessOptions): Promise<{ success: boolean; error?: string }> {
  if (!isFfmpegAvailable()) {
    return { success: false, error: 'FFmpeg is not installed or not available in PATH' };
  }

  if (!fs.existsSync(options.inputPath)) {
    return { success: false, error: 'Input video file does not exist' };
  }

  const outDir = path.dirname(options.outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const args: string[] = ['-y', '-i', options.inputPath];

  // ถ้ามีเสียงพากย์ ให้ใส่ input ที่สอง
  const hasVoice = options.voicePath && fs.existsSync(options.voicePath);
  const hasOriginalAudio = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index',
    '-of', 'csv=p=0', options.inputPath,
  ], { encoding: 'utf8' }).stdout?.trim().length > 0;
  if (hasVoice && options.voicePath) {
    args.push('-i', options.voicePath);
  }

  // Filter complex สำหรับขนาด 9:16 (1080x1920)
  // Scale ให้พอดีแล้ว pad สีดำรอบข้าง หรือ scale/crop
  const scaleFilter = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black';

  if (hasVoice) {
    const origVol = options.originalVolume ?? 0.3;
    const vVol = options.voiceVolume ?? 1.2;
    // ผสม audio stream [0:a] และ [1:a]
    args.push('-filter_complex', hasOriginalAudio
      ? `[0:v]${scaleFilter}[v];[0:a]volume=${origVol}[a0];[1:a]volume=${vVol}[a1];[a0][a1]amix=inputs=2:duration=first[a]`
      : `[0:v]${scaleFilter}[v];[1:a]volume=${vVol}[a]`,
    '-map', '[v]', '-map', '[a]', '-c:a', 'aac');
  } else {
    args.push(
      '-vf', scaleFilter,
      '-c:a', 'aac'
    );
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
    options.outputPath
  );

  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(options.outputPath)) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: stderr.slice(-500) || `FFmpeg process exited with code ${code}`,
        });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}
