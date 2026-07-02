import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { college, competencies, employerRequests, employerReviews, employers, evidence, invitations } from "../db/schema.js";
import type { Role } from "../types.js";
import { requireAuth } from "../auth/plugin.js";
import { logAudit } from "../services/audit.js";
import { today } from "../util.js";

const STAFF: Role[] = ["TEACHER", "HEAD", "METHODOLOGIST", "ADMIN"];

const requestSchema = z.object({
  title: z.string().min(1),
  course: z.number().int().min(1).max(4).default(1),
  minLevel: z.number().int().min(0).max(100).default(35),
  format: z.string().default("практика"),
  required: z.array(z.string()).min(1),
  desired: z.array(z.string()).default([]),
  employerId: z.string().optional(),
});

const inviteSchema = z.object({ requestId: z.string(), studentId: z.string() });

export async function employerRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/employers/requests", { preHandler: requireAuth(["EMPLOYER", "ADMIN"]) }, async (req, reply) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Проверьте поля запроса", details: parsed.error.flatten() });
    const body = parsed.data;
    const employerId = req.user!.role === "EMPLOYER" ? req.user!.employerId : body.employerId;
    if (!employerId) return reply.code(400).send({ error: "Не указан работодатель" });

    const comps = await db.select({ id: competencies.id }).from(competencies);
    const known = new Set(comps.map((c) => c.id));
    const unknown = [...body.required, ...body.desired].filter((id) => !known.has(id));
    if (unknown.length) return reply.code(400).send({ error: `Неизвестные компетенции: ${unknown.join(", ")}` });

    const [collegeRow] = await db.select().from(college).limit(1);
    const [request] = await db
      .insert(employerRequests)
      .values({
        employerId,
        title: body.title.trim(),
        specialtyCode: collegeRow?.specialtyCode ?? "",
        course: body.course,
        required: body.required,
        desired: body.desired,
        minLevel: body.minLevel,
        format: body.format,
        status: "active",
        createdAt: today(),
      })
      .returning();
    await logAudit(req.user!.id, "request.create", "EmployerRequest", request.id);
    return reply.code(201).send(request);
  });

  app.post("/api/employers/:id/moderate", { preHandler: requireAuth(["ADMIN"]) }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const [employer] = await db.select().from(employers).where(eq(employers.id, id)).limit(1);
    if (!employer) return reply.code(404).send({ error: "Работодатель не найден" });
    const status = employer.status === "moderated" ? "pending" : "moderated";
    const [updated] = await db.update(employers).set({ status }).where(eq(employers.id, id)).returning();
    await logAudit(req.user!.id, "employer.moderate", "Employer", id, { status });
    return reply.send(updated);
  });

  app.post("/api/invitations", { preHandler: requireAuth(["EMPLOYER", ...STAFF]) }, async (req, reply) => {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Некорректные данные приглашения" });
    const [request] = await db.select().from(employerRequests).where(eq(employerRequests.id, parsed.data.requestId)).limit(1);
    if (!request) return reply.code(404).send({ error: "Запрос не найден" });
    if (req.user!.role === "EMPLOYER" && request.employerId !== req.user!.employerId) {
      return reply.code(403).send({ error: "Чужой запрос" });
    }
    const [invitation] = await db
      .insert(invitations)
      .values({
        requestId: request.id,
        employerId: request.employerId,
        studentId: parsed.data.studentId,
        type: request.format.includes("стаж") ? "internship" : "practice",
        status: "sent",
        date: today(),
        note: `Приглашение по запросу «${request.title}»`,
      })
      .returning();
    await logAudit(req.user!.id, "invitation.create", "Invitation", invitation.id);
    return reply.code(201).send(invitation);
  });

  app.post("/api/reviews/:id/verify", { preHandler: requireAuth(STAFF) }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const [review] = await db.select().from(employerReviews).where(eq(employerReviews.id, id)).limit(1);
    if (!review) return reply.code(404).send({ error: "Отзыв не найден" });
    const [employer] = await db.select().from(employers).where(eq(employers.id, review.employerId)).limit(1);
    await db.transaction(async (tx) => {
      await tx.update(employerReviews).set({ status: "verified_by_employer" }).where(eq(employerReviews.id, id));
      await tx.insert(evidence).values({
        studentId: review.studentId,
        disciplineId: review.disciplineId,
        title: `Отзыв работодателя: ${employer?.name ?? ""}`,
        type: "employer_review",
        score: review.score,
        date: review.date,
        status: "verified_by_employer",
        verifierId: req.user!.id,
        source: "отзыв работодателя",
      });
    });
    await logAudit(req.user!.id, "review.verify", "EmployerReview", id);
    return reply.send({ ok: true });
  });

  app.post("/api/reviews/:id/revision", { preHandler: requireAuth(STAFF) }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const [review] = await db.select().from(employerReviews).where(eq(employerReviews.id, id)).limit(1);
    if (!review) return reply.code(404).send({ error: "Отзыв не найден" });
    await db.update(employerReviews).set({ status: "needs_revision" }).where(eq(employerReviews.id, id));
    await logAudit(req.user!.id, "review.revision", "EmployerReview", id);
    return reply.send({ ok: true });
  });
}
