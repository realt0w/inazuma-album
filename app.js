const state = {
  players: [],
  filtered: [],
  selectedId: null,
  filters: {
    query: "",
    team: "all",
    position: "all",
    element: "all",
    style: "all",
    season: "all",
    tag: "all",
    sort: "name_asc",
    playableOnly: true,
  },
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

const els = {
  dbMeta: document.querySelector("#dbMeta"),
  searchInput: document.querySelector("#searchInput"),
  teamFilter: document.querySelector("#teamFilter"),
  positionFilter: document.querySelector("#positionFilter"),
  elementFilter: document.querySelector("#elementFilter"),
  styleFilter: document.querySelector("#styleFilter"),
  seasonFilter: document.querySelector("#seasonFilter"),
  tagFilter: document.querySelector("#tagFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  playableToggle: document.querySelector("#playableToggle"),
  resultCount: document.querySelector("#resultCount"),
  playerGrid: document.querySelector("#playerGrid"),
  playerDetail: document.querySelector("#playerDetail"),
  emptyTemplate: document.querySelector("#emptyTemplate"),
  skillModal: document.querySelector("#skillModal"),
  skillModalBody: document.querySelector("#skillModalBody"),
  skillModalClose: document.querySelector("#skillModalClose"),
};

init();

async function init() {
  bindEvents();
  try {
    const db = await loadAlbumDatabase();
    state.players = db.players || [];
    state.selectedId = state.players.find((player) => player.playable)?.id || state.players[0]?.id || null;
    els.dbMeta.textContent = `${db.playable_count || 0} jouables / ${db.count || state.players.length} total - MAJ ${db.updated_at || "inconnue"}`;
    hydrateFilters();
    applyFilters();
  } catch (error) {
    els.dbMeta.textContent = "Erreur de chargement";
    els.playerDetail.innerHTML = `<div class="empty-state"><h2>Lecture impossible</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
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

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.filters.query = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  for (const [key, element] of [
    ["team", els.teamFilter],
    ["position", els.positionFilter],
    ["element", els.elementFilter],
    ["style", els.styleFilter],
    ["season", els.seasonFilter],
    ["tag", els.tagFilter],
  ]) {
    element.addEventListener("change", (event) => {
      state.filters[key] = event.target.value;
      applyFilters();
    });
  }

  els.sortSelect.addEventListener("change", (event) => {
    state.filters.sort = event.target.value;
    applyFilters();
  });

  els.playableToggle.addEventListener("click", () => {
    state.filters.playableOnly = !state.filters.playableOnly;
    applyFilters();
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
  });
}

function hydrateFilters() {
  setOptions(els.teamFilter, "Toutes", uniqueTagValues("team"));
  setOptions(els.positionFilter, "Tous", uniqueValues(state.players.map((player) => player.position?.code).filter(Boolean)), (value) => `${value} - ${labels.positions[value] || value}`);
  setOptions(els.elementFilter, "Tous", uniqueValues(state.players.map((player) => player.element?.code).filter(Boolean)), (value) => labels.elements[value] || value);
  setOptions(els.styleFilter, "Tous", uniqueTagValues("play_style"));
  setOptions(els.seasonFilter, "Toutes", uniqueTagValues("season"));
  setOptions(els.tagFilter, "Tous", uniqueValues(state.players.flatMap((player) => player.tags.map(tagLabel))));
}

function setOptions(select, allLabel, values, labeler = (value) => value) {
  select.innerHTML = [
    `<option value="all">${escapeHtml(allLabel)}</option>`,
    ...values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(labeler(value))}</option>`),
  ].join("");
}

function uniqueTagValues(kind) {
  return uniqueValues(
    state.players
      .flatMap((player) => player.tags.filter((tag) => tag.kind === kind).map(tagLabel))
      .filter(Boolean),
  );
}

function uniqueValues(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), "fr"));
}

function applyFilters() {
  const filters = state.filters;
  state.filtered = state.players
    .filter((player) => {
      const tags = player.tags.map(tagLabel);
      const matchesQuery = !filters.query || searchableText(player).includes(filters.query);
      const matchesTeam = filters.team === "all" || hasTag(player, "team", filters.team);
      const matchesPosition = filters.position === "all" || player.position?.code === filters.position;
      const matchesElement = filters.element === "all" || player.element?.code === filters.element;
      const matchesStyle = filters.style === "all" || hasTag(player, "play_style", filters.style);
      const matchesSeason = filters.season === "all" || hasTag(player, "season", filters.season);
      const matchesTag = filters.tag === "all" || tags.includes(filters.tag);
      const matchesPlayable = !filters.playableOnly || player.playable;
      return matchesPlayable && matchesQuery && matchesTeam && matchesPosition && matchesElement && matchesStyle && matchesSeason && matchesTag;
    })
    .sort(sortPlayers(filters.sort));

  if (!state.filtered.some((player) => player.id === state.selectedId)) {
    state.selectedId = state.filtered[0]?.id || null;
  }

  renderGrid();
  renderDetail();
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

function renderGrid() {
  const count = state.filtered.length;
  els.resultCount.textContent = `${count} joueur${count > 1 ? "s" : ""}${state.filters.playableOnly ? " jouable" + (count > 1 ? "s" : "") : ""}`;
  const showingAll = !state.filters.playableOnly;
  els.playableToggle.innerHTML = `<span>Tous</span><span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>`;
  els.playableToggle.setAttribute("aria-pressed", String(showingAll));
  els.playableToggle.setAttribute("aria-label", showingAll ? "Afficher seulement les joueurs jouables" : "Afficher tous les joueurs");

  if (!count) {
    els.playerGrid.innerHTML = "";
    return;
  }

  els.playerGrid.innerHTML = state.filtered
    .map((player) => {
      const active = player.id === state.selectedId ? " is-active" : "";
      const portrait = imageUrl(player, "portrait") || imageUrl(player, "fullbody");
      return `
        <button class="album-card${active}" type="button" data-id="${escapeAttr(player.id)}">
          <span class="portrait-frame">
            ${portrait ? `<img src="${escapeAttr(portrait)}" alt="" />` : `<span>${escapeHtml(initials(displayName(player)))}</span>`}
          </span>
          <span class="album-card-body">
            <strong>${escapeHtml(displayName(player))}</strong>
            <span class="album-card-team">${escapeHtml(teamLabel(player) || player.position?.fr || "")}</span>
            <span class="mini-meta">
              <span class="card-badges">
                ${renderElementIcon(player.element?.code)}
                ${renderPositionBadge(player.position, { compact: true })}
              </span>
              <span class="card-stars">${renderStars(player.rarity?.stars)}</span>
              ${player.playable ? "" : `<span class="non-playable-badge">NPC</span>`}
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
    });
  });
}

function renderDetail() {
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
  return skills.map(renderSkill).join("");
}

function renderSkill(skill) {
  const icon = skill.kind === "move" ? renderMoveTypeIcon(skill.type?.code) : `<span class="passive-mark">P</span>`;
  const kindLabel = skill.kind === "move" ? "Technique" : "Passif";

  return `
    <button class="skill-card skill-${escapeAttr(skill.kind)}" type="button" data-skill-id="${escapeAttr(skill.id)}">
      <span class="skill-level">Lv.${escapeHtml(skill.current_level || "-")}</span>
      ${icon}
      <span class="skill-name">
        <strong>${escapeHtml(skill.name)}</strong>
        <small>${escapeHtml(kindLabel)}${skill.unlock_level ? ` - déblocage Lv.${escapeHtml(skill.unlock_level)}` : ""}</small>
      </span>
    </button>
  `;
}

function openSkillModal(player, skillId) {
  const skill = player.skills.find((item) => item.id === skillId);
  if (!skill) {
    return;
  }

  const icon = skill.kind === "move" ? renderMoveTypeIcon(skill.type?.code) : `<span class="passive-mark">P</span>`;
  const kindLabel = skill.kind === "move" ? "Technique" : "Passif";
  const levels = skill.levels
    .map((level) => `
      <li>
        <strong>Lv.${escapeHtml(level.level)}</strong>
        <span>${escapeHtml(level.description || "")}</span>
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
  els.skillModalBody.innerHTML = "";
  document.body.classList.remove("modal-open");
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
  return `<div class="position-grid">${cells}</div>`;
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
  const label = options.compact ? code : `${code} ${position?.fr || labels.positions[code] || ""}`;
  return `<span class="position-badge position-${escapeAttr(code.toLowerCase())}">${escapeHtml(label)}</span>`;
}

function renderMoveTypeIcon(type) {
  const safe = ["shot", "dribble", "block", "save"].includes(type) ? type : "shot";
  return `<img class="move-type-icon" src="${assetPath(`assets/move-types/${escapeAttr(safe)}.png`)}" alt="" />`;
}

function renderStars(count) {
  const total = Math.max(0, Number(count) || 0);
  if (!total) {
    return `<span class="stars">?</span>`;
  }
  return `<span class="stars">${Array.from({ length: total }, () => `<img src="${assetPath("assets/ui/star.svg")}" alt="" />`).join("")}</span>`;
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
  return player.names?.fr || player.names?.display_fr || player.names?.romaji || `Joueur ${player.code}`;
}

function teamLabel(player) {
  return tagLabel(player.tags.find((tag) => tag.kind === "team"));
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
