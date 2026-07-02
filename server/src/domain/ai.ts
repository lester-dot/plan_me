import type { Competency } from "../db/schema.js";

// Эвристический движок «AI»: подсказки связей с ЗУНК по тексту.
// Инвариант платформы: результат — только предложение, применяет человек.
export function aiStems(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 4)
    .map((w) => w.slice(0, 6));
}

function competencyTerms(c: Competency): string {
  return [c.title, ...c.knowledge, ...c.skills, ...c.habits, ...c.indicators].join(" ");
}

export interface CompetencyMatch {
  competencyId: string;
  code: string;
  title: string;
  hits: number;
  confidence: number;
}

export function aiSuggestCompetencies(competencies: Competency[], text: string, topN = 3): CompetencyMatch[] {
  const input = new Set(aiStems(text));
  if (!input.size) return [];
  return competencies
    .map((competency) => {
      const terms = new Set(aiStems(competencyTerms(competency)));
      let hits = 0;
      input.forEach((s) => {
        if (terms.has(s)) hits += 1;
      });
      return {
        competencyId: competency.id,
        code: competency.code,
        title: competency.title,
        hits,
        confidence: Math.min(0.95, 0.4 + hits * 0.1),
      };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, topN);
}

export function maskPII(text: string, enabled: boolean): string {
  if (!enabled) return text;
  return (text || "")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "e-mail скрыт")
    .replace(/\+?\d[\d\s()-]{8,}\d/g, "телефон скрыт");
}
