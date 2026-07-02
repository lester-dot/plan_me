import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { recommendationsDone } from "../db/schema.js";
import { requireAuth } from "../auth/plugin.js";
import { logAudit } from "../services/audit.js";

const toggleSchema = z.object({ studentId: z.string(), key: z.string().min(1) });

// Спринт 4: отметка рекомендации выполненной (персистентно).
export async function developmentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/recommendations/toggle", { preHandler: requireAuth() }, async (req, reply) => {
    const parsed = toggleSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Некорректные данные" });
    const { studentId, key } = parsed.data;
    const role = req.user!.role;
    if (role === "STUDENT" && studentId !== req.user!.studentId) {
      return reply.code(403).send({ error: "Можно отмечать только свои рекомендации" });
    }
    if (role === "EMPLOYER") return reply.code(403).send({ error: "Недостаточно прав" });
    const [existing] = await db
      .select()
      .from(recommendationsDone)
      .where(and(eq(recommendationsDone.studentId, studentId), eq(recommendationsDone.key, key)))
      .limit(1);
    if (existing) {
      await db.delete(recommendationsDone).where(eq(recommendationsDone.id, existing.id));
      await logAudit(req.user!.id, "recommendation.undo", "Recommendation", key);
      return reply.send({ ok: true, done: false });
    }
    await db.insert(recommendationsDone).values({ studentId, key });
    await logAudit(req.user!.id, "recommendation.done", "Recommendation", key);
    return reply.send({ ok: true, done: true });
  });
}
