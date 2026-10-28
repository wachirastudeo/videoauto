import { getDb } from './db';
import fs from 'fs';
import path from 'path';

export interface NamingSettings {
  prefix: string;
  separator: string;
  date_format: 'YYYYMMDD' | 'YYMMDD' | 'NONE';
  include_product_id: boolean;
  sequence_number: number;
}

export function getNamingSettings(): NamingSettings {
  const db = getDb();
  const row = db.prepare(`
    SELECT prefix, separator, date_format, include_product_id, sequence_number
    FROM settings WHERE id = 'default'
  `).get() as {
    prefix: string;
    separator: string;
    date_format: string;
    include_product_id: number;
    sequence_number: number;
  };

  return {
    prefix: row?.prefix || 'AFF',
    separator: row?.separator || '_',
    date_format: (row?.date_format as NamingSettings['date_format']) || 'YYYYMMDD',
    include_product_id: Boolean(row?.include_product_id),
    sequence_number: row?.sequence_number || 1,
  };
}

export function formatCurrentDate(format: 'YYYYMMDD' | 'YYMMDD' | 'NONE'): string {
  if (format === 'NONE') return '';
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const yy = yyyy.slice(-2);
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');

  if (format === 'YYMMDD') {
    return `${yy}${mm}${dd}`;
  }
  return `${yyyy}${mm}${dd}`;
}

export function previewOutputFilename(customSettings?: Partial<NamingSettings>, sampleProductId = '17294829103982'): string {
  const current = getNamingSettings();
  const cfg = { ...current, ...customSettings };
  const parts: string[] = [];

  if (cfg.prefix) parts.push(cfg.prefix);

  const dateStr = formatCurrentDate(cfg.date_format);
  if (dateStr) parts.push(dateStr);

  if (cfg.include_product_id && sampleProductId) {
    parts.push(sampleProductId);
  }

  const seqStr = cfg.sequence_number.toString().padStart(3, '0');
  parts.push(seqStr);

  return `${parts.join(cfg.separator)}.mp4`;
}

/**
 * สร้างชื่อไฟล์ Output ถัดไป และอัปเดต sequence number ในฐานข้อมูลอย่างปลอดภัย (Atomic)
 */
export function generateNextOutputFilename(outputDir: string, platformProductId?: string): { filename: string; fullPath: string } {
  const db = getDb();

  return db.transaction(() => {
    const row = db.prepare(`
      SELECT prefix, separator, date_format, include_product_id, sequence_number
      FROM settings WHERE id = 'default'
    `).get() as {
      prefix: string;
      separator: string;
      date_format: 'YYYYMMDD' | 'YYMMDD' | 'NONE';
      include_product_id: number;
      sequence_number: number;
    };

    let seq = row.sequence_number;
    let filename = '';
    let targetPath = '';

    // Loop หาชื่อที่ยังไม่มีไฟล์อยู่จริงบนดิสก์
    while (true) {
      const parts: string[] = [];
      if (row.prefix) parts.push(row.prefix);

      const dateStr = formatCurrentDate(row.date_format);
      if (dateStr) parts.push(dateStr);

      if (row.include_product_id && platformProductId) {
        parts.push(platformProductId);
      }

      parts.push(seq.toString().padStart(3, '0'));
      filename = `${parts.join(row.separator)}.mp4`;
      targetPath = path.join(outputDir, filename);

      if (!fs.existsSync(targetPath)) {
        break;
      }
      seq++;
    }

    // อัปเดต sequence ถัดไปใน DB
    db.prepare('UPDATE settings SET sequence_number = ? WHERE id = ?').run(seq + 1, 'default');

    return {
      filename,
      fullPath: targetPath,
    };
  })();
}
