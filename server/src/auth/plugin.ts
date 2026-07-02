import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "../types.js";
import { verifyAccessToken } from "./tokens.js";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  studentId?: string | null;
  employerId?: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

// Populates req.user when a valid access token is present (does not reject).
export function authContext(req: FastifyRequest): void {
  const token = extractToken(req);
  if (!token) return;
  try {
    const claims = verifyAccessToken(token);
    req.user = {
      id: claims.sub,
      email: claims.email,
      role: claims.role,
      studentId: claims.studentId ?? null,
      employerId: claims.employerId ?? null,
    };
  } catch {
    // ignore invalid token; guarded routes will reject
  }
}

// preHandler: requires an authenticated user, optionally with one of the roles.
export function requireAuth(roles?: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      return reply.code(401).send({ error: "Требуется вход в систему" });
    }
    if (roles && roles.length && !roles.includes(req.user.role)) {
      return reply.code(403).send({ error: "Недостаточно прав для этого действия" });
    }
  };
}

export function registerAuthHook(app: FastifyInstance): void {
  app.addHook("onRequest", async (req) => {
    authContext(req);
  });
}
