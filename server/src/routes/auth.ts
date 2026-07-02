import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import type { Role } from "../types.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { issueRefreshToken, rotateRefreshToken, revokeRefreshToken, signAccessToken } from "../auth/tokens.js";
import { requireAuth } from "../auth/plugin.js";
import { logAudit } from "../services/audit.js";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(["STUDENT", "TEACHER", "HEAD", "METHODOLOGIST", "DIRECTOR", "EMPLOYER", "ADMIN"]),
  studentId: z.string().optional(),
  employerId: z.string().optional(),
});

async function findByEmail(email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return row;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Введите корректные email и пароль" });
    const user = await findByEmail(parsed.data.email);
    if (!user || !user.isActive || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      await logAudit(user?.id ?? null, "login.failed", "User", user?.id, { email: parsed.data.email });
      return reply.code(401).send({ error: "Неверный email или пароль" });
    }
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      employerId: user.employerId,
    });
    const refreshToken = await issueRefreshToken(user.id);
    await logAudit(user.id, "login.success", "User", user.id);
    return reply.send({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, studentId: user.studentId, employerId: user.employerId },
    });
  });

  app.post("/api/auth/refresh", async (req, reply) => {
    const token = (req.body as { refreshToken?: string })?.refreshToken;
    if (!token) return reply.code(400).send({ error: "refreshToken обязателен" });
    const rotated = await rotateRefreshToken(token);
    if (!rotated) return reply.code(401).send({ error: "Сессия истекла, войдите заново" });
    const [user] = await db.select().from(users).where(eq(users.id, rotated.userId)).limit(1);
    if (!user || !user.isActive) return reply.code(401).send({ error: "Пользователь недоступен" });
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      employerId: user.employerId,
    });
    return reply.send({ accessToken, refreshToken: rotated.token });
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = (req.body as { refreshToken?: string })?.refreshToken;
    if (token) await revokeRefreshToken(token);
    return reply.send({ ok: true });
  });

  app.get("/api/auth/me", { preHandler: requireAuth() }, async (req, reply) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!user) return reply.code(404).send({ error: "Пользователь не найден" });
    return reply.send({ id: user.id, email: user.email, name: user.name, role: user.role, studentId: user.studentId, employerId: user.employerId });
  });

  // Создание учётных записей — только администратор.
  app.post("/api/auth/register", { preHandler: requireAuth(["ADMIN"]) }, async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Некорректные данные", details: parsed.error.flatten() });
    const exists = await findByEmail(parsed.data.email);
    if (exists) return reply.code(409).send({ error: "Пользователь с таким email уже существует" });
    const [user] = await db
      .insert(users)
      .values({
        email: parsed.data.email.toLowerCase(),
        passwordHash: await hashPassword(parsed.data.password),
        name: parsed.data.name,
        role: parsed.data.role as Role,
        studentId: parsed.data.studentId ?? null,
        employerId: parsed.data.employerId ?? null,
      })
      .returning();
    await logAudit(req.user!.id, "user.create", "User", user.id, { role: parsed.data.role });
    return reply.code(201).send({ id: user.id, email: user.email, role: user.role });
  });
}
