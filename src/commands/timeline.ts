// NLE timeline edit commands: blade (split at playhead), lift (delete keep gap),
// ripple (delete and close gap on the same tier).
//
// These mutate annotations through the existing annotationsProvider so undo
// later flows through the same (forward, inverse) command-pair pattern as the
// rest. For Phase 3.6 we only ship the forward direction; Phase 4 adds undo.

import type { Annotation } from '@/domain/envelope';
import { fromMicros, intervalToMicros } from '@/domain/time';
import { annotationsProvider } from '@/store/factories';
import { useTransportStore } from '@/stores/transport';
import { defineCommand } from 'command-wrapex';
import { z } from 'zod';

// --- helpers --------------------------------------------------------------

async function loadAnnotation(id: string): Promise<Annotation> {
  return annotationsProvider.getOne(id);
}

function intervalAt(start: number, end: number, rate: number) {
  // Spans must be non-empty; bump end by one tick if the user hits exactly the
  // playhead (avoids a degenerate zero-length annotation).
  return {
    start: fromMicros(Math.max(0, start), rate),
    end: fromMicros(Math.max(start + 1, end), rate),
  };
}

function withInterval(ann: Annotation, start: number, end: number) {
  const interval = ann.reference.interval;
  if (!interval) throw new Error('annotation has no interval to edit');
  const rate = interval.start.r;
  return {
    ...ann.reference,
    interval: intervalAt(start, end, rate),
  };
}

// --- commands -------------------------------------------------------------

export const bladeCmd = defineCommand({
  id: 'lacing.timeline.blade',
  label: 'Blade at playhead',
  category: 'Timeline',
  description:
    'Split the selected annotation at the current playhead into two pieces. The right half is created as a new annotation that copies tier, body, and provenance.',
  schema: z.object({ id: z.string().uuid() }),
  keybinding: { key: 'B' },
  when: 'selection.kind === "annotation"',
  execute: async ({ id }) => {
    const ann = await loadAnnotation(id);
    const interval = ann.reference.interval;
    if (!interval) {
      return { success: false, message: 'annotation has no interval' };
    }
    const playhead = useTransportStore.getState().playhead;
    const { start, end } = intervalToMicros(interval);
    if (playhead <= start || playhead >= end) {
      return { success: false, message: 'playhead is outside the annotation' };
    }
    // Left: shrink to [start, playhead).
    const leftRef = withInterval(ann, start, playhead);
    await annotationsProvider.update(id, { reference: leftRef });
    // Right: new annotation [playhead, end).
    const rightRef = withInterval(ann, playhead, end);
    const right = {
      ...ann,
      id: crypto.randomUUID(),
      reference: rightRef,
    };
    const created = await annotationsProvider.create(right);
    return { success: true, message: `Split into ${id} + ${created.id}`, data: created };
  },
});

export const liftCmd = defineCommand({
  id: 'lacing.timeline.lift',
  label: 'Lift (delete, keep gap)',
  category: 'Timeline',
  description: 'Delete the selected annotation. Other annotations on the same tier do not move.',
  schema: z.object({ id: z.string().uuid() }),
  keybinding: { key: 'Delete' },
  when: 'selection.kind === "annotation"',
  execute: async ({ id }) => {
    await annotationsProvider.delete(id);
    return { success: true, message: `Lifted ${id}` };
  },
});

export const rippleCmd = defineCommand({
  id: 'lacing.timeline.ripple',
  label: 'Ripple delete (close gap)',
  category: 'Timeline',
  description:
    'Delete the selected annotation and shift every later annotation on the same tier earlier by the deleted duration.',
  schema: z.object({ id: z.string().uuid() }),
  keybinding: { key: 'Backspace', shift: true },
  when: 'selection.kind === "annotation"',
  execute: async ({ id }) => {
    const ann = await loadAnnotation(id);
    const interval = ann.reference.interval;
    if (!interval) {
      return { success: false, message: 'annotation has no interval' };
    }
    const { start, end } = intervalToMicros(interval);
    const duration = end - start;

    // Delete first, then shift later siblings on the same tier.
    await annotationsProvider.delete(id);

    const all = await annotationsProvider.getList({});
    const toShift = all.data.filter((a) => {
      if (a.id === id) return false;
      if (a.tier !== ann.tier) return false;
      const ai = a.reference.interval;
      if (!ai) return false;
      return intervalToMicros(ai).start >= end;
    });

    for (const a of toShift) {
      const ai = a.reference.interval;
      if (!ai) continue;
      const { start: s, end: e } = intervalToMicros(ai);
      const newRef = withInterval(a, s - duration, e - duration);
      await annotationsProvider.update(a.id, { reference: newRef });
    }
    return {
      success: true,
      message: `Rippled ${id} (-${duration}μs across ${toShift.length} sibling${toShift.length === 1 ? '' : 's'})`,
    };
  },
});

export const timelineCommands = [bladeCmd, liftCmd, rippleCmd];
