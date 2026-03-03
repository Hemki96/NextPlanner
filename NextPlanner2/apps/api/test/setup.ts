process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test-access-secret-please-change";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-please-change";
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS ?? "http://localhost:5173";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://nextplanner:nextplanner@localhost:5432/nextplanner2?schema=public";
