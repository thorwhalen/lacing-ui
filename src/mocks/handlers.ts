// MSW handlers backed by a per-handlers-instance in-memory store.
//
// Mirrors the lacing FastAPI endpoints just well enough for offline UI
// development and unit tests:
// - GET   /api/annotations                  list (filter by tier)
// - POST  /api/annotations                  create (returns ETag)
// - GET   /api/annotations/{id}             one + ETag
// - PATCH /api/annotations/{id}             with If-Match
// - DELETE /api/annotations/{id}            204
// - GET   /api/tiers                        list
// - POST  /api/tiers                        upsert
// - GET   /api/tiers/{name}                 one
// - DELETE /api/tiers/{name}                204
// - GET   /api/health                       smoke

import { type Tier, tierSchema } from '@/domain/collections';
import { type Annotation, annotationSchema } from '@/domain/envelope';
import { http, HttpResponse } from 'msw';

interface Store {
  annotations: Map<string, Annotation>;
  tiers: Map<string, Tier>;
}

function freshStore(): Store {
  return { annotations: new Map(), tiers: new Map() };
}

function blakeishHash(s: string): string {
  // Deterministic non-cryptographic stand-in for the lacing server's BLAKE2b
  // ETag — strong enough for tests; not used in production paths.
  let h = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  for (const ch of s) {
    h = (h ^ BigInt(ch.codePointAt(0) ?? 0)) * FNV_PRIME;
    h &= 0xffffffffffffffffn;
  }
  return `"${h.toString(16)}"`;
}

function annotationEtag(ann: Annotation): string {
  return blakeishHash(JSON.stringify(ann));
}

export function makeHandlers(seed: { annotations?: Annotation[]; tiers?: Tier[] } = {}) {
  const store = freshStore();
  for (const a of seed.annotations ?? []) store.annotations.set(a.id, a);
  for (const t of seed.tiers ?? []) store.tiers.set(t.name, t);

  return [
    http.get('/api/health', () => HttpResponse.json({ ok: true, backend: 'msw' })),

    // --- annotations ----------------------------------------------------
    http.get('/api/annotations', ({ request }) => {
      const url = new URL(request.url);
      const tier = url.searchParams.get('tier');
      let items = Array.from(store.annotations.values());
      if (tier) items = items.filter((a) => a.tier === tier);
      return HttpResponse.json(items);
    }),

    http.post('/api/annotations', async ({ request }) => {
      const incoming = (await request.json()) as Partial<Annotation>;
      const id = incoming.id ?? crypto.randomUUID();
      const candidate = { ...incoming, id } as Annotation;
      const parsed = annotationSchema.safeParse(candidate);
      if (!parsed.success) {
        return HttpResponse.json({ detail: parsed.error.message }, { status: 422 });
      }
      store.annotations.set(parsed.data.id, parsed.data);
      return HttpResponse.json(parsed.data, {
        status: 201,
        headers: { ETag: annotationEtag(parsed.data) },
      });
    }),

    http.get('/api/annotations/:id', ({ params }) => {
      const ann = store.annotations.get(String(params.id));
      if (!ann) return HttpResponse.json({ detail: 'not found' }, { status: 404 });
      return HttpResponse.json(ann, { headers: { ETag: annotationEtag(ann) } });
    }),

    http.patch('/api/annotations/:id', async ({ params, request }) => {
      const id = String(params.id);
      const ann = store.annotations.get(id);
      if (!ann) return HttpResponse.json({ detail: 'not found' }, { status: 404 });
      const ifMatch = request.headers.get('if-match');
      if (!ifMatch) {
        return HttpResponse.json({ detail: 'If-Match required' }, { status: 428 });
      }
      const currentEtag = annotationEtag(ann);
      if (ifMatch !== '*' && ifMatch !== currentEtag) {
        return HttpResponse.json(
          { detail: `ETag mismatch: have ${currentEtag}, requested ${ifMatch}` },
          { status: 412 },
        );
      }
      const patch = (await request.json()) as Partial<Annotation>;
      const merged = { ...ann, ...patch, id } as Annotation;
      const parsed = annotationSchema.safeParse(merged);
      if (!parsed.success) {
        return HttpResponse.json({ detail: parsed.error.message }, { status: 422 });
      }
      store.annotations.set(id, parsed.data);
      return HttpResponse.json(parsed.data, {
        headers: { ETag: annotationEtag(parsed.data) },
      });
    }),

    http.delete('/api/annotations/:id', ({ params }) => {
      const id = String(params.id);
      if (!store.annotations.delete(id)) {
        return HttpResponse.json({ detail: 'not found' }, { status: 404 });
      }
      return new HttpResponse(null, { status: 204 });
    }),

    // --- tiers ----------------------------------------------------------
    http.get('/api/tiers', () => HttpResponse.json(Array.from(store.tiers.values()))),

    http.post('/api/tiers', async ({ request }) => {
      const body = (await request.json()) as Partial<Tier>;
      const parsed = tierSchema.safeParse(body);
      if (!parsed.success) {
        return HttpResponse.json({ detail: parsed.error.message }, { status: 422 });
      }
      store.tiers.set(parsed.data.name, parsed.data);
      return HttpResponse.json(parsed.data, { status: 201 });
    }),

    http.get('/api/tiers/:name', ({ params }) => {
      const tier = store.tiers.get(String(params.name));
      if (!tier) return HttpResponse.json({ detail: 'not found' }, { status: 404 });
      return HttpResponse.json(tier);
    }),

    http.delete('/api/tiers/:name', ({ params }) => {
      if (!store.tiers.delete(String(params.name))) {
        return HttpResponse.json({ detail: 'not found' }, { status: 404 });
      }
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}

// Default handlers (empty store). Tests that need seed data should call
// `server.use(...makeHandlers({ annotations: [...] }))` to swap in their own.
export const handlers = makeHandlers();
