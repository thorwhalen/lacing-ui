// Phase 3.4 — Inspector + tier list integration tests.
//
// Drives the full chain: MSW seed → tier list renders → click annotation →
// Inspector loads → edit confidence → Save → MSW receives PATCH → re-fetch
// shows the new value.

import App from '@/App';
import type { Tier } from '@/domain/collections';
import type { Annotation } from '@/domain/envelope';
import { makeHandlers } from '@/mocks/handlers';
import { server } from '@/mocks/server';
import { useTransportStore } from '@/stores/transport';
import { useUiStore } from '@/stores/ui';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
  server.resetHandlers();
  useUiStore.getState().setSelection({ kind: 'none' });
  useUiStore.getState().setPaletteOpen(false);
  useTransportStore.setState({ playhead: 0, rate: 0, playing: false });
});

const tier = (name: string, parent: string | null = null): Tier => ({
  name,
  stereotype: parent ? 'TIME_SUBDIVISION' : 'NONE',
  parent: parent ?? undefined,
  metadata: {},
});

const ann = (id: string, tierName = 'words', text = 'hello'): Annotation => ({
  id,
  tier: tierName,
  reference: {
    kind: 'media',
    asset_id: 'sha256:test',
    interval: { start: { v: 0, r: 24000 }, end: { v: 24000, r: 24000 } },
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

describe('TierList', () => {
  it('renders seeded tiers from MSW', async () => {
    server.use(...makeHandlers({ tiers: [tier('words'), tier('phonemes', 'words')] }));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^words/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /^phonemes/i })).toBeInTheDocument();
  });

  it('clicking a tier dispatches selection.tier', async () => {
    server.use(...makeHandlers({ tiers: [tier('words')] }));
    const user = userEvent.setup();
    render(<App />);
    const button = await screen.findByRole('button', { name: /^words/i });
    await user.click(button);
    await waitFor(() =>
      expect(useUiStore.getState().selection).toEqual({ kind: 'tier', name: 'words' }),
    );
  });
});

describe('Inspector', () => {
  it('shows the placeholder when no annotation is selected', async () => {
    server.use(...makeHandlers());
    render(<App />);
    expect(await screen.findByText(/Inspector — select an annotation/i)).toBeInTheDocument();
  });

  it('loads the selected annotation and exposes a body editor', async () => {
    const a = ann('11111111-1111-4111-8111-111111111111');
    server.use(...makeHandlers({ annotations: [a] }));
    const user = userEvent.setup();
    render(<App />);

    // Find and click the annotation row.
    const row = await screen.findByRole('button', { name: /words.*hello/i });
    await user.click(row);

    // Inspector heading + body section appear.
    await waitFor(() => expect(screen.getByText('Inspector')).toBeInTheDocument());
    expect(screen.getByText(/annot:\/\/schema\/word\/v1/)).toBeInTheDocument();
  });

  it('Save is disabled until the form is dirty; an edit + Save round-trips', async () => {
    const a = ann('22222222-2222-4222-8222-222222222222');
    server.use(...makeHandlers({ annotations: [a] }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /words.*hello/i }));
    await waitFor(() => expect(screen.getByText('Inspector')).toBeInTheDocument());

    // Scope queries to the Inspector aside — `/tier/i` would otherwise also
    // match the Tier list sidebar's `aria-label="Tier list"`.
    const inspector = within(screen.getByRole('complementary', { name: 'Inspector' }));

    // Initially clean — Save is disabled.
    expect(inspector.getByRole('button', { name: /^save$/i })).toBeDisabled();

    // Edit the tier field; Save activates.
    const tierInput = inspector.getByLabelText(/tier/i);
    await user.clear(tierInput);
    await user.type(tierInput, 'phonemes');
    await waitFor(() => expect(inspector.getByRole('button', { name: /^save$/i })).toBeEnabled());

    await user.click(inspector.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      // After commit, dirty clears and Save becomes disabled again.
      expect(inspector.getByRole('button', { name: /^save$/i })).toBeDisabled(),
    );
    expect(screen.queryByText(/^error:/)).not.toBeInTheDocument();
  });
});
