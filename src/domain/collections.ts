// zodal collections — schema-driven sources of truth that the inspector,
// table view, and filter UI all read from.
//
// `defineCollection(schema, config?)` infers column defs, form configs, and
// filter configs from the Zod schema; the shadcn renderer registry then
// materializes them. Per-collection `name` is the variable name itself; we
// don't repeat it inside the config.

import { defineCollection } from '@zodal/core';
import { z } from 'zod';
import { annotationSchema, tierStereotype } from './envelope';

// --- Annotations -----------------------------------------------------------

export const annotationCollection = defineCollection(annotationSchema, {
  idField: 'id',
  labelField: 'tier',
});

// --- Tiers -----------------------------------------------------------------

export const tierSchema = z
  .object({
    name: z.string().min(1),
    stereotype: tierStereotype.default('NONE'),
    parent: z.string().min(1).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type Tier = z.infer<typeof tierSchema>;

export const tierCollection = defineCollection(tierSchema, {
  idField: 'name',
  labelField: 'name',
});

// --- Projects --------------------------------------------------------------
// Phase 3.7 will hydrate these from a real lacing meta endpoint; for now
// they're a UI-only concept used by the project picker.

export const projectSchema = z
  .object({
    id: z.guid(),
    name: z.string().min(1),
    description: z.string().default(''),
    rate: z.number().int().positive().default(24000),
  })
  .strict();

export type Project = z.infer<typeof projectSchema>;

export const projectCollection = defineCollection(projectSchema, {
  idField: 'id',
  labelField: 'name',
});
