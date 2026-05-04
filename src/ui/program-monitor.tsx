// ProgramMonitor — owns the shared <audio> element. Subscribes to the
// transport store for playhead/playing/rate; emits playhead updates back
// into the store on `timeupdate` so JKL keys, the waveform, and the inspector
// all stay aligned.

import { cn } from '@/lib/utils';
import { useTransportStore } from '@/stores/transport';
import { useEffect, useRef } from 'react';

interface ProgramMonitorProps {
  /** Audio source URL. Phase 3.5 supports audio only; video lands in Phase 3.7. */
  src: string;
  className?: string;
  /** Called once on mount with the audio element so the waveform can share it. */
  onAudioElement?: (el: HTMLAudioElement) => void;
}

export function ProgramMonitor({ src, className, onAudioElement }: ProgramMonitorProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    onAudioElement?.(el);

    function handleTimeUpdate() {
      if (!el) return;
      const micros = Math.round(el.currentTime * 1_000_000);
      const current = useTransportStore.getState().playhead;
      // Avoid feedback loops with our own setPlayhead pushes.
      if (Math.abs(micros - current) > 5_000) {
        useTransportStore.getState().setPlayhead(micros);
      }
    }
    function handleEnded() {
      useTransportStore.getState().setRate(0);
    }

    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('ended', handleEnded);
    return () => {
      el.removeEventListener('timeupdate', handleTimeUpdate);
      el.removeEventListener('ended', handleEnded);
    };
  }, [onAudioElement]);

  // Drive playback from the transport store. Subscribing inside an effect so
  // we always read the latest element reference.
  useEffect(() => {
    return useTransportStore.subscribe((state, prev) => {
      const el = audioRef.current;
      if (!el) return;
      if (state.playing !== prev.playing) {
        if (state.playing) void el.play().catch(() => undefined);
        else el.pause();
      }
      if (state.rate !== prev.rate && state.rate !== 0) {
        // jkl multipliers can be negative — HTML <audio> ignores negative
        // playbackRate, so backward play is a Phase 4 thing (needs custom
        // scrubber). For now, clamp to forward play.
        el.playbackRate = Math.max(0.25, Math.abs(state.rate));
      }
    });
  }, []);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* biome-ignore lint/a11y/useMediaCaption: Captions come from a future
          WebVTT adapter that hooks into this same audio element. */}
      <audio ref={audioRef} src={src} controls preload="metadata" className="w-full" />
    </div>
  );
}
