import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { verifyAccessToken } from "./security.js";
import { prisma } from "./prisma.js";
import { config } from "./config.js";

type EventPayload = {
  type: string;
  teamId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

let io: Server | null = null;

export function initRealtime(server: HttpServer): Server {
  io = new Server(server, {
    path: "/v1/realtime/socket",
    cors: {
      origin: config.corsOrigins,
      credentials: false
    }
  });

  io.use((socket, next) => {
    const token =
      (typeof socket.handshake.auth.token === "string" && socket.handshake.auth.token) ||
      extractFromAuthHeader(socket.handshake.headers.authorization);

    if (!token) {
      next(new Error("UNAUTHORIZED"));
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.data.userId as string;

    const memberships = await prisma.teamMembership.findMany({
      where: { userId },
      select: { teamId: true }
    });

    for (const membership of memberships) {
      socket.join(roomName(membership.teamId));
    }
  });

  return io;
}

export function emitTeamEvent(teamId: string, type: string, payload: Record<string, unknown>) {
  if (!io) {
    return;
  }

  const event: EventPayload = {
    type,
    teamId,
    payload,
    occurredAt: new Date().toISOString()
  };

  io.to(roomName(teamId)).emit("event", event);
}

function roomName(teamId: string): string {
  return `team:${teamId}`;
}

function extractFromAuthHeader(header: string | string[] | undefined): string | null {
  if (!header || Array.isArray(header)) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}
