// Phase 3.5 — ProgramMonitor + Waveform tests.
//
// Wavesurfer can't run in jsdom (needs AudioContext + WebAudio), so we mock
// the wavesurfer modules and assert the wiring: regions are added per
// annotation, region-clicked dispatches transport.seek, ProgramMonitor
// drives <audio> from the transport store.

import { render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerAllCommands } from '@/commands';
import type { Annotation } from '@/domain/envelope';
import { server } from '@/mocks/server';
import { useTransportStore } from '@/stores/transport';
import { useUiStore } from '@/stores/ui';
import { ProgramMonitor } from '@/ui/program-monitor';
import { Waveform } from '@/ui/waveform';

// jsdom doesn't implement HTMLMediaElement play/pause; stub them.
beforeAll(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
  registerAllCommands();
});

// --- wavesurfer mocks -----------------------------------------------------

const mockRegions = {
  addedRegions: [] as Array<{ id: string; start: number; end: number }>,
  clickHandler: null as ((region: { id: string; start: number; end: number }) => void) | null,
  addRegion(opts: { id: string; start: number; end: number }) {
    mockRegions.addedRegions.push(opts);
    return opts;
  },
  clearRegions() {
    mockRegions.addedRegions = [];
  },
  on(_event: string, cb: (region: { id: string; start: number; end: number }) => void) {
    mockRegions.clickHandler = cb;
  },
};

vi.mock('wavesurfer.js', () => ({
  default: {
    create: () => ({
      destroy: () => undefined,
      registerPlugin: <T,>(plugin: T) => plugin,
    }),
  },
}));
vi.mock('wavesurfer.js/dist/plugins/regions.esm.js', () => ({
  default: { create: () => mockRegions },
}));

// --- helpers --------------------------------------------------------------

const ann = (id: string, startMicros: number, endMicros: number, text = 'x'): Annotation => ({
  id,
  tier: 'words',
  reference: {
    kind: 'media',
    asset_id: 'sha256:test',
    interval: {
      start: { v: (startMicros / 1_000_000) * 24000, r: 24000 },
      end: { v: (endMicros / 1_000_000) * 24000, r: 24000 },
    },
  },
  body: { text },
  body_schema_uri: 'annot://schema/word/v1',
  provenance: {
    was_generated_by: 'user:test',
    was_attributed_to: 'test',
    was_derived_from: [],
    generated_at_time: { v: 0, r: 1 },
    activity: 'create',
  },
});

afterEach(() => {
  server.resetHandlers();
  mockRegions.addedRegions = [];
  mockRegions.clickHandler = null;
  useUiStore.getState().setSelection({ kind: 'none' });
  useTransportStore.setState({ playhead: 0, rate: 0, playing: false });
});

// --- ProgramMonitor -------------------------------------------------------

describe('ProgramMonitor', () => {
  it('renders an audio element with the given src and shares it via onAudioElement', () => {
    let captured: HTMLAudioElement | null = null;
    const { container } = render(
      <ProgramMonitor src="/sample.wav" onAudioElement={(el) => (captured = el)} />,
    );
    const audio = container.querySelector('audio');
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute('src')).toBe('/sample.wav');
    expect(captured).not.toBeNull();
  });

  it('updates playbackRate when the transport store rate changes', () => {
    let captured: HTMLAudioElement | null = null;
    render(<ProgramMonitor src="/sample.wav" onAudioElement={(el) => (captured = el)} />);
    expect(captured).not.toBeNull();
    useTransportStore.getState().setRate(2);
    expect(captured!.playbackRate).toBe(2);
  });
});

// --- Waveform -------------------------------------------------------------

describe('Waveform', () => {
  it('registers one region per annotation with seconds bounds', async () => {
    const audio = document.createElement('audio');
    render(
      <Waveform
        url="/sample.wav"
        annotations={[ann('a1', 0, 1_000_000), ann('a2', 1_000_000, 2_000_000)]}
        audioElement={audio}
      />,
    );
    // The dynamic import happens inside an async effect; flush microtasks.
    await new Promise((r) => setTimeout(r, 10));
    expect(mockRegions.addedRegions).toHaveLength(2);
    expect(mockRegions.addedRegions[0]).toMatchObject({ id: 'a1', start: 0, end: 1 });
    expect(mockRegions.addedRegions[1]).toMatchObject({ id: 'a2', start: 1, end: 2 });
  });

  it('dispatches lacing.transport.seek when a region is clicked', async () => {
    const audio = document.createElement('audio');
    render(
      <Waveform
        url="/sample.wav"
        annotations={[ann('a1', 500_000, 1_000_000)]}
        audioElement={audio}
      />,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(mockRegions.clickHandler).not.toBeNull();
    mockRegions.clickHandler?.({ id: 'a1', start: 0.5, end: 1 });
    // The command runs through wrapex middleware (async). Flush.
    await new Promise((r) => setTimeout(r, 0));
    expect(useTransportStore.getState().playhead).toBe(500_000);
  });
});
