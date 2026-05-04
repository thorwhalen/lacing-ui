// End-to-end DataProvider tests through MSW: prove the lacingRestProvider
// + MSW handlers + envelope Zod all line up before the UI builds on them.

import { afterEach, describe, expect, it } from 'vitest';
import { server } from '@/mocks/server';
import { makeHandlers } from '@/mocks/handlers';
import { createLacingRestProvider } from '@/store/lacing-rest';
import type { Annotation } from '@/domain/envelope';

const seedAnnotation = (id: string, tier = 'words'): Annotation => ({
  id,
  tier,
  reference: {
    kind: 'media',
    asset_id: 'sha256:asset',
    interval: { start: { v: 0, r: 24000 }, end: { v: 24000, r: 24000 } },
  },
  body: { text: 'hello' },
  body_schema_uri: 'annot://schema/word/v1',
  provenance: {
    was_generated_by: 'user:test',
    was_attributed_to: 'test',
    was_derived_from: [],
    generated_at_time: { v: 0, r: 1 },
    activity: 'create',
  },
});

const provider = createLacingRestProvider<Annotation & Record<string, unknown>>({
  resource: '/api/annotations',
  // jsdom + vitest's undici needs an absolute origin; production code in the
  // real browser resolves the relative path against location.origin.
  baseUrl: 'http://localhost',
  idField: 'id',
});

afterEach(() => server.resetHandlers());

describe('lacingRestProvider over MSW', () => {
  it('lists seeded annotations', async () => {
    const seed = [
      seedAnnotation('11111111-1111-1111-1111-111111111111'),
      seedAnnotation('22222222-2222-2222-2222-222222222222', 'phonemes'),
    ];
    server.use(...makeHandlers({ annotations: seed }));
    const result = await provider.getList({});
    expect(result.total).toBe(2);
    expect(result.data.map((a) => a.id)).toContain('11111111-1111-1111-1111-111111111111');
  });

  it('filters by tier via the tier query param', async () => {
    server.use(
      ...makeHandlers({
        annotations: [
          seedAnnotation('11111111-1111-1111-1111-111111111111', 'words'),
          seedAnnotation('22222222-2222-2222-2222-222222222222', 'phonemes'),
        ],
      }),
    );
    const result = await provider.getList({
      filter: { field: 'tier', operator: 'eq', value: 'phonemes' },
    });
    expect(result.data.map((a) => a.tier)).toEqual(['phonemes']);
  });

  it('creates → fetches → updates with ETag round-trip', async () => {
    server.use(...makeHandlers());
    const draft = seedAnnotation('33333333-3333-3333-3333-333333333333');
    const created = await provider.create(draft);
    expect(created.id).toBe(draft.id);

    const fetched = await provider.getOne(draft.id);
    expect(fetched.body).toEqual({ text: 'hello' });

    const updated = await provider.update(draft.id, {
      body: { text: 'goodbye' },
    });
    expect(updated.body).toEqual({ text: 'goodbye' });
  });

  it('deletes', async () => {
    const ann = seedAnnotation('44444444-4444-4444-4444-444444444444');
    server.use(...makeHandlers({ annotations: [ann] }));
    await provider.delete(ann.id);
    const result = await provider.getList({});
    expect(result.total).toBe(0);
  });
});
