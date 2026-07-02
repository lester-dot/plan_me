import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { and, eq, isNull } from "drizzle-orm";
import type { Role } from "../types.js";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { refreshTokens } from "../db/schema.js";

export interface AccessClaims {
  sub: string;
  email: string;
  role: Role;
  studentId?: string | null;
  employerId?: string | null;
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, config.JWT_ACCESS_SECRET, { expiresIn: config.ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessClaims;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(refreshTokens).values({ userId, tokenHash: hashToken(token), expiresAt });
  return token;
}

export async function rotateRefreshToken(token: string): Promise<{ userId: string; token: string } | null> {
  const [record] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, hashToken(token)), isNull(refreshTokens.revokedAt)))
    .limit(1);
  if (!record || record.expiresAt < new Date()) return null;
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, record.id));
  const next = await issueRefreshToken(record.userId);
  return { userId: record.userId, token: next };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, hashToken(token)));
}
