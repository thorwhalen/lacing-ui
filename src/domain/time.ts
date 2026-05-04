// RationalTime / TimeInterval — wire format mirror of lacing.time.
//
// Per Phase 3 plan: wire format is integer microseconds-style {v, r} pairs
// (NEVER floats). At the UI layer we keep an integer microsecond convenience
// view; conversion happens at the wire boundary only.
//
// Hand-written rather than codegened because the envelope changes rarely and
// we want explicit control over the wire boundary (Phase 3 plan §"Zod schemas
// mirror Pydantic source-of-truth").

import { z } from 'zod';

/** Integer wire pair: value / rate seconds. Both fields are positive ints. */
export const rationalTimeSchema = z
  .object({
    v: z.number().int(),
    r: z.number().int().positive(),
  })
  .strict();

export type RationalTime = z.infer<typeof rationalTimeSchema>;

/** Half-open interval [start, end) of RationalTime. */
export const timeIntervalSchema = z
  .object({
    start: rationalTimeSchema,
    end: rationalTimeSchema,
  })
  .strict();

export type TimeInterval = z.infer<typeof timeIntervalSchema>;

/** Wire RationalTime → microseconds (integer). One-way escape hatch. */
export function toMicros(t: RationalTime): number {
  // value / rate seconds → value * 1_000_000 / rate microseconds
  // Use BigInt for the multiplication to avoid 53-bit overflow when
  // value * 1e6 exceeds Number.MAX_SAFE_INTEGER, then convert back.
  const micros = (BigInt(t.v) * 1_000_000n) / BigInt(t.r);
  return Number(micros);
}

/** Microseconds → wire RationalTime. Default rate matches lacing's DEFAULT_RATE. */
export function fromMicros(micros: number, rate = 24000): RationalTime {
  // micros * rate / 1_000_000 = value at `rate`
  const v = (BigInt(micros) * BigInt(rate)) / 1_000_000n;
  return { v: Number(v), r: rate };
}

/** Convenience: project an interval into [startMicros, endMicros]. */
export function intervalToMicros(i: TimeInterval): { start: number; end: number } {
  return { start: toMicros(i.start), end: toMicros(i.end) };
}
