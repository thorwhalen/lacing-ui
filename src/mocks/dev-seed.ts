// Dev-mode seed for the MSW backend. Used only by main.tsx (browser); tests
// register their own handlers via `server.use(...makeHandlers({...}))` and
// never see this seed.

import type { Tier } from '@/domain/collections';
import type { Annotation } from '@/domain/envelope';

export const devTiers: Tier[] = [
  { name: 'words', stereotype: 'NONE', metadata: {} },
  { name: 'phonemes', stereotype: 'TIME_SUBDIVISION', parent: 'words', metadata: {} },
  { name: 'visemes', stereotype: 'NONE', metadata: {} },
];

export const devAnnotations: Annotation[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    tier: 'words',
    reference: {
      kind: 'media',
      asset_id: 'sha256:dev',
      interval: { start: { v: 0, r: 24000 }, end: { v: 24000, r: 24000 } },
    },
    body: { text: 'hello' },
    body_schema_uri: 'annot://schema/word/v1',
    provenance: {
      was_generated_by: 'user:dev',
      was_attributed_to: 'dev',
      was_derived_from: [],
      generated_at_time: { v: 0, r: 1 },
      activity: 'create',
    },
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    tier: 'words',
    reference: {
      kind: 'media',
      asset_id: 'sha256:dev',
      interval: { start: { v: 24000, r: 24000 }, end: { v: 48000, r: 24000 } },
    },
    body: { text: 'world' },
    body_schema_uri: 'annot://schema/word/v1',
    provenance: {
      was_generated_by: 'user:dev',
      was_attributed_to: 'dev',
      was_derived_from: [],
      generated_at_time: { v: 0, r: 1 },
      activity: 'create',
    },
  },
];
