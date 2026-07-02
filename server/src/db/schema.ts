import { randomUUID } from "node:crypto";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());

export const roleEnum = pgEnum("role", [
  "STUDENT",
  "TEACHER",
  "HEAD",
  "METHODOLOGIST",
  "DIRECTOR",
  "EMPLOYER",
  "ADMIN",
]);
export const disciplineTypeEnum = pgEnum("discipline_type", ["course", "module", "practice"]);
export const evidenceTypeEnum = pgEnum("evidence_type", ["grade", "lab", "project", "practice", "contest", "employer_review"]);
export const evidenceStatusEnum = pgEnum("evidence_status", [
  "draft",
  "submitted",
  "verified_by_teacher",
  "verified_by_department_head",
  "verified_by_methodologist",
  "verified_by_employer",
  "needs_revision",
  "rejected",
  "archived",
]);
export const portfolioAccessEnum = pgEnum("portfolio_access", ["public", "partners", "college", "request"]);
export const employerStatusEnum = pgEnum("employer_status", ["moderated", "pending"]);
export const requestStatusEnum = pgEnum("request_status", ["active", "draft"]);
export const aiKindEnum = pgEnum("ai_kind", ["link", "portfolio_link"]);
export const aiStatusEnum = pgEnum("ai_status", ["proposed", "accepted", "edited", "rejected"]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  studentId: text("student_id"),
  employerId: text("employer_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: id(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  userId: text("user_id"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  meta: jsonb("meta"),
  at: timestamp("at").notNull().defaultNow(),
});

export const college = pgTable("college", {
  id: text("id").primaryKey().default("college"),
  name: text("name").notNull(),
  department: text("department").notNull(),
  specialtyCode: text("specialty_code").notNull(),
  specialtyName: text("specialty_name").notNull(),
  duration: text("duration").notNull(),
  format: text("format").notNull(),
  pilotYear: text("pilot_year").notNull(),
});

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  year: integer("year").notNull(),
  specialtyCode: text("specialty_code").notNull(),
  curator: text("curator").notNull(),
});

export const students = pgTable("students", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  groupId: text("group_id").notNull(),
  publicProfile: boolean("public_profile").notNull().default(false),
  portfolioAccess: portfolioAccessEnum("portfolio_access").notNull().default("college"),
  employmentStatus: text("employment_status").notNull().default("формирует портфолио"),
});

export const disciplines = pgTable("disciplines", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  cycle: text("cycle").notNull(),
  hours: integer("hours").notNull(),
  semester: integer("semester").notNull(),
  type: disciplineTypeEnum("type").notNull(),
});

export const competencies = pgTable("competencies", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  cluster: text("cluster").notNull(),
  knowledge: text("knowledge").array().notNull().default([]),
  skills: text("skills").array().notNull().default([]),
  habits: text("habits").array().notNull().default([]),
  indicators: text("indicators").array().notNull().default([]),
});

export const links = pgTable("links", {
  id: id(),
  disciplineId: text("discipline_id").notNull(),
  competencyId: text("competency_id").notNull(),
  weight: doublePrecision("weight").notNull().default(0.25),
  source: text("source").notNull().default("manual"),
});

export const evidence = pgTable("evidence", {
  id: id(),
  studentId: text("student_id").notNull(),
  disciplineId: text("discipline_id").notNull(),
  title: text("title").notNull(),
  type: evidenceTypeEnum("type").notNull(),
  score: integer("score").notNull(),
  date: text("date").notNull(),
  status: evidenceStatusEnum("status").notNull().default("submitted"),
  verifierId: text("verifier_id"),
  source: text("source").notNull().default("ручной ввод"),
  batchId: text("batch_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const employers = pgTable("employers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact").notNull(),
  status: employerStatusEnum("status").notNull().default("pending"),
  industry: text("industry").notNull(),
  access: text("access").notNull().default("request_only"),
});

export const employerRequests = pgTable("employer_requests", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  employerId: text("employer_id").notNull(),
  title: text("title").notNull(),
  specialtyCode: text("specialty_code").notNull(),
  course: integer("course").notNull(),
  required: text("required").array().notNull().default([]),
  desired: text("desired").array().notNull().default([]),
  minLevel: integer("min_level").notNull(),
  format: text("format").notNull(),
  status: requestStatusEnum("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
});

export const invitations = pgTable("invitations", {
  id: id(),
  requestId: text("request_id").notNull(),
  employerId: text("employer_id").notNull(),
  studentId: text("student_id").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("sent"),
  date: text("date").notNull(),
  note: text("note").notNull(),
});

export const employerReviews = pgTable("employer_reviews", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  employerId: text("employer_id").notNull(),
  studentId: text("student_id").notNull(),
  disciplineId: text("discipline_id").notNull(),
  competencyIds: text("competency_ids").array().notNull().default([]),
  score: integer("score").notNull(),
  status: text("status").notNull().default("submitted"),
  date: text("date").notNull(),
  text: text("text").notNull(),
});

export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  scope: text("scope").notNull(),
  owner: text("owner").notNull(),
  format: text("format").notNull(),
  status: text("status").notNull(),
});

export const importBatches = pgTable("import_batches", {
  id: id(),
  date: text("date").notNull(),
  source: text("source").notNull(),
  total: integer("total").notNull(),
  added: integer("added").notNull(),
  duplicates: integer("duplicates").notNull(),
  errors: integer("errors").notNull(),
  status: text("status").notNull().default("applied"),
  createdById: text("created_by_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const importErrors = pgTable("import_errors", {
  id: id(),
  batchId: text("batch_id").notNull(),
  line: integer("line").notNull(),
  reason: text("reason").notNull(),
});

export const aiSuggestions = pgTable("ai_suggestions", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  kind: aiKindEnum("kind").notNull().default("link"),
  sourceType: text("source_type").notNull(),
  sourceText: text("source_text").notNull(),
  disciplineId: text("discipline_id"),
  competencyId: text("competency_id"),
  weight: doublePrecision("weight").notNull().default(0.25),
  confidence: doublePrecision("confidence").notNull(),
  status: aiStatusEnum("status").notNull().default("proposed"),
  createdById: text("created_by_id"),
  decidedById: text("decided_by_id"),
  createdAt: text("created_at").notNull(),
  decidedAt: text("decided_at"),
});

export const aiDecisions = pgTable("ai_decisions", {
  id: id(),
  suggestionId: text("suggestion_id"),
  kind: text("kind").notNull(),
  competencyId: text("competency_id"),
  disciplineId: text("discipline_id"),
  decision: text("decision").notNull(),
  byId: text("by_id").notNull(),
  role: roleEnum("role").notNull(),
  at: text("at").notNull(),
});

export const recommendationsDone = pgTable("recommendations_done", {
  id: id(),
  studentId: text("student_id").notNull(),
  key: text("key").notNull(),
});

export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("global"),
  maskPII: boolean("mask_pii").notNull().default(true),
});

export type Student = typeof students.$inferSelect;
export type Discipline = typeof disciplines.$inferSelect;
export type Competency = typeof competencies.$inferSelect;
export type Link = typeof links.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type EmployerRequest = typeof employerRequests.$inferSelect;
