import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { registry } from '@/commands';
import { makeHandlers } from '@/mocks/handlers';
import { server } from '@/mocks/server';
import { useTransportStore } from '@/stores/transport';
import { useUiStore } from '@/stores/ui';

afterEach(() => {
  server.resetHandlers();
  useUiStore.getState().setSelection({ kind: 'none' });
  useUiStore.getState().setPaletteOpen(false);
  useTransportStore.setState({ playhead: 0, rate: 0, playing: false });
});

describe('command registry', () => {
  it('registers expected commands and they have ids', () => {
    expect(registry.size).toBeGreaterThanOrEqual(20);
    expect(registry.get('lacing.transport.playPause')).toBeDefined();
    expect(registry.get('lacing.annotations.create')).toBeDefined();
    expect(registry.get('lacing.selection.clear')).toBeDefined();
  });

  it('executes the play/pause command via the registry', async () => {
    expect(useTransportStore.getState().playing).toBe(false);
    await registry.execute('lacing.transport.playPause', undefined, { source: 'test' });
    expect(useTransportStore.getState().playing).toBe(true);
  });

  it('hides update annotation when no annotation is selected', () => {
    expect(registry.isAvailable('lacing.annotations.update')).toBe(false);
    useUiStore.getState().setSelection({ kind: 'annotation', id: 'a1' });
    expect(registry.isAvailable('lacing.annotations.update')).toBe(true);
  });
});

describe('Ctrl+K palette UX', () => {
  it('opens via the toggle button and lists available commands', async () => {
    server.use(...makeHandlers());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /commands/i }));
    expect(await screen.findByRole('dialog', { name: /palette/i })).toBeInTheDocument();
    // Parameterless commands should be visible and enabled.
    expect(screen.getByText(/Play \/ Pause/)).toBeInTheDocument();
  });

  it('filters by query', async () => {
    server.use(...makeHandlers());
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /commands/i }));
    const input = await screen.findByPlaceholderText(/search commands/i);
    await user.type(input, 'transport');
    await waitFor(() => expect(screen.getByText(/Play \/ Pause/)).toBeInTheDocument());
    expect(screen.queryByText(/Create annotation/)).not.toBeInTheDocument();
  });
});
