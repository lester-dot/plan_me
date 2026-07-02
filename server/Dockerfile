# --- Сборка ---
FROM node:20-slim AS build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# --- Рантайм ---
FROM node:20-slim
WORKDIR /app/server
ENV NODE_ENV=production
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/drizzle ./drizzle
COPY --from=build /app/server/package.json ./package.json
# Веб-клиент (сервер отдаёт статику из ../web)
COPY web /app/web
EXPOSE 4000
# Применяем миграции, затем запускаем сервер
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/server.js"]
