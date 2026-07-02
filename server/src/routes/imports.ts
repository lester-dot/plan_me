import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { disciplines, evidence, importBatches, importErrors, students } from "../db/schema.js";
import { requireAuth } from "../auth/plugin.js";
import { logAudit } from "../services/audit.js";
import { today } from "../util.js";

const importSchema = z.object({
  csv: z.string(),
  source: z.string().default("Электронный журнал (CSV)"),
});

// Спринт 1: пакетный импорт с проверкой дублей, журналом ошибок и откатом.
export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/imports", { preHandler: requireAuth(["ADMIN"]) }, async (req, reply) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Некорректные данные импорта" });
    const lines = parsed.data.csv.trim().split(/\n+/).slice(1).filter((r) => r.trim());
    if (!lines.length) return reply.code(400).send({ error: "Нет строк для импорта" });

    const [studentRows, disciplineRows, existing] = await Promise.all([
      db.select().from(students),
      db.select().from(disciplines),
      db.select({ studentId: evidence.studentId, disciplineId: evidence.disciplineId, title: evidence.title }).from(evidence),
    ]);

    const errorRows: { line: number; reason: string; dup: boolean }[] = [];
    const toCreate: { studentId: string; disciplineId: string; title: string; score: number }[] = [];
    let duplicates = 0;
    const seen = new Set(existing.map((e) => `${e.studentId}|${e.disciplineId}|${e.title.toLowerCase()}`));

    lines.forEach((row, idx) => {
      const line = idx + 2;
      const [email, code, score, ...titleParts] = row.split(",");
      const student = studentRows.find((s) => s.email.trim().toLowerCase() === (email || "").trim().toLowerCase());
      const discipline = disciplineRows.find((d) => d.code.toLowerCase() === (code || "").trim().toLowerCase());
      const value = Number(score);
      const title = titleParts.join(",").trim() || "Импортированная оценка";
      if (!student) return errorRows.push({ line, reason: `студент не найден: ${email || "—"}`, dup: false });
      if (!discipline) return errorRows.push({ line, reason: `дисциплина не найдена: ${code || "—"}`, dup: false });
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return errorRows.push({ line, reason: `некорректный балл: ${score || "—"}`, dup: false });
      }
      const key = `${student.id}|${discipline.id}|${title.toLowerCase()}`;
      if (seen.has(key)) {
        duplicates += 1;
        return errorRows.push({ line, reason: `дубль: ${student.name} · ${discipline.code} · ${title}`, dup: true });
      }
      seen.add(key);
      toCreate.push({ studentId: student.id, disciplineId: discipline.id, title, score: value });
    });

    const errors = errorRows.length - duplicates;
    const [batch] = await db
      .insert(importBatches)
      .values({
        date: today(),
        source: parsed.data.source,
        total: lines.length,
        added: toCreate.length,
        duplicates,
        errors,
        status: "applied",
        createdById: req.user!.id,
      })
      .returning();

    if (errorRows.length) {
      await db.insert(importErrors).values(errorRows.map((e) => ({ batchId: batch.id, line: e.line, reason: e.reason })));
    }
    if (toCreate.length) {
      await db.insert(evidence).values(
        toCreate.map((c) => ({
          studentId: c.studentId,
          disciplineId: c.disciplineId,
          title: c.title,
          type: "grade" as const,
          score: c.score,
          date: today(),
          status: "submitted" as const,
          source: parsed.data.source,
          batchId: batch.id,
        })),
      );
    }
    await logAudit(req.user!.id, "import.run", "ImportBatch", batch.id, { added: toCreate.length, duplicates, errors });
    return reply.code(201).send({ batchId: batch.id, added: toCreate.length, duplicates, errors });
  });

  app.post("/api/imports/:id/rollback", { preHandler: requireAuth(["ADMIN"]) }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, id)).limit(1);
    if (!batch) return reply.code(404).send({ error: "Пакет импорта не найден" });
    if (batch.status !== "applied") return reply.code(409).send({ error: "Пакет уже откачен" });
    const removed = await db.delete(evidence).where(eq(evidence.batchId, id)).returning({ id: evidence.id });
    await db.update(importBatches).set({ status: "rolled_back" }).where(eq(importBatches.id, id));
    await logAudit(req.user!.id, "import.rollback", "ImportBatch", id, { removed: removed.length });
    return reply.send({ ok: true, removed: removed.length });
  });
}
