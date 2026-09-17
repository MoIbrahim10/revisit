import { z } from "zod";

const idSchema = z.string().min(1).max(160);
const claimIdsSchema = z.array(idSchema).max(100);

export const claimSchema = z.strictObject({
  id: idSchema,
  sourceId: idSchema,
  metric: z.enum(["paying_customers", "teams", "mrr", "retention"]),
  value: z.number().nonnegative(),
  unit: z.string().min(1).max(80),
  asOf: z.union([z.iso.date(), z.literal("")]),
  definition: z.string().min(1).max(500),
  quote: z.string().min(1).max(4000),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
});

export const extractionSchema = z.strictObject({
  claims: z.array(claimSchema).max(100),
});

export const citedTextSchema = z.strictObject({
  text: z.string().min(1).max(2400),
  claimIds: claimIdsSchema,
});

export const assessmentSchema = z.strictObject({
  headline: z.string().min(1).max(300),
  summary: z.string().min(1).max(2400),
  findings: z.array(z.strictObject({
    id: idSchema,
    kind: z.enum(["change", "conflict", "context", "unknown"]),
    title: z.string().min(1).max(300),
    detail: z.string().min(1).max(2400),
    claimIds: claimIdsSchema,
  })).max(40),
  criteria: z.array(z.strictObject({
    id: idSchema,
    label: z.string().min(1).max(300),
    status: z.enum(["met", "unmet", "disputed", "unknown"]),
    explanation: z.string().min(1).max(2400),
    claimIds: claimIdsSchema,
  })).max(20),
  founderQuestions: z.array(citedTextSchema).max(10),
});

export const answerSchema = z.strictObject({
  paragraphs: z.array(citedTextSchema).max(10),
  unknowns: z.array(z.string().min(1).max(1200)).max(10),
  mode: z.enum(["recorded", "live"]),
  retrievedSourceIds: z.array(idSchema).max(100),
});
