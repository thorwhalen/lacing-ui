import { z } from "zod"

export const namedEntityV1Schema = z.object({ "type": z.string().describe("Entity type code (e.g., PER, ORG, LOC)."), "text": z.string().describe("Surface form of the entity mention.") }).strict().describe("Original NER body. ``type`` is the entity tag (PER, ORG, LOC, ...).")
