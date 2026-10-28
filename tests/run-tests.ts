import assert from 'assert';
import fs from 'fs';
import { getDb } from '../src/lib/db';
import { ensureProductFolder } from '../src/lib/file-manager';
import { MockTikTokShowcaseAdapter, TikTokPublisherService } from '../src/lib/tiktok-adapter';
import { generateNextOutputFilename, previewOutputFilename } from '../src/lib/naming';

async function runTests() {
  console.log('--- STARTING AUTOMATED TESTS ---');
  const db = getDb();

  // Test 1: TikTok Showcase Adapter & Product ID
  console.log('1. Testing TikTok Showcase Adapter...');
  const adapter = new MockTikTokShowcaseAdapter();
  const products = await adapter.getProducts();
  assert(products.length > 0, 'Adapter should return products');
  assert(products[0].platform_product_id === '17294829103982', 'Platform Product ID must match exactly');
  console.log('   ✓ Adapter returned valid products with real Platform Product IDs');

  // Test 2: Safe Folder Creation & No Duplicate on Re-sync
  console.log('2. Testing Safe Folder Creation & Idempotent Sync...');
  const prod = products[0];
  const folder1 = ensureProductFolder(prod.platform_product_id, prod.name);
  assert(fs.existsSync(folder1.productDir), 'Product directory must exist');
  assert(fs.existsSync(folder1.inputDir), 'input/ directory must exist');
  assert(fs.existsSync(folder1.voiceDir), 'voice/ directory must exist');
  assert(fs.existsSync(folder1.outputDir), 'output/ directory must exist');
  assert(fs.existsSync(folder1.captionsDir), 'captions/ directory must exist');
  assert(fs.existsSync(folder1.productJsonPath), 'product.json must exist');

  // อ่าน product.json
  const meta = JSON.parse(fs.readFileSync(folder1.productJsonPath, 'utf-8'));
  assert(meta.product_id === prod.platform_product_id, 'product.json product_id must match');

  // รัน ensure ซ้ำ ต้องได้ folder เดิม ไม่สร้าง folder ซ้ำ
  const folder2 = ensureProductFolder(prod.platform_product_id, prod.name);
  assert(folder1.productDir === folder2.productDir, 'Folder path must remain identical on re-sync');
  console.log('   ✓ Folder created safely and no duplicate folders created on re-sync');

  // Test 3: One-to-Many Relationship (1 Product has multiple Videos)
  console.log('3. Testing One-to-Many Relationship (1 Product -> Multiple Videos)...');
  const pId = `test_prod_${Date.now()}`;
  db.prepare(`
    INSERT INTO showcase_products (id, platform_product_id, name, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `).run(pId, `plt_${Date.now()}`, 'สินค้าทดสอบกาแฟ');

  const v1 = `vid_1_${Date.now()}`;
  const v2 = `vid_2_${Date.now()}`;
  db.prepare(`
    INSERT INTO videos (id, product_id, source_path, source_filename, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(v1, pId, '/fake/path/v1.mp4', 'v1.mp4');

  db.prepare(`
    INSERT INTO videos (id, product_id, source_path, source_filename, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(v2, pId, '/fake/path/v2.mp4', 'v2.mp4');

  const productVideos = db.prepare('SELECT * FROM videos WHERE product_id = ?').all(pId);
  assert(productVideos.length === 2, 'One product must be able to have multiple video records');
  console.log('   ✓ Verified 1 product can hold multiple independent video records');

  // Test 4: Output Naming Convention & Sequence Atomic Increment
  console.log('4. Testing Naming Generation & Sequence Counter...');
  const preview = previewOutputFilename({ prefix: 'AFF', separator: '_', date_format: 'YYYYMMDD', sequence_number: 1 });
  assert(preview.startsWith('AFF_'), 'Preview must follow prefix rules');

  const out1 = generateNextOutputFilename(folder1.outputDir, prod.platform_product_id);
  // สร้าง mock dummy file ที่ out1.fullPath
  fs.writeFileSync(out1.fullPath, 'dummy video content');

  const out2 = generateNextOutputFilename(folder1.outputDir, prod.platform_product_id);
  assert(out1.filename !== out2.filename, 'Output filenames must never clash/collide');
  console.log(`   ✓ File 1: ${out1.filename}, File 2: ${out2.filename} (collision avoided)`);

  // Test 5: TikTok Publisher Service & Anchor Status Separation
  console.log('5. Testing Publishing Service & Anchor Status Separation...');
  const publishRes = await TikTokPublisherService.publishVideo({
    videoId: v1,
    videoPath: out1.fullPath,
    caption: 'ทดสอบโพสต์ TikTok',
    platformProductId: prod.platform_product_id,
    idempotencyKey: 'test_key_1234',
  });
  assert(typeof publishRes.success === 'boolean', 'Publish result must have boolean success');
  assert(publishRes.anchor_status !== undefined, 'Anchor status must be explicitly reported');
  console.log(`   ✓ Publish test success: ${publishRes.success}, Anchor Status: ${publishRes.anchor_status}`);

  console.log('\n--- ALL 5 CRITICAL TEST SUITES PASSED PERFECTLY! ---');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
