import type { Annotation } from '@/domain/envelope';
import { annotationsProvider } from '@/store/factories';
import { Button } from '@/ui/button';
import { useCallback, useEffect, useState } from 'react';

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

  const refresh = useCallback(async () => {
    try {
      const result = await annotationsProvider.getList({});
      setItems(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate() {
    try {
      await annotationsProvider.create(exampleAnnotation(text));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="min-h-screen p-8 flex flex-col gap-6 max-w-3xl mx-auto">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">lacing</h1>
        <p className="text-muted-foreground text-sm">
          standoff, interval-keyed annotation system — phase 3 frontend
        </p>
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
      </section>
    </main>
  );
}

export default App;
