// Описание контрактов приёма данных (Спринт 1). Статические метаданные.
export const API_CONTRACTS = [
  {
    id: "api-grades",
    method: "POST",
    path: "/api/v1/import/grades",
    title: "Импорт оценок из электронного журнала",
    fields: "student_email, discipline_code, score, title, date",
    idempotency: "по (student_email, discipline_code, title, date)",
    note: "Ставит достижения типа «оценка» на верификацию преподавателя.",
  },
  {
    id: "api-students",
    method: "POST",
    path: "/api/v1/import/students",
    title: "Синхронизация студентов и групп",
    fields: "email, name, group_code, specialty_code",
    idempotency: "по email",
    note: "Дубли по email не создаются, только обновление профиля.",
  },
  {
    id: "api-reviews",
    method: "POST",
    path: "/api/v1/import/reviews",
    title: "Импорт отзывов работодателей",
    fields: "employer_id, student_email, competency_codes, score, text",
    idempotency: "по (employer_id, student_email, date)",
    note: "Отзыв попадает на внешнюю верификацию, а не в профиль напрямую.",
  },
];
