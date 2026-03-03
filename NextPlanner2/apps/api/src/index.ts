import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { Prisma, type TeamRole } from "@prisma/client";
import {
  authLoginSchema,
  authLogoutSchema,
  authRefreshSchema,
  authRegisterSchema,
  importCreateSchema,
  memberCreateSchema,
  memberUpdateSchema,
  organizationCreateSchema,
  planCreateSchema,
  planDuplicateSchema,
  planUpdateSchema,
  teamCreateSchema
} from "@nextplanner2/shared";
import { z } from "zod";
import { config } from "./config.js";
import { errorHandler, fail, traceIdMiddleware, asyncRoute } from "./http.js";
import {
  appLogger,
  getMetricsText,
  metricsContentType,
  requestLoggingMiddleware
} from "./observability.js";
import { prisma } from "./prisma.js";
import {
  accessTokenExpiresInSeconds,
  extractBearerToken,
  generateRefreshToken,
  hashValue,
  refreshTokenExpiresAt,
  setCommonHeaders,
  signAccessToken,
  validateRefreshTokenFormat,
  verifyAccessToken
} from "./security.js";
import { emitTeamEvent, initRealtime } from "./realtime.js";

const app = express();

app.use(
  cors({
    origin: config.corsOrigins,
    credentials: false
  })
);
app.use(express.json({ limit: "3mb" }));
app.use(traceIdMiddleware);
app.use(requestLoggingMiddleware);
app.use((_req, res, next) => {
  setCommonHeaders(res);
  next();
});

app.get(
  "/healthz",
  asyncRoute(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  })
);

app.get(
  "/readyz",
  asyncRoute(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready" });
  })
);

app.get(
  "/metrics",
  asyncRoute(async (_req, res) => {
    const metrics = await getMetricsText();
    res.setHeader("content-type", metricsContentType());
    res.send(metrics);
  })
);

const requireAuth: express.RequestHandler = async (req, res, next) => {
  try {
    const token = extractBearerToken(req.header("authorization"));
    if (!token) {
      fail(401, "UNAUTHORIZED", "Missing bearer token.");
    }

    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, createdAt: true }
    });

    if (!user) {
      fail(401, "UNAUTHORIZED", "User not found.");
    }

    res.locals.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
};

app.post(
  "/v1/auth/register",
  asyncRoute(async (req, res) => {
    const parsed = parseBody(authRegisterSchema, req.body);

    const existing = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (existing) {
      fail(400, "BAD_REQUEST", "Email is already registered.");
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: parsed.email,
          passwordHash,
          name: parsed.name
        }
      });

      const organization = await tx.organization.create({
        data: {
          name: parsed.organizationName,
          createdById: user.id
        }
      });

      const team = await tx.team.create({
        data: {
          organizationId: organization.id,
          name: parsed.teamName
        }
      });

      await tx.teamMembership.create({
        data: {
          teamId: team.id,
          userId: user.id,
          role: "ADMIN"
        }
      });

      return { user };
    });

    const session = await issueSession(created.user.id, created.user.email);
    const teams = await loadUserTeams(created.user.id);

    res.status(201).json({
      user: toUserProfile(created.user),
      teams,
      ...session
    });
  })
);

app.post(
  "/v1/auth/login",
  asyncRoute(async (req, res) => {
    const parsed = parseBody(authLoginSchema, req.body);

    const user = await prisma.user.findUnique({
      where: { email: parsed.email }
    });

    if (!user) {
      fail(401, "UNAUTHORIZED", "Invalid credentials.");
    }

    const passwordOk = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!passwordOk) {
      fail(401, "UNAUTHORIZED", "Invalid credentials.");
    }

    const session = await issueSession(user.id, user.email);
    const teams = await loadUserTeams(user.id);

    res.json({
      user: toUserProfile(user),
      teams,
      ...session
    });
  })
);

app.post(
  "/v1/auth/refresh",
  asyncRoute(async (req, res) => {
    const parsed = parseBody(authRefreshSchema, req.body);
    if (!validateRefreshTokenFormat(parsed.refreshToken)) {
      fail(401, "UNAUTHORIZED", "Invalid refresh token.");
    }

    const tokenHash = hashValue(parsed.refreshToken);
    const refreshToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (
      !refreshToken ||
      refreshToken.revokedAt ||
      refreshToken.expiresAt.getTime() <= Date.now()
    ) {
      fail(401, "UNAUTHORIZED", "Refresh token expired or revoked.");
    }

    const newRefreshToken = generateRefreshToken();
    const newHash = hashValue(newRefreshToken);

    const created = await prisma.$transaction(async (tx) => {
      const nextToken = await tx.refreshToken.create({
        data: {
          userId: refreshToken.userId,
          tokenHash: newHash,
          expiresAt: refreshTokenExpiresAt()
        }
      });

      await tx.refreshToken.update({
        where: { id: refreshToken.id },
        data: {
          revokedAt: new Date(),
          replacedById: nextToken.id
        }
      });

      return nextToken;
    });

    res.json({
      accessToken: signAccessToken(refreshToken.user.id, refreshToken.user.email),
      refreshToken: newRefreshToken,
      expiresInSeconds: accessTokenExpiresInSeconds(),
      refreshTokenId: created.id
    });
  })
);

app.post(
  "/v1/auth/logout",
  asyncRoute(async (req, res) => {
    const parsed = parseBody(authLogoutSchema, req.body);
    if (validateRefreshTokenFormat(parsed.refreshToken)) {
      const tokenHash = hashValue(parsed.refreshToken);
      await prisma.refreshToken.updateMany({
        where: {
          tokenHash,
          revokedAt: null
        },
        data: { revokedAt: new Date() }
      });
    }

    res.status(204).send();
  })
);

app.get(
  "/v1/me",
  requireAuth,
  asyncRoute(async (_req, res) => {
    const user = getAuthUser(res);
    const teams = await loadUserTeams(user.id);

    res.json({
      user: toUserProfile(user),
      teams
    });
  })
);

app.post(
  "/v1/organizations",
  requireAuth,
  asyncRoute(async (req, res) => {
    const parsed = parseBody(organizationCreateSchema, req.body);
    const user = getAuthUser(res);

    const org = await prisma.organization.create({
      data: {
        name: parsed.name,
        createdById: user.id
      }
    });

    res.status(201).json(toOrganizationDto(org));
  })
);

app.post(
  "/v1/teams",
  requireAuth,
  asyncRoute(async (req, res) => {
    const parsed = parseBody(teamCreateSchema, req.body);
    const user = getAuthUser(res);

    const organization = await prisma.organization.findUnique({
      where: { id: parsed.organizationId }
    });

    if (!organization) {
      fail(404, "NOT_FOUND", "Organization not found.");
    }

    const adminInOrganization = await prisma.teamMembership.findFirst({
      where: {
        userId: user.id,
        role: "ADMIN",
        team: {
          organizationId: parsed.organizationId
        }
      }
    });

    if (organization.createdById !== user.id && !adminInOrganization) {
      fail(403, "FORBIDDEN", "Only organization admins can create teams.");
    }

    const team = await prisma.$transaction(async (tx) => {
      const createdTeam = await tx.team.create({
        data: {
          organizationId: parsed.organizationId,
          name: parsed.name
        },
        include: {
          organization: true
        }
      });

      await tx.teamMembership.create({
        data: {
          teamId: createdTeam.id,
          userId: user.id,
          role: "ADMIN"
        }
      });

      return createdTeam;
    });

    res.status(201).json({
      id: team.id,
      organizationId: team.organizationId,
      organizationName: team.organization.name,
      name: team.name,
      role: "ADMIN",
      createdAt: team.createdAt.toISOString()
    });
  })
);

app.get(
  "/v1/teams",
  requireAuth,
  asyncRoute(async (_req, res) => {
    const user = getAuthUser(res);
    const teams = await loadUserTeams(user.id);
    res.json(teams);
  })
);

app.get(
  "/v1/teams/:teamId/members",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getAuthUser(res);
    const teamId = req.params.teamId;
    await requireTeamMembership(user.id, teamId);

    const members = await prisma.teamMembership.findMany({
      where: { teamId },
      include: { user: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }]
    });

    res.json(members.map(toMemberDto));
  })
);

app.post(
  "/v1/teams/:teamId/members",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getAuthUser(res);
    const teamId = req.params.teamId;
    await requireTeamMembership(user.id, teamId, ["ADMIN"]);

    const parsed = parseBody(memberCreateSchema, req.body);
    const member = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { email: parsed.email } });
      const targetUser =
        existingUser ??
        (await tx.user.create({
          data: {
            email: parsed.email,
            name: parsed.name ?? null,
            passwordHash: await bcrypt.hash(randomBytes(24).toString("base64url"), 10)
          }
        }));

      const membership = await tx.teamMembership.upsert({
        where: {
          teamId_userId: {
            teamId,
            userId: targetUser.id
          }
        },
        update: {
          role: parsed.role
        },
        create: {
          teamId,
          userId: targetUser.id,
          role: parsed.role
        },
        include: { user: true }
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          teamId,
          action: "member.updated",
          entityType: "team_membership",
          entityId: membership.id,
          afterHash: hashValue(JSON.stringify({ userId: targetUser.id, role: membership.role }))
        }
      });

      return membership;
    });

    emitTeamEvent(teamId, "member.updated", {
      membershipId: member.id,
      userId: member.userId,
      role: member.role
    });

    res.status(201).json(toMemberDto(member));
  })
);

app.patch(
  "/v1/teams/:teamId/members/:membershipId",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getAuthUser(res);
    const { teamId, membershipId } = req.params;
    await requireTeamMembership(user.id, teamId, ["ADMIN"]);

    const parsed = parseBody(memberUpdateSchema, req.body);
    const existing = await prisma.teamMembership.findFirst({
      where: {
        id: membershipId,
        teamId
      },
      include: { user: true }
    });

    if (!existing) {
      fail(404, "NOT_FOUND", "Membership not found.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.teamMembership.update({
        where: { id: membershipId },
        data: { role: parsed.role },
        include: { user: true }
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          teamId,
          action: "member.updated",
          entityType: "team_membership",
          entityId: result.id,
          beforeHash: hashValue(JSON.stringify({ role: existing.role })),
          afterHash: hashValue(JSON.stringify({ role: result.role }))
        }
      });

      return result;
    });

    emitTeamEvent(teamId, "member.updated", {
      membershipId: updated.id,
      userId: updated.userId,
      role: updated.role
    });

    res.json(toMemberDto(updated));
  })
);

app.get(
  "/v1/teams/:teamId/plans",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getAuthUser(res);
    const teamId = req.params.teamId;
    await requireTeamMembership(user.id, teamId);

    const plans = await prisma.plan.findMany({
      where: { teamId },
      orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }]
    });

    const listTag = listEtag(plans.map((plan) => ({ id: plan.id, version: plan.version })));
    res.setHeader("etag", listTag);
    res.setHeader("x-poll-interval-ms", String(config.pollIntervalMs));

    if (req.header("if-none-match") === listTag) {
      res.status(304).send();
      return;
    }

    res.json(plans.map(toPlanDto));
  })
);

app.post(
  "/v1/teams/:teamId/plans",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getAuthUser(res);
    const teamId = req.params.teamId;
    await requireTeamMembership(user.id, teamId, ["ADMIN", "COACH"]);

    const parsed = parseBody(planCreateSchema, req.body);
    const created = await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          teamId,
          title: parsed.title,
          scheduledAt: new Date(parsed.scheduledAt),
          focus: parsed.focus ?? null,
          content: parsed.content,
          notes: parsed.notes ?? null,
          createdById: user.id,
          updatedById: user.id
        }
      });

      await tx.planRevision.create({
        data: {
          planId: plan.id,
          planVersion: plan.version,
          snapshot: planSnapshot(plan),
          changedById: user.id
        }
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          teamId,
          action: "plan.created",
          entityType: "plan",
          entityId: plan.id,
          afterHash: hashValue(JSON.stringify(planSnapshot(plan)))
        }
      });

      return plan;
    });

    emitTeamEvent(teamId, "plan.created", { planId: created.id, version: created.version });
    res.setHeader("etag", planEtag(created.id, created.version));
    res.status(201).json(toPlanDto(created));
  })
);

app.patch(
  "/v1/teams/:teamId/plans/:planId",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getAuthUser(res);
    const { teamId, planId } = req.params;
    await requireTeamMembership(user.id, teamId, ["ADMIN", "COACH"]);

    const parsed = parseBody(planUpdateSchema, req.body);
    const ifMatch = req.header("if-match");
    if (!ifMatch) {
      fail(428, "PRECONDITION_REQUIRED", "If-Match header is required.");
    }

    const expectedVersion = parsePlanVersionFromEtag(ifMatch, planId);
    const existing = await prisma.plan.findFirst({
      where: {
        id: planId,
        teamId
      }
    });

    if (!existing) {
      fail(404, "NOT_FOUND", "Plan not found.");
    }

    if (existing.version !== expectedVersion) {
      res.setHeader("etag", planEtag(existing.id, existing.version));
      res.status(409).json({
        code: "VERSION_CONFLICT",
        message: "Plan has been updated by someone else.",
        traceId: res.locals.traceId,
        details: {
          serverVersion: existing.version,
          serverSnapshot: toPlanDto(existing)
        }
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.update({
        where: { id: planId },
        data: {
          title: parsed.title,
          scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : undefined,
          focus: parsed.focus,
          content: parsed.content,
          notes: parsed.notes,
          updatedById: user.id,
          version: { increment: 1 }
        }
      });

      await tx.planRevision.create({
        data: {
          planId: plan.id,
          planVersion: plan.version,
          snapshot: planSnapshot(plan),
          changedById: user.id
        }
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          teamId,
          action: "plan.updated",
          entityType: "plan",
          entityId: plan.id,
          beforeHash: hashValue(JSON.stringify(planSnapshot(existing))),
          afterHash: hashValue(JSON.stringify(planSnapshot(plan)))
        }
      });

      return plan;
    });

    emitTeamEvent(teamId, "plan.updated", { planId: updated.id, version: updated.version });
    res.setHeader("etag", planEtag(updated.id, updated.version));
    res.json(toPlanDto(updated));
  })
);

app.delete(
  "/v1/teams/:teamId/plans/:planId",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getAuthUser(res);
    const { teamId, planId } = req.params;
    await requireTeamMembership(user.id, teamId, ["ADMIN", "COACH"]);

    const existing = await prisma.plan.findFirst({
      where: {
        id: planId,
        teamId
      }
    });

    if (!existing) {
      fail(404, "NOT_FOUND", "Plan not found.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.planRevision.create({
        data: {
          planId: existing.id,
          planVersion: existing.version,
          snapshot: planSnapshot(existing),
          changedById: user.id
        }
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          teamId,
          action: "plan.deleted",
          entityType: "plan",
          entityId: existing.id,
          beforeHash: hashValue(JSON.stringify(planSnapshot(existing)))
        }
      });

      await tx.plan.delete({ where: { id: existing.id } });
    });

    emitTeamEvent(teamId, "plan.deleted", { planId: existing.id });
    res.status(204).send();
  })
);

app.post(
  "/v1/teams/:teamId/plans/:planId/duplicate",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getAuthUser(res);
    const { teamId, planId } = req.params;
    await requireTeamMembership(user.id, teamId, ["ADMIN", "COACH"]);

    const parsed = parseBody(planDuplicateSchema, req.body ?? {});
    const source = await prisma.plan.findFirst({
      where: {
        id: planId,
        teamId
      }
    });

    if (!source) {
      fail(404, "NOT_FOUND", "Plan not found.");
    }

    const duplicated = await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          teamId,
          title: parsed.title ?? `${source.title} (Copy)`,
          scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : source.scheduledAt,
          focus: source.focus,
          content: source.content,
          notes: source.notes,
          createdById: user.id,
          updatedById: user.id
        }
      });

      await tx.planRevision.create({
        data: {
          planId: plan.id,
          planVersion: plan.version,
          snapshot: planSnapshot(plan),
          changedById: user.id
        }
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          teamId,
          action: "plan.duplicated",
          entityType: "plan",
          entityId: plan.id,
          afterHash: hashValue(JSON.stringify(planSnapshot(plan))),
          metadata: {
            sourcePlanId: source.id
          }
        }
      });

      return plan;
    });

    emitTeamEvent(teamId, "plan.created", { planId: duplicated.id, version: duplicated.version });
    res.setHeader("etag", planEtag(duplicated.id, duplicated.version));
    res.status(201).json(toPlanDto(duplicated));
  })
);

app.get(
  "/v1/teams/:teamId/plans/:planId/history",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getAuthUser(res);
    const { teamId, planId } = req.params;
    await requireTeamMembership(user.id, teamId);

    const plan = await prisma.plan.findFirst({
      where: {
        id: planId,
        teamId
      }
    });

    if (!plan) {
      fail(404, "NOT_FOUND", "Plan not found.");
    }

    const revisions = await prisma.planRevision.findMany({
      where: { planId },
      orderBy: { changedAt: "desc" }
    });

    res.json(
      revisions.map((revision) => ({
        id: revision.id,
        planId: revision.planId,
        planVersion: revision.planVersion,
        changedById: revision.changedById,
        changedAt: revision.changedAt.toISOString(),
        snapshot: revision.snapshot
      }))
    );
  })
);

app.post(
  "/v1/teams/:teamId/imports",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getAuthUser(res);
    const teamId = req.params.teamId;
    await requireTeamMembership(user.id, teamId, ["ADMIN", "COACH"]);

    const parsed = parseBody(importCreateSchema, req.body);
    const records = parseImportPayload(parsed.sourceType, parsed.payload);

    const job = await prisma.importJob.create({
      data: {
        teamId,
        createdById: user.id,
        status: "PROCESSING",
        sourceType: parsed.sourceType,
        dryRun: parsed.dryRun
      }
    });

    let imported = 0;
    let errors = 0;

    for (let index = 0; index < records.length; index += 1) {
      const rowNumber = index + 1;
      const raw = records[index];
      const normalized = normalizeImportRow(raw);
      const validated = planCreateSchema.safeParse(normalized);

      if (!validated.success) {
        errors += 1;
        await prisma.importRow.create({
          data: {
            importJobId: job.id,
            rowNumber,
            status: "ERROR",
            error: validated.error.issues[0]?.message ?? "Invalid row",
            raw: raw as Prisma.InputJsonValue
          }
        });
        continue;
      }

      if (parsed.dryRun) {
        imported += 1;
        await prisma.importRow.create({
          data: {
            importJobId: job.id,
            rowNumber,
            status: "OK",
            raw: raw as Prisma.InputJsonValue
          }
        });
        continue;
      }

      const created = await prisma.$transaction(async (tx) => {
        const plan = await tx.plan.create({
          data: {
            teamId,
            title: validated.data.title,
            scheduledAt: new Date(validated.data.scheduledAt),
            focus: validated.data.focus ?? null,
            content: validated.data.content,
            notes: validated.data.notes ?? null,
            createdById: user.id,
            updatedById: user.id
          }
        });

        await tx.planRevision.create({
          data: {
            planId: plan.id,
            planVersion: plan.version,
            snapshot: planSnapshot(plan),
            changedById: user.id
          }
        });

        await tx.auditEvent.create({
          data: {
            actorUserId: user.id,
            teamId,
            action: "plan.imported",
            entityType: "plan",
            entityId: plan.id,
            afterHash: hashValue(JSON.stringify(planSnapshot(plan))),
            metadata: {
              importJobId: job.id,
              rowNumber
            } as Prisma.InputJsonValue
          }
        });

        const row = await tx.importRow.create({
          data: {
            importJobId: job.id,
            rowNumber,
            status: "OK",
            raw: raw as Prisma.InputJsonValue,
            createdPlanId: plan.id
          }
        });

        return { plan, row };
      });

      imported += 1;
      emitTeamEvent(teamId, "plan.created", { planId: created.plan.id, version: created.plan.version });
    }

    const summary = {
      total: records.length,
      imported,
      errors
    };

    const finished = await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        summary: summary as Prisma.InputJsonValue
      }
    });

    emitTeamEvent(teamId, "import.completed", {
      importJobId: finished.id,
      summary,
      dryRun: finished.dryRun
    });

    res.status(201).json(toImportJobDto(finished));
  })
);

app.get(
  "/v1/teams/:teamId/imports/:importId",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getAuthUser(res);
    const { teamId, importId } = req.params;
    await requireTeamMembership(user.id, teamId);

    const job = await prisma.importJob.findFirst({
      where: {
        id: importId,
        teamId
      }
    });

    if (!job) {
      fail(404, "NOT_FOUND", "Import job not found.");
    }

    res.json(toImportJobDto(job));
  })
);

app.get(
  "/v1/teams/:teamId/imports/:importId/errors",
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getAuthUser(res);
    const { teamId, importId } = req.params;
    await requireTeamMembership(user.id, teamId);

    const rows = await prisma.importRow.findMany({
      where: {
        importJobId: importId,
        status: "ERROR",
        importJob: {
          teamId
        }
      },
      orderBy: { rowNumber: "asc" }
    });

    res.json(
      rows.map((row) => ({
        rowNumber: row.rowNumber,
        error: row.error ?? "Invalid row",
        raw: toRecord(row.raw)
      }))
    );
  })
);

app.use(errorHandler);

const server = createServer(app);
initRealtime(server);

export function startServer() {
  server.listen(config.port, () => {
    appLogger.info(
      {
        port: config.port
      },
      "server.started"
    );
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export { app, server };

function parseBody<TSchema extends z.ZodTypeAny>(schema: TSchema, body: unknown): z.infer<TSchema> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    fail(400, "VALIDATION_ERROR", "Request validation failed.", parsed.error.flatten());
  }

  return parsed.data as z.infer<TSchema>;
}

function getAuthUser(res: Response): {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
} {
  const user = res.locals.authUser as
    | {
        id: string;
        email: string;
        name: string | null;
        createdAt: Date;
      }
    | undefined;

  if (!user) {
    fail(401, "UNAUTHORIZED", "Authentication required.");
  }

  return user;
}

async function issueSession(userId: string, email: string) {
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashValue(refreshToken),
      expiresAt: refreshTokenExpiresAt()
    }
  });

  return {
    accessToken: signAccessToken(userId, email),
    refreshToken,
    expiresInSeconds: accessTokenExpiresInSeconds()
  };
}

async function loadUserTeams(userId: string) {
  const memberships = await prisma.teamMembership.findMany({
    where: { userId },
    include: {
      team: {
        include: {
          organization: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  return memberships.map((membership) => ({
    id: membership.team.id,
    organizationId: membership.team.organizationId,
    organizationName: membership.team.organization.name,
    name: membership.team.name,
    role: membership.role,
    createdAt: membership.team.createdAt.toISOString()
  }));
}

async function requireTeamMembership(userId: string, teamId: string, roles?: TeamRole[]) {
  const membership = await prisma.teamMembership.findFirst({
    where: {
      userId,
      teamId
    }
  });

  if (!membership) {
    fail(403, "FORBIDDEN", "No access to this team.");
  }

  if (roles && roles.length > 0 && !roles.includes(membership.role)) {
    fail(403, "FORBIDDEN", "Insufficient role for this action.");
  }

  return membership;
}

function toUserProfile(user: { id: string; email: string; name: string | null; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString()
  };
}

function toOrganizationDto(organization: { id: string; name: string; createdAt: Date }) {
  return {
    id: organization.id,
    name: organization.name,
    createdAt: organization.createdAt.toISOString()
  };
}

function toMemberDto(membership: {
  id: string;
  userId: string;
  role: TeamRole;
  createdAt: Date;
  user: {
    email: string;
    name: string | null;
  };
}) {
  return {
    id: membership.id,
    userId: membership.userId,
    email: membership.user.email,
    name: membership.user.name,
    role: membership.role,
    createdAt: membership.createdAt.toISOString()
  };
}

function toPlanDto(plan: {
  id: string;
  teamId: string;
  title: string;
  scheduledAt: Date;
  focus: string | null;
  content: string;
  notes: string | null;
  version: number;
  createdById: string;
  updatedById: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: plan.id,
    teamId: plan.teamId,
    title: plan.title,
    scheduledAt: plan.scheduledAt.toISOString(),
    focus: plan.focus,
    content: plan.content,
    notes: plan.notes,
    version: plan.version,
    createdById: plan.createdById,
    updatedById: plan.updatedById,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString()
  };
}

function toImportJobDto(job: {
  id: string;
  teamId: string;
  status: string;
  sourceType: string;
  createdById: string;
  dryRun: boolean;
  summary: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: job.id,
    teamId: job.teamId,
    status: job.status,
    sourceType: job.sourceType,
    createdById: job.createdById,
    dryRun: job.dryRun,
    summary: isSummary(job.summary) ? job.summary : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}

function parsePlanVersionFromEtag(etag: string, planId: string): number {
  const match = etag.match(/^W\/"plan-([A-Za-z0-9]+)-v(\d+)"$/) ?? etag.match(/^"plan-([A-Za-z0-9]+)-v(\d+)"$/);
  if (!match) {
    fail(428, "PRECONDITION_REQUIRED", "If-Match header must be a plan ETag.");
  }

  if (match[1] !== planId) {
    fail(428, "PRECONDITION_REQUIRED", "If-Match plan id does not match request plan id.");
  }

  return Number(match[2]);
}

function planEtag(planId: string, version: number): string {
  return `W/"plan-${planId}-v${version}"`;
}

function listEtag(items: Array<{ id: string; version: number }>): string {
  const payload = items.map((item) => `${item.id}:${item.version}`).join("|");
  return `W/"plans-${hashValue(payload)}"`;
}

function planSnapshot(plan: {
  id: string;
  teamId: string;
  title: string;
  scheduledAt: Date;
  focus: string | null;
  content: string;
  notes: string | null;
  version: number;
  createdById: string;
  updatedById: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: plan.id,
    teamId: plan.teamId,
    title: plan.title,
    scheduledAt: plan.scheduledAt.toISOString(),
    focus: plan.focus,
    content: plan.content,
    notes: plan.notes,
    version: plan.version,
    createdById: plan.createdById,
    updatedById: plan.updatedById,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString()
  };
}

function parseImportPayload(sourceType: "json" | "csv", payload: string): Array<Record<string, unknown>> {
  if (sourceType === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      fail(400, "VALIDATION_ERROR", "Import JSON is invalid.");
    }

    if (!Array.isArray(parsed)) {
      fail(400, "VALIDATION_ERROR", "Import JSON must be an array of rows.");
    }

    return parsed.map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        fail(400, "VALIDATION_ERROR", `Import row ${index + 1} is not an object.`);
      }

      return entry as Record<string, unknown>;
    });
  }

  const rows = parseCsv(payload);
  if (rows.length === 0) {
    fail(400, "VALIDATION_ERROR", "Import CSV has no rows.");
  }

  return rows;
}

function parseCsv(payload: string): Array<Record<string, string>> {
  const lines = payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const header = parseCsvLine(lines[0]).map((field) => field.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};

    for (let index = 0; index < header.length; index += 1) {
      const key = header[index];
      row[key] = values[index] ?? "";
    }

    return row;
  });
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function normalizeImportRow(row: Record<string, unknown>) {
  const title = stringValue(row.title) ?? stringValue(row.name);
  const scheduledAt =
    stringValue(row.scheduledAt) ?? stringValue(row.date) ?? stringValue(row.datetime) ?? stringValue(row.timestamp);
  const content = stringValue(row.content) ?? stringValue(row.planText) ?? stringValue(row.plantext) ?? "";

  return {
    title,
    scheduledAt,
    focus: nullableStringValue(row.focus),
    content,
    notes: nullableStringValue(row.notes)
  };
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function nullableStringValue(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = stringValue(value);
  return normalized ?? null;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function isSummary(value: unknown): value is { total: number; imported: number; errors: number } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.total === "number" &&
    typeof candidate.imported === "number" &&
    typeof candidate.errors === "number"
  );
}
