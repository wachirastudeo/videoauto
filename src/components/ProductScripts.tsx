'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
export default function ProductScripts({ productId, onRecord }: { productId: string; onRecord?: (text: string) => void }) {
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [scripts, setScripts] = useState<{ title: string; text: string }[]>([]);
  const [selected, setSelected] = useState(0);
  useEffect(() => { fetch('/api/ai/key').then(response => response.json()).then(data => setConfigured(data.configured)).catch(() => {}); }, []);
  useEffect(() => { let active = true; fetch(`/api/showcase/${encodeURIComponent(productId)}/scripts`).then(response => response.json()).then(data => { if (active && data.scripts) { setAnalysis(data.analysis); setScripts(data.scripts); } }).catch(() => {}); return () => { active = false; }; }, [productId]);
  const action = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/showcase/${encodeURIComponent(productId)}/scripts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed');
      setAnalysis(data.analysis); setScripts(data.scripts); setSelected(0);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Request failed'); }
    finally { setBusy(false); }
  };
  return <div className="rounded-xl border border-zinc-700 p-3 space-y-3">
    <div className="flex flex-wrap gap-3 items-center text-sm"><strong>AI sales scripts</strong><Link href="/?tab=settings" className="underline">{configured ? 'Gemini configured · Settings' : 'Set API key in Settings'}</Link><button type="button" disabled={busy} onClick={() => action()} className="rounded-lg bg-slate-700 px-3 py-2 disabled:opacity-40">{busy ? 'Working...' : 'Analyze product · 10 scripts'}</button></div>
    <p className="text-xs text-zinc-400">Product name, price and image are sent to Google Gemini. Scripts are saved in captions/ for reuse.</p>
    {message && <p role="status" className="text-sm">{message}</p>}
    {analysis && <details><summary>Product analysis</summary><p className="text-sm whitespace-pre-wrap">{analysis}</p></details>}
    {scripts.length > 0 && <><select aria-label="Sales script" value={selected} onChange={event => setSelected(Number(event.target.value))} className="w-full bg-zinc-800 rounded-lg p-2">{scripts.map((script, index) => <option key={index} value={index}>{index + 1}. {script.title}</option>)}</select><div className="max-h-52 overflow-y-auto whitespace-pre-wrap text-xl leading-relaxed p-3 bg-zinc-950 rounded-lg">{scripts[selected].text}</div>{onRecord && <button type="button" onClick={() => onRecord(scripts[selected].text)} className="rounded-lg bg-slate-700 px-4 py-2">Record this script</button>}</>}
  </div>;
}
