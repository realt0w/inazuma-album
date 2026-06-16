const state = {
  mode: "players",
  players: [],
  statTables: {},
  filtered: [],
  selectedId: null,
  coaches: [],
  filteredCoaches: [],
  selectedCoachId: null,
  filters: {
    query: "",
    team: "all",
    position: "all",
    element: "all",
    style: "all",
    season: "all",
    sort: "name_asc",
    playableOnly: true,
  },
  coachFilters: {
    query: "",
    sort: "name_asc",
    showEnemy: false,
  },
  simulator: {
    level: 300,
    awakeningCode: 9,
    equipmentLevels: {},
    equipmentLevelsByPosition: {},
  },
  account: {
    user: null,
    avatars: [],
    collection: null,
    authView: "login",
    pendingEmail: "",
    notice: "",
    error: "",
  },
  publicProfile: null,
  publicProfileUsername: "",
};

const labels = {
  elements: {
    fire: "Feu",
    wood: "Bois",
    wind: "Vent",
    mountain: "Montagne",
    none: "Aucun",
  },
  positions: {
    GK: "Gardien",
    DF: "Défenseur",
    MF: "Milieu",
    FW: "Attaquant",
  },
  stats: {
    tp: "TP",
    kick: "Frappe",
    technique: "Technique",
    block: "Blocage",
    catch: "Arrêt",
    speed: "Vitesse",
  },
  moveTypes: {
    shot: "Tir",
    dribble: "Dribble",
    block: "Blocage",
    save: "Arrêt",
  },
};

const awakeningTiers = {
  0: { label: "NORMAL PLAYER", slug: "normal" },
  1: { label: "NORMAL PLAYER+", slug: "normal-plus" },
  2: { label: "GROWING PLAYER", slug: "growing" },
  3: { label: "GROWING PLAYER+", slug: "growing-plus" },
  4: { label: "ADVANCED PLAYER", slug: "advanced" },
  5: { label: "ADVANCED PLAYER+", slug: "advanced-plus" },
  6: { label: "TOP PLAYER", slug: "top" },
  7: { label: "TOP PLAYER+", slug: "top-plus" },
  8: { label: "LEGENDARY PLAYER", slug: "legendary" },
  9: { label: "LEGENDARY PLAYER+", slug: "legendary-plus" },
};
const SKILL_POWER_WEIGHT = 0.67310925;
const STAT_KEYS = ["kick", "technique", "block", "catch", "speed"];
const DEFAULT_EQUIPMENT_LEVEL = 1;
const MAIN_COLLECTION_SLOT_COUNT = 5;
const STORAGE_KEY = "inazuma-album-state-v2";
const LANGUAGE_STORAGE_KEY = "inazuma-album-language";
const AVAILABLE_MODES = ["players", "simulator", "collection", "publicProfile"];
const API_BASE_URL = String(window.INAZUMA_CONFIG?.apiBaseUrl || "http://localhost:4000").replace(/\/+$/, "");
const EQUIPMENT_POSITIONS = ["FW", "MF", "DF", "GK"];
const EQUIPMENT_SCREEN_ORDER = [1, 2, 3, 5, 6, 4];
const EQUIPMENT_SLOT_LABELS = {
  "シューズ": "Chaussures",
  "ミサンガ": "Bracelet",
  "すね当て": "Chaussettes",
  "リストバンド": "Poignet",
  "グローブ": "Gants",
  "ペンダント": "Pendentif",
};

const els = {
  sectionEyebrow: document.querySelector("#sectionEyebrow"),
  modeButtons: [...document.querySelectorAll(".mode-tab")],
  dbMeta: document.querySelector("#dbMeta"),
  searchInput: document.querySelector("#searchInput"),
  teamFilter: document.querySelector("#teamFilter"),
  positionFilter: document.querySelector("#positionFilter"),
  elementFilter: document.querySelector("#elementFilter"),
  styleFilter: document.querySelector("#styleFilter"),
  seasonFilter: document.querySelector("#seasonFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  playableToggle: document.querySelector("#playableToggle"),
  resultCount: document.querySelector("#resultCount"),
  albumSubhead: document.querySelector("#albumSubhead"),
  playerGrid: document.querySelector("#playerGrid"),
  playerDetail: document.querySelector("#playerDetail"),
  emptyTemplate: document.querySelector("#emptyTemplate"),
  skillModal: document.querySelector("#skillModal"),
  skillModalBody: document.querySelector("#skillModalBody"),
  skillModalClose: document.querySelector("#skillModalClose"),
  authOpenButton: document.querySelector("#authOpenButton"),
  authButtonLabel: document.querySelector("#authButtonLabel"),
  authModal: document.querySelector("#authModal"),
  authModalBody: document.querySelector("#authModalBody"),
  authModalClose: document.querySelector("#authModalClose"),
};

init();

async function init() {
  bindEvents();
  try {
    const db = await loadAlbumDatabase();
    state.players = db.players || [];
    state.statTables = db.stat_tables || {};
    state.coaches = [];
    state.selectedId = state.players.find((player) => player.playable)?.id || state.players[0]?.id || null;
    state.selectedCoachId = null;
    restoreSavedState();
    els.dbMeta.textContent = `${db.playable_count || 0} joueurs jouables / ${db.count || state.players.length} total - MAJ ${db.updated_at || "inconnue"}`;
    await bootstrapAccount();
    const publicUsername = publicProfileUsernameFromUrl();
    if (publicUsername) {
      await loadPublicProfile(publicUsername);
      state.mode = "publicProfile";
    }
    hydrateFilters();
    setMode(state.mode);
    finishBoot();
  } catch (error) {
    els.dbMeta.textContent = "Erreur de chargement";
    els.playerDetail.innerHTML = `<div class="empty-state"><h2>Lecture impossible</h2><p>${escapeHtml(error.message)}</p></div>`;
    finishBoot();
  }
}

function finishBoot() {
  document.body.classList.remove("is-booting");
  document.body.classList.add("is-ready");
}

async function loadAlbumDatabase() {
  const endpoints = ["data/album.json", "api/album"];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const db = await response.json();
      if (!response.ok) {
        throw new Error(db.error || "Erreur API");
      }
      return db;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Base album introuvable");
}

async function loadCoachDatabase() {
  const endpoints = ["data/coaches.json", "api/coaches"];
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const db = await response.json();
      if (!response.ok) {
        throw new Error(db.error || "Erreur API");
      }
      return db;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Base entraîneurs introuvable");
}

function restoreSavedState() {
  const saved = readSavedState();
  if (!saved) {
    return;
  }

  if (saved.filters && typeof saved.filters === "object") {
    state.filters = {
      ...state.filters,
      ...pickObject(saved.filters, ["query", "team", "position", "element", "style", "season", "sort", "playableOnly"]),
    };
    state.filters.query = String(state.filters.query || "").toLowerCase();
    state.filters.playableOnly = Boolean(state.filters.playableOnly);
  }
  if (saved.coachFilters && typeof saved.coachFilters === "object") {
    state.coachFilters = {
      ...state.coachFilters,
      ...pickObject(saved.coachFilters, ["query", "sort", "showEnemy"]),
    };
    state.coachFilters.query = String(state.coachFilters.query || "").toLowerCase();
    state.coachFilters.showEnemy = Boolean(state.coachFilters.showEnemy);
  }
  if (saved.simulator && typeof saved.simulator === "object") {
    state.simulator = {
      ...state.simulator,
      ...pickObject(saved.simulator, ["level", "awakeningCode", "equipmentLevels", "equipmentLevelsByPosition"]),
    };
    state.simulator.level = clampNumber(state.simulator.level, 1, 300);
    state.simulator.awakeningCode = Number.isFinite(Number(state.simulator.awakeningCode)) ? Number(state.simulator.awakeningCode) : 9;
    state.simulator.equipmentLevels = normalizeSavedEquipmentLevels(state.simulator.equipmentLevels);
    state.simulator.equipmentLevelsByPosition = normalizeSavedEquipmentByPosition(state.simulator.equipmentLevelsByPosition);
  }

  if (saved.selectedId != null && state.players.some((player) => String(player.id) === String(saved.selectedId))) {
    state.selectedId = String(saved.selectedId);
  }
  if (saved.selectedCoachId != null && state.coaches.some((coach) => String(coach.id) === String(saved.selectedCoachId))) {
    state.selectedCoachId = String(saved.selectedCoachId);
  }
}

function readSavedState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mode: state.mode === "publicProfile" ? "players" : state.mode,
        selectedId: state.selectedId,
        selectedCoachId: state.selectedCoachId,
        filters: state.filters,
        coachFilters: state.coachFilters,
        simulator: state.simulator,
      }),
    );
  } catch {
    // Ignore storage failures, the app can still work without persistence.
  }
}

function pickObject(value, keys) {
  return Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(value, key)).map((key) => [key, value[key]]));
}

function normalizeSavedEquipmentLevels(levels) {
  if (!levels || typeof levels !== "object") {
    return {};
  }
  return Object.fromEntries(Object.entries(levels).map(([slot, level]) => [slot, clampNumber(level, 1, 300)]));
}

function normalizeSavedEquipmentByPosition(levelsByPosition) {
  if (!levelsByPosition || typeof levelsByPosition !== "object") {
    return {};
  }
  return Object.fromEntries(EQUIPMENT_POSITIONS.map((position) => [position, normalizeSavedEquipmentLevels(levelsByPosition[position])]));
}

function bindEvents() {
  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode || "players"));
  });

  els.authOpenButton?.addEventListener("click", () => openAuthModal(state.account.user ? "profile" : "login"));
  els.authModalClose?.addEventListener("click", closeAuthModal);
  els.authModal?.addEventListener("click", (event) => {
    if (event.target === els.authModal) {
      closeAuthModal();
    }
  });

  els.searchInput.addEventListener("input", (event) => {
    const value = event.target.value.trim().toLowerCase();
    if (state.mode === "coaches") {
      state.coachFilters.query = value;
    } else {
      state.filters.query = value;
    }
    applyCurrentFilters();
  });

  for (const [key, element] of [
    ["team", els.teamFilter],
    ["position", els.positionFilter],
    ["element", els.elementFilter],
    ["style", els.styleFilter],
    ["season", els.seasonFilter],
  ]) {
    element.addEventListener("change", (event) => {
      state.filters[key] = event.target.value;
      applyCurrentFilters();
    });
  }

  els.sortSelect.addEventListener("change", (event) => {
    if (state.mode === "coaches") {
      state.coachFilters.sort = event.target.value;
    } else {
      state.filters.sort = event.target.value;
    }
    applyCurrentFilters();
  });

  els.playableToggle.addEventListener("click", () => {
    if (state.mode === "collection") {
      state.filters.playableOnly = true;
      applyCurrentFilters();
      return;
    }
    if (state.mode === "coaches") {
      state.coachFilters.showEnemy = !state.coachFilters.showEnemy;
    } else {
      state.filters.playableOnly = !state.filters.playableOnly;
    }
    applyCurrentFilters();
  });

  els.skillModalClose.addEventListener("click", closeSkillModal);
  els.skillModal.addEventListener("click", (event) => {
    if (event.target === els.skillModal) {
      closeSkillModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.skillModal.hidden) {
      closeSkillModal();
    }
    if (event.key === "Escape" && els.authModal && !els.authModal.hidden) {
      closeAuthModal();
    }
  });
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (!headers["X-API-Lang"]) {
    headers["X-API-Lang"] = currentLanguage();
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || "Erreur API");
  }
  return data;
}

function currentLanguage() {
  let configured = String(window.INAZUMA_CONFIG?.language || "fr").toLowerCase();
  try {
    configured = String(localStorage.getItem(LANGUAGE_STORAGE_KEY) || configured).toLowerCase();
  } catch {
    // Keep the default app language when localStorage is unavailable.
  }
  return configured.startsWith("en") ? "en" : "fr";
}

async function bootstrapAccount() {
  renderAuthButton();
  await refreshSession({ silent: true });
}

async function refreshSession({ silent = false } = {}) {
  try {
    const data = await apiFetch("/api/auth/me");
    state.account.user = data.user;
    state.account.error = "";
    await Promise.all([loadAvatars(), loadCollection()]);
  } catch (error) {
    state.account.user = null;
    state.account.collection = null;
    if (!silent) {
      state.account.error = error.message;
    }
  }
  renderAuthButton();
}

async function loadAvatars() {
  try {
    const data = await apiFetch("/api/avatars");
    state.account.avatars = data.avatars || [];
  } catch {
    state.account.avatars = [];
  }
}

async function loadCollection() {
  if (!state.account.user) {
    state.account.collection = null;
    return;
  }
  const data = await apiFetch("/api/collection");
  state.account.collection = data.collection;
}

async function loadPublicProfile(username) {
  state.publicProfileUsername = username;
  state.publicProfile = null;
  try {
    const data = await apiFetch(`/api/public/profile/${encodeURIComponent(username)}`);
    state.publicProfile = data.profile;
    state.publicProfileUsername = data.profile?.username || username;
  } catch (error) {
    state.publicProfile = { error: error.message, username };
  }
}

function publicProfileUsernameFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("publicProfile");
  if (fromQuery) {
    return fromQuery.trim();
  }
  const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
  const reserved = ["", "index.html", "public", "inazuma-album", "assets", "data", "api"];
  const firstSegment = path.split("/")[0] || "";
  if (!firstSegment || reserved.includes(firstSegment) || firstSegment.includes(".") || path.includes(".")) {
    return "";
  }
  return firstSegment;
}

function renderAuthButton() {
  if (!els.authOpenButton || !els.authButtonLabel) {
    return;
  }
  const user = state.account.user;
  els.authOpenButton.classList.toggle("is-authenticated", Boolean(user));
  const avatar = els.authOpenButton.querySelector(".auth-avatar");
  if (user) {
    els.authButtonLabel.textContent = user.username;
    if (avatar) {
      avatar.innerHTML = user.avatar ? `<img src="${escapeAttr(assetPath(user.avatar))}" alt="" />` : "";
    }
  } else {
    els.authButtonLabel.textContent = "Login / Register";
    if (avatar) {
      avatar.innerHTML = "";
    }
  }
}

function openAuthModal(view = "login") {
  state.account.authView = view;
  state.account.error = "";
  state.account.notice = "";
  renderAuthModal();
  els.authModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeAuthModal() {
  if (!els.authModal) {
    return;
  }
  els.authModal.hidden = true;
  els.authModalBody.innerHTML = "";
  if (!els.skillModal || els.skillModal.hidden) {
    document.body.classList.remove("modal-open");
  }
}

function setAuthNotice(message) {
  state.account.notice = message || "";
  state.account.error = "";
}

function setAuthError(error) {
  state.account.error = error?.message || String(error || "");
  state.account.notice = "";
}

function renderAuthModal() {
  if (!els.authModalBody) {
    return;
  }
  const view = state.account.user && state.account.authView !== "deleteAccount" ? "profile" : state.account.authView;
  const notice = state.account.notice ? `<p class="auth-notice">${escapeHtml(state.account.notice)}</p>` : "";
  const error = state.account.error ? `<p class="auth-error">${escapeHtml(state.account.error)}</p>` : "";
  if (view === "register") {
    els.authModalBody.innerHTML = `
      <header class="auth-head">
        <p>Compte Inazuma Cross Album</p>
        <h2 id="authModalTitle">Register</h2>
      </header>
      <form id="registerForm" class="auth-form">
        ${notice}${error}
        <label><span>Email</span><input name="email" type="email" autocomplete="email" required /></label>
        <label><span>Username</span><input name="username" type="text" autocomplete="username" minlength="3" maxlength="24" required /></label>
        <label class="privacy-consent">
          <input name="privacyAccepted" type="checkbox" required />
          <span>J'accepte la <button class="inline-link" type="button" id="privacyPolicyButton">privacy policy</button>.</span>
        </label>
        <button class="primary-action" type="submit">Creer le compte</button>
        <button class="link-action" type="button" data-auth-view="login">J'ai deja un compte</button>
      </form>
    `;
    bindAuthViewLinks();
    els.authModalBody.querySelector("#registerForm").addEventListener("submit", handleRegister);
    els.authModalBody.querySelector("#privacyPolicyButton").addEventListener("click", openPrivacyPolicyModal);
    return;
  }
  if (view === "deleteAccount") {
    renderDeleteAccountModal(notice, error);
    return;
  }
  if (view === "verify" || view === "loginCode") {
    const isLoginCode = view === "loginCode";
    els.authModalBody.innerHTML = `
      <header class="auth-head">
        <p>${isLoginCode ? "Connexion par email" : "Verification email"}</p>
        <h2 id="authModalTitle">Code a 6 chiffres</h2>
      </header>
      <form id="verifyForm" class="auth-form" data-auth-purpose="${isLoginCode ? "login" : "register"}">
        ${notice}${error}
        <label><span>Email</span><input name="email" type="email" value="${escapeAttr(state.account.pendingEmail)}" required /></label>
        <label><span>Code</span><input name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required /></label>
        <button class="primary-action" type="submit">${isLoginCode ? "Se connecter" : "Verifier"}</button>
        <button class="link-action" type="button" id="resendVerificationButton">Renvoyer le code</button>
        <button class="link-action" type="button" data-auth-view="login">Retour login</button>
      </form>
    `;
    bindAuthViewLinks();
    els.authModalBody.querySelector("#verifyForm").addEventListener("submit", handleVerify);
    els.authModalBody.querySelector("#resendVerificationButton").addEventListener("click", handleResendVerification);
    return;
  }
  if (view === "profile") {
    renderProfileModal(notice, error);
    return;
  }
  els.authModalBody.innerHTML = `
    <header class="auth-head">
      <p>Compte Inazuma Cross Album</p>
      <h2 id="authModalTitle">Login</h2>
    </header>
    <form id="loginForm" class="auth-form">
      ${notice}${error}
      <label><span>Email</span><input name="email" type="email" autocomplete="email" required /></label>
      <button class="primary-action" type="submit">Recevoir un code</button>
      <button class="link-action" type="button" data-auth-view="register">Creer un compte</button>
      <button class="link-action" type="button" data-auth-view="verify">Verifier un code</button>
    </form>
  `;
  bindAuthViewLinks();
  els.authModalBody.querySelector("#loginForm").addEventListener("submit", handleLogin);
}

function renderProfileModal(notice, error) {
  const user = state.account.user;
  if (!user) {
    state.account.authView = "login";
    renderAuthModal();
    return;
  }
  const avatars = state.account.avatars.length ? state.account.avatars : [user.avatar].filter(Boolean);
  const selectedAvatar = user.avatar || avatars[0] || "";
  els.authModalBody.innerHTML = `
    <header class="auth-head">
      <p>Profil</p>
      <h2 id="authModalTitle">${escapeHtml(user.username)}</h2>
    </header>
    <form id="profileForm" class="auth-form">
      ${notice}${error}
      <div class="profile-summary">
        <span class="profile-avatar profile-avatar-preview">${selectedAvatar ? `<img src="${escapeAttr(assetPath(selectedAvatar))}" alt="" />` : ""}</span>
        <div>
          <strong>${escapeHtml(user.username)}</strong>
          <span>${escapeHtml(user.email)}</span>
        </div>
      </div>
      <label><span>Numero serveur</span><input name="serverNumber" type="number" min="1" max="99999" value="${escapeAttr(user.serverNumber || "")}" /></label>
      <input name="avatar" type="hidden" value="${escapeAttr(selectedAvatar)}" />
      <div class="avatar-preview-grid" aria-label="Avatar">
        ${avatars
          .slice(0, 42)
          .map(
            (avatar) => `
              <button class="avatar-choice${avatar === selectedAvatar ? " is-active" : ""}" type="button" data-avatar="${escapeAttr(avatar)}" aria-pressed="${avatar === selectedAvatar ? "true" : "false"}">
                <img src="${escapeAttr(assetPath(avatar))}" alt="" />
              </button>
            `,
          )
          .join("")}
      </div>
      <button class="primary-action" type="submit">Enregistrer</button>
      <button class="secondary-action" type="button" id="logoutButton">Logout</button>
      <button class="danger-action" type="button" id="deleteAccountButton">Supprimer compte</button>
    </form>
  `;
  const avatarInput = els.authModalBody.querySelector("input[name='avatar']");
  const avatarPreview = els.authModalBody.querySelector(".profile-avatar-preview");
  els.authModalBody.querySelectorAll("[data-avatar]").forEach((button) => {
    button.addEventListener("click", () => {
      avatarInput.value = button.dataset.avatar || "";
      if (avatarPreview) {
        avatarPreview.innerHTML = avatarInput.value ? `<img src="${escapeAttr(assetPath(avatarInput.value))}" alt="" />` : "";
      }
      els.authModalBody.querySelectorAll(".avatar-choice").forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });
    });
  });
  els.authModalBody.querySelector("#profileForm").addEventListener("submit", handleProfileUpdate);
  els.authModalBody.querySelector("#logoutButton").addEventListener("click", handleLogout);
  els.authModalBody.querySelector("#deleteAccountButton").addEventListener("click", handleDeleteAccountRequest);
}

function renderDeleteAccountModal(notice, error) {
  const user = state.account.user;
  if (!user) {
    state.account.authView = "login";
    renderAuthModal();
    return;
  }
  els.authModalBody.innerHTML = `
    <header class="auth-head danger-head">
      <p>Suppression de compte</p>
      <h2 id="authModalTitle">Code a 6 chiffres</h2>
    </header>
    <form id="deleteAccountForm" class="auth-form">
      ${notice}${error}
      <p class="auth-warning">Cette action supprime votre email, username, profil et collection.</p>
      <label><span>Code recu par email</span><input name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required /></label>
      <button class="danger-action" type="submit">Supprimer definitivement</button>
      <button class="link-action" type="button" data-auth-view="profile">Retour profil</button>
    </form>
  `;
  bindAuthViewLinks();
  els.authModalBody.querySelector("#deleteAccountForm").addEventListener("submit", handleDeleteAccountConfirm);
}

function bindAuthViewLinks() {
  els.authModalBody.querySelectorAll("[data-auth-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.account.authView = button.dataset.authView || "login";
      state.account.error = "";
      state.account.notice = "";
      renderAuthModal();
    });
  });
}

async function handleRegister(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await apiFetch("/api/auth/register", {
      method: "POST",
      body: {
        email: form.get("email"),
        username: form.get("username"),
        privacyAccepted: form.get("privacyAccepted") === "on",
      },
    });
    state.account.pendingEmail = String(form.get("email") || "");
    state.account.authView = "verify";
    setAuthNotice(data.message);
  } catch (error) {
    setAuthError(error);
  }
  renderAuthModal();
}

function openPrivacyPolicyModal() {
  els.skillModal.classList.remove("is-equipment-modal");
  els.skillModal.classList.add("is-privacy-modal");
  els.skillModalBody.innerHTML = `
    <header class="modal-skill-head">
      <span></span>
      <div>
        <p>Compte Inazuma Cross Album</p>
        <h2 id="skillModalTitle">Privacy policy</h2>
      </div>
    </header>
    <div class="privacy-policy-body">
      <p>Les donnees de compte servent uniquement a faire fonctionner le profil, la collection et la connexion par email.</p>
      <p>Aucune donnee n'est partagee avec des tiers ou vendue.</p>
      <p>En cas de probleme avec vos donnees, contactez <a href="mailto:tom@ownstudio.fr">tom@ownstudio.fr</a>.</p>
      <p>Pour supprimer votre profil, allez sur votre profil et cliquez sur le bouton supprimer compte. La suppression demande un code de validation a 6 chiffres envoye par email.</p>
    </div>
  `;
  els.skillModal.hidden = false;
  document.body.classList.add("modal-open");
  els.skillModalClose.focus();
}

async function handleDeleteAccountRequest() {
  try {
    const data = await apiFetch("/api/auth/delete-account/request", { method: "POST" });
    state.account.authView = "deleteAccount";
    setAuthNotice(data.message);
  } catch (error) {
    setAuthError(error);
  }
  renderAuthModal();
}

async function handleDeleteAccountConfirm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await apiFetch("/api/auth/delete-account/confirm", {
      method: "POST",
      body: {
        code: form.get("code"),
      },
    });
    state.account.user = null;
    state.account.collection = null;
    state.account.avatars = [];
    state.account.authView = "login";
    state.account.notice = "";
    state.account.error = "";
    renderAuthButton();
    closeAuthModal();
    applyCurrentFilters();
  } catch (error) {
    setAuthError(error);
    renderAuthModal();
  }
}

async function handleVerify(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const purpose = event.currentTarget.dataset.authPurpose || "register";
  const endpoint = purpose === "login" ? "/api/auth/verify-login" : "/api/auth/verify-email";
  try {
    const data = await apiFetch(endpoint, {
      method: "POST",
      body: {
        email: form.get("email"),
        code: form.get("code"),
      },
    });
    state.account.user = data.user;
    await Promise.all([loadAvatars(), loadCollection()]);
    renderAuthButton();
    closeAuthModal();
    applyCurrentFilters();
  } catch (error) {
    setAuthError(error);
    renderAuthModal();
  }
}

async function handleResendVerification() {
  const email = els.authModalBody.querySelector("input[name='email']")?.value || state.account.pendingEmail;
  const isLoginCode = state.account.authView === "loginCode";
  try {
    const data = await apiFetch(isLoginCode ? "/api/auth/login" : "/api/auth/resend-verification", {
      method: "POST",
      body: { email },
    });
    state.account.pendingEmail = email;
    if (data.purpose === "register") {
      state.account.authView = "verify";
    }
    setAuthNotice(data.message);
  } catch (error) {
    setAuthError(error);
  }
  renderAuthModal();
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: {
        email: form.get("email"),
      },
    });
    state.account.pendingEmail = String(form.get("email") || "");
    state.account.authView = data.purpose === "register" ? "verify" : "loginCode";
    setAuthNotice(data.message);
  } catch (error) {
    setAuthError(error);
  }
  renderAuthModal();
}

async function handleProfileUpdate(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await apiFetch("/api/users/me/profile", {
      method: "PATCH",
      body: {
        avatar: form.get("avatar"),
        serverNumber: form.get("serverNumber") || null,
      },
    });
    state.account.user = data.user;
    setAuthNotice(data.message);
    renderAuthButton();
  } catch (error) {
    setAuthError(error);
  }
  renderAuthModal();
  applyCurrentFilters();
}

async function handleLogout() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Cookie removal is still reflected client-side.
  }
  state.account.user = null;
  state.account.collection = null;
  renderAuthButton();
  closeAuthModal();
  applyCurrentFilters();
}

function setMode(mode) {
  state.mode = AVAILABLE_MODES.includes(mode) ? mode : "players";
  document.body.dataset.mode = state.mode;
  els.modeButtons.forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  if (state.mode === "publicProfile") {
    els.sectionEyebrow.textContent = "Profil public";
    els.searchInput.placeholder = "Profil public";
    els.searchInput.value = "";
    els.albumSubhead.textContent = state.publicProfileUsername ? `/${state.publicProfileUsername}` : "Profil partage";
    setSortOptions([["name_asc", "Nom"]]);
    els.sortSelect.value = "name_asc";
  } else if (state.mode === "collection") {
    state.filters.playableOnly = true;
    els.sectionEyebrow.textContent = "Ma collection";
    els.searchInput.placeholder = "Ajouter un joueur jouable...";
    els.searchInput.value = state.filters.query;
    els.albumSubhead.textContent = "Gestion du profil, des 5 principaux et des equipements";
    setSortOptions([
      ["name_asc", "Nom"],
      ["power_desc", "Puissance"],
      ["rarity_desc", "Etoiles"],
    ]);
    els.sortSelect.value = state.filters.sort;
  } else if (state.mode === "coaches") {
    els.sectionEyebrow.textContent = "Album entraîneurs";
    els.searchInput.placeholder = "Nom, code, formation, passif...";
    els.searchInput.value = state.coachFilters.query;
    els.albumSubhead.textContent = "Lv.10 / passif max";
    setSortOptions([
      ["name_asc", "Nom"],
      ["power_desc", "Bonus global"],
      ["code_asc", "Code"],
    ]);
    els.sortSelect.value = state.coachFilters.sort;
  } else if (state.mode === "simulator") {
    els.sectionEyebrow.textContent = "Simulateur joueur";
    els.searchInput.placeholder = "Choisir un joueur, équipe, technique...";
    els.searchInput.value = state.filters.query;
    els.albumSubhead.textContent = "Stats selon niveau / éveil / équipements";
    setSortOptions([
      ["name_asc", "Nom"],
      ["power_desc", "Puissance"],
      ["rarity_desc", "Étoiles"],
    ]);
    els.sortSelect.value = state.filters.sort;
  } else {
    els.sectionEyebrow.textContent = "Album joueurs";
    els.searchInput.placeholder = "Nom, équipe, technique...";
    els.searchInput.value = state.filters.query;
    els.albumSubhead.textContent = "Lv.300 / éveil max / équipement Lv.1";
    setSortOptions([
      ["name_asc", "Nom"],
      ["power_desc", "Puissance"],
      ["rarity_desc", "Étoiles"],
    ]);
    els.sortSelect.value = state.filters.sort;
  }

  applyCurrentFilters();
}

function setSortOptions(options) {
  els.sortSelect.innerHTML = options
    .map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`)
    .join("");
}

function applyCurrentFilters() {
  if (state.mode === "publicProfile") {
    renderPublicProfileView();
    saveState();
    return;
  }
  if (state.mode === "coaches") {
    applyCoachFilters();
    return;
  }
  applyFilters();
}

function hydrateFilters() {
  syncFilterOptions();
}

function setOptions(select, allLabel, values, labeler = (value) => value) {
  select.innerHTML = [
    `<option value="all">${escapeHtml(allLabel)}</option>`,
    ...values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(labeler(value))}</option>`),
  ].join("");
}

function syncFilterOptions() {
  let changed = false;
  for (let index = 0; index < 4; index += 1) {
    const passChanged = updateFilterOptionsPass();
    changed = changed || passChanged;
    if (!passChanged) {
      break;
    }
  }
  return changed;
}

function updateFilterOptionsPass() {
  let changed = false;
  const specs = [
    {
      key: "team",
      element: els.teamFilter,
      allLabel: "Toutes",
      values: (players) => uniqueTagValues(players, "team"),
    },
    {
      key: "position",
      element: els.positionFilter,
      allLabel: "Tous",
      values: (players) => uniqueValues(players.map((player) => player.position?.code).filter(Boolean)),
      labeler: (value) => `${value} - ${labels.positions[value] || value}`,
    },
    {
      key: "element",
      element: els.elementFilter,
      allLabel: "Tous",
      values: (players) => uniqueValues(players.map((player) => player.element?.code).filter(Boolean)),
      labeler: (value) => labels.elements[value] || value,
    },
    {
      key: "style",
      element: els.styleFilter,
      allLabel: "Tous",
      values: (players) => uniqueTagValues(players, "play_style"),
    },
    {
      key: "season",
      element: els.seasonFilter,
      allLabel: "Toutes",
      values: (players) => uniqueTagValues(players, "season"),
    },
  ];

  for (const spec of specs) {
    const values = spec.values(playersForFilterOptions(spec.key));
    if (state.filters[spec.key] !== "all" && !values.includes(state.filters[spec.key])) {
      state.filters[spec.key] = "all";
      changed = true;
    }
    setOptions(spec.element, spec.allLabel, values, spec.labeler);
    spec.element.value = state.filters[spec.key];
  }

  return changed;
}

function playersForFilterOptions(excludedKey) {
  const filters = state.filters;
  return state.players.filter((player) => {
    const matchesQuery = !filters.query || searchableText(player).includes(filters.query);
    const matchesTeam = excludedKey === "team" || filters.team === "all" || hasTag(player, "team", filters.team);
    const matchesPosition = excludedKey === "position" || filters.position === "all" || player.position?.code === filters.position;
    const matchesElement = excludedKey === "element" || filters.element === "all" || player.element?.code === filters.element;
    const matchesStyle = excludedKey === "style" || filters.style === "all" || hasTag(player, "play_style", filters.style);
    const matchesSeason = excludedKey === "season" || filters.season === "all" || hasTag(player, "season", filters.season);
    const matchesPlayable = !filters.playableOnly || player.playable;
    return matchesPlayable && matchesQuery && matchesTeam && matchesPosition && matchesElement && matchesStyle && matchesSeason;
  });
}

function uniqueTagValues(players, kind) {
  return uniqueValues(
    players
      .flatMap((player) => player.tags.filter((tag) => tag.kind === kind).map(tagLabel))
      .filter(Boolean),
  );
}

function uniqueValues(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), "fr"));
}

function maxBy(items, key) {
  return items.reduce((best, item) => {
    if (!best) {
      return item;
    }
    return Number(item?.[key] || 0) > Number(best?.[key] || 0) ? item : best;
  }, null);
}

function applyFilters() {
  if (state.mode === "collection") {
    state.filters.playableOnly = true;
  }
  syncFilterOptions();
  const filters = state.filters;
  state.filtered = state.players
    .filter((player) => {
      const matchesQuery = !filters.query || searchableText(player).includes(filters.query);
      const matchesTeam = filters.team === "all" || hasTag(player, "team", filters.team);
      const matchesPosition = filters.position === "all" || player.position?.code === filters.position;
      const matchesElement = filters.element === "all" || player.element?.code === filters.element;
      const matchesStyle = filters.style === "all" || hasTag(player, "play_style", filters.style);
      const matchesSeason = filters.season === "all" || hasTag(player, "season", filters.season);
      const matchesPlayable = !filters.playableOnly || player.playable;
      return matchesPlayable && matchesQuery && matchesTeam && matchesPosition && matchesElement && matchesStyle && matchesSeason;
    })
    .sort(sortPlayers(filters.sort));

  if (!state.filtered.some((player) => player.id === state.selectedId)) {
    state.selectedId = state.filtered[0]?.id || null;
  }

  renderGrid();
  renderDetail();
  saveState();
}

function applyCoachFilters() {
  const filters = state.coachFilters;
  state.filteredCoaches = state.coaches
    .filter((coach) => {
      const matchesQuery = !filters.query || searchableCoachText(coach).includes(filters.query);
      const matchesEnemy = filters.showEnemy || !coach.enemy_only;
      return matchesQuery && matchesEnemy;
    })
    .sort(sortCoaches(filters.sort));

  if (!state.filteredCoaches.some((coach) => coach.id === state.selectedCoachId)) {
    state.selectedCoachId = state.filteredCoaches[0]?.id || null;
  }

  renderCoachGrid();
  renderCoachDetail();
  saveState();
}

function searchableCoachText(coach) {
  return [
    coach.id,
    coach.code,
    coach.formation_code,
    coach.names?.fr,
    coach.names?.display_fr,
    coach.names?.jp,
    coach.passive?.name,
    coach.passive?.current_description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortCoaches(sort) {
  return (a, b) => {
    if (sort === "power_desc") {
      return (b.total_power || 0) - (a.total_power || 0) || displayName(a).localeCompare(displayName(b), "fr");
    }
    if (sort === "code_asc") {
      return (a.code || 0) - (b.code || 0);
    }
    return displayName(a).localeCompare(displayName(b), "fr");
  };
}

function renderCoachGrid() {
  const count = state.filteredCoaches.length;
  const showingEnemy = state.coachFilters.showEnemy;
  els.resultCount.textContent = `${count} entraîneur${count > 1 ? "s" : ""}${showingEnemy ? "" : " disponibles"}`;
  els.playableToggle.innerHTML = `<span>Tous</span><span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>`;
  els.playableToggle.setAttribute("aria-pressed", String(showingEnemy));
  els.playableToggle.setAttribute("aria-label", showingEnemy ? "Masquer les entraîneurs adverses" : "Afficher tous les entraîneurs");

  if (!count) {
    els.playerGrid.innerHTML = "";
    return;
  }

  els.playerGrid.innerHTML = state.filteredCoaches
    .map((coach) => {
      const active = coach.id === state.selectedCoachId ? " is-active" : "";
      const enemyClass = coach.enemy_only ? " is-npc" : "";
      const portrait = imageUrl(coach, "portrait") || imageUrl(coach, "fullbody");
      return `
        <button class="album-card coach-card${active}${enemyClass}" type="button" data-coach-id="${escapeAttr(coach.id)}">
          <span class="portrait-frame coach-portrait-frame">
            ${portrait ? `<img src="${escapeAttr(portrait)}" alt="" />` : `<span>${escapeHtml(initials(displayName(coach)))}</span>`}
          </span>
          <span class="album-card-body">
            <span class="album-card-title-row">
              <strong>${escapeHtml(displayName(coach))}</strong>
              ${coach.enemy_only ? `<span class="non-playable-badge">ADV</span>` : ""}
            </span>
            <span class="mini-meta coach-mini-meta">
              <span class="coach-code">No.${escapeHtml(coach.id)}</span>
              <span class="coach-level-pill">Lv.${escapeHtml(coach.level || 10)}</span>
            </span>
          </span>
        </button>
      `;
    })
    .join("");

  els.playerGrid.querySelectorAll(".album-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCoachId = button.dataset.coachId;
      renderCoachGrid();
      renderCoachDetail();
      saveState();
    });
  });
}

function renderCoachDetail() {
  const coach = state.coaches.find((item) => item.id === state.selectedCoachId);
  if (!coach) {
    els.playerDetail.innerHTML = els.emptyTemplate.innerHTML.replaceAll("joueur", "entraîneur");
    return;
  }

  els.playerDetail.innerHTML = `
    <section class="game-view coach-view">
      <div class="bolt bolt-one"></div>
      <div class="bolt bolt-two"></div>

      <div class="player-side coach-side">
        <div class="screen-label coach-label">Détail entraîneur</div>
        <p class="card-title">Formation ${escapeHtml(coach.formation_code || "-")}</p>
        <h2>${escapeHtml(displayName(coach))}</h2>

        <div class="coach-info-grid">
          <div class="coach-info-card">
            <span>Code</span>
            <strong>${escapeHtml(coach.id)}</strong>
          </div>
          <div class="coach-info-card">
            <span>Niveau</span>
            <strong>Lv.${escapeHtml(coach.level || 10)}</strong>
          </div>
          <div class="coach-info-card">
            <span>Bonus global</span>
            <strong>${formatNumber(coach.total_power)}</strong>
          </div>
          <div class="coach-info-card">
            <span>Type</span>
            <strong>${coach.enemy_only ? "Adverse" : "Disponible"}</strong>
          </div>
        </div>

        <div class="skills-panel coach-passive-panel">
          ${renderCoachPassive(coach.passive)}
        </div>

        <div class="coach-progress">
          <h3>Progression</h3>
          ${renderCoachProgress(coach)}
        </div>
      </div>

      <div class="model-side coach-model-side">
        <div class="model-art coach-model">
          ${renderModel(coach)}
        </div>
        <div class="power-readout">
          <span>Bonus équipe</span>
          <strong>${formatNumber(coach.total_power)}</strong>
        </div>
        <div class="level-readout">Lv.${escapeHtml(coach.level || 10)}</div>
        <div class="awakening-ribbon coach-ribbon">ENTRAÎNEUR</div>
      </div>
    </section>
  `;

  els.playerDetail.querySelectorAll(".skill-card").forEach((button) => {
    button.addEventListener("click", () => {
      openSkillModal(coach, button.dataset.skillId);
    });
  });
}

function renderCoachPassive(passive) {
  if (!passive) {
    return `<p class="empty-line">Aucun passif entraîneur.</p>`;
  }
  return `
    <button class="skill-card skill-passive coach-passive-card" type="button" data-skill-id="${escapeAttr(passive.id)}">
      <span class="skill-level">Lv.${escapeHtml(passive.current_level || "-")}</span>
      <span class="passive-mark">P</span>
      <span class="skill-name">
        <strong>${escapeHtml(passive.name)}</strong>
        <small>Déblocage entraîneur Lv.${escapeHtml(passive.unlock_level || 1)}</small>
      </span>
    </button>
  `;
}

function renderCoachProgress(coach) {
  const passiveLevels = new Map((coach.passive?.levels || []).map((level) => [Number(level.unlock_coach_level?.[0] || level.level), level]));
  return `
    <div class="coach-progress-list">
      ${Array.from({ length: coach.level || 10 }, (_, index) => {
        const level = index + 1;
        const passiveLevel = passiveLevels.get(level);
        const materialStep = (coach.materials || []).find((step) => Number(step.from_level) === level);
        return `
          <div class="coach-progress-row">
            <strong>Lv.${level}</strong>
            <span>${passiveLevel ? `Passif Lv.${escapeHtml(passiveLevel.level)}` : "Passif -"}</span>
            <span class="coach-materials">${renderCoachMaterials(materialStep)}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderCoachMaterials(step) {
  if (!step?.items?.length) {
    return "Max";
  }
  return step.items
    .map((item) => `
      <span class="coach-material" title="${escapeAttr(item.name)}">
        ${item.icon ? `<img src="${escapeAttr(assetPath(item.icon))}" alt="" />` : ""}
        <span>x${formatNumber(item.amount)}</span>
      </span>
    `)
    .join("");
}

function hasTag(player, kind, value) {
  return player.tags.some((tag) => tag.kind === kind && tagLabel(tag) === value);
}

function searchableText(player) {
  return [
    player.id,
    player.names?.fr,
    player.names?.display_fr,
    player.names?.jp,
    player.names?.romaji,
    player.card_title?.fr,
    player.position?.code,
    player.position?.fr,
    player.element?.fr,
    player.element?.code,
    ...player.tags.map(tagLabel),
    ...player.skills.flatMap((skill) => [skill.name, skill.current_description, skill.kind]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortPlayers(sort) {
  return (a, b) => {
    if (sort === "power_desc") {
      return (b.total_power || 0) - (a.total_power || 0) || displayName(a).localeCompare(displayName(b), "fr");
    }
    if (sort === "rarity_desc") {
      return (b.rarity?.stars || 0) - (a.rarity?.stars || 0) || displayName(a).localeCompare(displayName(b), "fr");
    }
    return displayName(a).localeCompare(displayName(b), "fr");
  };
}

function collectionEntryForPlayer(playerId) {
  return (state.account.collection?.players || []).find((entry) => String(entry.playerId) === String(playerId)) || null;
}

function playerById(playerId) {
  return state.players.find((item) => String(item.id) === String(playerId)) || null;
}

function ownedCollectionEntries() {
  return (state.account.collection?.players || []).filter((entry) => entry.owned);
}

function currentCollectionEquipment() {
  return state.account.collection?.equipment || {};
}

function collectionMainSlots(collection = state.account.collection) {
  const entries = collection?.players || [];
  return Array.from({ length: MAIN_COLLECTION_SLOT_COUNT }, (_, index) => {
    const slot = collection?.mainSlots?.[index] || {};
    const legacyPlayerId = collection?.mainPlayerIds?.[index] || "";
    const playerId = slot.playerId ?? legacyPlayerId ?? "";
    const matchingEntry = entries.find((entry) => String(entry.playerId) === String(playerId));
    return {
      slot: index,
      playerId: playerId ? String(playerId) : "",
      level: clampNumber(slot.level ?? matchingEntry?.level ?? 1, 1, 300),
    };
  });
}

function collectionMainSlotsFromDom() {
  const rows = [...els.playerDetail.querySelectorAll(".main-slot-row")];
  if (!rows.length) {
    return collectionMainSlots();
  }
  return rows.map((row, index) => ({
    slot: index,
    playerId: row.querySelector("input[name='mainPlayerId']")?.value || "",
    level: clampNumber(row.querySelector("input[name='mainLevel']")?.value || 1, 1, 300),
  }));
}

function collectionCommonLevelFromSlots(mainSlots = collectionMainSlots()) {
  const filled = (mainSlots || []).filter((slot) => slot.playerId);
  if (filled.length !== MAIN_COLLECTION_SLOT_COUNT) {
    return null;
  }
  return Math.min(...filled.map((slot) => clampNumber(slot.level, 1, 300)));
}

function collectionMainSlotForPlayer(playerId, mainSlots = collectionMainSlots()) {
  return (mainSlots || []).find((slot) => slot.playerId && String(slot.playerId) === String(playerId)) || null;
}

function collectionEffectiveLevel(entry, mainSlots = collectionMainSlots()) {
  const mainSlot = collectionMainSlotForPlayer(entry?.playerId || entry?.player?.id, mainSlots);
  if (mainSlot) {
    return clampNumber(mainSlot.level, 1, 300);
  }
  return collectionCommonLevelFromSlots(mainSlots) || 1;
}

function effectiveCollectionEntry(entry, mainSlots = collectionMainSlots()) {
  return {
    ...entry,
    level: collectionEffectiveLevel(entry, mainSlots),
  };
}

function effectiveCollectionEntries(entries = ownedCollectionEntries(), mainSlots = collectionMainSlots()) {
  return (entries || []).map((entry) => effectiveCollectionEntry(entry, mainSlots));
}

function renderCollectionDetail() {
  if (!state.account.user) {
    els.playerDetail.innerHTML = `
      <section class="collection-shell">
        <div class="collection-empty">
          <h2>Connexion requise</h2>
          <p>Connectez-vous pour gerer votre profil, vos personnages principaux et votre collection.</p>
          <button id="collectionLoginButton" class="primary-action" type="button">Login / Register</button>
        </div>
      </section>
    `;
    els.playerDetail.querySelector("#collectionLoginButton")?.addEventListener("click", () => openAuthModal("login"));
    return;
  }

  const selectedPlayer =
    state.players.find((item) => item.playable && String(item.id) === String(state.selectedId)) ||
    state.filtered.find((item) => item.playable) ||
    state.players.find((item) => item.playable);
  const selectedEntry = selectedPlayer ? collectionEntryForPlayer(selectedPlayer.id) : null;
  const collection = state.account.collection || { players: [], mainSlots: [], mainPlayerIds: [], commonLevel: null, equipment: {} };
  const ownedEntries = ownedCollectionEntries();
  const mainSlots = collectionMainSlots(collection);
  const mainCount = mainSlots.filter((slot) => slot.playerId).length;
  const commonLevel = collectionCommonLevelFromSlots(mainSlots);
  const totalCapacity = collectionTotalCapacity(effectiveCollectionEntries(ownedEntries, mainSlots), collection.equipment || {});
  const collectionError = state.account.error ? `<p class="auth-error collection-error">${escapeHtml(state.account.error)}</p>` : "";

  els.playerDetail.innerHTML = `
    <section class="collection-shell">
      <header class="collection-header">
        <div class="profile-summary">
          <span class="profile-avatar">${state.account.user.avatar ? `<img src="${escapeAttr(assetPath(state.account.user.avatar))}" alt="" />` : ""}</span>
          <div>
            <strong>${escapeHtml(state.account.user.username)}</strong>
            <span>Serveur ${escapeHtml(state.account.user.serverNumber || "-")}</span>
          </div>
        </div>
        <div class="collection-kpis">
          <span><strong>${escapeHtml(ownedEntries.length)}</strong> possedes</span>
          <span><strong>${escapeHtml(mainCount)}/5</strong> principaux</span>
          <span><strong>${escapeHtml(commonLevel ?? "-")}</strong> niveau commun</span>
          <span><strong data-collection-total-capacity>${escapeHtml(formatNumber(totalCapacity))}</strong> capacité totale</span>
        </div>
      </header>
      ${collectionError}

      <div class="collection-grid-layout">
        <section class="collection-card">
          <h2>Ajouter / modifier</h2>
          ${selectedPlayer ? renderSelectedCollectionEditor(selectedPlayer, selectedEntry, mainSlots) : `<p class="empty-line">Aucun joueur jouable selectionne.</p>`}
        </section>

        <section class="collection-card">
          <h2>5 emplacements principaux</h2>
          ${renderCollectionMainSlots(ownedEntries, mainSlots)}
        </section>
      </div>

      <section class="collection-card">
        <h2>Collection</h2>
        ${renderCollectionRows(ownedEntries, mainSlots)}
      </section>

      <section class="collection-card">
        <h2>Equipements du profil</h2>
        ${renderProfileEquipmentEditor(collection.equipment || {})}
      </section>
    </section>
  `;

  bindCollectionControls();
}

function renderSelectedCollectionEditor(player, entry, mainSlots = collectionMainSlots()) {
  const rarity = entry?.rarity ?? player.awakening?.code ?? 9;
  const previewEntry = effectiveCollectionEntry({ playerId: player.id, owned: true, rarity }, mainSlots);
  const level = previewEntry.level;
  const mainSlot = collectionMainSlotForPlayer(player.id, mainSlots);
  const portrait = imageUrl(player, "portrait") || imageUrl(player, "fullbody");
  const simulated = simulateCollectionEntry(previewEntry, currentCollectionEquipment());
  const capacity = simulated ? formatNumber(simulated.total_power) : "-";
  return `
    <form id="selectedCollectionForm" class="selected-collection-form" data-player-id="${escapeAttr(player.id)}">
      <div class="selected-player-line">
        <span class="portrait-frame">${portrait ? `<img src="${escapeAttr(portrait)}" alt="" />` : `<span>${escapeHtml(initials(displayName(player)))}</span>`}</span>
        <div>
          <strong>${escapeHtml(displayName(player))}</strong>
          <span>${entry?.owned ? "Deja dans la collection" : "Joueur jouable"}</span>
          <small class="collection-capacity-inline"><span data-selected-collection-level>${mainSlot ? `Emplacement ${escapeHtml(mainSlot.slot + 1)}` : "Niveau commun"} Lv.${escapeHtml(level)}</span> - Capacité <strong data-selected-collection-capacity>${escapeHtml(capacity)}</strong></small>
        </div>
      </div>
      <div class="collection-form-grid">
        <label class="awakening-editor"><span>Éveil</span>${renderCollectionAwakeningSelect(player, "rarity", rarity)}</label>
      </div>
      <button class="primary-action" type="submit">${entry?.owned ? "Mettre a jour" : "Ajouter"}</button>
    </form>
  `;
}

function renderCollectionMainSlots(entries, mainSlots = collectionMainSlots()) {
  if (!entries.length) {
    return `<p class="empty-line">Ajoutez au moins 5 joueurs pour remplir les emplacements principaux.</p>`;
  }
  return `
    <div class="main-slots">
      ${Array.from({ length: MAIN_COLLECTION_SLOT_COUNT }, (_, index) => {
        const slot = mainSlots[index] || { slot: index, playerId: "", level: 1 };
        const selectedEntry = entries.find((entry) => String(entry.playerId) === String(slot.playerId));
        const selectedPlayer = selectedEntry?.player || summarizeLocalPlayer(selectedEntry?.playerId);
        const selectedPortrait = selectedPlayer?.portrait || selectedPlayer?.fullbody;
        return `
          <div class="main-slot-row" data-slot-index="${escapeAttr(index)}">
            <span class="main-slot-preview" data-main-slot-preview>
              ${selectedPortrait ? `<img src="${escapeAttr(assetPath(selectedPortrait))}" alt="" />` : `<strong>#${escapeHtml(index + 1)}</strong>`}
            </span>
            <div class="main-slot-picker">
              <span>Joueur</span>
              <input name="mainPlayerId" type="hidden" value="${escapeAttr(slot.playerId || "")}" />
              <button class="main-slot-button" type="button" aria-expanded="false">
                <span data-main-slot-label>${escapeHtml(selectedPlayer?.name || "Libre")}</span>
              </button>
              <div class="main-slot-menu" hidden>
                <button class="main-slot-option" type="button" data-player-id="" data-player-name="Libre" data-player-portrait="">
                  <span class="portrait-frame"><span>-</span></span>
                  <span>Libre</span>
                </button>
                ${entries
                  .map((entry) => {
                    const player = entry.player || summarizeLocalPlayer(entry.playerId);
                    const portrait = player?.portrait || player?.fullbody;
                    return `
                      <button class="main-slot-option" type="button" data-player-id="${escapeAttr(entry.playerId)}" data-player-name="${escapeAttr(player?.name || entry.playerId)}" data-player-portrait="${escapeAttr(portrait || "")}">
                        <span class="portrait-frame">${portrait ? `<img src="${escapeAttr(assetPath(portrait))}" alt="" />` : `<span>${escapeHtml(initials(player?.name || entry.playerId))}</span>`}</span>
                        <span>${escapeHtml(player?.name || entry.playerId)}</span>
                      </button>
                    `;
                  })
                  .join("")}
              </div>
            </div>
            <label>
              <span>Niveau spot</span>
              <input name="mainLevel" type="number" min="1" max="300" value="${escapeAttr(slot.level || 1)}" />
            </label>
          </div>
        `;
      }).join("")}
    </div>
    <p class="collection-hint">Le niveau reste sur l'emplacement. Les joueurs hors des 5 prennent le niveau le plus bas.</p>
  `;
}

function renderCollectionRows(entries, mainSlots = collectionMainSlots()) {
  if (!entries.length) {
    return `<p class="empty-line">Aucun joueur dans votre collection.</p>`;
  }
  return `
    <form id="collectionBulkForm" class="collection-table-form">
      <div class="collection-grid">
        ${entries
          .map((entry) => {
            const player = entry.player || summarizeLocalPlayer(entry.playerId);
            const portrait = player?.portrait || player?.fullbody;
            const effectiveEntry = effectiveCollectionEntry(entry, mainSlots);
            const mainSlot = collectionMainSlotForPlayer(entry.playerId, mainSlots);
            const simulated = simulateCollectionEntry(effectiveEntry, currentCollectionEquipment());
            const capacity = simulated ? formatNumber(simulated.total_power) : "-";
            return `
              <article class="collection-row collection-entry-card" data-player-id="${escapeAttr(entry.playerId)}">
                <span class="collection-row-player">
                  <span class="portrait-frame">${portrait ? `<img src="${escapeAttr(assetPath(portrait))}" alt="" />` : `<span>${escapeHtml(initials(player?.name || entry.playerId))}</span>`}</span>
                  <span>
                    <strong>${escapeHtml(player?.name || entry.playerId)}</strong>
                    <small>${escapeHtml(player?.position?.code || "")}</small>
                  </span>
                </span>
                <label><span>Owned</span><input name="owned" type="checkbox" checked /></label>
                <label class="awakening-editor"><span>Éveil</span>${renderCollectionAwakeningSelect(player || summarizeLocalPlayer(entry.playerId), "rarity", entry.rarity)}</label>
                <span class="collection-level"><small>Niveau</small><strong data-collection-level>${escapeHtml(`Lv.${effectiveEntry.level}`)}</strong><small data-collection-level-source>${escapeHtml(mainSlot ? `Principal #${mainSlot.slot + 1}` : "Commun")}</small></span>
                <span class="collection-capacity"><small>Capacité</small><strong data-collection-capacity>${escapeHtml(capacity)}</strong></span>
              </article>
            `;
          })
          .join("")}
      </div>
      <p class="collection-hint">Enregistrez ici les éveils, les joueurs possédés et les 5 emplacements principaux.</p>
      <button class="primary-action" type="submit">Enregistrer la collection</button>
    </form>
  `;
}

function collectionAwakeningCode(player, selectedValue) {
  const options = awakeningOptionsForPlayer(player);
  if (selectedValue != null && selectedValue !== "") {
    const selected = Number(selectedValue);
    if (options.some((option) => Number(option.code) === selected)) {
      return selected;
    }
  }
  const current = Number(player?.awakening?.code);
  if (options.some((option) => Number(option.code) === current)) {
    return current;
  }
  return Number(options[options.length - 1]?.code ?? 0);
}

function renderCollectionAwakeningSelect(player, name, selectedValue) {
  const selectedCode = collectionAwakeningCode(player, selectedValue);
  const selectedTier = awakeningTierInfo(selectedCode);
  return `
    <span class="collection-awakening-field">
      <span class="collection-awakening-chip awakening-ribbon-${escapeAttr(selectedTier.slug)}"></span>
      <select name="${escapeAttr(name)}" class="collection-awakening-select">
        ${awakeningOptionsForPlayer(player)
          .map((option) => `<option value="${escapeAttr(option.code)}"${Number(option.code) === selectedCode ? " selected" : ""}>${escapeHtml(option.label)}</option>`)
          .join("")}
      </select>
    </span>
  `;
}

function renderCollectionAwakeningBadge(code) {
  const tier = awakeningTierInfo(Number(code));
  return `<span class="collection-awakening-badge awakening-tier awakening-tier-${escapeAttr(tier.slug)}">${escapeHtml(tier.label)}</span>`;
}

function summarizeLocalPlayer(playerId) {
  const player = playerById(playerId);
  if (!player) {
    return null;
  }
  return {
    id: player.id,
    name: displayName(player),
    portrait: imageUrl(player, "portrait"),
    fullbody: imageUrl(player, "fullbody"),
    position: player.position,
    rarity: player.rarity,
    awakening: player.awakening,
  };
}

function renderProfileEquipmentEditor(equipment) {
  return `
    <form id="profileEquipmentForm" class="profile-equipment-form">
      ${EQUIPMENT_POSITIONS.map((position) => {
        const slots = equipmentSlotsForPosition(position);
        if (!slots.length) {
          return "";
        }
        return `
          <section class="equipment-position-row equipment-position-${escapeAttr(position.toLowerCase())}">
            <div class="equipment-position-title">
              ${renderPositionBadge({ code: position, fr: labels.positions[position] }, { compact: true })}
              <span>${escapeHtml(position)}</span>
            </div>
            <div class="equipment-position-slots">
              ${slots.map((slot) => renderProfileEquipmentSlot(position, slot, equipment?.[position]?.[slot.code])).join("")}
            </div>
          </section>
        `;
      }).join("")}
      <button class="primary-action" type="submit">Enregistrer les equipements</button>
    </form>
  `;
}

function renderProfileEquipmentSlot(position, slot, selectedLevel) {
  const levels = (slot.levels || []).map(Number);
  const selected = levels.includes(Number(selectedLevel)) ? Number(selectedLevel) : levels[0] || DEFAULT_EQUIPMENT_LEVEL;
  const icon = equipmentIcon(slot, position, selected);
  return `
    <label class="equipment-modal-slot">
      <span class="equipment-modal-picture">${icon ? `<img src="${escapeAttr(icon)}" alt="" />` : ""}</span>
      <span class="equipment-modal-name">${escapeHtml(equipmentSlotLabel(slot))}</span>
      <select data-equipment-position="${escapeAttr(position)}" data-equipment-slot="${escapeAttr(slot.code)}">
        ${levels.map((level) => `<option value="${escapeAttr(level)}"${level === selected ? " selected" : ""}>Lv.${escapeHtml(level)}</option>`).join("")}
      </select>
    </label>
  `;
}

function bindCollectionControls() {
  els.playerDetail.querySelector("#selectedCollectionForm")?.addEventListener("submit", handleSelectedCollectionSave);
  els.playerDetail.querySelector("#collectionBulkForm")?.addEventListener("submit", handleCollectionBulkSave);
  els.playerDetail.querySelector("#profileEquipmentForm")?.addEventListener("submit", handleEquipmentSave);
  els.playerDetail.querySelectorAll(".collection-awakening-select").forEach((select) => {
    select.addEventListener("change", () => {
      const chip = select.closest(".collection-awakening-field")?.querySelector(".collection-awakening-chip");
      if (!chip) {
        return;
      }
      [...chip.classList].forEach((className) => {
        if (className.startsWith("awakening-ribbon-")) {
          chip.classList.remove(className);
        }
      });
      chip.classList.add(`awakening-ribbon-${awakeningTierInfo(select.value).slug}`);
    });
  });
  bindMainSlotPickers();
  bindCollectionCapacityControls();
}

function bindMainSlotPickers() {
  const closeAllMenus = (except = null) => {
    els.playerDetail.querySelectorAll(".main-slot-menu").forEach((menu) => {
      if (menu !== except) {
        menu.hidden = true;
        menu.closest(".main-slot-picker")?.querySelector(".main-slot-button")?.setAttribute("aria-expanded", "false");
      }
    });
  };

  els.playerDetail.querySelectorAll(".main-slot-row").forEach((row) => {
    const button = row.querySelector(".main-slot-button");
    const menu = row.querySelector(".main-slot-menu");
    const input = row.querySelector("input[name='mainPlayerId']");
    const label = row.querySelector("[data-main-slot-label]");
    const preview = row.querySelector("[data-main-slot-preview]");
    button?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!menu) {
        return;
      }
      const willOpen = menu.hidden;
      closeAllMenus(willOpen ? menu : null);
      menu.hidden = !willOpen;
      button.setAttribute("aria-expanded", String(willOpen));
      if (willOpen) {
        setTimeout(() => document.addEventListener("click", () => closeAllMenus(), { once: true }), 0);
      }
    });
    menu?.querySelectorAll(".main-slot-option").forEach((option) => {
      option.addEventListener("click", () => {
        const playerId = option.dataset.playerId || "";
        const playerName = option.dataset.playerName || "Libre";
        const portrait = option.dataset.playerPortrait || "";
        if (input) {
          input.value = playerId;
        }
        if (label) {
          label.textContent = playerName;
        }
        if (preview) {
          preview.innerHTML = portrait
            ? `<img src="${escapeAttr(assetPath(portrait))}" alt="" />`
            : `<strong>#${escapeHtml(Number(row.dataset.slotIndex || 0) + 1)}</strong>`;
        }
        closeAllMenus();
        refreshCollectionDerivedValues();
      });
    });
  });

}

function bindCollectionCapacityControls() {
  const selectedForm = els.playerDetail.querySelector("#selectedCollectionForm");
  if (selectedForm) {
    selectedForm.querySelector("select[name='rarity']")?.addEventListener("change", refreshSelectedCollectionCapacity);
  }

  els.playerDetail.querySelectorAll(".main-slot-row input[name='mainLevel']").forEach((control) => {
    control.addEventListener("input", refreshCollectionDerivedValues);
  });

  els.playerDetail.querySelectorAll(".collection-row").forEach((row) => {
    const refresh = () => {
      refreshCollectionDerivedValues();
    };
    row.querySelector("select[name='rarity']")?.addEventListener("change", refresh);
    row.querySelector("input[name='owned']")?.addEventListener("change", refresh);
  });
  refreshCollectionDerivedValues();
}

function collectionEntryFromRow(row, mainSlots = collectionMainSlotsFromDom()) {
  const entry = {
    playerId: row.dataset.playerId,
    owned: row.querySelector("input[name='owned']")?.checked !== false,
    rarity: row.querySelector("select[name='rarity']")?.value,
  };
  return effectiveCollectionEntry(entry, mainSlots);
}

function refreshSelectedCollectionCapacity(mainSlots = collectionMainSlotsFromDom()) {
  const selectedForm = els.playerDetail.querySelector("#selectedCollectionForm");
  if (!selectedForm) {
    return;
  }
  const entry = effectiveCollectionEntry(
    {
      playerId: selectedForm.dataset.playerId,
      owned: true,
      rarity: selectedForm.querySelector("select[name='rarity']")?.value,
    },
    mainSlots,
  );
  const target = selectedForm.querySelector("[data-selected-collection-capacity]");
  const levelTarget = selectedForm.querySelector("[data-selected-collection-level]");
  const mainSlot = collectionMainSlotForPlayer(entry.playerId, mainSlots);
  if (levelTarget) {
    levelTarget.textContent = `${mainSlot ? `Emplacement ${mainSlot.slot + 1}` : "Niveau commun"} Lv.${entry.level}`;
  }
  if (target) {
    const simulated = simulateCollectionEntry(entry, currentCollectionEquipment());
    target.textContent = simulated ? formatNumber(simulated.total_power) : "-";
  }
}

function refreshCollectionDerivedValues() {
  const mainSlots = collectionMainSlotsFromDom();
  els.playerDetail.querySelectorAll(".collection-row").forEach((row) => refreshCollectionRowCapacity(row, mainSlots));
  refreshSelectedCollectionCapacity(mainSlots);
  refreshCollectionCapacitySummary(mainSlots);
}

function refreshCollectionRowCapacity(row, mainSlots = collectionMainSlotsFromDom()) {
  const target = row.querySelector("[data-collection-capacity]");
  const levelTarget = row.querySelector("[data-collection-level]");
  const sourceTarget = row.querySelector("[data-collection-level-source]");
  const entry = collectionEntryFromRow(row, mainSlots);
  const mainSlot = collectionMainSlotForPlayer(entry.playerId, mainSlots);
  if (levelTarget) {
    levelTarget.textContent = `Lv.${entry.level}`;
  }
  if (sourceTarget) {
    sourceTarget.textContent = mainSlot ? `Principal #${mainSlot.slot + 1}` : "Commun";
  }
  if (target) {
    const simulated = simulateCollectionEntry(entry, currentCollectionEquipment());
    target.textContent = simulated ? formatNumber(simulated.total_power) : "-";
  }
}

function refreshCollectionCapacitySummary(mainSlots = collectionMainSlotsFromDom()) {
  const target = els.playerDetail.querySelector("[data-collection-total-capacity]");
  if (!target) {
    return;
  }
  const rows = [...els.playerDetail.querySelectorAll(".collection-row")];
  if (!rows.length) {
    target.textContent = formatNumber(collectionTotalCapacity(effectiveCollectionEntries(ownedCollectionEntries(), mainSlots), currentCollectionEquipment()));
    return;
  }
  const total = rows.reduce((sum, row) => {
    const entry = collectionEntryFromRow(row, mainSlots);
    if (!entry.owned) {
      return sum;
    }
    const simulated = simulateCollectionEntry(entry, currentCollectionEquipment());
    return sum + Number(simulated?.total_power || 0);
  }, 0);
  target.textContent = formatNumber(total);
}

async function handleSelectedCollectionSave(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const playerId = event.currentTarget.dataset.playerId;
  try {
    const data = await apiFetch(`/api/collection/${encodeURIComponent(playerId)}`, {
      method: "PUT",
      body: {
        owned: true,
        rarity: form.get("rarity"),
      },
    });
    state.account.collection = data.collection;
    state.account.error = "";
    applyCurrentFilters();
  } catch (error) {
    state.account.error = error.message;
    renderCollectionDetail();
  }
}

async function handleCollectionBulkSave(event) {
  event.preventDefault();
  const rows = [...els.playerDetail.querySelectorAll(".collection-row")];
  const players = rows.map((row) => ({
    playerId: row.dataset.playerId,
    owned: row.querySelector("input[name='owned']").checked,
    rarity: row.querySelector("select[name='rarity']").value,
  }));
  const mainSlots = collectionMainSlotsFromDom();
  const filledMainSlots = mainSlots.filter((slot) => slot.playerId);
  const uniqueMainPlayerIds = new Set(filledMainSlots.map((slot) => slot.playerId));
  if (filledMainSlots.length !== 0 && filledMainSlots.length !== MAIN_COLLECTION_SLOT_COUNT) {
    state.account.error = "Choisissez exactement 5 emplacements principaux, ou laissez-les tous libres.";
    renderCollectionDetail();
    return;
  }
  if (uniqueMainPlayerIds.size !== filledMainSlots.length) {
    state.account.error = "Un joueur ne peut occuper qu'un seul emplacement principal.";
    renderCollectionDetail();
    return;
  }
  try {
    const data = await apiFetch("/api/collection", {
      method: "PUT",
      body: { players, mainSlots },
    });
    state.account.collection = data.collection;
    state.account.error = "";
    applyCurrentFilters();
  } catch (error) {
    state.account.error = error.message;
    renderCollectionDetail();
  }
}

async function handleEquipmentSave(event) {
  event.preventDefault();
  const equipment = {};
  els.playerDetail.querySelectorAll("[data-equipment-slot]").forEach((select) => {
    const position = select.dataset.equipmentPosition;
    const slot = select.dataset.equipmentSlot;
    equipment[position] ||= {};
    equipment[position][slot] = Number(select.value);
  });
  try {
    const data = await apiFetch("/api/collection/equipment", {
      method: "PUT",
      body: { equipment },
    });
    state.account.collection = data.collection;
    state.account.error = "";
    applyCurrentFilters();
  } catch (error) {
    state.account.error = error.message;
    renderCollectionDetail();
  }
}

function renderPublicProfileView() {
  const profile = state.publicProfile;
  const entries = profile?.collection || [];
  const equipment = profile?.equipment || {};
  els.resultCount.textContent = `${entries.length} joueur${entries.length > 1 ? "s" : ""}`;
  els.playableToggle.disabled = true;
  els.playableToggle.innerHTML = `<span>Public</span>`;
  els.playableToggle.setAttribute("aria-pressed", "false");
  els.playableToggle.setAttribute("aria-label", "Profil public");
  els.playerGrid.innerHTML = entries
        .map((entry) => {
          const player = entry.player || summarizeLocalPlayer(entry.playerId);
          const portrait = player?.portrait || player?.fullbody;
          const simulated = simulateCollectionEntry(entry, equipment);
          const capacity = simulated ? formatNumber(simulated.total_power) : "-";
          return `
            <button class="album-card" type="button" data-id="${escapeAttr(entry.playerId)}">
              <span class="portrait-frame">${portrait ? `<img src="${escapeAttr(assetPath(portrait))}" alt="" />` : `<span>${escapeHtml(initials(player?.name || entry.playerId))}</span>`}</span>
              <span class="album-card-body">
                <span class="album-card-title-row"><strong>${escapeHtml(player?.name || entry.playerId)}</strong></span>
                <span class="mini-meta">${renderCollectionAwakeningBadge(entry.rarity)}<span>Lv.${escapeHtml(entry.level || "-")}</span><span>Capacité ${escapeHtml(capacity)}</span></span>
              </span>
            </button>
          `;
    })
    .join("");
  renderPublicProfileDetail();
}

function renderPublicProfileDetail() {
  const profile = state.publicProfile;
  if (!profile) {
    els.playerDetail.innerHTML = `<div class="empty-state"><h2>Profil public</h2><p>Chargement...</p></div>`;
    return;
  }
  if (profile.error) {
    els.playerDetail.innerHTML = `<div class="empty-state"><h2>Profil introuvable</h2><p>${escapeHtml(profile.error)}</p></div>`;
    return;
  }
  const profileEquipment = profile.equipment || {};
  const totalCapacity = collectionTotalCapacity(profile.collection || [], profileEquipment);
  els.playerDetail.innerHTML = `
    <section class="collection-shell public-profile-shell">
      <header class="collection-header">
        <div class="profile-summary">
          <span class="profile-avatar">${profile.avatar ? `<img src="${escapeAttr(assetPath(profile.avatar))}" alt="" />` : ""}</span>
          <div>
            <strong>${escapeHtml(profile.username)}</strong>
            <span>Serveur ${escapeHtml(profile.serverNumber || "-")}</span>
          </div>
        </div>
        <div class="collection-kpis">
          <span><strong>${escapeHtml((profile.collection || []).length)}</strong> possedes</span>
          <span><strong>${escapeHtml((profile.mainPlayerIds || []).length)}/5</strong> principaux</span>
          <span><strong>${escapeHtml(profile.commonLevel ?? "-")}</strong> niveau commun</span>
          <span><strong>${escapeHtml(formatNumber(totalCapacity))}</strong> capacité totale</span>
        </div>
      </header>
      <section class="collection-card">
        <h2>5 principaux</h2>
        ${profile.mainPlayers?.length ? renderPublicEntries(profile.mainPlayers, profileEquipment) : `<p class="empty-line">Aucun groupe principal public.</p>`}
      </section>
      <section class="collection-card">
        <h2>Collection publique</h2>
        ${profile.collection?.length ? renderPublicEntries(profile.collection, profileEquipment) : `<p class="empty-line">Aucune collection publique.</p>`}
      </section>
    </section>
  `;
}

function renderPublicEntries(entries, equipment = {}) {
  return `
    <div class="public-entry-grid">
      ${entries
        .map((entry) => {
          const player = entry.player || summarizeLocalPlayer(entry.playerId);
          const portrait = player?.portrait || player?.fullbody;
          const simulated = simulateCollectionEntry(entry, equipment);
          const capacity = simulated ? formatNumber(simulated.total_power) : "-";
          return `
            <article class="public-entry-card">
              <span class="portrait-frame">${portrait ? `<img src="${escapeAttr(assetPath(portrait))}" alt="" />` : `<span>${escapeHtml(initials(player?.name || entry.playerId))}</span>`}</span>
              <div>
                <strong>${escapeHtml(player?.name || entry.playerId)}</strong>
                <span>${renderCollectionAwakeningBadge(entry.rarity)} Lv.${escapeHtml(entry.level || "-")}</span>
                <small class="collection-capacity-inline">Capacité <strong>${escapeHtml(capacity)}</strong></small>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderGrid() {
  const count = state.filtered.length;
  const modeLabel = state.mode === "simulator" ? "personnage" : "joueur";
  els.playableToggle.disabled = false;
  els.resultCount.textContent = `${count} ${modeLabel}${count > 1 ? "s" : ""}${state.filters.playableOnly ? " jouable" + (count > 1 ? "s" : "") : ""}`;
  const showingAll = !state.filters.playableOnly;
  if (state.mode === "collection") {
    els.playableToggle.disabled = true;
    els.playableToggle.innerHTML = `<span>Jouables</span>`;
    els.playableToggle.setAttribute("aria-pressed", "false");
    els.playableToggle.setAttribute("aria-label", "Collection limitee aux joueurs jouables");
  } else {
    els.playableToggle.innerHTML = `<span>Tous</span><span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>`;
    els.playableToggle.setAttribute("aria-pressed", String(showingAll));
    els.playableToggle.setAttribute("aria-label", showingAll ? "Afficher seulement les joueurs jouables" : "Afficher tous les joueurs");
  }

  if (!count) {
    els.playerGrid.innerHTML = "";
    return;
  }

  els.playerGrid.innerHTML = state.filtered
    .map((player) => {
      const active = player.id === state.selectedId ? " is-active" : "";
      const npcClass = player.playable ? "" : " is-npc";
      const collectionEntry = collectionEntryForPlayer(player.id);
      const collectionClass = state.mode === "collection" && collectionEntry?.owned ? " is-owned" : "";
      const portrait = imageUrl(player, "portrait") || imageUrl(player, "fullbody");
      return `
        <button class="album-card${active}${npcClass}${collectionClass}" type="button" data-id="${escapeAttr(player.id)}">
          <span class="portrait-frame">
            ${portrait ? `<img src="${escapeAttr(portrait)}" alt="" />` : `<span>${escapeHtml(initials(displayName(player)))}</span>`}
          </span>
          <span class="album-card-body">
            <span class="album-card-title-row">
              <strong>${escapeHtml(displayName(player))}</strong>
              ${state.mode === "collection" && collectionEntry?.owned ? `<span class="non-playable-badge owned-badge">OK</span>` : player.playable ? "" : `<span class="non-playable-badge">NPC</span>`}
            </span>
            <span class="mini-meta">
              ${renderTeamLogo(player)}
              <span class="card-badges">
                ${renderElementIcon(player.element?.code)}
                ${renderPositionBadge(player.position, { compact: true })}
              </span>
              <span class="card-stars">${renderStars(player.rarity?.stars)}</span>
            </span>
          </span>
        </button>
      `;
    })
    .join("");

  els.playerGrid.querySelectorAll(".album-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.id;
      renderGrid();
      renderDetail();
      saveState();
    });
  });
}

function renderDetail() {
  if (state.mode === "publicProfile") {
    renderPublicProfileDetail();
    return;
  }
  if (state.mode === "collection") {
    renderCollectionDetail();
    return;
  }
  if (state.mode === "simulator") {
    renderSimulatorDetail();
    return;
  }

  const player = state.players.find((item) => item.id === state.selectedId);
  if (!player) {
    els.playerDetail.innerHTML = els.emptyTemplate.innerHTML;
    return;
  }

  els.playerDetail.innerHTML = `
    <section class="game-view element-bg-${escapeAttr(player.element?.code || "none")}">
      <div class="bolt bolt-one"></div>
      <div class="bolt bolt-two"></div>

      <div class="player-side">
        <div class="screen-label">Détail joueur</div>
        <p class="card-title">${escapeHtml(player.card_title?.fr || player.names?.jp || "")}</p>
        <h2>${escapeHtml(displayName(player))}</h2>

        <div class="identity-strip">
          ${renderElementBadge(player.element)}
          ${renderPositionBadge(player.position)}
          ${renderStars(player.rarity?.stars)}
        </div>

        <div class="tag-icons">${player.tags.map(renderTagChip).join("")}</div>

        <div class="character-info-grid">
          <div class="stats-block">
            ${renderStats(player.stats)}
          </div>

          <div class="field-zone">
            <span>Zones</span>
            ${renderPositionGrid(player.preferred_areas || [])}
          </div>
        </div>

        <div class="skills-panel">
          ${renderSkills(player.skills || [])}
        </div>
      </div>

      <div class="model-side">
        <div class="model-art">
          ${renderModel(player)}
        </div>
        <div class="power-readout">
          <span>Capacité totale</span>
          <strong>${formatNumber(player.total_power)}</strong>
        </div>
        <div class="level-readout">Lv.300</div>
        <div class="awakening-ribbon">${escapeHtml(player.awakening?.label || "LEGENDARY PLAYER+")}</div>
        <div class="equipment-chip">Équipement Lv.${escapeHtml(player.equipment?.level || 1)}</div>
      </div>
    </section>
  `;

  els.playerDetail.querySelectorAll(".skill-card").forEach((button) => {
    button.addEventListener("click", () => {
      openSkillModal(player, button.dataset.skillId);
    });
  });
}

function renderSimulatorDetail() {
  const player = state.players.find((item) => item.id === state.selectedId);
  if (!player) {
    els.playerDetail.innerHTML = els.emptyTemplate.innerHTML;
    return;
  }

  syncSimulatorEquipmentDefaults(player);
  const simulated = simulatePlayer(player);
  const equipmentSlots = equipmentSlotsForPlayer(player);

  els.playerDetail.innerHTML = `
    <section class="simulator-panel" aria-label="Paramètres de simulation">
      <div class="simulator-main-controls">
        <label>
          <span>Niveau joueur</span>
          <div class="sim-level-control">
            <input id="simLevelInput" type="number" min="1" max="300" step="1" value="${escapeAttr(simulated.level)}" />
            <input id="simLevelRange" type="range" min="1" max="300" step="1" value="${escapeAttr(simulated.level)}" />
          </div>
        </label>
        <label>
          <span>Éveil</span>
          ${renderAwakeningPicker(player, simulated.awakening.code)}
        </label>
      </div>
      <div class="equipment-controls">
        ${equipmentSlots.map((slot) => renderEquipmentControl(player, slot, player.position?.code)).join("")}
      </div>
      <div class="simulator-actions">
        <button id="equipmentConfigButton" class="equipment-config-button" type="button">Configurer mes équipements</button>
      </div>
    </section>

    <section class="game-view simulator-view element-bg-${escapeAttr(player.element?.code || "none")}">
      <div class="bolt bolt-one"></div>
      <div class="bolt bolt-two"></div>

      <div class="player-side">
        <div class="screen-label simulator-label">Simulation joueur</div>
        <p class="card-title">${escapeHtml(player.card_title?.fr || player.names?.jp || "")}</p>
        <h2>${escapeHtml(displayName(player))}</h2>

        <div class="identity-strip">
          ${renderElementBadge(player.element)}
          ${renderPositionBadge(player.position)}
          ${renderStars(player.rarity?.stars)}
        </div>

        <div class="tag-icons">${player.tags.map(renderTagChip).join("")}</div>

        <div class="character-info-grid">
          <div class="stats-block">
            ${renderStats(simulated.stats)}
          </div>

          <div class="field-zone">
            <span>Zones</span>
            ${renderPositionGrid(player.preferred_areas || [])}
          </div>
        </div>

        <div class="skills-panel">
          ${renderSkills(simulated.skills || [])}
        </div>
      </div>

      <div class="model-side">
        <div class="model-art">
          ${renderModel(player)}
        </div>
        <div class="power-readout">
          <span>Capacité totale</span>
          <strong>${formatNumber(simulated.total_power)}</strong>
        </div>
        <div class="level-readout">Lv.${escapeHtml(simulated.level)}</div>
        <div class="awakening-ribbon awakening-ribbon-${escapeAttr(simulated.awakening.slug)}">${escapeHtml(simulated.awakening.label)}</div>
        <div class="equipment-chip">${escapeHtml(equipmentSummary(simulated.equipment))}</div>
      </div>
    </section>
  `;

  bindSimulatorControls(player);
  els.playerDetail.querySelectorAll(".skill-card").forEach((button) => {
    button.addEventListener("click", () => {
      openSkillModal(simulated, button.dataset.skillId);
    });
  });
}

function bindSimulatorControls(player) {
  const levelInput = els.playerDetail.querySelector("#simLevelInput");
  const levelRange = els.playerDetail.querySelector("#simLevelRange");
  const awakeningButton = els.playerDetail.querySelector("#simAwakeningButton");
  const awakeningMenu = els.playerDetail.querySelector("#simAwakeningMenu");

  const updateLevel = (value) => {
    state.simulator.level = clampNumber(value, 1, 300);
    renderSimulatorDetail();
    saveState();
  };
  levelInput?.addEventListener("change", (event) => updateLevel(event.target.value));
  levelRange?.addEventListener("input", (event) => updateLevel(event.target.value));

  const closeAwakeningMenu = (event) => {
    if (!awakeningMenu || !awakeningButton || awakeningMenu.hidden) {
      return;
    }
    if (!awakeningMenu.contains(event.target) && !awakeningButton.contains(event.target)) {
      awakeningMenu.hidden = true;
      awakeningButton.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", closeAwakeningMenu);
    }
  };

  awakeningButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!awakeningMenu) {
      return;
    }
    const isOpen = !awakeningMenu.hidden;
    awakeningMenu.hidden = isOpen;
    awakeningButton.setAttribute("aria-expanded", String(!isOpen));
    document.removeEventListener("click", closeAwakeningMenu);
    if (isOpen) {
      return;
    }
    setTimeout(() => document.addEventListener("click", closeAwakeningMenu), 0);
  });

  awakeningMenu?.addEventListener("click", (event) => event.stopPropagation());

  awakeningMenu?.querySelectorAll("[data-awakening-code]").forEach((button) => {
    button.addEventListener("click", (event) => {
      state.simulator.awakeningCode = Number(event.currentTarget.dataset.awakeningCode);
      document.removeEventListener("click", closeAwakeningMenu);
      renderSimulatorDetail();
      saveState();
    });
  });

  awakeningButton?.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && awakeningMenu && !awakeningMenu.hidden) {
      awakeningMenu.hidden = true;
      awakeningButton.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", closeAwakeningMenu);
      awakeningButton.focus();
    }
  });

  els.playerDetail.querySelectorAll("[data-equipment-slot]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const position = event.target.dataset.equipmentPosition || player.position?.code || "";
      const slot = event.target.dataset.equipmentSlot;
      setEquipmentLevel(position, slot, event.target.value);
      renderSimulatorDetail();
      saveState();
    });
  });

  els.playerDetail.querySelector("#equipmentConfigButton")?.addEventListener("click", () => {
    openEquipmentModal(player);
  });
}

function renderAwakeningPicker(player, selectedCode) {
  const options = awakeningOptionsForPlayer(player);
  const selected = options.find((option) => Number(option.code) === Number(selectedCode)) || options[0] || awakeningTierInfo(selectedCode);
  return `
    <div class="awakening-picker">
      <button
        id="simAwakeningButton"
        class="awakening-picker-button awakening-ribbon-${escapeAttr(selected.slug)}"
        type="button"
        aria-haspopup="listbox"
        aria-expanded="false"
      >
        <span class="awakening-picker-chip awakening-ribbon-${escapeAttr(selected.slug)}"></span>
        <span>${escapeHtml(selected.label)}</span>
      </button>
      <div id="simAwakeningMenu" class="awakening-menu" role="listbox" hidden>
        ${options
          .map(
            (option) => `
              <button
                class="awakening-choice${Number(option.code) === Number(selectedCode) ? " is-selected" : ""}"
                type="button"
                role="option"
                aria-selected="${Number(option.code) === Number(selectedCode) ? "true" : "false"}"
                data-awakening-code="${escapeAttr(option.code)}"
              >
                <span class="awakening-choice-chip awakening-ribbon-${escapeAttr(option.slug)}"></span>
                <span>${escapeHtml(option.label)}</span>
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function simulatePlayer(player) {
  const level = clampNumber(state.simulator.level, 1, 300);
  const awakeningCode = normalizeAwakeningCodeForPlayer(player, state.simulator.awakeningCode);
  const stats = computeSimulatorStats(player, level, awakeningCode, state.simulator.equipmentLevelsByPosition);
  const skills = simulateSkills(player.skills || [], level, awakeningCode);
  const rawSkillBonus = skills.reduce((total, skill) => total + (skill.total_power_bonus || 0), 0);
  const awakening = awakeningTierInfo(awakeningCode);
  const totalPower = stats.stat_total + Math.round(rawSkillBonus * SKILL_POWER_WEIGHT);

  return {
    ...player,
    level,
    awakening: {
      code: awakeningCode,
      label: awakening.label,
      slug: awakening.slug,
    },
    equipment: {
      position: player.position?.code || "",
      levels: stats.source.equipment_levels,
      bonuses: stats.equipment_bonus,
      slots: stats.equipment_slots,
    },
    stats,
    skills,
    total_power: totalPower,
  };
}

function simulateCollectionEntry(entry, equipmentLevelsByPosition = currentCollectionEquipment()) {
  const player = playerById(entry?.playerId || entry?.player?.id);
  if (!player) {
    return null;
  }
  const level = clampNumber(entry?.level || 1, 1, 300);
  const awakeningCode = normalizeAwakeningCodeForPlayer(player, entry?.rarity ?? player.awakening?.code ?? 9);
  const stats = computeSimulatorStats(player, level, awakeningCode, equipmentLevelsByPosition);
  const skills = simulateSkills(player.skills || [], level, awakeningCode);
  const rawSkillBonus = skills.reduce((total, skill) => total + (skill.total_power_bonus || 0), 0);
  const awakening = awakeningTierInfo(awakeningCode);
  const totalPower = stats.stat_total + Math.round(rawSkillBonus * SKILL_POWER_WEIGHT);

  return {
    ...player,
    level,
    awakening: {
      code: awakeningCode,
      label: awakening.label,
      slug: awakening.slug,
    },
    equipment: {
      position: player.position?.code || "",
      levels: stats.source.equipment_levels,
      bonuses: stats.equipment_bonus,
      slots: stats.equipment_slots,
    },
    stats,
    skills,
    total_power: totalPower,
  };
}

function collectionTotalCapacity(entries = ownedCollectionEntries(), equipmentLevelsByPosition = currentCollectionEquipment()) {
  return (entries || []).reduce((total, entry) => {
    if (entry?.owned === false) {
      return total;
    }
    const simulated = simulateCollectionEntry(entry, equipmentLevelsByPosition);
    return total + Number(simulated?.total_power || 0);
  }, 0);
}

function computeSimulatorStats(player, level, awakeningCode, equipmentLevelsByPosition = state.simulator.equipmentLevelsByPosition) {
  const growth = state.statTables.growth_patterns?.[String(player.growth_pattern_code)]?.[String(level)] || {};
  const coefficients = state.statTables.awakening_coefficients?.[String(awakeningCode)] || {};
  const equipment = equipmentBonusForPlayer(player, equipmentLevelsByPosition);
  const stats = {};

  for (const key of STAT_KEYS) {
    const base = Number(growth[key] || 0);
    const coefficient = Number(coefficients[key] || 10000);
    stats[key] = Math.floor((base * coefficient) / 10000) + Number(equipment.bonuses[key] || 0);
  }
  stats.tp = Number(growth.tp || 0);
  stats.stat_total = stats.tp + stats.kick + stats.technique + stats.block + stats.catch + stats.speed;
  stats.equipment_slots = equipment.slots;
  stats.equipment_bonus = equipment.bonuses;
  stats.source = {
    level,
    awakening_code: awakeningCode,
    equipment_levels: equipmentLevelsForPositionFromSource(player.position?.code || "", equipmentLevelsByPosition),
  };
  return stats;
}

function equipmentBonusForPlayer(player, equipmentLevelsByPosition = state.simulator.equipmentLevelsByPosition) {
  const position = player.position?.code || "";
  const slots = equipmentSlotsForPlayer(player);
  const byPosition = state.statTables.equipment?.[position] || {};
  const bonuses = Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));

  for (const slot of slots) {
    const selectedLevel = selectedEquipmentLevelFromSource(position, slot, equipmentLevelsByPosition);
    const row = byPosition[slot.code]?.[String(selectedLevel)] || {};
    for (const key of STAT_KEYS) {
      bonuses[key] += Number(row[key] || 0);
    }
  }

  return {
    slots: slots.length,
    bonuses,
  };
}

function simulateSkills(skills, playerLevel, awakeningCode) {
  return skills
    .map((skill) => {
      if (skill.kind === "move") {
        if (Number(skill.unlock_level || 1) > playerLevel) {
          const firstLevel = firstLockedSkillLevel(skill) || {};
          return {
            ...skill,
            locked: true,
            locked_reason: `Déblocage Lv.${formatNumber(skill.unlock_level || 1)}`,
            current_level: firstLevel.level || 1,
            current_description: firstLevel.description || skill.current_description || "",
            power: firstLevel.power || skill.power || 0,
            tp_cost: firstLevel.tp_cost || skill.tp_cost || 0,
            total_power_bonus: 0,
          };
        }
        return { ...skill };
      }

      const eligibleLevels = (skill.levels || []).filter((level) => {
        const playerUnlocks = (level.unlock_player_level || []).map(Number).filter(Boolean);
        const awakeningUnlocks = (level.unlock_awakening_code || []).map(Number).filter(Boolean);
        const byPlayer = playerUnlocks.length && playerUnlocks.some((unlock) => unlock <= playerLevel);
        const byAwakening = awakeningUnlocks.length && awakeningUnlocks.some((unlock) => unlock <= awakeningCode);
        const openLevel = !playerUnlocks.length && !awakeningUnlocks.length;
        return byPlayer || byAwakening || openLevel;
      });
      if (!eligibleLevels.length) {
        const firstLevel = firstLockedSkillLevel(skill);
        return {
          ...skill,
          locked: true,
          locked_reason: firstLevel ? passiveUnlockText(firstLevel).replace(/\s-\s$/, "") : "Non débloqué",
          current_level: firstLevel?.level || skill.current_level || "-",
          current_description: firstLevel?.description || skill.current_description || "",
          total_power_bonus: 0,
        };
      }
      const current = maxBy(eligibleLevels, "level") || {};
      return {
        ...skill,
        current_level: current.level || skill.current_level || null,
        current_description: current.description || skill.current_description || "",
        total_power_bonus: Number(current.total_power_bonus || 0),
      };
    })
    .filter(Boolean);
}

function firstLockedSkillLevel(skill) {
  return (skill.levels || [])
    .slice()
    .sort((a, b) => Number(a.level || 0) - Number(b.level || 0))[0];
}

function equipmentSlotsForPlayer(player) {
  return equipmentSlotsForPosition(player.position?.code);
}

function equipmentSlotsForPosition(position) {
  return sortEquipmentSlots(state.statTables.equipment_slots?.[position] || []);
}

function sortEquipmentSlots(slots) {
  return [...slots].sort((a, b) => {
    const aOrder = EQUIPMENT_SCREEN_ORDER.indexOf(Number(a.order || 0));
    const bOrder = EQUIPMENT_SCREEN_ORDER.indexOf(Number(b.order || 0));
    const safeA = aOrder === -1 ? Number.MAX_SAFE_INTEGER : aOrder;
    const safeB = bOrder === -1 ? Number.MAX_SAFE_INTEGER : bOrder;
    return safeA - safeB || Number(a.order || 0) - Number(b.order || 0);
  });
}

function equipmentSlotLabel(slot) {
  return EQUIPMENT_SLOT_LABELS[slot.code] || slot.fr || slot.jp || slot.code;
}

function syncSimulatorEquipmentDefaults(player) {
  state.simulator.level = clampNumber(state.simulator.level, 1, 300);
  state.simulator.awakeningCode = normalizeAwakeningCodeForPlayer(player, state.simulator.awakeningCode);
  syncSimulatorEquipmentState();
  ensureEquipmentDefaultsForPosition(player.position?.code || "");
}

function syncSimulatorEquipmentState() {
  state.simulator.equipmentLevelsByPosition ||= {};
  const legacy = state.simulator.equipmentLevels || {};
  for (const position of EQUIPMENT_POSITIONS) {
    state.simulator.equipmentLevelsByPosition[position] ||= {};
    for (const slot of equipmentSlotsForPosition(position)) {
      if (state.simulator.equipmentLevelsByPosition[position][slot.code] == null) {
        state.simulator.equipmentLevelsByPosition[position][slot.code] = Number(legacy[slot.code] || DEFAULT_EQUIPMENT_LEVEL);
      }
    }
  }
}

function ensureEquipmentDefaultsForPosition(position) {
  if (!position) {
    return;
  }
  state.simulator.equipmentLevelsByPosition ||= {};
  state.simulator.equipmentLevelsByPosition[position] ||= {};
  for (const slot of equipmentSlotsForPosition(position)) {
    if (state.simulator.equipmentLevelsByPosition[position][slot.code] == null) {
      state.simulator.equipmentLevelsByPosition[position][slot.code] = DEFAULT_EQUIPMENT_LEVEL;
    }
  }
}

function equipmentLevelsForPosition(position) {
  syncSimulatorEquipmentState();
  ensureEquipmentDefaultsForPosition(position);
  return equipmentLevelsForPositionFromSource(position, state.simulator.equipmentLevelsByPosition);
}

function equipmentLevelsForPositionFromSource(position, levelsByPosition = {}) {
  const source = levelsByPosition || {};
  const bySlot = source[position] || {};
  const result = {};
  for (const slot of equipmentSlotsForPosition(position)) {
    result[slot.code] = normalizeEquipmentLevel(slot, bySlot[slot.code]);
  }
  return result;
}

function normalizeEquipmentLevel(slot, value) {
  const requested = Number(value || DEFAULT_EQUIPMENT_LEVEL);
  const levels = (slot.levels || []).map(Number);
  if (levels.includes(requested)) {
    return requested;
  }
  return levels.reduce((best, level) => (Math.abs(level - requested) < Math.abs(best - requested) ? level : best), levels[0] || DEFAULT_EQUIPMENT_LEVEL);
}

function setEquipmentLevel(position, slotCode, level) {
  if (!position || !slotCode) {
    return;
  }
  syncSimulatorEquipmentState();
  state.simulator.equipmentLevelsByPosition[position] ||= {};
  state.simulator.equipmentLevelsByPosition[position][slotCode] = Number(level) || DEFAULT_EQUIPMENT_LEVEL;
}

function renderEquipmentControl(player, slot, position = player.position?.code || "") {
  const selected = selectedEquipmentLevel(position, slot);
  const icon = equipmentIcon(slot, position, selected);
  return `
    <label class="equipment-control">
      <span class="equipment-label">
        ${icon ? `<img src="${escapeAttr(icon)}" alt="" />` : ""}
        <span>${escapeHtml(equipmentSlotLabel(slot))}</span>
      </span>
      <select data-equipment-position="${escapeAttr(position)}" data-equipment-slot="${escapeAttr(slot.code)}">
        ${(slot.levels || [])
          .map((level) => `<option value="${escapeAttr(level)}"${Number(level) === selected ? " selected" : ""}>Lv.${escapeHtml(level)}</option>`)
          .join("")}
      </select>
    </label>
  `;
}

function selectedEquipmentLevel(position, slot) {
  syncSimulatorEquipmentState();
  ensureEquipmentDefaultsForPosition(position);
  return selectedEquipmentLevelFromSource(position, slot, state.simulator.equipmentLevelsByPosition);
}

function selectedEquipmentLevelFromSource(position, slot, levelsByPosition = {}) {
  const source = levelsByPosition || {};
  return normalizeEquipmentLevel(slot, source[position]?.[slot.code]);
}

function equipmentSummary(equipment) {
  const levels = Object.values(equipment.levels || {}).map(Number).filter(Boolean);
  if (!levels.length) {
    return "Équipement -";
  }
  const allSame = levels.every((level) => level === levels[0]);
  return allSame ? `Équipement Lv.${levels[0]}` : `Équipement ${levels.map((level) => `Lv.${level}`).join(" / ")}`;
}

function equipmentIcon(slot, position, level = DEFAULT_EQUIPMENT_LEVEL) {
  const order = Number(slot.order || 0);
  if (!position || !order) {
    return null;
  }
  const grade = equipmentGradeForLevel(level);
  return assetPath(`assets/equipment/Icon_Equipment_${position}_${String(order).padStart(2, "0")}_${String(grade).padStart(4, "0")}.png`);
}

function equipmentGradeForLevel(level) {
  return Math.min(6, Math.max(1, Math.floor((Number(level || DEFAULT_EQUIPMENT_LEVEL) - 1) / 50) + 1));
}

function openEquipmentModal(player) {
  syncSimulatorEquipmentState();
  els.skillModal.classList.add("is-equipment-modal");
  els.skillModal.classList.remove("is-privacy-modal");
  els.skillModalBody.innerHTML = `
    <header class="modal-skill-head equipment-modal-head">
      <span class="equipment-modal-icon">${renderPositionBadge(player.position, { compact: true })}</span>
      <div>
        <p>Simulation</p>
        <h2 id="skillModalTitle">Configurer mes équipements</h2>
      </div>
    </header>
    <div class="equipment-modal-body">
      ${EQUIPMENT_POSITIONS.map(renderEquipmentPositionRow).join("")}
    </div>
  `;
  els.skillModal.hidden = false;
  document.body.classList.add("modal-open");
  bindEquipmentModalControls(player);
  els.skillModalClose.focus();
}

function renderEquipmentPositionRow(position) {
  ensureEquipmentDefaultsForPosition(position);
  const slots = equipmentSlotsForPosition(position);
  const levels = Object.values(equipmentLevelsForPosition(position)).map(Number).filter(Boolean);
  const average = levels.length ? Math.round(levels.reduce((total, level) => total + level, 0) / levels.length) : DEFAULT_EQUIPMENT_LEVEL;
  return `
    <section class="equipment-position-row equipment-position-${escapeAttr(position.toLowerCase())}">
      <div class="equipment-position-title">
        ${renderPositionBadge({ code: position, fr: labels.positions[position] }, { compact: true })}
        <span>${escapeHtml(position)}</span>
        <small>Moy. Lv.${escapeHtml(average)}</small>
      </div>
      <div class="equipment-position-slots">
        ${slots.map((slot) => renderEquipmentModalSlot(position, slot)).join("")}
      </div>
    </section>
  `;
}

function renderEquipmentModalSlot(position, slot) {
  const selected = selectedEquipmentLevel(position, slot);
  const icon = equipmentIcon(slot, position, selected);
  return `
    <label class="equipment-modal-slot">
      <span class="equipment-modal-picture">
        ${icon ? `<img src="${escapeAttr(icon)}" alt="" />` : ""}
      </span>
      <span class="equipment-modal-name">${escapeHtml(equipmentSlotLabel(slot))}</span>
      <select data-equipment-position="${escapeAttr(position)}" data-equipment-slot="${escapeAttr(slot.code)}">
        ${(slot.levels || [])
          .map((level) => `<option value="${escapeAttr(level)}"${Number(level) === selected ? " selected" : ""}>Lv.${escapeHtml(level)}</option>`)
          .join("")}
      </select>
    </label>
  `;
}

function bindEquipmentModalControls(player) {
  els.skillModalBody.querySelectorAll("[data-equipment-slot]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const position = event.target.dataset.equipmentPosition || "";
      const slotCode = event.target.dataset.equipmentSlot || "";
      setEquipmentLevel(position, slotCode, event.target.value);
      const slot = equipmentSlotsForPosition(position).find((item) => item.code === slotCode);
      const image = event.target.closest(".equipment-modal-slot")?.querySelector("img");
      if (slot && image) {
        image.src = equipmentIcon(slot, position, event.target.value);
      }
      renderSimulatorDetail();
      saveState();
    });
  });
}

function awakeningOptionsForPlayer(player) {
  const initial = Number.isFinite(Number(player.rarity?.initial_awakening_code)) ? Number(player.rarity.initial_awakening_code) : 0;
  const availableCodes = Object.keys(state.statTables.awakening_coefficients || awakeningTiers).map(Number);
  const codes = availableCodes
    .filter((code) => Number.isFinite(code) && code >= initial)
    .sort((a, b) => a - b);
  return codes.map((code) => {
    const tier = awakeningTierInfo(code);
    return {
      code,
      label: tier.label,
      slug: tier.slug,
    };
  });
}

function normalizeAwakeningCodeForPlayer(player, code) {
  const options = awakeningOptionsForPlayer(player).map((option) => Number(option.code));
  const requestedNumber = Number(code);
  const requested = Number.isFinite(requestedNumber) ? requestedNumber : options[0];
  if (options.includes(requested)) {
    return requested;
  }
  return options.find((option) => option > requested) ?? options[0] ?? 0;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function renderStats(stats) {
  const rows = ["tp", "kick", "technique", "block", "catch", "speed"];
  return rows
    .map((key) => {
      const statKey = key === "block" ? "block" : key;
      const iconKey = key === "block" ? "block" : key;
      return `
        <div class="stat-line">
          <img src="${escapeAttr(assetPath(`assets/stats/${iconKey}.png`))}" alt="" />
          <span>${escapeHtml(labels.stats[key])}</span>
          <strong>${formatNumber(stats?.[statKey] || 0)}</strong>
        </div>
      `;
    })
    .join("");
}

function renderSkills(skills) {
  if (!skills.length) {
    return `<p class="empty-line">Aucune technique ou capacité.</p>`;
  }
  const awakeningPassives = [];
  const levelPassives = [];
  const moves = [];

  skills.forEach((skill, index) => {
    if (skill.kind === "move") {
      moves.push({ skill, index });
      return;
    }
    if (isAwakeningPassive(skill)) {
      awakeningPassives.push({ skill, index });
      return;
    }
    levelPassives.push({ skill, index });
  });

  awakeningPassives.sort((a, b) => currentAwakeningCode(a.skill) - currentAwakeningCode(b.skill) || a.index - b.index);
  levelPassives.sort((a, b) => firstPlayerUnlockLevel(a.skill) - firstPlayerUnlockLevel(b.skill) || a.index - b.index);
  moves.sort((a, b) => firstPlayerUnlockLevel(a.skill) - firstPlayerUnlockLevel(b.skill) || a.index - b.index);

  return [
    ...awakeningPassives.map(({ skill }) => renderAwakeningPassiveCard(skill)),
    ...levelPassives.map(({ skill }) => renderSkill(skill)),
    ...moves.map(({ skill }) => renderSkill(skill)),
  ].join("");
}

function renderSkill(skill) {
  if (skill.kind === "move") {
    return renderMoveSkillCard(skill);
  }
  return renderPassiveSimpleCard(skill);
}

function isAwakeningPassive(skill) {
  return skill.kind === "passive" && (skill.levels || []).some((level) => (level.unlock_awakening_code || []).length);
}

function firstPlayerUnlockLevel(skill) {
  const levels = (skill.levels || [])
    .flatMap((level) => level.unlock_player_level || [])
    .map(Number)
    .filter((level) => Number.isFinite(level) && level > 0);
  if (levels.length) {
    return Math.min(...levels);
  }
  const fallback = Number(skill.unlock_level);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : Number.MAX_SAFE_INTEGER;
}

function awakeningTierInfo(code) {
  return awakeningTiers[code] || { label: `EVEIL ${formatNumber(code)}`, slug: "unknown" };
}

function awakeningCodeForLevel(level) {
  return Number((level.unlock_awakening_code || [0])[0] || 0);
}

function currentAwakeningCode(skill) {
  const maxLevel = Number(skill.current_level || 0);
  const eligible = (skill.levels || [])
    .filter((level) => (level.unlock_awakening_code || []).length)
    .filter((level) => !maxLevel || Number(level.level || 0) <= maxLevel)
    .sort((a, b) => Number(b.level || 0) - Number(a.level || 0));
  return eligible.length ? awakeningCodeForLevel(eligible[0]) : 0;
}

function modalSkillLevels(skill) {
  if (!isAwakeningPassive(skill)) {
    return (skill.levels || []).map((level) => ({ level, tier: null, awakeningCode: 0 }));
  }
  return (skill.levels || [])
    .filter((level) => (level.unlock_awakening_code || []).length)
    .map((level) => {
      const awakeningCode = awakeningCodeForLevel(level);
      return {
        level,
        awakeningCode,
        tier: awakeningTierInfo(awakeningCode),
      };
    })
    .sort((a, b) => b.awakeningCode - a.awakeningCode || b.level.level - a.level.level);
}

function renderMoveSkillCard(skill) {
  return `
    <button class="skill-card skill-move technique-card${skill.locked ? " is-locked" : ""}" type="button" data-skill-id="${escapeAttr(skill.id)}">
      <span class="skill-level">Lv.${escapeHtml(skill.current_level || "-")}</span>
      <span class="skill-frame">
        <span class="skill-title-line">
          <span class="skill-element-icon">${renderElementIcon(skill.element?.code)}</span>
          <strong>${escapeHtml(skill.name)}</strong>
        </span>
        <span class="skill-info-line">
          <span class="skill-type-badge">${renderMoveTypeIcon(skill.type?.code)}</span>
          <span class="skill-tp">
            <span><strong>TP</strong> ${formatNumber(skill.tp_cost || 0)}</span>
            <span class="skill-green-bar"><span></span></span>
          </span>
          <span class="skill-power">
            <img src="${escapeAttr(assetPath("assets/skill-card/power-white.png"))}" alt="" />
            <strong>${formatNumber(skill.power || 0)}</strong>
          </span>
        </span>
        ${skill.locked ? `<span class="locked-note">${escapeHtml(skill.locked_reason || "Non débloqué")}</span>` : ""}
      </span>
    </button>
  `;
}

function renderAwakeningPassiveCard(skill) {
  return `
    <button class="skill-card skill-passive awakening-passive-card${skill.locked ? " is-locked" : ""}" type="button" data-skill-id="${escapeAttr(skill.id)}">
      <span class="skill-level">Lv.${escapeHtml(skill.current_level || "-")}</span>
      <span class="passive-mark">P</span>
      <span class="skill-name">
        <strong>${escapeHtml(skill.name)}</strong>
        ${skill.locked ? `<small>${escapeHtml(skill.locked_reason || "Non débloqué")}</small>` : ""}
      </span>
    </button>
  `;
}

function renderPassiveSimpleCard(skill) {
  return `
    <button class="skill-card skill-passive${skill.locked ? " is-locked" : ""}" type="button" data-skill-id="${escapeAttr(skill.id)}">
      <span class="skill-level">Lv.${escapeHtml(skill.current_level || "-")}</span>
      <span class="passive-mark">P</span>
      <span class="skill-name">
        <strong>${escapeHtml(skill.name)}</strong>
        <small>${escapeHtml(skill.locked ? skill.locked_reason || "Non débloqué" : skill.unlock_level ? `Déblocage Lv.${skill.unlock_level}` : "Passif")}</small>
      </span>
    </button>
  `;
}

function renderPassiveSkillCard(skill) {
  return `
    <button class="skill-card skill-passive" type="button" data-skill-id="${escapeAttr(skill.id)}">
      <span class="skill-level">Lv.${escapeHtml(skill.current_level || "-")}</span>
      <span class="skill-frame passive-frame">
        <span class="skill-title-line">
          <span class="skill-element-icon passive-element-icon"><span class="passive-mark">P</span></span>
          <strong>${escapeHtml(skill.name)}</strong>
        </span>
        <span class="skill-info-line passive-info-line">
          <span class="skill-type-badge passive-type-badge"><span class="passive-mark">P</span></span>
          <span class="skill-passive-summary">
            <span>${escapeHtml(skill.unlock_level ? `Déblocage Lv.${formatNumber(skill.unlock_level)}` : "Déblocage spécial")}</span>
            <strong>${escapeHtml(skill.total_power_bonus ? `Bonus ${formatNumber(skill.total_power_bonus)}` : "Passif")}</strong>
          </span>
        </span>
      </span>
    </button>
  `;
}

function openSkillModal(player, skillId) {
  const skill = player.skills.find((item) => item.id === skillId);
  if (!skill) {
    return;
  }

  els.skillModal.classList.remove("is-equipment-modal", "is-privacy-modal");
  const icon = skill.kind === "move" ? renderMoveTypeIcon(skill.type?.code) : `<span class="passive-mark">P</span>`;
  const kindLabel = skill.kind === "move" ? "Technique" : "Passif";
  const levels = modalSkillLevels(skill)
    .map((row) => `
      <li class="${row.tier ? "awakening-level-detail" : ""}">
        <strong>Lv.${escapeHtml(row.level.level)}</strong>
        <span>
          ${row.tier ? `<b class="awakening-tier awakening-tier-${escapeAttr(row.tier.slug)}">${escapeHtml(row.tier.label)}</b>` : ""}
          ${skill.kind === "passive" && !row.tier ? `<em>${escapeHtml(passiveUnlockText(row.level))}</em>` : ""}
          <span class="skill-level-description">${escapeHtml(row.level.description || "")}</span>
        </span>
      </li>
    `)
    .join("");

  els.skillModalBody.innerHTML = `
    <header class="modal-skill-head">
      ${icon}
      <div>
        <p>${escapeHtml(kindLabel)} - ${escapeHtml(displayName(player))}</p>
        <h2 id="skillModalTitle">${escapeHtml(skill.name)}</h2>
      </div>
      <span class="skill-level modal-current-level">Lv.${escapeHtml(skill.current_level || "-")}</span>
    </header>
    <div class="skill-detail modal-skill-detail">
      <p>${escapeHtml(skill.current_description || "")}</p>
      <ol>${levels}</ol>
    </div>
  `;
  els.skillModal.hidden = false;
  document.body.classList.add("modal-open");
  els.skillModalClose.focus();
}

function closeSkillModal() {
  els.skillModal.hidden = true;
  els.skillModal.classList.remove("is-equipment-modal", "is-privacy-modal");
  els.skillModalBody.innerHTML = "";
  if (!els.authModal || els.authModal.hidden) {
    document.body.classList.remove("modal-open");
  }
}

function passiveUnlockText(level) {
  const playerLevels = (level.unlock_player_level || []).map(formatNumber);
  const awakeningLevels = (level.unlock_awakening_code || []).map(formatNumber);
  const coachLevels = (level.unlock_coach_level || []).map(formatNumber);
  const parts = [];
  if (coachLevels.length) {
    parts.push(`Entraîneur Lv.${coachLevels.join("/")}`);
  }
  if (playerLevels.length) {
    parts.push(`Joueur Lv.${playerLevels.join("/")}`);
  }
  if (awakeningLevels.length) {
    parts.push(`Éveil ${awakeningLevels.join("/")}`);
  }
  return parts.length ? `${parts.join(" + ")} - ` : "";
}

function renderModel(player) {
  const fullbody = imageUrl(player, "fullbody");
  const portrait = imageUrl(player, "portrait");
  if (fullbody) {
    return `<img class="fullbody" src="${escapeAttr(fullbody)}" alt="" />`;
  }
  if (portrait) {
    return `<img class="portrait-large" src="${escapeAttr(portrait)}" alt="" />`;
  }
  return `<span class="model-fallback">${escapeHtml(initials(displayName(player)))}</span>`;
}

function renderPositionGrid(areas) {
  const areaByCode = new Map();
  for (const area of areas) {
    if (area.field_area_code) {
      areaByCode.set(Number(area.field_area_code), area);
    }
  }
  const layout = [
    { code: 1, row: "1", col: "1" },
    { code: 2, row: "1", col: "2 / span 2" },
    { code: 3, row: "1", col: "4" },
    { code: 4, row: "2 / span 2", col: "1" },
    { code: 5, row: "2", col: "2 / span 2" },
    { code: 6, row: "2 / span 2", col: "4" },
    { code: 7, row: "3", col: "2 / span 2" },
    { code: 8, row: "4", col: "1" },
    { code: 9, row: "4", col: "2 / span 2" },
    { code: 10, row: "4", col: "4" },
    { code: 11, row: "5", col: "2 / span 2" },
  ];
  const cells = layout.map((cell) => {
    const area = areaByCode.get(cell.code);
    return `
      <span
        class="zone-cell ${area ? `rank-${escapeAttr(String(area.rank || "").toLowerCase())}` : "rank-empty"}"
        style="grid-row:${escapeAttr(cell.row)};grid-column:${escapeAttr(cell.col)}"
        title="${escapeAttr(area ? `${area.name || ""} ${area.rank || ""}` : "")}"
      >${escapeHtml(area?.rank || "")}</span>
    `;
  });
  return `<div class="position-grid">${cells.join("")}</div>`;
}

function renderTagChip(tag) {
  const label = tagLabel(tag);
  const icon = tag.icon ? `<img src="${escapeAttr(assetPath(tag.icon))}" alt="" />` : `<span>${escapeHtml(initials(label))}</span>`;
  return `<span class="tag-chip tag-${escapeAttr(tag.kind || "tag")}" title="${escapeAttr(label)}">${icon}</span>`;
}

function renderElementBadge(element) {
  const code = element?.code || "none";
  return `
    <span class="element-badge element-${escapeAttr(code)}" title="${escapeAttr(element?.fr || labels.elements[code] || code)}">
      ${renderElementIcon(code)}
    </span>
  `;
}

function renderElementIcon(code) {
  const safe = ["fire", "wood", "wind", "mountain"].includes(code) ? code : null;
  if (!safe) {
    return `<span class="element-initial">?</span>`;
  }
  return `<img class="element-icon" src="${assetPath(`assets/elements/${escapeAttr(safe)}.png`)}" alt="" />`;
}

function renderPositionBadge(position, options = {}) {
  const code = position?.code || "?";
  const safe = ["FW", "MF", "DF", "GK"].includes(code) ? code.toLowerCase() : null;
  const label = `${code} ${position?.fr || labels.positions[code] || ""}`.trim();
  if (safe) {
    return `
      <span class="position-badge position-${escapeAttr(safe)}${options.compact ? " is-compact" : ""}" title="${escapeAttr(label)}">
        <img src="${assetPath(`assets/positions/${escapeAttr(safe)}.png`)}" alt="${escapeAttr(code)}" />
      </span>
    `;
  }
  return `<span class="position-badge position-unknown">${escapeHtml(options.compact ? code : label)}</span>`;
}

function renderMoveTypeIcon(type) {
  const safe = ["shot", "dribble", "block", "save"].includes(type) ? type : "shot";
  return `<img class="move-type-icon" src="${assetPath(`assets/skill-card/move-${escapeAttr(safe)}.png`)}" alt="" />`;
}

function renderStars(count) {
  const total = Math.max(0, Number(count) || 0);
  if (!total) {
    return `<span class="stars">?</span>`;
  }
  return `<span class="stars">${Array.from({ length: total }, () => `<img src="${assetPath("assets/ui/star.png")}" alt="" />`).join("")}</span>`;
}

function imageUrl(player, kind) {
  return assetPath(player.images?.[kind]?.url || null);
}

function assetPath(value) {
  if (!value) {
    return null;
  }
  return String(value).replace(/^\/+/, "");
}

function displayName(player) {
  return player.names?.fr || player.names?.display_fr || player.names?.romaji || player.names?.jp || `Entrée ${player.code}`;
}

function teamLabel(player) {
  return tagLabel(teamTag(player));
}

function teamTag(player) {
  return player.tags.find((tag) => tag.kind === "team");
}

function renderTeamLogo(player) {
  const tag = teamTag(player);
  const label = tagLabel(tag) || player.position?.fr || "";
  if (tag?.icon) {
    return `
      <span class="album-card-team team-logo" title="${escapeAttr(label)}">
        <img src="${escapeAttr(assetPath(tag.icon))}" alt="${escapeAttr(label)}" />
      </span>
    `;
  }
  return `<span class="album-card-team">${escapeHtml(label)}</span>`;
}

function tagLabel(tag) {
  return tag?.fr || tag?.jp || tag?.slug || "";
}

function initials(value) {
  return String(value || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("fr-FR");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
