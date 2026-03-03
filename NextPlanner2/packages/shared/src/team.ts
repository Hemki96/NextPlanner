import { z } from "zod";

export const teamRoleSchema = z.enum(["ADMIN", "COACH", "ASSISTANT"]);

export const organizationCreateSchema = z.object({
  name: z.string().trim().min(1).max(140)
});

export const teamCreateSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(1).max(140)
});

export const memberCreateSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().min(1).max(120).optional(),
  role: teamRoleSchema
});

export const memberUpdateSchema = z.object({
  role: teamRoleSchema
});

export const organizationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime({ offset: true })
});

export const teamSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  organizationName: z.string().min(1),
  name: z.string().min(1),
  role: teamRoleSchema,
  createdAt: z.string().datetime({ offset: true })
});

export const teamMemberSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  email: z.string().trim().email(),
  name: z.string().nullable(),
  role: teamRoleSchema,
  createdAt: z.string().datetime({ offset: true })
});

export type TeamRole = z.infer<typeof teamRoleSchema>;
export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;
export type TeamCreateInput = z.infer<typeof teamCreateSchema>;
export type MemberCreateInput = z.infer<typeof memberCreateSchema>;
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
export type OrganizationDto = z.infer<typeof organizationSchema>;
export type TeamDto = z.infer<typeof teamSchema>;
export type TeamMemberDto = z.infer<typeof teamMemberSchema>;
