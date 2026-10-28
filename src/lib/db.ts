import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'app-data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'database.sqlite');

export interface ExtendedDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  transaction<T>(fn: () => T): () => T;
}

let dbInstance: ExtendedDatabase | null = null;

export function getDb(): ExtendedDatabase {
  if (!dbInstance) {
    const rawDb = new DatabaseSync(DB_PATH);
    rawDb.exec('PRAGMA journal_mode = WAL;');

    dbInstance = {
      exec(sql: string) {
        rawDb.exec(sql);
      },
      prepare(sql: string) {
        return rawDb.prepare(sql);
      },
      transaction<T>(fn: () => T) {
        return () => {
          rawDb.exec('BEGIN TRANSACTION;');
          try {
            const result = fn();
            rawDb.exec('COMMIT;');
            return result;
          } catch (error) {
            rawDb.exec('ROLLBACK;');
            throw error;
          }
        };
      },
    };

    initTables(dbInstance);
  }
  return dbInstance;
}

function initTables(db: ExtendedDatabase) {
  // Showcase Products
  db.exec(`
    CREATE TABLE IF NOT EXISTS showcase_products (
      id TEXT PRIMARY KEY,
      platform_product_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      image_url TEXT,
      price REAL,
      raw_api_data TEXT,
      sync_source TEXT DEFAULT 'mock',
      folder_path TEXT,
      is_available INTEGER DEFAULT 1,
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  try {
    db.exec("ALTER TABLE showcase_products ADD COLUMN sync_source TEXT DEFAULT 'mock';");
  } catch {
    // column already exists
  }

  // Videos (One product to many videos)
  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      source_path TEXT NOT NULL,
      source_filename TEXT NOT NULL,
      output_path TEXT,
      output_filename TEXT,
      voice_path TEXT,
      caption_text TEXT,
      file_hash TEXT,
      thumbnail_path TEXT,
      edit_status TEXT DEFAULT 'ready_to_edit',
      upload_status TEXT DEFAULT 'idle',
      anchor_status TEXT DEFAULT 'not_started',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(product_id) REFERENCES showcase_products(id) ON DELETE SET NULL
    );
  `);

  // Publishing Jobs
  db.exec(`
    CREATE TABLE IF NOT EXISTS publishing_jobs (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt_count INTEGER DEFAULT 0,
      idempotency_key TEXT UNIQUE NOT NULL,
      platform_upload_id TEXT,
      platform_post_id TEXT,
      last_error TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(video_id) REFERENCES videos(id),
      FOREIGN KEY(product_id) REFERENCES showcase_products(id)
    );
  `);

  // Publishing History
  db.exec(`
    CREATE TABLE IF NOT EXISTS publishing_history (
      id TEXT PRIMARY KEY,
      publishing_job_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      request_started_at TEXT NOT NULL,
      response_received_at TEXT,
      result TEXT NOT NULL,
      platform_upload_id TEXT,
      platform_post_id TEXT,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(publishing_job_id) REFERENCES publishing_jobs(id)
    );
  `);

  // Settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      prefix TEXT DEFAULT 'AFF',
      separator TEXT DEFAULT '_',
      date_format TEXT DEFAULT 'YYYYMMDD',
      include_product_id INTEGER DEFAULT 0,
      sequence_number INTEGER DEFAULT 1,
      storage_root TEXT DEFAULT './storage/TikTok-Affiliate',
      tiktok_api_mode TEXT DEFAULT 'studio',
      tiktok_api_url TEXT DEFAULT '',
      tiktok_access_token TEXT DEFAULT '',
      tiktok_cookie TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );
  `);

  // Auto-migration: ensure tiktok_cookie column exists
  try {
    db.exec(`ALTER TABLE settings ADD COLUMN tiktok_cookie TEXT DEFAULT '';`);
  } catch {
    // column already exists
  }

  // Insert default settings if not exists
  const existing = db.prepare('SELECT id FROM settings WHERE id = ?').get('default');
  if (!existing) {
    db.prepare(`
      INSERT INTO settings (
        id, prefix, separator, date_format, include_product_id, sequence_number, storage_root, tiktok_api_mode, updated_at
      ) VALUES ('default', 'AFF', '_', 'YYYYMMDD', 0, 1, './storage/TikTok-Affiliate', 'mock', datetime('now'))
    `).run();
  }
}
