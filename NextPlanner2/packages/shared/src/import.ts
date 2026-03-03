import { z } from "zod";

export const importSourceTypeSchema = z.enum(["json", "csv"]);
export const importJobStatusSchema = z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]);

export const importCreateSchema = z.object({
  sourceType: importSourceTypeSchema,
  payload: z.string().min(2),
  dryRun: z.boolean().optional().default(false)
});

export const importRowErrorSchema = z.object({
  rowNumber: z.number().int().positive(),
  error: z.string(),
  raw: z.record(z.unknown()).optional()
});

export const importJobSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  status: importJobStatusSchema,
  sourceType: importSourceTypeSchema,
  createdById: z.string().min(1),
  dryRun: z.boolean(),
  summary: z
    .object({
      total: z.number().int().nonnegative(),
      imported: z.number().int().nonnegative(),
      errors: z.number().int().nonnegative()
    })
    .nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
});

export type ImportCreateInput = z.infer<typeof importCreateSchema>;
export type ImportJobDto = z.infer<typeof importJobSchema>;
export type ImportRowErrorDto = z.infer<typeof importRowErrorSchema>;
