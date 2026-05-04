// Ctrl+K command palette over the wrapex registry.
//
// Phase 3.3 ships a minimal lookup-and-execute palette. Phase 3.4+ will swap
// in shadcn's <Command/> primitive (cmdk) for full fuzzy search + categories;
// for now we use a controlled input + a filtered list. The same registry.
//
// Parameterized commands (those with a Zod `schema`) are listed but disabled:
// the palette has no parameter-collection UI yet. Phase 3.3 of the original
// wrapex skill set covers this in `13-wire-palette-params.md`.

import { registry } from '@/commands';
import { useUiStore } from '@/stores/ui';
import { Button } from '@/ui/button';
import { useEffect, useMemo, useRef, useState } from 'react';

export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Mod+K toggles the palette globally; Esc inside closes it.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        useUiStore.getState().togglePalette();
      } else if (event.key === 'Escape' && useUiStore.getState().paletteOpen) {
        event.preventDefault();
        useUiStore.getState().setPaletteOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = registry.listAvailable();
    if (!q) return all.slice(0, 20);
    return all.filter((c) => `${c.label} ${c.category}`.toLowerCase().includes(q)).slice(0, 20);
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-start pt-24 bg-foreground/10 backdrop-blur-sm">
      {/* Backdrop is a button so click + keyboard a11y come for free. */}
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 cursor-default"
        onClick={() => setOpen(false)}
      />
      <dialog
        open
        className="relative w-[min(640px,92vw)] mx-auto rounded-lg border bg-popover text-popover-foreground shadow-lg overflow-hidden"
        aria-label="Command palette"
        aria-modal="true"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to search commands…"
          className="w-full px-4 py-3 text-sm bg-transparent border-b border-border focus:outline-none"
        />
        <ul className="max-h-80 overflow-auto">
          {matches.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted-foreground text-center">
              No matching commands
            </li>
          ) : (
            matches.map((cmd) => {
              const parameterized = cmd.schema !== undefined;
              return (
                <li key={cmd.id}>
                  <button
                    type="button"
                    disabled={parameterized}
                    onClick={async () => {
                      setOpen(false);
                      try {
                        await registry.execute(cmd.id, undefined, { source: 'palette' });
                      } catch {
                        // Middleware logs; nothing more to do here.
                      }
                    }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                  >
                    <span>
                      <span className="text-muted-foreground text-xs">{cmd.category} · </span>
                      {cmd.label}
                    </span>
                    {parameterized && (
                      <span className="text-xs text-muted-foreground">(needs params)</span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="px-4 py-2 text-xs text-muted-foreground border-t flex justify-between">
          <span>
            {matches.length} of {registry.size} available
          </span>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Esc
          </Button>
        </div>
      </dialog>
    </div>
  );
}
