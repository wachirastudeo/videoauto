'use client';

import { useEffect, useRef, useState } from 'react';

export default function VoiceRecorder({ product, onClose }: { product: { id: string; name: string; folder_path: string }; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const context = useRef<AudioContext | null>(null);
  const frame = useRef(0);
  const [paused, setPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [level, setLevel] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  useEffect(() => () => { stream.current?.getTracks().forEach(track => track.stop()); cancelAnimationFrame(frame.current); void context.current?.close(); }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    if (!recording || paused) return;
    const timer = setInterval(() => setSeconds(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recording, paused]);
  const start = async () => {
    setError(''); setSaved('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Microphone recording requires Chrome on localhost or HTTPS.');
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput'));
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const current = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
      recorder.current = current;
      const audioContext = new AudioContext();
      context.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      audioContext.createMediaStreamSource(stream.current).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const draw = () => {
        analyser.getByteTimeDomainData(samples);
        const surface = canvas.current;
        const brush = surface?.getContext('2d');
        if (surface && brush) {
          brush.fillStyle = '#09090b'; brush.fillRect(0, 0, surface.width, surface.height);
          brush.strokeStyle = '#cbd5e1'; brush.lineWidth = 2; brush.beginPath();
          let peak = 0;
          samples.forEach((value, index) => {
            const amplitude = (value - 128) / 128;
            peak = Math.max(peak, Math.abs(amplitude));
            const x = index / samples.length * surface.width;
            const y = surface.height / 2 + amplitude * surface.height / 2;
            if (index === 0) brush.moveTo(x, y); else brush.lineTo(x, y);
          });
          brush.stroke(); setLevel(Math.round(peak * 100));
        }
        frame.current = requestAnimationFrame(draw);
      };
      draw();
      const chunks: BlobPart[] = [];
      current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      current.onstop = async () => {
        const recorded = new Blob(chunks, { type: current.mimeType });
        setBlob(recorded);
        setUrl(URL.createObjectURL(recorded));
        stream.current?.getTracks().forEach(track => track.stop());
        setRecording(false); setPaused(false); setLevel(0);
        cancelAnimationFrame(frame.current);
        try {
          const decoded = await audioContext.decodeAudioData(await recorded.arrayBuffer());
          setDuration(decoded.duration); setTrimStart(0); setTrimEnd(decoded.duration);
          const surface = canvas.current;
          const brush = surface?.getContext('2d');
          if (surface && brush) {
            const samples = decoded.getChannelData(0);
            brush.fillStyle = '#09090b'; brush.fillRect(0, 0, surface.width, surface.height);
            brush.strokeStyle = '#cbd5e1'; brush.beginPath();
            for (let x = 0; x < surface.width; x++) {
              const from = Math.floor(x / surface.width * samples.length);
              const to = Math.floor((x + 1) / surface.width * samples.length);
              let peak = 0;
              for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(samples[i]));
              brush.moveTo(x, surface.height / 2 - peak * surface.height / 2);
              brush.lineTo(x, surface.height / 2 + peak * surface.height / 2);
            }
            brush.stroke();
          }
        } catch { setError('Could not decode recording for trimming. You can still save the original.'); }
        finally { await audioContext.close(); context.current = null; }
      };
      setBlob(null); setUrl(''); setSeconds(0); setDuration(0); setPaused(false);
      current.start(1000); setRecording(true);
    } catch (cause) {
      stream.current?.getTracks().forEach(track => track.stop());
      setError(cause instanceof Error ? cause.message : 'Could not access microphone');
    }
  };
  const save = async () => {
    if (!blob) return;
    setSaving(true); setError('');
    try {
      let output = blob;
      if (duration && (trimStart > 0 || trimEnd < duration)) {
        const decoder = new AudioContext();
        try {
          const audio = await decoder.decodeAudioData(await blob.arrayBuffer());
          const from = Math.floor(trimStart * audio.sampleRate);
          const count = Math.min(audio.length, Math.floor(trimEnd * audio.sampleRate)) - from;
          if (count <= 0) throw new Error('Choose an end time after the start time.');
          const bytes = new ArrayBuffer(44 + count * 2);
          const view = new DataView(bytes);
          const text = (offset: number, value: string) => [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
          text(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
          view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
          view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * 2, true);
          view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, count * 2, true);
          for (let i = 0; i < count; i++) {
            let sample = 0;
            for (let channel = 0; channel < audio.numberOfChannels; channel++) sample += audio.getChannelData(channel)[from + i] / audio.numberOfChannels;
            sample = Math.max(-1, Math.min(1, sample));
            view.setInt16(44 + i * 2, sample * (sample < 0 ? 32768 : 32767), true);
          }
          output = new Blob([bytes], { type: 'audio/wav' });
        } finally { await decoder.close(); }
      }
      const data = new FormData(); data.set('file', output, 'recording');
      const response = await fetch(`/api/showcase/${encodeURIComponent(product.id)}/voice`, { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not save recording');
      setSaved(result.path);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save recording'); }
    finally { setSaving(false); }
  };
  const button = 'rounded-xl px-4 py-2 text-sm font-semibold bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40';
  return <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="voice-title" className="w-full max-w-3xl rounded-xl border border-zinc-700 bg-zinc-900 p-6 space-y-4 text-zinc-100">
      <h2 id="voice-title" className="font-bold text-lg">Voice studio</h2>
      <p className="text-sm text-slate-300">{product.name}</p>
      <p className="text-xs text-zinc-400 break-all">Save to: {product.folder_path}/voice/</p>
      {devices.length > 0 && <label className="block text-sm">Microphone<select disabled={recording || saving} value={deviceId} onChange={event => setDeviceId(event.target.value)} className="mt-1 w-full rounded-xl bg-zinc-800 p-2"><option value="">Default microphone</option>{devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>)}</select></label>}
      <p role="status" className={`font-mono text-3xl ${recording ? 'text-rose-400' : 'text-zinc-200'}`}>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')} {recording && <span className="text-sm">Recording</span>}</p>
      <canvas ref={canvas} width={1000} height={180} aria-label="Audio waveform" className="w-full rounded-xl border border-zinc-700 bg-zinc-950" />
      <label className="block text-xs text-zinc-400">Microphone level <meter min={0} max={100} low={10} high={90} optimum={60} value={level} className="w-full" /></label>
      {url && <audio controls src={url} className="w-full" onPlay={event => { if (duration && (event.currentTarget.currentTime < trimStart || event.currentTarget.currentTime >= trimEnd)) event.currentTarget.currentTime = trimStart; }} onTimeUpdate={event => { if (duration && event.currentTarget.currentTime >= trimEnd) event.currentTarget.pause(); }} />}
      {duration > 0 && !recording && <div className="grid grid-cols-2 gap-3 text-sm">
        <label>Start (seconds)<input type="number" min={0} max={trimEnd - 0.01} step="0.01" value={trimStart} disabled={saving} onChange={event => { setTrimStart(Math.max(0, Math.min(trimEnd - 0.01, Number(event.target.value)))); setSaved(''); }} className="block w-full bg-zinc-800 rounded-lg p-2" /></label>
        <label>End (seconds)<input type="number" min={trimStart + 0.01} max={duration} step="0.01" value={trimEnd} disabled={saving} onChange={event => { setTrimEnd(Math.min(duration, Math.max(trimStart + 0.01, Number(event.target.value)))); setSaved(''); }} className="block w-full bg-zinc-800 rounded-lg p-2" /></label>
        <p className="col-span-2 text-xs text-zinc-400">Selected: {(trimEnd - trimStart).toFixed(2)} seconds · Head and tail are trimmed when saved.</p>
      </div>}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {saved && <p role="status" className="text-sm text-slate-300 break-all">Saved: {saved}</p>}
      <div className="flex flex-wrap gap-2">
        {recording ? <button className={button} onClick={() => recorder.current?.stop()}>Stop recording</button> : <button disabled={saving} className={button} onClick={start}>{blob ? 'Record again' : 'Start recording'}</button>}
        {recording && <button className={button} onClick={() => { if (paused) recorder.current?.resume(); else recorder.current?.pause(); setPaused(!paused); }}>{paused ? 'Resume' : 'Pause'}</button>}
        <button className={button + ' bg-slate-700'} disabled={!blob || recording || saving || !!saved} onClick={save}>{saving ? 'Saving...' : 'Save to product'}</button>
        <button className={button} disabled={recording || saving} onClick={onClose}>Close</button>
      </div>
    </section>
  </div>;
}
