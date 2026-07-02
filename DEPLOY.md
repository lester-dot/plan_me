# Развёртывание платформы

Пилот рассчитан на размещение в **российском облаке** (152-ФЗ): данные студентов
хранятся на серверах в РФ. Ниже — быстрый старт через Docker и вариант с
управляемым PostgreSQL.

## Архитектура

- **web/** — статический клиент (index.html, app.js, api.js, styles.css). Отдаётся сервером.
- **server/** — API на Node.js + TypeScript (Fastify), ORM Drizzle, PostgreSQL.
- Аутентификация: email + пароль, access/refresh JWT, роли проверяются на сервере.
- Аудит операций пишется в таблицу `audit_logs` (152-ФЗ).

## Вариант A. Один стек через docker-compose (быстрый пилот)

```bash
cp .env.example .env
# заполнить POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#   openssl rand -hex 48   # для каждого секрета
docker compose up -d --build          # поднимет postgres + api, применит миграции
docker compose run --rm api node dist/db/seed.js   # первичные данные и демо-аккаунты
```

Открыть `http://<хост>:4000/`. Демо-аккаунты (пароль из `SEED_PASSWORD`):
`admin@demo.ru`, `teacher@demo.ru`, `head@demo.ru`, `method@demo.ru`,
`director@demo.ru`, `employer@demo.ru`, `student@demo.ru`.

> После первого входа смените пароли и заведите реальные учётные записи
> (роль ADMIN → раздел «Справочники»; API `POST /api/auth/register`).

## Вариант B. Управляемый PostgreSQL в РФ-облаке (рекомендуется для прод)

1. Создайте кластер **Managed PostgreSQL** (Yandex Cloud / VK Cloud / Selectel),
   регион — Россия. Включите шифрование и резервное копирование.
2. Уберите сервис `db` из `docker-compose.yml`, задайте `DATABASE_URL` на
   управляемую БД (с `sslmode=require`).
3. Соберите и запустите только `api` (docker или systemd). Миграции применятся
   на старте контейнера; сид запустите один раз вручную.
4. Поставьте перед `api` reverse-proxy (nginx) с TLS-сертификатом домена колледжа.

## Локальная разработка

```bash
cd server
cp .env.example .env          # DATABASE_URL на локальный/облачный Postgres
npm install
npm run db:generate           # сгенерировать SQL-миграции из схемы (при изменении schema.ts)
npm run db:migrate            # применить миграции
npm run seed                  # демо-данные
npm run dev                   # сервер с автоперезапуском (по умолчанию :4000)
```

Клиент отдаётся тем же сервером при `SERVE_WEB=true`. Для отдельной раздачи
веба (nginx) выставьте `SERVE_WEB=false` и настройте проксирование `/api` на API.

## Чек-лист безопасности перед продом (152-ФЗ)

- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — длинные случайные значения, только в секрет-хранилище.
- [ ] Пароли демо-аккаунтов сменены, лишние отключены.
- [ ] БД размещена в РФ, включены шифрование при хранении и бэкапы.
- [ ] TLS на домене (reverse-proxy), HSTS.
- [ ] Ограничить сетевой доступ к БД только сервисом API.
- [ ] Настроить хранение и ротацию журналов `audit_logs`.
- [ ] Получены согласия на обработку персональных данных студентов.
- [ ] Отдельная правовая проработка при подключении внешнего AI/LLM (текущий
      AI-модуль работает локально на эвристиках и не отправляет ПДн наружу).

## API (основное)

| Метод | Путь | Роль |
|---|---|---|
| POST | `/api/auth/login` `/refresh` `/logout` `/me` | все / гость |
| GET  | `/api/state` | авторизованный (данные фильтруются по роли) |
| POST | `/api/evidence`, `/api/evidence/:id/verify` | студент / персонал |
| POST | `/api/imports`, `/api/imports/:id/rollback` | администратор |
| POST | `/api/ai/analyze`, `/api/ai/suggestions/:id/decision`, `/api/ai/portfolio/confirm` | методист/преподаватель |
| POST | `/api/recommendations/toggle` | студент / персонал |
| POST | `/api/employers/requests`, `/api/employers/:id/moderate`, `/api/invitations`, `/api/reviews/:id/verify` | работодатель / персонал |
| POST | `/api/settings/ai` | администратор |
