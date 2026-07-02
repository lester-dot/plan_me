import type { Evidence } from "../db/schema.js";
import { STATUS_WEIGHTS, TYPE_WEIGHTS } from "./weights.js";
import type { DomainData } from "./types.js";

export function trustFor(evidence: Evidence): number {
  return STATUS_WEIGHTS[evidence.status] ?? 0;
}

export function typeFactorFor(evidence: Evidence): number {
  return TYPE_WEIGHTS[evidence.type] ?? 1;
}

export function evidenceImpact(evidence: Evidence): number {
  return evidence.score * trustFor(evidence) * typeFactorFor(evidence);
}

// Расчёт уровня по каждой компетенции для одного студента (0..100).
export function competencyScores(data: DomainData, studentId: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const competency of data.competencies) {
    const linkedEvidence = data.evidence.filter((evidence) => {
      if (evidence.studentId !== studentId) return false;
      return data.links.some(
        (link) => link.disciplineId === evidence.disciplineId && link.competencyId === competency.id,
      );
    });
    if (!linkedEvidence.length) {
      result[competency.id] = 0;
      continue;
    }
    const total = linkedEvidence.reduce((sum, evidence) => {
      const link = data.links.find(
        (item) => item.disciplineId === evidence.disciplineId && item.competencyId === competency.id,
      );
      return sum + evidenceImpact(evidence) * (link?.weight || 0.2);
    }, 0);
    const divisor = linkedEvidence.reduce((sum, evidence) => {
      const link = data.links.find(
        (item) => item.disciplineId === evidence.disciplineId && item.competencyId === competency.id,
      );
      return sum + 100 * typeFactorFor(evidence) * (link?.weight || 0.2);
    }, 0);
    result[competency.id] = Math.min(100, Math.round((total / Math.max(divisor, 1)) * 100));
  }
  return result;
}

export function readiness(data: DomainData, studentId: string): number {
  const scores = Object.values(competencyScores(data, studentId));
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1));
}

export function hasPracticalExperience(data: DomainData, studentId: string): boolean {
  return data.evidence.some(
    (item) => item.studentId === studentId && ["practice", "project", "contest", "employer_review"].includes(item.type),
  );
}

export function hasExternalConfirmation(data: DomainData, studentId: string): boolean {
  return data.evidence.some(
    (item) =>
      item.studentId === studentId &&
      ["verified_by_employer", "verified_by_department_head", "verified_by_methodologist"].includes(item.status),
  );
}
