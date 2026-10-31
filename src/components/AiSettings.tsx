'use client';
import { useEffect, useState } from 'react';
export default function AiSettings() {
  const [key, setKey] = useState('');
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { fetch('/api/ai/key').then(response => response.json()).then(data => setConfigured(data.configured)).catch(() => setMessage('Could not load API status')); }, []);
  async function save() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/ai/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save key');
      setKey(''); setConfigured(true); setMessage('Gemini API key saved');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save key'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 border-t border-zinc-800 pt-4">
    <h3 className="text-sm font-semibold">TikTok connection</h3>
    <p className="text-xs text-zinc-400">Showcase sync reads your existing signed-in Chrome tab. No extension or separate Chrome profile is used.</p>
    <h3 className="text-sm font-semibold">Gemini AI</h3>
    <p className="text-xs text-zinc-400">{configured ? 'API key configured. Enter a new key to replace it.' : 'Set an API key to analyze products and generate sales scripts.'}</p>
    <label htmlFor="gemini-key" className="block text-xs">Gemini API key</label>
    <div className="flex gap-2"><input id="gemini-key" type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} placeholder={configured ? '•••••••• (saved)' : 'Enter API key'} className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-800 p-2 text-sm" /><button type="button" disabled={busy || !key.trim()} onClick={save} className="rounded-xl bg-slate-700 px-4 py-2 text-sm disabled:opacity-40">{busy ? 'Saving...' : 'Save key'}</button></div>
    <p className="text-xs text-zinc-400">Stored on this computer, excluded from Git. The saved key is never displayed.</p>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
