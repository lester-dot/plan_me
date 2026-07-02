import type { EmployerRequest, Student } from "../db/schema.js";
import { competencyScores, hasExternalConfirmation, hasPracticalExperience, trustFor } from "./scoring.js";
import type { DomainData } from "./types.js";

export interface MatchResult {
  studentId: string;
  studentName: string;
  score: number;
  explanation: string;
}

export function employerRequestMatches(
  data: DomainData,
  students: Student[],
  request: EmployerRequest,
): MatchResult[] {
  return students
    .map((student) => {
      const scores = competencyScores(data, student.id);
      const required = request.required || [];
      const desired = request.desired || [];
      const requiredHit = required.length
        ? required.filter((id) => (scores[id] || 0) >= request.minLevel).length / required.length
        : 1;
      const desiredHit = desired.length
        ? desired.filter((id) => (scores[id] || 0) >= Math.max(20, request.minLevel - 10)).length / desired.length
        : 0;
      const trust = Math.min(
        1,
        data.evidence.filter((item) => item.studentId === student.id && trustFor(item) >= 0.7).length / 4,
      );
      const practical = hasPracticalExperience(data, student.id) ? 1 : 0;
      const external = hasExternalConfirmation(data, student.id) ? 1 : 0;
      const score = Math.round(
        (requiredHit * 0.5 + desiredHit * 0.2 + trust * 0.15 + practical * 0.1 + external * 0.05) * 100,
      );
      return {
        studentId: student.id,
        studentName: student.name,
        score,
        explanation: [
          `обязательные ${Math.round(requiredHit * 100)}%`,
          `желательные ${Math.round(desiredHit * 100)}%`,
          `доверие ${Math.round(trust * 100)}%`,
          practical ? "есть практика/проект" : "мало практики",
          external ? "есть внешнее подтверждение" : "нет внешнего подтверждения",
        ].join(" · "),
      };
    })
    .sort((a, b) => b.score - a.score);
}
