import { registerAllCommands, registry } from '@/commands';
import type { Annotation } from '@/domain/envelope';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { annotationsProvider } from '@/store/factories';
import { useUiStore } from '@/stores/ui';
import { Button } from '@/ui/button';
import { CommandPalette } from '@/ui/palette';
import { useCallback, useEffect, useState } from 'react';

registerAllCommands();

function exampleAnnotation(text: string): Partial<Annotation> {
  return {
    id: crypto.randomUUID(),
    tier: 'words',
    reference: {
      kind: 'media',
      asset_id: 'sha256:demo',
      interval: { start: { v: 0, r: 24000 }, end: { v: 24000, r: 24000 } },
    },
    body: { text },
    body_schema_uri: 'annot://schema/word/v1',
    provenance: {
      was_generated_by: 'user:demo',
      was_attributed_to: 'demo',
      was_derived_from: [],
      generated_at_time: { v: 0, r: 1 },
      activity: 'create',
    },
  };
}

function App() {
  const [items, setItems] = useState<Annotation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('hello');
  const setLastListSize = useUiStore((s) => s.setLastListSize);
  const togglePalette = useUiStore((s) => s.togglePalette);

  useKeyboardShortcuts();

  const refresh = useCallback(async () => {
    try {
      const result = await annotationsProvider.getList({});
      setItems(result.data);
      setLastListSize(result.data.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [setLastListSize]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate() {
    try {
      // Drive through the registry — same path the palette and AI tools use.
      await registry.execute('lacing.annotations.create', exampleAnnotation(text), {
        source: 'ui',
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="min-h-screen p-8 flex flex-col gap-6 max-w-3xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">lacing</h1>
          <p className="text-muted-foreground text-sm">
            standoff, interval-keyed annotation system — phase 3 frontend
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={togglePalette}>
          ⌘K Commands
        </Button>
      </header>

      <section className="rounded-lg border p-4 flex flex-col gap-3">
        <h2 className="text-sm font-medium">Annotations</h2>
        {error && <p className="text-destructive text-xs">error: {error}</p>}
        <ul className="text-xs">
          {items.length === 0 ? (
            <li className="text-muted-foreground">none yet — create one below</li>
          ) : (
            items.map((a) => (
              <li key={a.id}>
                <span className="font-mono">{a.tier}</span> · {String(a.body.text)}
              </li>
            ))
          )}
        </ul>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 rounded-md border px-2 py-1 text-sm bg-background"
          />
          <Button size="sm" onClick={handleCreate}>
            Create
          </Button>
          <Button size="sm" variant="outline" onClick={refresh}>
            Refresh
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => document.documentElement.classList.toggle('dark')}
          >
            Dark
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Press <kbd className="rounded border px-1">⌘K</kbd> for the command palette. Transport
          keys (J/K/L, I/O, space) update the transport store; Esc clears selection.
        </p>
      </section>

      <CommandPalette />
    </main>
  );
}

export default App;
