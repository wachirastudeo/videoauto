# TikTok Affiliate Manager — Web Application

เว็บแอปพลิเคชันสำหรับจัดการคลิป TikTok Affiliate ตัดต่อด้วย FFmpeg เชื่อมโยงสินค้า TikTok Showcase และเตรียมคลิปสำหรับเผยแพร่แยกรายวิดีโอ

## ✨ ไฮไลต์และคุณสมบัติหลัก

1. **Dashboard แยก 1 รายการต่อ 1 วิดีโอ:**
   - หนึ่งสินค้า (Product) สามารถมีหลายวิดีโอ (Videos)
   - แต่ละคลิปมีอิสระในการจับคู่เสียงพากย์ แคปชั่น สถานะตัดต่อ และประวัติอัปโหลด
2. **TikTok Showcase Sync & โฟลเดอร์ในเครื่อง:**
   - ซิงก์สินค้า Showcase ดึงรูปภาพ ชื่อ ราคา และ **Product ID จริงจาก API**
   - สร้างโครงสร้างโฟลเดอร์ในเครื่องอย่างปลอดภัย:
     - `storage/TikTok-Affiliate/products/<safe-name>__<product-id>/`
       - `product.json` (metadata สินค้า)
       - `input/` (โฟลเดอร์สำหรับใส่วิดีโอต้นฉบับ)
       - `voice/` (โฟลเดอร์สำหรับใส่เสียงพากย์)
       - `output/` (โฟลเดอร์เก็บไฟล์ที่ตัดเสร็จแล้ว)
       - `captions/` (โฟลเดอร์เก็บแคปชั่น)
   - ป้องกันการสร้างสินค้าและโฟลเดอร์ซ้ำเมื่อ Product ID เดิม
3. **ระบบสแกนไฟล์และ Auto-match:**
   - เมื่อนำไฟล์วิดีโอใส่ใน `input/` สามารถกดปุ่ม **"สแกนโฟลเดอร์เครื่อง"**
   - ระบบจะตรวจจับไฟล์ใหม่ คำนวณ Hash ป้องกันไฟล์ซ้ำ และจับคู่วิดีโอกับสินค้าทันที
   - ค้นหาไฟล์เสียงพากย์ที่ชื่อตรงกันใน `voice/` เพื่อจับคู่อัตโนมัติ
4. **FFmpeg Video Processing:**
   - แปลงวิดีโอเป็นแนวตั้ง 9:16 (1080x1920)
   - ผสมเสียงพากย์เข้ากับเสียงต้นฉบับ ปรับ Balance ระดับเสียง
   - ดึง Thumbnail อัตโนมัติสำหรับแสดงผลบน Dashboard
5. **Output Naming Rules (ระบบตั้งชื่อไฟล์ไม่ซ้ำ):**
   - กำหนด Prefix (เช่น `AFF`, `REVIEW`, `TIKTOK`)
   - กำหนด Separator (`_` หรือ `-`)
   - กำหนดรูปแบบวันที่ (`YYYYMMDD`, `YYMMDD` หรือไม่ใส่)
   - เลือกว่าจะใส่ Product ID ในชื่อไฟล์หรือไม่
   - Sequence Counter อัตโนมัติ (เช่น `001`, `002`) ทนทานต่อการประมวลผลพร้อมกัน และไม่เริ่มนับถอยหลังเมื่อรีสตาร์ท
6. **Publishing Queue:**
   - จัดคิวคลิปที่ตัดเสร็จและดาวน์โหลดเพื่อนำไปโพสต์บน TikTok ด้วยตนเอง
   - การเผยแพร่อัตโนมัติและการแนบสินค้า (Product Anchor) ยังไม่เชื่อมต่อ TikTok API; endpoint เผยแพร่ตอบ `501` และไม่เปลี่ยนสถานะคลิป

---

## 🚀 วิธีเปิดใช้งานระบบ (Local Development)

### ข้อกำหนดระบบ:
- Node.js v20+ หรือ v22/v23
- FFmpeg (ติดตั้งผ่าน `brew install ffmpeg` บน macOS หรือดาวน์โหลดบน Windows)

### ขั้นตอนการรัน:

```bash
# 1. ติดตั้ง Dependencies
npm install

# 2. รันโหมด Development
npm run dev

# หรือ Build & รันโหมด Production (แนะนำ)
npm run build
npm run start
```

เปิดเว็บเบราว์เซอร์ไปที่: **http://localhost:3000**

### Sync your signed-in TikTok Showcase

1. In normal Google Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this project's `chrome-extension/` folder. This one-time bridge can read your signed-in TikTok Showcase and send product data to the app running on `localhost:3000`. It does not copy cookies or tokens into the app.
2. Open `http://localhost:3000` in that same Chrome profile and select **Sync Showcase**. The bridge reads all Showcase pages and imports real product IDs. If TikTok needs login, it opens the Showcase page; sign in there and select **Sync Showcase** again.
3. If the Showcase tab was already open when you installed the extension, reload it once.

Product folders are created under `storage/TikTok-Affiliate/products/` by default. In **Settings → Product storage folder**, enter a new path to move existing product folders and update their video paths. Choose a new path on the same drive.

The bridge uses TikTok Studio's page API, which may change. Sync reports errors instead of substituting mock products. The local app must be trusted because it receives your product list.

---

## 📁 โครงสร้างโปรเจกต์

```text
├── app-data/
│   └── database.sqlite      # ฐานข้อมูล SQLite ในเครื่อง (ไม่ต้องติดตั้ง Database Server ภายนอก)
├── storage/
│   └── TikTok-Affiliate/
│       └── products/        # โฟลเดอร์สินค้าและวิดีโอตามสเปก
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── showcase/    # API ซิงก์สินค้า Showcase
│   │   │   ├── videos/      # API จัดการวิดีโอ, สแกนไฟล์, ตัดต่อ FFmpeg
│   │   │   ├── publishing/  # API คิวงาน, ประวัติ และสถานะการเชื่อมต่อเผยแพร่
│   │   │   ├── settings/    # API บันทึก Naming Rules & TikTok Config
│   │   │   └── media/       # Media streaming route สำหรับเล่นวิดีโอบนเว็บ
│   │   ├── page.tsx         # Dashboard UI เต็มรูปแบบ (Dashboard, Showcase, Queue, History, Settings)
│   │   └── layout.tsx
│   └── lib/
│       ├── db.ts            # Node.js Built-in SQLite connection & Schemas
│       ├── file-manager.ts  # Safe Folder Management, product.json, File Scanner & Hash
│       ├── naming.ts        # Atomic Output Naming Generator
│       ├── ffmpeg.ts        # FFmpeg Video Processing & Thumbnail extraction
│       └── tiktok-adapter.ts# TikTok Showcase adapters และ publisher จำลองสำหรับการพัฒนา
```
