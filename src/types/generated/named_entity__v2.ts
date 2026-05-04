import { z } from "zod"

export const namedEntityV2Schema = z.object({ "entity_type": z.string().describe("Entity type code (e.g., PER, ORG, LOC)."), "text": z.string().describe("Surface form of the entity mention."), "confidence": z.union([z.number().gte(0).lte(1), z.null()]).describe("Optional [0, 1] confidence — for soft labels and AI annotations.").default(null) }).strict().describe("v2 renames ``type`` -> ``entity_type`` and adds optional ``confidence``.\n\nThe rename makes v2 incompatible with v1, so we register a migration.")
