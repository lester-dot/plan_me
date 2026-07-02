import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { buildState } from "../services/state.js";

export async function stateRoutes(app: FastifyInstance): Promise<void> {
  // Роль-скоупированный снимок всех данных для клиента.
  app.get("/api/state", { preHandler: requireAuth() }, async (req, reply) => {
    const state = await buildState(req.user!);
    return reply.send({
      user: {
        id: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
        studentId: req.user!.studentId,
        employerId: req.user!.employerId,
      },
      ...state,
    });
  });
}
