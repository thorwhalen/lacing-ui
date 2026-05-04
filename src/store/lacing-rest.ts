// lacingRestProvider — DataProvider<T> over the lacing FastAPI server.
//
// Maps zodal's normalized CRUD onto the REST endpoints in
// lacing/server/routers/. The lacing server uses ETag-based optimistic
// concurrency on PATCH, so we cache the most recent ETag per id.
//
// Allen-relation filters are passed through as `?start&end&rate&relation`
// query params when zodal's FilterExpression contains a special "interval"
// field shape.

import type { FilterCondition, FilterExpression } from '@zodal/core';
import type {
  DataProvider,
  GetListParams,
  GetListResult,
  ProviderCapabilities,
} from '@zodal/store';

export interface RestProviderOptions {
  /** Endpoint root, e.g., "/api/annotations". Required. */
  resource: string;
  /** Base URL prefix (defaults to ""). The proxy in vite.config.ts routes /api → :8000. */
  baseUrl?: string;
  /** fetch implementation (overridable for tests). */
  fetch?: typeof fetch;
  /**
   * Field used as the unique identifier on this resource. Defaults to "id".
   * For tiers it's "name".
   */
  idField?: string;
}

interface AllenWindow {
  start: number;
  end: number;
  rate?: number;
  relation?: string;
}

function isAllenWindow(value: unknown): value is AllenWindow {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.start === 'number' && typeof v.end === 'number';
}

function isCondition(expr: FilterExpression): expr is FilterCondition {
  return typeof (expr as FilterCondition).field === 'string';
}

function* walkConditions(expr: FilterExpression): Generator<FilterCondition> {
  if (isCondition(expr)) {
    yield expr;
    return;
  }
  if ('and' in expr) {
    for (const child of expr.and) yield* walkConditions(child);
  } else if ('or' in expr) {
    for (const child of expr.or) yield* walkConditions(child);
  } else if ('not' in expr) {
    yield* walkConditions(expr.not);
  }
}

function toQueryString(params: GetListParams): string {
  const qs = new URLSearchParams();

  if (params.pagination) {
    const { page, pageSize } = params.pagination;
    qs.set('limit', String(page * pageSize));
  }

  if (params.filter) {
    for (const cond of walkConditions(params.filter)) {
      if (cond.field === 'interval' && isAllenWindow(cond.value)) {
        qs.set('start', String(cond.value.start));
        qs.set('end', String(cond.value.end));
        if (cond.value.rate !== undefined) qs.set('rate', String(cond.value.rate));
        if (cond.value.relation !== undefined) qs.set('relation', cond.value.relation);
      } else if (cond.field === 'tier' && typeof cond.value === 'string') {
        qs.set('tier', cond.value);
      }
    }
  }

  return qs.toString();
}

export function createLacingRestProvider<T extends Record<string, unknown>>(
  options: RestProviderOptions,
): DataProvider<T> {
  const { resource, baseUrl = '', fetch: fetchOverride, idField = 'id' } = options;
  const root = `${baseUrl}${resource}`;
  const etagCache = new Map<string, string>();

  // Resolve fetch at call time so test runners that patch globalThis.fetch
  // (notably MSW v2 in node mode) are honored even when the provider is
  // constructed before the patch is installed.
  const fetchFn: typeof fetch = (input, init) => (fetchOverride ?? globalThis.fetch)(input, init);

  async function jsonOrThrow(response: Response): Promise<unknown> {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${text}`);
    }
    if (response.status === 204) return undefined;
    return response.json();
  }

  function getId(item: Partial<T>): string | undefined {
    const value = item[idField];
    return typeof value === 'string' ? value : undefined;
  }

  return {
    async getList(params: GetListParams): Promise<GetListResult<T>> {
      const qs = toQueryString(params);
      const url = qs ? `${root}?${qs}` : root;
      const data = (await jsonOrThrow(await fetchFn(url))) as T[];
      return { data, total: data.length };
    },

    async getOne(id: string): Promise<T> {
      const response = await fetchFn(`${root}/${encodeURIComponent(id)}`);
      const item = (await jsonOrThrow(response)) as T;
      const etag = response.headers.get('ETag');
      if (etag) etagCache.set(id, etag);
      return item;
    },

    async create(data: Partial<T>): Promise<T> {
      const response = await fetchFn(root, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      const created = (await jsonOrThrow(response)) as T;
      const id = getId(created);
      const etag = response.headers.get('ETag');
      if (etag && id) etagCache.set(id, etag);
      return created;
    },

    async update(id: string, data: Partial<T>): Promise<T> {
      // Lacing requires If-Match. Fetch current ETag if we don't have it cached.
      let ifMatch = etagCache.get(id);
      if (!ifMatch) {
        await this.getOne(id);
        ifMatch = etagCache.get(id) ?? '*';
      }
      const response = await fetchFn(`${root}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'if-match': ifMatch,
        },
        body: JSON.stringify(data),
      });
      const updated = (await jsonOrThrow(response)) as T;
      const newEtag = response.headers.get('ETag');
      if (newEtag) etagCache.set(id, newEtag);
      return updated;
    },

    async updateMany(ids: string[], data: Partial<T>): Promise<T[]> {
      // Lacing has no bulk PATCH; fall back to N sequential updates.
      const results: T[] = [];
      for (const id of ids) {
        results.push(await this.update(id, data));
      }
      return results;
    },

    async delete(id: string): Promise<void> {
      const response = await fetchFn(`${root}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await jsonOrThrow(response);
      etagCache.delete(id);
    },

    async deleteMany(ids: string[]): Promise<void> {
      for (const id of ids) await this.delete(id);
    },

    getCapabilities(): ProviderCapabilities {
      return {
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canBulkUpdate: false,
        canBulkDelete: false,
        canUpsert: false,
        serverSort: false,
        // Lacing only does server-side filtering by tier and the
        // start/end/rate/relation Allen-window quartet.
        serverFilter: ['tier', 'interval'],
        serverSearch: false,
        serverPagination: true,
        paginationStyle: 'offset',
      };
    },
  };
}
