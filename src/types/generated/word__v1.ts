import { z } from "zod"

export const wordV1Schema = z.object({ "text": z.string().describe("Surface form of the word."), "speaker": z.union([z.string(), z.null()]).describe("Optional speaker identifier.").default(null) }).strict().describe("A single word annotation.\n\nThe ``text`` is the surface form as it appears in the source media.")
