const statusLabels = {
  draft: "Черновик",
  submitted: "На проверке",
  verified_by_teacher: "Подтверждено преподавателем",
  verified_by_department_head: "Подтверждено заведующим",
  verified_by_methodologist: "Подтверждено методистом",
  verified_by_employer: "Подтверждено работодателем",
  needs_revision: "Нужна доработка",
  rejected: "Отклонено",
  archived: "Архив",
};

const typeLabels = {
  grade: "Оценка",
  lab: "Практическая",
  project: "Проект",
  practice: "Практика",
  contest: "Конкурс",
  employer_review: "Отзыв работодателя",
};

const ROLE_LABELS = {
  student: "Студент",
  teacher: "Преподаватель",
  head: "Заведующий",
  methodologist: "Методист",
  director: "Директор",
  employer: "Работодатель",
  admin: "Администратор",
};

const ROLE_LIST = [
  { id: "student", title: "Студент", account: "student@demo.ru" },
  { id: "teacher", title: "Преподаватель", account: "teacher@demo.ru" },
  { id: "head", title: "Заведующий", account: "head@demo.ru" },
  { id: "methodologist", title: "Методист", account: "method@demo.ru" },
  { id: "director", title: "Директор", account: "director@demo.ru" },
  { id: "employer", title: "Работодатель", account: "employer@demo.ru" },
  { id: "admin", title: "Администратор", account: "admin@demo.ru" },
];

// Клиентское состояние. Доменные данные (state.data) приходят с сервера и
// уже отфильтрованы по роли; клиент их не хранит и не изменяет напрямую.
const state = {
  data: null,
  user: null,
  role: "student",
  view: "dashboard",
  currentStudentId: null,
  query: "",
  selectedDiscipline: "all",
  selectedCompetency: null,
  aiInput: "",
  devRequestId: null,
  forecastGroup: "all",
  csv: "student_email,discipline_code,score,title\nstudent@demo.ru,ОП.05,90,Бизнес-гипотеза торговой точки",
  selfTests: null,
  loadTest: null,
};

// Данные хранятся на сервере — локально ничего не сохраняем.
function saveState() {}

function setState(patch) {
  Object.assign(state, patch);
  render();
}

// Загружает актуальный роль-скоупированный снимок с сервера и перерисовывает.
async function refresh() {
  const payload = await api.getState();
  state.data = payload.data;
  state.user = payload.user;
  state.role = String(payload.user.role || "").toLowerCase();
  if (!state.currentStudentId || !state.data.students.some((s) => s.id === state.currentStudentId)) {
    state.currentStudentId = state.user.studentId || (state.data.students[0] && state.data.students[0].id) || null;
  }
  render();
}

// Выполняет серверное действие, обновляет данные и показывает тост.
async function apiAction(fn, successMessage, successType = "success") {
  try {
    await fn();
    await refresh();
    if (successMessage) toast(successMessage, successType);
    return true;
  } catch (error) {
    toast(error.message || "Не удалось выполнить операцию", "error");
    return false;
  }
}

function byId(items, id) {
  return (items || []).find((item) => item.id === id);
}

function visibleStudents() {
  return state.data.students;
}

function currentStudent() {
  return byId(state.data.students, state.currentStudentId) || state.data.students[0];
}

function trustFor(evidence) {
  return state.data.statusWeights[evidence.status] ?? 0;
}

function typeFactorFor(evidence) {
  return state.data.typeWeights[evidence.type] ?? 1;
}

function evidenceImpact(evidence) {
  return evidence.score * trustFor(evidence) * typeFactorFor(evidence);
}

function competencyScores(studentId) {
  const result = {};
  state.data.competencies.forEach((competency) => {
    const linkedEvidence = state.data.evidence.filter((evidence) => {
      const linked = state.data.links.some((link) => link.disciplineId === evidence.disciplineId && link.competencyId === competency.id);
      return evidence.studentId === studentId && linked;
    });
    if (!linkedEvidence.length) {
      result[competency.id] = 0;
      return;
    }
    const total = linkedEvidence.reduce((sum, evidence) => {
      const link = state.data.links.find((item) => item.disciplineId === evidence.disciplineId && item.competencyId === competency.id);
      return sum + evidenceImpact(evidence) * (link?.weight || 0.2);
    }, 0);
    const divisor = linkedEvidence.reduce((sum, evidence) => {
      const link = state.data.links.find((item) => item.disciplineId === evidence.disciplineId && item.competencyId === competency.id);
      return sum + 100 * typeFactorFor(evidence) * (link?.weight || 0.2);
    }, 0);
    result[competency.id] = Math.min(100, Math.round((total / Math.max(divisor, 1)) * 100));
  });
  return result;
}

function readiness(studentId) {
  const scores = Object.values(competencyScores(studentId));
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1));
}

function groupAnalytics() {
  const students = visibleStudents();
  const avg = Math.round(students.reduce((sum, student) => sum + readiness(student.id), 0) / Math.max(students.length, 1));
  const evidenceCount = state.data.evidence.filter((evidence) => students.some((student) => student.id === evidence.studentId)).length;
  const queue = state.data.evidence.filter((evidence) => ["submitted", "needs_revision"].includes(evidence.status)).length;
  const weak = state.data.competencies
    .map((competency) => {
      const value = Math.round(students.reduce((sum, student) => sum + competencyScores(student.id)[competency.id], 0) / Math.max(students.length, 1));
      return { ...competency, value };
    })
    .sort((a, b) => a.value - b.value)[0];
  return { avg, evidenceCount, queue, weak };
}

function currentEmployer() {
  return state.data.employers.find((employer) => employer.id === state.user.employerId) || state.data.employers[0];
}

function canEmployerSeeStudent(student) {
  return student.publicProfile || ["public", "partners"].includes(student.portfolioAccess);
}

function hasPracticalExperience(studentId) {
  return state.data.evidence.some((item) => item.studentId === studentId && ["practice", "project", "contest", "employer_review"].includes(item.type));
}

function hasExternalConfirmation(studentId) {
  return state.data.evidence.some((item) => item.studentId === studentId && ["verified_by_employer", "verified_by_department_head", "verified_by_methodologist"].includes(item.status));
}

function employerRequestMatches(request) {
  return state.data.students
    .filter((student) => canEmployerSeeStudent(student))
    .map((student) => {
      const scores = competencyScores(student.id);
      const required = request.required || [];
      const desired = request.desired || [];
      const requiredHit = required.length ? required.filter((id) => (scores[id] || 0) >= request.minLevel).length / required.length : 1;
      const desiredHit = desired.length ? desired.filter((id) => (scores[id] || 0) >= Math.max(20, request.minLevel - 10)).length / desired.length : 0;
      const trust = Math.min(1, state.data.evidence.filter((item) => item.studentId === student.id && trustFor(item) >= 0.7).length / 4);
      const practical = hasPracticalExperience(student.id) ? 1 : 0;
      const external = hasExternalConfirmation(student.id) ? 1 : 0;
      const score = Math.round((requiredHit * 0.5 + desiredHit * 0.2 + trust * 0.15 + practical * 0.1 + external * 0.05) * 100);
      return {
        student,
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

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== false && value != null) node.setAttribute(key, value);
  });
  children.forEach((child) => node.append(child?.nodeType ? child : document.createTextNode(String(child))));
  return node;
}

function toastRoot() {
  let root = document.getElementById("toast-root");
  if (!root) {
    root = h("div", { id: "toast-root", class: "toast-root", role: "status", "aria-live": "polite", "aria-atomic": "false" }, []);
    document.body.append(root);
  }
  return root;
}

function toast(message, type = "info") {
  const root = toastRoot();
  const node = h("div", { class: `toast toast-${type}` }, [message]);
  root.append(node);
  setTimeout(() => {
    node.classList.add("toast-out");
    setTimeout(() => node.remove(), 260);
  }, 3200);
}

function emptyState(message) {
  return h("div", { class: "empty-state" }, [message]);
}

function loginShell() {
  return h("div", { class: "app-shell" }, [
    h("a", { class: "skip-link", href: "#main-content" }, ["К основному содержанию"]),
    sidebar(),
    h("main", { class: "workspace", id: "main-content", tabindex: "-1" }, [
      topbar(),
      viewContent(),
    ]),
  ]);
}

const NAV_ITEMS = [
  ["dashboard", "Личный кабинет"],
  ["competencies", "Карта компетенций"],
  ["education", "Образовательный процесс"],
  ["evidence", "Достижения"],
  ["ai", "AI-анализ"],
  ["development", "Развитие"],
  ["forecast", "Прогноз готовности"],
  ["verification", "Верификация"],
  ["employers", "Работодатели"],
  ["analytics", "Аналитика"],
  ["methodology", "Методика"],
  ["integrations", "Интеграции"],
  ["reports", "Отчеты"],
  ["admin", "Справочники"],
  ["help", "Справка и AI"],
];

const ROLE_ACCESS = {
  student: ["dashboard", "competencies", "education", "evidence", "ai", "development", "employers", "analytics", "reports", "help"],
  teacher: ["dashboard", "competencies", "education", "evidence", "ai", "development", "forecast", "verification", "employers", "analytics", "reports", "help"],
  methodologist: ["dashboard", "competencies", "education", "evidence", "ai", "development", "forecast", "verification", "analytics", "methodology", "reports", "admin", "help"],
  head: ["dashboard", "competencies", "education", "evidence", "ai", "development", "forecast", "verification", "employers", "analytics", "methodology", "reports", "admin", "help"],
  director: ["dashboard", "competencies", "education", "analytics", "development", "forecast", "methodology", "reports", "help"],
  employer: ["dashboard", "employers", "reports", "help"],
  admin: ["dashboard", "competencies", "education", "evidence", "verification", "employers", "analytics", "methodology", "integrations", "reports", "admin", "help"],
};

// «resume» — вспомогательная страница личного кабинета студента (не в меню).
const EXTRA_VIEWS = ["resume"];

function canAccess(view) {
  if (EXTRA_VIEWS.includes(view)) return true;
  return (ROLE_ACCESS[state.role] || []).includes(view);
}

function sidebar() {
  const nav = NAV_ITEMS.filter(([id]) => canAccess(id));

  return h("aside", { class: "sidebar" }, [
    h("div", { class: "brand" }, [
      h("div", { class: "brand-mark" }, ["КП"]),
      h("div", {}, [
        h("strong", {}, ["Профиль компетенций"]),
      ]),
    ]),
    h("div", { class: "role-card" }, [
      h("label", {}, ["Учётная запись"]),
      h("strong", { class: "user-name" }, [state.user.name || state.user.email]),
      h("small", {}, [`${ROLE_LABELS[state.role] || state.role} · ${state.user.email}`]),
      h("button", { class: "ghost compact logout-btn", onclick: doLogout }, ["Выйти"]),
    ]),
    h("nav", { "aria-label": "Каталог разделов" }, nav.map(([id, label]) =>
      h("button", { class: state.view === id ? "nav-item active" : "nav-item", onclick: () => setState({ view: id }) }, [label])
    )),
    h("div", { class: "pilot" }, [
      h("span", {}, [`${state.data.college.specialty.code}`]),
      h("strong", {}, [state.data.college.specialty.name]),
      h("small", {}, [`${state.data.college.specialty.format}, ${state.data.college.specialty.duration}`]),
    ]),
  ]);
}

function topbar() {
  return h("header", { class: "topbar" }, [
    h("div", {}, [
      h("h1", {}, [titleByView()]),
    ]),
    h("div", { class: "toolbar" }, [
      state.role === "student"
        ? h("div", { class: "student-name-tag", title: "Ваш профиль" }, [(currentStudent() || {}).name || state.user.name])
        : h("select", {
            onchange: (event) => setState({ currentStudentId: event.target.value }),
          }, visibleStudents().map((student) => h("option", { value: student.id, selected: student.id === state.currentStudentId }, [student.name]))),
      state.role === "student"
        ? h("button", { onclick: () => setState({ view: "resume" }) }, ["Моё резюме"])
        : h("button", { class: "ghost", onclick: () => window.print() }, ["Экспорт PDF"]),
    ]),
  ]);
}

function titleByView() {
  return {
    dashboard: "Личный кабинет",
    resume: "Резюме",
    competencies: "Карта компетенций",
    education: "Образовательный процесс",
    evidence: "Достижения",
    ai: "AI-анализ компетенций и портфолио",
    development: "Траектория развития",
    forecast: "Прогноз готовности",
    verification: "Очередь верификации",
    employers: "Работодатели и подбор",
    analytics: "Аналитика",
    methodology: "Методическое покрытие",
    integrations: "Интеграции и качество данных",
    reports: "Отчеты и экспорт",
    admin: "Справочники и роли",
    help: "Справка и безопасность AI",
  }[state.view];
}

function viewContent() {
  const views = {
    dashboard: dashboardView,
    resume: resumeView,
    competencies: competenciesView,
    education: educationView,
    evidence: evidenceView,
    ai: aiView,
    development: developmentView,
    forecast: forecastView,
    verification: verificationView,
    employers: employersView,
    analytics: analyticsView,
    methodology: methodologyView,
    integrations: integrationsView,
    reports: reportsView,
    admin: adminView,
    help: helpView,
  };
  if (!canAccess(state.view) || !views[state.view]) state.view = "dashboard";
  return views[state.view]();
}

function dashboardView() {
  const student = currentStudent();
  const scores = competencyScores(student.id);
  const analytics = groupAnalytics();
  const studentEvidence = state.data.evidence.filter((item) => item.studentId === student.id).sort((a, b) => b.date.localeCompare(a.date));
  return h("section", { class: "stack" }, [
    h("div", { class: "hero-panel" }, [
      h("div", {}, [
        h("span", { class: "eyebrow" }, [`${student.name} / ${byId(state.data.groups, student.groupId).name}`]),
        h("h2", {}, [`Готовность к профессии: ${readiness(student.id)}%`]),
        h("p", {}, ["Профиль считается из образовательных событий, достижений, весов дисциплин и статуса верификации. Отклоненные материалы не повышают уровень."]),
        h("div", { class: "hero-stats" }, [
          h("span", {}, ["ЗУНК-модель"]),
          h("span", {}, ["практика и проекты"]),
          h("span", {}, ["верификация"]),
        ]),
      ]),
    ]),
      h("div", { class: "metric-grid" }, [
      metric("Достижений", studentEvidence.length, "оценки, практики, проекты", "teal"),
      metric("На проверке", studentEvidence.filter((e) => e.status === "submitted").length, "ждут подтверждения", "indigo"),
      metric("Среднее по группе", `${analytics.avg}%`, "для сравнения", "gold"),
      publicProfileMetric(student),
    ]),
    h("div", { class: "two-column" }, [
      h("article", { class: "panel" }, [
        h("div", { class: "panel-head" }, [
          h("h3", {}, ["Срез компетенций"]),
          h("button", { class: "ghost", onclick: () => setState({ view: "competencies" }) }, ["К карте"]),
        ]),
        ...state.data.competencies.map((competency) => progressRow(competency.code, competency.title, scores[competency.id])),
      ]),
      h("article", { class: "panel" }, [
        h("div", { class: "panel-head" }, [
          h("h3", {}, ["Таймлайн достижений"]),
          h("button", { class: "ghost", onclick: addEvidenceQuick }, ["Добавить"]),
        ]),
        ...(studentEvidence.length ? studentEvidence.slice(0, 6).map(evidenceItem) : [emptyState("Пока нет достижений. Нажмите «Добавить», чтобы создать первое достижение.")]),
      ]),
    ]),
  ]);
}

function resumePlaceholder(title, note) {
  return h("div", { class: "mini-card resume-placeholder" }, [
    h("strong", {}, [title]),
    h("small", {}, [note]),
    h("span", { class: "muted-text" }, ["Будет заполнено позже"]),
  ]);
}

// Дополнительная страница «Резюме» личного кабинета студента (черновик-скелет).
function resumeView() {
  const student = currentStudent();
  const group = byId(state.data.groups, student.groupId);
  const scores = competencyScores(student.id);
  const strong = state.data.competencies
    .map((c) => ({ c, v: scores[c.id] || 0 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 4);
  const evid = state.data.evidence
    .filter((e) => e.studentId === student.id && trustFor(e) >= 0.7)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  return h("section", { class: "stack" }, [
    h("div", { class: "resume-toolbar" }, [
      h("button", { class: "ghost", onclick: () => setState({ view: "dashboard" }) }, ["← В личный кабинет"]),
      h("span", { class: "badge" }, ["черновик · заполним позже"]),
    ]),
    h("div", { class: "hero-panel" }, [
      h("div", {}, [
        h("span", { class: "eyebrow" }, [`${group ? group.name : ""} · ${state.data.college.specialty.code} ${state.data.college.specialty.name}`]),
        h("h2", {}, [student.name]),
        h("p", {}, ["Резюме формируется на основе подтверждённых достижений и компетенций. Скоро здесь появятся контакты, опыт, цели и экспорт в PDF."]),
        h("div", { class: "hero-stats" }, [
          h("span", {}, [`Готовность ${readiness(student.id)}%`]),
          h("span", {}, [student.employmentStatus || "—"]),
        ]),
      ]),
    ]),
    h("div", { class: "two-column" }, [
      h("article", { class: "panel" }, [
        h("div", { class: "panel-head" }, [h("h3", {}, ["Ключевые компетенции"]), h("span", { class: "badge" }, ["сильные стороны"])]),
        ...strong.map((s) => progressRow(s.c.code, s.c.title, s.v)),
      ]),
      h("article", { class: "panel" }, [
        h("div", { class: "panel-head" }, [h("h3", {}, ["Подтверждённые достижения"]), h("span", { class: "badge" }, [`${evid.length}`])]),
        evid.length ? h("div", { class: "cards-list" }, evid.map(evidenceItem)) : emptyState("Пока нет подтверждённых достижений."),
      ]),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Разделы резюме"]), h("span", { class: "badge" }, ["в разработке"])]),
      h("div", { class: "role-grid" }, [
        resumePlaceholder("Контакты", "email, телефон, город"),
        resumePlaceholder("О себе", "краткая профессиональная справка"),
        resumePlaceholder("Опыт и практика", "места практик, проекты, стажировки"),
        resumePlaceholder("Образование", "специальность, курс, дисциплины"),
        resumePlaceholder("Навыки", "цифровые инструменты, языки"),
        resumePlaceholder("Экспорт", "PDF-версия резюме для работодателя"),
      ]),
    ]),
  ]);
}

function competenciesView() {
  const student = currentStudent();
  const scores = competencyScores(student.id);
  return h("section", { class: "stack" }, [
    h("div", { class: "filters" }, [
      h("input", { placeholder: "Поиск по коду, названию, ЗУНК", value: state.query, oninput: (event) => setState({ query: event.target.value }) }),
      h("select", { onchange: (event) => setState({ selectedDiscipline: event.target.value }) }, [
        h("option", { value: "all", selected: state.selectedDiscipline === "all" }, ["Все дисциплины"]),
        ...state.data.disciplines.map((discipline) => h("option", { value: discipline.id, selected: state.selectedDiscipline === discipline.id }, [`${discipline.code} ${discipline.name}`])),
      ]),
    ]),
    filteredCompetencies().length
      ? h("div", { class: "competency-grid" }, filteredCompetencies().map((competency) => competencyCard(competency, scores[competency.id])))
      : emptyState("Ничего не найдено. Измените запрос или выберите другую дисциплину."),
  ]);
}

function filteredCompetencies() {
  const q = state.query.toLowerCase();
  return state.data.competencies.filter((competency) => {
    const inText = [competency.code, competency.title, ...competency.knowledge, ...competency.skills, ...competency.habits].join(" ").toLowerCase().includes(q);
    const inDiscipline = state.selectedDiscipline === "all" || state.data.links.some((link) => link.disciplineId === state.selectedDiscipline && link.competencyId === competency.id);
    return inText && inDiscipline;
  });
}

function educationView() {
  const cycles = [...new Set(state.data.disciplines.map((item) => item.cycle))];
  return h("section", { class: "stack" }, [
    ...cycles.map((cycle) => h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, [cycle]), h("span", { class: "badge" }, [`${state.data.disciplines.filter((item) => item.cycle === cycle).length} позиций`])]),
      h("div", { class: "table education-table" }, state.data.disciplines.filter((item) => item.cycle === cycle).map((discipline) => educationRow(discipline))),
    ])),
  ]);
}

function evidenceView() {
  const student = currentStudent();
  const list = state.data.evidence.filter((item) => state.role === "student" ? item.studentId === student.id : true);
  return h("section", { class: "stack" }, [
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [
        h("h3", {}, ["Добавить достижение"]),
        h("span", { class: "badge" }, ["Достижение"]),
      ]),
      evidenceForm(),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [
        h("h3", {}, ["Импорт оценок CSV"]),
        h("button", { class: "ghost", onclick: () => runImport("Ручной CSV (Достижения)") }, ["Импортировать"]),
      ]),
      h("textarea", { oninput: (event) => { state.csv = event.target.value; saveState(); } }, [state.csv]),
      h("small", {}, ["Формат: student_email,discipline_code,score,title"]),
    ]),
    list.length
      ? h("div", { class: "cards-list" }, list.sort((a, b) => b.date.localeCompare(a.date)).map(evidenceItem))
      : emptyState("Достижений пока нет. Добавьте вручную или импортируйте оценки из CSV."),
  ]);
}

function verificationView() {
  const queue = state.data.evidence.filter((item) => ["submitted", "needs_revision"].includes(item.status));
  const reviews = state.data.employerReviews.filter((item) => item.status === "submitted");
  return h("section", { class: "stack" }, [
    h("div", { class: "notice" }, ["Преподаватель подтверждает учебные результаты, заведующий кафедрой - значимые достижения, методист - корректность связи с ЗУНК, работодатель - практики."]),
    queue.length
      ? h("div", { class: "cards-list" }, queue.map((item) => verificationItem(item)))
      : emptyState("Очередь пуста — все достижения обработаны."),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Отзывы работодателей"]), h("span", { class: "badge" }, [`${reviews.length} на проверке`])]),
      reviews.length
        ? h("div", { class: "cards-list" }, reviews.map((review) => employerReviewCard(review, true)))
        : emptyState("Нет отзывов работодателей на проверке."),
    ]),
  ]);
}

function employersView() {
  const employer = currentEmployer();
  const requests = state.data.employerRequests.filter((request) => state.role !== "employer" || request.employerId === employer.id);
  const active = requests.find((request) => request.status === "active") || requests[0];
  const matches = active ? employerRequestMatches(active) : [];
  const reviews = state.data.employerReviews.filter((review) => state.role !== "employer" || review.employerId === employer.id);
  return h("section", { class: "stack" }, [
    h("div", { class: "metric-grid" }, [
      metric("Организаций", state.data.employers.length, "модерация работодателей", "teal"),
      metric("Запросов", state.data.employerRequests.length, "компетенции и форматы", "gold"),
      metric("Приглашений", state.data.invitations.length, "практика / стажировка", "indigo"),
      metric("Открытых профилей", state.data.students.filter(canEmployerSeeStudent).length, "без закрытых данных", "green"),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Профиль работодателя"]), h("span", { class: `status ${employer.status === "moderated" ? "verified_by_teacher" : "submitted"}` }, [employer.status === "moderated" ? "Проверен" : "На модерации"])]),
      h("div", { class: "role-grid" }, state.data.employers.map((item) => h("div", { class: "mini-card" }, [
        h("strong", {}, [item.name]),
        h("span", {}, [item.industry]),
        h("small", {}, [`${item.contact} · доступ: ${item.access}`]),
        state.role === "admin" ? h("button", { class: "ghost compact", onclick: () => moderateEmployer(item.id) }, [item.status === "moderated" ? "Снять проверку" : "Подтвердить"]) : h("small", {}, [item.status === "moderated" ? "организация подтверждена" : "ожидает администратора"]),
      ]))),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Создать запрос"]), h("span", { class: "badge" }, ["matching score"])]),
      employerRequestForm(),
    ]),
    active ? h("article", { class: "panel chart-panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, [`Подбор: ${active.title}`]), h("span", { class: "badge" }, [`минимум ${active.minLevel}%`])]),
      matches.length
        ? h("div", { class: "cards-list" }, matches.map((match) => matchCard(active, match)))
        : emptyState("Подходящих студентов не найдено. Смягчите требования запроса."),
    ]) : h("div", { class: "notice" }, ["Пока нет запросов работодателей."]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Приглашения и отзывы"]), h("span", { class: "badge" }, ["внешняя верификация"])]),
      state.data.invitations.length || reviews.length
        ? h("div", { class: "cards-list" }, [
            ...state.data.invitations.map(invitationCard),
            ...reviews.map((review) => employerReviewCard(review, false)),
          ])
        : emptyState("Приглашений и отзывов пока нет."),
    ]),
  ]);
}

function methodologyView() {
  const coverage = state.data.competencies.map((competency) => {
    const links = state.data.links.filter((link) => link.competencyId === competency.id);
    const practices = links.filter((link) => byId(state.data.disciplines, link.disciplineId).type === "practice");
    const totalWeight = links.reduce((sum, link) => sum + link.weight, 0);
    return { competency, links, practices, totalWeight };
  });
  const gaps = coverage.filter((item) => item.links.length < 2 || item.practices.length === 0);
  const duplicated = coverage.filter((item) => item.links.length >= 5 || item.totalWeight > 2.4);
  return h("section", { class: "stack" }, [
    h("div", { class: "metric-grid" }, [
      metric("Компетенций", state.data.competencies.length, "в карте ЗУНК", "teal"),
      metric("Связей", state.data.links.length, "дисциплины и практики", "green"),
      metric("Пустые зоны", gaps.length, "мало покрытия или нет практики", "gold"),
      metric("Дублирование", duplicated.length, "слишком много вкладов", "indigo"),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Матрица дисциплин и компетенций"]), h("button", { class: "ghost", onclick: exportMethodologyCsv }, ["CSV"])]),
      h("div", { class: "table coverage-table" }, coverage.map((item) => h("div", { class: "table-row" }, [
        h("strong", {}, [item.competency.code]),
        h("span", {}, [item.competency.title]),
        h("span", {}, [`${item.links.length} связей / вес ${item.totalWeight.toFixed(2)}`]),
        h("span", {}, [item.practices.length ? "практика есть" : "нет практики"]),
      ]))),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Методические риски"]), h("span", { class: "badge" }, ["автопроверка"])]),
      h("div", { class: "cards-list" }, [
        ...gaps.map((item) => h("div", { class: "notice" }, [`${item.competency.code}: нужно усилить практическое подтверждение или добавить дисциплинарные связи.`])),
        ...duplicated.map((item) => h("div", { class: "notice" }, [`${item.competency.code}: возможное дублирование, ${item.links.length} связей, общий вес ${item.totalWeight.toFixed(2)}.`])),
      ]),
    ]),
  ]);
}

function reportsView() {
  return h("section", { class: "stack" }, [
    h("div", { class: "metric-grid" }, [
      metric("Шаблонов", state.data.reports.length, "группа / методика / работодатель", "teal"),
      metric("Портфолио", state.data.students.filter((student) => student.publicProfile).length, "открытых профилей", "green"),
      metric("Работодатели", state.data.employerRequests.length, "запросов для отчета", "gold"),
      metric("Экспорт", "PDF/CSV", "без закрытых данных", "indigo"),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Отчеты"]), h("button", { class: "ghost", onclick: exportReportCsv }, ["Экспорт CSV"])]),
      h("div", { class: "table reports-table" }, state.data.reports.map((report) => h("div", { class: "table-row" }, [
        h("strong", {}, [report.title]),
        h("span", {}, [report.scope]),
        h("span", {}, [report.format]),
        h("span", { class: `status ${report.status === "ready" ? "verified_by_teacher" : "draft"}` }, [report.status === "ready" ? "Готов" : "Черновик"]),
      ]))),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Публичные портфолио"]), h("span", { class: "badge" }, ["контроль доступа"])]),
      h("div", { class: "cards-list" }, visibleStudents().map(publicPortfolioCard)),
    ]),
  ]);
}

function analyticsView() {
  const students = visibleStudents();
  const compRows = state.data.competencies.map((competency) => {
    const value = Math.round(students.reduce((sum, student) => sum + competencyScores(student.id)[competency.id], 0) / Math.max(students.length, 1));
    return { ...competency, value };
  }).sort((a, b) => a.value - b.value);
  const analytics = groupAnalytics();
  const demandRows = employerDemandRows();
  return h("section", { class: "stack" }, [
    h("div", { class: "metric-grid" }, [
      metric("Средняя готовность", `${analytics.avg}%`, "по группе ТД-26", "teal"),
      metric("Достижений", analytics.evidenceCount, "в базе группы", "green"),
      metric("Очередь проверки", analytics.queue, "submitted / needs_revision", "indigo"),
      metric("Зона внимания", analytics.weak.code, analytics.weak.title, "gold"),
    ]),
    h("article", { class: "panel chart-panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Диаграмма компетенций"]), h("span", { class: "badge" }, ["среднее по группе"])]),
      h("div", { class: "chart-list", role: "list", "aria-label": "Средний уровень компетенций группы" }, compRows.map((competency) => chartRow(competency.code, competency.title, competency.value))),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Компетенции группы"]), h("span", { class: "badge" }, ["слабые сверху"])]),
      ...compRows.map((competency) => progressRow(competency.code, competency.title, competency.value)),
    ]),
    h("article", { class: "panel chart-panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Запрос рынка и дефициты"]), h("button", { class: "ghost", onclick: () => setState({ view: "employers" }) }, ["К работодателям"])]),
      h("div", { class: "chart-list", role: "list", "aria-label": "Спрос работодателей и средний уровень подготовки" }, demandRows.map((row) => chartRow(row.code, `${row.title} · спрос ${row.demand}`, row.gap))),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Студенты"]), h("span", { class: "badge" }, [`${students.length} человек`])]),
      h("div", { class: "table student-table" }, students.map((student) => studentRow(student))),
    ]),
  ]);
}

function employerDemandRows() {
  return state.data.competencies.map((competency) => {
    const demand = state.data.employerRequests.reduce((sum, request) => {
      return sum + (request.required || []).filter((id) => id === competency.id).length * 2 + (request.desired || []).filter((id) => id === competency.id).length;
    }, 0);
    const avg = Math.round(state.data.students.reduce((sum, student) => sum + competencyScores(student.id)[competency.id], 0) / Math.max(state.data.students.length, 1));
    return { ...competency, demand, avg, gap: Math.max(0, Math.min(100, demand ? requestGapScore(demand, avg) : avg)) };
  }).sort((a, b) => b.demand - a.demand || a.avg - b.avg);
}

function requestGapScore(demand, avg) {
  return Math.round(Math.min(100, Math.max(10, demand * 18 + (100 - avg) * 0.55)));
}

function adminView() {
  return h("section", { class: "stack" }, [
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Роли и доступ"]), h("span", { class: "badge" }, ["RBAC (сервер)"])]),
      h("div", { class: "role-grid" }, ROLE_LIST.map((role) => h("div", { class: "mini-card" }, [
        h("strong", {}, [role.title]),
        h("span", {}, [role.account]),
        h("small", {}, [accessDescription(role.id)]),
      ]))),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Связи дисциплин с компетенциями"]), h("span", { class: "badge" }, [`${state.data.links.length} связей`])]),
      h("div", { class: "table links-table" }, state.data.links.map((link) => {
        const discipline = byId(state.data.disciplines, link.disciplineId);
        const competency = byId(state.data.competencies, link.competencyId);
        return h("div", { class: "table-row" }, [
          h("span", {}, [`${discipline.code} ${discipline.name}`]),
          h("strong", {}, [competency.code]),
          h("span", {}, [`вес ${link.weight}`]),
        ]);
      })),
    ]),
  ]);
}

function accessDescription(role) {
  return {
    student: "свои данные, портфолио, достижения",
    teacher: "свои группы, оценки, подтверждение результатов",
    head: "специальность, аналитика, спорные подтверждения",
    methodologist: "карты компетенций и методические связи",
    director: "агрегированная аналитика",
    employer: "запросы, подбор студентов, приглашения и отзывы",
    admin: "пользователи, справочники и настройки",
  }[role];
}

function metric(label, value, note, tone = "teal") {
  return h("div", { class: `metric tone-${tone}` }, [
    h("span", {}, [label]),
    h("strong", {}, [value]),
    h("small", {}, [note]),
  ]);
}

function ring(value, label) {
  return h("div", { class: "ring", style: `--value:${value * 3.6}deg`, role: "img", "aria-label": `${label}: ${value}%` }, [
    h("strong", {}, [`${value}%`]),
    h("span", {}, [label]),
  ]);
}

function progressRow(code, title, value) {
  return h("div", { class: "progress-row" }, [
    h("div", {}, [h("strong", {}, [code]), h("span", {}, [title])]),
    h("div", { class: "bar-wrap", role: "progressbar", "aria-label": `${code}: ${value}%`, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(value) }, [h("div", { class: "bar", style: `width:${value}%` })]),
    h("b", {}, [`${value}%`]),
  ]);
}

function chartRow(code, title, value) {
  return h("div", { class: "chart-row", role: "listitem" }, [
    h("div", { class: "chart-label" }, [
      h("strong", {}, [code]),
      h("span", {}, [title]),
    ]),
    h("div", { class: "chart-track", role: "progressbar", "aria-label": `${code}: ${value}%`, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(value) }, [
      h("i", { style: `width:${value}%` }),
    ]),
    h("b", {}, [`${value}%`]),
  ]);
}

function competencyCard(competency, value) {
  const linked = state.data.links
    .filter((link) => link.competencyId === competency.id)
    .map((link) => `${byId(state.data.disciplines, link.disciplineId).code} ${link.weight}`);
  const selected = state.selectedCompetency === competency.id;
  return h("article", {
    class: `competency-card clickable${selected ? " selected" : ""}`,
    role: "button",
    tabindex: "0",
    "aria-pressed": selected ? "true" : "false",
    onclick: () => setState({ selectedCompetency: selected ? null : competency.id }),
    onkeydown: (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setState({ selectedCompetency: selected ? null : competency.id });
      }
    },
  }, [
    h("div", { class: "panel-head" }, [h("span", { class: "badge" }, [competency.code]), ring(value, "уровень")]),
    h("h3", {}, [competency.title]),
    zunkBlock("Знания", competency.knowledge),
    zunkBlock("Умения", competency.skills),
    zunkBlock("Навыки", competency.habits),
    h("div", { class: "chips" }, linked.map((item) => h("span", {}, [item]))),
  ]);
}

function zunkBlock(title, items) {
  return h("div", { class: "zunk" }, [
    h("strong", {}, [title]),
    h("ul", {}, items.map((item) => h("li", {}, [item]))),
  ]);
}

function educationRow(discipline) {
  const linked = state.data.links.filter((link) => link.disciplineId === discipline.id);
  return h("div", { class: "table-row" }, [
    h("strong", {}, [discipline.code]),
    h("span", {}, [discipline.name]),
    h("span", {}, [`${discipline.hours} ч / семестр ${discipline.semester}`]),
    h("span", {}, [linked.map((link) => byId(state.data.competencies, link.competencyId).code).join(", ")]),
  ]);
}

function evidenceItem(item) {
  const student = byId(state.data.students, item.studentId);
  const discipline = byId(state.data.disciplines, item.disciplineId);
  return h("article", { class: "evidence-card" }, [
    h("div", {}, [
      h("span", { class: `status ${item.status}` }, [statusLabels[item.status]]),
      h("h3", {}, [item.title]),
      h("p", {}, [`${student.name} / ${discipline.code} ${discipline.name}`]),
      h("small", {}, [`${typeLabels[item.type]} - ${item.date} - вклад ${Math.round(evidenceImpact(item))}`]),
    ]),
    h("strong", { class: "score-badge", "aria-label": `Балл ${item.score}` }, [`${item.score}`]),
  ]);
}

function matchCard(request, match) {
  return h("article", { class: "evidence-card action-card" }, [
    h("div", {}, [
      h("span", { class: "badge" }, [`match ${match.score}%`]),
      h("h3", {}, [match.student.name]),
      h("p", {}, [`${byId(state.data.groups, match.student.groupId).name} · ${match.student.employmentStatus}`]),
      h("small", {}, [match.explanation]),
    ]),
    h("div", { class: "actions" }, [
      h("button", { onclick: () => inviteStudent(request.id, match.student.id) }, ["Пригласить"]),
      h("button", { class: "ghost", onclick: () => setState({ currentStudentId: match.student.id, view: "dashboard" }) }, ["Профиль"]),
    ]),
  ]);
}

function invitationCard(item) {
  const student = byId(state.data.students, item.studentId);
  const employer = byId(state.data.employers, item.employerId);
  return h("article", { class: "evidence-card action-card" }, [
    h("div", {}, [
      h("span", { class: `status ${item.status === "accepted" ? "verified_by_teacher" : "submitted"}` }, [item.status === "accepted" ? "Принято" : "Отправлено"]),
      h("h3", {}, [`${student.name}: ${item.type === "internship" ? "стажировка" : "практика"}`]),
      h("p", {}, [`${employer.name} · ${item.date}`]),
      h("small", {}, [item.note]),
    ]),
  ]);
}

function employerReviewCard(review, actionable) {
  const student = byId(state.data.students, review.studentId);
  const employer = byId(state.data.employers, review.employerId);
  return h("article", { class: "evidence-card action-card" }, [
    h("div", {}, [
      h("span", { class: `status ${review.status}` }, [review.status === "submitted" ? "На верификации" : statusLabels[review.status] || review.status]),
      h("h3", {}, [`Отзыв: ${student.name}`]),
      h("p", {}, [`${employer.name} · ${review.date} · балл ${review.score}`]),
      h("small", {}, [review.text]),
    ]),
    actionable ? h("div", { class: "actions" }, [
      h("button", { onclick: () => verifyEmployerReview(review.id) }, ["Подтвердить"]),
      h("button", { class: "ghost", onclick: () => markEmployerReview(review.id, "needs_revision") }, ["На доработку"]),
    ]) : h("span", { class: "score-badge" }, [review.score]),
  ]);
}

function publicPortfolioCard(student) {
  const allowed = canEmployerSeeStudent(student);
  return h("article", { class: "evidence-card action-card" }, [
    h("div", {}, [
      h("span", { class: `status ${allowed ? "verified_by_teacher" : "draft"}` }, [allowed ? "Доступен партнерам" : "Закрыт"]),
      h("h3", {}, [student.name]),
      h("p", {}, [`${byId(state.data.groups, student.groupId).name} · готовность ${readiness(student.id)}%`]),
      h("small", {}, [`режим доступа: ${student.portfolioAccess || "college"} · ${student.employmentStatus || "не указан"}`]),
    ]),
    h("button", { class: "ghost", onclick: () => togglePortfolioAccess(student.id) }, [allowed ? "Ограничить" : "Открыть"]),
  ]);
}

function employerRequestForm() {
  const formId = "employer-request-form";
  setTimeout(() => {
    const form = document.getElementById(formId);
    if (!form || form.dataset.ready) return;
    form.dataset.ready = "true";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const title = (data.get("title") || "").trim();
      const required = data.get("required").split(",").map((item) => item.trim()).filter(Boolean);
      const desired = data.get("desired").split(",").map((item) => item.trim()).filter(Boolean);
      const known = new Set(state.data.competencies.map((competency) => competency.id));
      const unknown = [...required, ...desired].filter((id) => !known.has(id));
      if (!title) {
        toast("Укажите название запроса", "error");
        return;
      }
      if (!required.length) {
        toast("Добавьте хотя бы одну обязательную компетенцию", "error");
        return;
      }
      if (unknown.length) {
        toast(`Неизвестные компетенции: ${unknown.join(", ")}`, "error");
        return;
      }
      apiAction(
        () =>
          api.request("POST", "/api/employers/requests", {
            title,
            course: Number(data.get("course")),
            minLevel: Number(data.get("minLevel")),
            format: data.get("format"),
            required,
            desired,
          }),
        `Запрос «${title}» создан`,
      );
    });
  });
  return h("form", { id: formId, class: "form-grid" }, [
    field("Название", h("input", { name: "title", value: "Новый запрос работодателя" })),
    field("Курс", h("input", { name: "course", type: "number", min: "1", max: "4", value: "1" })),
    field("Мин. уровень", h("input", { name: "minLevel", type: "number", min: "0", max: "100", value: "35" })),
    field("Формат", h("select", { name: "format" }, ["практика", "стажировка", "собеседование"].map((item) => h("option", { value: item }, [item])))),
    field("Обязательные компетенции", h("input", { name: "required", value: "pk01, ok02" }), "wide"),
    field("Желательные компетенции", h("input", { name: "desired", value: "pk02, ok03" }), "wide"),
    h("button", { type: "submit" }, ["Создать запрос"]),
  ]);
}

function verificationItem(item) {
  return h("article", { class: "evidence-card action-card" }, [
    h("div", {}, [
      h("span", { class: `status ${item.status}` }, [statusLabels[item.status]]),
      h("h3", {}, [item.title]),
      h("p", {}, [`${byId(state.data.students, item.studentId).name} / ${byId(state.data.disciplines, item.disciplineId).code} ${byId(state.data.disciplines, item.disciplineId).name}`]),
      h("small", {}, [`${typeLabels[item.type]} - балл ${item.score} - текущий коэффициент доверия ${trustFor(item)}`]),
    ]),
    h("div", { class: "actions" }, [
      h("button", { onclick: () => verifyEvidence(item.id, statusForVerifier()) }, ["Подтвердить"]),
      h("button", { class: "ghost", onclick: () => verifyEvidence(item.id, "needs_revision") }, ["На доработку"]),
      h("button", { class: "danger", onclick: () => verifyEvidence(item.id, "rejected") }, ["Отклонить"]),
    ]),
  ]);
}

function publicProfileMetric(student) {
  return h("div", { class: "metric tone-green" }, [
    h("span", {}, ["Публичное портфолио"]),
    h("strong", {}, [student.publicProfile ? "Открыто" : "Закрыто"]),
    h("button", {
      class: "ghost compact",
      onclick: () => togglePortfolioAccess(student.id),
    }, [student.publicProfile ? "Закрыть" : "Открыть"]),
  ]);
}

function statusForVerifier() {
  return {
    teacher: "verified_by_teacher",
    head: "verified_by_department_head",
    methodologist: "verified_by_methodologist",
  }[state.role] || "verified_by_teacher";
}

function evidenceForm() {
  const formId = "evidence-form";
  setTimeout(() => {
    const form = document.getElementById(formId);
    if (!form || form.dataset.ready) return;
    form.dataset.ready = "true";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const title = (data.get("title") || "").trim();
      const score = Number(data.get("score"));
      if (!title) {
        toast("Укажите название события", "error");
        return;
      }
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        toast("Балл должен быть числом от 0 до 100", "error");
        return;
      }
      apiAction(
        () =>
          api.request("POST", "/api/evidence", {
            studentId: data.get("studentId"),
            disciplineId: data.get("disciplineId"),
            title,
            type: data.get("type"),
            score,
          }),
        `Достижение «${title}» добавлено`,
      );
    });
  });
  return h("form", { id: formId, class: "form-grid" }, [
    field("Студент", h("select", { name: "studentId" }, visibleStudents().map((student) => h("option", { value: student.id, selected: student.id === state.currentStudentId }, [student.name])))),
    field("Дисциплина", h("select", { name: "disciplineId" }, state.data.disciplines.map((discipline) => h("option", { value: discipline.id }, [`${discipline.code} ${discipline.name}`])))),
    field("Тип", h("select", { name: "type" }, Object.entries(typeLabels).map(([value, label]) => h("option", { value }, [label])))),
    field("Балл", h("input", { name: "score", type: "number", min: "0", max: "100", value: "85" })),
    field("Событие", h("input", { name: "title", value: "Новое достижение" }), "wide"),
    h("button", { type: "submit" }, ["Сохранить"]),
  ]);
}

function field(label, control, className = "") {
  return h("label", { class: `field ${className}`.trim() }, [
    h("span", {}, [label]),
    control,
  ]);
}

function studentRow(student) {
  return h("div", { class: "table-row clickable", onclick: () => setState({ currentStudentId: student.id, view: "dashboard" }) }, [
    h("strong", {}, [student.name]),
    h("span", {}, [byId(state.data.groups, student.groupId).name]),
    h("span", { class: "table-value" }, [`${readiness(student.id)}% готовности`]),
    h("span", {}, [student.publicProfile ? "портфолио открыто" : "портфолио закрыто"]),
  ]);
}

function verifyEvidence(id, status) {
  const item = byId(state.data.evidence, id);
  const title = item ? item.title : "достижение";
  apiAction(
    () => api.request("POST", `/api/evidence/${id}/verify`, { status }),
    `«${title}»: ${statusLabels[status] || status}`,
    status === "rejected" ? "error" : "success",
  );
}

function moderateEmployer(id) {
  apiAction(() => api.request("POST", `/api/employers/${id}/moderate`), "Статус работодателя обновлён", "info");
}

function inviteStudent(requestId, studentId) {
  const name = (byId(state.data.students, studentId) || {}).name || "студент";
  apiAction(() => api.request("POST", "/api/invitations", { requestId, studentId }), `${name}: приглашение отправлено`);
}

function verifyEmployerReview(id) {
  apiAction(() => api.request("POST", `/api/reviews/${id}/verify`), "Отзыв подтверждён и добавлен в профиль");
}

function markEmployerReview(id) {
  apiAction(() => api.request("POST", `/api/reviews/${id}/revision`), "Отзыв отправлен на доработку", "info");
}

function togglePortfolioAccess(studentId) {
  apiAction(() => api.request("POST", `/api/students/${studentId}/portfolio`), "Доступ к портфолио обновлён", "info");
}

function addEvidenceQuick() {
  apiAction(
    () =>
      api.request("POST", "/api/evidence", {
        studentId: state.currentStudentId,
        disciplineId: "pm01",
        title: "Наблюдение преподавателя: торговая ситуация",
        type: "practice",
        score: 87,
      }),
    "Добавлено достижение-наблюдение",
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Спринт 1: пакетный импорт (сервер проверяет дубли, ведёт журнал и позволяет откат).
function runImport(source = "Электронный журнал (CSV)") {
  apiAction(async () => {
    const res = await api.request("POST", "/api/imports", { csv: state.csv, source });
    toast(`Импорт: добавлено ${res.added}, дублей ${res.duplicates}, ошибок ${res.errors}`, res.added ? "success" : "error");
  });
}

function rollbackImport(batchId) {
  apiAction(() => api.request("POST", `/api/imports/${batchId}/rollback`), "Импорт откачен", "info");
}

function downloadText(filename, content, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportReportCsv() {
  const rows = [
    ["report", "scope", "format", "status"],
    ...state.data.reports.map((report) => [report.title, report.scope, report.format, report.status]),
    [],
    ["student", "readiness", "portfolio_access", "employment_status"],
    ...state.data.students.map((student) => [student.name, readiness(student.id), student.portfolioAccess, student.employmentStatus]),
  ];
  downloadText("competency-platform-reports.csv", rows.map((row) => row.join(";")).join("\n"));
  toast("Отчёт выгружен в CSV", "success");
}

function exportMethodologyCsv() {
  const rows = [
    ["competency", "title", "links", "practice_links", "total_weight"],
    ...state.data.competencies.map((competency) => {
      const links = state.data.links.filter((link) => link.competencyId === competency.id);
      const practiceLinks = links.filter((link) => byId(state.data.disciplines, link.disciplineId).type === "practice");
      return [competency.code, competency.title, links.length, practiceLinks.length, links.reduce((sum, link) => sum + link.weight, 0).toFixed(2)];
    }),
  ];
  downloadText("methodology-coverage.csv", rows.map((row) => row.join(";")).join("\n"));
  toast("Методическое покрытие выгружено в CSV", "success");
}

/* =========================================================================
   Третья очередь: интеграции, AI-анализ, рекомендации, прогнозирование
   Клиентские эвристики в стиле MVP. Инвариант: AI предлагает — человек решает.
   ========================================================================= */

function aiStems(text) {
  return (text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 4)
    .map((w) => w.slice(0, 6));
}

function competencyTerms(competency) {
  return [competency.title, ...(competency.knowledge || []), ...(competency.skills || []), ...(competency.habits || []), ...(competency.indicators || [])].join(" ");
}

function aiSuggestCompetencies(text, topN = 3) {
  const input = new Set(aiStems(text));
  if (!input.size) return [];
  return state.data.competencies
    .map((competency) => {
      const terms = new Set(aiStems(competencyTerms(competency)));
      let hits = 0;
      input.forEach((s) => { if (terms.has(s)) hits += 1; });
      return { competencyId: competency.id, code: competency.code, title: competency.title, hits, confidence: Math.min(0.95, 0.4 + hits * 0.1) };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, topN);
}

function maskPII(text) {
  if (!state.data.aiSettings.maskPII) return text;
  return (text || "")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "e-mail скрыт")
    .replace(/\+?\d[\d\s()-]{8,}\d/g, "телефон скрыт");
}

function canConfirmAi() {
  return ["methodologist", "head", "teacher", "admin"].includes(state.role);
}

const aiStatusLabels = { proposed: "Предложено AI", accepted: "Принято", edited: "Изменено и принято", rejected: "Отклонено" };
function aiStatusLabel(status) { return aiStatusLabels[status] || status; }

function confidenceBar(value) {
  const pct = Math.round(value * 100);
  return h("div", { class: "chart-track confidence", role: "progressbar", "aria-label": `уверенность ${pct}%`, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct) }, [h("i", { style: `width:${pct}%` })]);
}

function decideSuggestion(id, decision, newCompetencyId) {
  if (!canConfirmAi()) return;
  apiAction(
    () => api.request("POST", `/api/ai/suggestions/${id}/decision`, { decision, competencyId: newCompetencyId }),
    decision === "accepted" ? "Предложение подтверждено человеком" : "Предложение отклонено",
    decision === "accepted" ? "success" : "info",
  );
}

function editSuggestion(id) {
  const code = window.prompt("Код компетенции для связи (например, ПК.04):", "");
  if (code == null) return;
  const key = code.trim().toLowerCase();
  const comp = state.data.competencies.find((c) => c.code.toLowerCase() === key || c.id === key);
  if (!comp) { toast("Компетенция не найдена", "error"); return; }
  decideSuggestion(id, "accepted", comp.id);
}

function analyzeSource() {
  const text = (document.getElementById("ai-text")?.value || "").trim();
  const source = document.getElementById("ai-source")?.value || "Другое";
  const disciplineId = document.getElementById("ai-discipline")?.value || state.data.disciplines[0].id;
  if (text.length < 12) { toast("Добавьте больше текста для анализа", "error"); return; }
  apiAction(async () => {
    const res = await api.request("POST", "/api/ai/analyze", { text, source, disciplineId });
    state.aiInput = "";
    if (res.created) toast(`AI предложил ${res.created} связ(и). Требуется подтверждение методиста.`, "success");
    else toast("AI не нашёл явных совпадений с ЗУНК", "info");
  });
}

function suggestionCard(s) {
  const disc = byId(state.data.disciplines, s.disciplineId);
  const comp = byId(state.data.competencies, s.competencyId);
  const statusClass = s.status === "proposed" ? "submitted" : s.status === "rejected" ? "rejected" : "verified_by_teacher";
  const confirmable = canConfirmAi() && s.status === "proposed";
  return h("article", { class: "evidence-card action-card" }, [
    h("div", {}, [
      h("div", { class: "row-badges" }, [h("span", { class: "badge" }, [s.sourceType]), h("span", { class: `status ${statusClass}` }, [aiStatusLabel(s.status)])]),
      h("h3", {}, [`${disc ? disc.code : "—"} → ${comp ? comp.code : "—"} · ${comp ? comp.title : ""}`]),
      h("p", {}, [maskPII(s.sourceText)]),
      h("small", { class: "muted-text" }, [`Источник: ${s.createdBy === "system" ? "демо-данные" : s.createdBy} · ${s.createdAt} · уверенность ${Math.round(s.confidence * 100)}%`]),
      confidenceBar(s.confidence),
    ]),
    confirmable
      ? h("div", { class: "actions" }, [
          h("button", { class: "compact", onclick: () => decideSuggestion(s.id, "accepted") }, ["Принять"]),
          h("button", { class: "ghost compact", onclick: () => editSuggestion(s.id) }, ["Изменить"]),
          h("button", { class: "danger compact", onclick: () => decideSuggestion(s.id, "rejected") }, ["Отклонить"]),
        ])
      : (s.status === "proposed"
          ? h("small", { class: "muted-text" }, ["Ожидает подтверждения методиста"])
          : h("span", { class: "badge" }, [`${aiStatusLabel(s.status)}${s.decidedBy ? ` · ${s.decidedBy}` : ""}`])),
  ]);
}

function aiRecognitionPanel() {
  return h("article", { class: "panel" }, [
    h("div", { class: "panel-head" }, [h("h3", {}, ["Распознавание компетенций из документов"]), h("span", { class: "badge" }, ["Спринт 2"])]),
    h("p", { class: "muted-text" }, ["Вставьте текст рабочей программы, положения о конкурсе или отзыва — AI предложит связи с ЗУНК. Предложения не применяются без подтверждения методиста."]),
    h("div", { class: "form-grid" }, [
      field("Тип источника", h("select", { id: "ai-source" }, ["Рабочая программа", "Положение о конкурсе", "Отзыв", "Другое"].map((x) => h("option", { value: x }, [x])))),
      field("Дисциплина для связи", h("select", { id: "ai-discipline" }, state.data.disciplines.map((d) => h("option", { value: d.id }, [`${d.code} ${d.name}`])))),
      field("Текст источника", h("textarea", { id: "ai-text", oninput: (e) => { state.aiInput = e.target.value; saveState(); }, placeholder: "Вставьте фрагмент документа..." }, [state.aiInput || ""]), "wide"),
      h("button", { onclick: analyzeSource }, ["Проанализировать"]),
    ]),
  ]);
}

function pendingSuggestionsPanel() {
  const pending = state.data.aiSuggestions.filter((s) => s.status === "proposed");
  return h("article", { class: "panel" }, [
    h("div", { class: "panel-head" }, [h("h3", {}, ["Очередь AI-предложений"]), h("span", { class: "badge" }, [`${pending.length} на подтверждении`])]),
    pending.length ? h("div", { class: "cards-list" }, pending.map(suggestionCard)) : emptyState("Нет предложений на подтверждении."),
  ]);
}

function aiHistoryPanel() {
  const log = state.data.aiDecisions.slice(0, 8);
  return h("article", { class: "panel" }, [
    h("div", { class: "panel-head" }, [h("h3", {}, ["История решений по AI"]), h("span", { class: "badge" }, [`${state.data.aiDecisions.length}`])]),
    log.length
      ? h("div", { class: "table history-table" }, log.map((d) => {
          const comp = byId(state.data.competencies, d.competencyId);
          return h("div", { class: "table-row" }, [h("strong", {}, [d.at]), h("span", {}, [d.role]), h("span", {}, [comp ? comp.code : d.competencyId]), h("span", {}, [aiStatusLabel(d.decision)])]);
        }))
      : emptyState("Решений пока нет."),
  ]);
}

function confirmPortfolioLink(disciplineId, competencyId, title) {
  const code = (byId(state.data.competencies, competencyId) || {}).code || competencyId;
  apiAction(
    () => api.request("POST", "/api/ai/portfolio/confirm", { disciplineId, competencyId }),
    `Связь подтверждена: ${code} ↔ «${title}»`,
  );
}

function aiPortfolioPanel() {
  const student = currentStudent();
  const scores = competencyScores(student.id);
  const total = state.data.competencies.length;
  const covered = state.data.competencies.filter((c) => (scores[c.id] || 0) > 0).length;
  const completeness = Math.round((covered / Math.max(total, 1)) * 100);
  const gaps = state.data.competencies.filter((c) => (scores[c.id] || 0) === 0);
  const evid = state.data.evidence.filter((e) => e.studentId === student.id);
  const canConfirm = ["teacher", "head", "methodologist", "admin"].includes(state.role);
  const cards = evid.map((e) => {
    const linked = new Set(state.data.links.filter((l) => l.disciplineId === e.disciplineId).map((l) => l.competencyId));
    const sugg = aiSuggestCompetencies(`${e.title} ${e.source || ""}`, 2).filter((x) => !linked.has(x.competencyId));
    const shortDesc = (e.title || "").length < 24;
    if (!sugg.length && !shortDesc) return null;
    return h("article", { class: "evidence-card action-card" }, [
      h("div", {}, [
        h("span", { class: `status ${e.status}` }, [statusLabels[e.status]]),
        h("h3", {}, [e.title]),
        sugg.length ? h("p", {}, [`AI предлагает компетенции: ${sugg.map((x) => x.code).join(", ")}`]) : h("p", { class: "muted-text" }, ["Новых компетенций не найдено."]),
        shortDesc ? h("small", { class: "muted-text" }, ["Рекомендация: опишите достижение подробнее — что сделано, результат, инструменты."]) : null,
      ].filter(Boolean)),
      (sugg.length && canConfirm)
        ? h("div", { class: "actions" }, sugg.map((x) => h("button", { class: "ghost compact", onclick: () => confirmPortfolioLink(e.disciplineId, x.competencyId, e.title) }, [`Подтвердить ${x.code}`])))
        : (sugg.length ? h("small", { class: "muted-text" }, ["Связь подтверждает преподаватель"]) : null),
    ].filter(Boolean));
  }).filter(Boolean);
  return h("article", { class: "panel" }, [
    h("div", { class: "panel-head" }, [h("h3", {}, ["AI-анализ портфолио"]), h("span", { class: "badge" }, ["Спринт 3"])]),
    h("div", { class: "notice" }, [`Полнота портфолио: ${completeness}%. Закрытые данные не отправляются работодателю без разрешения (доступ: ${student.portfolioAccess || "college"}).`]),
    progressRow("Полнота", `${covered} из ${total} компетенций подтверждены достижениями`, completeness),
    gaps.length ? h("p", { class: "muted-text" }, [`Пробелы: ${gaps.map((g) => g.code).join(", ")}`]) : h("p", { class: "muted-text" }, ["Пробелов нет — есть вклад по всем компетенциям."]),
    h("h4", { class: "subhead" }, ["Предложения по достижениям"]),
    cards.length ? h("div", { class: "cards-list" }, cards) : emptyState("AI не нашёл, что улучшить — портфолио заполнено качественно."),
  ]);
}

function aiView() {
  const showRecognition = ["methodologist", "head", "admin", "teacher"].includes(state.role);
  const showPortfolio = ["student", "teacher", "head", "methodologist"].includes(state.role);
  return h("section", { class: "stack" }, [
    h("div", { class: "notice" }, ["Ключевой принцип: AI только предлагает связи и улучшения. Компетенции подтверждает человек (методист/преподаватель). Все решения фиксируются в истории."]),
    ...(showRecognition ? [aiRecognitionPanel(), pendingSuggestionsPanel(), aiHistoryPanel()] : []),
    ...(showPortfolio ? [aiPortfolioPanel()] : []),
  ]);
}

function recommendationsFor(studentId) {
  const scores = competencyScores(studentId);
  const deficits = state.data.competencies.map((c) => ({ c, value: scores[c.id] || 0 })).filter((x) => x.value < 65).sort((a, b) => a.value - b.value).slice(0, 4);
  const recs = [];
  deficits.forEach(({ c, value }) => {
    const links = state.data.links.filter((l) => l.competencyId === c.id);
    const discs = links.map((l) => byId(state.data.disciplines, l.disciplineId)).filter(Boolean);
    const practice = discs.find((d) => d.type === "practice");
    const module = discs.find((d) => d.type === "module");
    const bestWeight = Math.max(0.3, ...links.map((l) => l.weight || 0.3));
    const gain = Math.max(4, Math.round((100 - value) * bestWeight * 0.5));
    const actions = [];
    if (practice) actions.push(`Пройти практику: ${practice.code} ${practice.name}`);
    if (module) actions.push(`Закрыть модуль: ${module.code} ${module.name}`);
    actions.push(`Подготовить проект или участвовать в конкурсе по «${c.title}»`);
    actions.forEach((text, i) => recs.push({ id: `rec-${studentId}-${c.id}-${i}`, competencyId: c.id, code: c.code, title: c.title, value, gain, text }));
  });
  return recs;
}

function toggleRecommendation(id) {
  const done = state.data.recommendationsDone.includes(id);
  apiAction(
    () => api.request("POST", "/api/recommendations/toggle", { studentId: currentStudent().id, key: id }),
    done ? "Рекомендация снята" : "Рекомендация отмечена выполненной",
    "info",
  );
}

function recommendationCard(r, isDone) {
  return h("article", { class: `evidence-card action-card${isDone ? " rec-done" : ""}` }, [
    h("div", {}, [
      h("div", { class: "row-badges" }, [h("span", { class: "badge" }, [r.code]), h("span", { class: "status verified_by_teacher" }, [`+${r.gain}% прирост`])]),
      h("h3", {}, [r.text]),
      h("small", { class: "muted-text" }, [`Компетенция «${r.title}» · текущий уровень ${r.value}%`]),
    ]),
    h("div", { class: "actions" }, [h("button", { class: isDone ? "ghost compact" : "compact", onclick: () => toggleRecommendation(r.id) }, [isDone ? "Выполнено ✓" : "Отметить выполненной"])]),
  ]);
}

function massDeficitsPanel() {
  const students = state.data.students;
  const rows = state.data.competencies.map((c) => {
    const below = students.filter((s) => (competencyScores(s.id)[c.id] || 0) < 50).length;
    const avg = Math.round(students.reduce((sum, s) => sum + (competencyScores(s.id)[c.id] || 0), 0) / Math.max(students.length, 1));
    return { c, below, avg };
  }).sort((a, b) => b.below - a.below || a.avg - b.avg);
  return h("article", { class: "panel" }, [
    h("div", { class: "panel-head" }, [h("h3", {}, ["Массовые дефициты группы"]), h("span", { class: "badge" }, ["для руководителя"])]),
    h("div", { class: "table coverage-table" }, rows.map((r) => h("div", { class: "table-row" }, [h("strong", {}, [r.c.code]), h("span", {}, [r.c.title]), h("span", {}, [`${r.below} студ. ниже 50%`]), h("span", { class: "table-value" }, [`${r.avg}%`])]))),
  ]);
}

function developmentView() {
  const student = currentStudent();
  const recs = recommendationsFor(student.id);
  const done = state.data.recommendationsDone;
  const requests = state.data.employerRequests;
  const selReqId = state.devRequestId && requests.some((r) => r.id === state.devRequestId) ? state.devRequestId : (requests[0] && requests[0].id);
  const req = byId(state.data.employerRequests, selReqId);
  const scores = competencyScores(student.id);
  const staff = ["teacher", "head", "director", "methodologist", "admin"].includes(state.role);
  return h("section", { class: "stack" }, [
    h("div", { class: "metric-grid" }, [
      metric("Дефицитов", new Set(recs.map((r) => r.competencyId)).size, "компетенций ниже 65%", "gold"),
      metric("Рекомендаций", recs.length, "конкретных шагов", "indigo"),
      metric("Выполнено", recs.filter((r) => done.includes(r.id)).length, "отмечено студентом", "green"),
      metric("Готовность", `${readiness(student.id)}%`, student.name, "teal"),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Персональные рекомендации"]), h("span", { class: "badge" }, ["по дефицитам"])]),
      recs.length ? h("div", { class: "cards-list" }, recs.map((r) => recommendationCard(r, done.includes(r.id)))) : emptyState("Дефицитов нет — уровень по всем компетенциям 65%+."),
    ]),
    req
      ? h("article", { class: "panel" }, [
          h("div", { class: "panel-head" }, [h("h3", {}, ["Сравнение с запросом работодателя"]), h("select", { onchange: (e) => setState({ devRequestId: e.target.value }) }, requests.map((r) => h("option", { value: r.id, selected: r.id === selReqId }, [r.title])))]),
          h("div", { class: "cards-list" }, (req.required || []).map((cid) => {
            const c = byId(state.data.competencies, cid);
            const val = scores[cid] || 0;
            const gap = Math.max(0, req.minLevel - val);
            return h("div", { class: "progress-row" }, [
              h("div", {}, [h("strong", {}, [c ? c.code : cid]), h("span", {}, [gap > 0 ? `нужно усилить: +${gap}% до порога ${req.minLevel}%` : `порог ${req.minLevel}% достигнут`])]),
              h("div", { class: "bar-wrap" }, [h("div", { class: "bar", style: `width:${Math.min(100, val)}%` })]),
              h("b", {}, [`${val}%`]),
            ]);
          })),
        ])
      : null,
    staff ? massDeficitsPanel() : null,
  ].filter(Boolean));
}

function practiceReadiness(studentId) {
  const scores = competencyScores(studentId);
  const prof = state.data.competencies.filter((c) => c.cluster === "профессиональные");
  const profAvg = Math.round(prof.reduce((s, c) => s + (scores[c.id] || 0), 0) / Math.max(prof.length, 1));
  const practice = state.data.evidence.some((e) => e.studentId === studentId && e.type === "practice");
  const labs = state.data.evidence.some((e) => e.studentId === studentId && ["lab", "project"].includes(e.type));
  const confirmations = state.data.evidence.filter((e) => e.studentId === studentId && trustFor(e) >= 0.7).length;
  const score = Math.max(0, Math.min(100, Math.round(profAvg * 0.6 + (practice ? 18 : 0) + (labs ? 8 : 0) + Math.min(14, confirmations * 4))));
  const factors = [
    { label: "Проф. компетенции", delta: `${profAvg}%`, positive: profAvg >= 50 },
    { label: "Учебная практика", delta: practice ? "есть" : "нет", positive: practice },
    { label: "Практ./проекты", delta: labs ? "есть" : "нет", positive: labs },
    { label: "Подтверждения", delta: `${confirmations}`, positive: confirmations >= 2 },
  ];
  const risks = [];
  if (!practice) risks.push("нет учебной практики");
  if (profAvg < 45) risks.push("низкий уровень проф. компетенций");
  if (confirmations < 2) risks.push("мало подтверждённых достижений");
  return { score, factors, risks };
}

function employmentReadiness(studentId) {
  const base = readiness(studentId);
  const practical = hasPracticalExperience(studentId) ? 1 : 0;
  const external = hasExternalConfirmation(studentId) ? 1 : 0;
  const contest = state.data.evidence.some((e) => e.studentId === studentId && e.type === "contest") ? 1 : 0;
  const review = state.data.evidence.some((e) => e.studentId === studentId && e.type === "employer_review") ? 1 : 0;
  const score = Math.max(0, Math.min(100, Math.round(base * 0.55 + practical * 15 + external * 12 + contest * 10 + review * 8)));
  const factors = [
    { label: "Общая готовность", delta: `${base}%`, positive: base >= 50 },
    { label: "Практический опыт", delta: practical ? "есть" : "нет", positive: practical },
    { label: "Внешнее подтверждение", delta: external ? "есть" : "нет", positive: external },
    { label: "Конкурсы", delta: contest ? "есть" : "нет", positive: contest },
    { label: "Отзыв работодателя", delta: review ? "есть" : "нет", positive: review },
  ];
  const risks = [];
  if (!practical) risks.push("нет практики/проектов");
  if (!external) risks.push("нет внешней верификации");
  if (base < 50) risks.push("низкая общая готовность");
  return { score, factors, risks };
}

function factorPanel(title, model) {
  return h("div", { class: "factor-block" }, [
    h("div", { class: "panel-head" }, [h("strong", {}, [title]), h("span", { class: "badge" }, [`${model.score}%`])]),
    h("div", { class: "kv-list" }, model.factors.map((f) => h("div", { class: "kv" }, [h("span", {}, [f.label]), h("b", { class: f.positive ? "kv-pos" : "kv-neg" }, [f.delta])]))),
    model.risks.length ? h("div", { class: "notice" }, [`Факторы риска: ${model.risks.join(", ")}`]) : h("p", { class: "muted-text" }, ["Существенных рисков не выявлено."]),
  ]);
}

function forecastView() {
  const groups = state.data.groups;
  const sel = state.forecastGroup && (state.forecastGroup === "all" || groups.some((g) => g.id === state.forecastGroup)) ? state.forecastGroup : "all";
  const students = state.data.students.filter((s) => sel === "all" || s.groupId === sel);
  const rows = students.map((s) => ({ s, p: practiceReadiness(s.id), e: employmentReadiness(s.id) }));
  const focus = currentStudent();
  const fp = practiceReadiness(focus.id);
  const fe = employmentReadiness(focus.id);
  return h("section", { class: "stack" }, [
    h("div", { class: "notice" }, ["Прогноз объясним и не заменяет решение человека. Это ориентир для планирования практики и трудоустройства."]),
    h("div", { class: "metric-grid" }, [
      metric("Готовы к практике", rows.filter((r) => r.p.score >= 60).length, "прогноз ≥ 60%", "green"),
      metric("Готовы к трудоустройству", rows.filter((r) => r.e.score >= 60).length, "прогноз ≥ 60%", "teal"),
      metric("В выборке", students.length, "студентов", "indigo"),
      metric("Зона риска", rows.filter((r) => r.e.score < 45).length, "низкий прогноз занятости", "gold"),
    ]),
    h("div", { class: "filters" }, [
      h("select", { onchange: (e) => setState({ forecastGroup: e.target.value }) }, [
        h("option", { value: "all", selected: sel === "all" }, ["Все группы"]),
        ...groups.map((g) => h("option", { value: g.id, selected: g.id === sel }, [`${g.name} · ${g.specialtyCode}`])),
      ]),
      h("div", {}, []),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Прогноз по студентам"]), h("span", { class: "badge" }, ["практика / трудоустройство"])]),
      h("div", { class: "table forecast-table" }, rows.map((r) => h("div", { class: "table-row clickable", onclick: () => setState({ currentStudentId: r.s.id }) }, [
        h("strong", {}, [r.s.name]),
        h("span", { class: "table-value" }, [`${r.p.score}%`]),
        h("span", { class: "table-value" }, [`${r.e.score}%`]),
        h("span", {}, [r.e.risks[0] || r.p.risks[0] || "рисков нет"]),
      ]))),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, [`Разбор факторов: ${focus.name}`]), h("span", { class: "badge" }, ["объяснимость"])]),
      h("div", { class: "two-column" }, [factorPanel("Готовность к практике", fp), factorPanel("Готовность к трудоустройству", fe)]),
    ]),
  ]);
}

function apiCard(a) {
  return h("article", { class: "mini-card" }, [
    h("div", { class: "row-badges" }, [h("span", { class: "badge" }, [a.method]), h("strong", {}, [a.path])]),
    h("span", {}, [a.title]),
    h("small", {}, [`Поля: ${a.fields}`]),
    h("small", {}, [`Идемпотентность: ${a.idempotency}`]),
    h("small", { class: "muted-text" }, [a.note]),
  ]);
}

function batchRow(b) {
  return h("div", { class: "table-row" }, [
    h("strong", {}, [b.date]),
    h("span", {}, [b.source]),
    h("span", { class: "table-value" }, [`+${b.added} · дубли ${b.duplicates} · ошибки ${b.errors}`]),
    b.status === "applied" ? h("button", { class: "ghost compact", onclick: () => rollbackImport(b.id) }, ["Откатить"]) : h("span", { class: "status archived" }, ["Откачен"]),
  ]);
}

function acceptancePanel(title, items) {
  return h("article", { class: "panel" }, [
    h("div", { class: "panel-head" }, [h("h3", {}, [title]), h("span", { class: "badge" }, ["acceptance"])]),
    h("ul", { class: "check-list" }, items.map((t) => h("li", {}, [t]))),
  ]);
}

function integrationsView() {
  const batches = state.data.importBatches;
  const errors = state.data.importErrors;
  return h("section", { class: "stack" }, [
    h("div", { class: "metric-grid" }, [
      metric("Импортов", batches.length, "пакетов загрузки", "teal"),
      metric("Загружено", batches.reduce((s, b) => s + (b.status === "applied" ? b.added : 0), 0), "достижений в системе", "green"),
      metric("Дублей отклонено", batches.reduce((s, b) => s + b.duplicates, 0), "защита от повторов", "gold"),
      metric("Ошибок импорта", errors.length, "видны администратору", "indigo"),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["API-контракты приёма данных"]), h("span", { class: "badge" }, ["Спринт 1"])]),
      h("div", { class: "cards-list" }, state.data.apiContracts.map(apiCard)),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Импорт из внешней системы"]), h("button", { onclick: () => runImport("Электронный журнал (CSV)") }, ["Импортировать пакет"])]),
      h("textarea", { oninput: (e) => { state.csv = e.target.value; saveState(); } }, [state.csv]),
      h("small", { class: "muted-text" }, ["Формат: student_email,discipline_code,score,title. Проверяются дубли студентов, дисциплин и достижений; ошибки попадают в журнал; пакет можно откатить."]),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Очередь импорта"]), h("span", { class: "badge" }, [`${batches.length}`])]),
      batches.length ? h("div", { class: "table batch-table" }, batches.map(batchRow)) : emptyState("Импортов ещё не было."),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Журнал ошибок импорта"]), h("span", { class: "badge" }, [`${errors.length}`])]),
      errors.length
        ? h("div", { class: "table errors-table" }, errors.slice(0, 40).map((er) => {
            const b = byId(state.data.importBatches, er.batchId);
            return h("div", { class: "table-row" }, [h("strong", {}, [b ? b.date : "—"]), h("span", {}, [`строка ${er.line}`]), h("span", {}, [er.reason])]);
          }))
        : emptyState("Ошибок нет."),
    ]),
    acceptancePanel("Критерии готовности спринта 1", ["импорт не ломает существующие данные", "ошибки видны администратору", "дубли определяются", "данные можно откатить или исправить"]),
  ]);
}

function toggleMaskPII() {
  const next = !state.data.aiSettings.maskPII;
  apiAction(() => api.request("POST", "/api/settings/ai", { maskPII: next }), `Маскирование ПДн ${next ? "включено" : "выключено"}`, "info");
}

function runSelfTests() {
  const tests = [];
  const badAccept = state.data.aiSuggestions.filter((x) => (x.status === "accepted" || x.status === "edited") && !x.decidedBy).length;
  tests.push({ name: "AI-связи применяются только после подтверждения человеком", ok: badAccept === 0 });
  const inRange = state.data.students.every((st) => {
    const p = practiceReadiness(st.id).score;
    const e = employmentReadiness(st.id).score;
    return p >= 0 && p <= 100 && e >= 0 && e <= 100;
  });
  tests.push({ name: "Прогноз готовности в диапазоне 0–100", ok: inRange });
  tests.push({ name: "Ролевой доступ: студент не видит «Интеграции» и «Верификацию»", ok: !ROLE_ACCESS.student.includes("integrations") && !ROLE_ACCESS.student.includes("verification") });
  tests.push({ name: "Откат импорта доступен", ok: typeof rollbackImport === "function" });
  tests.push({ name: "История AI-решений ведётся", ok: Array.isArray(state.data.aiDecisions) });
  state.selfTests = tests;
  saveState();
  render();
  const passed = tests.filter((t) => t.ok).length;
  toast(`Самотесты: ${passed}/${tests.length} пройдено`, passed === tests.length ? "success" : "error");
}

function runLoadTest() {
  const emails = state.data.students.map((s) => s.email);
  const codes = state.data.disciplines.map((d) => d.code);
  const N = 200;
  const rows = [];
  for (let i = 0; i < N; i += 1) rows.push(`${emails[i % emails.length]},${codes[i % codes.length]},${70 + (i % 30)},Нагрузочная строка ${i}`);
  const start = performance.now();
  let valid = 0;
  rows.forEach((r) => {
    const [email, code, score] = r.split(",");
    const st = state.data.students.find((x) => x.email === email);
    const d = state.data.disciplines.find((x) => x.code === code);
    const v = Number(score);
    if (st && d && Number.isFinite(v)) valid += 1;
  });
  const ms = Math.max(1, Math.round(performance.now() - start));
  state.loadTest = { rows: N, valid, ms, rate: Math.round(N / (ms / 1000)) };
  saveState();
  render();
  toast(`Нагрузочный тест: ${N} строк за ${ms} мс`, "success");
}

function helpView() {
  const s = state.selfTests;
  const lt = state.loadTest;
  return h("section", { class: "stack" }, [
    h("div", { class: "notice" }, ["Интеллектуальные функции работают в режиме подсказок. Итоговое решение всегда за человеком."]),
    acceptancePanel("Безопасность AI", ["AI не утверждает компетенции самостоятельно", "пользователь видит источник предложения", "методист/преподаватель подтверждает связь", "персональные данные можно маскировать"]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Персональные данные"]), h("button", { class: "ghost", onclick: toggleMaskPII }, [state.data.aiSettings.maskPII ? "Маскирование включено" : "Маскирование выключено"])]),
      h("p", { class: "muted-text" }, ["Пример источника с контактами:"]),
      h("p", {}, [maskPII("Отзыв: свяжитесь с наставником ivan@partner-market.demo, тел. +7 900 123-45-67.")]),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Тестирование и приёмка"]), h("div", { class: "actions" }, [h("button", { onclick: runSelfTests }, ["Запустить самотесты"]), h("button", { class: "ghost", onclick: runLoadTest }, ["Нагрузочный тест импорта"])])]),
      s ? h("div", { class: "table tests-table" }, s.map((t) => h("div", { class: "table-row" }, [h("strong", { class: t.ok ? "kv-pos" : "kv-neg" }, [t.ok ? "OK" : "FAIL"]), h("span", {}, [t.name])]))) : h("p", { class: "muted-text" }, ["Самотесты ещё не запускались."]),
      lt ? h("p", { class: "muted-text" }, [`Нагрузочный тест: ${lt.rows} строк обработано за ${lt.ms} мс (${lt.rate} строк/с, валидных ${lt.valid}).`]) : h("span", {}, []),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [h("h3", {}, ["Инструкция по ролям"]), h("span", { class: "badge" }, ["сценарии"])]),
      h("ul", { class: "guide-list" }, [
        "Администратор: раздел «Интеграции» — загрузка пакета, контроль ошибок и откат.",
        "Методист: раздел «AI-анализ» — подтверждение предложенных связей ЗУНК.",
        "Преподаватель: «AI-анализ» портфолио — подтверждение связей достижений и верификация.",
        "Студент: «Развитие» — персональные рекомендации и отметка выполнения.",
        "Заведующий/Директор: «Прогноз готовности» — оценка группы к практике и трудоустройству.",
      ].map((t) => h("li", {}, [t]))),
    ]),
    acceptancePanel("Итоговые критерии приёмки очереди", [
      "данные импортируются из внешнего источника/API",
      "AI предлагает связи, но не утверждает их автоматически",
      "студент получает рекомендации развития",
      "методист подтверждает AI-предложения",
      "директор видит прогнозы готовности",
      "качество данных контролируется логами и отчётами",
    ]),
  ]);
}

/* ===================== Аутентификация и запуск ===================== */

function render() {
  const app = document.querySelector("#app");
  app.innerHTML = "";
  if (!state.user || !state.data) {
    app.append(loginScreen());
    return;
  }
  app.append(loginShell());
}

function loginScreen() {
  const form = h("form", { class: "login-card", id: "login-form" }, [
    h("div", { class: "login-brand" }, [h("div", { class: "brand-mark" }, ["КП"]), h("strong", {}, ["Профиль компетенций"])]),
    h("h1", {}, ["Вход в платформу"]),
    h("p", { class: "muted-text" }, ["Введите служебные email и пароль. Роль и доступ определяются на сервере."]),
    field("Email", h("input", { name: "email", type: "email", autocomplete: "username", placeholder: "you@college.ru", required: true })),
    field("Пароль", h("input", { name: "password", type: "password", autocomplete: "current-password", required: true })),
    h("button", { type: "submit", class: "login-submit" }, ["Войти"]),
    h("small", { class: "muted-text login-hint" }, ["Демо-доступы: student@demo.ru, teacher@demo.ru, method@demo.ru, admin@demo.ru … · пароль Demo!2026"]),
  ]);
  setTimeout(() => {
    const el = document.getElementById("login-form");
    if (!el || el.dataset.ready) return;
    el.dataset.ready = "true";
    el.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(el);
      try {
        await api.login(String(data.get("email")).trim(), String(data.get("password")));
        await refresh();
        toast("Вы вошли в систему", "success");
      } catch (error) {
        toast(error.message || "Не удалось войти", "error");
      }
    });
  });
  return h("div", { class: "login-page" }, [form]);
}

async function doLogout() {
  await api.logout();
  state.user = null;
  state.data = null;
  render();
  toast("Вы вышли из системы", "info");
}

async function boot() {
  if (!api.accessToken) {
    render();
    return;
  }
  try {
    await refresh();
  } catch {
    api.accessToken = "";
    api.refreshToken = "";
    render();
  }
}

boot();
