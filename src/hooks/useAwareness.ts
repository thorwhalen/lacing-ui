// useAwareness — React hook for Yjs Awareness presence (Phase 4-A).
//
// Lifecycle: connects on mount, disposes on unmount. Reads local
// playhead and selection from the existing zustand stores and pushes
// them to the awareness channel; returns remote peers' states for
// rendering (e.g. RemoteCursors overlay on the Timeline).
//
// Local user identity is generated once per browser session and
// persisted in sessionStorage so a refresh keeps the same color/name
// (peers see the disconnect/reconnect, but their stable identifier
// for "you" is preserved within a session).

import { type PresenceState, connectAwareness } from '@/lib/awareness';
import { useTransportStore } from '@/stores/transport';
import { useUiStore } from '@/stores/ui';
import { useEffect, useRef, useState } from 'react';

export interface RemotePresence extends PresenceState {
  /** y-protocols clientID — stable for the lifetime of a peer's connection. */
  clientId: number;
}

const COLORS = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

function getOrCreateLocalUser(): { name: string; color: string } {
  if (typeof sessionStorage === 'undefined') {
    return { name: 'Anon', color: COLORS[0] ?? '#3b82f6' };
  }
  const raw = sessionStorage.getItem('lacing.user');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { name: string; color: string };
      if (parsed.name && parsed.color) return parsed;
    } catch {
      // fall through to generate
    }
  }
  const n = Math.floor(Math.random() * 1000);
  const fresh = {
    name: `User-${n}`,
    color: COLORS[n % COLORS.length] ?? '#3b82f6',
  };
  sessionStorage.setItem('lacing.user', JSON.stringify(fresh));
  return fresh;
}

export interface UseAwarenessOptions {
  projectId: string;
  /** Override the WebSocket URL (used by tests). */
  url?: string;
  /** Override the WebSocket factory (used by tests). */
  wsFactory?: (url: string) => WebSocket;
  /** Disable the hook entirely — useful in tests where we don't want a connection. */
  enabled?: boolean;
}

export function useAwareness(opts: UseAwarenessOptions) {
  const { projectId, url, wsFactory, enabled = true } = opts;
  const [remote, setRemote] = useState<RemotePresence[]>([]);
  const connectionRef = useRef<ReturnType<typeof connectAwareness> | null>(null);

  const playhead = useTransportStore((s) => s.playhead);
  const playing = useTransportStore((s) => s.playing);
  const selection = useUiStore((s) => s.selection);

  // Connect once per (enabled, projectId) pair. If those change we tear down
  // and reopen — they don't change in the demo App but tests may flip them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: url/wsFactory are stable per mount in tests; we deliberately don't reconnect on identity changes.
  useEffect(() => {
    if (!enabled) return;
    const conn = connectAwareness({ projectId, url, wsFactory });
    connectionRef.current = conn;

    const user = getOrCreateLocalUser();
    conn.awareness.setLocalState({
      user,
      playhead: null,
      selectionId: null,
    } satisfies PresenceState);

    const recompute = () => {
      const states = conn.awareness.getStates();
      const out: RemotePresence[] = [];
      for (const [clientId, state] of states) {
        if (clientId === conn.awareness.clientID) continue;
        const s = state as Partial<PresenceState> | undefined;
        if (!s || !s.user) continue;
        out.push({
          clientId,
          user: s.user,
          playhead: s.playhead ?? null,
          selectionId: s.selectionId ?? null,
        });
      }
      setRemote(out);
    };
    conn.awareness.on('change', recompute);
    recompute();

    return () => {
      conn.awareness.off('change', recompute);
      conn.dispose();
      connectionRef.current = null;
      setRemote([]);
    };
  }, [enabled, projectId]);

  // Push local playhead + selection updates to awareness whenever they
  // change. setLocalStateField only mutates the named field, so it
  // produces minimal diffs on the wire.
  useEffect(() => {
    const conn = connectionRef.current;
    if (!conn) return;
    // Only publish a non-null playhead while playing — a static playhead
    // doesn't need to be advertised; peers infer "idle" from absence.
    conn.awareness.setLocalStateField('playhead', playing ? playhead : null);
  }, [playhead, playing]);

  useEffect(() => {
    const conn = connectionRef.current;
    if (!conn) return;
    const id = selection.kind === 'annotation' ? selection.id : null;
    conn.awareness.setLocalStateField('selectionId', id);
  }, [selection]);

  return { remote };
}
