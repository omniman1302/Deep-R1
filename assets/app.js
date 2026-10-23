/* ============================================================
   NEET PG 2026 Allotment Explorer
   ------------------------------------------------------------
   Round data files call window.registerRound({ id, rows, ... }).
   Row array order is defined by ROW_SCHEMA below.
   ============================================================ */

(() => {
  "use strict";

  /* ---------- Schema ---------- */

  // Order of values inside each row array in data/*.js
  const ROW_SCHEMA = [
    "rank",
    "score",
    "quota",
    "institute",
    "course",
    "allottedCategory",
    "candidateCategory",
    "state",
    "remarks",
  ];

  const COLUMNS = [
    { key: "rank", label: "Rank", type: "num", cls: "rank", stickyLeft: true },
    { key: "score", label: "Score", type: "num", cls: "score" },
    { key: "quota", label: "Quota", type: "text", tag: true },
    { key: "institute", label: "Allotted Institute", type: "text", cls: "inst" },
    { key: "course", label: "Course", type: "text", cls: "course" },
    { key: "allottedCategory", label: "Allotted Category", type: "text" },
    { key: "candidateCategory", label: "Candidate Category", type: "text" },
    { key: "state", label: "State", type: "text" },
    { key: "remarks", label: "Remarks", type: "text", cls: "cell-remark" },
  ];

  const FILTER_FIELDS = [
    { key: "quota", label: "Allotted Quota", host: "field-quota" },
    { key: "course", label: "Course", host: "field-course" },
    { key: "allottedCategory", label: "Allotted Category", host: "field-allotted" },
    { key: "candidateCategory", label: "Candidate Category", host: "field-candidate" },
    { key: "state", label: "State", host: "field-state" },
  ];

  const MANIFEST = window.NEETPG_MANIFEST || { rounds: [] };
  const ROUNDS = MANIFEST.rounds || [];

  const filters = {
    quota: "",
    course: "",
    allottedCategory: "",
    candidateCategory: "",
    state: "",
    institute: "",
    rankMin: "",
    rankMax: "",
    scoreMin: "",
    scoreMax: "",
  };

  const state = {
    roundId: (ROUNDS.find((r) => r.available !== false) || ROUNDS[0] || {}).id || null,
    rows: [],
    filtered: [],
    sortKey: "rank",
    sortDir: "asc",
    page: 1,
    pageSize: 100,
    ready: false,
  };

  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) => Number(n).toLocaleString("en-IN");
  const collator = new Intl.Collator("en", { sensitivity: "base" });
  const esc = (s) => String(s ?? "");

  /* ---------- Theme ---------- */

  const THEME_KEY = "neetpg-theme";
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = saved || (prefersDark ? "dark" : "light");
  }
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  }

  /* ---------- Round registry ---------- */

  const loaded = new Map();

  const scoreStarts = (window.NEETPG_SCORE_RUNS || []).map((r) => r[0]);
  const scoreRuns = window.NEETPG_SCORE_RUNS || [];

  function scoreForRank(rank) {
    if (!scoreStarts.length || !rank) return null;
    let lo = 0;
    let hi = scoreStarts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (scoreStarts[mid] <= rank) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found === -1 ? null : scoreRuns[found][1];
  }

  function expandRows(payload) {
    if (payload.format === 2) {
      const dict = payload.dict || {};
      const institutes = payload.institutes || [];
      const states = payload.states || [];
      const pick = (list, i) => (list && list[i] != null ? list[i] : "");
      return payload.rows.map((r) => {
        const score = r[1] === "" || r[1] == null ? null : Number(r[1]);
        return {
          rank: Number(r[0]) || 0,
          score: score != null ? score : scoreForRank(Number(r[0]) || 0),
          quota: pick(dict.quota, r[2]),
          institute: pick(institutes, r[3]),
          course: pick(dict.course, r[4]),
          allottedCategory: pick(dict.allotted, r[5]),
          candidateCategory: pick(dict.candidate, r[6]),
          state: pick(states, r[3]) || "Unknown",
          remarks: pick(dict.remarks, r[7]),
        };
      });
    }

    return (payload.rows || []).map((row) => {
      const obj = {};
      ROW_SCHEMA.forEach((key, i) => { obj[key] = row[i] ?? ""; });
      obj.rank = Number(obj.rank) || 0;
      obj.score = obj.score === "" || obj.score == null ? scoreForRank(obj.rank) : Number(obj.score);
      return obj;
    });
  }

  window.registerRound = function registerRound(payload) {
    if (!payload || !payload.id) return;
    let entry = ROUNDS.find((r) => r.id === payload.id);
    if (!entry) {
      entry = { id: payload.id, label: payload.label || payload.id };
      ROUNDS.push(entry);
    }
    entry.rows = expandRows(payload);
    entry.loaded = true;
    if (payload.released) entry.released = payload.released;
    if (payload.sourceUrl) entry.sourceUrl = payload.sourceUrl;
    loaded.set(entry.id, entry);
  };

  function roundEntry(id) {
    return loaded.get(id) || ROUNDS.find((r) => r.id === id);
  }

  function loadRound(round) {
    if (!round) return Promise.reject(new Error("Unknown round"));
    if (round.loaded) return Promise.resolve(round);
    if (round._promise) return round._promise;

    round._promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = round.file;
      script.async = false;
      script.onload = () => {
        const entry = roundEntry(round.id);
        if (!entry || !entry.loaded) {
          reject(new Error(`No data registered by ${round.file}`));
          return;
        }
        resolve(entry);
      };
      script.onerror = () => reject(new Error(`Could not load ${round.file}`));
      document.head.appendChild(script);
    });
    return round._promise;
  }

  /* ---------- Dropdown component ---------- */

  function createDropdown({ key, label, host }) {
    const container = document.getElementById(host);
    if (!container) return;

    container.innerHTML = `
      <label>${esc(label)}</label>
      <div class="dropdown">
        <button type="button" class="dd-trigger" aria-haspopup="listbox" aria-expanded="false">
          <span class="dd-value is-all">All</span>
          <span class="dd-caret" aria-hidden="true"></span>
        </button>
        <div class="dd-panel">
          <input type="text" class="dd-search" placeholder="Search ${esc(label.toLowerCase())}…" autocomplete="off" spellcheck="false">
          <div class="dd-options" role="listbox"></div>
        </div>
      </div>
    `;

    const root = container.querySelector(".dropdown");
    const trigger = container.querySelector(".dd-trigger");
    const valueEl = container.querySelector(".dd-value");
    const panel = container.querySelector(".dd-panel");
    const search = container.querySelector(".dd-search");
    const optionsBox = container.querySelector(".dd-options");

    let values = [];

    function setValue(value) {
      filters[key] = value;
      valueEl.textContent = value || "All";
      valueEl.classList.toggle("is-all", !value);
      if (key === "state") onStateChange();
    }

    function render(query = "") {
      const q = query.trim().toLowerCase();
      optionsBox.innerHTML = "";

      const allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = "dd-option";
      allBtn.textContent = "All";
      allBtn.setAttribute("aria-selected", String(filters[key] === ""));
      allBtn.addEventListener("click", () => { setValue(""); close(); });
      optionsBox.appendChild(allBtn);

      let shown = 0;
      for (const value of values) {
        if (q && !value.toLowerCase().includes(q)) continue;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dd-option";
        btn.textContent = value;
        btn.title = value;
        btn.setAttribute("aria-selected", String(filters[key] === value));
        btn.addEventListener("click", () => { setValue(value); close(); });
        optionsBox.appendChild(btn);
        shown++;
      }

      if (!shown) {
        const empty = document.createElement("div");
        empty.className = "dd-empty";
        empty.textContent = "No matches";
        optionsBox.appendChild(empty);
      }
    }

    function open() {
      document.querySelectorAll(".dropdown.open").forEach((d) => d !== root && d.classList.remove("open"));
      root.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
      search.value = "";
      render();
      search.focus({ preventScroll: true });
    }
    function close() {
      root.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      root.classList.contains("open") ? close() : open();
    });
    search.addEventListener("input", () => render(search.value));
    search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { close(); trigger.focus(); }
      if (e.key === "Enter") {
        e.preventDefault();
        const first = optionsBox.querySelector(".dd-option");
        if (first) first.click();
      }
    });
    document.addEventListener("click", (e) => { if (!root.contains(e.target)) close(); });

    return {
      setValues(list) {
        values = list;
        if (filters[key] && !list.includes(filters[key])) setValue("");
        render();
      },
      reset() { setValue(""); },
    };
  }

  const dropdowns = {};
  let stateChangeHandler = () => {};

  function onStateChange() {
    stateChangeHandler();
  }

  /* ---------- Institute autocomplete ---------- */

  const ac = {
    input: null,
    list: null,
    clearBtn: null,
    items: [],
    activeIndex: -1,
    all: [],
    stateOf: new Map(),
  };

  function initAutocomplete() {
    ac.input = $("#institute-input");
    ac.list = $("#institute-list");
    ac.clearBtn = $("#institute-clear");

    ac.input.addEventListener("input", () => {
      if (filters.institute && ac.input.value !== filters.institute) filters.institute = "";
      ac.clearBtn.classList.toggle("visible", !!filters.institute);
      renderSuggestions(ac.input.value);
    });
    ac.input.addEventListener("focus", () => renderSuggestions(ac.input.value));
    ac.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { hideSuggestions(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!ac.list.classList.contains("visible")) { renderSuggestions(ac.input.value); return; }
        const delta = e.key === "ArrowDown" ? 1 : -1;
        ac.activeIndex = (ac.activeIndex + delta + ac.items.length) % ac.items.length;
        highlightActive();
      }
      if (e.key === "Enter" && ac.list.classList.contains("visible")) {
        const el = ac.items[ac.activeIndex] || ac.items[0];
        if (el) { e.preventDefault(); el.click(); }
      }
    });
    ac.clearBtn.addEventListener("click", () => {
      filters.institute = "";
      ac.input.value = "";
      ac.clearBtn.classList.remove("visible");
      hideSuggestions();
      ac.input.focus();
    });
    document.addEventListener("click", (e) => {
      if (!$("#institute-autocomplete").contains(e.target)) hideSuggestions();
    });
  }

  function baseInstitutes() {
    let list = ac.all;
    if (filters.state) list = list.filter((inst) => ac.stateOf.get(inst) === filters.state);
    return list;
  }

  function hideSuggestions() {
    ac.list.classList.remove("visible");
    ac.activeIndex = -1;
  }

  function renderSuggestions(query) {
    const q = query.trim().toLowerCase();
    const base = baseInstitutes();
    let matches;

    if (!q) {
      matches = base.slice(0, 80);
      if (filters.state) matches = base.slice(0, 200);
    } else {
      matches = base.filter((inst) => inst.toLowerCase().includes(q)).slice(0, 80);
    }

    ac.list.innerHTML = "";
    ac.items = [];
    ac.activeIndex = -1;

    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "ac-empty";
      empty.textContent = filters.state ? "No institutes match in this state" : "No matching institutes";
      ac.list.appendChild(empty);
      ac.list.classList.add("visible");
      return;
    }

    for (const inst of matches) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ac-item";
      btn.textContent = inst;
      btn.title = inst;
      btn.addEventListener("click", () => {
        filters.institute = inst;
        ac.input.value = inst;
        ac.clearBtn.classList.add("visible");
        hideSuggestions();
      });
      ac.list.appendChild(btn);
      ac.items.push(btn);
    }
    ac.list.classList.add("visible");
  }

  function highlightActive() {
    ac.items.forEach((el, i) => el.classList.toggle("is-active", i === ac.activeIndex));
    const el = ac.items[ac.activeIndex];
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  function refreshInstitutePool(rows) {
    const names = new Set();
    ac.stateOf = new Map();
    for (const row of rows) {
      names.add(row.institute);
      if (!ac.stateOf.has(row.institute)) ac.stateOf.set(row.institute, row.state);
    }
    ac.all = Array.from(names).sort(collator.compare);
    updateInstitutePlaceholder();
    if (filters.institute && !ac.stateOf.has(filters.institute)) {
      filters.institute = "";
      ac.input.value = "";
      ac.clearBtn.classList.remove("visible");
    }
  }

  function updateInstitutePlaceholder() {
    const count = baseInstitutes().length;
    ac.input.placeholder = filters.state
      ? `Search institute name in ${filters.state}… (${count})`
      : `Search institute name… (${count} available)`;
  }

  /* ---------- Number inputs ---------- */

  function createNumberField(host, key, label) {
    const container = document.getElementById(host);
    if (!container) return null;
    container.innerHTML = `<label for="in-${key}">${esc(label)}</label><input type="number" id="in-${key}" placeholder="Any" step="1">`;
    const input = container.querySelector("input");
    input.addEventListener("input", () => { filters[key] = input.value.trim(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); applyFilters(); }
    });
    return input;
  }

  /* ---------- Table head ---------- */

  function buildHead() {
    const thead = $("#table-head");
    thead.innerHTML = "";
    const tr = document.createElement("tr");

    for (const col of COLUMNS) {
      const th = document.createElement("th");
      th.dataset.key = col.key;
      th.scope = "col";
      th.innerHTML = `${esc(col.label)}<span class="sort-arrow" aria-hidden="true"></span>`;
      th.addEventListener("click", () => {
        if (state.sortKey === col.key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = col.key;
          state.sortDir = col.type === "num" ? "asc" : "asc";
        }
        state.page = 1;
        sortFiltered();
        render();
      });
      tr.appendChild(th);
    }
    thead.appendChild(tr);
  }

  function syncHeadSort() {
    document.querySelectorAll("#table-head th").forEach((th) => {
      const active = th.dataset.key === state.sortKey;
      th.classList.toggle("is-sorted", active);
      const arrow = th.querySelector(".sort-arrow");
      arrow.textContent = active ? (state.sortDir === "asc" ? "▲" : "▼") : "↕";
      th.setAttribute("aria-sort", active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none");
    });
  }

  /* ---------- Filtering ---------- */

  function numericFilter(value, raw) {
    if (raw === "") return true;
    const n = Number(raw);
    if (!Number.isFinite(n)) return true;
    return value != null && value >= n;
  }

  function applyFilters({ keepPage = false } = {}) {
    const rankMin = filters.rankMin === "" ? -Infinity : Number(filters.rankMin);
    const rankMax = filters.rankMax === "" ? Infinity : Number(filters.rankMax);
    const scoreMin = filters.scoreMin === "" ? -Infinity : Number(filters.scoreMin);
    const scoreMax = filters.scoreMax === "" ? Infinity : Number(filters.scoreMax);

    state.filtered = state.rows.filter((row) => {
      if (filters.quota && row.quota !== filters.quota) return false;
      if (filters.course && row.course !== filters.course) return false;
      if (filters.allottedCategory && row.allottedCategory !== filters.allottedCategory) return false;
      if (filters.candidateCategory && row.candidateCategory !== filters.candidateCategory) return false;
      if (filters.state && row.state !== filters.state) return false;
      if (filters.institute && row.institute !== filters.institute) return false;
      if (row.rank < rankMin || row.rank > rankMax) return false;
      if (row.score != null && (row.score < scoreMin || row.score > scoreMax)) return false;
      return true;
    });

    if (!keepPage) state.page = 1;
    sortFiltered();
    render();
  }

  function sortFiltered() {
    const key = state.sortKey;
    const dir = state.sortDir === "asc" ? 1 : -1;
    const col = COLUMNS.find((c) => c.key === key);
    const numeric = col && col.type === "num";

    state.filtered.sort((a, b) => {
      if (numeric) {
        const av = a[key] == null ? -Infinity : Number(a[key]);
        const bv = b[key] == null ? -Infinity : Number(b[key]);
        return (av - bv) * dir;
      }
      return collator.compare(String(a[key]), String(b[key])) * dir;
    });
  }

  function activeFilterCount() {
    return Object.values(filters).filter((v) => v !== "").length;
  }

  function resetFilters() {
    Object.keys(filters).forEach((k) => { filters[k] = ""; });
    Object.values(dropdowns).forEach((d) => d.reset());
    ac.input.value = "";
    ac.clearBtn.classList.remove("visible");
    updateInstitutePlaceholder();
    document.querySelectorAll(".field-num input").forEach((input) => { input.value = ""; });
    applyFilters();
  }

  /* ---------- Rendering ---------- */

  function render() {
    const total = state.filtered.length;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pages);

    const start = (state.page - 1) * state.pageSize;
    const slice = state.filtered.slice(start, start + state.pageSize);

    const body = $("#table-body");
    body.innerHTML = "";

    if (!state.rows.length) {
      body.innerHTML = `<tr><td class="state-cell" colspan="${COLUMNS.length}">No allotment data has been added for this round yet.</td></tr>`;
    } else if (!slice.length) {
      body.innerHTML = `<tr><td class="state-cell" colspan="${COLUMNS.length}">No rows match these filters. Try clearing a few of them.</td></tr>`;
    } else {
      const frag = document.createDocumentFragment();
      for (const row of slice) {
        const tr = document.createElement("tr");

        for (const col of COLUMNS) {
          const td = document.createElement("td");
          if (col.cls) td.className = col.cls;
          if (col.type === "num") td.classList.add("num");

          const value = row[col.key];

          if (col.key === "rank") {
            td.textContent = value ? fmt(value) : "—";
          } else if (col.key === "score") {
            td.textContent = value == null ? "—" : String(value);
          } else if (col.tag) {
            const tag = document.createElement("span");
            tag.className = "tag quota";
            tag.textContent = value || "—";
            td.appendChild(tag);
          } else {
            td.textContent = value || "";
          }

          if ((col.key === "institute" || col.key === "course") && value) td.title = value;
          tr.appendChild(td);
        }
        frag.appendChild(tr);
      }
      body.appendChild(frag);
    }

    const from = total ? start + 1 : 0;
    const to = Math.min(start + slice.length, total);
    const countEl = $("#result-count");
    if (!total) {
      countEl.innerHTML = `No rows to show.`;
    } else {
      countEl.innerHTML = `Showing <strong>${fmt(from)}–${fmt(to)}</strong> of <strong>${fmt(total)}</strong> allotments` +
        (activeFilterCount() ? ` <span class="muted">(filtered from ${fmt(state.rows.length)})</span>` : "");
    }

    $("#page-info").innerHTML = `Page <strong>${fmt(state.page)}</strong> of <strong>${fmt(pages)}</strong>`;
    $("#prev-btn").disabled = state.page <= 1;
    $("#first-btn").disabled = state.page <= 1;
    $("#next-btn").disabled = state.page >= pages;
    $("#last-btn").disabled = state.page >= pages;
    const jump = $("#jump-input");
    jump.max = String(pages);
    jump.value = String(state.page);

    syncHeadSort();
    writeHash();
  }

  /* ---------- URL hash <-> filters ---------- */

  let hashTimer = null;
  function writeHash() {
    if (!state.ready) return;
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const params = new URLSearchParams();
      params.set("round", state.roundId);
      for (const [k, v] of Object.entries(filters)) if (v !== "") params.set(k, v);
      if (state.sortKey !== "rank" || state.sortDir !== "asc") {
        params.set("sort", state.sortKey);
        params.set("dir", state.sortDir);
      }
      if (state.page > 1) params.set("page", String(state.page));
      history.replaceState(null, "", `#${params.toString()}`);
    }, 220);
  }

  function readHash() {
    const raw = location.hash.replace(/^#/, "");
    if (!raw) return;
    const params = new URLSearchParams(raw);
    const roundId = params.get("round");
    if (roundId && ROUNDS.some((r) => r.id === roundId && r.available !== false)) state.roundId = roundId;

    for (const key of Object.keys(filters)) {
      if (key === "institute") continue;
      const v = params.get(key);
      if (v) filters[key] = v;
    }
    const inst = params.get("institute");
    if (inst) filters.institute = inst;
    if (params.get("sort")) state.sortKey = params.get("sort");
    if (params.get("dir") === "desc") state.sortDir = "desc";
    if (params.get("page")) state.page = Math.max(1, Number(params.get("page")) || 1);
  }

  /* ---------- Round switching ---------- */

  function renderRoundTabs() {
    const nav = $("#round-tabs");
    nav.innerHTML = "";
    for (const round of ROUNDS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "round-tab";
      btn.dataset.round = round.id;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(round.id === state.roundId));

      if (round.available === false) {
        btn.classList.add("is-soon");
        btn.disabled = true;
        btn.title = "Not published by MCC yet";
        btn.innerHTML = `<span>${esc(round.label)}</span><span class="tab-count">soon</span>`;
      } else {
        btn.innerHTML = `<span>${esc(round.label)}</span>` +
          (round.loaded && round.rows ? `<span class="tab-count">${fmt(round.rows.length)}</span>` : "");
        btn.addEventListener("click", () => selectRound(round.id));
      }
      nav.appendChild(btn);
    }
  }

  async function selectRound(id, { resetFilters: shouldReset = true } = {}) {
    const round = ROUNDS.find((r) => r.id === id);
    if (!round || round.available === false) return;
    if (id === state.roundId && state.ready) return;

    state.roundId = id;
    const tab = document.querySelector(`.round-tab[data-round="${id}"]`);
    if (tab) tab.classList.add("is-loading");

    try {
      const entry = await loadRound(round);
      if (state.roundId !== id) return;

      state.rows = entry.rows || [];
      state.sortKey = shouldReset ? "rank" : state.sortKey;
      state.sortDir = shouldReset ? "asc" : state.sortDir;
      state.page = shouldReset ? 1 : state.page;
      state.ready = true;

      if (shouldReset) {
        Object.keys(filters).forEach((k) => { filters[k] = ""; });
        Object.values(dropdowns).forEach((d) => d.reset());
        ac.input.value = "";
        ac.clearBtn.classList.remove("visible");
        document.querySelectorAll(".field-num input").forEach((i) => { i.value = ""; });
      }

      refreshOptions();
      refreshInstitutePool(state.rows);
      renderHeroChips();
      renderSources();
      applyFilters({ keepPage: !shouldReset });
      renderRoundTabs();
    } catch (err) {
      console.error(err);
      state.rows = [];
      state.filtered = [];
      state.ready = true;
      render();
      const body = $("#table-body");
      body.innerHTML = `<tr><td class="state-cell" colspan="${COLUMNS.length}">Could not load this round's data file.<br><span class="muted">${esc(err.message)}</span></td></tr>`;
    } finally {
      const t = document.querySelector(`.round-tab[data-round="${id}"]`);
      if (t) t.classList.remove("is-loading");
    }
  }

  /* ---------- Options / chips / sources ---------- */

  function uniques(key) {
    const set = new Set();
    for (const row of state.rows) set.add(row[key]);
    return Array.from(set).sort(collator.compare);
  }

  function refreshOptions() {
    for (const field of FILTER_FIELDS) {
      const values = uniques(field.key);
      if (dropdowns[field.key]) dropdowns[field.key].setValues(values);
    }
    syncFilterUI();
  }

  function syncFilterUI() {
    for (const field of FILTER_FIELDS) {
      const valueEl = document.querySelector(`#${field.host} .dd-value`);
      if (!valueEl) continue;
      const value = filters[field.key];
      valueEl.textContent = value || "All";
      valueEl.classList.toggle("is-all", !value);
    }
    if (ac.input) {
      ac.input.value = filters.institute || "";
      ac.clearBtn.classList.toggle("visible", !!filters.institute);
    }
    document.querySelectorAll(".field-num input").forEach((input) => {
      const key = input.id.replace(/^in-/, "");
      input.value = filters[key] || "";
    });
  }

  function currentRound() {
    return ROUNDS.find((r) => r.id === state.roundId);
  }

  function prettyDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function renderHeroChips() {
    const round = currentRound();
    const chips = [];
    const hasScores = state.rows.some((r) => r.score != null);

    chips.push(`<span class="chip is-live"><span class="dot"></span>${esc(round ? round.label : "")} · ${fmt(state.rows.length)} rows</span>`);
    if (round && round.released) chips.push(`<span class="chip">Released ${esc(prettyDate(round.released))}</span>`);
    chips.push(`<span class="chip">${hasScores ? "Rank → score mapped" : "Score pending"}</span>`);
    chips.push(`<span class="chip">${fmt(uniques("institute").length)} institutes</span>`);

    $("#hero-chips").innerHTML = chips.join("");
  }

  function renderSources() {
    const links = ROUNDS
      .filter((r) => r.sourceUrl)
      .map((r) => `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(r.label)}</a>`);

    $("#source-links").innerHTML = links.length
      ? `Official MCC PDF${links.length > 1 ? "s" : ""}: ${links.join(" · ")}`
      : `<span class="muted">Round PDF links will be listed here.</span>`;

    const round = currentRound();
    const meta = [];
    if (round && round.released) meta.push(`Released ${prettyDate(round.released)}`);
    if (state.rows.length) meta.push(`${fmt(state.rows.length)} allotment rows`);
    $("#source-meta").textContent = meta.join(" · ");

    const ss = MANIFEST.scoreSource;
    $("#score-source").innerHTML = ss && ss.url
      ? `<a href="${esc(ss.url)}" target="_blank" rel="noopener">${esc(ss.label || "NBE result PDF")}</a>`
      : `<span class="muted">Not available yet.</span>`;
  }

  /* ---------- CSV export ---------- */

  function exportCsv() {
    if (!state.filtered.length) return;
    const header = COLUMNS.map((c) => c.label);
    const lines = [header.join(",")];

    for (const row of state.filtered) {
      lines.push(COLUMNS.map((col) => {
        const raw = row[col.key];
        const value = raw == null ? "" : String(raw);
        return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
      }).join(","));
    }

    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const round = currentRound();
    a.href = url;
    a.download = `neet-pg-2026-${round ? round.id : "allotment"}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- Boot ---------- */

  function buildFilterUI() {
    for (const field of FILTER_FIELDS) {
      dropdowns[field.key] = createDropdown(field);
    }
    createNumberField("field-rank-min", "rankMin", "Min Rank");
    createNumberField("field-rank-max", "rankMax", "Max Rank");
    createNumberField("field-score-min", "scoreMin", "Min Score");
    createNumberField("field-score-max", "scoreMax", "Max Score");

    stateChangeHandler = () => {
      // A state selection narrows the institute pool; the filter itself is only
      // applied when the user presses "Apply filters".
      updateInstitutePlaceholder();
    };

    initAutocomplete();
  }

  async function boot() {
    initTheme();

    if (!ROUNDS.length) {
      $("#hero-chips").innerHTML = `<span class="chip is-live"><span class="dot"></span>Waiting for data</span>`;
      $("#round-tabs").innerHTML = `<span class="round-bar-label">No rounds added yet</span>`;
      $("#table-body").innerHTML = `<tr><td class="state-cell" colspan="${COLUMNS.length}">No rounds configured yet. Add a round in <code>data/manifest.js</code>.</td></tr>`;
      $("#result-count").textContent = "";
      return;
    }

    readHash();
    buildHead();
    buildFilterUI();
    renderRoundTabs();
    renderSources();

    // Wire up controls
    $("#apply-btn").addEventListener("click", applyFilters);
    $("#clear-btn").addEventListener("click", resetFilters);
    $("#export-btn").addEventListener("click", exportCsv);
    $("#theme-toggle").addEventListener("click", toggleTheme);

    $("#page-size").addEventListener("change", (e) => {
      state.pageSize = Number(e.target.value);
      state.page = 1;
      render();
    });
    $("#first-btn").addEventListener("click", () => { state.page = 1; render(); });
    $("#prev-btn").addEventListener("click", () => { state.page -= 1; render(); });
    $("#next-btn").addEventListener("click", () => { state.page += 1; render(); });
    $("#last-btn").addEventListener("click", () => {
      state.page = Math.ceil(state.filtered.length / state.pageSize);
      render();
    });
    $("#jump-input").addEventListener("change", (e) => {
      const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
      const target = Math.min(Math.max(1, Number(e.target.value) || 1), pages);
      state.page = target;
      render();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== ac.input) {
        e.preventDefault();
        ac.input.focus();
      }
    });

    // Apply hash filters for the selected round once its data is in.
    await selectRound(state.roundId, { resetFilters: false });

    if (Object.values(filters).some((v) => v !== "")) {
      // Re-apply filters that were read from the URL before data existed.
      syncFilterUI();
      applyFilters({ keepPage: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
