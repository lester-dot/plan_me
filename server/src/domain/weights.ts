import type { EvidenceStatus, EvidenceType } from "../types.js";

// Веса статусов верификации и типов достижений — источник истины на сервере.
export const STATUS_WEIGHTS: Record<EvidenceStatus, number> = {
  draft: 0.2,
  submitted: 0.35,
  needs_revision: 0.25,
  verified_by_teacher: 0.7,
  verified_by_department_head: 0.8,
  verified_by_methodologist: 0.75,
  verified_by_employer: 0.9,
  rejected: 0,
  archived: 0,
};

export const TYPE_WEIGHTS: Record<EvidenceType, number> = {
  grade: 0.75,
  lab: 0.9,
  project: 1.05,
  practice: 1.2,
  contest: 1.25,
  employer_review: 1.3,
};
