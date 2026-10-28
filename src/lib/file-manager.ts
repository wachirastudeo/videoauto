import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDb } from './db';

export interface FolderStructure {
  productDir: string;
  inputDir: string;
  voiceDir: string;
  outputDir: string;
  captionsDir: string;
  productJsonPath: string;
}

export function sanitizeFolderName(name: string): string {
  // ลบอักขระที่ไม่ปลอดภัยสำหรับชื่อโฟลเดอร์ ข้ามช่องว่างและตัวอักษรภาษาไทย/อังกฤษ/ตัวเลข
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60); // จำกัดความยาว
}

export function getStorageRoot(): string {
  const db = getDb();
  const row = db.prepare('SELECT storage_root FROM settings WHERE id = ?').get('default') as { storage_root: string } | undefined;
  const root = row?.storage_root || './storage/TikTok-Affiliate';
  const resolved = path.isAbsolute(root) ? root : path.join(process.cwd(), root);
  return resolved;
}

export function ensureProductFolder(platformProductId: string, productName: string): FolderStructure {
  const root = getStorageRoot();
  const productsDir = path.join(root, 'products');

  if (!fs.existsSync(productsDir)) {
    fs.mkdirSync(productsDir, { recursive: true });
  }

  // ค้นหาโฟลเดอร์ที่มี Product ID นี้อยู่แล้วเพื่อป้องกันการสร้างโฟลเดอร์ซ้ำ
  const existingEntries = fs.readdirSync(productsDir, { withFileTypes: true });
  const matched = existingEntries.find((entry) => {
    return entry.isDirectory() && entry.name.endsWith(`__${platformProductId}`);
  });

  let folderName: string;
  if (matched) {
    folderName = matched.name;
  } else {
    const safeName = sanitizeFolderName(productName);
    folderName = `${safeName}__${platformProductId}`;
  }

  const productDir = path.join(productsDir, folderName);
  const inputDir = path.join(productDir, 'input');
  const voiceDir = path.join(productDir, 'voice');
  const outputDir = path.join(productDir, 'output');
  const captionsDir = path.join(productDir, 'captions');
  const productJsonPath = path.join(productDir, 'product.json');

  [inputDir, voiceDir, outputDir, captionsDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // สร้างหรืออัปเดต product.json
  const metadata = {
    product_id: platformProductId,
    product_name: productName,
    source: "tiktok_showcase",
    last_synced_at: new Date().toISOString()
  };

  fs.writeFileSync(productJsonPath, JSON.stringify(metadata, null, 2), 'utf-8');

  return {
    productDir,
    inputDir,
    voiceDir,
    outputDir,
    captionsDir,
    productJsonPath,
  };
}

export function calculateFileHash(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * สแกนโฟลเดอร์ input/ ของสินค้าทั้งหมด และสร้าง Video records แยกสำหรับแต่ละคลิป
 */
export function scanProductVideos(): { scanned: number; added: number } {
  const db = getDb();
  const root = getStorageRoot();
  const productsDir = path.join(root, 'products');

  if (!fs.existsSync(productsDir)) {
    return { scanned: 0, added: 0 };
  }

  const products = db.prepare('SELECT id, platform_product_id, name, folder_path FROM showcase_products').all() as Array<{
    id: string;
    platform_product_id: string;
    name: string;
    folder_path: string;
  }>;

  let totalScanned = 0;
  let totalAdded = 0;

  for (const product of products) {
    let folder = product.folder_path;
    if (!folder || !fs.existsSync(folder)) {
      // สร้างหรือค้นหาโฟลเดอร์
      const struct = ensureProductFolder(product.platform_product_id, product.name);
      folder = struct.productDir;
      db.prepare('UPDATE showcase_products SET folder_path = ? WHERE id = ?').run(folder, product.id);
    }

    const inputDir = path.join(folder, 'input');
    const voiceDir = path.join(folder, 'voice');
    const captionsDir = path.join(folder, 'captions');

    if (!fs.existsSync(inputDir)) continue;

    const files = fs.readdirSync(inputDir);
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];

    for (const filename of files) {
      const ext = path.extname(filename).toLowerCase();
      if (!videoExtensions.includes(ext)) continue;

      totalScanned++;
      const fullPath = path.join(inputDir, filename);
      const hash = calculateFileHash(fullPath);

      // ตรวจสอบว่ามีไฟล์นี้แล้วหรือไม่
      const existing = db.prepare('SELECT id FROM videos WHERE source_path = ? OR file_hash = ?').get(fullPath, hash);

      if (!existing) {
        const videoId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        // ตรวจหาไฟล์เสียงพากย์ที่ชื่อตรงกัน
        const baseName = path.basename(filename, ext);
        const voiceExts = ['.mp3', '.wav', '.m4a', '.aac'];
        let matchedVoicePath: string | null = null;
        for (const vext of voiceExts) {
          const testVoice = path.join(voiceDir, `${baseName}${vext}`);
          if (fs.existsSync(testVoice)) {
            matchedVoicePath = testVoice;
            break;
          }
        }

        // ตรวจหาแคปชั่นที่บันทึกไว้
        const captionFile = path.join(captionsDir, `${baseName}.txt`);
        let defaultCaption = `รีวิว ${product.name} คุ้มค่า คุณภาพดี ห้ามพลาด! #TikTokShopครีเอเตอร์ #นายหน้าTikTok #ช้อปกันวันละนิด`;
        if (fs.existsSync(captionFile)) {
          defaultCaption = fs.readFileSync(captionFile, 'utf-8');
        }

        db.prepare(`
          INSERT INTO videos (
            id, product_id, source_path, source_filename, voice_path, caption_text, file_hash,
            edit_status, upload_status, anchor_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ready_to_edit', 'idle', 'not_started', datetime('now'), datetime('now'))
        `).run(
          videoId,
          product.id,
          fullPath,
          filename,
          matchedVoicePath,
          defaultCaption,
          hash
        );

        totalAdded++;
      }
    }
  }

  return { scanned: totalScanned, added: totalAdded };
}
