// Annotation envelope, Reference union, Provenance, Tier — hand-written
// mirrors of lacing.model and lacing.tier.
//
// Hand-written rather than codegened (see scripts/codegen.mjs comment): the
// envelope evolves rarely and we want explicit control over the wire shape.
// The `body: Record<string, unknown>` field is validated separately by the
// Zod schema looked up from `body_schema_uri` in src/types/generated/.

import { z } from 'zod';
import { rationalTimeSchema, timeIntervalSchema } from './time';

// --- References ------------------------------------------------------------

export const mediaRefSchema = z
  .object({
    kind: z.literal('media'),
    asset_id: z.string().min(1),
    interval: timeIntervalSchema,
  })
  .strict();

export const nodeRefSchema = z
  .object({
    kind: z.literal('node'),
    scene_path: z.string().min(1),
    interval: timeIntervalSchema,
  })
  .strict();

export const annotationRefSchema = z
  .object({
    kind: z.literal('annotation'),
    target_id: z.string().uuid(),
    interval: timeIntervalSchema.nullable().optional(),
  })
  .strict();

export const referenceSchema = z.discriminatedUnion('kind', [
  mediaRefSchema,
  nodeRefSchema,
  annotationRefSchema,
]);

export type Reference = z.infer<typeof referenceSchema>;
export type MediaRef = z.infer<typeof mediaRefSchema>;
export type NodeRef = z.infer<typeof nodeRefSchema>;
export type AnnotationRef = z.infer<typeof annotationRefSchema>;

// --- Provenance ------------------------------------------------------------

export const provenanceActivity = z.enum(['create', 'import', 'derive', 'migrate', 'infer']);

export const provenanceSchema = z
  .object({
    was_generated_by: z.string().min(1),
    was_attributed_to: z.string().min(1),
    was_derived_from: z.array(z.string().uuid()).default([]),
    generated_at_time: rationalTimeSchema,
    activity: provenanceActivity.default('create'),
  })
  .strict();

export type Provenance = z.infer<typeof provenanceSchema>;

// --- Tier stereotypes ------------------------------------------------------

export const tierStereotype = z.enum([
  'NONE',
  'TIME_SUBDIVISION',
  'INCLUDED_IN',
  'SYMBOLIC_SUBDIVISION',
  'SYMBOLIC_ASSOCIATION',
]);

export type TierStereotype = z.infer<typeof tierStereotype>;

// --- Annotation envelope ---------------------------------------------------

const bodySchemaUri = z.string().regex(/^annot:\/\/schema\/[a-z0-9-]+\/v\d+$/, {
  message: 'must look like "annot://schema/<name>/v<major>"',
});

export const annotationSchema = z
  .object({
    id: z.string().uuid(),
    tier: z.string().min(1),
    reference: referenceSchema,
    body: z.record(z.unknown()),
    body_schema_uri: bodySchemaUri,
    provenance: provenanceSchema,
    confidence: z.number().min(0).max(1).nullable().optional(),
  })
  .strict();

export type Annotation = z.infer<typeof annotationSchema>;
