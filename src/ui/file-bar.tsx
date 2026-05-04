// Open / save bar in the App shell.
//
// Wires the existing `lacing.io.import` and `lacing.io.export` commands to a
// file input + a Blob download. Same registry path the palette uses, so an
// AI agent or a test could trigger import/export the same way.

import { registry } from '@/commands';
import type { AdapterFormat } from '@/commands/io';
import { Button } from '@/ui/button';
import { type ChangeEvent, useRef, useState } from 'react';

const FORMATS: { value: AdapterFormat; label: string; ext: string; mime: string }[] = [
  { value: 'annot', label: '.annot (SQLite)', ext: 'annot', mime: 'application/octet-stream' },
  {
    value: 'web-annotation',
    label: 'Web Annotation JSON-LD',
    ext: 'jsonld',
    mime: 'application/ld+json',
  },
  { value: 'webvtt', label: 'WebVTT', ext: 'vtt', mime: 'text/vtt' },
  { value: 'eaf', label: 'ELAN EAF', ext: 'eaf', mime: 'application/xml' },
  { value: 'jams', label: 'JAMS', ext: 'jams', mime: 'application/json' },
  { value: 'textgrid', label: 'Praat TextGrid', ext: 'TextGrid', mime: 'text/plain' },
  { value: 'label-studio', label: 'Label Studio JSON', ext: 'json', mime: 'application/json' },
  { value: 'otio', label: 'OpenTimelineIO', ext: 'otio', mime: 'application/json' },
];

interface FileBarProps {
  onAfterImport?: () => void;
}

export function FileBar({ onAfterImport }: FileBarProps) {
  const [format, setFormat] = useState<AdapterFormat>('annot');
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'idle' | 'import' | 'export'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy('import');
    setError(null);
    try {
      // Binary formats (.annot) need an ArrayBuffer; text formats also work
      // as ArrayBuffer because the server reads raw bytes.
      const content = await file.arrayBuffer();
      const result = await registry.execute(
        'lacing.io.import',
        { format, content },
        { source: 'file-bar' },
      );
      if (!result.success) throw new Error(result.message ?? 'import failed');
      onAfterImport?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('idle');
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function handleExport() {
    setBusy('export');
    setError(null);
    try {
      const result = await registry.execute('lacing.io.export', { format }, { source: 'file-bar' });
      if (!result.success) throw new Error(result.message ?? 'export failed');
      const data = result.data as { blob: Blob } | undefined;
      if (!data?.blob) throw new Error('export returned no blob');
      const meta = FORMATS.find((f) => f.value === format);
      const filename = `lacing-export.${meta?.ext ?? 'bin'}`;
      triggerDownload(data.blob, filename, meta?.mime);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('idle');
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Format</span>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as AdapterFormat)}
          className="rounded-md border bg-background px-2 py-1 text-xs"
          aria-label="Adapter format"
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <input
        ref={fileInput}
        type="file"
        className="sr-only"
        onChange={handleFileChosen}
        aria-label="Import file"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy !== 'idle'}
        onClick={() => fileInput.current?.click()}
      >
        {busy === 'import' ? 'Importing…' : 'Open…'}
      </Button>
      <Button size="sm" variant="outline" disabled={busy !== 'idle'} onClick={handleExport}>
        {busy === 'export' ? 'Exporting…' : 'Save as…'}
      </Button>
      {error && <span className="text-xs text-destructive">error: {error}</span>}
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string, mime?: string) {
  const typed = mime ? new Blob([blob], { type: mime }) : blob;
  const url = URL.createObjectURL(typed);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
