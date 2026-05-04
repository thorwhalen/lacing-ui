// Inspector — when an annotation is selected, show editable envelope fields
// (tier, confidence) plus a body sub-form keyed on the annotation's
// body_schema_uri. Save flows through the wrapex `lacing.annotations.update`
// command — same path the palette / AI tools use.

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
import { useEffect, useMemo, useState } from 'react';
import type { z } from 'zod';

// Cache derived collections so SchemaForm + zodal don't re-infer on every render.
const bodyCollectionCache = new Map<string, CollectionDefinition<z.ZodObject<z.ZodRawShape>>>();

function bodyCollectionFor(uri: string): CollectionDefinition<z.ZodObject<z.ZodRawShape>> | null {
  const schema = bodySchemas[uri as BodySchemaUri];
  if (!schema) return null;
  let collection = bodyCollectionCache.get(uri);
  if (!collection) {
    collection = defineCollection(schema as z.ZodObject<z.ZodRawShape>, {
      // Bodies don't have a stable id — use first string field as label.
    });
    bodyCollectionCache.set(uri, collection);
  }
  return collection;
}

export function Inspector() {
  const selection = useUiStore((s) => s.selection);
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [bodyDraft, setBodyDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setDraft({ tier: a.tier, confidence: a.confidence ?? null });
        setBodyDraft({ ...a.body });
        setError(null);
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

  if (selection.kind !== 'annotation') {
    return (
      <aside className="rounded-lg border p-4 text-xs text-muted-foreground">
        Inspector — select an annotation to edit its envelope and body.
      </aside>
    );
  }

  if (!annotation) {
    return (
      <aside className="rounded-lg border p-4 text-xs text-muted-foreground">
        {error ? `error: ${error}` : 'loading…'}
      </aside>
    );
  }

  async function handleSave() {
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
      // Re-fetch to pick up the server's view (and a fresh ETag).
      const fresh = await annotationsProvider.getOne(annotation.id);
      setAnnotation(fresh);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="rounded-lg border p-4 flex flex-col gap-4">
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

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => {
            setDraft({ tier: annotation.tier, confidence: annotation.confidence ?? null });
            setBodyDraft({ ...annotation.body });
          }}
        >
          Reset
        </Button>
      </div>
    </aside>
  );
}
