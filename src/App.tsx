import { registerAllCommands, registry } from '@/commands';
import type { Tier } from '@/domain/collections';
import type { Annotation } from '@/domain/envelope';
import { useAwareness } from '@/hooks/useAwareness';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { annotationsProvider, tiersProvider } from '@/store/factories';
import { useCallback, useEffect, useState } from 'react';
// Initialize theme as a side effect of the module load so the first paint
// already has the right `dark` class on <html>.
import '@/stores/theme';
import { useUiStore } from '@/stores/ui';
import { Button } from '@/ui/button';
import { FileBar } from '@/ui/file-bar';
import { Inspector } from '@/ui/inspector';
import { CommandPalette } from '@/ui/palette';
import { ProgramMonitor } from '@/ui/program-monitor';
import { ThemePicker } from '@/ui/theme-picker';
import { TierList } from '@/ui/tier-list';
import { Timeline } from '@/ui/timeline';
import { Waveform } from '@/ui/waveform';

registerAllCommands();

// Phase 3.5 demo audio — drop a real file at public/sample.wav for dev runs.
// In production, this URL comes from the project's media manifest.
const DEMO_AUDIO_URL = '/sample.wav';

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
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('hello');
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const setLastListSize = useUiStore((s) => s.setLastListSize);
  const togglePalette = useUiStore((s) => s.togglePalette);
  const selection = useUiStore((s) => s.selection);

  useKeyboardShortcuts();

  // Phase 4-A: Yjs Awareness presence. Only connect against the real
  // backend — MSW doesn't proxy WebSockets. The demo project ID is fixed;
  // a multi-project UI would derive it from routing.
  const awarenessEnabled = import.meta.env.VITE_BACKEND === 'real';
  const { remote } = useAwareness({
    projectId: 'demo',
    enabled: awarenessEnabled,
  });

  const refresh = useCallback(async () => {
    try {
      const [annResult, tierResult] = await Promise.all([
        annotationsProvider.getList({}),
        tiersProvider.getList({}),
      ]);
      setItems(annResult.data);
      setTiers(tierResult.data);
      setLastListSize(annResult.data.length);
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
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">lacing</h1>
          <p className="text-muted-foreground text-sm">
            standoff, interval-keyed annotation system — phase 3 frontend
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FileBar onAfterImport={() => void refresh()} />
          <ThemePicker />
          <Button size="sm" variant="outline" onClick={togglePalette}>
            ⌘K Commands
          </Button>
        </div>
      </header>

      <section className="rounded-lg border p-4 flex flex-col gap-3" aria-label="Program monitor">
        <h2 className="text-sm font-medium">Program monitor</h2>
        <ProgramMonitor src={DEMO_AUDIO_URL} onAudioElement={setAudioEl} />
        <Waveform url={DEMO_AUDIO_URL} annotations={items} audioElement={audioEl} />
      </section>

      <Timeline annotations={items} tiers={tiers} remote={remote} />

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
          </div>
          <p className="text-xs text-muted-foreground">
            Press <kbd className="rounded border px-1">⌘K</kbd> for the command palette. Click an
            annotation to inspect; Esc clears selection. Space plays/pauses; J/K/L scrub.
          </p>
        </section>

        <Inspector />
      </div>

      <CommandPalette />
    </main>
  );
}

export default App;
