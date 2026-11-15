import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const ExtractedDecision = z.object({
  title: z.string().min(3).max(200),
  statement: z.string().min(8).max(1200),
  rationale: z.string().max(2000).optional().default(''),
  alternatives_rejected: z.array(z.string().max(300)).max(10).optional().default([]),
  scope_tags: z.array(z.string().max(40)).max(10).optional().default([]),
  owner_name: z.string().max(120).nullable().optional().transform((v) => v ?? null),
  decided_at: isoDate,
  status: z.enum(['proposed', 'accepted']).optional().default('accepted'),
  quote: z.string().min(8).max(1200),
  confidence: z.number().min(0).max(1),
});

export const ExtractedPromise = z.object({
  statement: z.string().min(6).max(600),
  owner_name: z.string().max(120).nullable().optional().transform((v) => v ?? null),
  due_date: isoDate,
  linked_issue_key: z
    .string()
    .regex(/^[A-Z][A-Z0-9]+-\d+$/)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  scope_tags: z.array(z.string().max(40)).max(10).optional().default([]),
  quote: z.string().min(6).max(1200),
  confidence: z.number().min(0).max(1),
});

export const ExtractionResult = z.object({
  decisions: z.array(ExtractedDecision).max(20).default([]),
  promises: z.array(ExtractedPromise).max(30).default([]),
});

export type ExtractedDecisionT = z.infer<typeof ExtractedDecision>;
export type ExtractedPromiseT = z.infer<typeof ExtractedPromise>;
export type ExtractionResultT = z.infer<typeof ExtractionResult>;

export const Relation = z.enum(['conflict', 'revisits', 'related', 'unrelated']);
export type RelationT = z.infer<typeof Relation>;

export const JudgeResult = z.object({
  relation: Relation,
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(5).max(400),
  quote: z.string().max(600).optional().default(''),
});
export type JudgeResultT = z.infer<typeof JudgeResult>;

export const IncidentMatch = z.object({
  similar: z.boolean(),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(5).max(400),
});
export type IncidentMatchT = z.infer<typeof IncidentMatch>;

export const Explanation = z.object({
  summary: z.string().min(10).max(1500),
  citations: z.array(z.string()).max(10).default([]),
});
export type ExplanationT = z.infer<typeof Explanation>;
