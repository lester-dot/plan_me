import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import * as t from "../db/schema.js";
import type { Student } from "../db/schema.js";
import type { AuthUser } from "../auth/plugin.js";
import { maskPII } from "../domain/ai.js";
import { API_CONTRACTS } from "../domain/apiContracts.js";
import { STATUS_WEIGHTS, TYPE_WEIGHTS } from "../domain/weights.js";

export function canEmployerSeeStudent(student: Pick<Student, "publicProfile" | "portfolioAccess">): boolean {
  return student.publicProfile || ["public", "partners"].includes(student.portfolioAccess);
}

// Собирает снимок данных, отфильтрованный по роли пользователя.
// Именно здесь сервер решает, какие данные видит клиент (реальный контроль доступа).
export async function buildState(user: AuthUser) {
  const [
    collegeRow,
    groups,
    allStudents,
    disciplines,
    competencies,
    links,
    allEvidence,
    employers,
    employerRequests,
    invitations,
    employerReviews,
    reports,
    importBatches,
    importErrors,
    aiSuggestionsRaw,
    aiDecisions,
    recDone,
    settingRow,
  ] = await Promise.all([
    db.select().from(t.college).limit(1),
    db.select().from(t.groups),
    db.select().from(t.students),
    db.select().from(t.disciplines).orderBy(t.disciplines.code),
    db.select().from(t.competencies).orderBy(t.competencies.code),
    db.select().from(t.links),
    db.select().from(t.evidence),
    db.select().from(t.employers),
    db.select().from(t.employerRequests),
    db.select().from(t.invitations),
    db.select().from(t.employerReviews),
    db.select().from(t.reports),
    db.select().from(t.importBatches).orderBy(desc(t.importBatches.createdAt)),
    db.select().from(t.importErrors).orderBy(desc(t.importErrors.id)).limit(200),
    db.select().from(t.aiSuggestions).orderBy(desc(t.aiSuggestions.createdAt)),
    db.select().from(t.aiDecisions).orderBy(desc(t.aiDecisions.at)).limit(100),
    db.select().from(t.recommendationsDone),
    db.select().from(t.settings).where(eq(t.settings.id, "global")).limit(1),
  ]);

  const college = collegeRow[0];
  const maskEnabled = settingRow[0]?.maskPII ?? true;
  const isStaff = ["TEACHER", "HEAD", "METHODOLOGIST", "DIRECTOR", "ADMIN"].includes(user.role);

  let students: Student[];
  if (user.role === "STUDENT") {
    students = allStudents.filter((s) => s.id === user.studentId);
  } else if (user.role === "EMPLOYER") {
    students = allStudents.filter(canEmployerSeeStudent);
  } else {
    students = allStudents;
  }

  const visibleStudentIds = new Set(students.map((s) => s.id));
  const evidence = isStaff ? allEvidence : allEvidence.filter((e) => visibleStudentIds.has(e.studentId));

  const showRecognition = ["METHODOLOGIST", "HEAD", "ADMIN", "TEACHER"].includes(user.role);
  const aiSuggestions = (showRecognition ? aiSuggestionsRaw : []).map((s) => ({
    ...s,
    sourceText: maskPII(s.sourceText, maskEnabled),
  }));

  const specialty = {
    code: college?.specialtyCode ?? "",
    name: college?.specialtyName ?? "",
    duration: college?.duration ?? "",
    format: college?.format ?? "",
    pilotYear: college?.pilotYear ?? "",
  };

  return {
    data: {
      college: { name: college?.name ?? "", department: college?.department ?? "", specialty },
      statusWeights: STATUS_WEIGHTS,
      typeWeights: TYPE_WEIGHTS,
      groups,
      students,
      disciplines,
      competencies,
      links,
      evidence: evidence.map((e) => ({ ...e, verifier: e.verifierId ?? "" })),
      employers: user.role === "EMPLOYER" ? employers.filter((e) => e.id === user.employerId) : employers,
      employerRequests,
      invitations,
      employerReviews,
      reports,
      apiContracts: API_CONTRACTS,
      importBatches: user.role === "ADMIN" ? importBatches : [],
      importErrors: user.role === "ADMIN" ? importErrors : [],
      aiSuggestions,
      aiDecisions: showRecognition ? aiDecisions : [],
      recommendationsDone: recDone.map((r) => r.key),
      aiSettings: { maskPII: maskEnabled },
    },
  };
}
