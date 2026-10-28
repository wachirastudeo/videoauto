export interface ProductShowcaseItem {
  platform_product_id: string;
  name: string;
  image_url: string;
  price: number;
  stock_num?: number;
  shop_name?: string;
  commission_rate?: number;
  raw_api_data?: Record<string, unknown>;
}

export interface TikTokShowcaseAdapter {
  getProducts(): Promise<ProductShowcaseItem[]>;
}

export interface PublishResult {
  success: boolean;
  platform_upload_id?: string;
  platform_post_id?: string;
  anchor_status: 'attached' | 'failed' | 'needs_manual_action' | 'unsupported' | 'pending';
  error_code?: string;
  error_message?: string;
  needs_verification?: boolean;
}

/**
 * 1. Endpoint ภายในของ TikTok Studio (ที่ Extension ใช้อยู่จริง)
 * URL: https://shop.tiktok.com/api/v1/streamer_desktop/showcase_product/list
 * ใช้ Cookie Session ของเบราว์เซอร์ที่ล็อกอินบัญชี TikTok Studio / Shop ไว้
 */
export class TikTokStudioInternalAdapter implements TikTokShowcaseAdapter {
  constructor(
    private cookieString: string,
    private apiUrl: string = 'https://shop.tiktok.com/api/v1/streamer_desktop/showcase_product/list',
    private count: number = 100,
    private offset: number = 0
  ) {}

  async getProducts(): Promise<ProductShowcaseItem[]> {
    if (!this.cookieString || !this.cookieString.trim()) {
      throw new Error(
        'กรุณาระบุ Cookie Session ของ TikTok Studio ในหน้าตั้งค่า (Settings) ก่อนเชื่อมต่อ'
      );
    }

    const targetUrl = new URL(this.apiUrl);
    targetUrl.searchParams.set('offset', String(this.offset));
    targetUrl.searchParams.set('count', String(this.count));

    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Cookie': this.cookieString.trim(),
        'Referer': 'https://shop.tiktok.com/streamer',
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'HTTP 401/403: Session หลุดหรือ Cookie หมดอายุ กรุณาเข้าสู่ระบบ TikTok Studio / TikTok Shop ในเบราว์เซอร์ใหม่ แล้วคัดลอก Cookie มาอัปเดต'
      );
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(
          'TikTok Rate Limit (429): กรุณาเว้นระยะห่างการดึงข้อมูล 1-2 ชั่วโมง มิฉะนั้นบัญชีอาจถูกบล็อกชั่วคราว'
        );
      }
      throw new Error(`TikTok Studio API Error: HTTP ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as {
      code?: number;
      message?: string;
      data?: {
        products?: Array<{
          product_id: string;
          title: string;
          format_available_price?: string;
          price?: number | string;
          stock_num?: number;
          seller_info?: { shop_name?: string };
          affiliate_info?: { commission_rate?: number };
          imgs?: string[];
        }>;
        has_more?: boolean;
      };
    };

    if (json.code !== 0 && json.code !== undefined) {
      const errMsg = json.message || 'Unknown TikTok Studio Error';
      if (errMsg.toLowerCase().includes('banned') || errMsg.toLowerCase().includes('permission')) {
        throw new Error(
          'TikTok Warning: "permission is temporarily banned" ระบบถูกระงับการดึงข้อมูลชั่วคราว 1-2 ชั่วโมงเนื่องจากยิงคำขอบ่อยเกินไป'
        );
      }
      throw new Error(`TikTok Studio API responded with error [code ${json.code}]: ${errMsg}`);
    }

    const rawProducts = json.data?.products || [];

    return rawProducts.map((p) => {
      // แปลง format_available_price เช่น "฿199" -> 199
      let priceNum = 0;
      if (typeof p.price === 'number') {
        priceNum = p.price;
      } else if (p.format_available_price) {
        const cleaned = p.format_available_price.replace(/[^\d.]/g, '');
        priceNum = parseFloat(cleaned) || 0;
      }

      return {
        platform_product_id: String(p.product_id),
        name: p.title || 'ไม่มีชื่อสินค้า',
        image_url: p.imgs && p.imgs.length > 0 ? p.imgs[0] : '',
        price: priceNum,
        stock_num: p.stock_num ?? 0,
        shop_name: p.seller_info?.shop_name || '',
        commission_rate: p.affiliate_info?.commission_rate ?? 0,
        raw_api_data: p as unknown as Record<string, unknown>,
      };
    });
  }
}

/**
 * 2. Official TikTok Shop Partner / Open API (ใช้ x-tts-access-token)
 * URL: https://open-api.tiktokglobalshop.com/affiliate/202309/showcase/products/search
 */
export class OfficialTikTokPartnerAdapter implements TikTokShowcaseAdapter {
  constructor(
    private accessToken: string,
    private apiUrl: string = 'https://open-api.tiktokglobalshop.com/affiliate/202309/showcase/products/search'
  ) {}

  async getProducts(): Promise<ProductShowcaseItem[]> {
    if (!this.accessToken || !this.accessToken.trim()) {
      throw new Error('กรุณาระบุ x-tts-access-token สำหรับ TikTok Partner Open API ในหน้าตั้งค่า');
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tts-access-token': this.accessToken.trim(),
      },
      body: JSON.stringify({ page_size: 50, page_number: 1 }),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('HTTP 401/403: Access Token ไม่ถูกต้องหรือหมดอายุ');
    }

    if (!response.ok) {
      throw new Error(`Official TikTok API Error: HTTP ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const rawItems: Array<Record<string, unknown>> =
      data.data?.products || data.products || data.items || [];

    return rawItems.map((item) => {
      const pid = String(item.product_id || item.platform_product_id || item.id || '');
      return {
        platform_product_id: pid,
        name: String(item.title || item.name || 'ไม่มีชื่อสินค้า'),
        image_url: String(item.image_url || (Array.isArray(item.imgs) ? item.imgs[0] : '') || ''),
        price: Number(item.price || item.sale_price || 0),
        stock_num: Number(item.stock_num || item.stock || 0),
        shop_name: String((item.seller_info as Record<string, unknown>)?.shop_name || ''),
        commission_rate: Number((item.affiliate_info as Record<string, unknown>)?.commission_rate || 0),
        raw_api_data: item,
      };
    });
  }
}

/**
 * 3. Mock Showcase Adapter (จำลองโครงสร้างเดียวกับ TikTok Studio)
 */
export class MockTikTokShowcaseAdapter implements TikTokShowcaseAdapter {
  async getProducts(): Promise<ProductShowcaseItem[]> {
    return [
      {
        platform_product_id: '172938472918239102',
        name: 'เมล็ดกาแฟอาราบิก้า 100% คั่วกลาง หอมละมุน ชงได้ทั้งดริปและเอสเปรสโซ',
        image_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=500&auto=format&fit=crop&q=60',
        price: 199.0,
        stock_num: 150,
        shop_name: 'Arabica Valley Thailand',
        commission_rate: 15,
        raw_api_data: {
          product_id: '172938472918239102',
          title: 'เมล็ดกาแฟอาราบิก้า 100% คั่วกลาง หอมละมุน ชงได้ทั้งดริปและเอสเปรสโซ',
          format_available_price: '฿199',
          stock_num: 150,
          seller_info: { shop_name: 'Arabica Valley Thailand' },
          affiliate_info: { commission_rate: 15 },
          imgs: ['https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=500&auto=format&fit=crop&q=60'],
        },
      },
      {
        platform_product_id: '172959382109438921',
        name: 'หูฟังบลูทูธไร้สาย ANC ตัดเสียงรบกวน แบตอึด 40 ชม. เบสแน่น',
        image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60',
        price: 890.0,
        stock_num: 50,
        shop_name: 'SoundMax Official',
        commission_rate: 12,
        raw_api_data: {
          product_id: '172959382109438921',
          title: 'หูฟังบลูทูธไร้สาย ANC ตัดเสียงรบกวน แบตอึด 40 ชม. เบสแน่น',
          format_available_price: '฿890',
          stock_num: 50,
          seller_info: { shop_name: 'SoundMax Official' },
          affiliate_info: { commission_rate: 12 },
          imgs: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60'],
        },
      },
      {
        platform_product_id: '172960473218547219',
        name: 'เซรั่มวิตามินซีสด ผิวกระจ่างใส ลดเลือนรอยสิว สูตรเข้มข้นซึมไว',
        image_url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=500&auto=format&fit=crop&q=60',
        price: 350.0,
        stock_num: 320,
        shop_name: 'GlowSkin Lab',
        commission_rate: 20,
        raw_api_data: {
          product_id: '172960473218547219',
          title: 'เซรั่มวิตามินซีสด ผิวกระจ่างใส ลดเลือนรอยสิว สูตรเข้มข้นซึมไว',
          format_available_price: '฿350',
          stock_num: 320,
          seller_info: { shop_name: 'GlowSkin Lab' },
          affiliate_info: { commission_rate: 20 },
          imgs: ['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=500&auto=format&fit=crop&q=60'],
        },
      },
      {
        platform_product_id: '172971584329651034',
        name: 'ขาตั้งกล้องมือถือ หมุนได้ 360 องศา พร้อมรีโมทชัตเตอร์บลูทูธ',
        image_url: 'https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?w=500&auto=format&fit=crop&q=60',
        price: 199.0,
        stock_num: 88,
        shop_name: 'CreatorGadget Store',
        commission_rate: 18,
        raw_api_data: {
          product_id: '172971584329651034',
          title: 'ขาตั้งกล้องมือถือ หมุนได้ 360 องศา พร้อมรีโมทชัตเตอร์บลูทูธ',
          format_available_price: '฿199',
          stock_num: 88,
          seller_info: { shop_name: 'CreatorGadget Store' },
          affiliate_info: { commission_rate: 18 },
          imgs: ['https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?w=500&auto=format&fit=crop&q=60'],
        },
      },
    ];
  }
}

export class TikTokPublisherService {
  /**
   * จำลองและส่งวิดีโอขึ้น TikTok
   * แยกผลการอัปโหลดและผลการติดตะกร้าสินค้า (Product Anchor) ชัดเจนตามข้อ 10
   */
  static async publishVideo(params: {
    videoId: string;
    videoPath: string;
    caption: string;
    platformProductId?: string;
    idempotencyKey: string;
  }): Promise<PublishResult> {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    if (!params.platformProductId) {
      return {
        success: true,
        platform_upload_id: `upl_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        platform_post_id: `post_${Date.now()}`,
        anchor_status: 'unsupported',
        error_message: 'ไม่มี Product ID สำหรับผูกตะกร้าสินค้า',
      };
    }

    const isTimeout = Math.random() < 0.03;
    if (isTimeout) {
      return {
        success: false,
        needs_verification: true,
        anchor_status: 'pending',
        error_code: 'GATEWAY_TIMEOUT',
        error_message:
          'การเชื่อมต่อ TikTok ขาดหายระหว่างส่งข้อมูล กำลังรอตรวจสอบสถานะ (needs_verification)',
      };
    }

    const uploadId = `upl_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const postId = `tiktok_post_${Date.now()}`;

    return {
      success: true,
      platform_upload_id: uploadId,
      platform_post_id: postId,
      anchor_status: 'attached',
    };
  }
}
