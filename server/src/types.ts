// Доменные перечисления (строковые union-типы, совпадают со значениями в БД).
export type Role =
  | "STUDENT"
  | "TEACHER"
  | "HEAD"
  | "METHODOLOGIST"
  | "DIRECTOR"
  | "EMPLOYER"
  | "ADMIN";

export type DisciplineType = "course" | "module" | "practice";

export type EvidenceType = "grade" | "lab" | "project" | "practice" | "contest" | "employer_review";

export type EvidenceStatus =
  | "draft"
  | "submitted"
  | "verified_by_teacher"
  | "verified_by_department_head"
  | "verified_by_methodologist"
  | "verified_by_employer"
  | "needs_revision"
  | "rejected"
  | "archived";

export type PortfolioAccess = "public" | "partners" | "college" | "request";
export type EmployerStatus = "moderated" | "pending";
export type RequestStatus = "active" | "draft";
export type AiKind = "link" | "portfolio_link";
export type AiStatus = "proposed" | "accepted" | "edited" | "rejected";

export const STAFF_ROLES: Role[] = ["TEACHER", "HEAD", "METHODOLOGIST", "ADMIN"];
