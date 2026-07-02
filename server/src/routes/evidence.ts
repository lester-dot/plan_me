import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { evidence, students } from "../db/schema.js";
import type { EvidenceStatus, Role } from "../types.js";
import { requireAuth } from "../auth/plugin.js";
import { logAudit } from "../services/audit.js";
import { today } from "../util.js";

const STAFF: Role[] = ["TEACHER", "HEAD", "METHODOLOGIST", "ADMIN"];

function statusForVerifier(role: Role): EvidenceStatus {
  if (role === "HEAD") return "verified_by_department_head";
  if (role === "METHODOLOGIST") return "verified_by_methodologist";
  return "verified_by_teacher";
}

const createSchema = z.object({
  studentId: z.string(),
  disciplineId: z.string(),
  title: z.string().min(1),
  type: z.enum(["grade", "lab", "project", "practice", "contest", "employer_review"]),
  score: z.number().int().min(0).max(100),
});

const verifySchema = z.object({
  status: z.enum(["verified_by_teacher", "verified_by_department_head", "verified_by_methodologist", "needs_revision", "rejected"]),
});

export async function evidenceRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/evidence", { preHandler: requireAuth() }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Проверьте поля достижения", details: parsed.error.flatten() });
    const body = parsed.data;
    const role = req.user!.role;
    if (role === "STUDENT" && body.studentId !== req.user!.studentId) {
      return reply.code(403).send({ error: "Можно добавлять достижения только в свой профиль" });
    }
    if (role === "EMPLOYER") return reply.code(403).send({ error: "Недостаточно прав" });
    const status: EvidenceStatus = role === "STUDENT" ? "submitted" : "verified_by_teacher";
    const [created] = await db
      .insert(evidence)
      .values({
        studentId: body.studentId,
        disciplineId: body.disciplineId,
        title: body.title.trim(),
        type: body.type,
        score: body.score,
        date: today(),
        status,
        verifierId: role === "STUDENT" ? null : req.user!.id,
        source: "ручной ввод",
      })
      .returning();
    await logAudit(req.user!.id, "evidence.create", "Evidence", created.id);
    return reply.code(201).send(created);
  });

  app.post("/api/evidence/:id/verify", { preHandler: requireAuth(STAFF) }, async (req, reply) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Некорректный статус" });
    const id = (req.params as { id: string }).id;
    const [item] = await db.select().from(evidence).where(eq(evidence.id, id)).limit(1);
    if (!item) return reply.code(404).send({ error: "Достижение не найдено" });
    let status = parsed.data.status as EvidenceStatus;
    if (status === "verified_by_teacher") status = statusForVerifier(req.user!.role);
    const [updated] = await db.update(evidence).set({ status, verifierId: req.user!.id }).where(eq(evidence.id, id)).returning();
    await logAudit(req.user!.id, "evidence.verify", "Evidence", id, { status });
    return reply.send(updated);
  });

  app.post("/api/students/:id/portfolio", { preHandler: requireAuth() }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const role = req.user!.role;
    if (role === "STUDENT" && id !== req.user!.studentId) {
      return reply.code(403).send({ error: "Можно менять только своё портфолио" });
    }
    if (role === "EMPLOYER") return reply.code(403).send({ error: "Недостаточно прав" });
    const [student] = await db.select().from(students).where(eq(students.id, id)).limit(1);
    if (!student) return reply.code(404).send({ error: "Студент не найден" });
    const opened = student.publicProfile || ["public", "partners"].includes(student.portfolioAccess);
    const [updated] = await db
      .update(students)
      .set({ publicProfile: !opened, portfolioAccess: opened ? "college" : "partners" })
      .where(eq(students.id, id))
      .returning();
    await logAudit(req.user!.id, "student.portfolio", "Student", id, { open: !opened });
    return reply.send(updated);
  });
}
