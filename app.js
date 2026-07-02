const STORAGE_KEY = "competency-platform-state-v1";

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

const state = loadState();

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return normalizeState({
      data: structuredClone(seedData),
      role: "student",
      currentStudentId: "s1",
      view: "dashboard",
      query: "",
      selectedDiscipline: "all",
      csv: "student_email,discipline_code,score,title\nstudent@demo.ru,ОП.05,90,Бизнес-гипотеза торговой точки",
    });
  }
  return normalizeState(JSON.parse(stored));
}

function normalizeState(raw) {
  const next = raw || {};
  next.data = next.data || {};
  const defaults = structuredClone(seedData);
  Object.entries(defaults).forEach(([key, value]) => {
    if (next.data[key] == null) next.data[key] = value;
  });
  next.data.roles = mergeById(next.data.roles, defaults.roles);
  next.data.students = mergeById(next.data.students, defaults.students);
  next.data.typeWeights = { ...defaults.typeWeights, ...(next.data.typeWeights || {}) };
  next.data.statusWeights = { ...defaults.statusWeights, ...(next.data.statusWeights || {}) };
  next.role ||= "student";
  next.currentStudentId ||= "s1";
  next.view ||= "dashboard";
  next.query ||= "";
  next.selectedDiscipline ||= "all";
  next.csv ||= "student_email,discipline_code,score,title\nstudent@demo.ru,ОП.05,90,Бизнес-гипотеза торговой точки";
  return next;
}

function mergeById(current = [], defaults = []) {
  const merged = [...current];
  defaults.forEach((item) => {
    const existing = merged.find((candidate) => candidate.id === item.id);
    if (existing) Object.assign(existing, { ...item, ...existing });
    else merged.push(item);
  });
  return merged;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setState(patch) {
  Object.assign(state, patch);
  saveState();
  render();
}

function byId(items, id) {
  return items.find((item) => item.id === id);
}

function currentRole() {
  return state.data.roles.find((role) => role.id === state.role);
}

function visibleStudents() {
  if (state.role === "student") return state.data.students.filter((student) => student.id === currentRole().userId);
  if (state.role === "employer") return state.data.students.filter((student) => canEmployerSeeStudent(student));
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
  return state.data.employers.find((employer) => employer.id === currentRole().userId) || state.data.employers[0];
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

function render() {
  const app = document.querySelector("#app");
  app.innerHTML = "";
  app.append(loginShell());
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

function sidebar() {
  const nav = [
    ["dashboard", "Профиль"],
    ["competencies", "Карта компетенций"],
    ["education", "Образовательный процесс"],
    ["evidence", "Доказательства"],
    ["verification", "Верификация"],
    ["employers", "Работодатели"],
    ["analytics", "Аналитика"],
    ["methodology", "Методика"],
    ["reports", "Отчеты"],
    ["admin", "Справочники"],
  ].filter(([id]) => {
    if (state.role === "student") return !["verification", "admin", "methodology"].includes(id);
    if (state.role === "employer") return ["dashboard", "employers", "reports"].includes(id);
    if (state.role === "teacher") return !["admin", "methodology"].includes(id);
    if (state.role === "methodologist") return !["employers"].includes(id);
    return true;
  });

  return h("aside", { class: "sidebar" }, [
    h("div", { class: "brand" }, [
      h("div", { class: "brand-mark" }, ["КП"]),
      h("div", {}, [
        h("strong", {}, ["Профиль компетенций"]),
        h("span", {}, ["пилотная платформа"]),
      ]),
    ]),
    h("div", { class: "role-card" }, [
      h("label", {}, ["Тестовая роль"]),
      h("select", {
        onchange: (event) => {
          const role = event.target.value;
          const roleMeta = state.data.roles.find((item) => item.id === role);
          setState({ role, currentStudentId: role === "student" ? roleMeta.userId : state.currentStudentId, view: role === "employer" ? "employers" : "dashboard" });
        },
      }, state.data.roles.map((role) => h("option", { value: role.id, selected: role.id === state.role }, [`${role.title}`]))),
      h("small", {}, [currentRole().account]),
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
      h("span", { class: "eyebrow" }, [state.data.college.department]),
      h("h1", {}, [titleByView()]),
    ]),
    h("div", { class: "toolbar" }, [
      h("select", {
        onchange: (event) => setState({ currentStudentId: event.target.value }),
        disabled: state.role === "student",
      }, state.data.students.map((student) => h("option", { value: student.id, selected: student.id === state.currentStudentId }, [student.name]))),
      h("button", { class: "ghost", onclick: () => window.print() }, ["Экспорт PDF"]),
      h("button", { onclick: resetDemo }, ["Сбросить демо"]),
    ]),
  ]);
}

function titleByView() {
  return {
    dashboard: "Рабочий кабинет",
    competencies: "Компетентностная карта",
    education: "Образовательный процесс",
    evidence: "Доказательства",
    verification: "Очередь верификации",
    employers: "Работодатели и подбор",
    analytics: "Аналитика пилота",
    methodology: "Методическое покрытие",
    reports: "Отчеты и экспорт",
    admin: "Справочники и роли",
  }[state.view];
}

function viewContent() {
  return {
    dashboard: dashboardView,
    competencies: competenciesView,
    education: educationView,
    evidence: evidenceView,
    verification: verificationView,
    employers: employersView,
    analytics: analyticsView,
    methodology: methodologyView,
    reports: reportsView,
    admin: adminView,
  }[state.view]();
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
        h("p", {}, ["Профиль считается из образовательных событий, доказательств, весов дисциплин и статуса верификации. Отклоненные материалы не повышают уровень."]),
        h("div", { class: "hero-stats" }, [
          h("span", {}, ["ЗУНК-модель"]),
          h("span", {}, ["практика и проекты"]),
          h("span", {}, ["верификация"]),
        ]),
      ]),
      ring(readiness(student.id), "готовность"),
    ]),
      h("div", { class: "metric-grid" }, [
      metric("Доказательств", studentEvidence.length, "оценки, практики, проекты", "teal"),
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
        ...(studentEvidence.length ? studentEvidence.slice(0, 6).map(evidenceItem) : [emptyState("Пока нет доказательств. Нажмите «Добавить», чтобы создать первое достижение.")]),
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
    h("div", { class: "notice" }, [`Пилот наполнен по архиву специальности ${state.data.college.specialty.code} ${state.data.college.specialty.name}: дисциплины, профессиональные модули, учебная и производственная практика.`]),
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
        h("h3", {}, ["Добавить доказательство"]),
        h("span", { class: "badge" }, ["Evidence"]),
      ]),
      evidenceForm(),
    ]),
    h("article", { class: "panel" }, [
      h("div", { class: "panel-head" }, [
        h("h3", {}, ["Импорт оценок CSV"]),
        h("button", { class: "ghost", onclick: importCsv }, ["Импортировать"]),
      ]),
      h("textarea", { oninput: (event) => { state.csv = event.target.value; saveState(); } }, [state.csv]),
      h("small", {}, ["Формат: student_email,discipline_code,score,title"]),
    ]),
    list.length
      ? h("div", { class: "cards-list" }, list.sort((a, b) => b.date.localeCompare(a.date)).map(evidenceItem))
      : emptyState("Доказательств пока нет. Добавьте вручную или импортируйте оценки из CSV."),
  ]);
}

function verificationView() {
  const queue = state.data.evidence.filter((item) => ["submitted", "needs_revision"].includes(item.status));
  const reviews = state.data.employerReviews.filter((item) => item.status === "submitted");
  return h("section", { class: "stack" }, [
    h("div", { class: "notice" }, ["Преподаватель подтверждает учебные результаты, заведующий кафедрой - значимые достижения, методист - корректность связи с ЗУНК, работодатель - практики."]),
    queue.length
      ? h("div", { class: "cards-list" }, queue.map((item) => verificationItem(item)))
      : emptyState("Очередь пуста — все доказательства обработаны."),
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
      h("div", { class: "cards-list" }, state.data.students.map(publicPortfolioCard)),
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
      metric("Доказательств", analytics.evidenceCount, "в пилотной базе", "green"),
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
      h("div", { class: "panel-head" }, [h("h3", {}, ["Роли и доступ"]), h("span", { class: "badge" }, ["RBAC MVP"])]),
      h("div", { class: "role-grid" }, state.data.roles.map((role) => h("div", { class: "mini-card" }, [
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
    student: "свои данные, портфолио, доказательства",
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
      state.data.employerRequests.push({
        id: `req${Date.now()}`,
        employerId: currentEmployer().id,
        title,
        specialtyCode: state.data.college.specialty.code,
        course: Number(data.get("course")),
        required,
        desired,
        minLevel: Number(data.get("minLevel")),
        format: data.get("format"),
        status: "active",
        createdAt: new Date().toISOString().slice(0, 10),
      });
      saveState();
      render();
      toast(`Запрос «${title}» создан`, "success");
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
      onclick: () => {
        student.publicProfile = !student.publicProfile;
        saveState();
        render();
        toast(`Публичное портфолио ${student.publicProfile ? "открыто" : "закрыто"}`, "info");
      },
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
      const evidence = {
        id: `e${Date.now()}`,
        studentId: data.get("studentId"),
        disciplineId: data.get("disciplineId"),
        title,
        type: data.get("type"),
        score,
        date: new Date().toISOString().slice(0, 10),
        status: state.role === "student" ? "submitted" : "verified_by_teacher",
        verifier: state.role === "student" ? "" : currentRole().userId,
        source: "ручной ввод",
      };
      state.data.evidence.push(evidence);
      saveState();
      render();
      toast(`Доказательство «${title}» добавлено`, "success");
    });
  });
  return h("form", { id: formId, class: "form-grid" }, [
    field("Студент", h("select", { name: "studentId" }, visibleStudents().map((student) => h("option", { value: student.id, selected: student.id === state.currentStudentId }, [student.name])))),
    field("Дисциплина", h("select", { name: "disciplineId" }, state.data.disciplines.map((discipline) => h("option", { value: discipline.id }, [`${discipline.code} ${discipline.name}`])))),
    field("Тип", h("select", { name: "type" }, Object.entries(typeLabels).map(([value, label]) => h("option", { value }, [label])))),
    field("Балл", h("input", { name: "score", type: "number", min: "0", max: "100", value: "85" })),
    field("Событие", h("input", { name: "title", value: "Новое доказательство" }), "wide"),
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
  item.status = status;
  item.verifier = currentRole().userId;
  saveState();
  render();
  toast(`«${item.title}»: ${statusLabels[status] || status}`, status === "rejected" ? "error" : "success");
}

function moderateEmployer(id) {
  const employer = byId(state.data.employers, id);
  employer.status = employer.status === "moderated" ? "pending" : "moderated";
  saveState();
  render();
  toast(`${employer.name}: ${employer.status === "moderated" ? "проверка подтверждена" : "проверка снята"}`, "info");
}

function inviteStudent(requestId, studentId) {
  const request = byId(state.data.employerRequests, requestId);
  state.data.invitations.push({
    id: `inv${Date.now()}`,
    requestId,
    employerId: request.employerId,
    studentId,
    type: request.format.includes("стаж") ? "internship" : "practice",
    status: "sent",
    date: new Date().toISOString().slice(0, 10),
    note: `Приглашение по запросу «${request.title}»`,
  });
  saveState();
  render();
  toast(`${byId(state.data.students, studentId).name}: приглашение отправлено`, "success");
}

function verifyEmployerReview(id) {
  const review = byId(state.data.employerReviews, id);
  review.status = "verified_by_employer";
  state.data.evidence.push({
    id: `e${Date.now()}`,
    studentId: review.studentId,
    disciplineId: review.disciplineId,
    title: `Отзыв работодателя: ${byId(state.data.employers, review.employerId).name}`,
    type: "employer_review",
    score: review.score,
    date: review.date,
    status: "verified_by_employer",
    verifier: review.employerId,
    source: "отзыв работодателя",
  });
  saveState();
  render();
  toast(`Отзыв подтверждён и добавлен в профиль ${byId(state.data.students, review.studentId).name}`, "success");
}

function markEmployerReview(id, status) {
  const review = byId(state.data.employerReviews, id);
  review.status = status;
  saveState();
  render();
  toast(`Отзыв отправлен на доработку`, "info");
}

function togglePortfolioAccess(studentId) {
  const student = byId(state.data.students, studentId);
  const opened = canEmployerSeeStudent(student);
  student.publicProfile = !opened;
  student.portfolioAccess = opened ? "college" : "partners";
  saveState();
  render();
  toast(`${student.name}: портфолио ${opened ? "ограничено" : "открыто партнёрам"}`, "info");
}

function addEvidenceQuick() {
  state.data.evidence.push({
    id: `e${Date.now()}`,
    studentId: state.currentStudentId,
    disciplineId: "pm01",
    title: "Наблюдение преподавателя: торговая ситуация",
    type: "practice",
    score: 87,
    date: new Date().toISOString().slice(0, 10),
    status: "submitted",
    verifier: "",
    source: "быстрое добавление",
  });
  saveState();
  render();
  toast("Добавлено доказательство-наблюдение", "success");
}

function importCsv() {
  const rows = state.csv.trim().split(/\n+/).slice(1).filter((row) => row.trim());
  let imported = 0;
  let skipped = 0;
  rows.forEach((row) => {
    const [email, code, score, ...titleParts] = row.split(",");
    const student = state.data.students.find((item) => item.email.trim() === email?.trim());
    const discipline = state.data.disciplines.find((item) => item.code.toLowerCase() === code?.trim().toLowerCase());
    const value = Number(score);
    if (!student || !discipline || !Number.isFinite(value)) {
      skipped += 1;
      return;
    }
    state.data.evidence.push({
      id: `e${Date.now()}${Math.random().toString(16).slice(2)}`,
      studentId: student.id,
      disciplineId: discipline.id,
      title: titleParts.join(",").trim() || "Импортированная оценка",
      type: "grade",
      score: value,
      date: new Date().toISOString().slice(0, 10),
      status: "verified_by_teacher",
      verifier: "t1",
      source: "CSV импорт",
    });
    imported += 1;
  });
  saveState();
  render();
  if (!imported && !skipped) {
    toast("Нет строк для импорта", "info");
  } else {
    toast(`Импортировано: ${imported}${skipped ? `, пропущено: ${skipped}` : ""}`, skipped && !imported ? "error" : "success");
  }
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

function resetDemo() {
  if (!confirm("Сбросить демо? Все внесённые изменения будут удалены и данные вернутся к исходным.")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

render();
