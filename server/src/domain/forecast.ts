import {
  competencyScores,
  hasExternalConfirmation,
  hasPracticalExperience,
  readiness,
  trustFor,
} from "./scoring.js";
import type { DomainData } from "./types.js";

export interface Factor {
  label: string;
  delta: string;
  positive: boolean;
}

export interface ReadinessModel {
  score: number;
  factors: Factor[];
  risks: string[];
}

export function practiceReadiness(data: DomainData, studentId: string): ReadinessModel {
  const scores = competencyScores(data, studentId);
  const prof = data.competencies.filter((c) => c.cluster === "профессиональные");
  const profAvg = Math.round(prof.reduce((s, c) => s + (scores[c.id] || 0), 0) / Math.max(prof.length, 1));
  const practice = data.evidence.some((e) => e.studentId === studentId && e.type === "practice");
  const labs = data.evidence.some((e) => e.studentId === studentId && ["lab", "project"].includes(e.type));
  const confirmations = data.evidence.filter((e) => e.studentId === studentId && trustFor(e) >= 0.7).length;
  const score = Math.max(
    0,
    Math.min(100, Math.round(profAvg * 0.6 + (practice ? 18 : 0) + (labs ? 8 : 0) + Math.min(14, confirmations * 4))),
  );
  const factors: Factor[] = [
    { label: "Проф. компетенции", delta: `${profAvg}%`, positive: profAvg >= 50 },
    { label: "Учебная практика", delta: practice ? "есть" : "нет", positive: practice },
    { label: "Практ./проекты", delta: labs ? "есть" : "нет", positive: labs },
    { label: "Подтверждения", delta: `${confirmations}`, positive: confirmations >= 2 },
  ];
  const risks: string[] = [];
  if (!practice) risks.push("нет учебной практики");
  if (profAvg < 45) risks.push("низкий уровень проф. компетенций");
  if (confirmations < 2) risks.push("мало подтверждённых достижений");
  return { score, factors, risks };
}

export function employmentReadiness(data: DomainData, studentId: string): ReadinessModel {
  const base = readiness(data, studentId);
  const practical = hasPracticalExperience(data, studentId) ? 1 : 0;
  const external = hasExternalConfirmation(data, studentId) ? 1 : 0;
  const contest = data.evidence.some((e) => e.studentId === studentId && e.type === "contest") ? 1 : 0;
  const review = data.evidence.some((e) => e.studentId === studentId && e.type === "employer_review") ? 1 : 0;
  const score = Math.max(
    0,
    Math.min(100, Math.round(base * 0.55 + practical * 15 + external * 12 + contest * 10 + review * 8)),
  );
  const factors: Factor[] = [
    { label: "Общая готовность", delta: `${base}%`, positive: base >= 50 },
    { label: "Практический опыт", delta: practical ? "есть" : "нет", positive: !!practical },
    { label: "Внешнее подтверждение", delta: external ? "есть" : "нет", positive: !!external },
    { label: "Конкурсы", delta: contest ? "есть" : "нет", positive: !!contest },
    { label: "Отзыв работодателя", delta: review ? "есть" : "нет", positive: !!review },
  ];
  const risks: string[] = [];
  if (!practical) risks.push("нет практики/проектов");
  if (!external) risks.push("нет внешней верификации");
  if (base < 50) risks.push("низкая общая готовность");
  return { score, factors, risks };
}
