import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "/config.js";

const USERS = {
  Tori: { email: "tori@togazzmis.app", initials: "TO", avatar: "avatar-tori", dot: "dot-tori" },
  Misthios: { email: "misthios@togazzmis.app", initials: "MI", avatar: "avatar-misthios", dot: "dot-misthios" },
  Gaziim: { email: "gaziim@togazzmis.app", initials: "GA", avatar: "avatar-gaziim", dot: "dot-gaziim" },
};

const USER_NAMES = Object.keys(USERS);
const EMPTY_ENTRY = {
  calculus_exercises: 0,
  calculus_note: "",
  discrete_exercises: 0,
  discrete_note: "",
  pre_calculus_exercises: 0,
  pre_calculus_note: "",
};
const state = { session: null, profile: null, isGuest: false, calendarMonth: saoPauloToday().slice(0, 7), requestId: 0 };
let supabase;
let toastTimer;

const setupScreen = document.querySelector("#setup-screen");
const loginScreen = document.querySelector("#login-screen");
const appScreen = document.querySelector("#app-screen");
const mainContent = document.querySelector("#main-content");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const loginButton = document.querySelector("#login-button");
const guestButton = document.querySelector("#guest-button");

function isConfigured() {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) && !SUPABASE_PUBLISHABLE_KEY.startsWith("YOUR_");
}

async function init() {
  bindGlobalEvents();
  if (!isConfigured()) {
    setupScreen.hidden = false;
    return;
  }

  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm");
    supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  } catch {
    setupScreen.hidden = false;
    setupScreen.querySelector("h1").textContent = "Não foi possível carregar a conexão";
    setupScreen.querySelector("p:last-child").textContent = "Verifique sua internet e recarregue a página.";
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) showToast("Não foi possível recuperar sua sessão.", true);
  if (data?.session) await openApp(data.session);
  else showLogin();
}

function bindGlobalEvents() {
  loginForm.addEventListener("submit", handleLogin);
  guestButton.addEventListener("click", openGuest);
  document.querySelector("#logout-button").addEventListener("click", handleLogout);
  window.addEventListener("popstate", () => (state.session || state.isGuest) && renderCurrentView());
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-route]");
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.getAttribute("data-route"));
  });
}

async function handleLogin(event) {
  event.preventDefault();
  const name = document.querySelector("#login-user").value;
  const password = document.querySelector("#login-password").value;
  loginError.hidden = true;

  if (!USERS[name] || password !== "123456") {
    showLoginError("Usuário ou senha incorretos.");
    return;
  }

  setButtonLoading(loginButton, true, "Entrando…");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: USERS[name].email,
    password,
  });

  if (error || !data.session) {
    setButtonLoading(loginButton, false, "Entrar");
    showLoginError("Não foi possível entrar. Confira se os usuários foram criados no Supabase.");
    return;
  }

  document.querySelector("#login-password").value = "";
  setButtonLoading(loginButton, false, "Entrar");
  await openApp(data.session);
}

async function handleLogout() {
  if (state.session) await supabase.auth.signOut();
  state.session = null;
  state.profile = null;
  state.isGuest = false;
  history.replaceState({}, "", "/");
  showLogin();
}

async function openApp(session) {
  state.session = session;
  state.isGuest = false;
  const { data: profile, error } = await supabase.from("profiles").select("id, display_name").eq("id", session.user.id).single();
  if (error || !profile) {
    await supabase.auth.signOut();
    state.session = null;
    showLogin();
    showLoginError("Este usuário ainda não foi associado a um perfil. Execute o arquivo de perfis no Supabase.");
    return;
  }

  state.profile = profile;
  setupScreen.hidden = true;
  loginScreen.hidden = true;
  appScreen.hidden = false;
  const visual = USERS[profile.display_name] || { initials: "?", avatar: "avatar-tori" };
  const avatar = document.querySelector("#account-avatar");
  avatar.textContent = visual.initials;
  avatar.className = `avatar ${visual.avatar}`;
  document.querySelector("#account-name").textContent = profile.display_name;
  const logoutButton = document.querySelector("#logout-button");
  logoutButton.setAttribute("aria-label", "Sair");
  logoutButton.title = "Sair";
  await renderCurrentView();
}

async function openGuest() {
  state.session = null;
  state.profile = null;
  state.isGuest = true;
  loginError.hidden = true;
  setupScreen.hidden = true;
  loginScreen.hidden = true;
  appScreen.hidden = false;
  const avatar = document.querySelector("#account-avatar");
  avatar.textContent = "CO";
  avatar.className = "avatar avatar-guest";
  document.querySelector("#account-name").textContent = "Convidado";
  const logoutButton = document.querySelector("#logout-button");
  logoutButton.setAttribute("aria-label", "Sair da visualização");
  logoutButton.title = "Sair da visualização";
  await renderCurrentView();
}

function showLogin() {
  state.isGuest = false;
  const logoutButton = document.querySelector("#logout-button");
  logoutButton.setAttribute("aria-label", "Sair");
  logoutButton.title = "Sair";
  setupScreen.hidden = true;
  appScreen.hidden = true;
  loginScreen.hidden = false;
  document.querySelector("#login-password").focus();
}

function showLoginError(message) {
  loginError.textContent = message;
  loginError.hidden = false;
}

function navigate(path) {
  if (!state.session && !state.isGuest) return;
  const current = `${location.pathname}${location.search}`;
  if (current !== path) history.pushState({}, "", path);
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function renderCurrentView() {
  const requestId = ++state.requestId;
  const route = readRoute();
  markActiveNavigation(route.view);
  mainContent.innerHTML = '<div class="loading">Carregando os registros…</div>';

  try {
    const range = rangeForRoute(route);
    const entries = await fetchEntries(range.from, range.to);
    if (requestId !== state.requestId) return;

    if (route.view === "week") renderWeek(route, entries);
    else if (route.view === "calendar") renderCalendar(route, entries);
    else renderDay(route, entries);
  } catch (error) {
    if (requestId !== state.requestId) return;
    mainContent.innerHTML = `<div class="error-panel"><p>${escapeHtml(error.message || "Não foi possível carregar os registros.")}</p><button class="button button-secondary" id="retry-button">Tentar novamente</button></div>`;
    document.querySelector("#retry-button").addEventListener("click", renderCurrentView);
  }
}

function readRoute() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const today = saoPauloToday();
  if (path === "/semana") return { view: "week", date: today, today };
  if (path === "/calendario") {
    const requested = new URLSearchParams(location.search).get("mes");
    const month = /^\d{4}-\d{2}$/.test(requested || "") ? requested : state.calendarMonth;
    state.calendarMonth = month;
    return { view: "calendar", date: `${month}-01`, month, today };
  }
  const dayMatch = path.match(/^\/dia\/(\d{4}-\d{2}-\d{2})$/);
  if (dayMatch && isDateString(dayMatch[1])) return { view: "day", date: dayMatch[1], today };
  return { view: "today", date: today, today };
}

function rangeForRoute(route) {
  if (route.view === "week") {
    const start = mondayOf(route.date);
    return { from: start, to: addDays(start, 6) };
  }
  if (route.view === "calendar") {
    const days = calendarDays(route.month);
    return { from: days[0], to: days[41] };
  }
  return { from: route.date, to: route.date };
}

async function fetchEntries(from, to) {
  const { data, error } = await supabase
    .from("study_entries")
    .select("id,user_id,study_date,calculus_exercises,calculus_note,discrete_exercises,discrete_note,pre_calculus_exercises,pre_calculus_note,created_at,updated_at,profile:profiles!study_entries_user_id_fkey(display_name)")
    .gte("study_date", from)
    .lte("study_date", to)
    .order("study_date", { ascending: true });
  if (error) throw new Error(readableDatabaseError(error));
  return (data || []).map((entry) => ({ ...entry, display_name: entry.profile?.display_name || "Usuário" }));
}

function renderDay(route, entries) {
  const future = route.date > route.today;
  const readOnly = future || state.isGuest;
  const dayEntries = USER_NAMES.map((name) => entries.find((entry) => entry.display_name === name));
  const own = state.isGuest ? EMPTY_ENTRY : entries.find((entry) => entry.user_id === state.session.user.id) || EMPTY_ENTRY;
  const groupTotal = dayEntries.reduce((sum, entry) => sum + entryTotal(entry), 0);
  const calculusTotal = dayEntries.reduce((sum, entry) => sum + (entry?.calculus_exercises || 0), 0);
  const discreteTotal = dayEntries.reduce((sum, entry) => sum + (entry?.discrete_exercises || 0), 0);
  const preCalculusTotal = dayEntries.reduce((sum, entry) => sum + (entry?.pre_calculus_exercises || 0), 0);
  const tomorrow = addDays(route.date, 1);

  mainContent.innerHTML = `
    <div class="page-heading">
      <div>
        <p class="eyebrow">${route.view === "today" ? "Seu ritmo de hoje" : "Registro diário"}</p>
        <h1>${route.view === "today" ? "Hoje, vamos avançar um pouco?" : capitalize(longDate(route.date))}</h1>
        <p class="supporting-copy">${route.view === "today" ? capitalize(longDate(route.date)) : future ? "Dia futuro — disponível apenas para consulta." : "Veja o grupo e atualize o seu registro."}</p>
      </div>
      ${route.view === "day" ? `<div class="heading-actions"><a class="button button-secondary button-icon route-link" href="/dia/${addDays(route.date, -1)}" data-route="/dia/${addDays(route.date, -1)}" aria-label="Dia anterior">‹</a><a class="button button-secondary button-icon route-link ${tomorrow > route.today ? "disabled" : ""}" href="${tomorrow > route.today ? `/dia/${route.date}` : `/dia/${tomorrow}`}" data-route="${tomorrow > route.today ? `/dia/${route.date}` : `/dia/${tomorrow}`}" aria-label="Próximo dia">›</a></div>` : ""}
    </div>
    <div class="stats-grid">
      ${stat("Exercícios do grupo", groupTotal, "green")}
      ${stat("Cálculo", calculusTotal, "blue")}
      ${stat("Matemática Discreta", discreteTotal, "amber")}
      ${stat("Pré-Cálculo", preCalculusTotal, "violet")}
    </div>
    <div class="content-grid">
      <article class="card">
        <div class="card-header user-heading">${state.isGuest ? '<span class="avatar avatar-guest">CO</span>' : avatar(state.profile.display_name)}<div><h2>${state.isGuest ? "Visualização de convidado" : "Meu registro"}</h2><p>${state.isGuest ? "Os registros são apenas para consulta." : future ? "Registros futuros ficam desativados." : "Quantos exercícios você concluiu?"}</p></div></div>
        <form id="entry-form" class="card-body">
          ${subjectField("Cálculo", "ƒ", "blue", "calculus", own.calculus_exercises, own.calculus_note, readOnly)}
          <div class="subject-divider"></div>
          ${subjectField("Matemática Discreta", "Σ", "amber", "discrete", own.discrete_exercises, own.discrete_note, readOnly)}
          <div class="subject-divider"></div>
          ${subjectField("Pré-Cálculo", "π", "violet", "pre_calculus", own.pre_calculus_exercises, own.pre_calculus_note, readOnly, "Exercício de vídeo do YouTube")}
          ${state.isGuest ? "" : `<button class="button button-primary button-large save-button" type="submit" ${future ? "disabled" : ""}>Salvar registro</button>`}
        </form>
      </article>
      <aside class="group-panel"><h2 class="section-title">O grupo nesse dia</h2><div class="group-list">${USER_NAMES.map((name) => groupEntry(name, entries.find((entry) => entry.display_name === name))).join("")}</div></aside>
    </div>`;

  if (!readOnly) document.querySelector("#entry-form").addEventListener("submit", (event) => saveEntry(event, route.date));
}

async function saveEntry(event, date) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const values = {
    calculus_exercises: normalizedCount(form.elements.calculus_exercises.value),
    calculus_note: form.elements.calculus_note.value.trim(),
    discrete_exercises: normalizedCount(form.elements.discrete_exercises.value),
    discrete_note: form.elements.discrete_note.value.trim(),
    pre_calculus_exercises: normalizedCount(form.elements.pre_calculus_exercises.value),
    pre_calculus_note: form.elements.pre_calculus_note.value.trim(),
    updated_at: new Date().toISOString(),
  };

  if (values.calculus_note.length > 200 || values.discrete_note.length > 200 || values.pre_calculus_note.length > 200) {
    showToast("Cada observação pode ter no máximo 200 caracteres.", true);
    return;
  }

  setButtonLoading(button, true, "Salvando…");
  const { data: existing, error: lookupError } = await supabase
    .from("study_entries")
    .select("id")
    .eq("user_id", state.session.user.id)
    .eq("study_date", date)
    .maybeSingle();
  let error = lookupError;
  if (!error && existing) {
    ({ error } = await supabase.from("study_entries").update(values).eq("id", existing.id));
  } else if (!error) {
    ({ error } = await supabase.from("study_entries").insert({ user_id: state.session.user.id, study_date: date, ...values }));
  }
  setButtonLoading(button, false, "Salvar registro");
  if (error) {
    showToast(readableDatabaseError(error), true);
    return;
  }
  showToast("Registro salvo.");
  await renderCurrentView();
}

function renderWeek(route, entries) {
  const start = mondayOf(route.date);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  mainContent.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">Visão da semana</p><h1>O esforço de cada um, lado a lado.</h1><p class="supporting-copy">${shortDate(days[0])} — ${shortDate(days[6])}</p></div></div>
    <div class="week-cards">${USER_NAMES.map((name) => weekUserCard(name, entries.filter((entry) => entry.display_name === name))).join("")}</div>
    <article class="card">
      <div class="card-header"><h2 class="section-title">Dia a dia</h2></div>
      <div class="week-table-wrap"><div class="week-table">
        <div class="week-row week-head"><span>Pessoa</span>${days.map((day) => `<span>${weekdayAndDay(day)}</span>`).join("")}</div>
        ${USER_NAMES.map((name) => `<div class="week-row"><div class="week-name">${avatar(name, true)}<span>${name}</span></div>${days.map((day) => { const entry = entries.find((item) => item.display_name === name && item.study_date === day); const value = entryTotal(entry); return `<a class="week-cell route-link" href="/dia/${day}" data-route="/dia/${day}">${value || '<span class="zero">—</span>'}</a>`; }).join("")}</div>`).join("")}
      </div></div>
    </article>`;
}

function renderCalendar(route, entries) {
  const days = calendarDays(route.month);
  mainContent.innerHTML = `
    <div class="page-heading">
      <div><p class="eyebrow">Calendário</p><h1>${capitalize(monthName(`${route.month}-01`))}</h1><p class="supporting-copy">Abra qualquer dia para ver os detalhes do grupo.</p></div>
      <div class="heading-actions"><button class="button button-secondary button-icon" data-calendar-move="-1" aria-label="Mês anterior">‹</button><button class="button button-secondary" data-calendar-today>Hoje</button><button class="button button-secondary button-icon" data-calendar-move="1" aria-label="Próximo mês">›</button></div>
    </div>
    <article class="card calendar-card">
      <div class="calendar-head">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => `<span>${day}</span>`).join("")}</div>
      <div class="calendar-grid">${days.map((day) => calendarCell(day, route, entries.filter((entry) => entry.study_date === day))).join("")}</div>
    </article>
    <div class="calendar-legend">${USER_NAMES.map((name) => `<span><i class="${USERS[name].dot}"></i>${name}</span>`).join("")}</div>`;

  document.querySelectorAll("[data-calendar-move]").forEach((button) => button.addEventListener("click", () => {
    const next = moveMonth(route.month, Number(button.dataset.calendarMove));
    navigate(`/calendario?mes=${next}`);
  }));
  document.querySelector("[data-calendar-today]").addEventListener("click", () => navigate(`/calendario?mes=${route.today.slice(0, 7)}`));
}

function subjectField(title, symbol, tone, prefix, count, note, disabled, notePlaceholder = "Ex: Lista 1") {
  return `<section class="subject"><div class="subject-title"><span class="subject-icon subject-icon-${tone}">${symbol}</span>${title}</div><div class="field-row"><label>Exercícios<input name="${prefix}_exercises" type="number" min="0" max="10000" inputmode="numeric" value="${Number(count) || 0}" ${disabled ? "disabled" : ""}></label><label>Observação<textarea name="${prefix}_note" maxlength="200" placeholder="${escapeHtml(notePlaceholder)}" ${disabled ? "disabled" : ""}>${escapeHtml(note || "")}</textarea></label></div></section>`;
}

function groupEntry(name, entry) {
  const own = !state.isGuest && name === state.profile.display_name;
  return `<article class="group-entry"><div class="group-entry-main">${avatar(name)}<div class="group-entry-copy"><strong>${name}${own ? '<span class="you-tag">VOCÊ</span>' : ""}</strong><span>${entry ? `${entryTotal(entry)} exercícios` : "Sem registro"}</span></div>${entry ? `<div class="entry-counts"><span><b class="blue-text">${entry.calculus_exercises}</b><small>Cálc.</small></span><span><b class="amber-text">${entry.discrete_exercises}</b><small>Disc.</small></span><span><b class="violet-text">${entry.pre_calculus_exercises}</b><small>Pré-Cálc.</small></span></div>` : ""}</div>${entry && (entry.calculus_note || entry.discrete_note || entry.pre_calculus_note) ? `<div class="entry-notes">${entry.calculus_note ? `<p><b>Cálculo:</b> ${escapeHtml(entry.calculus_note)}</p>` : ""}${entry.discrete_note ? `<p><b>Discreta:</b> ${escapeHtml(entry.discrete_note)}</p>` : ""}${entry.pre_calculus_note ? `<p><b>Pré-Cálculo:</b> ${escapeHtml(entry.pre_calculus_note)}</p>` : ""}</div>` : ""}</article>`;
}

function weekUserCard(name, entries) {
  const calculus = entries.reduce((sum, entry) => sum + entry.calculus_exercises, 0);
  const discrete = entries.reduce((sum, entry) => sum + entry.discrete_exercises, 0);
  const preCalculus = entries.reduce((sum, entry) => sum + entry.pre_calculus_exercises, 0);
  return `<article class="card week-user-card"><div class="user-heading">${avatar(name)}<div><h2>${name}</h2><p>${calculus + discrete + preCalculus} exercícios</p></div></div><div class="week-subjects"><div class="stat-blue"><strong>${calculus}</strong><span>Cálculo</span></div><div class="stat-amber"><strong>${discrete}</strong><span>Discreta</span></div><div class="stat-violet"><strong>${preCalculus}</strong><span>Pré-Cálculo</span></div></div></article>`;
}

function calendarCell(day, route, entries) {
  const total = entries.reduce((sum, entry) => sum + entryTotal(entry), 0);
  const names = USER_NAMES.filter((name) => entries.some((entry) => entry.display_name === name));
  return `<a class="calendar-day route-link ${day.slice(0, 7) !== route.month ? "outside" : ""}" href="/dia/${day}" data-route="/dia/${day}"><div class="calendar-day-top"><span class="day-number ${day === route.today ? "today" : ""}">${Number(day.slice(-2))}</span>${total ? `<span class="day-total">${total}<span> ex.</span></span>` : ""}</div><div class="calendar-dots">${names.map((name) => `<i class="calendar-dot ${USERS[name].dot}" title="${name}"></i>`).join("")}</div></a>`;
}

function stat(label, value, tone) { return `<div class="stat stat-${tone}"><p>${label}</p><strong>${value}</strong></div>`; }
function avatar(name, small = false) { const user = USERS[name] || { initials: "?", avatar: "avatar-tori" }; return `<span class="avatar ${small ? "avatar-small" : ""} ${user.avatar}" title="${escapeHtml(name)}">${user.initials}</span>`; }
function entryTotal(entry) { return (entry?.calculus_exercises || 0) + (entry?.discrete_exercises || 0) + (entry?.pre_calculus_exercises || 0); }
function normalizedCount(value) { const parsed = Number(value); return Number.isInteger(parsed) ? Math.min(10000, Math.max(0, parsed)) : 0; }

function markActiveNavigation(view) {
  const active = view === "day" ? "calendar" : view;
  document.querySelectorAll("[data-view-link]").forEach((link) => link.classList.toggle("active", link.dataset.viewLink === active));
}

function setButtonLoading(button, loading, label) { button.disabled = loading; button.textContent = label; }
function showToast(message, isError = false) {
  const toast = document.querySelector("#toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast${isError ? " error" : ""}`;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("visible"));
  toastTimer = setTimeout(() => { toast.classList.remove("visible"); setTimeout(() => { toast.hidden = true; }, 220); }, 3200);
}

function readableDatabaseError(error) {
  if (error?.code === "42P01") return "A tabela de estudos ainda não foi criada no Supabase.";
  if (error?.code === "42501") return "O Supabase bloqueou esta operação. Verifique as políticas de acesso.";
  return "Não foi possível acessar os registros agora.";
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function capitalize(value) { return value ? value[0].toUpperCase() + value.slice(1) : value; }
function parseDate(value) { const [year, month, day] = value.split("-").map(Number); return new Date(Date.UTC(year, month - 1, day, 12)); }
function dateString(date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`; }
function addDays(value, amount) { const date = parseDate(value); date.setUTCDate(date.getUTCDate() + amount); return dateString(date); }
function mondayOf(value) { const day = parseDate(value).getUTCDay(); return addDays(value, day === 0 ? -6 : 1 - day); }
function moveMonth(month, amount) { const date = parseDate(`${month}-01`); date.setUTCMonth(date.getUTCMonth() + amount); return dateString(date).slice(0, 7); }
function calendarDays(month) { const first = `${month}-01`; const weekday = parseDate(first).getUTCDay(); const start = addDays(first, -(weekday === 0 ? 6 : weekday - 1)); return Array.from({ length: 42 }, (_, index) => addDays(start, index)); }
function isDateString(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; return dateString(parseDate(value)) === value; }
function longDate(value) { return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(parseDate(value)); }
function shortDate(value) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(parseDate(value)).replace(".", ""); }
function weekdayAndDay(value) { return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", timeZone: "UTC" }).format(parseDate(value)).replace(".", ""); }
function monthName(value) { return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(parseDate(value)); }
function saoPauloToday(now = new Date()) { const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now); const part = (type) => parts.find((item) => item.type === type)?.value || ""; return `${part("year")}-${part("month")}-${part("day")}`; }

init();
