import dotenv from "dotenv";

dotenv.config();

const required = ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: parseNumber(process.env.PORT, 4000),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL as string,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET as string,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
  accessTokenTtlSeconds: parseNumber(process.env.ACCESS_TOKEN_TTL_SECONDS, 900),
  refreshTokenTtlSeconds: parseNumber(process.env.REFRESH_TOKEN_TTL_SECONDS, 60 * 60 * 24 * 30),
  pollIntervalMs: parseNumber(process.env.POLL_INTERVAL_MS, 30000)
};
