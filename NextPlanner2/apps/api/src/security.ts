import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import { config } from "./config.js";

type AccessTokenPayload = {
  sub: string;
  email: string;
};

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, config.jwtAccessSecret, {
    algorithm: "HS256",
    expiresIn: config.accessTokenTtlSeconds
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwtAccessSecret, {
    algorithms: ["HS256"]
  });

  if (!decoded || typeof decoded !== "object" || typeof decoded.sub !== "string") {
    throw new Error("Invalid access token payload");
  }

  return {
    sub: decoded.sub,
    email: typeof decoded.email === "string" ? decoded.email : ""
  };
}

export function generateRefreshToken(): string {
  const raw = randomBytes(48).toString("base64url");
  const signature = hashValue(`${raw}.${config.jwtRefreshSecret}`).slice(0, 32);
  return `${raw}.${signature}`;
}

export function refreshTokenExpiresAt(): Date {
  return new Date(Date.now() + config.refreshTokenTtlSeconds * 1000);
}

export function accessTokenExpiresInSeconds(): number {
  return config.accessTokenTtlSeconds;
}

export function validateRefreshTokenFormat(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 2 || parts[0].length < 20 || parts[1].length !== 32) {
    return false;
  }

  const expectedSignature = hashValue(`${parts[0]}.${config.jwtRefreshSecret}`).slice(0, 32);
  return expectedSignature === parts[1];
}

export function extractBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function setCommonHeaders(res: Response) {
  res.setHeader("cache-control", "no-store");
}
