import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { aiDecisions, aiSuggestions, competencies, links, settings } from "../db/schema.js";
import type { Role } from "../types.js";
import { requireAuth } from "../auth/plugin.js";
import { logAudit } from "../services/audit.js";
import { aiSuggestCompetencies } from "../domain/ai.js";
import { today } from "../util.js";

const CONFIRM: Role[] = ["METHODOLOGIST", "HEAD", "TEACHER", "ADMIN"];

const analyzeSchema = z.object({ text: z.string().min(12), source: z.string().default("Другое"), disciplineId: z.string() });
const decisionSchema = z.object({ decision: z.enum(["accepted", "rejected"]), competencyId: z.string().optional() });
const portfolioSchema = z.object({ disciplineId: z.string(), competencyId: z.string() });

async function ensureLink(disciplineId: string, competencyId: string, weight: number, source: string) {
  const [exists] = await db
    .select()
    .from(links)
    .where(and(eq(links.disciplineId, disciplineId), eq(links.competencyId, competencyId)))
    .limit(1);
  if (!exists) await db.insert(links).values({ disciplineId, competencyId, weight, source });
}

async function recordDecision(payload: {
  suggestionId?: string;
  kind: string;
  competencyId?: string | null;
  disciplineId?: string | null;
  decision: string;
  byId: string;
  role: Role;
}) {
  await db.insert(aiDecisions).values({
    suggestionId: payload.suggestionId ?? null,
    kind: payload.kind,
    competencyId: payload.competencyId ?? null,
    disciplineId: payload.disciplineId ?? null,
    decision: payload.decision,
    byId: payload.byId,
    role: payload.role,
    at: today(),
  });
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  // Спринт 2: распознавание компетенций из текста (только предложения).
  app.post("/api/ai/analyze", { preHandler: requireAuth(CONFIRM) }, async (req, reply) => {
    const parsed = analyzeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Добавьте больше текста для анализа" });
    const comps = await db.select().from(competencies);
    const found = aiSuggestCompetencies(comps, parsed.data.text, 3);
    if (!found.length) return reply.send({ created: 0 });
    await db.insert(aiSuggestions).values(
      found.map((f) => ({
        kind: "link" as const,
        sourceType: parsed.data.source,
        sourceText: parsed.data.text.slice(0, 240),
        disciplineId: parsed.data.disciplineId,
        competencyId: f.competencyId,
        weight: 0.25,
        confidence: f.confidence,
        status: "proposed" as const,
        createdById: req.user!.id,
        createdAt: today(),
      })),
    );
    await logAudit(req.user!.id, "ai.analyze", "AiSuggestion", undefined, { created: found.length });
    return reply.code(201).send({ created: found.length });
  });

  // Подтверждение/отклонение предложения человеком (инвариант очереди).
  app.post("/api/ai/suggestions/:id/decision", { preHandler: requireAuth(CONFIRM) }, async (req, reply) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Некорректное решение" });
    const id = (req.params as { id: string }).id;
    const [s] = await db.select().from(aiSuggestions).where(eq(aiSuggestions.id, id)).limit(1);
    if (!s) return reply.code(404).send({ error: "Предложение не найдено" });
    if (s.status !== "proposed") return reply.code(409).send({ error: "Предложение уже обработано" });

    let competencyId = s.competencyId;
    let newStatus: "accepted" | "edited" | "rejected" = "rejected";
    if (parsed.data.decision === "accepted") {
      newStatus = "accepted";
      if (parsed.data.competencyId && parsed.data.competencyId !== s.competencyId) {
        competencyId = parsed.data.competencyId;
        newStatus = "edited";
      }
      if (s.kind === "link" && s.disciplineId && competencyId) {
        await ensureLink(s.disciplineId, competencyId, s.weight, "ai");
      }
    }
    await db
      .update(aiSuggestions)
      .set({ status: newStatus, competencyId, decidedById: req.user!.id, decidedAt: today() })
      .where(eq(aiSuggestions.id, id));
    await recordDecision({
      suggestionId: id,
      kind: s.kind,
      competencyId,
      disciplineId: s.disciplineId,
      decision: newStatus,
      byId: req.user!.id,
      role: req.user!.role,
    });
    await logAudit(req.user!.id, "ai.decide", "AiSuggestion", id, { decision: newStatus });
    return reply.send({ ok: true, status: newStatus });
  });

  // Спринт 3: подтверждение связи достижения с компетенцией (преподаватель).
  app.post("/api/ai/portfolio/confirm", { preHandler: requireAuth(CONFIRM) }, async (req, reply) => {
    const parsed = portfolioSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Некорректные данные" });
    await ensureLink(parsed.data.disciplineId, parsed.data.competencyId, 0.25, "ai-portfolio");
    await recordDecision({
      kind: "portfolio-link",
      competencyId: parsed.data.competencyId,
      disciplineId: parsed.data.disciplineId,
      decision: "accepted",
      byId: req.user!.id,
      role: req.user!.role,
    });
    await logAudit(req.user!.id, "ai.portfolio.confirm", "Link", `${parsed.data.disciplineId}:${parsed.data.competencyId}`);
    return reply.send({ ok: true });
  });

  // Спринт 6: маскирование ПДн (глобальная настройка, только администратор).
  app.post("/api/settings/ai", { preHandler: requireAuth(["ADMIN"]) }, async (req, reply) => {
    const maskPII = Boolean((req.body as { maskPII?: boolean })?.maskPII);
    await db
      .insert(settings)
      .values({ id: "global", maskPII })
      .onConflictDoUpdate({ target: settings.id, set: { maskPII } });
    await logAudit(req.user!.id, "settings.ai", "Setting", "global", { maskPII });
    return reply.send({ ok: true, maskPII });
  });
}
