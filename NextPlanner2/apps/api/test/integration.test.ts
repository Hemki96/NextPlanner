import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app, server } from "../src/index.js";
import { prisma } from "../src/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const API_DIR = path.resolve(__dirname, "..");

type Session = {
  accessToken: string;
  refreshToken: string;
  teamId: string;
  userId: string;
};

beforeAll(() => {
  try {
    execSync("npx prisma db push --skip-generate", {
      cwd: API_DIR,
      stdio: "pipe"
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Test database is not reachable. Start PostgreSQL and set DATABASE_URL before running API integration tests. Details: ${details}`
    );
  }
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "ImportRow",
      "ImportJob",
      "RefreshToken",
      "AuditEvent",
      "PlanRevision",
      "Plan",
      "TeamMembership",
      "Team",
      "Organization",
      "User"
    RESTART IDENTITY CASCADE;
  `);
});

afterAll(async () => {
  await prisma.$disconnect();
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

describe("API integration", () => {
  it("registers, logs in, refreshes and revokes session tokens", async () => {
    const email = uniqueEmail("auth");
    const password = "StrongPassw0rd!";

    const registered = await registerUser({
      email,
      password,
      name: "Auth User",
      organizationName: "Auth Org",
      teamName: "Auth Team"
    });

    expect(registered.accessToken.length).toBeGreaterThan(20);
    expect(registered.refreshToken.length).toBeGreaterThan(20);

    const loginResponse = await request(app).post("/v1/auth/login").send({
      email,
      password
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.accessToken).toBeTypeOf("string");

    const meResponse = await request(app)
      .get("/v1/me")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe(email);

    const refreshed = await request(app).post("/v1/auth/refresh").send({
      refreshToken: loginResponse.body.refreshToken
    });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(loginResponse.body.refreshToken);

    const logoutResponse = await request(app).post("/v1/auth/logout").send({
      refreshToken: refreshed.body.refreshToken
    });

    expect(logoutResponse.status).toBe(204);

    const refreshAfterLogout = await request(app).post("/v1/auth/refresh").send({
      refreshToken: refreshed.body.refreshToken
    });

    expect(refreshAfterLogout.status).toBe(401);
    expect(refreshAfterLogout.body.code).toBe("UNAUTHORIZED");
  });

  it("enforces RBAC: ASSISTANT cannot change team membership", async () => {
    const admin = await registerUser({
      email: uniqueEmail("admin"),
      password: "StrongPassw0rd!",
      name: "Admin",
      organizationName: "Main Org",
      teamName: "Main Team"
    });

    const assistantEmail = uniqueEmail("assistant");
    const assistantPassword = "StrongPassw0rd!";

    await registerUser({
      email: assistantEmail,
      password: assistantPassword,
      name: "Assistant",
      organizationName: "Other Org",
      teamName: "Other Team"
    });

    const invited = await request(app)
      .post(`/v1/teams/${admin.teamId}/members`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        email: assistantEmail,
        role: "ASSISTANT"
      });

    expect(invited.status).toBe(201);
    const membershipId = invited.body.id as string;

    const assistantLogin = await request(app).post("/v1/auth/login").send({
      email: assistantEmail,
      password: assistantPassword
    });

    expect(assistantLogin.status).toBe(200);

    const forbidden = await request(app)
      .patch(`/v1/teams/${admin.teamId}/members/${membershipId}`)
      .set("Authorization", `Bearer ${assistantLogin.body.accessToken}`)
      .send({ role: "COACH" });

    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe("FORBIDDEN");
  });

  it("returns VERSION_CONFLICT when If-Match ETag is stale", async () => {
    const session = await registerUser({
      email: uniqueEmail("conflict"),
      password: "StrongPassw0rd!",
      name: "Conflict User",
      organizationName: "Conflict Org",
      teamName: "Conflict Team"
    });

    const created = await request(app)
      .post(`/v1/teams/${session.teamId}/plans`)
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({
        title: "Plan A",
        scheduledAt: new Date().toISOString(),
        content: "Initial content",
        focus: "Speed",
        notes: null
      });

    expect(created.status).toBe(201);
    const etagV1 = created.headers.etag as string;
    const planId = created.body.id as string;

    const updated = await request(app)
      .patch(`/v1/teams/${session.teamId}/plans/${planId}`)
      .set("Authorization", `Bearer ${session.accessToken}`)
      .set("If-Match", etagV1)
      .send({ title: "Plan A v2" });

    expect(updated.status).toBe(200);

    const staleUpdate = await request(app)
      .patch(`/v1/teams/${session.teamId}/plans/${planId}`)
      .set("Authorization", `Bearer ${session.accessToken}`)
      .set("If-Match", etagV1)
      .send({ notes: "stale writer" });

    expect(staleUpdate.status).toBe(409);
    expect(staleUpdate.body.code).toBe("VERSION_CONFLICT");
    expect(staleUpdate.body.details.serverVersion).toBeGreaterThan(1);
    expect(staleUpdate.body.details.serverSnapshot.id).toBe(planId);
  });

  it("imports JSON rows and reports per-row failures", async () => {
    const session = await registerUser({
      email: uniqueEmail("import"),
      password: "StrongPassw0rd!",
      name: "Import User",
      organizationName: "Import Org",
      teamName: "Import Team"
    });

    const payload = JSON.stringify([
      {
        title: "Imported 1",
        scheduledAt: new Date().toISOString(),
        focus: "Technique",
        content: "4x100 easy",
        notes: "row 1"
      },
      {
        title: "Invalid row",
        scheduledAt: new Date().toISOString()
      }
    ]);

    const importResponse = await request(app)
      .post(`/v1/teams/${session.teamId}/imports`)
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({
        sourceType: "json",
        payload,
        dryRun: false
      });

    expect(importResponse.status).toBe(201);
    expect(importResponse.body.summary.total).toBe(2);
    expect(importResponse.body.summary.imported).toBe(1);
    expect(importResponse.body.summary.errors).toBe(1);

    const plansResponse = await request(app)
      .get(`/v1/teams/${session.teamId}/plans`)
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(plansResponse.status).toBe(200);
    expect(plansResponse.body).toHaveLength(1);

    const errorsResponse = await request(app)
      .get(`/v1/teams/${session.teamId}/imports/${importResponse.body.id}/errors`)
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(errorsResponse.status).toBe(200);
    expect(errorsResponse.body).toHaveLength(1);
    expect(errorsResponse.body[0].rowNumber).toBe(2);
  });
});

async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  organizationName: string;
  teamName: string;
}): Promise<Session> {
  const response = await request(app).post("/v1/auth/register").send(input);

  if (response.status !== 201) {
    throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return {
    accessToken: response.body.accessToken as string,
    refreshToken: response.body.refreshToken as string,
    teamId: response.body.teams[0].id as string,
    userId: response.body.user.id as string
  };
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}
