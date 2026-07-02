CREATE TYPE "public"."ai_kind" AS ENUM('link', 'portfolio_link');--> statement-breakpoint
CREATE TYPE "public"."ai_status" AS ENUM('proposed', 'accepted', 'edited', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."discipline_type" AS ENUM('course', 'module', 'practice');--> statement-breakpoint
CREATE TYPE "public"."employer_status" AS ENUM('moderated', 'pending');--> statement-breakpoint
CREATE TYPE "public"."evidence_status" AS ENUM('draft', 'submitted', 'verified_by_teacher', 'verified_by_department_head', 'verified_by_methodologist', 'verified_by_employer', 'needs_revision', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('grade', 'lab', 'project', 'practice', 'contest', 'employer_review');--> statement-breakpoint
CREATE TYPE "public"."portfolio_access" AS ENUM('public', 'partners', 'college', 'request');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('active', 'draft');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('STUDENT', 'TEACHER', 'HEAD', 'METHODOLOGIST', 'DIRECTOR', 'EMPLOYER', 'ADMIN');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"suggestion_id" text,
	"kind" text NOT NULL,
	"competency_id" text,
	"discipline_id" text,
	"decision" text NOT NULL,
	"by_id" text NOT NULL,
	"role" "role" NOT NULL,
	"at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "ai_kind" DEFAULT 'link' NOT NULL,
	"source_type" text NOT NULL,
	"source_text" text NOT NULL,
	"discipline_id" text,
	"competency_id" text,
	"weight" double precision DEFAULT 0.25 NOT NULL,
	"confidence" double precision NOT NULL,
	"status" "ai_status" DEFAULT 'proposed' NOT NULL,
	"created_by_id" text,
	"decided_by_id" text,
	"created_at" text NOT NULL,
	"decided_at" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"meta" jsonb,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "college" (
	"id" text PRIMARY KEY DEFAULT 'college' NOT NULL,
	"name" text NOT NULL,
	"department" text NOT NULL,
	"specialty_code" text NOT NULL,
	"specialty_name" text NOT NULL,
	"duration" text NOT NULL,
	"format" text NOT NULL,
	"pilot_year" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competencies" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"cluster" text NOT NULL,
	"knowledge" text[] DEFAULT '{}' NOT NULL,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"habits" text[] DEFAULT '{}' NOT NULL,
	"indicators" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "competencies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "disciplines" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"cycle" text NOT NULL,
	"hours" integer NOT NULL,
	"semester" integer NOT NULL,
	"type" "discipline_type" NOT NULL,
	CONSTRAINT "disciplines_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employer_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"employer_id" text NOT NULL,
	"title" text NOT NULL,
	"specialty_code" text NOT NULL,
	"course" integer NOT NULL,
	"required" text[] DEFAULT '{}' NOT NULL,
	"desired" text[] DEFAULT '{}' NOT NULL,
	"min_level" integer NOT NULL,
	"format" text NOT NULL,
	"status" "request_status" DEFAULT 'active' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employer_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"employer_id" text NOT NULL,
	"student_id" text NOT NULL,
	"discipline_id" text NOT NULL,
	"competency_ids" text[] DEFAULT '{}' NOT NULL,
	"score" integer NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"date" text NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact" text NOT NULL,
	"status" "employer_status" DEFAULT 'pending' NOT NULL,
	"industry" text NOT NULL,
	"access" text DEFAULT 'request_only' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"discipline_id" text NOT NULL,
	"title" text NOT NULL,
	"type" "evidence_type" NOT NULL,
	"score" integer NOT NULL,
	"date" text NOT NULL,
	"status" "evidence_status" DEFAULT 'submitted' NOT NULL,
	"verifier_id" text,
	"source" text DEFAULT 'ручной ввод' NOT NULL,
	"batch_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"year" integer NOT NULL,
	"specialty_code" text NOT NULL,
	"curator" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"source" text NOT NULL,
	"total" integer NOT NULL,
	"added" integer NOT NULL,
	"duplicates" integer NOT NULL,
	"errors" integer NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_errors" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"line" integer NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"employer_id" text NOT NULL,
	"student_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"date" text NOT NULL,
	"note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "links" (
	"id" text PRIMARY KEY NOT NULL,
	"discipline_id" text NOT NULL,
	"competency_id" text NOT NULL,
	"weight" double precision DEFAULT 0.25 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recommendations_done" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"scope" text NOT NULL,
	"owner" text NOT NULL,
	"format" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"mask_pii" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "students" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"group_id" text NOT NULL,
	"public_profile" boolean DEFAULT false NOT NULL,
	"portfolio_access" "portfolio_access" DEFAULT 'college' NOT NULL,
	"employment_status" text DEFAULT 'формирует портфолио' NOT NULL,
	CONSTRAINT "students_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"student_id" text,
	"employer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
