import { registerAllCommands, registry } from '@/commands';
import type { Annotation } from '@/domain/envelope';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { annotationsProvider } from '@/store/factories';
import { useUiStore } from '@/stores/ui';
import { Button } from '@/ui/button';
import { Inspector } from '@/ui/inspector';
import { CommandPalette } from '@/ui/palette';
import { TierList } from '@/ui/tier-list';
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
  const selection = useUiStore((s) => s.selection);

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
      await registry.execute('lacing.annotations.create', exampleAnnotation(text), {
        source: 'ui',
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="min-h-screen p-6 flex flex-col gap-4 max-w-6xl mx-auto">
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

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_360px] gap-4">
        <TierList />

        <section className="rounded-lg border p-4 flex flex-col gap-3">
          <h2 className="text-sm font-medium">Annotations ({items.length})</h2>
          {error && <p className="text-destructive text-xs">error: {error}</p>}
          <ul className="text-xs flex flex-col gap-1" aria-label="Annotation list">
            {items.length === 0 ? (
              <li className="text-muted-foreground">none yet — create one below</li>
            ) : (
              items.map((a) => {
                const selected = selection.kind === 'annotation' && selection.id === a.id;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={`w-full text-left px-2 py-1 rounded hover:bg-accent hover:text-accent-foreground ${selected ? 'bg-accent text-accent-foreground' : ''}`}
                      onClick={() =>
                        void registry.execute(
                          'lacing.selection.annotation',
                          { id: a.id },
                          { source: 'annotation-list' },
                        )
                      }
                    >
                      <span className="font-mono">{a.tier}</span> · {String(a.body.text)}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="flex gap-2 mt-2">
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
            Press <kbd className="rounded border px-1">⌘K</kbd> for the command palette. Click an
            annotation to inspect; Esc clears selection.
          </p>
        </section>

        <Inspector />
      </div>

      <CommandPalette />
    </main>
  );
}

export default App;
