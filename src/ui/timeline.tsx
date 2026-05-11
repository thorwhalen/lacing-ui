// Timeline — multitrack body. One row per tier, one item per annotation.
//
// dnd-timeline is headless: it owns layout (TimelineContext gives us
// `valueToPixels`, drag/resize listeners) and we own visuals + persistence.
// Drag-end and resize-end commit through the wrapex registry — same path
// the inspector and palette use — so undo/redo will work uniformly.
//
// Spans throughout this component are integer microseconds (consistent with
// transportStore). Conversion to RationalTime happens at the wire boundary
// inside the update command's payload builder.

import { registry } from '@/commands';
import type { Tier } from '@/domain/collections';
import type { Annotation } from '@/domain/envelope';
import { fromMicros, intervalToMicros } from '@/domain/time';
import type { RemotePresence } from '@/hooks/useAwareness';
import { cn } from '@/lib/utils';
import { useTransportStore } from '@/stores/transport';
import { type Selection, useUiStore } from '@/stores/ui';
import type { DragEndEvent } from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  type ItemDefinition,
  type Range,
  type ResizeEndEvent,
  TimelineContext,
  groupItemsToRows,
  useItem,
  useRow,
  useTimelineContext,
  useTimelineMonitor,
} from 'dnd-timeline';
import { useCallback, useMemo, useRef, useState } from 'react';

const ROW_HEIGHT = 36;
const SIDEBAR_WIDTH = 140;
const DEFAULT_RANGE_MICROS: Range = { start: 0, end: 30_000_000 };

interface TimelineProps {
  annotations: Annotation[];
  tiers: Tier[];
  className?: string;
  /** Remote peers' awareness state — rendered as cursors and selection halos. */
  remote?: RemotePresence[];
}

// --- Item ----------------------------------------------------------------

interface AnnotationItemProps {
  item: ItemDefinition;
  annotation: Annotation;
}

function AnnotationItem({ item, annotation }: AnnotationItemProps) {
  const selection = useUiStore((s) => s.selection);
  const selected = selection.kind === 'annotation' && selection.id === item.id;
  const { setNodeRef, attributes, listeners, itemStyle, itemContentStyle } = useItem({
    id: item.id,
    span: item.span,
  });

  return (
    <div
      ref={setNodeRef}
      style={itemStyle}
      {...listeners}
      {...attributes}
      // biome-ignore lint/a11y/useSemanticElements: ARIA grid pattern requires role="gridcell".
      role="gridcell"
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      aria-label={`${annotation.tier}: ${String(annotation.body.text ?? annotation.tier)}`}
      data-annotation-id={annotation.id}
      onClick={(e) => {
        e.stopPropagation();
        void registry.execute(
          'lacing.selection.annotation',
          { id: annotation.id },
          { source: 'timeline' },
        );
      }}
      className={cn(
        'rounded border text-xs cursor-grab active:cursor-grabbing select-none overflow-hidden',
        'focus:outline-none focus:ring-2 focus:ring-ring',
        selected
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-accent text-accent-foreground border-border',
      )}
    >
      <div style={itemContentStyle} className="px-2 py-1 truncate">
        {String(annotation.body.text ?? annotation.tier)}
      </div>
    </div>
  );
}

// --- Row -----------------------------------------------------------------

interface TimelineRowProps {
  tier: Tier;
  items: ItemDefinition[];
  annotationsById: Map<string, Annotation>;
}

function TimelineRow({ tier, items, annotationsById }: TimelineRowProps) {
  const { setNodeRef, rowStyle, rowSidebarStyle, rowWrapperStyle } = useRow({ id: tier.name });
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: rows aren't focused; cells are.
    // biome-ignore lint/a11y/useSemanticElements: ARIA grid row.
    <div role="row" style={rowWrapperStyle} className="border-b last:border-b-0">
      <div
        style={rowSidebarStyle}
        className="flex items-center px-2 text-xs font-medium bg-card border-r"
      >
        <span className="truncate">{tier.name}</span>
      </div>
      <div ref={setNodeRef} style={rowStyle} className="bg-background">
        {items.map((item) => {
          const ann = annotationsById.get(item.id);
          if (!ann) return null;
          return <AnnotationItem key={item.id} item={item} annotation={ann} />;
        })}
      </div>
    </div>
  );
}

// --- Inner timeline (must live inside TimelineContext) -------------------

interface TimelineBodyProps {
  tiers: Tier[];
  items: ItemDefinition[];
  annotationsById: Map<string, Annotation>;
  remote: RemotePresence[];
}

function TimelineBody({ tiers, items, annotationsById, remote }: TimelineBodyProps) {
  // Drag/resize commits dispatch through the registry. dnd-timeline gives us
  // the new span via getSpanFromDragEvent / getSpanFromResizeEvent, but the
  // simpler shape — pull span off the active item — is fine for Phase 3.6.
  useTimelineMonitor({
    onDragEnd: (event: DragEndEvent) => {
      const id = String(event.active.id);
      const span = (event.active.data.current as { span?: Range } | undefined)?.span;
      if (!span) return;
      void dispatchUpdate(id, span, annotationsById);
    },
    onResizeEnd: (event: ResizeEndEvent) => {
      const id = String(event.active.id);
      const span = (event.active.data.current as { span?: Range } | undefined)?.span;
      if (!span) return;
      void dispatchUpdate(id, span, annotationsById);
    },
  });

  // Vertical virtualization for large tier counts. FRONT-DOC §3.1 expects
  // multi-hundred-tier projects; below the threshold we render every row
  // directly (the virtualizer adds a measurement round-trip that isn't worth
  // it for a few rows, and it's brittle in test environments where
  // clientHeight is unreliable).
  const scrollRef = useRef<HTMLDivElement>(null);
  const grouped = useMemo(() => groupItemsToRows(items), [items]);
  const virtualize = tiers.length >= VIRTUALIZE_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: virtualize ? tiers.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
  });

  // ARIA grid keyboard navigation. Left/Right move between siblings within a
  // row (sorted by start); Up/Down move to the nearest item in the adjacent
  // tier. Selection mutation flows through the registry so the rest of the UI
  // (Inspector, list, when-clauses) stays in sync.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return;
    const sel = useUiStore.getState().selection;
    const target = computeNeighbor(sel, k, tiers, grouped);
    if (target) {
      e.preventDefault();
      void registry.execute(
        'lacing.selection.annotation',
        { id: target },
        { source: 'timeline-keyboard' },
      );
    }
  };

  return (
    <div
      ref={scrollRef}
      // biome-ignore lint/a11y/useSemanticElements: ARIA grid container.
      role="grid"
      aria-label="Annotation timeline"
      aria-rowcount={tiers.length}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard-nav target.
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="overflow-auto focus:outline-none focus:ring-2 focus:ring-ring rounded-b-lg relative"
      style={{ maxHeight: 360 }}
    >
      <RemoteCursors remote={remote} />
      {virtualize ? (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vrow) => {
            const tier = tiers[vrow.index];
            if (!tier) return null;
            return (
              <div
                key={tier.name}
                style={{
                  position: 'absolute',
                  top: vrow.start,
                  left: 0,
                  right: 0,
                  height: vrow.size,
                }}
              >
                <TimelineRow
                  tier={tier}
                  items={grouped[tier.name] ?? []}
                  annotationsById={annotationsById}
                />
              </div>
            );
          })}
        </div>
      ) : (
        tiers.map((t) => (
          <TimelineRow
            key={t.name}
            tier={t}
            items={grouped[t.name] ?? []}
            annotationsById={annotationsById}
          />
        ))
      )}
    </div>
  );
}

const VIRTUALIZE_THRESHOLD = 30;

// --- Outer wrapper -------------------------------------------------------

export function Timeline({ annotations, tiers, className, remote = [] }: TimelineProps) {
  const [range, setRange] = useState<Range>(DEFAULT_RANGE_MICROS);
  const onRangeChanged = useCallback((updater: (prev: Range) => Range) => {
    setRange(updater);
  }, []);

  const annotationsById = useMemo(() => {
    const m = new Map<string, Annotation>();
    for (const a of annotations) m.set(a.id, a);
    return m;
  }, [annotations]);

  const items: ItemDefinition[] = useMemo(() => {
    const list: ItemDefinition[] = [];
    for (const a of annotations) {
      const interval = a.reference.interval;
      if (!interval) continue;
      const { start, end } = intervalToMicros(interval);
      list.push({ id: a.id, rowId: a.tier, span: { start, end } });
    }
    return list;
  }, [annotations]);

  // Required by TimelineContext's typed callbacks but we already commit via
  // useTimelineMonitor inside the body — keep this a no-op so dnd-timeline
  // doesn't synthesize fallback writes.
  const onResizeEnd = useCallback(() => undefined, []);

  return (
    <section
      className={cn('rounded-lg border bg-card', className)}
      aria-label="Multitrack timeline"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h2 className="text-sm font-medium">Timeline</h2>
        <PlayheadIndicator />
      </div>
      <TimelineContext
        range={range}
        onRangeChanged={onRangeChanged}
        sidebarWidth={SIDEBAR_WIDTH}
        onResizeEnd={onResizeEnd}
      >
        <TimelineBody
          tiers={tiers}
          items={items}
          annotationsById={annotationsById}
          remote={remote}
        />
      </TimelineContext>
    </section>
  );
}

function PlayheadIndicator() {
  const playhead = useTransportStore((s) => s.playhead);
  return (
    <span className="text-xs font-mono text-muted-foreground">
      t = {(playhead / 1_000_000).toFixed(3)}s
    </span>
  );
}

// --- Remote cursors overlay ---------------------------------------------

interface RemoteCursorsProps {
  remote: RemotePresence[];
}

/**
 * Renders one vertical line per remote peer that has a non-null playhead.
 * Lives inside the timeline scroll container and uses
 * `valueToPixels(microseconds)` to compute its x. Pointer-events are
 * disabled so cursors never block clicks on annotations underneath.
 */
function RemoteCursors({ remote }: RemoteCursorsProps) {
  const { valueToPixels, sidebarWidth } = useTimelineContext();
  const cursors = remote.filter((r) => r.playhead !== null);
  if (cursors.length === 0) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      data-testid="remote-cursors"
    >
      {cursors.map((r) => {
        const x = sidebarWidth + valueToPixels(r.playhead as number);
        return (
          <div
            key={r.clientId}
            className="absolute top-0 bottom-0 w-px"
            style={{ left: x, backgroundColor: r.user.color }}
          >
            <span
              className="absolute -top-px left-0 px-1 text-[10px] font-medium text-white rounded-br whitespace-nowrap"
              style={{ backgroundColor: r.user.color }}
            >
              {r.user.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- Helpers --------------------------------------------------------------

/** Compute the next selection target for ARIA grid arrow-key navigation. */
function computeNeighbor(
  selection: Selection,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown',
  tiers: Tier[],
  grouped: Record<string, ItemDefinition[]>,
): string | null {
  // No selection → focus the first item in the first non-empty tier.
  if (selection.kind !== 'annotation') {
    for (const t of tiers) {
      const row = grouped[t.name] ?? [];
      const first = row[0];
      if (first) return first.id;
    }
    return null;
  }
  const currentId = selection.id;
  // Find which tier the current selection lives in.
  let rowIdx = -1;
  for (let r = 0; r < tiers.length; r++) {
    const tier = tiers[r];
    if (!tier) continue;
    const row = grouped[tier.name] ?? [];
    if (row.some((i) => i.id === currentId)) {
      rowIdx = r;
      break;
    }
  }
  if (rowIdx < 0) return null;
  const currentTier = tiers[rowIdx];
  if (!currentTier) return null;

  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const row = grouped[currentTier.name] ?? [];
    const sorted = [...row].sort((a, b) => a.span.start - b.span.start);
    const idx = sorted.findIndex((i) => i.id === currentId);
    const nextIdx = key === 'ArrowLeft' ? idx - 1 : idx + 1;
    const next = sorted[nextIdx];
    return next ? next.id : null;
  }
  // Up/Down: find nearest item by start time in the adjacent tier.
  const dir = key === 'ArrowUp' ? -1 : 1;
  const currentRow = grouped[currentTier.name] ?? [];
  const currentItem = currentRow.find((i) => i.id === currentId);
  if (!currentItem) return null;
  const target = currentItem.span.start;
  for (let r = rowIdx + dir; r >= 0 && r < tiers.length; r += dir) {
    const tier = tiers[r];
    if (!tier) continue;
    const row = grouped[tier.name] ?? [];
    let best: ItemDefinition | undefined;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const it of row) {
      const d = Math.abs(it.span.start - target);
      if (d < bestDist) {
        best = it;
        bestDist = d;
      }
    }
    if (best) return best.id;
  }
  return null;
}

async function dispatchUpdate(
  id: string,
  newSpan: Range,
  annotationsById: Map<string, Annotation>,
) {
  const ann = annotationsById.get(id);
  if (!ann) return;
  const interval = ann.reference.interval;
  if (!interval) return;
  // Reuse the rate from the existing interval so we don't introduce drift.
  const rate = interval.start.r;
  const newInterval = {
    start: fromMicros(Math.max(0, Math.round(newSpan.start)), rate),
    end: fromMicros(Math.max(Math.round(newSpan.start) + 1, Math.round(newSpan.end)), rate),
  };
  const newReference = { ...ann.reference, interval: newInterval };
  await registry.execute(
    'lacing.annotations.update',
    { id, patch: { reference: newReference } },
    { source: 'timeline' },
  );
}
