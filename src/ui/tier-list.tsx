// Tier list — schema-driven left sidebar.
//
// `toColumnDefs(tierCollection)` decides which fields to surface (and in
// what order). We render as a list (one row per tier) rather than a table,
// since tiers are picked, not browsed. Click dispatches the wrapex
// `lacing.selection.tier` command.

import { registry } from '@/commands';
import { type Tier, tierCollection } from '@/domain/collections';
import { cn } from '@/lib/utils';
import { tiersProvider } from '@/store/factories';
import { useUiStore } from '@/stores/ui';
import { toColumnDefs } from '@zodal/ui';
import { useEffect, useMemo, useState } from 'react';

export function TierList() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const selection = useUiStore((s) => s.selection);

  // Surface field order is schema-driven — labels come from
  // toColumnDefs(tierCollection). We display "name" + "stereotype" + "parent".
  const visibleFields = useMemo(() => toColumnDefs(tierCollection).map((c) => c.id), []);

  useEffect(() => {
    let cancelled = false;
    tiersProvider
      .getList({})
      .then((r) => {
        if (!cancelled) setTiers(r.data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="rounded-lg border p-3 flex flex-col gap-2" aria-label="Tier list">
      <h2 className="text-xs font-medium uppercase text-muted-foreground">
        Tiers ({tiers.length})
      </h2>
      {error && <p className="text-xs text-destructive">error: {error}</p>}
      {tiers.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tiers yet.</p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label="Tier list">
          {tiers.map((t) => {
            const selected = selection.kind === 'tier' && selection.name === t.name;
            return (
              <li key={t.name}>
                <button
                  type="button"
                  className={cn(
                    'w-full text-left px-2 py-1 rounded text-xs hover:bg-accent hover:text-accent-foreground',
                    selected && 'bg-accent text-accent-foreground',
                  )}
                  onClick={() =>
                    void registry.execute(
                      'lacing.selection.tier',
                      { name: t.name },
                      { source: 'tier-list' },
                    )
                  }
                >
                  <span className="font-medium">{t.name}</span>
                  {visibleFields.includes('stereotype') && t.stereotype !== 'NONE' && (
                    <span className="ml-2 text-muted-foreground">{t.stereotype}</span>
                  )}
                  {visibleFields.includes('parent') && t.parent && (
                    <span className="ml-2 text-muted-foreground">→ {t.parent}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
