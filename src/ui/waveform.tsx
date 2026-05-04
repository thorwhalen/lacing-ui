// Waveform — wavesurfer.js v7 wrapper.
//
// Lazy-loads wavesurfer (it pulls AudioContext at import time, which jsdom
// can't service), shares its <audio> element with ProgramMonitor, registers
// one region per annotation in the visible window, and dispatches
// `lacing.transport.seek` whenever the user clicks a region.
//
// The transport store is the single source of truth for playhead + playing
// state; this component is a view into it.

import { registry } from '@/commands';
import type { Annotation } from '@/domain/envelope';
import { intervalToMicros } from '@/domain/time';
import { cn } from '@/lib/utils';
import { useTransportStore } from '@/stores/transport';
import { useEffect, useRef, useState } from 'react';

interface WaveformProps {
  /** Audio URL (or relative path served by the dev server). */
  url: string;
  /** Annotations whose intervals should appear as regions. */
  annotations: Annotation[];
  /** Shared HTMLAudioElement — also driven by ProgramMonitor. */
  audioElement: HTMLAudioElement | null;
  className?: string;
}

// Minimal shape of the wavesurfer instance we actually use. Keeps TS happy
// without depending on wavesurfer's exported types at the top level (lazy).
interface WSRegion {
  id: string;
  start: number;
  end: number;
  remove?: () => void;
}
interface WSRegionsPlugin {
  addRegion: (opts: {
    id: string;
    start: number;
    end: number;
    color?: string;
    content?: string;
    drag?: boolean;
    resize?: boolean;
  }) => WSRegion;
  clearRegions: () => void;
  on: (event: 'region-clicked', cb: (region: WSRegion, e: MouseEvent) => void) => void;
}
interface WSInstance {
  destroy: () => void;
  registerPlugin: <T>(plugin: T) => T;
}

export function Waveform({ url, annotations, audioElement, className }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WSInstance | null>(null);
  // Tick the regions effect once wavesurfer is ready, so the initial
  // annotation set lands on a freshly-mounted plugin instance.
  const [regions, setRegions] = useState<WSRegionsPlugin | null>(null);

  // Boot wavesurfer once we have both a container and the shared audio element.
  useEffect(() => {
    if (!containerRef.current || !audioElement) return;
    const container = containerRef.current;
    let cancelled = false;

    (async () => {
      const [{ default: WaveSurfer }, { default: Regions }] = await Promise.all([
        import('wavesurfer.js'),
        import('wavesurfer.js/dist/plugins/regions.esm.js'),
      ]);
      if (cancelled) return;

      const ws = WaveSurfer.create({
        container,
        url,
        media: audioElement,
        height: 80,
        waveColor: 'oklch(0.708 0 0)',
        progressColor: 'oklch(0.205 0 0)',
        cursorColor: 'oklch(0.577 0.245 27.325)',
        normalize: true,
      }) as unknown as WSInstance;
      wsRef.current = ws;

      const regionsPlugin = ws.registerPlugin(Regions.create()) as WSRegionsPlugin;
      regionsPlugin.on('region-clicked', (region) => {
        // region.start is seconds; convert to microseconds for the transport store.
        const micros = Math.round(region.start * 1_000_000);
        void registry.execute('lacing.transport.seek', { micros }, { source: 'waveform' });
      });
      setRegions(regionsPlugin);
    })();

    return () => {
      cancelled = true;
      wsRef.current?.destroy();
      wsRef.current = null;
      setRegions(null);
    };
  }, [url, audioElement]);

  // Re-render regions whenever the annotation set OR the regions plugin
  // becomes available. Cheap full-reset for now (Phase 3.5 only renders
  // dozens of words at a time); Phase 3.6's virtualized timeline body will
  // move to incremental diffing.
  useEffect(() => {
    if (!regions) return;
    regions.clearRegions();
    for (const ann of annotations) {
      const interval = ann.reference.interval;
      if (!interval) continue;
      const { start, end } = intervalToMicros(interval);
      regions.addRegion({
        id: ann.id,
        start: start / 1_000_000,
        end: end / 1_000_000,
        color: 'oklch(0.7 0.18 250 / 0.25)',
        content: String(ann.body.text ?? ann.tier),
        drag: false,
        resize: false,
      });
    }
  }, [annotations, regions]);

  // Keep wavesurfer's internal cursor in sync with the transport store.
  useEffect(() => {
    return useTransportStore.subscribe((state, prev) => {
      if (state.playhead !== prev.playhead && audioElement) {
        const seconds = state.playhead / 1_000_000;
        if (Math.abs(audioElement.currentTime - seconds) > 0.05) {
          audioElement.currentTime = seconds;
        }
      }
    });
  }, [audioElement]);

  return (
    <div
      ref={containerRef}
      className={cn('w-full rounded border bg-card', className)}
      aria-label="Waveform"
    />
  );
}
