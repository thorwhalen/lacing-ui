// Phase 3.6 — Timeline + blade/lift/ripple command tests.
//
// Focus on the wiring (rows render, clicks dispatch, commands rewrite the
// store correctly through the provider), not on dnd-kit's drag mechanics
// which need full pointer events.

import { registerAllCommands, registry } from '@/commands';
import type { Tier } from '@/domain/collections';
import type { Annotation } from '@/domain/envelope';
import { makeHandlers } from '@/mocks/handlers';
import { server } from '@/mocks/server';
import { useTransportStore } from '@/stores/transport';
import { useUiStore } from '@/stores/ui';
import { Timeline } from '@/ui/timeline';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  registerAllCommands();
});

const tier = (name: string, parent: string | null = null): Tier => ({
  name,
  stereotype: parent ? 'TIME_SUBDIVISION' : 'NONE',
  parent: parent ?? undefined,
  metadata: {},
});

const ann = (
  id: string,
  tierName: string,
  startMicros: number,
  endMicros: number,
  text = 'x',
): Annotation => ({
  id,
  tier: tierName,
  reference: {
    kind: 'media',
    asset_id: 'sha256:test',
    interval: {
      start: { v: Math.round((startMicros / 1_000_000) * 24000), r: 24000 },
      end: { v: Math.round((endMicros / 1_000_000) * 24000), r: 24000 },
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
  useUiStore.getState().setSelection({ kind: 'none' });
  useTransportStore.setState({ playhead: 0, rate: 0, playing: false });
});

// --- Timeline rendering ---------------------------------------------------

describe('Timeline', () => {
  it('renders one sidebar label per tier', () => {
    server.use(...makeHandlers());
    const tiers = [tier('words'), tier('phonemes', 'words'), tier('visemes')];
    render(<Timeline annotations={[]} tiers={tiers} />);
    expect(screen.getByText('words')).toBeInTheDocument();
    expect(screen.getByText('phonemes')).toBeInTheDocument();
    expect(screen.getByText('visemes')).toBeInTheDocument();
  });

  it('renders rows when the tier count exceeds the virtualize threshold', () => {
    server.use(...makeHandlers());
    // 50 > VIRTUALIZE_THRESHOLD (30) — exercises the virtualizer branch.
    const tiers = Array.from({ length: 50 }, (_, i) => tier(`tier-${i}`));
    render(<Timeline annotations={[]} tiers={tiers} />);
    // We don't assert all 50 — virtualization will only render visible ones —
    // but at least the first one should always be in view.
    expect(screen.getByText('tier-0')).toBeInTheDocument();
  });

  it('renders an item per annotation; click dispatches selection', async () => {
    server.use(...makeHandlers());
    const a = ann('11111111-1111-4111-8111-111111111111', 'words', 0, 500_000, 'hello');
    const user = userEvent.setup();
    render(<Timeline annotations={[a]} tiers={[tier('words')]} />);
    const item = await screen.findByText('hello');
    await user.click(item);
    await waitFor(() =>
      expect(useUiStore.getState().selection).toEqual({
        kind: 'annotation',
        id: a.id,
      }),
    );
  });
});

// --- blade/lift/ripple commands ------------------------------------------

describe('lacing.timeline.blade', () => {
  it('shrinks the original to [start, playhead) and creates a new annotation [playhead, end)', async () => {
    const a = ann('22222222-2222-4222-8222-222222222222', 'words', 0, 1_000_000, 'split-me');
    server.use(...makeHandlers({ annotations: [a] }));

    useTransportStore.getState().setPlayhead(400_000);
    useUiStore.getState().setSelection({ kind: 'annotation', id: a.id });

    const result = await registry.execute(
      'lacing.timeline.blade',
      { id: a.id },
      { source: 'test' },
    );
    expect(result.success).toBe(true);

    // Validate the resulting list.
    const response = await fetch('/api/annotations');
    const items = (await response.json()) as Annotation[];
    expect(items).toHaveLength(2);
    const left = items.find((x) => x.id === a.id)!;
    const right = items.find((x) => x.id !== a.id)!;
    expect(left.reference.interval?.end.v).toBe((400_000 / 1_000_000) * 24000);
    expect(right.reference.interval?.start.v).toBe((400_000 / 1_000_000) * 24000);
    expect(right.reference.interval?.end.v).toBe((1_000_000 / 1_000_000) * 24000);
    expect(right.body).toEqual({ text: 'split-me' });
  });

  it('refuses when the playhead is outside the annotation', async () => {
    const a = ann('33333333-3333-4333-8333-333333333333', 'words', 100_000, 500_000);
    server.use(...makeHandlers({ annotations: [a] }));

    useTransportStore.getState().setPlayhead(900_000);
    useUiStore.getState().setSelection({ kind: 'annotation', id: a.id });

    const result = await registry.execute(
      'lacing.timeline.blade',
      { id: a.id },
      { source: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/outside/i);
  });
});

describe('lacing.timeline.ripple', () => {
  it('deletes the annotation and shifts later siblings on the same tier', async () => {
    const a = ann('44444444-4444-4444-8444-444444444444', 'words', 0, 500_000, 'a');
    const b = ann('55555555-5555-4555-8555-555555555555', 'words', 600_000, 1_000_000, 'b');
    const c = ann('66666666-6666-4666-8666-666666666666', 'phonemes', 600_000, 1_000_000, 'c');
    server.use(...makeHandlers({ annotations: [a, b, c] }));

    useUiStore.getState().setSelection({ kind: 'annotation', id: a.id });

    const result = await registry.execute(
      'lacing.timeline.ripple',
      { id: a.id },
      { source: 'test' },
    );
    expect(result.success).toBe(true);

    const response = await fetch('/api/annotations');
    const items = (await response.json()) as Annotation[];
    // a is gone; b is shifted by -500ms; c (different tier) is unchanged.
    expect(items.find((x) => x.id === a.id)).toBeUndefined();
    const bAfter = items.find((x) => x.id === b.id)!;
    const cAfter = items.find((x) => x.id === c.id)!;
    const expectedV = (100_000 / 1_000_000) * 24000;
    expect(bAfter.reference.interval?.start.v).toBe(expectedV);
    expect(cAfter.reference.interval?.start.v).toBe((600_000 / 1_000_000) * 24000);
  });
});
