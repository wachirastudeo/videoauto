'use client';

import React, { useState, useEffect, useCallback } from 'react';
import VoiceRecorder from '@/components/VoiceRecorder';
import {
  ShoppingBag,
  Film,
  UploadCloud,
  Settings as SettingsIcon,
  RefreshCw,
  FolderSync,
  PlusCircle,
  Play,
  Clock,
  AlertTriangle,
  Sliders,
  Volume2,
  Share2,
  X,
  Check,
  FolderCheck,
  FolderOpen,
  Trash2,
  ChevronDown,
  ChevronUp,
  XCircle,
  LayoutDashboard,
} from 'lucide-react';

interface ShowcaseProduct {
  id: string;
  platform_product_id: string;
  name: string;
  image_url: string;
  price: number;
  folder_path: string;
  video_count: number;
  last_synced_at: string;
  raw_api_data?: string;
}

interface VideoRecord {
  id: string;
  product_id: string | null;
  source_path: string;
  source_filename: string;
  output_path: string | null;
  output_filename: string | null;
  voice_path: string | null;
  caption_text: string | null;
  thumbnail_path: string | null;
  edit_status: 'waiting_match' | 'ready_to_edit' | 'editing' | 'approved' | 'failed';
  upload_status: 'idle' | 'queued' | 'uploading' | 'published' | 'needs_verification' | 'failed';
  anchor_status: 'not_started' | 'pending' | 'attached' | 'failed' | 'unsupported' | 'needs_manual_action';
  created_at: string;
  updated_at: string;
  product_name?: string;
  platform_product_id?: string;
  product_image_url?: string;
  product_price?: number;
}

interface PublishingHistoryItem {
  id: string;
  video_id: string;
  job_status: string;
  status: 'success' | 'failed' | 'needs_manual_action';
  tiktok_publish_id: string | null;
  anchor_status: string;
  error_message: string | null;
  created_at: string;
  source_filename?: string;
  output_filename?: string;
  product_name?: string;
  platform_product_id?: string;
}

interface AppSettings {
  prefix: string;
  separator: string;
  date_format: 'YYYYMMDD' | 'YYMMDD' | 'NONE';
  include_product_id: boolean;
  sequence_number: number;
  storage_root: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'videos' | 'queue' | 'history' | 'settings'>('dashboard');
  const [products, setProducts] = useState<ShowcaseProduct[]>([]);
  const [hiddenProducts, setHiddenProducts] = useState<ShowcaseProduct[]>([]);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [history, setHistory] = useState<PublishingHistoryItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [resolvedStorageRoot, setResolvedStorageRoot] = useState('');
  const [namingPreview, setNamingPreview] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [targetProductIdForUpload, setTargetProductIdForUpload] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [voiceProduct, setVoiceProduct] = useState<ShowcaseProduct | null>(null);
  const [editingVideo, setEditingVideo] = useState<VideoRecord | null>(null);
  const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string } | null>(null);
  const [expandedProductIds, setExpandedProductIds] = useState<string[]>([]);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch('/api/videos');
      const data = await res.json();
      if (data.success) {
        setVideos(data.videos);
      }
    } catch {
      showToast('ไม่สามารถดึงข้อมูลวิดีโอได้', 'error');
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const [res, hiddenRes] = await Promise.all([fetch('/api/showcase'), fetch('/api/showcase?hidden=1')]);
      const [data, hiddenData] = await Promise.all([res.json(), hiddenRes.json()]);
      if (data.success && hiddenData.success) {
        setProducts(data.products);
        setHiddenProducts(hiddenData.products);
        // ขยายการ์ดที่มีคลิปโดยอัตโนมัติ
        setExpandedProductIds(data.products.map((p: ShowcaseProduct) => p.id));
      }
    } catch {
      showToast('ไม่สามารถดึงข้อมูลสินค้าได้', 'error');
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/publishing/history');
      const data = await res.json();
      if (data.success) {
        setHistory(data.history);
      }
    } catch {
      showToast('ไม่สามารถดึงประวัติการเผยแพร่ได้', 'error');
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        setResolvedStorageRoot(data.resolved_storage_root || data.settings.storage_root);
        setNamingPreview(data.preview);
      }
    } catch {
      showToast('ไม่สามารถดึงการตั้งค่าได้', 'error');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([fetchProducts(), fetchVideos(), fetchHistory(), fetchSettings()]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchProducts, fetchVideos, fetchHistory, fetchSettings]);

  // Sync Showcase Products
  const handleSyncShowcase = async () => {
    setLoading(true);
    try {
      const data = await new Promise<{ success: boolean; message?: string; error?: string }>((resolve) => {
        let bridgeReady = false;
        const readyTimer = window.setTimeout(() => {
          if (!bridgeReady) {
            cleanup();
            resolve({ success: false, error: 'Install the VideoAuto Showcase Bridge extension in Chrome, then try again.' });
          }
        }, 2000);
        const resultTimer = window.setTimeout(() => {
          cleanup();
          resolve({ success: false, error: 'Showcase sync timed out. Try again.' });
        }, 90000);
        const cleanup = () => {
          window.clearTimeout(readyTimer);
          window.clearTimeout(resultTimer);
          window.removeEventListener('message', onMessage);
        };
        const onMessage = (event: MessageEvent) => {
          if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== 'videoauto-extension') return;
          if (event.data.type === 'SYNC_STARTED') bridgeReady = true;
          if (event.data.type === 'SYNC_RESULT') {
            cleanup();
            resolve(event.data);
          }
        };
        window.addEventListener('message', onMessage);
        window.postMessage({ source: 'videoauto-app', type: 'SYNC_SHOWCASE' }, window.location.origin);
      });
      if (data.success) {
        showToast(data.message || 'Showcase synced', 'success');
        await Promise.all([fetchProducts(), fetchSettings()]);
      } else {
        showToast(data.error || 'Showcase sync failed', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveProduct = async (product: ShowcaseProduct) => {
    if (!window.confirm(`Remove "${product.name}" from VideoAuto? Local videos and folders will stay. This will not remove it from TikTok Shop.`)) return;
    try {
      const res = await fetch(`/api/showcase/${encodeURIComponent(product.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: true }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not remove product');
      await fetchProducts();
      showToast('Product removed from VideoAuto', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not remove product', 'error');
    }
  };

  const handleRestoreProduct = async (product: ShowcaseProduct) => {
    try {
      const res = await fetch(`/api/showcase/${encodeURIComponent(product.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: false }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not restore product');
      await fetchProducts();
      showToast('Product restored in VideoAuto', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not restore product', 'error');
    }
  };

  const handleOpenProductFolder = async (product: ShowcaseProduct) => {
    try {
      const res = await fetch(`/api/showcase/${encodeURIComponent(product.id)}/open-folder`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not open folder');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not open folder', 'error');
    }
  };

  // Scan local folders
  const handleScanFolders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/videos/scan', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        fetchVideos();
        fetchProducts();
      } else {
        showToast(data.error || 'สแกนไฟล์ไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดขณะสแกน', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Process video with FFmpeg
  const handleProcessVideo = async (videoId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        fetchVideos();
      } else {
        showToast(data.error || 'ตัดต่อวิดีโอล้มเหลว', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดระหว่างตัดต่อ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChooseStorageFolder = async () => {
    setChoosingFolder(true);
    try {
      const res = await fetch('/api/storage/pick-folder', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.path) {
        setSettings((current) => current ? { ...current, storage_root: data.path } : current);
      } else if (!data.cancelled) {
        showToast(data.error || 'Could not open folder picker', 'error');
      }
    } catch {
      showToast('Could not open folder picker', 'error');
    } finally {
      setChoosingFolder(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    if (!settings) return;
    setLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        showToast('บันทึกการตั้งค่าเรียบร้อย', 'success');
        setNamingPreview(data.preview);
        setIsSettingsModalOpen(false);
        await Promise.all([fetchProducts(), fetchVideos(), fetchSettings()]);
      } else {
        showToast(data.error || 'บันทึกการตั้งค่าไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('บันทึกล้มเหลว', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Filter products for showcase grid
  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.platform_product_id.includes(q);
  });

  // Filter videos for videos/queue tab
  const queuedVideos = videos.filter(
    (v) => v.upload_status === 'queued' || v.upload_status === 'uploading' || v.upload_status === 'needs_verification'
  );

  const toggleExpandProduct = (id: string) => {
    setExpandedProductIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="app-shell min-h-screen text-zinc-100 flex flex-col lg:flex-row">
      {/* ======================================================== */}
      {/* 1. LEFT-HAND MANAGEMENT SIDEBAR (แทบเครื่องมือจัดการซ้ายมือ) */}
      {/* ======================================================== */}
      <aside className="app-sidebar w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-zinc-800 flex flex-col shrink-0 lg:min-h-screen lg:sticky lg:top-0 lg:h-screen z-30">
        {/* Brand & Logo Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center gap-3">
          <div className="p-2.5 bg-slate-500 rounded-xl shadow-lg shadow-slate-950/40 shrink-0">
            <ShoppingBag className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-extrabold text-base tracking-tight text-zinc-50 truncate">
              VideoAuto
            </h1>
            <p className="text-[10px] text-slate-300 font-semibold tracking-[0.18em] uppercase">
              Showcase Studio
            </p>
          </div>
        </div>

        {/* Main Navigation Menu */}
        <div className="app-sidebar-nav p-3.5 space-y-1.5 flex-1 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            เมนูจัดการระบบ
          </div>

          {/* 1. Dashboard & Showcase (3 Columns) */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'dashboard'
                ? 'app-nav-active text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 text-slate-300 shrink-0" />
            <span className="truncate">Dashboard (สินค้า 3 คอลัมน์)</span>
            <span
              className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                activeTab === 'dashboard'
                  ? 'bg-white/20 text-white'
                  : 'bg-zinc-800 text-slate-400'
              }`}
            >
              {products.length}
            </span>
          </button>

          {/* 2. All Videos List */}
          <button
            onClick={() => setActiveTab('videos')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'videos'
                ? 'app-nav-active text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70'
            }`}
          >
            <Film className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">วิดีโอทั้งหมดในระบบ</span>
            <span
              className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                activeTab === 'videos'
                  ? 'bg-white/20 text-white'
                  : 'bg-zinc-800 text-rose-400'
              }`}
            >
              {videos.length}
            </span>
          </button>

          {/* 3. Publish Queue */}
          <button
            onClick={() => setActiveTab('queue')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'queue'
                ? 'app-nav-active text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70'
            }`}
          >
            <UploadCloud className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">คิวรอเผยแพร่ TikTok</span>
            {queuedVideos.length > 0 && (
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {queuedVideos.length}
              </span>
            )}
          </button>

          {/* 4. Publishing History */}
          <button
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'history'
                ? 'app-nav-active text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70'
            }`}
          >
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate">ประวัติการเผยแพร่</span>
            <span
              className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                activeTab === 'history'
                  ? 'bg-white/20 text-white'
                  : 'bg-zinc-800 text-slate-400'
              }`}
            >
              {history.length}
            </span>
          </button>

          {/* 5. Settings */}
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'settings'
                ? 'app-nav-active text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70'
            }`}
          >
            <SettingsIcon className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate">ตั้งค่าระบบ & Naming</span>
          </button>

          {/* Divider */}
          <div className="pt-4 pb-2">
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              ปุ่มคำสั่งด่วน (Quick Actions)
            </div>
          </div>

          {/* Action 1: Sync Showcase */}
          <button
            onClick={handleSyncShowcase}
            disabled={loading}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-950/40 hover:bg-slate-900/60 text-slate-200 border border-slate-500/30 rounded-xl text-xs font-semibold transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 shrink-0 ${loading ? 'animate-spin' : ''}`} />
            <span className="truncate">ซิงก์สินค้า TikTok Showcase</span>
          </button>

          {/* Action 2: Scan Folders */}
          <button
            onClick={handleScanFolders}
            disabled={loading}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 rounded-xl text-xs font-semibold transition-all"
          >
            <FolderSync className={`w-3.5 h-3.5 text-slate-400 shrink-0 ${loading ? 'animate-spin' : ''}`} />
            <span className="truncate">สแกนโฟลเดอร์เครื่อง</span>
          </button>

          {/* Action 3: Add Video */}
          <button
            onClick={() => {
              setTargetProductIdForUpload('');
              setIsUploadModalOpen(true);
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-950/50 hover:bg-slate-900/60 text-slate-200 border border-slate-500/30 rounded-xl text-xs font-semibold transition-all"
          >
            <PlusCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">เพิ่มคลิปวิดีโอใหม่</span>
          </button>
        </div>

        {/* Sidebar Footer System Status */}
        <div className="p-3.5 border-t border-zinc-800 bg-zinc-950/50">
          <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between text-zinc-400">
              <span>โฟลเดอร์เก็บไฟล์:</span>
              <span className="text-slate-400 font-mono text-[10px] truncate max-w-32" title={settings?.storage_root}>{settings?.storage_root || "./storage/TikTok-Affiliate"}</span>
            </div>
            <div className="flex items-center gap-1.5 pt-1 text-[10px] text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse"></span>
              <span>ระบบพร้อมทำงานอัตโนมัติ</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 2. MAIN CONTENT AREA (เนื้อหาด้านขวา) */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0 lg:h-screen lg:overflow-y-auto">
        {/* Top Header Bar */}
        <header className="app-header sticky top-0 z-20 backdrop-blur-md border-b border-zinc-800 px-5 md:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="font-bold text-base text-zinc-100 truncate">
              {activeTab === 'dashboard' && 'Dashboard แสดงสินค้า 3 คอลัมน์ & วิดีโอในตัว'}
              {activeTab === 'videos' && 'รายการวิดีโอทั้งหมดในระบบ'}
              {activeTab === 'queue' && 'คิวรอส่งคลิปขึ้น TikTok'}
              {activeTab === 'history' && 'ประวัติการเผยแพร่ & แนบ Anchor'}
              {activeTab === 'settings' && 'การตั้งค่าระบบ & Naming Rules'}
            </h2>
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-2.5">
            <input
              type="text"
              placeholder="ค้นหาชื่อสินค้า หรือ Product ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-800/90 border border-zinc-700 rounded-xl px-3.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-slate-500 w-52 sm:w-64"
            />

            <button
              onClick={handleSyncShowcase}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-slate-950/40 transition-all shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">ซิงก์ Showcase</span>
            </button>

            <button
              onClick={handleScanFolders}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl text-xs font-semibold transition-all shrink-0"
            >
              <FolderSync className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">สแกนเครื่อง</span>
            </button>

            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-zinc-300 hover:text-white transition-all shrink-0"
              title="ตั้งค่าระบบ"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Tab View Container */}
        <main className="p-5 md:p-8 max-w-[1680px] w-full mx-auto space-y-7">
          {/* ======================================================== */}
          {/* TAB 1: DASHBOARD (SHOWCASE 3 COLUMNS & INLINE VIDEOS) */}
          {/* ======================================================== */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {hiddenProducts.length > 0 && (
                <details className="bg-zinc-900/70 rounded-xl border border-zinc-800 p-4 text-xs text-zinc-300">
                  <summary className="cursor-pointer font-semibold">Removed from VideoAuto ({hiddenProducts.length})</summary>
                  <div className="mt-3 space-y-2">
                    {hiddenProducts.map((product) => (
                      <div key={product.id} className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-2">
                        <span className="truncate">{product.name}</span>
                        <button type="button" onClick={() => handleRestoreProduct(product)} className="shrink-0 text-slate-300 hover:text-white underline">Restore</button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {/* Overview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="metric-card rounded-xl p-4 border border-zinc-800">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Showcase products</span>
                  <div className="mt-2 flex items-baseline gap-2"><strong className="text-3xl font-bold tracking-tight text-slate-300">{products.length}</strong><span className="text-xs text-zinc-500">active</span></div>
                </div>
                <div className="metric-card rounded-xl p-4 border border-zinc-800">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Video library</span>
                  <div className="mt-2 flex items-baseline gap-2"><strong className="text-3xl font-bold tracking-tight text-zinc-100">{videos.length}</strong><span className="text-xs text-zinc-500">clips</span></div>
                </div>
                <div className="metric-card rounded-xl p-4 border border-zinc-800">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Ready to publish</span>
                  <div className="mt-2 flex items-baseline gap-2"><strong className="text-3xl font-bold tracking-tight text-amber-300">{queuedVideos.length}</strong><span className="text-xs text-zinc-500">queued</span></div>
                </div>
              </div>

              {/* 3 Columns Showcase Grid */}
              {filteredProducts.length === 0 ? (
                <div className="text-center py-20 bg-zinc-900/40 rounded-xl border border-dashed border-zinc-800 p-8">
                  <ShoppingBag className="w-14 h-14 text-zinc-600 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-zinc-200">ยังไม่มีสินค้าในระบบ</h3>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1 mb-5">
                    กดปุ่ม &ldquo;ซิงก์สินค้า TikTok Showcase&rdquo; เพื่อโหลดสินค้าหน้าร้านและสร้างโฟลเดอร์ในเครื่องอัตโนมัติ
                  </p>
                  <button
                    onClick={handleSyncShowcase}
                    className="px-5 py-2.5 bg-slate-600 hover:bg-slate-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-slate-950/50"
                  >
                    ซิงก์ดึงสินค้าทันที
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 md:gap-6">
                  {filteredProducts.map((prod) => {
                    const productVideos = videos.filter((v) => v.product_id === prod.id);
                    const isExpanded = expandedProductIds.includes(prod.id);

                    // Parse metadata
                    let shopName = '';
                    let stock = 0;
                    let commission = 0;
                    try {
                      if (prod.raw_api_data) {
                        const parsed = JSON.parse(prod.raw_api_data);
                        shopName = parsed.seller_info?.shop_name || parsed.shop_name || '';
                        stock = parsed.stock_num ?? parsed.stock ?? 0;
                        commission = parsed.affiliate_info?.commission_rate ?? parsed.commission_rate ?? 0;
                      }
                    } catch {
                      // ignore
                    }

                    return (
                      <article
                        key={prod.id}
                        className="product-card bg-zinc-900/90 border border-zinc-800 rounded-xl overflow-hidden hover:border-slate-500/40 transition-all duration-200 flex flex-col justify-between"
                      >
                        <div>
                          {/* 1. Static Product Cover Image (ภาพนิ่งเป็นปก) */}
                          <div className="h-48 bg-zinc-950 relative overflow-hidden group">
                            {prod.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={prod.image_url}
                                alt={prod.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-700">
                                <ShoppingBag className="w-16 h-16" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/15" />

                            {/* Price Badge */}
                            <div className="absolute top-3 right-3 bg-zinc-900/95 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-slate-400 border border-slate-500/30 shadow-lg">
                              ฿{prod.price.toLocaleString()}
                            </div>

                            {/* Folder Ready Status Badge */}
                            <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] text-slate-300 border border-slate-500/20">
                              <FolderCheck className="w-3.5 h-3.5 text-slate-400" />
                              <span>โฟลเดอร์พร้อม</span>
                            </div>

                            {/* Video Count Overlay Pill */}
                            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-200 border border-white/10">
                              <Film className="w-3.5 h-3.5 text-slate-400" />
                              <span>{productVideos.length} วิดีโอในสินค้านี้</span>
                            </div>
                          </div>

                          {/* 2. Product Details */}
                          <div className="p-5 space-y-3">
                            <h3 className="font-bold text-sm text-zinc-100 line-clamp-2 leading-snug">
                              {prod.name}
                            </h3>

                            {/* Product ID Pill */}
                            <div className="flex items-center justify-between bg-slate-950/40 border border-slate-500/20 rounded-xl px-3 py-1.5 text-xs">
                              <span className="text-zinc-400 text-[11px]">Product ID:</span>
                              <span className="font-mono text-slate-300 font-semibold tracking-wide">
                                {prod.platform_product_id}
                              </span>
                            </div>

                            {/* Metadata: Shop, Stock, Commission */}
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              {shopName && (
                                <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded-md border border-zinc-700">
                                  🏪 {shopName}
                                </span>
                              )}
                              {stock > 0 && (
                                <span className="px-2 py-0.5 bg-zinc-800/80 text-amber-300 rounded-md border border-zinc-700">
                                  📦 สต็อก {stock}
                                </span>
                              )}
                              {commission > 0 && (
                                <span className="px-2 py-0.5 bg-slate-950/50 text-slate-300 rounded-md border border-slate-500/20 font-medium">
                                  💰 คอม {commission}%
                                </span>
                              )}
                            </div>

                            {/* Storage folder and TikTok management */}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenProductFolder(prod)}
                                aria-label={`Open folder for ${prod.name} in Finder`}
                                title={`Open in Finder: ${prod.folder_path}`}
                                className="min-w-0 flex-1 flex items-center gap-2 text-left text-[10px] text-zinc-300 hover:text-slate-200 hover:border-slate-500/40 bg-zinc-950/60 p-2.5 rounded-lg font-mono border border-zinc-800/70 transition-colors"
                              >
                                <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span className="truncate">{prod.folder_path}</span>
                              </button>
                              <a
                                href="https://shop.tiktok.com/streamer/showcase/product/list"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Remove ${prod.name} from TikTok Showcase (opens TikTok Shop)`}
                                title="Remove from TikTok Showcase (opens TikTok Shop)"
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </a>
                            </div>

                            {/* 3. Embedded Videos Inside This Product */}
                            <div className="pt-2 border-t border-zinc-800/80 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                                  <Film className="w-3.5 h-3.5 text-rose-400" />
                                  <span>คลิปวิดีโอ ({productVideos.length})</span>
                                </span>
                                {productVideos.length > 0 && (
                                  <button
                                    onClick={() => toggleExpandProduct(prod.id)}
                                    className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1"
                                  >
                                    <span>{isExpanded ? 'ย่อคลิป' : 'ขยายคลิป'}</span>
                                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  </button>
                                )}
                              </div>

                              {productVideos.length === 0 ? (
                                <div className="bg-zinc-950/50 border border-dashed border-zinc-800 rounded-xl p-4 text-center space-y-2">
                                  <p className="text-xs text-zinc-400">ยังไม่มีวิดีโอในโฟลเดอร์สินค้านี้</p>
                                  <button
                                    onClick={() => {
                                      setTargetProductIdForUpload(prod.id);
                                      setIsUploadModalOpen(true);
                                    }}
                                    className="px-3.5 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm"
                                  >
                                    <PlusCircle className="w-3.5 h-3.5" />
                                    <span>อัปโหลดวิดีโอใส่สินค้านี้</span>
                                  </button>
                                </div>
                              ) : isExpanded ? (
                                <div className="space-y-2">
                                  {productVideos.map((video) => {
                                    const videoStreamUrl = video.output_path
                                      ? `/api/media${video.output_path}`
                                      : `/api/media${video.source_path}`;

                                    return (
                                      <div
                                        key={video.id}
                                        className="bg-zinc-950/80 border border-zinc-800/90 rounded-xl p-3 space-y-2.5 hover:border-zinc-700 transition-colors"
                                      >
                                        {/* Video row header: Thumb + Name */}
                                        <div className="flex items-center gap-2.5">
                                          <div
                                            onClick={() =>
                                              setPlayingVideo({
                                                url: videoStreamUrl,
                                                title: video.output_filename || video.source_filename,
                                              })
                                            }
                                            className="w-12 h-14 bg-zinc-800 rounded-lg overflow-hidden relative cursor-pointer group shrink-0 border border-zinc-700 flex items-center justify-center"
                                          >
                                            {video.thumbnail_path ? (
                                              // eslint-disable-next-line @next/next/no-img-element
                                              <img
                                                src={`/api/media${video.thumbnail_path}`}
                                                alt="thumb"
                                                className="w-full h-full object-cover"
                                              />
                                            ) : (
                                              <Film className="w-5 h-5 text-zinc-600" />
                                            )}
                                            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 flex items-center justify-center">
                                              <Play className="w-4 h-4 text-white" />
                                            </div>
                                          </div>

                                          <div className="flex-1 min-w-0">
                                            <h4 className="text-xs font-semibold text-zinc-200 truncate font-mono">
                                              {video.output_filename ? (
                                                <span className="text-slate-300">
                                                  ✓ {video.output_filename}
                                                </span>
                                              ) : (
                                                video.source_filename
                                              )}
                                            </h4>
                                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-0.5">
                                              {video.voice_path ? (
                                                <span className="text-sky-300 flex items-center gap-0.5">
                                                  <Volume2 className="w-3 h-3" /> มีเสียงพากย์
                                                </span>
                                              ) : (
                                                <span>ไม่มีเสียงพากย์</span>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Status Badges */}
                                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                                          <div className="bg-zinc-900 p-1.5 rounded-lg border border-zinc-800 flex items-center justify-between">
                                            <span className="text-zinc-500">ตัดต่อ:</span>
                                            {video.edit_status === 'approved' && (
                                              <span className="text-slate-400 font-semibold">9:16 สำเร็จ</span>
                                            )}
                                            {video.edit_status === 'editing' && (
                                              <span className="text-amber-400 font-semibold animate-pulse">กำลังตัดต่อ...</span>
                                            )}
                                            {video.edit_status === 'ready_to_edit' && (
                                              <span className="text-zinc-400">รอสั่งตัด</span>
                                            )}
                                            {video.edit_status === 'failed' && (
                                              <span className="text-rose-400">ล้มเหลว</span>
                                            )}
                                          </div>

                                          <div className="bg-zinc-900 p-1.5 rounded-lg border border-zinc-800 flex items-center justify-between">
                                            <span className="text-zinc-500">TikTok:</span>
                                            {video.upload_status === 'published' && (
                                              <span className="text-slate-400 font-semibold">เผยแพร่แล้ว ✓</span>
                                            )}
                                            {video.upload_status === 'uploading' && (
                                              <span className="text-amber-300 font-semibold animate-pulse">กำลังส่ง...</span>
                                            )}
                                            {video.upload_status === 'needs_verification' && (
                                              <span className="text-slate-300 font-semibold">รอตรวจสอบ</span>
                                            )}
                                            {video.upload_status === 'idle' && (
                                              <span className="text-zinc-400">ยังไม่อัปโหลด</span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Action Buttons for this video */}
                                        <div className="flex items-center gap-1.5 pt-1">
                                          {video.edit_status !== 'approved' ? (
                                            <button
                                              onClick={() => handleProcessVideo(video.id)}
                                              disabled={loading}
                                              className="flex-1 py-1.5 px-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 shadow-sm"
                                            >
                                              <Film className="w-3 h-3" />
                                              <span>ตัดต่อ FFmpeg</span>
                                            </button>
                                          ) : (
                                            <a
                                              href={video.output_path ? `/api/media${video.output_path}` : '#'}
                                              download={video.output_filename || undefined}
                                              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 shadow-sm ${
                                                video.upload_status === 'published'
                                                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                                  : 'bg-slate-600 hover:bg-slate-500 text-white shadow-rose-950/50'
                                              }`}
                                            >
                                              <Share2 className="w-3 h-3" />
                                              <span>
                                                {video.upload_status === 'published'
                                                  ? 'อัปโหลดสำเร็จแล้ว'
                                                  : 'ดาวน์โหลดเพื่อโพสต์เอง'}
                                              </span>
                                            </a>
                                          )}

                                          <button
                                            onClick={() => setEditingVideo(video)}
                                            className="py-1.5 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium border border-zinc-700"
                                            title="แก้ไขแคปชั่น"
                                          >
                                            <Sliders className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Card Footer: Add video into this product */}
                        <button type="button" onClick={() => setVoiceProduct(prod)} className="mx-4 mb-3 rounded-xl border border-slate-700/50 p-2 text-sm text-slate-300 hover:bg-slate-950">Record voiceover</button>
                        <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-zinc-400">
                            โฟลเดอร์: <code>input/</code>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(prod)}
                            className="flex items-center gap-1 px-2 py-1.5 text-rose-300 hover:text-white hover:bg-rose-700 rounded-lg text-[11px]"
                            title="Remove from VideoAuto only; keep files and TikTok Showcase"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove locally</span>
                          </button>
                          <button
                            onClick={() => {
                              setTargetProductIdForUpload(prod.id);
                              setIsUploadModalOpen(true);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600/90 hover:bg-slate-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>Add source videos</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: ALL VIDEOS LIST */}
          {/* ======================================================== */}
          {activeTab === 'videos' && (
            <div className="space-y-4">
              <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">รายการคลิปวิดีโอทั้งหมด ({videos.length})</h3>
                  <p className="text-xs text-zinc-400">คลิปทั้งหมดจากโฟลเดอร์สินค้าและโฟลเดอร์ทั่วไป</p>
                </div>
                <button
                  onClick={() => {
                    setTargetProductIdForUpload('');
                    setIsUploadModalOpen(true);
                  }}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-xl text-xs font-semibold shadow-md flex items-center gap-1.5"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>เพิ่มคลิปใหม่</span>
                </button>
              </div>

              <div className="bg-zinc-900/80 rounded-xl border border-zinc-800 overflow-hidden">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-zinc-950/70 text-zinc-400 border-b border-zinc-800 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="p-3.5">วิดีโอ / ตัวอย่าง</th>
                      <th className="p-3.5">สินค้าที่เชื่อมโยง</th>
                      <th className="p-3.5">สถานะตัดต่อ</th>
                      <th className="p-3.5">สถานะ TikTok</th>
                      <th className="p-3.5 text-right">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {videos.map((v) => (
                      <tr key={v.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="p-3.5">
                          <div className="font-semibold text-zinc-100 font-mono">
                            {v.output_filename || v.source_filename}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {v.voice_path ? 'มีไฟล์เสียงพากย์' : 'ไม่มีเสียงพากย์'}
                          </div>
                        </td>
                        <td className="p-3.5">
                          {v.product_name ? (
                            <div>
                              <div className="text-zinc-200 font-medium truncate max-w-xs">{v.product_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{v.platform_product_id}</div>
                            </div>
                          ) : (
                            <span className="text-zinc-500">ไม่ได้ผูกสินค้า</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          {v.edit_status === 'approved' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-950/70 text-slate-300 border border-slate-500/30">
                              9:16 สำเร็จ
                            </span>
                          )}
                          {v.edit_status === 'ready_to_edit' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400">
                              รอสั่งตัด
                            </span>
                          )}
                          {v.edit_status === 'editing' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-950/70 text-amber-300 animate-pulse">
                              กำลังตัดต่อ...
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          {v.upload_status === 'published' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-950/70 text-slate-300 border border-slate-500/30">
                              เผยแพร่แล้ว
                            </span>
                          )}
                          {v.upload_status === 'idle' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400">
                              ยังไม่ได้ส่ง
                            </span>
                          )}
                          {v.upload_status === 'queued' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-950/70 text-amber-300">
                              อยู่ในคิว
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right space-x-2">
                          <button
                            onClick={() => handleProcessVideo(v.id)}
                            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs"
                          >
                            ตัดต่อ
                          </button>
                          <a
                            href={v.output_path ? `/api/media${v.output_path}` : '#'}
                            download={v.output_filename || undefined}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs"
                          >
                            ดาวน์โหลด
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: PUBLISH QUEUE */}
          {/* ======================================================== */}
          {activeTab === 'queue' && (
            <div className="space-y-4">
              <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">คิวรออัปโหลด TikTok ({queuedVideos.length})</h3>
                  <p className="text-xs text-zinc-400">ดาวน์โหลดคลิปแล้วโพสต์บน TikTok ด้วยตนเอง การเชื่อมต่อเผยแพร่อัตโนมัติยังไม่พร้อม</p>
                </div>
              </div>

              {queuedVideos.length === 0 ? (
                <div className="text-center py-16 bg-zinc-900/40 rounded-xl border border-dashed border-zinc-800 p-8">
                  <UploadCloud className="w-12 h-12 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-400">ไม่มีคลิปที่ค้างในคิวรอส่ง</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {queuedVideos.map((v) => (
                    <div
                      key={v.id}
                      className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 flex items-center justify-between"
                    >
                      <div>
                        <h4 className="font-semibold text-zinc-200 font-mono text-xs">
                          {v.output_filename || v.source_filename}
                        </h4>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          สินค้า: {v.product_name || 'ไม่ได้ผูก'} ({v.platform_product_id})
                        </p>
                      </div>
                      <a
                        href={v.output_path ? `/api/media${v.output_path}` : '#'}
                        download={v.output_filename || undefined}
                        className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-md"
                      >
                        ดาวน์โหลดคลิป
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: PUBLISHING HISTORY */}
          {/* ======================================================== */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800">
                <h3 className="text-sm font-bold text-zinc-100">ประวัติการเผยแพร่ & แนบ Anchor ({history.length})</h3>
                <p className="text-xs text-zinc-400">บันทึกผลการยิง TikTok API และสถานะแนบตะกร้าสินค้า</p>
              </div>

              {history.length === 0 ? (
                <div className="text-center py-16 bg-zinc-900/40 rounded-xl border border-dashed border-zinc-800 p-8">
                  <Clock className="w-12 h-12 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-400">ยังไม่มีประวัติการเผยแพร่</p>
                </div>
              ) : (
                <div className="bg-zinc-900/80 rounded-xl border border-zinc-800 overflow-hidden">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-zinc-950/70 text-zinc-400 border-b border-zinc-800 font-semibold uppercase text-[10px]">
                      <tr>
                        <th className="p-3.5">เวลาที่เผยแพร่</th>
                        <th className="p-3.5">วิดีโอ</th>
                        <th className="p-3.5">สถานะโพสต์</th>
                        <th className="p-3.5">สถานะ Anchor สินค้า</th>
                        <th className="p-3.5">TikTok Item ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {history.map((h) => (
                        <tr key={h.id} className="hover:bg-zinc-800/40">
                          <td className="p-3.5 text-zinc-400 font-mono text-[11px]">{h.created_at}</td>
                          <td className="p-3.5 font-semibold text-zinc-100">{h.output_filename || h.source_filename}</td>
                          <td className="p-3.5">
                            {h.status === 'success' ? (
                              <span className="text-slate-400 font-semibold">สำเร็จ ✓</span>
                            ) : (
                              <span className="text-rose-400">{h.status}</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span className="text-slate-300 font-semibold">{h.anchor_status}</span>
                          </td>
                          <td className="p-3.5 font-mono text-zinc-400">{h.tiktok_publish_id || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 5: SETTINGS */}
          {/* ======================================================== */}
          {activeTab === 'settings' && settings && (
            <div className="max-w-2xl bg-zinc-900/90 border border-zinc-800 rounded-xl p-6 space-y-6 shadow-2xl">
              <div>
                <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <SettingsIcon className="w-5 h-5 text-slate-400" />
                  <span>ตั้งค่าระบบและโฟลเดอร์</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  กำหนดโฟลเดอร์สินค้าและรูปแบบชื่อไฟล์ Output
                </p>
              </div>

              <div className="space-y-2 border-t border-zinc-800 pt-4">
                <label htmlFor="storage-root-settings" className="block text-xs font-semibold text-zinc-200">Product storage folder</label>
                <div className="flex gap-2">
                  <input id="storage-root-settings" type="text" value={settings.storage_root} onChange={(e) => setSettings({ ...settings, storage_root: e.target.value })} className="min-w-0 flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-zinc-100" />
                  <button type="button" onClick={handleChooseStorageFolder} disabled={choosingFolder} className="flex items-center gap-1.5 rounded-xl border border-zinc-600 px-3 py-2 text-xs text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"><FolderOpen className="h-4 w-4" />{choosingFolder ? 'Choosing...' : 'Choose folder'}</button>
                </div>
                <p className="text-xs text-zinc-400">Current location: {resolvedStorageRoot}. Changing this path moves existing folders and updates video paths. Choose an empty folder on the same drive.</p>
              </div>

            {/* Naming Rules */}
              <div className="space-y-3 pt-3 border-t border-zinc-800">
                <label className="block text-xs font-semibold text-zinc-200">
                  การตั้งชื่อไฟล์ Output จาก FFmpeg
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Prefix</label>
                    <input
                      type="text"
                      value={settings.prefix}
                      onChange={(e) =>
                        setSettings({ ...settings, prefix: e.target.value.toUpperCase() })
                      }
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">ตัวคั่น</label>
                    <select
                      value={settings.separator}
                      onChange={(e) => setSettings({ ...settings, separator: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-1.5 text-xs text-zinc-100"
                    >
                      <option value="_">_ (ขีดล่าง)</option>
                      <option value="-">- (ขีดกลาง)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">วันที่</label>
                    <select
                      value={settings.date_format}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          date_format: e.target.value as AppSettings['date_format'],
                        })
                      }
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-1.5 text-xs text-zinc-100"
                    >
                      <option value="YYYYMMDD">YYYYMMDD</option>
                      <option value="YYMMDD">YYMMDD</option>
                      <option value="NONE">ไม่ใส่วันที่</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">ลำดับถัดไป</label>
                    <input
                      type="number"
                      value={settings.sequence_number}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          sequence_number: parseInt(e.target.value, 10) || 1,
                        })
                      }
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-100"
                    />
                  </div>
                </div>

                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 text-xs flex items-center justify-between">
                  <span className="text-zinc-400">ตัวอย่างชื่อไฟล์:</span>
                  <span className="font-mono text-slate-400 font-bold">
                    {namingPreview || 'AFF_20261028_001.mp4'}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSaveSettings}
                  disabled={loading}
                  className="px-5 py-2.5 bg-slate-600 hover:bg-slate-500 text-white text-xs font-semibold rounded-xl shadow-md"
                >
                  {loading ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ======================================================== */}
      {/* MODAL: Video Player Preview */}
      {/* ======================================================== */}
      {playingVideo && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden max-w-lg w-full shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100 truncate pr-4">
                {playingVideo.title}
              </h3>
              <button
                onClick={() => setPlayingVideo(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-[9/16] max-h-[70vh] bg-black mx-auto flex items-center justify-center">
              <video
                src={playingVideo.url}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Upload New Video into Product */}
      {/* ======================================================== */}
      {voiceProduct && <VoiceRecorder product={voiceProduct} onClose={() => setVoiceProduct(null)} />}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-zinc-100">
                Add source videos to a product
              </h3>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                disabled={loading}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const formData = new FormData(form);
                const files = formData.getAll('files').filter((item): item is File => item instanceof File && item.size > 0);
                if (files.length === 0) return;
                setLoading(true);
                let saved = 0;
                try {
                  for (const [index, file] of files.entries()) {
                    setUploadProgress(`Saving ${index + 1} of ${files.length}: ${file.name}`);
                    const upload = new FormData();
                    upload.set('product_id', String(formData.get('product_id') || ''));
                    upload.set('file', file);
                    const res = await fetch('/api/videos', { method: 'POST', body: upload });
                    const data = await res.json();
                    if (!res.ok || !data.success) throw new Error(data.error || `Could not save ${file.name}`);
                    saved++;
                  }
                  showToast(`Saved ${saved} source video${saved === 1 ? '' : 's'} for AI editing`, 'success');
                  setIsUploadModalOpen(false);
                } catch (error) {
                  showToast(`${saved} of ${files.length} saved. ${error instanceof Error ? error.message : 'Upload failed'}`, 'error');
                } finally {
                  setLoading(false);
                  setUploadProgress('');
                  void Promise.all([fetchVideos(), fetchProducts()]);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  สินค้าที่ระบุ
                </label>
                <select
                  name="product_id"
                  defaultValue={targetProductIdForUpload}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-100"
                >
                  <option value="">-- ไม่ระบุสินค้า --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (ID: {p.platform_product_id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Source videos (select one or more) *
                </label>
                <input
                  type="file"
                  name="files"
                  accept="video/*"
                  multiple
                  required
                  className="w-full text-xs text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-600 file:text-white hover:file:bg-slate-500"
                />
              </div>

              <p className="text-xs text-zinc-400">Files are saved in the product&apos;s <code>input/</code> folder for AI editing. Nothing is posted to TikTok.</p>
              {uploadProgress && <p role="status" className="text-xs text-slate-300">{uploadProgress}</p>}

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  disabled={loading}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-xs font-semibold rounded-xl shadow-md"
                >
                  {loading ? 'Saving videos...' : 'Save source videos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Edit Video Caption */}
      {/* ======================================================== */}
      {editingVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-zinc-100">แก้ไขแคปชั่น & ข้อมูลคลิป</h3>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  {editingVideo.source_filename}
                </p>
              </div>
              <button
                onClick={() => setEditingVideo(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                แคปชั่น TikTok & Hashtags
              </label>
              <textarea
                rows={4}
                value={editingVideo.caption_text || ''}
                onChange={(e) =>
                  setEditingVideo({ ...editingVideo, caption_text: e.target.value })
                }
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-xs text-zinc-100"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2.5">
              <button
                onClick={() => setEditingVideo(null)}
                className="px-4 py-2 bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-xl"
              >
                ยกเลิก
              </button>
              <button
                onClick={async () => {
                  setLoading(true);
                  try {
                    const res = await fetch(`/api/videos/${editingVideo.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        caption_text: editingVideo.caption_text,
                      }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      showToast(data.message, 'success');
                      setEditingVideo(null);
                      fetchVideos();
                    }
                  } catch {
                    showToast('บันทึกล้มเหลว', 'error');
                  } finally {
                    setLoading(false);
                  }
                }}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-xs font-semibold rounded-xl"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Settings Popup */}
      {/* ======================================================== */}
      {isSettingsModalOpen && settings && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <SettingsIcon className="w-5 h-5 text-slate-400" />
                  <span>ตั้งค่าระบบและโฟลเดอร์</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  กำหนดโฟลเดอร์สินค้าและรูปแบบชื่อไฟล์ Output
                </p>
              </div>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

              <div className="space-y-2 border-t border-zinc-800 pt-4">
                <label htmlFor="storage-root-modal" className="block text-xs font-semibold text-zinc-200">Product storage folder</label>
                <div className="flex gap-2">
                  <input id="storage-root-modal" type="text" value={settings.storage_root} onChange={(e) => setSettings({ ...settings, storage_root: e.target.value })} className="min-w-0 flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-zinc-100" />
                  <button type="button" onClick={handleChooseStorageFolder} disabled={choosingFolder} className="flex items-center gap-1.5 rounded-xl border border-zinc-600 px-3 py-2 text-xs text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"><FolderOpen className="h-4 w-4" />{choosingFolder ? 'Choosing...' : 'Choose folder'}</button>
                </div>
                <p className="text-xs text-zinc-400">Current location: {resolvedStorageRoot}. Changing this path moves existing folders and updates video paths. Choose an empty folder on the same drive.</p>
              </div>

            {/* Naming Rules */}
            <div className="space-y-3 pt-3 border-t border-zinc-800">
              <label className="block text-xs font-semibold text-zinc-200">
                การตั้งชื่อไฟล์ Output จาก FFmpeg
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Prefix</label>
                  <input
                    type="text"
                    value={settings.prefix}
                    onChange={(e) =>
                      setSettings({ ...settings, prefix: e.target.value.toUpperCase() })
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">ตัวคั่น</label>
                  <select
                    value={settings.separator}
                    onChange={(e) => setSettings({ ...settings, separator: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-1.5 text-xs text-zinc-100"
                  >
                    <option value="_">_ (ขีดล่าง)</option>
                    <option value="-">- (ขีดกลาง)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">วันที่</label>
                  <select
                    value={settings.date_format}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        date_format: e.target.value as AppSettings['date_format'],
                      })
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-1.5 text-xs text-zinc-100"
                  >
                    <option value="YYYYMMDD">YYYYMMDD</option>
                    <option value="YYMMDD">YYMMDD</option>
                    <option value="NONE">ไม่ใส่วันที่</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">ลำดับถัดไป</label>
                  <input
                    type="number"
                    value={settings.sequence_number}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        sequence_number: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-100"
                  />
                </div>
              </div>

              <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 text-xs flex items-center justify-between">
                <span className="text-zinc-400">ตัวอย่างชื่อไฟล์ output:</span>
                <span className="font-mono text-slate-400 font-bold">
                  {namingPreview || 'AFF_20261028_001.mp4'}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2.5">
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-4 py-2 bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-xl"
              >
                ปิด
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-5 py-2 bg-slate-600 hover:bg-slate-500 text-white text-xs font-semibold rounded-xl"
              >
                บันทึกการตั้งค่า
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TOAST NOTIFICATION */}
      {/* ======================================================== */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-zinc-900 border border-zinc-700 text-white rounded-xl shadow-2xl text-xs font-medium animate-in fade-in slide-in-from-bottom-2">
          {toast.type === 'success' && <Check className="w-4 h-4 text-slate-400" />}
          {toast.type === 'error' && <XCircle className="w-4 h-4 text-rose-400" />}
          {toast.type === 'info' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
