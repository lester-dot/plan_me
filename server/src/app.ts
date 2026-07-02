import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { config, isProd } from "./config.js";
import { registerAuthHook } from "./auth/plugin.js";
import { authRoutes } from "./routes/auth.js";
import { stateRoutes } from "./routes/state.js";
import { evidenceRoutes } from "./routes/evidence.js";
import { importRoutes } from "./routes/imports.js";
import { aiRoutes } from "./routes/ai.js";
import { developmentRoutes } from "./routes/development.js";
import { employerRoutes } from "./routes/employers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../../web");

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isProd ? true : { transport: { target: "pino-pretty" } },
    trustProxy: true,
    bodyLimit: 1_000_000,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.WEB_ORIGIN === "*" ? true : config.WEB_ORIGIN.split(","), credentials: true });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  registerAuthHook(app);

  app.get("/api/health", async () => ({ ok: true, ts: Date.now() }));

  await app.register(authRoutes);
  await app.register(stateRoutes);
  await app.register(evidenceRoutes);
  await app.register(importRoutes);
  await app.register(aiRoutes);
  await app.register(developmentRoutes);
  await app.register(employerRoutes);

  if (config.SERVE_WEB) {
    await app.register(fastifyStatic, { root: webRoot, prefix: "/" });
    // SPA-фолбэк: любые не-API маршруты отдают index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "Не найдено" });
      return reply.sendFile("index.html");
    });
  }

  app.setErrorHandler((error, req, reply) => {
    req.log.error(error);
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    reply.code(status >= 400 && status < 600 ? status : 500).send({
      error: status === 500 ? "Внутренняя ошибка сервера" : error.message,
    });
  });

  return app;
}
