// Transport commands — JKL, spacebar, in/out marks. They mutate the
// transportStore; the wavesurfer wrapper (Phase 3.5) subscribes and drives
// the audio element.

import { useTransportStore } from '@/stores/transport';
import { defineCommand } from 'command-wrapex';
import { z } from 'zod';

export const playPauseCmd = defineCommand({
  id: 'lacing.transport.playPause',
  label: 'Play / Pause',
  category: 'Transport',
  keybinding: { key: ' ' },
  execute: async () => {
    const t = useTransportStore.getState();
    if (t.playing) t.setRate(0);
    else t.setRate(1);
    return { success: true };
  },
});

export const playForwardCmd = defineCommand({
  id: 'lacing.transport.l',
  label: 'JKL: forward (L)',
  category: 'Transport',
  keybinding: { key: 'L' },
  execute: async () => {
    useTransportStore.getState().jkl('L');
    return { success: true };
  },
});

export const stopCmd = defineCommand({
  id: 'lacing.transport.k',
  label: 'JKL: stop (K)',
  category: 'Transport',
  keybinding: { key: 'K' },
  execute: async () => {
    useTransportStore.getState().jkl('K');
    return { success: true };
  },
});

export const playBackwardCmd = defineCommand({
  id: 'lacing.transport.j',
  label: 'JKL: backward (J)',
  category: 'Transport',
  keybinding: { key: 'J' },
  execute: async () => {
    useTransportStore.getState().jkl('J');
    return { success: true };
  },
});

export const seekCmd = defineCommand({
  id: 'lacing.transport.seek',
  label: 'Seek',
  category: 'Transport',
  description: 'Jump the playhead to a specific time (microseconds).',
  schema: z.object({ micros: z.number().int().nonnegative() }),
  execute: async ({ micros }) => {
    useTransportStore.getState().setPlayhead(micros);
    return { success: true };
  },
});

export const setInMarkCmd = defineCommand({
  id: 'lacing.transport.markIn',
  label: 'Mark in (I)',
  category: 'Transport',
  keybinding: { key: 'I' },
  execute: async () => {
    const { playhead, setInMark } = useTransportStore.getState();
    setInMark(playhead);
    return { success: true };
  },
});

export const setOutMarkCmd = defineCommand({
  id: 'lacing.transport.markOut',
  label: 'Mark out (O)',
  category: 'Transport',
  keybinding: { key: 'O' },
  execute: async () => {
    const { playhead, setOutMark } = useTransportStore.getState();
    setOutMark(playhead);
    return { success: true };
  },
});

export const clearMarksCmd = defineCommand({
  id: 'lacing.transport.clearMarks',
  label: 'Clear in/out marks',
  category: 'Transport',
  execute: async () => {
    const t = useTransportStore.getState();
    t.setInMark(null);
    t.setOutMark(null);
    return { success: true };
  },
});

export const transportCommands = [
  playPauseCmd,
  playForwardCmd,
  playBackwardCmd,
  stopCmd,
  seekCmd,
  setInMarkCmd,
  setOutMarkCmd,
  clearMarksCmd,
];
