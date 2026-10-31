'use client';
import Link from 'next/link';
import { useState } from 'react';
import ProductScripts from './ProductScripts';
import VoiceRecorder from './VoiceRecorder';
export default function ProductWorkspace({ product }: { product: { id: string; name: string; image_url: string; price: number; folder_path: string } }) {
  const [script, setScript] = useState('');
  return <main className="min-h-screen bg-zinc-950 text-zinc-100 p-5 sm:p-10"><div className="mx-auto max-w-5xl space-y-6">
    <Link href="/" className="text-sm text-zinc-400 hover:text-white">← Showcase</Link>
    <header className="flex gap-5 items-center rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {product.image_url && <img src={product.image_url} alt={product.name} className="h-24 w-24 rounded-lg object-cover" />}
      <div><p className="text-xs uppercase tracking-widest text-zinc-400">Product scripts & voiceover</p><h1 className="mt-2 text-xl font-semibold">{product.name}</h1><p className="mt-2 text-sm text-zinc-400">฿{product.price.toLocaleString()}</p></div>
    </header>
    <ProductScripts productId={product.id} onRecord={setScript} />
    <div id="recorder" className="scroll-mt-6"><VoiceRecorder product={product} initialScript={script} inline onClose={() => setScript('')} /></div>
  </div></main>;
}
