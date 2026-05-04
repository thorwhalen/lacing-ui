// Phase 3.7 surface tests — theme, ARIA keyboard nav, FileBar, auto-save.

import App from '@/App';
import { registerAllCommands } from '@/commands';
import type { Tier } from '@/domain/collections';
import type { Annotation } from '@/domain/envelope';
import { makeHandlers } from '@/mocks/handlers';
import { server } from '@/mocks/server';
import { useThemeStore } from '@/stores/theme';
import { useTransportStore } from '@/stores/transport';
import { useUiStore } from '@/stores/ui';
import { Timeline } from '@/ui/timeline';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  registerAllCommands();
});

const tier = (name: string): Tier => ({
  name,
  stereotype: 'NONE',
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
  document.documentElement.classList.remove('dark');
});

// --- Theme ---------------------------------------------------------------

describe('Theme store', () => {
  it('toggles the .dark class on <html> when theme = dark', () => {
    useThemeStore.getState().setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    useThemeStore.getState().setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persists the chosen theme in localStorage', () => {
    useThemeStore.getState().setTheme('dark');
    expect(window.localStorage.getItem('lacing.theme')).toBe('dark');
    useThemeStore.getState().setTheme('system');
    expect(window.localStorage.getItem('lacing.theme')).toBe('system');
  });
});

// --- FileBar -------------------------------------------------------------

describe('FileBar export', () => {
  it('exports the active store and triggers a Blob download', async () => {
    const a = ann('11111111-2222-3333-4444-555555555555', 'words', 0, 1_000_000, 'hi');
    server.use(...makeHandlers({ annotations: [a] }));

    // Capture the download URL to confirm a Blob was created.
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /save as/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    revokeObjectURL.mockRestore();
    createObjectURL.mockRestore();
  });
});

// --- ARIA grid keyboard navigation ---------------------------------------

describe('Timeline ARIA keyboard navigation', () => {
  it('right-arrow moves selection to the next item on the same tier', async () => {
    const a = ann('a1111111-2222-3333-4444-555555555555', 'words', 0, 500_000, 'a');
    const b = ann('b2222222-3333-4444-5555-666666666666', 'words', 600_000, 1_000_000, 'b');
    server.use(...makeHandlers());

    useUiStore.getState().setSelection({ kind: 'annotation', id: a.id });
    render(<Timeline annotations={[a, b]} tiers={[tier('words')]} />);

    const grid = screen.getByRole('grid');
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(useUiStore.getState().selection).toEqual({ kind: 'annotation', id: b.id }),
    );
  });

  it('down-arrow moves selection to the nearest item on the next tier', async () => {
    const a = ann('a1111111-2222-3333-4444-555555555555', 'words', 200_000, 800_000, 'a');
    const b = ann('b2222222-3333-4444-5555-666666666666', 'phonemes', 0, 400_000, 'b');
    const c = ann('c3333333-4444-5555-6666-777777777777', 'phonemes', 700_000, 1_000_000, 'c');
    server.use(...makeHandlers());

    useUiStore.getState().setSelection({ kind: 'annotation', id: a.id });
    render(<Timeline annotations={[a, b, c]} tiers={[tier('words'), tier('phonemes')]} />);

    fireEvent.keyDown(screen.getByRole('grid'), { key: 'ArrowDown' });
    await waitFor(() =>
      // a starts at 200_000; nearest in phonemes is b (start 0, dist 200_000)
      // beats c (start 700_000, dist 500_000).
      expect(useUiStore.getState().selection).toEqual({ kind: 'annotation', id: b.id }),
    );
  });
});

// --- Inspector auto-save -------------------------------------------------

describe('Inspector auto-save', () => {
  it('debounces and commits dirty edits via the registry after the timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const a = ann('11111111-2222-3333-4444-555555555555', 'words', 0, 1_000_000, 'hi');
    server.use(...makeHandlers({ annotations: [a] }));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /words.*hi/i }));
    await waitFor(() => expect(screen.getByText('Inspector')).toBeInTheDocument());

    // Scope to Inspector — `/tier/i` would otherwise also match the
    // TierList sidebar's `aria-label="Tier list"`.
    const inspector = within(screen.getByRole('complementary', { name: 'Inspector' }));
    const tierInput = inspector.getByLabelText(/tier/i);
    await user.clear(tierInput);
    await user.type(tierInput, 'phonemes');

    // Save button is enabled (dirty) but the user doesn't click it. Auto-save
    // fires after AUTOSAVE_DELAY_MS (5s).
    expect(inspector.getByRole('button', { name: /^save$/i })).toBeEnabled();
    await vi.advanceTimersByTimeAsync(5_500);

    await waitFor(() => expect(inspector.getByRole('button', { name: /^save$/i })).toBeDisabled());
    vi.useRealTimers();
  });
});
