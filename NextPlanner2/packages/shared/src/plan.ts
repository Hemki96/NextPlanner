import { z } from "zod";

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const planCreateSchema = z.object({
  title: z.string().trim().min(1).max(140),
  scheduledAt: isoDateTimeSchema,
  focus: z.string().trim().max(140).optional().nullable(),
  content: z.string().trim().min(1),
  notes: z.string().max(4000).optional().nullable()
});

export const planUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(140).optional(),
    scheduledAt: isoDateTimeSchema.optional(),
    focus: z.string().trim().max(140).optional().nullable(),
    content: z.string().trim().min(1).optional(),
    notes: z.string().max(4000).optional().nullable()
  })
  .refine((value) => {
    return ["title", "scheduledAt", "focus", "content", "notes"].some((field) => field in value);
  }, "At least one updatable field is required.");

export const planDuplicateSchema = z.object({
  scheduledAt: isoDateTimeSchema.optional(),
  title: z.string().trim().min(1).max(180).optional()
});

export const planSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  title: z.string(),
  scheduledAt: isoDateTimeSchema,
  focus: z.string().nullable(),
  content: z.string(),
  notes: z.string().nullable(),
  version: z.number().int().positive(),
  createdById: z.string().min(1),
  updatedById: z.string().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const planRevisionSchema = z.object({
  id: z.string().min(1),
  planId: z.string().min(1),
  planVersion: z.number().int().positive(),
  changedById: z.string().min(1),
  changedAt: isoDateTimeSchema,
  snapshot: z.record(z.unknown())
});

export type PlanCreateInput = z.infer<typeof planCreateSchema>;
export type PlanUpdateInput = z.infer<typeof planUpdateSchema>;
export type PlanDuplicateInput = z.infer<typeof planDuplicateSchema>;
export type PlanDto = z.infer<typeof planSchema>;
export type PlanRevisionDto = z.infer<typeof planRevisionSchema>;
