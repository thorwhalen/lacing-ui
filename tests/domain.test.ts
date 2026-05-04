import { describe, expect, it } from 'vitest';
import { annotationCollection, tierCollection } from '@/domain/collections';
import { annotationSchema, mediaRefSchema, provenanceSchema } from '@/domain/envelope';
import { fromMicros, intervalToMicros, toMicros } from '@/domain/time';
import { wordV1Schema } from '@/types/generated';

describe('time wire conversions', () => {
  it('round-trips microseconds at the default rate', () => {
    const wire = fromMicros(1_500_000);
    expect(wire).toEqual({ v: 36000, r: 24000 });
    expect(toMicros(wire)).toBe(1_500_000);
  });

  it('projects an interval to micro bounds', () => {
    const interval = { start: { v: 0, r: 24000 }, end: { v: 12000, r: 24000 } };
    expect(intervalToMicros(interval)).toEqual({ start: 0, end: 500_000 });
  });
});

describe('envelope schemas', () => {
  it('accepts a well-formed annotation with a media reference', () => {
    const ok = annotationSchema.safeParse({
      id: '11111111-2222-3333-4444-555555555555',
      tier: 'words',
      reference: {
        kind: 'media',
        asset_id: 'sha256:abc',
        interval: { start: { v: 0, r: 24000 }, end: { v: 24000, r: 24000 } },
      },
      body: { text: 'hello' },
      body_schema_uri: 'annot://schema/word/v1',
      provenance: {
        was_generated_by: 'user:alice',
        was_attributed_to: 'alice',
        generated_at_time: { v: 0, r: 1 },
      },
    });
    expect(ok.success).toBe(true);
  });

  it('rejects malformed body_schema_uri', () => {
    const result = annotationSchema.safeParse({
      id: '11111111-2222-3333-4444-555555555555',
      tier: 'words',
      reference: mediaRefSchema.parse({
        kind: 'media',
        asset_id: 'sha256:abc',
        interval: { start: { v: 0, r: 24000 }, end: { v: 24000, r: 24000 } },
      }),
      body: {},
      body_schema_uri: 'oops/not/a/uri',
      provenance: provenanceSchema.parse({
        was_generated_by: 'user:alice',
        was_attributed_to: 'alice',
        generated_at_time: { v: 0, r: 1 },
      }),
    });
    expect(result.success).toBe(false);
  });
});

describe('codegened body schemas', () => {
  it('parses a valid word body', () => {
    expect(wordV1Schema.parse({ text: 'banana' })).toMatchObject({ text: 'banana' });
  });
});

describe('zodal collections', () => {
  it('expose a sensible idField for each collection', () => {
    expect(annotationCollection.idField).toBe('id');
    expect(tierCollection.idField).toBe('name');
  });
});
