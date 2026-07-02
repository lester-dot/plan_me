import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().default("http://localhost:4000"),
  SERVE_WEB: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  SEED_PASSWORD: z.string().default("Demo!2026"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Некорректная конфигурация окружения:", parsed.error.flatten().fieldErrors);
  throw new Error("Проверьте .env (см. .env.example)");
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === "production";
