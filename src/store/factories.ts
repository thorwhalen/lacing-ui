// Selector for the active set of DataProviders.
//
// Both MSW and the real backend speak the same /api/<resource> shape — only
// difference is what's listening. The provider doesn't need to know.

import type { Project, Tier } from '@/domain/collections';
import type { Annotation } from '@/domain/envelope';
import type { DataProvider } from '@zodal/store';
import { createLacingRestProvider } from './lacing-rest';

const baseUrl = '';

export const annotationsProvider: DataProvider<Annotation> = createLacingRestProvider<
  Annotation & Record<string, unknown>
>({ resource: '/api/annotations', baseUrl, idField: 'id' });

export const tiersProvider: DataProvider<Tier> = createLacingRestProvider<
  Tier & Record<string, unknown>
>({ resource: '/api/tiers', baseUrl, idField: 'name' });

// Projects don't have a server endpoint yet — Phase 3.7. Until then this is
// a thin local stub that the UI can develop against.
export const projectsProvider: DataProvider<Project> = createLacingRestProvider<
  Project & Record<string, unknown>
>({ resource: '/api/projects', baseUrl, idField: 'id' });
