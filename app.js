const appRoot = document.querySelector("#app");
const state = { user: null, section: "overview", authMode: "login", query: "", status: "", departments: [], searchTimer: null, page: 1 };
const PAGE_SIZE = 8;
const roleNames = { admin: "Administrator", doctor: "Care team", patient: "Patient" };
const sectionNames = { overview: "Overview", appointments: "Appointments", doctors: "Care team", patients: "Patients", records: "Patient records", billing: "Billing", departments: "Departments", reports: "Reports", profile: "My profile" };
const icons = { overview: "layout-dashboard", appointments: "calendar-days", doctors: "stethoscope", patients: "users-round", records: "clipboard-plus", billing: "receipt-text", departments: "building-2", reports: "chart-no-axes-combined", profile: "user-round", logout: "log-out", add: "plus", search: "search", calendar: "calendar-days", heart: "heart-pulse", brain: "brain", bone: "bone", child: "baby", spark: "sparkles", cross: "cross", flower: "flower-2" };
const navigation = {
  admin: [["overview", "Overview"], ["appointments", "Appointments"], ["doctors", "Care team"], ["patients", "Patients"], ["records", "Patient records"], ["billing", "Billing"], ["departments", "Departments"], ["reports", "Reports"], ["profile", "My profile"]],
  doctor: [["overview", "Overview"], ["appointments", "Appointments"], ["patients", "My patients"], ["records", "Patient records"], ["profile", "My profile"]],
  patient: [["overview", "Overview"], ["doctors", "Find a doctor"], ["appointments", "Appointments"], ["records", "My records"], ["billing", "Billing"], ["profile", "My profile"]],
};

function icon(name, extra = "") {
  return `<i data-lucide="${name}"${extra ? ` class="${extra}"` : ""} aria-hidden="true"></i>`;
}

function drawIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function dateLabel(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  if (!value) return "Not set";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat("en-US", options).format(parsed);
}

function statusPill(value) {
  return `<span class="status-pill ${escapeHtml(value)}">${escapeHtml(value)}</span>`;
}

async function api(path, options = {}) {
  const config = { credentials: "same-origin", ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } };
  const response = await fetch(path, config);
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Something went wrong. Please try again.");
  return data;
}

function toast(message, kind = "success") {
  const region = document.querySelector("#toast-region");
  const item = document.createElement("div");
  item.className = `toast ${kind}`;
  item.innerHTML = `${icon(kind === "success" ? "circle-check" : "circle-alert")}<span>${escapeHtml(message)}</span>`;
  region.append(item);
  drawIcons();
  window.setTimeout(() => item.remove(), 4200);
}

function showAuth(mode = "login") {
  state.authMode = mode;
  const registering = mode === "register";
  appRoot.innerHTML = `
    <section class="auth-layout">
      <div class="auth-art">
        <div class="auth-brand"><span class="brand-mark">${icon("plus")}</span><span>Northstar Health</span></div>
        <div class="auth-message"><h1>Care that feels connected.</h1><p>Thoughtful care, clear next steps, and your health team in one place.</p></div>
        <div class="auth-caption">Northstar Medical Centre · Patient services</div>
      </div>
      <div class="auth-panel">
        <p class="eyebrow">${registering ? "Patient registration" : "Welcome back"}</p>
        <h2>${registering ? "Your care, in view." : "Good to see you."}</h2>
        <p>${registering ? "Create your patient account to manage appointments and care records." : "Sign in to continue to your secure care workspace."}</p>
        <form id="auth-form" class="auth-form">
          ${registering ? `<div class="field"><label for="auth-name">Full name</label><input id="auth-name" name="name" autocomplete="name" minlength="2" maxlength="100" placeholder="e.g. Sam Taylor" required></div>` : ""}
          <div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
          ${registering ? `<div class="form-grid"><div class="field"><label for="auth-phone">Phone</label><input id="auth-phone" name="phone" autocomplete="tel" placeholder="Optional"></div><div class="field"><label for="auth-dob">Date of birth</label><input id="auth-dob" name="date_of_birth" type="date"></div></div>` : ""}
          <div class="field"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="${registering ? "new-password" : "current-password"}" minlength="${registering ? "8" : "1"}" placeholder="${registering ? "At least 8 characters" : "Enter your password"}" required></div>
          <button class="button button-primary" type="submit">${registering ? "Create patient account" : "Sign in"} ${icon("arrow-right")}</button>
        </form>
        <div class="auth-switch">${registering ? "Already registered?" : "New to Northstar?"} <button id="auth-switch" type="button">${registering ? "Sign in" : "Create patient account"}</button></div>
        ${registering ? "" : `<section class="demo-access"><h3>Demo access</h3><div class="demo-grid">${[["Admin", "admin@hospital.demo"], ["Doctor", "doctor@hospital.demo"], ["Patient", "patient@hospital.demo"]].map(([label, email]) => `<button class="demo-button" type="button" data-demo="${email}"><strong>${label}</strong><span>Demo account</span></button>`).join("")}</div><p class="field-hint" style="margin:10px 0 0">Password: <strong>Welcome123!</strong></p></section>`}
      </div>
    </section>`;
  document.querySelector("#auth-switch").addEventListener("click", () => showAuth(registering ? "login" : "register"));
  document.querySelectorAll("[data-demo]").forEach((button) => button.addEventListener("click", () => {
    document.querySelector("#auth-email").value = button.dataset.demo;
    document.querySelector("#auth-password").value = "Welcome123!";
    document.querySelector("#auth-password").focus();
  }));
  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    const original = button.innerHTML;
    button.innerHTML = `<span class="spinner"></span> Please wait`;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = await api(registering ? "/api/auth/register" : "/api/auth/login", { method: "POST", body: JSON.stringify(data) });
      state.user = result.user;
      state.section = "overview";
      state.query = "";
      if (registering) toast("Your patient account is ready.");
      await showApp();
    } catch (error) {
      toast(error.message, "error");
      button.disabled = false;
      button.innerHTML = original;
    }
  });
  drawIcons();
}

async function showApp() {
  if (!state.departments.length) {
    try { state.departments = await api("/api/departments"); } catch { state.departments = []; }
  }
  appRoot.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand"><span class="brand-mark">${icon("plus")}</span><span>Northstar Health<small>Hospital services</small></span></div>
        <div class="nav-label">Workspace</div>
        <nav class="nav-list" aria-label="Main navigation">${navigation[state.user.role].map(([key, label]) => `<button class="nav-link ${state.section === key ? "active" : ""}" type="button" data-route="${key}">${icon(icons[key] || "circle")}<span>${label}</span></button>`).join("")}</nav>
        <div class="sidebar-bottom"><div class="sidebar-user"><span class="avatar">${escapeHtml(initials(state.user.name))}</span><span class="sidebar-user-copy"><strong>${escapeHtml(state.user.name)}</strong><small>${escapeHtml(roleNames[state.user.role])}</small></span><button class="logout-button" id="logout" type="button" aria-label="Sign out" title="Sign out">${icon("log-out")}</button></div></div>
      </aside>
      <section class="main-area">
        <header class="topbar"><div class="topbar-left"><button class="menu-toggle" id="menu-toggle" aria-label="Open navigation">${icon("menu")}</button><span class="topbar-title">Workspace <span aria-hidden="true">/</span> <strong id="breadcrumb">${escapeHtml(sectionNames[state.section] || "Overview")}</strong></span></div><div class="topbar-tools"><label class="topbar-search">${icon("search")}<input id="global-search" type="search" placeholder="Search this view" value="${escapeHtml(state.query)}" aria-label="Search this view"></label><span class="topbar-date">${icon("calendar")} ${new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</span></div></header>
        <main class="content" id="content"><div id="view"><div class="skeleton"></div><div class="skeleton"></div></div></main>
      </section>
    </div>
    <div id="modal-root"></div>`;
  document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.route)));
  document.querySelector("#logout").addEventListener("click", signOut);
  document.querySelector("#menu-toggle").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));
  document.querySelector("#global-search").addEventListener("input", (event) => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.query = event.target.value.trim();
      state.page = 1;
      renderSection();
    }, 250);
  });
  await renderSection();
}

async function signOut() {
  try { await api("/api/auth/logout", { method: "POST" }); } catch { /* Clear the local view even if the network has dropped. */ }
  state.user = null;
  state.section = "overview";
  state.query = "";
  showAuth();
}

async function navigate(section) {
  state.section = section;
  state.query = "";
  state.page = 1;
  document.querySelector("#sidebar")?.classList.remove("open");
  document.querySelectorAll("[data-route]").forEach((button) => button.classList.toggle("active", button.dataset.route === section));
  document.querySelector("#breadcrumb").textContent = sectionNames[section] || section;
  const search = document.querySelector("#global-search");
  if (search) search.value = "";
  await renderSection();
}

function heading(title, description, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${escapeHtml(roleNames[state.user.role])}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${action ? `<div class="heading-actions">${action}</div>` : ""}</div>`;
}

function sectionButton(label, action, iconName = "plus", kind = "button-primary") {
  return `<button class="button ${kind}" type="button" data-action="${action}">${icon(iconName)}${escapeHtml(label)}</button>`;
}

async function renderSection() {
  const view = document.querySelector("#view");
  if (!view) return;
  view.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
  try {
    const pages = { overview: renderOverview, appointments: renderAppointments, doctors: renderDoctors, patients: renderPatients, records: renderRecords, billing: renderBilling, departments: renderDepartments, reports: renderReports, profile: renderProfile };
    await (pages[state.section] || renderOverview)();
  } catch (error) {
    view.innerHTML = `<section class="panel"><div class="empty-state">${icon("circle-alert")}<strong>We couldn't load this view</strong><p>${escapeHtml(error.message)}</p><button class="button button-secondary" type="button" data-action="retry">Try again</button></div></section>`;
    drawIcons();
  }
  bindActions();
}

function setView(markup) {
  const view = document.querySelector("#view");
  if (view) view.innerHTML = markup;
  drawIcons();
}

function emptyState(title, detail, symbol = "calendar-days") {
  return `<div class="empty-state">${icon(symbol)}<strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

function paginate(items) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const first = (state.page - 1) * PAGE_SIZE;
  const visible = items.slice(first, first + PAGE_SIZE);
  const controls = items.length > PAGE_SIZE ? `<nav class="pagination" aria-label="Table pages"><span>Showing ${first + 1}–${Math.min(first + PAGE_SIZE, items.length)} of ${items.length}</span><div><button class="icon-button" type="button" data-action="previous-page" aria-label="Previous page" ${state.page <= 1 ? "disabled" : ""}>${icon("chevron-left")}</button><span>Page ${state.page} of ${pages}</span><button class="icon-button" type="button" data-action="next-page" aria-label="Next page" ${state.page >= pages ? "disabled" : ""}>${icon("chevron-right")}</button></div></nav>` : "";
  return { items: visible, controls };
}

function statCard(title, value, note, symbol, tone = "") {
  return `<article class="stat-card"><div class="stat-top"><span>${escapeHtml(title)}</span><span class="stat-icon ${tone}">${icon(symbol)}</span></div><div class="stat-value">${escapeHtml(value)}</div><div class="stat-foot">${escapeHtml(note)}</div></article>`;
}

function appointmentRows(items, compact = false, emptyDetail = "", emptyTitle = "No appointments yet") {
  if (!items.length) return emptyState(emptyTitle, emptyDetail || (state.user.role === "patient" ? "Appointments you book will appear here." : "Your upcoming schedule will appear here."));
  return `<div class="appointment-list">${items.map((item) => {
    const d = new Date(`${item.appointment_date}T12:00:00`);
    const name = state.user.role === "patient" ? item.doctor_name : item.patient_name;
    const dateBits = `<span>${escapeHtml(new Intl.DateTimeFormat("en-US", { month: "short" }).format(d))}</span><strong>${escapeHtml(new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(d))}</strong>`;
    return `<div class="appointment-item"><div class="date-tile">${dateBits}</div><div class="appointment-copy"><strong>${escapeHtml(name || "Patient visit")}</strong><span>${escapeHtml(item.department)} · ${escapeHtml(item.appointment_time)} · ${escapeHtml(item.specialization || "Consultation")}</span></div>${compact ? statusPill(item.status) : `<span class="appointment-time">${statusPill(item.status)}</span>`}</div>`;
  }).join("")}</div>`;
}

function panel(title, body, action = "") {
  return `<section class="panel"><header class="panel-header"><div><h2>${escapeHtml(title)}</h2></div>${action}</header><div class="panel-body">${body}</div></section>`;
}

function monthlyBars(monthly, compact = false) {
  if (!monthly.length) return emptyState("No appointment activity yet", "Monthly totals will appear as visits are recorded.", "chart-no-axes-combined");
  const max = Math.max(1, ...monthly.map((row) => row.count));
  const bars = monthly.map((row) => `<div class="bar-group"><div class="bar-track"><span class="bar-fill" style="height:${Math.max(3, Math.round(row.count / max * 100))}%" title="${row.count} appointments"></span></div><span class="bar-label">${escapeHtml(new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${row.month}-15T12:00:00`)))}</span></div>`).join("");
  return `<div class="bar-chart ${compact ? "compact" : ""}">${bars}</div>`;
}

async function renderOverview() {
  const [dashboard, team, report, patientRecords, patientBills] = await Promise.all([
    api("/api/dashboard"),
    state.user.role === "admin" || state.user.role === "patient" ? api("/api/doctors") : Promise.resolve([]),
    state.user.role === "admin" ? api("/api/reports") : Promise.resolve(null),
    state.user.role === "patient" ? api("/api/records") : Promise.resolve([]),
    state.user.role === "patient" ? api("/api/bills") : Promise.resolve([]),
  ]);
  const stats = dashboard.stats;
  const todayAppointments = dashboard.today_appointments || [];
  let cards;
  const firstName = state.user.name.replace(/^Dr\.?\s*/i, "").split(" ")[0];
  let title = `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${firstName}`;
  let description = "A clear view of the care happening across your workspace.";
  if (state.user.role === "admin") {
    cards = statCard("Registered patients", stats.patients, "Active patient accounts", "users-round", "blue") + statCard("Care team", stats.doctors, "Active doctors", "stethoscope") + statCard("Total appointments", stats.appointments, "All recorded visits", "calendar-days", "amber") + statCard("Collected revenue", money(stats.revenue), "Payments recorded", "wallet", "coral");
    description = "Your hospital at a glance. Here is what needs attention today.";
  } else if (state.user.role === "doctor") {
    cards = statCard("Upcoming visits", stats.upcoming, "Scheduled from today", "calendar-days", "amber") + statCard("Patients seen", stats.patients, "Across your appointments", "users-round", "blue") + statCard("Completed visits", stats.completed, "Clinical encounters", "clipboard-check", "coral");
    description = `${state.user.specialization || "Your care team"} · ${state.user.department || "Northstar Medical Centre"}`;
  } else {
    cards = statCard("Upcoming visits", stats.upcoming, "Your scheduled appointments", "calendar-days", "amber") + statCard("Patient records", stats.records, "Diagnoses and prescriptions", "clipboard-plus", "blue") + statCard("Open bills", stats.unpaid, "Payments requiring attention", "receipt-text", "coral");
    description = "Your care, appointments, and next steps in one place.";
  }
  const nextTitle = state.user.role === "admin" ? "Recent appointments" : state.user.role === "doctor" ? "Your schedule" : "Your appointments";
  const actions = state.user.role === "patient" ? `${sectionButton("Book a visit", "book", "plus")}<button class="button button-secondary" type="button" data-route="profile">${icon("user-round")} Profile</button>` : state.user.role === "doctor" ? `<button class="button button-secondary" type="button" data-route="patients">${icon("users-round")} Patient list</button>` : `<button class="button button-primary" type="button" data-route="appointments">Manage appointments ${icon("arrow-right")}</button>`;
  const nextSection = state.user.role === "admin" ? "appointments" : state.user.role === "doctor" ? "appointments" : "appointments";
  const teamPanel = state.user.role === "doctor" ? panel("Today's overview", `<div class="snapshot-metrics"><div><span>Visits today</span><strong>${todayAppointments.length}</strong></div><div><span>Awaiting confirmation</span><strong>${todayAppointments.filter((item) => item.status === "pending").length}</strong></div><div><span>Confirmed</span><strong>${todayAppointments.filter((item) => item.status === "confirmed").length}</strong></div></div>`, `<span class="status-pill confirmed">${escapeHtml(state.user.department || "Care team")}</span>`) : panel(state.user.role === "patient" ? "Your care team" : "Department activity", state.user.role === "patient" ? team.slice(0, 4).map((doctor) => `<div class="care-team-item"><span class="avatar">${escapeHtml(initials(doctor.name))}</span><span class="care-team-copy"><strong>${escapeHtml(doctor.name)}</strong><span>${escapeHtml(doctor.specialization)} · ${escapeHtml(doctor.department)}</span></span></div>`).join("") || emptyState("No doctors to show", "The care team directory is being updated.", "stethoscope") : `<div class="department-list">${report.departments.slice(0, 5).map((row) => `<div class="department-row"><span class="department-name">${escapeHtml(row.name)}</span><span class="progress-track"><span class="progress-fill" style="display:block;width:${report.departments[0].count ? Math.max(3, row.count / report.departments[0].count * 100) : 0}%"></span></span><span class="department-count">${row.count}</span></div>`).join("")}</div>`);
  const listAction = `<button class="text-link" type="button" data-route="${nextSection}">View all ${icon("arrow-right")}</button>`;
  let primaryPanels = panel(nextTitle, appointmentRows(dashboard.appointments, true), listAction);
  let extraPanels = "";
  if (state.user.role === "doctor") {
    const upcoming = dashboard.appointments.filter((item) => !todayAppointments.some((todayItem) => todayItem.id === item.id));
    primaryPanels = `${panel("Today's appointments", appointmentRows(todayAppointments, true, "You have no visits scheduled for today.", "No visits today"), listAction)}${panel("Upcoming visits", appointmentRows(upcoming, true, "There are no upcoming visits on your schedule.", "No upcoming visits"), listAction)}`;
  } else if (state.user.role === "patient") {
    const recentRecords = patientRecords.slice(0, 3).map((record) => `<article class="snapshot-item"><div><strong>${escapeHtml(record.diagnosis)}</strong><span>${escapeHtml(record.doctor_name)} · ${dateLabel(record.created_at?.slice(0, 10))}</span></div><p>${escapeHtml(record.prescription || record.notes || "No additional instructions")}</p></article>`).join("");
    const recentBills = patientBills.slice(0, 3).map((bill) => `<article class="snapshot-item snapshot-bill"><div><strong>${escapeHtml(bill.description)}</strong><span>${escapeHtml(bill.doctor_name)} · ${dateLabel(bill.appointment_date)}</span></div><div>${statusPill(bill.payment_status)}<strong>${money(bill.total_amount)}</strong></div></article>`).join("");
    extraPanels = `<div class="dashboard-grid dashboard-lower"><div>${panel("Recent medical records", recentRecords || emptyState("No records yet", "Visit notes and prescriptions from your appointments will appear here.", "clipboard-plus"), `<button class="text-link" type="button" data-route="records">All records ${icon("arrow-right")}</button>`)}</div><div>${panel("Recent bills", recentBills || emptyState("No bills yet", "Consultation bills will appear here after a visit.", "receipt-text"), `<button class="text-link" type="button" data-route="billing">Billing details ${icon("arrow-right")}</button>`)}</div></div>`;
  } else {
    extraPanels = `<div class="dashboard-grid dashboard-lower"><div>${panel("Appointment activity", monthlyBars(report.monthly_appointments, true), `<button class="text-link" type="button" data-route="reports">Full reports ${icon("arrow-right")}</button>`)}</div><div>${panel("Revenue and follow-up", `<div class="snapshot-metrics"><div><span>Revenue collected</span><strong>${money(report.summary.revenue)}</strong></div><div><span>Unpaid invoices</span><strong>${report.summary.outstanding}</strong></div><div><span>Pending appointments</span><strong>${report.summary.pending}</strong></div></div>`, `<button class="text-link" type="button" data-route="billing">Open billing ${icon("arrow-right")}</button>`)}</div></div>`;
  }
  setView(`${heading(title, description, actions)}<div class="stats-grid">${cards}</div><div class="dashboard-grid"><div>${primaryPanels}${state.user.role === "admin" && report.summary.outstanding ? panel("Billing attention", `<strong style="font:24px 'DM Serif Display',Georgia,serif">${report.summary.outstanding}</strong><span style="margin-left:9px;color:var(--muted);font-size:11px">unpaid invoices</span>`, `<button class="text-link" data-route="billing" type="button">Review billing ${icon("arrow-right")}</button>`) : ""}</div><div>${teamPanel}</div></div>${extraPanels}`);
}

async function renderDoctors() {
  const query = encodeURIComponent(state.query);
  const [items, departments] = await Promise.all([api(`/api/doctors?search=${query}`), api("/api/departments")]);
  state.departments = departments;
  window.lastDoctorList = items;
  const page = paginate(items);
  const isAdmin = state.user.role === "admin";
  const filter = `<select class="filter-select" id="doctor-department" aria-label="Filter by department"><option value="">All departments</option>${departments.map((department) => `<option value="${department.id}">${escapeHtml(department.name)}</option>`).join("")}</select>`;
  const cards = page.items.map((doctor) => doctorCardHtml(doctor, isAdmin)).join("");
  setView(`${heading(isAdmin ? "Care team" : "Find a doctor", isAdmin ? "Manage medical staff, departments, and consultation fees." : "Browse our specialists and choose a time that works for you.", isAdmin ? sectionButton("Add doctor", "add-doctor") : "")}<div class="toolbar"><div class="toolbar-filters">${filter}<span class="field-hint">${items.length} ${items.length === 1 ? "doctor" : "doctors"}</span></div></div><div class="doctor-grid" id="doctor-grid">${cards || emptyState("No doctors found", "Try a different name or department.", "stethoscope")}</div><div id="doctor-pagination">${page.controls}</div>`);
  document.querySelector("#doctor-department")?.addEventListener("change", async (event) => {
    const departmentId = event.target.value;
    const filtered = departmentId ? items.filter((doctor) => String(doctor.department_id) === departmentId) : items;
    state.page = 1;
    const filteredPage = paginate(filtered);
    document.querySelector("#doctor-grid").innerHTML = filteredPage.items.map((doctor) => doctorCardHtml(doctor, isAdmin)).join("") || emptyState("No doctors in this department", "Choose another specialty.", "stethoscope");
    document.querySelector("#doctor-pagination").innerHTML = filteredPage.controls;
    drawIcons();
  });
}

function doctorCardHtml(doctor, isAdmin) {
  return `<article class="doctor-card"><div class="doctor-card-band"></div><div class="doctor-card-body"><span class="doctor-avatar">${escapeHtml(initials(doctor.name))}</span><h3>${escapeHtml(doctor.name)}</h3><span class="doctor-specialty">${escapeHtml(doctor.specialization)}</span><div class="doctor-meta"><span>${icon("building-2")}${escapeHtml(doctor.department)}</span><span>${icon("briefcase-medical")}${doctor.experience_years} years</span></div><div class="doctor-card-foot"><strong>${money(doctor.consultation_fee)} <span style="font-size:10px;color:var(--muted);font-weight:400">/ visit</span></strong>${isAdmin ? `<span class="table-actions"><button class="icon-button" type="button" data-action="edit-doctor" data-id="${doctor.doctor_id}" title="Edit doctor">${icon("pencil")}</button><button class="icon-button" type="button" data-action="delete-doctor" data-id="${doctor.doctor_id}" title="Deactivate doctor">${icon("user-round-x")}</button></span>` : `<button class="button button-primary button-small" data-action="book-doctor" data-id="${doctor.doctor_id}" type="button">Book a visit</button>`}</div></div></article>`;
}

function appointmentTable(items) {
  if (!items.length) return `<div class="panel">${emptyState("No appointments found", "Try changing the filters or book a new visit.")}</div>`;
  const admin = state.user.role === "admin";
  const patient = state.user.role === "patient";
  return `<section class="panel table-wrap"><table class="data-table"><thead><tr><th>Patient</th><th>Date & time</th><th>Doctor</th><th>Department</th><th>Status</th><th>Actions</th></tr></thead><tbody>${items.map((item) => {
    let actionButtons = "";
    if (patient && ["pending", "confirmed"].includes(item.status)) actionButtons = `<button class="button button-secondary button-small" data-action="reschedule" data-id="${item.id}" type="button">Reschedule</button><button class="button button-danger button-small" data-action="cancel-appointment" data-id="${item.id}" type="button">Cancel</button>`;
    if (state.user.role === "doctor" && item.status === "pending") actionButtons = `<button class="button button-primary button-small" data-action="confirm-appointment" data-id="${item.id}" type="button">Accept</button><button class="button button-secondary button-small" data-action="record-appointment" data-id="${item.id}" type="button">Add record</button>`;
    if (state.user.role === "doctor" && item.status === "confirmed") actionButtons = `<button class="button button-primary button-small" data-action="record-appointment" data-id="${item.id}" type="button">Complete visit</button><button class="button button-danger button-small" data-action="cancel-appointment" data-id="${item.id}" type="button">Cancel</button>`;
    if (admin && item.status !== "cancelled" && item.status !== "completed") actionButtons = `<button class="button button-secondary button-small" data-action="reschedule" data-id="${item.id}" type="button">Reschedule</button><button class="button button-danger button-small" data-action="cancel-appointment" data-id="${item.id}" type="button">Cancel</button>`;
    if (admin && item.status === "pending") actionButtons = `<button class="button button-primary button-small" data-action="confirm-appointment" data-id="${item.id}" type="button">Confirm</button>${actionButtons}`;
    return `<tr><td><span class="table-main">${escapeHtml(patient ? item.doctor_name : item.patient_name)}</span><span class="table-sub">${escapeHtml(patient ? item.specialization : item.patient_email || item.department)}</span></td><td><span class="table-main">${dateLabel(item.appointment_date)}</span><span class="table-sub">${escapeHtml(item.appointment_time)}</span></td><td><span class="table-main">${escapeHtml(item.doctor_name)}</span><span class="table-sub">${escapeHtml(item.specialization)}</span></td><td>${escapeHtml(item.department)}</td><td>${statusPill(item.status)}</td><td><div class="table-actions">${actionButtons || `<span class="field-hint">No actions</span>`}</div></td></tr>`;
  }).join("")}</tbody></table></section>`;
}

async function renderAppointments() {
  const query = encodeURIComponent(state.query);
  const statusFilter = encodeURIComponent(state.status);
  const items = await api(`/api/appointments?search=${query}&status_filter=${statusFilter}`);
  const page = paginate(items);
  const patient = state.user.role === "patient";
  const action = patient ? sectionButton("Book appointment", "book", "plus") : "";
  const filters = `<div class="toolbar"><div class="toolbar-filters"><select class="filter-select" id="appointment-status" aria-label="Filter appointment status"><option value="">All statuses</option>${["pending", "confirmed", "completed", "cancelled"].map((s) => `<option value="${s}" ${state.status === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}</select></div><span class="field-hint">${items.length} appointments</span></div>`;
  setView(`${heading("Appointments", patient ? "Manage upcoming visits and review your previous appointments." : state.user.role === "doctor" ? "Review your patient schedule and update visit status." : "Review and coordinate hospital appointments.", action)}${filters}${appointmentTable(page.items)}${page.controls}`);
  document.querySelector("#appointment-status").addEventListener("change", (event) => { state.status = event.target.value; state.page = 1; renderSection(); });
}

async function renderPatients() {
  const items = await api(`/api/patients?search=${encodeURIComponent(state.query)}`);
  const page = paginate(items);
  const rows = page.items.map((patient) => `<tr><td><span class="table-main">${escapeHtml(patient.name)}</span><span class="table-sub">${escapeHtml(patient.email)}</span></td><td>${escapeHtml(patient.phone || "Not provided")}</td><td>${escapeHtml(patient.date_of_birth ? dateLabel(patient.date_of_birth) : "Not provided")}</td><td>${patient.appointment_count}</td><td><div class="table-actions"><button class="button button-secondary button-small" data-action="patient-history" data-id="${patient.patient_id}" type="button">View history</button>${state.user.role === "admin" ? `<button class="icon-button" data-action="edit-patient" data-id="${patient.patient_id}" type="button" title="Edit patient">${icon("pencil")}</button><button class="icon-button" data-action="delete-patient" data-id="${patient.patient_id}" type="button" title="Deactivate patient">${icon("user-round-x")}</button>` : ""}</div></td></tr>`).join("");
  setView(`${heading(state.user.role === "admin" ? "Patients" : "My patients", "Patient profiles and appointment history.")}<section class="panel table-wrap"><table class="data-table"><thead><tr><th>Patient</th><th>Phone</th><th>Date of birth</th><th>Visits</th><th>Actions</th></tr><tbody>${rows}</tbody></table>${items.length ? "" : emptyState("No patients found", "Patient accounts will appear here when they register.", "users-round")}</section>${page.controls}`);
}

async function renderRecords() {
  const [items, appointments] = await Promise.all([api(`/api/records?search=${encodeURIComponent(state.query)}`), state.user.role !== "patient" ? api("/api/appointments") : Promise.resolve([])]);
  const action = state.user.role !== "patient" ? sectionButton("Add patient record", "add-record") : "";
  const page = paginate(items);
  const rows = page.items.map((record) => `<tr><td><span class="table-main">${escapeHtml(record.patient_name || "Patient")}</span><span class="table-sub">${escapeHtml(record.doctor_name || "Care team")}</span></td><td><span class="table-main">${escapeHtml(record.diagnosis)}</span><span class="table-sub">${escapeHtml(record.notes || "No additional notes")}</span></td><td>${escapeHtml(record.prescription || "None recorded")}</td><td>${escapeHtml(record.lab_report || "No report")}</td><td>${dateLabel(record.created_at?.slice(0, 10))}</td></tr>`).join("");
  const choices = appointments.filter((item) => item.status !== "cancelled").map((item) => ({ id: item.id, label: `${item.patient_name} · ${dateLabel(item.appointment_date)} · ${item.department}` }));
  setView(`${heading("Patient records", state.user.role === "patient" ? "Diagnoses, treatment notes, prescriptions, and reports from your visits." : "Document patient encounters and review clinical histories.", action)}<section class="panel table-wrap"><table class="data-table"><thead><tr><th>Patient</th><th>Diagnosis & notes</th><th>Prescription</th><th>Lab / report</th><th>Visit date</th></tr></thead><tbody>${rows}</tbody></table>${items.length ? "" : emptyState("No records yet", state.user.role === "patient" ? "Your doctor will add notes and prescriptions after your visit." : "Patient records will appear here after they are created.", "clipboard-plus")}</section>${page.controls}`);
  state.recordAppointments = choices;
}

async function renderBilling() {
  const items = await api(`/api/bills?search=${encodeURIComponent(state.query)}`);
  const page = paginate(items);
  const action = state.user.role === "admin" ? sectionButton("Create invoice", "create-bill", "plus") : "";
  const rows = page.items.map((bill) => `<tr><td><span class="table-main">${escapeHtml(bill.patient_name)}</span><span class="table-sub">${escapeHtml(bill.description)}</span></td><td><span class="table-main">${escapeHtml(bill.doctor_name)}</span><span class="table-sub">${dateLabel(bill.appointment_date)} · ${escapeHtml(bill.appointment_time)}</span></td><td>${money(bill.consultation_fee)}</td><td>${money(bill.additional_charges)}</td><td><strong>${money(bill.total_amount)}</strong></td><td>${statusPill(bill.payment_status)}</td><td><div class="table-actions">${bill.payment_status === "unpaid" && ["patient", "admin"].includes(state.user.role) ? `<button class="button button-primary button-small" data-action="pay-bill" data-id="${bill.id}" type="button">${state.user.role === "patient" ? "Pay now" : "Record payment"}</button>` : ""}<button class="icon-button" data-action="invoice" data-id="${bill.id}" type="button" title="Open invoice">${icon("printer")}</button></div></td></tr>`).join("");
  setView(`${heading("Billing & invoices", state.user.role === "patient" ? "Review consultation charges and payment history." : "Create invoices and review recorded patient payments.", action)}<section class="panel table-wrap"><table class="data-table"><thead><tr><th>Patient / bill</th><th>Doctor / appointment</th><th>Consultation</th><th>Additional</th><th>Total</th><th>Payment</th><th>Invoice</th></tr></thead><tbody>${rows}</tbody></table>${items.length ? "" : emptyState("No invoices to show", "Invoices will appear here once they are created.", "receipt-text")}</section>${page.controls}`);
}

async function renderDepartments() {
  const items = await api("/api/departments");
  const rows = items.map((department) => `<tr><td><span class="table-main">${icon(icons[department.icon] || "building-2")}${escapeHtml(department.name)}</span></td><td>${escapeHtml(department.description || "No description")}</td><td><div class="table-actions"><button class="icon-button" data-action="edit-department" data-id="${department.id}" type="button" title="Edit department">${icon("pencil")}</button><button class="icon-button" data-action="delete-department" data-id="${department.id}" type="button" title="Archive department">${icon("archive")}</button></div></td></tr>`).join("");
  setView(`${heading("Departments", "Organize specialties and keep the care directory up to date.", sectionButton("Add department", "add-department"))}<section class="panel table-wrap"><table class="data-table"><thead><tr><th>Department</th><th>Description</th><th>Manage</th></tr></thead><tbody>${rows}</tbody></table></section>`);
}

async function renderReports() {
  const report = await api("/api/reports");
  const summary = report.summary;
  const monthly = report.monthly_appointments;
  const maxDept = Math.max(1, ...report.departments.map((item) => item.count));
  const deptBars = report.departments.map((item) => `<div class="department-row"><span class="department-name">${escapeHtml(item.name)}</span><span class="progress-track"><span class="progress-fill" style="display:block;width:${Math.max(item.count ? 3 : 0, item.count / maxDept * 100)}%"></span></span><span class="department-count">${item.count}</span></div>`).join("");
  setView(`${heading("Reports & insights", "A live summary of visits, hospital capacity, and collected revenue.")}<div class="report-summary"><div class="report-metric"><span>Total visits</span><strong>${summary.appointments}</strong></div><div class="report-metric"><span>Revenue collected</span><strong>${money(summary.revenue)}</strong></div><div class="report-metric"><span>Outstanding invoices</span><strong>${summary.outstanding}</strong></div></div><div class="report-grid" style="margin-top:17px">${panel("Monthly appointments", `${monthlyBars(monthly)}<p class="field-hint" style="margin:12px 0 0">Appointment volume · recent 6 months</p>`)}${panel("Visits by department", `<div class="department-list">${deptBars}</div>`)}${panel("Hospital overview", `<div class="department-list"><div class="department-row"><span class="department-name">Active patients</span><strong>${summary.patients}</strong></div><div class="department-row"><span class="department-name">Active doctors</span><strong>${summary.doctors}</strong></div><div class="department-row"><span class="department-name">Pending visits</span><strong>${summary.pending}</strong></div><div class="department-row"><span class="department-name">Unpaid invoices</span><strong>${summary.outstanding}</strong></div></div>`)}</div>`);
}

async function renderProfile() {
  const { user } = await api("/api/profile");
  state.user = user;
  const doctorFields = user.role === "doctor" ? `<div class="field"><label>Department</label><input disabled value="${escapeHtml(user.department)}"></div><div class="field"><label>Specialization</label><input disabled value="${escapeHtml(user.specialization)}"></div>` : "";
  const dobField = user.role === "patient" || user.role === "admin" ? `<div class="field"><label for="profile-dob">Date of birth</label><input id="profile-dob" name="date_of_birth" type="date" value="${escapeHtml(user.date_of_birth)}"></div>` : "";
  setView(`${heading("My profile", "Keep your contact details accurate for your care team.")}<div class="profile-layout"><section class="profile-summary"><span class="avatar">${escapeHtml(initials(user.name))}</span><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(roleNames[user.role])}</span></section><form id="profile-form" class="profile-form"><div class="form-grid"><div class="field"><label for="profile-name">Full name</label><input id="profile-name" name="name" minlength="2" maxlength="100" value="${escapeHtml(user.name)}" required></div><div class="field"><label>Email address</label><input disabled value="${escapeHtml(user.email)}"></div><div class="field"><label for="profile-phone">Phone</label><input id="profile-phone" name="phone" maxlength="30" value="${escapeHtml(user.phone)}"></div>${dobField}<div class="field span-2"><label for="profile-address">Address</label><input id="profile-address" name="address" maxlength="240" value="${escapeHtml(user.address)}" placeholder="Your mailing address"></div>${doctorFields}</div><div class="form-actions"><button class="button button-primary" type="submit">Save profile</button></div></form></div>`);
}

function bindActions() {
  const view = document.querySelector("#view");
  if (!view) return;
  view.onclick = (event) => {
    const routeButton = event.target.closest("[data-route]");
    if (routeButton) navigate(routeButton.dataset.route);
    const actionButton = event.target.closest("[data-action]");
    if (actionButton && !actionButton.disabled) handleAction(actionButton.dataset.action, actionButton.dataset.id);
  };
  view.querySelector("#profile-form")?.addEventListener("submit", saveProfile);
}

async function handleAction(action, id) {
  try {
    if (action === "previous-page" || action === "next-page") {
      state.page += action === "next-page" ? 1 : -1;
      return renderSection();
    }
    if (action === "retry") return renderSection();
    if (action === "book") return openBooking();
    if (action === "book-doctor") return openBooking(Number(id));
    if (action === "add-doctor") return doctorModal();
    if (action === "edit-doctor") return doctorModal(Number(id));
    if (action === "delete-doctor") return deactivateItem("/api/doctors/", id, "Deactivate this doctor's account? Existing clinical history will be preserved.");
    if (action === "cancel-appointment") return updateAppointment(id, { status: "cancelled" }, "Appointment cancelled.");
    if (action === "confirm-appointment") return updateAppointment(id, { status: "confirmed" }, "Appointment confirmed.");
    if (action === "reschedule") return openReschedule(Number(id));
    if (action === "record-appointment") return recordModal(Number(id));
    if (action === "add-record") return recordModal();
    if (action === "patient-history") return showPatientHistory(Number(id));
    if (action === "edit-patient") return editPatient(Number(id));
    if (action === "delete-patient") return deactivateItem("/api/patients/", id, "Deactivate this patient's account? Their medical records will be preserved.");
    if (action === "create-bill") return createBillModal();
    if (action === "pay-bill") return paymentModal(Number(id));
    if (action === "invoice") return window.open(`/api/bills/${id}/invoice`, "_blank", "noopener");
    if (action === "add-department") return departmentModal();
    if (action === "edit-department") return departmentModal(Number(id));
    if (action === "delete-department") return deactivateItem("/api/departments/", id, "Archive this department? It will no longer appear in new bookings.");
  } catch (error) { toast(error.message, "error"); }
}

async function updateAppointment(id, data, message) {
  await api(`/api/appointments/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  toast(message);
  await renderSection();
}

async function deactivateItem(path, id, question) {
  if (!window.confirm(question)) return;
  await api(`${path}${id}`, { method: "DELETE" });
  toast("The record has been archived.");
  if (state.section === "doctors" || state.section === "patients" || state.section === "departments") state.departments = [];
  await renderSection();
}

function modal(title, body, { wide = false, onClose } = {}) {
  const root = document.querySelector("#modal-root");
  root.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><section class="modal ${wide ? "modal-wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><h2 id="modal-title">${escapeHtml(title)}</h2><button class="modal-close" id="modal-close" aria-label="Close">${icon("x")}</button></header><div class="modal-content">${body}</div></section></div>`;
  const close = () => { root.innerHTML = ""; if (onClose) onClose(); };
  root.querySelector("#modal-close").addEventListener("click", close);
  root.querySelector("#modal-backdrop").addEventListener("click", (event) => { if (event.target.id === "modal-backdrop") close(); });
  document.addEventListener("keydown", function onEscape(event) { if (event.key === "Escape") { close(); document.removeEventListener("keydown", onEscape); } }, { once: true });
  drawIcons();
  root.querySelector("input, select, button")?.focus();
  return { close, root };
}

function field(name, label, { type = "text", value = "", required = false, min = "", max = "", placeholder = "", options = null, wide = false, help = "" } = {}) {
  const span = wide ? " span-2" : "";
  const safeValue = escapeHtml(value);
  let control;
  if (options) control = `<select id="${name}" name="${name}" ${required ? "required" : ""}>${options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>`;
  else if (type === "textarea") control = `<textarea id="${name}" name="${name}" maxlength="${max || "2000"}" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""}>${safeValue}</textarea>`;
  else control = `<input id="${name}" name="${name}" type="${type}" value="${safeValue}" ${required ? "required" : ""} ${min ? `min="${min}"` : ""} ${max ? `max="${max}"` : ""} ${type === "number" ? 'step="any"' : ""} ${type === "text" || type === "email" || type === "password" ? `maxlength="${type === "password" ? "128" : "${max || 240}"}"` : ""} placeholder="${escapeHtml(placeholder)}">`;
  return `<div class="field${span}"><label for="${name}">${escapeHtml(label)}</label>${control}${help ? `<span class="field-hint">${escapeHtml(help)}</span>` : ""}</div>`;
}

function formModal(title, fields, submitLabel, save, options = {}) {
  const { close } = modal(title, `<form id="modal-form"><div class="form-grid">${fields}</div><div class="form-actions"><button class="button button-secondary" type="button" id="modal-cancel">Cancel</button><button class="button button-primary" type="submit">${escapeHtml(submitLabel)}</button></div></form>`, options);
  document.querySelector("#modal-cancel").addEventListener("click", close);
  document.querySelector("#modal-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      await save(Object.fromEntries(new FormData(event.currentTarget).entries()));
      close();
      await renderSection();
    } catch (error) {
      submit.disabled = false;
      toast(error.message, "error");
    }
  });
}

async function doctorModal(doctorId = null) {
  const [allDoctors, departments] = await Promise.all([api("/api/doctors"), api("/api/departments")]);
  const doctor = allDoctors.find((item) => item.doctor_id === doctorId);
  if (doctorId && !doctor) throw new Error("Doctor not found.");
  const departmentOptions = departments.map((item) => ({ value: item.id, label: item.name }));
  const fields = `${field("doctor-name", "Full name", { value: doctor?.name || "", required: true })}${field("doctor-email", "Email address", { type: "email", value: doctor?.email || "", required: true, help: doctor ? "Email address cannot be changed." : "This will be their sign-in email." })}${doctor ? "" : field("doctor-password", "Temporary password", { type: "password", value: "Welcome123!", required: true, help: "The doctor can change this after signing in." })}${field("doctor-phone", "Phone", { value: doctor?.phone || "" })}${field("doctor-department-field", "Department", { type: "select", value: doctor?.department_id || departmentOptions[0]?.value, options: departmentOptions, required: true })}${field("doctor-specialization", "Specialization", { value: doctor?.specialization || "", required: true })}${field("doctor-qualification", "Qualification", { value: doctor?.qualification || "" })}${field("doctor-experience", "Years of experience", { type: "number", value: doctor?.experience_years || 0, min: 0, max: 70, required: true })}${field("doctor-fee", "Consultation fee (USD)", { type: "number", value: doctor?.consultation_fee || 80, min: 0, max: 100000, required: true })}`;
  formModal(doctor ? "Edit doctor" : "Add doctor", fields, doctor ? "Save changes" : "Create doctor", async (data) => {
    data.department_id = Number(data.department_id);
    data.experience_years = Number(data.experience_years);
    data.consultation_fee = Number(data.consultation_fee);
    if (doctor) {
      delete data["doctor-email"];
      data.name = data["doctor-name"]; data.phone = data["doctor-phone"]; data.specialization = data["doctor-specialization"]; data.qualification = data["doctor-qualification"]; delete data["doctor-name"]; delete data["doctor-phone"]; delete data["doctor-specialization"]; delete data["doctor-qualification"]; data.department_id = data["doctor-department-field"]; data.experience_years = data["doctor-experience"]; data.consultation_fee = data["doctor-fee"]; delete data["doctor-department-field"]; delete data["doctor-experience"]; delete data["doctor-fee"];
      await api(`/api/doctors/${doctorId}`, { method: "PATCH", body: JSON.stringify(data) });
    } else {
      const payload = { name: data["doctor-name"], email: data["doctor-email"], password: data["doctor-password"], phone: data["doctor-phone"], department_id: Number(data["doctor-department-field"]), specialization: data["doctor-specialization"], qualification: data["doctor-qualification"], experience_years: Number(data["doctor-experience"]), consultation_fee: Number(data["doctor-fee"]) };
      await api("/api/doctors", { method: "POST", body: JSON.stringify(payload) });
    }
    toast(doctor ? "Doctor updated." : "Doctor account created.");
  });
}

function openBooking(selectedDoctorId = null) {
  if (state.user.role !== "patient") return navigate("appointments");
  const departments = state.departments;
  const departmentOptions = departments.map((item) => ({ value: item.id, label: item.name }));
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const initialDoctor = selectedDoctorId ? window.lastDoctorList?.find((item) => item.doctor_id === selectedDoctorId) : null;
  const body = `<form id="booking-form"><div class="form-grid">${field("booking-department", "Department", { type: "select", value: initialDoctor?.department_id || departmentOptions[0]?.value, options: departmentOptions, required: true })}<div class="field"><label for="booking-doctor">Doctor</label><select id="booking-doctor" name="doctor_id" required><option value="">Choose a department first</option></select></div>${field("booking-date", "Appointment date", { type: "date", value: today, min: today, required: true })}<div class="field"><label for="booking-time">Available time</label><select id="booking-time" name="appointment_time" required disabled><option value="">Select a doctor and date</option></select></div>${field("booking-reason", "Reason for visit", { type: "textarea", wide: true, placeholder: "Briefly describe what you would like help with" })}</div><div class="form-actions"><button class="button button-secondary" type="button" id="booking-cancel">Cancel</button><button class="button button-primary" type="submit">Request appointment</button></div></form>`;
  const { close, root } = modal("Book an appointment", body);
  const departmentSelect = root.querySelector("#booking-department");
  const doctorSelect = root.querySelector("#booking-doctor");
  const dateInput = root.querySelector("#booking-date");
  const timeSelect = root.querySelector("#booking-time");
  let doctors = [];
  const loadDoctors = async () => {
    doctors = await api(`/api/doctors?department_id=${departmentSelect.value}`);
    doctorSelect.innerHTML = `<option value="">Select a doctor</option>${doctors.map((doc) => `<option value="${doc.doctor_id}">${escapeHtml(doc.name)} · ${escapeHtml(doc.specialization)}</option>`).join("")}`;
    if (selectedDoctorId && doctors.some((item) => item.doctor_id === selectedDoctorId)) doctorSelect.value = String(selectedDoctorId);
    await loadSlots();
  };
  const loadSlots = async () => {
    const doctorId = doctorSelect.value;
    if (!doctorId || !dateInput.value) { timeSelect.disabled = true; timeSelect.innerHTML = `<option value="">Select a doctor and date</option>`; return; }
    const result = await api(`/api/doctors/${doctorId}/availability?appointment_date=${encodeURIComponent(dateInput.value)}`);
    const futureSlots = result.slots.filter((slot) => dateInput.value !== today || slot.time > new Date().toTimeString().slice(0, 5));
    timeSelect.innerHTML = `<option value="">Choose a time</option>${futureSlots.map((slot) => `<option value="${slot.time}" ${slot.available ? "" : "disabled"}>${slot.time}${slot.available ? "" : " · booked"}</option>`).join("")}`;
    timeSelect.disabled = false;
  };
  departmentSelect.addEventListener("change", () => loadDoctors().catch((error) => toast(error.message, "error")));
  doctorSelect.addEventListener("change", () => loadSlots().catch((error) => toast(error.message, "error")));
  dateInput.addEventListener("change", () => loadSlots().catch((error) => toast(error.message, "error")));
  root.querySelector("#booking-cancel").addEventListener("click", close);
  root.querySelector("#booking-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      data.doctor_id = Number(data.doctor_id); data.department_id = Number(departmentSelect.value);
      data.appointment_date = data["booking-date"]; data.reason = data["booking-reason"];
      delete data["booking-date"]; delete data["booking-reason"]; delete data["booking-department"];
      await api("/api/appointments", { method: "POST", body: JSON.stringify(data) });
      close(); toast("Appointment requested. Your care team will confirm it shortly."); await renderSection();
    } catch (error) { toast(error.message, "error"); button.disabled = false; await loadSlots(); }
  });
  loadDoctors().catch((error) => toast(error.message, "error"));
}

async function openReschedule(id) {
  const items = await api("/api/appointments");
  const appointment = items.find((item) => item.id === id);
  if (!appointment) throw new Error("Appointment not found.");
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const body = `<form id="reschedule-form"><div class="form-grid">${field("reschedule-date", "New appointment date", { type: "date", value: appointment.appointment_date < today ? today : appointment.appointment_date, min: today, required: true })}<div class="field"><label for="reschedule-time">Available time</label><select id="reschedule-time" name="appointment_time" required></select></div></div><div class="form-actions"><button class="button button-secondary" type="button" id="reschedule-cancel">Cancel</button><button class="button button-primary" type="submit">Save new time</button></div></form>`;
  const { close, root } = modal("Reschedule appointment", body);
  const dateInput = root.querySelector("#reschedule-date");
  const timeSelect = root.querySelector("#reschedule-time");
  const loadSlots = async () => {
    const result = await api(`/api/doctors/${appointment.doctor_id}/availability?appointment_date=${encodeURIComponent(dateInput.value)}`);
    const slots = result.slots.filter((slot) => slot.available || (dateInput.value === appointment.appointment_date && slot.time === appointment.appointment_time));
    timeSelect.innerHTML = slots.map((slot) => `<option value="${slot.time}" ${slot.time === appointment.appointment_time && dateInput.value === appointment.appointment_date ? "selected" : ""}>${slot.time}</option>`).join("");
  };
  dateInput.addEventListener("change", () => loadSlots().catch((error) => toast(error.message, "error")));
  root.querySelector("#reschedule-cancel").addEventListener("click", close);
  root.querySelector("#reschedule-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget).entries()); data.appointment_date = dateInput.value;
      await api(`/api/appointments/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      close(); toast("Appointment rescheduled."); await renderSection();
    } catch (error) { toast(error.message, "error"); }
  });
  await loadSlots();
}

async function recordModal(appointmentId = null) {
  const appointments = state.recordAppointments || await api("/api/appointments").then((items) => items.filter((item) => item.status !== "cancelled").map((item) => ({ id: item.id, label: `${item.patient_name} · ${dateLabel(item.appointment_date)} · ${item.department}` })));
  const options = appointments.map((item) => ({ value: item.id, label: item.label }));
  if (!options.length) throw new Error("Create an appointment before adding a patient record.");
  const fields = `${field("record-appointment", "Patient appointment", { type: "select", value: appointmentId || options[0].value, options, required: true, wide: true })}${field("record-diagnosis", "Diagnosis", { required: true, placeholder: "Primary diagnosis" })}${field("record-followup", "Follow-up date", { type: "date" })}${field("record-prescription", "Prescription", { type: "textarea", wide: true, placeholder: "Medication, dosage, and instructions" })}${field("record-notes", "Doctor notes", { type: "textarea", wide: true, placeholder: "Clinical findings and treatment plan" })}${field("record-report", "Lab / report information", { type: "textarea", wide: true, placeholder: "Test name, result, or attached report reference" })}`;
  formModal("Patient visit record", fields, "Save record", async (data) => {
    const payload = { appointment_id: Number(data["record-appointment"]), diagnosis: data["record-diagnosis"], follow_up_date: data["record-followup"], prescription: data["record-prescription"], notes: data["record-notes"], lab_report: data["record-report"] };
    await api("/api/records", { method: "POST", body: JSON.stringify(payload) });
    toast("Patient record saved.");
  }, { wide: true });
}

async function showPatientHistory(patientId) {
  const history = await api(`/api/patients/${patientId}/history`);
  const appointmentItems = history.appointments.map((item) => `<div class="patient-history-item"><strong>${dateLabel(item.appointment_date)} · ${escapeHtml(item.department)}</strong><p>${escapeHtml(item.doctor_name)} · ${escapeHtml(item.status)}<br>${escapeHtml(item.reason || "No visit reason recorded")}</p></div>`).join("");
  const recordItems = history.records.map((item) => `<div class="patient-history-item"><strong>${escapeHtml(item.diagnosis)}</strong><p>${escapeHtml(item.notes || "No doctor notes")}${item.prescription ? `<br>Prescription: ${escapeHtml(item.prescription)}` : ""}</p></div>`).join("");
  modal("Patient history", `<h3 style="font-size:12px">Appointments</h3>${appointmentItems || emptyState("No appointments", "This patient has no visit history.")}<h3 style="margin-top:20px;font-size:12px">Clinical records</h3>${recordItems || emptyState("No clinical records", "No records have been added yet.", "clipboard-plus")}`, { wide: true });
}

async function editPatient(patientId) {
  const items = await api("/api/patients");
  const patient = items.find((item) => item.patient_id === patientId);
  if (!patient) throw new Error("Patient not found.");
  const fields = `${field("patient-name", "Full name", { value: patient.name, required: true })}${field("patient-phone", "Phone", { value: patient.phone })}${field("patient-birth", "Date of birth", { type: "date", value: patient.date_of_birth })}${field("patient-address", "Address", { value: patient.address, wide: true })}`;
  formModal("Edit patient profile", fields, "Save changes", async (data) => {
    await api(`/api/patients/${patientId}`, { method: "PATCH", body: JSON.stringify({ name: data["patient-name"], phone: data["patient-phone"], address: data["patient-address"], date_of_birth: data["patient-birth"] }) });
    toast("Patient profile updated.");
  });
}

async function createBillModal() {
  const items = await api("/api/appointments");
  const appointments = items.filter((item) => item.status !== "cancelled");
  if (!appointments.length) throw new Error("Create an appointment before issuing an invoice.");
  const options = appointments.map((item) => ({ value: item.id, label: `${item.patient_name} · ${dateLabel(item.appointment_date)} · ${item.department}` }));
  const fields = `${field("bill-appointment", "Patient appointment", { type: "select", value: options[0].value, options, required: true, wide: true })}${field("bill-additional", "Additional charges (USD)", { type: "number", value: 0, min: 0, max: 1000000, required: true })}${field("bill-description", "Description", { value: "Consultation", required: true, wide: true })}`;
  formModal("Create invoice", fields, "Issue invoice", async (data) => {
    await api("/api/bills", { method: "POST", body: JSON.stringify({ appointment_id: Number(data["bill-appointment"]), additional_charges: Number(data["bill-additional"]), description: data["bill-description"] }) });
    toast("Invoice created.");
  });
}

function paymentModal(billId) {
  const options = ["Cash", "Card", "Insurance", "Bank transfer"].map((name) => ({ value: name, label: name }));
  formModal("Record a payment", field("payment-method", "Payment method", { type: "select", value: "Card", options, required: true }) + `<p class="field-hint span-2" style="line-height:1.6">This records a payment for this invoice in the hospital billing ledger.</p>`, "Confirm payment", async (data) => {
    await api(`/api/bills/${billId}/payments`, { method: "POST", body: JSON.stringify({ payment_method: data["payment-method"] }) });
    toast("Payment recorded successfully.");
  });
}

async function departmentModal(departmentId = null) {
  const items = await api("/api/departments");
  const department = items.find((item) => item.id === departmentId);
  const fields = `${field("department-name", "Department name", { value: department?.name || "", required: true })}${field("department-description", "Description", { value: department?.description || "", wide: true, placeholder: "A short description of this specialty" })}`;
  formModal(department ? "Edit department" : "Add department", fields, department ? "Save changes" : "Add department", async (data) => {
    const url = department ? `/api/departments/${departmentId}` : "/api/departments";
    await api(url, { method: department ? "PATCH" : "POST", body: JSON.stringify({ name: data["department-name"], description: data["department-description"] }) });
    state.departments = [];
    toast(department ? "Department updated." : "Department added.");
  });
}

function saveProfile(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  api("/api/profile", { method: "PATCH", body: JSON.stringify(data) }).then((result) => {
    state.user = result.user;
    toast("Profile saved.");
    return showApp();
  }).catch((error) => { toast(error.message, "error"); button.disabled = false; });
}

async function start() {
  try {
    const result = await api("/api/session");
    state.user = result.user;
    await showApp();
  } catch {
    showAuth();
  }
}

start();