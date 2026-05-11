// Phase 4-A: tests for the awareness adapter.
//
// Strategy: a "wire" is a pair of MockWebSocket instances that fan out
// every binary frame one sends to the other. This lets us exercise the
// y-protocols/awareness round-trip without a real network. The wire is
// also routed through a synthetic relay that mimics the server (drops
// non-awareness types, broadcasts the rest), so failures here also
// indicate adapter/server contract drift.

import { connectAwareness, type PresenceState } from '@/lib/awareness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- MockWebSocket -------------------------------------------------------

const OPEN = 1;
const CLOSED = 3;

interface OpenEventLike {
  type: 'open';
}
interface MessageEventLike {
  type: 'message';
  data: ArrayBuffer;
}
interface CloseEventLike {
  type: 'close';
}
type ListenerEvent = OpenEventLike | MessageEventLike | CloseEventLike;
type Listener = (ev: ListenerEvent) => void;

/**
 * Minimal WebSocket-shaped object that bypasses the network. Each
 * MockWebSocket has a `peer` reference; sending on `a` arrives as a
 * message on `a.peer` after a microtask.
 */
class MockWebSocket {
  static OPEN = OPEN;
  static CLOSED = CLOSED;
  readyState = 0;
  binaryType: 'arraybuffer' | 'blob' = 'blob';
  peer: MockWebSocket | null = null;
  /**
   * Optional hook the relay simulator uses to filter or rewrite frames
   * before they hit the peer. Defaults to direct pass-through.
   */
  relay: (frame: Uint8Array) => Uint8Array | null = (f) => f;
  private listeners: Record<string, Listener[]> = {};
  url: string;

  constructor(url: string) {
    this.url = url;
    // Open on next microtask so connectAwareness can attach listeners first.
    queueMicrotask(() => {
      this.readyState = OPEN;
      this.fire({ type: 'open' });
    });
  }

  addEventListener(name: string, fn: Listener) {
    (this.listeners[name] ??= []).push(fn);
  }

  removeEventListener(name: string, fn: Listener) {
    this.listeners[name] = (this.listeners[name] ?? []).filter((x) => x !== fn);
  }

  send(data: ArrayBuffer | Uint8Array) {
    if (this.readyState !== OPEN) return;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!this.peer) return;
    const filtered = this.relay(bytes);
    if (filtered === null) return;
    queueMicrotask(() => {
      // Send the buffer to the peer as if it had arrived from the network.
      const buf = filtered.buffer.slice(
        filtered.byteOffset,
        filtered.byteOffset + filtered.byteLength,
      );
      this.peer?.fire({ type: 'message', data: buf as ArrayBuffer });
    });
  }

  close() {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.fire({ type: 'close' });
  }

  private fire(ev: ListenerEvent) {
    const ls = this.listeners[ev.type];
    if (!ls) return;
    for (const fn of ls.slice()) fn(ev);
  }
}

// Y-protocol message types echoed here so the relay simulator can drop
// the right ones. Kept in sync with src/lib/awareness.ts and
// lacing/server/awareness.py — change these together.
const MSG_SYNC = 0;

/**
 * Simulate the server relay: drop MSG_SYNC, pass everything else.
 * Use as MockWebSocket.relay.
 */
function relayDropSync(frame: Uint8Array): Uint8Array | null {
  if (frame.length === 0) return null;
  if (frame[0] === MSG_SYNC) return null;
  return frame;
}

function pair(): [MockWebSocket, MockWebSocket] {
  const a = new MockWebSocket('ws://test/a');
  const b = new MockWebSocket('ws://test/b');
  a.peer = b;
  b.peer = a;
  a.relay = relayDropSync;
  b.relay = relayDropSync;
  return [a, b];
}

// --- helpers -------------------------------------------------------------

const PRESENCE_A: PresenceState = {
  user: { name: 'Alice', color: '#ff0000' },
  playhead: 1_000_000,
  selectionId: 'ann-1',
};

const PRESENCE_B: PresenceState = {
  user: { name: 'Bob', color: '#00ff00' },
  playhead: null,
  selectionId: null,
};

// Wait until `predicate` is true, polling on microtasks. Bounded so a
// failing test fails fast rather than hanging.
async function until(predicate: () => boolean, ms = 200): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}

// --- tests ---------------------------------------------------------------

describe('awareness adapter', () => {
  // Hold references so cleanup works even if a test throws.
  let connections: ReturnType<typeof connectAwareness>[] = [];

  beforeEach(() => {
    connections = [];
  });

  afterEach(() => {
    for (const c of connections) {
      try {
        c.dispose();
      } catch {
        // ignore
      }
    }
    connections = [];
    vi.useRealTimers();
  });

  function connect(ws: MockWebSocket) {
    const c = connectAwareness({
      projectId: 'test',
      url: 'ws://mock',
      wsFactory: () => ws as unknown as WebSocket,
    });
    connections.push(c);
    return c;
  }

  it('A publishes state, B sees A as a remote peer', async () => {
    const [aSock, bSock] = pair();
    const a = connect(aSock);
    const b = connect(bSock);

    a.awareness.setLocalState(PRESENCE_A);

    await until(() => {
      // B should see A's clientID with PRESENCE_A.
      const states = b.awareness.getStates();
      const aState = states.get(a.awareness.clientID) as PresenceState | undefined;
      return aState?.user.name === 'Alice';
    });

    const seen = b.awareness.getStates().get(a.awareness.clientID) as PresenceState;
    expect(seen.user.color).toBe('#ff0000');
    expect(seen.playhead).toBe(1_000_000);
    expect(seen.selectionId).toBe('ann-1');
  });

  it('partial updates via setLocalStateField propagate as diffs', async () => {
    const [aSock, bSock] = pair();
    const a = connect(aSock);
    const b = connect(bSock);

    a.awareness.setLocalState(PRESENCE_A);
    await until(() => {
      const s = b.awareness.getStates().get(a.awareness.clientID) as PresenceState | undefined;
      return s?.playhead === 1_000_000;
    });

    a.awareness.setLocalStateField('playhead', 5_000_000);
    await until(() => {
      const s = b.awareness.getStates().get(a.awareness.clientID) as PresenceState | undefined;
      return s?.playhead === 5_000_000;
    });
  });

  it('dispose() removes local state from peers', async () => {
    const [aSock, bSock] = pair();
    const a = connect(aSock);
    const b = connect(bSock);

    a.awareness.setLocalState(PRESENCE_A);
    await until(() => b.awareness.getStates().has(a.awareness.clientID));

    const aClientId = a.awareness.clientID;
    // Remove from connections list so afterEach doesn't double-dispose.
    connections = connections.filter((c) => c !== a);
    a.dispose();

    await until(() => !b.awareness.getStates().has(aClientId));
  });

  it('three peers fanout: each sees the other two', async () => {
    // A simple star topology where the "wire" is a fanout hub: every
    // sender's frame is delivered to every other connection. Implemented
    // by giving each socket the same set of peers and a custom send.
    const sockets: MockWebSocket[] = [];
    for (let i = 0; i < 3; i++) {
      const s = new MockWebSocket(`ws://test/${i}`);
      sockets.push(s);
    }
    // Override `peer` semantics: send broadcasts to all others.
    for (const s of sockets) {
      s.relay = relayDropSync;
      s.send = function (this: MockWebSocket, data: ArrayBuffer | Uint8Array) {
        if (this.readyState !== OPEN) return;
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        const filtered = this.relay(bytes);
        if (filtered === null) return;
        for (const other of sockets) {
          if (other === this) continue;
          queueMicrotask(() => {
            const buf = filtered.buffer.slice(
              filtered.byteOffset,
              filtered.byteOffset + filtered.byteLength,
            );
            // biome-ignore lint/complexity/useLiteralKeys: accessing private listener pool by key
            const ls = (other as unknown as { listeners: Record<string, Listener[]> }).listeners[
              'message'
            ];
            if (ls) for (const fn of ls.slice()) fn({ type: 'message', data: buf as ArrayBuffer });
          });
        }
      };
    }

    const [a, b, c] = sockets.map(connect);
    if (!a || !b || !c) throw new Error('missing connection');
    a.awareness.setLocalState(PRESENCE_A);
    b.awareness.setLocalState(PRESENCE_B);
    c.awareness.setLocalState({
      user: { name: 'Carol', color: '#0000ff' },
      playhead: null,
      selectionId: null,
    });

    await until(() => {
      const aSeesB = b.awareness.clientID && a.awareness.getStates().has(b.awareness.clientID);
      const aSeesC = c.awareness.clientID && a.awareness.getStates().has(c.awareness.clientID);
      const bSeesA = a.awareness.clientID && b.awareness.getStates().has(a.awareness.clientID);
      return Boolean(aSeesB && aSeesC && bSeesA);
    });

    expect(a.awareness.getStates().size).toBeGreaterThanOrEqual(3); // self + 2 others
    expect(b.awareness.getStates().size).toBeGreaterThanOrEqual(3);
    expect(c.awareness.getStates().size).toBeGreaterThanOrEqual(3);
  });
});
