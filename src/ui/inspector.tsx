// Inspector — when an annotation is selected, show editable envelope fields
// (tier, confidence) plus a body sub-form keyed on the annotation's
// body_schema_uri. Save flows through the wrapex `lacing.annotations.update`
// command — same path the palette / AI tools use.
//
// Auto-save: 5s of edit-quiet → commit. No batching across multiple
// annotations because the Inspector only ever edits one at a time; selection
// changes flush the timer. Manual Save still works and short-circuits the
// timer.

import { registry } from '@/commands';
import { annotationCollection } from '@/domain/collections';
import type { Annotation } from '@/domain/envelope';
import { annotationsProvider } from '@/store/factories';
import { useUiStore } from '@/stores/ui';
import { type BodySchemaUri, bodySchemas } from '@/types/generated';
import { Button } from '@/ui/button';
import { SchemaForm } from '@/ui/schema-form';
import { defineCollection } from '@zodal/core';
import type { CollectionDefinition } from '@zodal/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { z } from 'zod';

const AUTOSAVE_DELAY_MS = 5_000;

// Cache derived collections so SchemaForm + zodal don't re-infer on every render.
const bodyCollectionCache = new Map<string, CollectionDefinition<z.ZodObject<z.ZodRawShape>>>();

function bodyCollectionFor(uri: string): CollectionDefinition<z.ZodObject<z.ZodRawShape>> | null {
  const schema = bodySchemas[uri as BodySchemaUri];
  if (!schema) return null;
  let collection = bodyCollectionCache.get(uri);
  if (!collection) {
    collection = defineCollection(schema as z.ZodObject<z.ZodRawShape>, {});
    bodyCollectionCache.set(uri, collection);
  }
  return collection;
}

function envelopeDraft(a: Annotation): Record<string, unknown> {
  return { tier: a.tier, confidence: a.confidence ?? null };
}

function isDirty(
  annotation: Annotation,
  draft: Record<string, unknown>,
  bodyDraft: Record<string, unknown>,
): boolean {
  const env = envelopeDraft(annotation);
  if (env.tier !== draft.tier) return true;
  if ((env.confidence ?? null) !== (draft.confidence ?? null)) return true;
  // Shallow compare on body — annotations are frozen so reference equality
  // wouldn't help; JSON is fine for the sizes we deal with.
  return JSON.stringify(annotation.body) !== JSON.stringify(bodyDraft);
}

export function Inspector() {
  const selection = useUiStore((s) => s.selection);
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [bodyDraft, setBodyDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Reload the annotation when selection changes.
  useEffect(() => {
    if (selection.kind !== 'annotation') {
      setAnnotation(null);
      return;
    }
    let cancelled = false;
    annotationsProvider
      .getOne(selection.id)
      .then((a) => {
        if (cancelled) return;
        setAnnotation(a);
        setDraft(envelopeDraft(a));
        setBodyDraft({ ...a.body });
        setError(null);
        setSavedAt(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [selection]);

  const bodyCollection = useMemo(
    () => (annotation ? bodyCollectionFor(annotation.body_schema_uri) : null),
    [annotation],
  );

  const dirty = annotation ? isDirty(annotation, draft, bodyDraft) : false;

  const save = useCallback(async () => {
    if (!annotation) return;
    setSaving(true);
    try {
      const result = await registry.execute(
        'lacing.annotations.update',
        {
          id: annotation.id,
          patch: {
            ...draft,
            body: bodyDraft,
          },
        },
        { source: 'inspector' },
      );
      if (!result.success) throw new Error(result.message ?? 'update failed');
      const fresh = await annotationsProvider.getOne(annotation.id);
      setAnnotation(fresh);
      setError(null);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [annotation, draft, bodyDraft]);

  // Auto-save: debounce edits by AUTOSAVE_DELAY_MS, then commit through the
  // same registry path as the manual Save button.
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!annotation || !dirty) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      void save();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current);
    };
  }, [annotation, dirty, save]);

  if (selection.kind !== 'annotation') {
    return (
      <aside aria-label="Inspector" className="rounded-lg border p-4 text-xs text-muted-foreground">
        Inspector — select an annotation to edit its envelope and body.
      </aside>
    );
  }

  if (!annotation) {
    return (
      <aside aria-label="Inspector" className="rounded-lg border p-4 text-xs text-muted-foreground">
        {error ? `error: ${error}` : 'loading…'}
      </aside>
    );
  }

  return (
    <aside aria-label="Inspector" className="rounded-lg border p-4 flex flex-col gap-4">
      <header>
        <h2 className="text-sm font-medium">Inspector</h2>
        <p className="text-xs text-muted-foreground font-mono">{annotation.id}</p>
      </header>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">Envelope</h3>
        <SchemaForm
          collection={annotationCollection}
          values={draft}
          onChange={(field, value) => setDraft((d) => ({ ...d, [field]: value }))}
          fields={['tier', 'confidence']}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">
          Body
          <span className="ml-2 font-mono text-muted-foreground/70 normal-case">
            {annotation.body_schema_uri}
          </span>
        </h3>
        {bodyCollection ? (
          <SchemaForm
            collection={bodyCollection}
            values={bodyDraft}
            onChange={(field, value) => setBodyDraft((b) => ({ ...b, [field]: value }))}
          />
        ) : (
          <p className="text-xs text-destructive">
            No registered body schema for {annotation.body_schema_uri}. Run{' '}
            <code>npm run codegen</code> in the Python repo if you've added one.
          </p>
        )}
      </section>

      {error && <p className="text-destructive text-xs">error: {error}</p>}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={saving || !dirty}
          onClick={() => {
            setDraft(envelopeDraft(annotation));
            setBodyDraft({ ...annotation.body });
          }}
        >
          Reset
        </Button>
        <SaveStatus dirty={dirty} saving={saving} savedAt={savedAt} />
      </div>
    </aside>
  );
}

function SaveStatus({
  dirty,
  saving,
  savedAt,
}: { dirty: boolean; saving: boolean; savedAt: number | null }) {
  if (saving) return <span className="text-xs text-muted-foreground">Saving…</span>;
  if (dirty)
    return (
      <span className="text-xs text-muted-foreground">
        Unsaved — auto-saves in {AUTOSAVE_DELAY_MS / 1000}s
      </span>
    );
  if (savedAt) return <span className="text-xs text-muted-foreground">Saved</span>;
  return null;
}
