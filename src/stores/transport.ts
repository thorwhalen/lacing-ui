// transportStore — playhead, transport rate, in/out marks. Integer microseconds
// throughout (per FRONT-DOC §4.6 + Phase 3 plan). Wire to wavesurfer in 3.5.

import { create } from 'zustand';

export interface TransportState {
  /** Playhead position in microseconds. */
  playhead: number;
  /** -2..+2 transport rate (JKL convention: J=-1, K=0, L=+1, repeated taps multiply). */
  rate: number;
  /** True when transport is moving. */
  playing: boolean;
  /** In/out marks in microseconds. null = unset. */
  inMark: number | null;
  outMark: number | null;
  setPlayhead: (m: number) => void;
  setRate: (r: number) => void;
  setPlaying: (p: boolean) => void;
  setInMark: (m: number | null) => void;
  setOutMark: (m: number | null) => void;
  /** JKL transport: J = backward, K = pause, L = forward. */
  jkl: (key: 'J' | 'K' | 'L') => void;
}

export const useTransportStore = create<TransportState>((set, get) => ({
  playhead: 0,
  rate: 0,
  playing: false,
  inMark: null,
  outMark: null,
  setPlayhead: (playhead) => set({ playhead: Math.max(0, playhead) }),
  setRate: (rate) => set({ rate, playing: rate !== 0 }),
  setPlaying: (playing) => set({ playing }),
  setInMark: (inMark) => set({ inMark }),
  setOutMark: (outMark) => set({ outMark }),
  jkl: (key) => {
    const { rate } = get();
    if (key === 'K') {
      set({ rate: 0, playing: false });
    } else if (key === 'L') {
      set({ rate: rate >= 1 ? rate * 2 : 1, playing: true });
    } else {
      set({ rate: rate <= -1 ? rate * 2 : -1, playing: true });
    }
  },
}));
