// Yjs Awareness adapter — Phase 4-A.
//
// Why this exists
// ---------------
// We want presence/cursors (Yjs Awareness) without committing to a
// document-level CRDT yet. Roadmap §"Phase 4" defers full doc-CRDT
// until a real two-user conflict surfaces; until then we ship Awareness
// only.
//
// The standard `y-websocket` client speaks both sync (doc-CRDT) and
// awareness, and a `y-websocket`-compatible server has to maintain a
// `Y.Doc` per room. That's more than we need. So this module:
//
//   1. Owns a private `Y.Doc` (never synced — just the awareness owner).
//   2. Owns an `Awareness` instance from `y-protocols/awareness`.
//   3. Talks to the lacing FastAPI relay (`/ws/awareness/<projectId>`)
//      using a tiny binary protocol: one byte of message-type, then the
//      `y-protocols/awareness` encoded update.
//
// Wire format
// -----------
// Both directions use:
//
//     [msgType: 1 byte][payload: bytes]
//
// - msgType 1  (MSG_AWARENESS)       : standard awareness update.
// - msgType 10 (MSG_AWARENESS_QUERY) : a peer (or the server on join)
//                                       asks us to re-publish our state.
//                                       We respond by encoding the full
//                                       awareness state and sending it
//                                       as a normal awareness message.
//
// Anything else is dropped on receipt.
//
// What you do with it
// -------------------
// `connectAwareness({ projectId, url })` returns the `Awareness`
// instance and a `dispose()` cleanup. Higher-level code (the
// `useAwareness` hook) sets local state via `awareness.setLocalStateField`
// and listens for `change` events to render remote peers' cursors.

import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness.js';
import * as Y from 'yjs';

const MSG_AWARENESS = 1;
const MSG_AWARENESS_QUERY = 10;

/** Local awareness state shape published over the wire. */
export interface PresenceState {
  user: { name: string; color: string };
  /** Playhead in microseconds (matches transportStore). null = not playing. */
  playhead: number | null;
  /** Currently selected annotation id, or null. */
  selectionId: string | null;
}

export interface AwarenessConnection {
  awareness: Awareness;
  /** Close the WebSocket and remove our local state. */
  dispose(): void;
  /** True after the WebSocket has opened (for status indicators). */
  isConnected(): boolean;
}

export interface ConnectAwarenessOptions {
  projectId: string;
  /**
   * WebSocket URL of the relay. If omitted, derives from `window.location`:
   * `ws[s]://<host>/ws/awareness/<projectId>`.
   */
  url?: string;
  /**
   * Optional pre-built Y.Doc / Awareness — useful for tests that want to
   * inject mocks. In normal use, leave undefined and the adapter creates
   * a private pair.
   */
  awareness?: Awareness;
  /**
   * Optional WebSocket factory — used by tests that mock the transport.
   * The factory receives the resolved URL and must return a WebSocket-
   * shaped object (addEventListener, send, close, readyState, binaryType).
   * Defaults to `new WebSocket(url)`.
   */
  wsFactory?: (url: string) => WebSocket;
}

function defaultUrl(projectId: string): string {
  if (typeof window === 'undefined') {
    // SSR / test fallback. Tests provide an explicit url.
    return `ws://localhost/ws/awareness/${projectId}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/awareness/${projectId}`;
}

export function connectAwareness(opts: ConnectAwarenessOptions): AwarenessConnection {
  const url = opts.url ?? defaultUrl(opts.projectId);
  // Y.Doc is required by Awareness as the source of clientID. It's never
  // synced — we don't speak the y-sync protocol over the wire.
  const doc = opts.awareness ? null : new Y.Doc();
  const awareness = opts.awareness ?? new Awareness(doc as Y.Doc);

  const ws = opts.wsFactory ? opts.wsFactory(url) : new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  let isOpen = false;

  // WebSocket.OPEN is the protocol-defined value `1`. We compare against
  // the literal so tests can use a mock that doesn't carry the static.
  const WS_OPEN = 1;

  // Encode + send the local awareness state as one MSG_AWARENESS frame.
  const broadcastLocalState = () => {
    if (ws.readyState !== WS_OPEN) return;
    const update = encodeAwarenessUpdate(awareness, [awareness.clientID]);
    const frame = new Uint8Array(1 + update.length);
    frame[0] = MSG_AWARENESS;
    frame.set(update, 1);
    ws.send(frame);
  };

  // Whenever local awareness state changes, push the diff for our client.
  const onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    // Only broadcast when WE caused the change, not when a remote update
    // landed. The y-protocols convention is that local changes have
    // `origin === null` (or whatever you pass to setLocalState); remote
    // applies pass `'remote'` (see the message handler below).
    if (origin === 'remote') return;
    const changedClients = [...added, ...updated, ...removed].filter(
      (c) => c === awareness.clientID,
    );
    if (changedClients.length === 0) return;
    if (ws.readyState !== WS_OPEN) return;
    const update = encodeAwarenessUpdate(awareness, changedClients);
    const frame = new Uint8Array(1 + update.length);
    frame[0] = MSG_AWARENESS;
    frame.set(update, 1);
    ws.send(frame);
  };
  awareness.on('update', onAwarenessUpdate);

  ws.addEventListener('open', () => {
    isOpen = true;
    // Push our state immediately so peers don't have to wait for the
    // first interaction.
    broadcastLocalState();
  });

  ws.addEventListener('message', (ev: MessageEvent) => {
    const data = ev.data;
    if (!(data instanceof ArrayBuffer)) return;
    const buf = new Uint8Array(data);
    if (buf.length === 0) return;
    const msgType = buf[0];
    const payload = buf.subarray(1);
    if (msgType === MSG_AWARENESS) {
      applyAwarenessUpdate(awareness, payload, 'remote');
    } else if (msgType === MSG_AWARENESS_QUERY) {
      // The server (or a peer) asked us to re-publish. If the payload is
      // non-empty it's a peer's reply with their state — apply it. Either
      // way, send our current state in response so the asker sees us.
      if (payload.length > 0) {
        applyAwarenessUpdate(awareness, payload, 'remote');
      }
      broadcastLocalState();
    }
    // Other types: drop silently.
  });

  ws.addEventListener('close', () => {
    isOpen = false;
  });

  return {
    awareness,
    isConnected: () => isOpen,
    dispose: () => {
      awareness.off('update', onAwarenessUpdate);
      // Tell peers we're gone by clearing local state before closing.
      // applyAwarenessUpdate ignores empty maps; the cleanest way is to
      // remove our client entirely.
      awareness.setLocalState(null);
      try {
        broadcastLocalState();
      } catch {
        // socket might already be closed; that's fine.
      }
      ws.close();
      if (doc) doc.destroy();
    },
  };
}

export const _internal = {
  MSG_AWARENESS,
  MSG_AWARENESS_QUERY,
};
