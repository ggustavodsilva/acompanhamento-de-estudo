import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "/config.js";

const USERS = {
  Tori: { email: "tori@togazzmis.app", initials: "TO", calendarInitial: "T", avatar: "avatar-tori", dot: "dot-tori" },
  Gaziim: { email: "gaziim@togazzmis.app", initials: "GAZZ", calendarInitial: "G", avatar: "avatar-gaziim", dot: "dot-gaziim" },
  Misthios: { email: "misthios@togazzmis.app", initials: "MIS", calendarInitial: "M", avatar: "avatar-misthios", dot: "dot-misthios" },
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
const state = { session: null, profile: null, profiles: {}, isGuest: false, calendarMonth: saoPauloToday().slice(0, 7), requestId: 0 };
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
const profileButton = document.querySelector("#profile-button");
const profileModal = document.querySelector("#profile-modal");
const profileContent = document.querySelector("#profile-content");

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
  profileButton.addEventListener("click", () => openProfileModal());
  document.querySelector("#profile-close").addEventListener("click", closeProfileModal);
  profileModal.addEventListener("click", (event) => { if (event.target === profileModal) closeProfileModal(); });
  document.querySelector("#logout-button").addEventListener("click", handleLogout);
  window.addEventListener("popstate", () => (state.session || state.isGuest) && renderCurrentView());
  document.addEventListener("click", (event) => {
    const profileTrigger = event.target.closest("[data-profile-name]");
    if (profileTrigger) {
      event.preventDefault();
      openProfileModal(profileTrigger.dataset.profileName);
      return;
    }
    const link = event.target.closest("[data-route]");
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.getAttribute("data-route"));
  });
  document.addEventListener("keydown", (event) => {
    const profileTrigger = event.target.closest("[data-profile-name]");
    if (!profileTrigger || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openProfileModal(profileTrigger.dataset.profileName);
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
  state.profiles = {};
  state.isGuest = false;
  history.replaceState({}, "", "/");
  showLogin();
}

async function openApp(session) {
  state.session = session;
  state.isGuest = false;
  const { data: profile, error } = await supabase.from("profiles").select("id, display_name, avatar_path").eq("id", session.user.id).single();
  if (error) {
    state.session = null;
    showLogin();
    showLoginError("Não foi possível carregar seu perfil agora. Recarregue a página; se continuar, verifique a atualização do banco.");
    return;
  }
  if (!profile) {
    await supabase.auth.signOut();
    state.session = null;
    showLogin();
    showLoginError("Este usuário ainda não foi associado a um perfil. Execute o arquivo de perfis no Supabase.");
    return;
  }

  state.profile = profile;
  await loadProfiles();
  setupScreen.hidden = true;
  loginScreen.hidden = true;
  appScreen.hidden = false;
  updateAccountProfile();
  profileButton.disabled = false;
  const logoutButton = document.querySelector("#logout-button");
  logoutButton.setAttribute("aria-label", "Sair");
  logoutButton.title = "Sair";
  await renderCurrentView();
}

async function openGuest() {
  state.session = null;
  state.profile = null;
  state.isGuest = true;
  await loadProfiles();
  loginError.hidden = true;
  setupScreen.hidden = true;
  loginScreen.hidden = true;
  appScreen.hidden = false;
  const avatar = document.querySelector("#account-avatar");
  avatar.textContent = "CO";
  avatar.className = "avatar avatar-guest";
  document.querySelector("#account-name").textContent = "Convidado";
  profileButton.disabled = true;
  profileButton.title = "Perfil indisponível para convidados";
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
  if (profileModal.open) profileModal.close();
  document.querySelector("#login-password").focus();
}

function showLoginError(message) {
  loginError.textContent = message;
  loginError.hidden = false;
}

async function loadProfiles() {
  const { data, error } = await supabase.from("profiles").select("id, display_name, avatar_path");
  if (error) throw new Error(readableDatabaseError(error));
  state.profiles = Object.fromEntries((data || []).map((profile) => [profile.display_name, profile]));
  if (state.profile && state.profiles[state.profile.display_name]) state.profile = state.profiles[state.profile.display_name];
}

function updateAccountProfile() {
  if (!state.profile) return;
  const visual = USERS[state.profile.display_name] || { initials: "?", avatar: "avatar-tori" };
  const accountAvatar = document.querySelector("#account-avatar");
  accountAvatar.className = `avatar ${visual.avatar}${state.profile.avatar_path ? " has-photo" : ""}`;
  accountAvatar.innerHTML = state.profile.avatar_path ? `<img src="${profilePhotoUrl(state.profile.avatar_path)}" alt="">` : visual.initials;
  document.querySelector("#account-name").textContent = state.profile.display_name;
  profileButton.title = "Abrir perfil";
}

async function openProfileModal(profileName = state.profile?.display_name) {
  const selectedProfile = state.profiles[profileName];
  if (!selectedProfile) return;
  profileContent.innerHTML = '<div class="profile-loading">Carregando seu perfil…</div>';
  if (!profileModal.open) profileModal.showModal();

  try {
    const entries = await fetchUserHistory(selectedProfile.id);
    renderProfileModal(entries, selectedProfile);
  } catch (error) {
    profileContent.innerHTML = `<div class="error-panel"><p>${escapeHtml(error.message || "Não foi possível carregar o perfil.")}</p><button class="button button-secondary" id="profile-retry" type="button">Tentar novamente</button></div>`;
    document.querySelector("#profile-retry").addEventListener("click", () => openProfileModal(profileName));
  }
}

function closeProfileModal() {
  profileModal.close();
}

async function fetchUserHistory(userId) {
  const pageSize = 1000;
  const entries = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("study_entries")
      .select("study_date,calculus_exercises,discrete_exercises,pre_calculus_exercises")
      .eq("user_id", userId)
      .lte("study_date", saoPauloToday())
      .order("study_date", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(readableDatabaseError(error));
    entries.push(...(data || []));
    if ((data || []).length < pageSize) return entries;
  }
}

function renderProfileModal(entries, selectedProfile) {
  const name = selectedProfile.display_name;
  const isOwnProfile = Boolean(state.session && state.profile?.id === selectedProfile.id);
  const month = saoPauloToday().slice(0, 7);
  const availableMonths = [...new Set([month, ...entries.map((entry) => entry.study_date.slice(0, 7))])].sort().reverse();
  const monthlyEntries = entries.filter((entry) => entry.study_date.startsWith(month));
  const allTime = subjectTotals(entries);
  const thisMonth = subjectTotals(monthlyEntries);
  const total = allTime.calculus + allTime.discrete + allTime.preCalculus;
  const hasPhoto = Boolean(selectedProfile.avatar_path);

  profileContent.innerHTML = `
    <header class="profile-hero">
      <div class="profile-photo-wrap">${avatar(name, false, "avatar-profile")}</div>
      <div class="profile-identity"><p class="eyebrow">Perfil de estudo</p><h2 id="profile-title">${escapeHtml(name)}</h2><p>${total} exercícios concluídos</p></div>
      ${isOwnProfile ? `<div class="profile-photo-actions">
        <label class="button button-secondary profile-upload" for="profile-photo-input">Alterar foto</label>
        <input id="profile-photo-input" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" />
        <button id="profile-photo-remove" class="button button-quiet" type="button" ${hasPhoto ? "" : "disabled"}>Usar avatar padrão</button>
      </div>` : '<span class="profile-public-badge">Perfil público</span>'}
    </header>
    <p class="profile-photo-help">${isOwnProfile ? "JPG, PNG ou WebP de até 5 MB." : `Somente ${escapeHtml(name)} pode alterar esta foto.`}</p>
    <div class="profile-period-row"><div><span>Estatísticas</span><strong>Compare sua evolução</strong></div><label>Ver mês<select id="profile-month-select">${availableMonths.map((value) => `<option value="${value}" ${value === month ? "selected" : ""}>${capitalize(monthName(`${value}-01`))}</option>`).join("")}</select></label></div>
    <section class="profile-stats" aria-label="Estatísticas de exercícios">
      ${profileStatsBlock("Histórico completo", "Desde o primeiro registro", allTime)}
      <div id="profile-month-stats">${profileStatsBlock(capitalize(monthName(`${month}-01`)), "Mês selecionado", thisMonth)}</div>
    </section>`;

  if (isOwnProfile) {
    document.querySelector("#profile-photo-input").addEventListener("change", handleProfilePhoto);
    document.querySelector("#profile-photo-remove").addEventListener("click", removeProfilePhoto);
  }
  document.querySelector("#profile-month-select").addEventListener("change", (event) => {
    const selectedMonth = event.target.value;
    const selectedTotals = subjectTotals(entries.filter((entry) => entry.study_date.startsWith(selectedMonth)));
    document.querySelector("#profile-month-stats").innerHTML = profileStatsBlock(capitalize(monthName(`${selectedMonth}-01`)), "Mês selecionado", selectedTotals);
  });
}

function profileStatsBlock(title, subtitle, totals) {
  const total = totals.calculus + totals.discrete + totals.preCalculus;
  return `<article class="profile-stat-block"><div class="profile-stat-heading"><div><span>${escapeHtml(subtitle)}</span><h3>${escapeHtml(title)}</h3></div><strong>${total}</strong></div><div class="profile-subject-list"><div><i class="subject-icon subject-icon-blue">ƒ</i><span>Cálculo</span><b>${totals.calculus}</b></div><div><i class="subject-icon subject-icon-amber">Σ</i><span>Discreta</span><b>${totals.discrete}</b></div><div><i class="subject-icon subject-icon-violet">π</i><span>Pré-Cálculo</span><b>${totals.preCalculus}</b></div></div></article>`;
}

function subjectTotals(entries) {
  return entries.reduce((totals, entry) => ({
    calculus: totals.calculus + (entry.calculus_exercises || 0),
    discrete: totals.discrete + (entry.discrete_exercises || 0),
    preCalculus: totals.preCalculus + (entry.pre_calculus_exercises || 0),
  }), { calculus: 0, discrete: 0, preCalculus: 0 });
}

async function handleProfilePhoto(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    showToast("Escolha uma imagem JPG, PNG ou WebP de até 5 MB.", true);
    event.target.value = "";
    return;
  }

  const button = document.querySelector(".profile-upload");
  button.classList.add("is-loading");
  button.textContent = "Enviando…";
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  const path = `${state.session.user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const oldPath = state.profile.avatar_path;
  const { error: uploadError } = await supabase.storage.from("profile-avatars").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (uploadError) {
    showToast("Não foi possível enviar a foto.", true);
    renderProfileModal(await fetchUserHistory(state.session.user.id), state.profile);
    return;
  }

  const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", state.session.user.id);
  if (updateError) {
    await supabase.storage.from("profile-avatars").remove([path]);
    showToast(readableDatabaseError(updateError), true);
    renderProfileModal(await fetchUserHistory(state.session.user.id), state.profile);
    return;
  }

  if (oldPath) await supabase.storage.from("profile-avatars").remove([oldPath]);
  await refreshProfileVisuals();
  showToast("Foto de perfil atualizada.");
}

async function removeProfilePhoto() {
  const oldPath = state.profile.avatar_path;
  if (!oldPath) return;
  const button = document.querySelector("#profile-photo-remove");
  setButtonLoading(button, true, "Removendo…");
  const { error } = await supabase.from("profiles").update({ avatar_path: null }).eq("id", state.session.user.id);
  if (error) {
    setButtonLoading(button, false, "Usar avatar padrão");
    showToast(readableDatabaseError(error), true);
    return;
  }
  await supabase.storage.from("profile-avatars").remove([oldPath]);
  await refreshProfileVisuals();
  showToast("Avatar padrão restaurado.");
}

async function refreshProfileVisuals() {
  await loadProfiles();
  updateAccountProfile();
  renderProfileModal(await fetchUserHistory(state.session.user.id), state.profile);
  await renderCurrentView();
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
    const [entries, streaks] = await Promise.all([fetchEntries(range.from, range.to), fetchStreaks(route.today), loadProfiles()]);
    if (requestId !== state.requestId) return;
    if (state.profile) updateAccountProfile();

    if (route.view === "week") renderWeek(route, entries, streaks);
    else if (route.view === "calendar") renderCalendar(route, entries, streaks);
    else renderDay(route, entries, streaks);
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

async function fetchStreaks(today) {
  const pageSize = 1000;
  const allEntries = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("study_entries")
      .select("study_date,calculus_exercises,discrete_exercises,pre_calculus_exercises,profile:profiles!study_entries_user_id_fkey(display_name)")
      .lte("study_date", today)
      .order("study_date", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(readableDatabaseError(error));
    allEntries.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }

  return Object.fromEntries(USER_NAMES.map((name) => {
    const activeDays = new Set(allEntries
      .filter((entry) => entry.profile?.display_name === name && entryTotal(entry) > 0)
      .map((entry) => entry.study_date));
    let cursor = activeDays.has(today) ? today : addDays(today, -1);
    let streak = 0;
    while (activeDays.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return [name, streak];
  }));
}

function renderDay(route, entries, streaks) {
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
      <aside class="group-panel"><h2 class="section-title">O grupo nesse dia</h2><div class="group-list">${USER_NAMES.map((name) => groupEntry(name, entries.find((entry) => entry.display_name === name), streaks[name])).join("")}</div></aside>
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

function renderWeek(route, entries, streaks) {
  const start = mondayOf(route.date);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  mainContent.innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">Visão da semana</p><h1>O esforço de cada um, lado a lado.</h1><p class="supporting-copy">${shortDate(days[0])} — ${shortDate(days[6])}</p></div></div>
    <div class="week-cards">${USER_NAMES.map((name) => weekUserCard(name, entries.filter((entry) => entry.display_name === name), streaks[name])).join("")}</div>
    <article class="card">
      <div class="card-header"><h2 class="section-title">Dia a dia</h2></div>
      <div class="week-table-wrap"><div class="week-table">
        <div class="week-row week-head"><span>Pessoa</span>${days.map((day) => `<span>${weekdayAndDay(day)}</span>`).join("")}</div>
        ${USER_NAMES.map((name) => `<div class="week-row"><div class="week-name profile-trigger" data-profile-name="${escapeHtml(name)}" role="button" tabindex="0" aria-label="Abrir perfil de ${escapeHtml(name)}">${avatar(name, true)}<span>${name}</span></div>${days.map((day) => { const entry = entries.find((item) => item.display_name === name && item.study_date === day); const value = entryTotal(entry); return `<a class="week-cell route-link" href="/dia/${day}" data-route="/dia/${day}">${value || '<span class="zero">—</span>'}</a>`; }).join("")}</div>`).join("")}
      </div></div>
    </article>`;
}

function renderCalendar(route, entries, streaks) {
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
    <div class="calendar-legend">${USER_NAMES.map((name) => `<span class="profile-trigger profile-legend-person" data-profile-name="${escapeHtml(name)}" role="button" tabindex="0" aria-label="Abrir perfil de ${escapeHtml(name)}"><i class="${USERS[name].dot}"></i>${name}${streakBadge(streaks[name], name)}</span>`).join("")}</div>`;

  document.querySelectorAll("[data-calendar-move]").forEach((button) => button.addEventListener("click", () => {
    const next = moveMonth(route.month, Number(button.dataset.calendarMove));
    navigate(`/calendario?mes=${next}`);
  }));
  document.querySelector("[data-calendar-today]").addEventListener("click", () => navigate(`/calendario?mes=${route.today.slice(0, 7)}`));
}

function subjectField(title, symbol, tone, prefix, count, note, disabled, notePlaceholder = "Ex: Lista 1") {
  return `<section class="subject"><div class="subject-title"><span class="subject-icon subject-icon-${tone}">${symbol}</span>${title}</div><div class="field-row"><label>Exercícios<input name="${prefix}_exercises" type="number" min="0" max="10000" inputmode="numeric" value="${Number(count) || 0}" ${disabled ? "disabled" : ""}></label><label>Observação<textarea name="${prefix}_note" maxlength="200" placeholder="${escapeHtml(notePlaceholder)}" ${disabled ? "disabled" : ""}>${escapeHtml(note || "")}</textarea></label></div></section>`;
}

function groupEntry(name, entry, streak) {
  const own = !state.isGuest && name === state.profile.display_name;
  return `<article class="group-entry profile-trigger" data-profile-name="${escapeHtml(name)}" role="button" tabindex="0" aria-label="Abrir perfil de ${escapeHtml(name)}"><div class="group-entry-main">${avatar(name)}<div class="group-entry-copy"><strong>${name}${own ? '<span class="you-tag">VOCÊ</span>' : ""}</strong><span>${entry ? `${entryTotal(entry)} exercícios` : "Sem registro"}</span></div>${streakBadge(streak, name)}${entry ? `<div class="entry-counts"><span><b class="blue-text">${entry.calculus_exercises}</b><small>Cálc.</small></span><span><b class="amber-text">${entry.discrete_exercises}</b><small>Disc.</small></span><span><b class="violet-text">${entry.pre_calculus_exercises}</b><small>Pré-Cálc.</small></span></div>` : ""}</div>${entry && (entry.calculus_note || entry.discrete_note || entry.pre_calculus_note) ? `<div class="entry-notes">${entry.calculus_note ? `<p><b>Cálculo:</b> ${escapeHtml(entry.calculus_note)}</p>` : ""}${entry.discrete_note ? `<p><b>Discreta:</b> ${escapeHtml(entry.discrete_note)}</p>` : ""}${entry.pre_calculus_note ? `<p><b>Pré-Cálculo:</b> ${escapeHtml(entry.pre_calculus_note)}</p>` : ""}</div>` : ""}</article>`;
}

function weekUserCard(name, entries, streak) {
  const calculus = entries.reduce((sum, entry) => sum + entry.calculus_exercises, 0);
  const discrete = entries.reduce((sum, entry) => sum + entry.discrete_exercises, 0);
  const preCalculus = entries.reduce((sum, entry) => sum + entry.pre_calculus_exercises, 0);
  return `<article class="card week-user-card profile-trigger" data-profile-name="${escapeHtml(name)}" role="button" tabindex="0" aria-label="Abrir perfil de ${escapeHtml(name)}"><div class="user-heading">${avatar(name)}<div><h2>${name}</h2><p>${calculus + discrete + preCalculus} exercícios</p></div>${streakBadge(streak, name)}</div><div class="week-subjects"><div class="stat-blue"><strong>${calculus}</strong><span>Cálculo</span></div><div class="stat-amber"><strong>${discrete}</strong><span>Discreta</span></div><div class="stat-violet"><strong>${preCalculus}</strong><span>Pré-Cálculo</span></div></div></article>`;
}

function calendarCell(day, route, entries) {
  const total = entries.reduce((sum, entry) => sum + entryTotal(entry), 0);
  const memberTotals = USER_NAMES.map((name) => ({ name, total: entryTotal(entries.find((entry) => entry.display_name === name)) })).filter((item) => item.total > 0);
  return `<a class="calendar-day route-link ${day.slice(0, 7) !== route.month ? "outside" : ""}" href="/dia/${day}" data-route="/dia/${day}"><div class="calendar-day-top"><span class="day-number ${day === route.today ? "today" : ""}">${Number(day.slice(-2))}</span>${total ? `<span class="day-total" title="${total} exercícios da equipe">${total}<span> ex.</span></span>` : ""}</div><div class="calendar-members">${memberTotals.map(({ name, total: memberTotal }) => `<span class="calendar-member ${USERS[name].dot}" title="${name}: ${memberTotal} exercícios">${USERS[name].calendarInitial} - ${memberTotal}</span>`).join("")}</div></a>`;
}

function stat(label, value, tone) { return `<div class="stat stat-${tone}"><p>${label}</p><strong>${value}</strong></div>`; }
function avatar(name, small = false, extraClass = "") { const user = USERS[name] || { initials: "?", avatar: "avatar-tori" }; const photoPath = state.profiles[name]?.avatar_path; return `<span class="avatar ${small ? "avatar-small" : ""} ${user.avatar}${photoPath ? " has-photo" : ""} ${extraClass}" title="${escapeHtml(name)}">${photoPath ? `<img src="${profilePhotoUrl(photoPath)}" alt="">` : user.initials}</span>`; }
function profilePhotoUrl(path) { return supabase.storage.from("profile-avatars").getPublicUrl(path).data.publicUrl; }
function streakBadge(value = 0, name = "") { const label = `${value} ${value === 1 ? "dia" : "dias"} de frequência`; return `<span class="streak-badge${value ? " is-active" : ""}" title="${escapeHtml(name ? `${name}: ${label}` : label)}" aria-label="${escapeHtml(label)}"><span class="streak-fire" aria-hidden="true">🔥</span><b>${value}</b></span>`; }
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
