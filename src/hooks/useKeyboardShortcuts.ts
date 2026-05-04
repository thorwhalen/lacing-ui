// Bind every command's `keybinding` to a global keydown listener. Mod = Meta
// on macOS, Ctrl elsewhere. Only fires when no input/contenteditable has focus.

import { registry } from '@/commands';
import { useEffect } from 'react';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

function eventMatches(
  event: KeyboardEvent,
  k: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean },
): boolean {
  if (event.key.toLowerCase() !== k.key.toLowerCase()) return false;
  // `meta?: true` means Mod (Cmd on Mac, Ctrl elsewhere).
  const wantMod = k.meta ?? false;
  const haveMod = isMac ? event.metaKey : event.ctrlKey;
  if (wantMod !== haveMod) return false;
  if ((k.ctrl ?? false) !== event.ctrlKey && !isMac) return false;
  if ((k.shift ?? false) !== event.shiftKey) return false;
  if ((k.alt ?? false) !== event.altKey) return false;
  return true;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      for (const cmd of registry.list()) {
        if (cmd.keybinding && eventMatches(event, cmd.keybinding)) {
          if (!registry.isAvailable(cmd.id)) continue;
          event.preventDefault();
          // Fire-and-forget — the registry middleware logs failures.
          void registry.execute(cmd.id, undefined, { source: 'shortcut' });
          return;
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
