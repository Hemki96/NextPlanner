import { z } from "zod";

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(8).max(128);

export const authRegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
  organizationName: z.string().trim().min(1).max(140),
  teamName: z.string().trim().min(1).max(140)
});

export const authLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});

export const authRefreshSchema = z.object({
  refreshToken: z.string().min(20)
});

export const authLogoutSchema = z.object({
  refreshToken: z.string().min(20)
});

export const authTokenSchema = z.object({
  accessToken: z.string().min(20),
  refreshToken: z.string().min(20),
  expiresInSeconds: z.number().int().positive()
});

export const userProfileSchema = z.object({
  id: z.string().min(1),
  email: emailSchema,
  name: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true })
});

export type AuthRegisterInput = z.infer<typeof authRegisterSchema>;
export type AuthLoginInput = z.infer<typeof authLoginSchema>;
export type AuthRefreshInput = z.infer<typeof authRefreshSchema>;
export type AuthLogoutInput = z.infer<typeof authLogoutSchema>;
export type AuthTokenDto = z.infer<typeof authTokenSchema>;
export type UserProfileDto = z.infer<typeof userProfileSchema>;
