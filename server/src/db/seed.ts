import bcrypt from "bcryptjs";
import { config } from "../config.js";
import { db, closeDb } from "./client.js";
import * as t from "./schema.js";

const groups = [{ id: "td-26", code: "ТД-26", name: "ТД-26", year: 1, specialtyCode: "38.02.08", curator: "Иванова Мария Сергеевна" }];

const students = [
  { id: "s1", name: "Анна Соколова", groupId: "td-26", email: "student@demo.ru", publicProfile: true, portfolioAccess: "public", employmentStatus: "готова к практике" },
  { id: "s2", name: "Максим Громов", groupId: "td-26", email: "gromov@demo.ru", publicProfile: false, portfolioAccess: "college", employmentStatus: "нужна доработка" },
  { id: "s3", name: "Дарья Лебедева", groupId: "td-26", email: "lebedeva@demo.ru", publicProfile: true, portfolioAccess: "partners", employmentStatus: "готова к практике" },
  { id: "s4", name: "Илья Морозов", groupId: "td-26", email: "morozov@demo.ru", publicProfile: false, portfolioAccess: "request", employmentStatus: "формирует портфолио" },
  { id: "s5", name: "Полина Кузнецова", groupId: "td-26", email: "kuznetsova@demo.ru", publicProfile: true, portfolioAccess: "public", employmentStatus: "готова к стажировке" },
  { id: "s6", name: "Егор Орлов", groupId: "td-26", email: "orlov@demo.ru", publicProfile: false, portfolioAccess: "college", employmentStatus: "нужна доработка" },
  { id: "s7", name: "Ксения Федорова", groupId: "td-26", email: "fedorova@demo.ru", publicProfile: true, portfolioAccess: "partners", employmentStatus: "готова к практике" },
  { id: "s8", name: "Никита Волков", groupId: "td-26", email: "volkov@demo.ru", publicProfile: false, portfolioAccess: "request", employmentStatus: "формирует портфолио" },
  { id: "s9", name: "Алина Павлова", groupId: "td-26", email: "pavlova@demo.ru", publicProfile: true, portfolioAccess: "public", employmentStatus: "готова к стажировке" },
  { id: "s10", name: "Роман Новиков", groupId: "td-26", email: "novikov@demo.ru", publicProfile: false, portfolioAccess: "college", employmentStatus: "нужна доработка" },
] as const;

const disciplines = [
  { id: "oup15", code: "ОУП.15", name: "Введение в специальность", cycle: "общеобразовательный", hours: 72, semester: 1, type: "course" },
  { id: "oup13", code: "ОУП.13", name: "Информатика", cycle: "общеобразовательный", hours: 108, semester: 1, type: "course" },
  { id: "op01", code: "ОП.01", name: "Экономика и основы анализа финансово-хозяйственной деятельности торговой организации", cycle: "общепрофессиональный", hours: 128, semester: 2, type: "course" },
  { id: "op02", code: "ОП.02", name: "Прикладные компьютерные программы в профессиональной деятельности", cycle: "общепрофессиональный", hours: 96, semester: 2, type: "course" },
  { id: "op03", code: "ОП.03", name: "Эксплуатация торгово-технологического оборудования и охрана труда", cycle: "общепрофессиональный", hours: 96, semester: 3, type: "course" },
  { id: "op04", code: "ОП.04", name: "Автоматизация торгово-технологических процессов", cycle: "общепрофессиональный", hours: 108, semester: 3, type: "course" },
  { id: "op05", code: "ОП.05", name: "Основы предпринимательства", cycle: "общепрофессиональный", hours: 72, semester: 3, type: "course" },
  { id: "op06", code: "ОП.06", name: "Правовое обеспечение профессиональной деятельности", cycle: "общепрофессиональный", hours: 72, semester: 4, type: "course" },
  { id: "op07", code: "ОП.07", name: "Финансы, налоги и налогообложение", cycle: "общепрофессиональный", hours: 72, semester: 4, type: "course" },
  { id: "pm01", code: "ПМ.01", name: "Организация и осуществление торговой деятельности", cycle: "профессиональный модуль", hours: 288, semester: 4, type: "module" },
  { id: "pm02", code: "ПМ.02", name: "Организация и осуществление предпринимательской деятельности в сфере торговли", cycle: "профессиональный модуль", hours: 216, semester: 5, type: "module" },
  { id: "pm03", code: "ПМ.03", name: "Организация и осуществление интернет-маркетинга", cycle: "профессиональный модуль", hours: 216, semester: 5, type: "module" },
  { id: "up01", code: "УП.01.01", name: "Учебная практика по торговой деятельности", cycle: "практика", hours: 72, semester: 4, type: "practice" },
  { id: "up02", code: "УП.02.01", name: "Учебная практика по предпринимательству", cycle: "практика", hours: 72, semester: 5, type: "practice" },
  { id: "up03", code: "УП.03.01", name: "Учебная практика по интернет-маркетингу", cycle: "практика", hours: 72, semester: 5, type: "practice" },
  { id: "pp01", code: "ПП.01.01", name: "Производственная практика по торговой деятельности", cycle: "практика", hours: 108, semester: 6, type: "practice" },
  { id: "pp02", code: "ПП.02.01", name: "Производственная практика по предпринимательству", cycle: "практика", hours: 108, semester: 6, type: "practice" },
  { id: "pp03", code: "ПП.03.01", name: "Производственная практика по интернет-маркетингу", cycle: "практика", hours: 108, semester: 6, type: "practice" },
] as const;

// ЗУНК приведены по ФГОС СПО 38.02.08 «Торговое дело» (приказ Минпросвещения
// России от 19.07.2023 № 548): ОК 01–09 и профессиональные модули
// ПМ.01 (ПК 1.1–1.6), ПМ.02 (ПК 2.1–2.8), ПМ.03 (ПК 3.1–3.6).
const competencies = [
  { id: "ok01", code: "ОК.01", title: "Выбирать способы решения задач профессиональной деятельности применительно к различным контекстам", cluster: "универсальные", knowledge: ["актуальный профессиональный и социальный контекст", "основные источники информации и ресурсы для решения задач", "методы и алгоритмы принятия решений"], skills: ["распознавать задачу в профессиональном контексте", "определять этапы решения задачи и выбирать способ", "оценивать результат и последствия своих действий"], habits: ["составлять план действий", "выбирать оптимальный способ решения", "контролировать качество результата"], indicators: ["формулирует задачу", "обосновывает выбранный способ", "оценивает результат"] },
  { id: "ok02", code: "ОК.02", title: "Использовать современные средства поиска, анализа информации и цифровые технологии", cluster: "универсальные", knowledge: ["номенклатура информационных источников и приёмы структурирования информации", "критерии достоверности информации", "современные информационные технологии и программные продукты в торговле"], skills: ["определять задачи поиска и оценивать достоверность информации", "структурировать и обрабатывать данные", "применять цифровые средства и учётные системы"], habits: ["соблюдать цифровую гигиену и информационную безопасность", "хранить подтверждающие материалы", "оформлять цифровой результат"], indicators: ["использует ПО в задаче", "обрабатывает данные", "прикрепляет цифровой результат"] },
  { id: "ok03", code: "ОК.03", title: "Планировать профессиональное и личностное развитие, использовать финансовую грамотность", cluster: "универсальные", knowledge: ["содержание и траектории профессионального развития", "основы предпринимательства и финансовой грамотности", "критерии профессиональной готовности"], skills: ["определять цели профессионального и личностного развития", "выстраивать план саморазвития", "применять финансовую грамотность в жизненных ситуациях"], habits: ["обновлять портфолио", "сравнивать текущий уровень с целевым", "использовать обратную связь"], indicators: ["видит дефициты", "обновляет план", "использует обратную связь"] },
  { id: "pk01", code: "ПК.01", title: "Организовывать и осуществлять торговую деятельность (ПМ.01)", cluster: "профессиональные", knowledge: ["этапы торгово-технологического процесса", "правила установления хозяйственных связей с поставщиками", "порядок оформления и проверки коммерческих документов"], skills: ["собирать и анализировать информацию о потребностях рынка и покупателей", "устанавливать хозяйственные связи и оформлять договоры", "организовывать торгово-технологический процесс и обслуживание покупателей"], habits: ["контролировать исполнение обязательств по договорам", "соблюдать стандарты сервиса и регламенты", "работать с возражениями покупателей"], indicators: ["устанавливает хозяйственные связи", "оформляет продажу", "контролирует качество обслуживания"] },
  { id: "pk02", code: "ПК.02", title: "Вести учёт, документооборот и анализ деятельности торговой организации", cluster: "профессиональные", knowledge: ["виды первичных и коммерческих документов", "показатели финансово-хозяйственной деятельности организации", "основы учёта и налогообложения в торговле"], skills: ["оформлять и проверять торговую документацию", "анализировать продажи, остатки и товарооборот", "использовать учётные программы (1С и др.)"], habits: ["проверять полноту и достоверность данных", "соблюдать сроки документооборота", "контролировать исполнение обязательств"], indicators: ["готовит документы", "объясняет показатели", "находит отклонения"] },
  { id: "pk03", code: "ПК.03", title: "Организовывать и осуществлять предпринимательскую деятельность в сфере торговли (ПМ.02)", cluster: "профессиональные", knowledge: ["методы маркетинговых исследований и мониторинга цен", "структура бизнес-плана и финансовой модели", "показатели эффективности предпринимательской деятельности"], skills: ["проводить маркетинговые исследования и анализ конкурентов", "разрабатывать бизнес-план и финансовую модель", "рассчитывать показатели эффективности проекта"], habits: ["выявлять бизнес-проблемы и определять пути решения", "предлагать мероприятия по повышению эффективности", "проверять спрос и оценивать риски"], indicators: ["описывает бизнес-модель", "считает выручку и расходы", "защищает проект"] },
  { id: "pk04", code: "ПК.04", title: "Организовывать и осуществлять интернет-маркетинг и цифровые каналы продаж (ПМ.03)", cluster: "профессиональные", knowledge: ["критерии готовности веб-сайта к продвижению", "каналы и инструменты интернет-маркетинга (SEO, контекст, SMM)", "метрики и воронка продаж"], skills: ["анализировать интернет-пространство и поведение аудитории", "разрабатывать стратегию контекстной рекламы и вести кампании в соцсетях", "составлять технические задания на продвижение"], habits: ["тестировать гипотезы", "проводить аналитику эффективности продвижения", "улучшать коммуникацию с аудиторией"], indicators: ["настраивает цифровой канал", "ведёт рекламную кампанию", "оценивает метрики"] },
] as const;

const links = [
  ["oup15", "ok01", 0.45], ["oup15", "ok03", 0.35], ["oup13", "ok02", 0.55], ["op01", "pk02", 0.55], ["op01", "pk03", 0.25],
  ["op02", "ok02", 0.45], ["op02", "pk02", 0.35], ["op03", "pk01", 0.55], ["op04", "ok02", 0.35], ["op04", "pk04", 0.45],
  ["op05", "pk03", 0.55], ["op06", "pk02", 0.3], ["op06", "pk03", 0.25], ["op07", "pk02", 0.4], ["op07", "pk03", 0.35],
  ["pm01", "pk01", 0.8], ["pm01", "pk02", 0.4], ["pm02", "pk03", 0.85], ["pm03", "pk04", 0.85], ["up01", "pk01", 0.9],
  ["up02", "pk03", 0.85], ["up03", "pk04", 0.85], ["pp01", "pk01", 1], ["pp02", "pk03", 1], ["pp03", "pk04", 1],
] as const;

const evidence = [
  { id: "e1", studentId: "s1", disciplineId: "oup15", title: "Диагностика входа в специальность", type: "grade", score: 86, date: "2026-09-16", status: "verified_by_teacher", source: "оценка" },
  { id: "e2", studentId: "s1", disciplineId: "op01", title: "Расчет показателей торговой организации", type: "lab", score: 91, date: "2026-11-04", status: "verified_by_teacher", source: "практическая работа" },
  { id: "e3", studentId: "s1", disciplineId: "op02", title: "Таблица учета продаж и остатков", type: "project", score: 88, date: "2026-11-18", status: "verified_by_methodologist", source: "файл" },
  { id: "e4", studentId: "s1", disciplineId: "pm01", title: "Сценарий обслуживания покупателя", type: "practice", score: 93, date: "2027-02-10", status: "submitted", source: "демонстрация" },
  { id: "e5", studentId: "s1", disciplineId: "pm02", title: "Мини-бизнес торговой точки", type: "project", score: 82, date: "2027-03-12", status: "needs_revision", source: "проект" },
  { id: "e6", studentId: "s1", disciplineId: "pm03", title: "Контент-план интернет-продаж", type: "contest", score: 96, date: "2027-04-05", status: "verified_by_department_head", source: "конкурс" },
  { id: "e7", studentId: "s2", disciplineId: "op01", title: "Анализ выручки", type: "lab", score: 73, date: "2026-11-04", status: "verified_by_teacher", source: "практическая работа" },
  { id: "e8", studentId: "s3", disciplineId: "pm01", title: "Оформление продажи", type: "practice", score: 89, date: "2027-02-10", status: "submitted", source: "практика" },
  { id: "e9", studentId: "s4", disciplineId: "op05", title: "Бизнес-гипотеза", type: "project", score: 78, date: "2027-03-02", status: "verified_by_teacher", source: "проект" },
  { id: "e10", studentId: "s5", disciplineId: "pm03", title: "Маркетинговая кампания", type: "contest", score: 94, date: "2027-04-05", status: "verified_by_department_head", source: "конкурс" },
] as const;

const employers = [
  { id: "emp1", name: "Торговая сеть «Партнер Маркет»", contact: "hr@partner-market.demo", status: "moderated", industry: "розничная торговля", access: "college_and_partners" },
  { id: "emp2", name: "Маркетплейс «Север Онлайн»", contact: "talent@sever.demo", status: "pending", industry: "e-commerce", access: "request_only" },
] as const;

const employerRequests = [
  { id: "req1", employerId: "emp1", title: "Практиканты в торговый зал", specialtyCode: "38.02.08", course: 1, required: ["pk01", "ok02"], desired: ["pk02"], minLevel: 35, format: "производственная практика", status: "active", createdAt: "2026-12-10" },
  { id: "req2", employerId: "emp1", title: "Стажировка junior интернет-маркетолога", specialtyCode: "38.02.08", course: 1, required: ["pk04", "ok02"], desired: ["ok03", "pk03"], minLevel: 30, format: "стажировка", status: "draft", createdAt: "2027-01-18" },
] as const;

const invitations = [
  { id: "inv1", requestId: "req1", employerId: "emp1", studentId: "s1", type: "practice", status: "sent", date: "2027-02-18", note: "Приглашение на собеседование перед практикой" },
  { id: "inv2", requestId: "req2", employerId: "emp1", studentId: "s5", type: "internship", status: "accepted", date: "2027-03-02", note: "Тестовое задание по контент-плану" },
] as const;

const employerReviews = [
  { id: "rev1", employerId: "emp1", studentId: "s1", disciplineId: "pp01", competencyIds: ["pk01", "ok02"], score: 92, status: "submitted", date: "2027-03-12", text: "Уверенно работает с покупателем, быстро осваивает учетные инструменты." },
] as const;

const reports = [
  { id: "r1", title: "Отчет по группе ТД-26", scope: "group", owner: "head", format: "PDF", status: "ready" },
  { id: "r2", title: "Методическое покрытие компетенций", scope: "methodology", owner: "methodologist", format: "Excel", status: "ready" },
  { id: "r3", title: "Запросы работодателей и дефициты", scope: "employers", owner: "director", format: "PDF", status: "draft" },
] as const;

const aiSuggestions = [
  { id: "ai1", kind: "link", sourceType: "Рабочая программа", sourceText: "ОП.05 Основы предпринимательства: студент планирует шаги развития бизнес-идеи, ставит цели, сравнивает текущий уровень с целевым и обновляет план.", disciplineId: "op05", competencyId: "ok03", weight: 0.3, confidence: 0.74, status: "proposed", createdById: null, createdAt: "2027-04-20", decidedById: null, decidedAt: null },
  { id: "ai2", kind: "link", sourceType: "Положение о конкурсе", sourceText: "Конкурс «Цифровая витрина»: участники создают контент, планируют рекламную кампанию, настраивают цифровой канал продаж и оценивают метрики воронки.", disciplineId: "op02", competencyId: "pk04", weight: 0.25, confidence: 0.81, status: "proposed", createdById: null, createdAt: "2027-04-21", decidedById: null, decidedAt: null },
] as const;

async function main() {
  const passwordHash = await bcrypt.hash(config.SEED_PASSWORD, 12);

  // Полная очистка (dev seed).
  await Promise.all([
    db.delete(t.auditLogs), db.delete(t.refreshTokens), db.delete(t.recommendationsDone),
    db.delete(t.aiDecisions), db.delete(t.aiSuggestions), db.delete(t.importErrors),
    db.delete(t.invitations), db.delete(t.employerReviews), db.delete(t.employerRequests),
    db.delete(t.evidence), db.delete(t.importBatches), db.delete(t.links),
    db.delete(t.users), db.delete(t.students), db.delete(t.employers),
    db.delete(t.disciplines), db.delete(t.competencies), db.delete(t.groups),
    db.delete(t.reports), db.delete(t.college), db.delete(t.settings),
  ]);

  await db.insert(t.college).values({
    id: "college",
    name: "Колледж: пилот компетентностной платформы",
    department: "Кафедра экономики, сервиса и торговли",
    specialtyCode: "38.02.08",
    specialtyName: "Торговое дело",
    duration: "2 года 10 месяцев",
    format: "очная форма обучения",
    pilotYear: "2026",
  });
  await db.insert(t.settings).values({ id: "global", maskPII: true });
  await db.insert(t.groups).values(groups.map((g) => ({ ...g })));
  await db.insert(t.disciplines).values(disciplines.map((d) => ({ ...d })));
  await db.insert(t.competencies).values(competencies.map((c) => ({ ...c, knowledge: [...c.knowledge], skills: [...c.skills], habits: [...c.habits], indicators: [...c.indicators] })));
  await db.insert(t.students).values(students.map((s) => ({ ...s })));
  await db.insert(t.links).values(links.map(([disciplineId, competencyId, weight]) => ({ disciplineId, competencyId, weight, source: "manual" })));
  await db.insert(t.evidence).values(evidence.map((e) => ({ ...e, verifierId: null })));
  await db.insert(t.employers).values(employers.map((e) => ({ ...e })));
  await db.insert(t.employerRequests).values(employerRequests.map((r) => ({ ...r, required: [...r.required], desired: [...r.desired] })));
  await db.insert(t.invitations).values(invitations.map((i) => ({ ...i })));
  await db.insert(t.employerReviews).values(employerReviews.map((r) => ({ ...r, competencyIds: [...r.competencyIds] })));
  await db.insert(t.reports).values(reports.map((r) => ({ ...r })));
  await db.insert(t.aiSuggestions).values(aiSuggestions.map((s) => ({ ...s })));

  const accounts = [
    { email: "student@demo.ru", name: "Анна Соколова", role: "STUDENT", studentId: "s1", employerId: null },
    { email: "teacher@demo.ru", name: "Иванова Мария Сергеевна", role: "TEACHER", studentId: null, employerId: null },
    { email: "head@demo.ru", name: "Заведующий кафедрой", role: "HEAD", studentId: null, employerId: null },
    { email: "method@demo.ru", name: "Методист", role: "METHODOLOGIST", studentId: null, employerId: null },
    { email: "director@demo.ru", name: "Директор колледжа", role: "DIRECTOR", studentId: null, employerId: null },
    { email: "employer@demo.ru", name: "Партнер Маркет (HR)", role: "EMPLOYER", studentId: null, employerId: "emp1" },
    { email: "admin@demo.ru", name: "Администратор", role: "ADMIN", studentId: null, employerId: null },
  ] as const;
  await db.insert(t.users).values(accounts.map((a) => ({ email: a.email, passwordHash, name: a.name, role: a.role, studentId: a.studentId, employerId: a.employerId })));

  // eslint-disable-next-line no-console
  console.log(`Сид завершён. Демо-пароль для всех аккаунтов: ${config.SEED_PASSWORD}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
