/* Firewall Siege — клиентский движок tower-defense.
   Оригинальная графика: узлы и пакеты рисуются примитивами (круги/квадраты).
   ВНИМАНИЕ: счёт считается на клиенте и отправляется на сервер как есть —
   это намеренная уязвимость V1 (сервер не проверяет). */

(() => {
  "use strict";

  const TILE = 40, COLS = 22, ROWS = 13;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // ---- путь пакетов (waypoints в координатах пикселей) ----
  const cell = (c, r) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
  const PATH = [
    cell(-1, 6), cell(4, 6), cell(4, 10), cell(9, 10),
    cell(9, 3), cell(15, 3), cell(15, 7), cell(21, 7),
  ];
  const CORE = PATH[PATH.length - 1];

  // отмечаем занятые путём ячейки (там строить нельзя)
  const blocked = new Set();
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i], b = PATH[i + 1];
    const steps = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) / TILE;
    for (let s = 0; s <= steps; s++) {
      const x = a.x + (b.x - a.x) * (s / steps);
      const y = a.y + (b.y - a.y) * (s / steps);
      blocked.add(`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`);
    }
  }

  // ---- типы башен ----
  const TOWERS = {
    filter:   { name: "Filter",     cost: 40, range: 92, dmg: 6, rate: 0.5, color: "#38bdf0", kind: "single" },
    scanner:  { name: "Scanner",     cost: 70, range: 82, dmg: 5, rate: 0.9, color: "#e6a03c", kind: "splash", splash: 38 },
    throttle: { name: "Throttle",  cost: 55, range: 86, dmg: 2, rate: 0.7, color: "#4bd1a0", kind: "slow", slow: 0.45, slowTime: 1.2 },
  };

  // ---- типы пакетов (враги) ----
  const ENEMIES = {
    basic: { hp: 20, speed: 58, reward: 8,  leak: 1, color: "#e0507e", r: 9 },
    fast:  { hp: 14, speed: 100, reward: 10, leak: 1, color: "#f08fb0", r: 7 },
    tank:  { hp: 78, speed: 34, reward: 18, leak: 3, color: "#b23a5e", r: 13 },
  };

  // ---- волны ----
  function buildWaves() {
    const w = [];
    for (let i = 1; i <= 10; i++) {
      const seq = [];
      const n = 6 + i * 2;
      for (let k = 0; k < n; k++) {
        let t = "basic";
        if (i >= 3 && k % 4 === 0) t = "fast";
        if (i >= 5 && k % 6 === 0) t = "tank";
        seq.push({ type: t, gap: Math.max(0.35, 0.9 - i * 0.05), hpMul: 1 + i * 0.28 });
      }
      w.push(seq);
    }
    return w;
  }
  const WAVES = buildWaves();

  // ---- состояние ----
  const state = {
    phase: "menu",       // menu | prep | running | over | won
    hp: 20, credits: 120, score: 0, wave: 0,
    towers: [], enemies: [], shots: [],
    selected: null,
    spawnQueue: [], spawnTimer: 0,
  };

  // ---- элементы UI ----
  const el = {
    hp: document.getElementById("hpVal"),
    cred: document.getElementById("credVal"),
    wave: document.getElementById("waveVal"),
    score: document.getElementById("scoreVal"),
    overlay: document.getElementById("overlay"),
    ovTitle: document.getElementById("ovTitle"),
    ovText: document.getElementById("ovText"),
    startBtn: document.getElementById("startBtn"),
    waveBtn: document.getElementById("waveBtn"),
    hint: document.getElementById("hint"),
    telemetry: document.getElementById("telemetry"),
    boardBody: document.getElementById("boardBody"),
  };

  function syncHud() {
    el.hp.textContent = state.hp;
    el.cred.textContent = state.credits;
    el.wave.textContent = `${state.wave} / 10`;
    el.score.textContent = state.score;
  }

  function telem(cls, text) {
    const row = document.createElement("div");
    row.className = "row";
    const time = new Date().toLocaleTimeString("ru-RU", { hour12: false });
    row.innerHTML = `<span>${time}</span><b class="${cls}">${text}</b>`;
    el.telemetry.prepend(row);
    while (el.telemetry.childElementCount > 40) el.telemetry.lastChild.remove();
  }

  // ---- размещение башен ----
  let hover = null;
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    hover = { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
  });
  canvas.addEventListener("mouseleave", () => (hover = null));

  canvas.addEventListener("click", (e) => {
    if (!state.selected) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    const key = `${c},${r}`;
    if (blocked.has(key)) { el.hint.textContent = "Traffic passes here — can't build."; return; }
    if (state.towers.some((t) => t.c === c && t.r === r)) { el.hint.textContent = "Cell is occupied."; return; }
    const spec = TOWERS[state.selected];
    if (state.credits < spec.cost) { el.hint.textContent = "Not enough credits."; return; }
    state.credits -= spec.cost;
    state.towers.push({ c, r, x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, type: state.selected, cd: 0, ...spec });
    blocked.add(key + ":tower");
    syncHud();
  });

  document.querySelectorAll(".tower-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const t = b.dataset.tower;
      state.selected = state.selected === t ? null : t;
      document.querySelectorAll(".tower-btn").forEach((x) => x.classList.remove("active"));
      if (state.selected) b.classList.add("active");
    });
  });

  // ---- запуск волны ----
  function startWave() {
    if (state.phase === "running") return;
    if (state.wave >= 10) return;
    state.wave++;
    const seq = WAVES[state.wave - 1];
    state.spawnQueue = seq.map((s) => ({ ...s }));
    state.spawnTimer = 0;
    state.phase = "running";
    el.waveBtn.disabled = true;
    telem("t-wave", `wave ${state.wave} started`);
    syncHud();
  }
  el.waveBtn.addEventListener("click", startWave);

  // ---- игровой цикл ----
  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (state.phase === "running") update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    // спавн
    if (state.spawnQueue.length) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const s = state.spawnQueue.shift();
        const base = ENEMIES[s.type];
        state.enemies.push({
          ...base, type: s.type,
          hp: Math.round(base.hp * s.hpMul), maxhp: Math.round(base.hp * s.hpMul),
          seg: 0, t: 0, x: PATH[0].x, y: PATH[0].y, slowT: 0,
        });
        state.spawnTimer = s.gap;
      }
    }

    // движение пакетов
    for (const en of state.enemies) {
      const sp = en.speed * (en.slowT > 0 ? 0.55 : 1);
      if (en.slowT > 0) en.slowT -= dt;
      let move = sp * dt;
      while (move > 0 && en.seg < PATH.length - 1) {
        const a = PATH[en.seg], b = PATH[en.seg + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const segLen = Math.hypot(dx, dy);
        const remain = segLen * (1 - en.t);
        if (move < remain) {
          en.t += move / segLen; move = 0;
        } else {
          move -= remain; en.seg++; en.t = 0;
        }
      }
      const a = PATH[en.seg], b = PATH[Math.min(en.seg + 1, PATH.length - 1)];
      en.x = a.x + (b.x - a.x) * en.t;
      en.y = a.y + (b.y - a.y) * en.t;
      if (en.seg >= PATH.length - 1) en.reached = true;
    }

    // пакеты, дошедшие до ядра
    const leaked = state.enemies.filter((e) => e.reached);
    for (const e of leaked) {
      state.hp -= e.leak;
      telem("t-leak", `packet breached the core (−${e.leak})`);
    }
    if (leaked.length) state.enemies = state.enemies.filter((e) => !e.reached);

    // стрельба башен
    for (const tw of state.towers) {
      tw.cd -= dt;
      if (tw.cd > 0) continue;
      const target = state.enemies.find((e) => Math.hypot(e.x - tw.x, e.y - tw.y) <= tw.range);
      if (!target) continue;
      tw.cd = tw.rate;
      state.shots.push({ x: tw.x, y: tw.y, tx: target.x, ty: target.y, color: tw.color, life: 0.12 });
      if (tw.kind === "splash") {
        for (const e of state.enemies)
          if (Math.hypot(e.x - target.x, e.y - target.y) <= tw.splash) e.hp -= tw.dmg;
      } else {
        target.hp -= tw.dmg;
        if (tw.kind === "slow") target.slowT = tw.slowTime;
      }
    }

    // уничтоженные пакеты
    const dead = state.enemies.filter((e) => e.hp <= 0);
    for (const e of dead) {
      state.credits += e.reward;
      state.score += e.reward;
      telem("t-hit", `packet neutralized (+${e.reward})`);
    }
    if (dead.length) { state.enemies = state.enemies.filter((e) => e.hp > 0); syncHud(); }

    // выстрелы живут недолго
    for (const s of state.shots) s.life -= dt;
    state.shots = state.shots.filter((s) => s.life > 0);

    // проигрыш
    if (state.hp <= 0) { state.hp = 0; endGame(false); return; }

    // конец волны
    if (state.phase === "running" && !state.spawnQueue.length && !state.enemies.length) {
      state.score += 120 + state.wave * 30;   // бонус за волну
      state.phase = "prep";
      el.waveBtn.disabled = false;
      syncHud();
      if (state.wave >= 10) endGame(true);
      else telem("t-wave", `wave ${state.wave} cleared`);
    }
  }

  // ---- отрисовка ----
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // сетка
    ctx.strokeStyle = "#16283826";
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * TILE, 0); ctx.lineTo(c * TILE, canvas.height); ctx.stroke(); }
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * TILE); ctx.lineTo(canvas.width, r * TILE); ctx.stroke(); }

    // путь
    ctx.strokeStyle = "#22415a";
    ctx.lineWidth = 22; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i].x, PATH[i].y);
    ctx.stroke();
    ctx.lineWidth = 2;

    // ядро
    ctx.fillStyle = "#4bd1a0";
    ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#4bd1a0"; ctx.globalAlpha = .35;
    ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    // hover-подсказка размещения
    if (hover && state.selected) {
      const key = `${hover.c},${hover.r}`;
      const ok = !blocked.has(key) && !state.towers.some((t) => t.c === hover.c && t.r === hover.r)
        && hover.c >= 0 && hover.c < COLS && hover.r >= 0 && hover.r < ROWS;
      ctx.fillStyle = ok ? "#38bdf033" : "#e0507e33";
      ctx.fillRect(hover.c * TILE, hover.r * TILE, TILE, TILE);
      if (ok) {
        const spec = TOWERS[state.selected];
        ctx.strokeStyle = spec.color + "66";
        ctx.beginPath(); ctx.arc(hover.c * TILE + TILE / 2, hover.r * TILE + TILE / 2, spec.range, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // башни
    for (const tw of state.towers) {
      ctx.fillStyle = tw.color;
      ctx.fillRect(tw.x - 11, tw.y - 11, 22, 22);
      ctx.fillStyle = "#06131d";
      ctx.fillRect(tw.x - 4, tw.y - 4, 8, 8);
    }

    // выстрелы
    for (const s of state.shots) {
      ctx.strokeStyle = s.color; ctx.globalAlpha = Math.max(0, s.life / 0.12);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.tx, s.ty); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // пакеты
    for (const en of state.enemies) {
      ctx.fillStyle = en.color;
      ctx.beginPath(); ctx.arc(en.x, en.y, en.r, 0, Math.PI * 2); ctx.fill();
      if (en.slowT > 0) { ctx.strokeStyle = "#4bd1a0"; ctx.beginPath(); ctx.arc(en.x, en.y, en.r + 3, 0, Math.PI * 2); ctx.stroke(); }
      // полоска hp
      const w = 22, p = en.hp / en.maxhp;
      ctx.fillStyle = "#0b1622"; ctx.fillRect(en.x - w / 2, en.y - en.r - 8, w, 4);
      ctx.fillStyle = p > .5 ? "#4bd1a0" : p > .25 ? "#e6a03c" : "#e0507e";
      ctx.fillRect(en.x - w / 2, en.y - en.r - 8, w * p, 4);
    }
  }

  // ---- конец игры → отправка счёта (V1) ----
  async function endGame(won) {
    state.phase = won ? "won" : "over";
    el.overlay.hidden = false;
    el.ovTitle.textContent = won ? "Core held" : "Core breached";
    el.ovText.textContent = won
      ? `All 10 waves cleared. Final score: ${state.score}.`
      : `Packets broke through on wave ${state.wave}. Score: ${state.score}.`;
    el.startBtn.textContent = "Restart";

    const username = (window.SIEGE && window.SIEGE.username) || "anon";
    try {
      await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ВНИМАНИЕ: счёт клиентский — сервер принимает без проверки (V1)
        body: JSON.stringify({ username, score: state.score, wave: state.wave }),
      });
    } catch (e) { /* лаба; молча */ }
    loadBoard();
  }

  // ---- рекорды ----
  async function loadBoard(sort = "score") {
    try {
      const order = sort === "username" ? "asc" : "desc";
      const res = await fetch(`/api/leaderboard?sort=${encodeURIComponent(sort)}&order=${order}`);
      const rows = await res.json();
      if (!Array.isArray(rows)) { el.boardBody.innerHTML = `<tr><td colspan="3" class="muted">no data</td></tr>`; return; }
      el.boardBody.innerHTML = rows.length
        ? rows.map((r) => `<tr><td>${escapeHtml(r.username)}</td><td>${r.score}</td><td>${r.wave}</td></tr>`).join("")
        : `<tr><td colspan="3" class="muted">empty</td></tr>`;
    } catch (e) {
      el.boardBody.innerHTML = `<tr><td colspan="3" class="muted">load error</td></tr>`;
    }
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  document.querySelectorAll(".chip").forEach((c) =>
    c.addEventListener("click", () => loadBoard(c.dataset.sort)));

  // ---- старт / рестарт ----
  function resetGame() {
    // снять tower-пометки из blocked
    for (const k of [...blocked]) if (k.endsWith(":tower")) blocked.delete(k);
    Object.assign(state, {
      phase: "prep", hp: 20, credits: 120, score: 0, wave: 0,
      towers: [], enemies: [], shots: [], selected: null, spawnQueue: [], spawnTimer: 0,
    });
    document.querySelectorAll(".tower-btn").forEach((x) => x.classList.remove("active"));
    el.overlay.hidden = true;
    el.waveBtn.disabled = false;
    el.hint.textContent = "Place nodes and hit “Send wave”.";
    syncHud();
  }
  el.startBtn.addEventListener("click", resetGame);

  // ---- инициализация ----
  syncHud();
  loadBoard();
  requestAnimationFrame(loop);

  // ---- аутентификация ----
  window.SIEGE = window.SIEGE || {};
  const authModal = document.getElementById("authModal");
  const authMsg = document.getElementById("authMsg");
  const who = document.getElementById("who");
  const whoName = document.getElementById("whoName");
  const authOpenBtn = document.getElementById("authOpenBtn");

  function setUser(username, token) {
    window.SIEGE.username = username;
    window.SIEGE.token = token;
    try { localStorage.setItem("siege_user", JSON.stringify({ username, token })); } catch (e) {}
    whoName.textContent = username;
    who.hidden = false;
    authOpenBtn.hidden = true;
    authModal.hidden = true;
  }

  async function auth(kind) {
    const username = document.getElementById("authUser").value.trim();
    const password = document.getElementById("authPass").value;
    if (!username || !password) { authMsg.textContent = "Enter name and password."; authMsg.className = "modal-msg"; return; }
    try {
      const res = await fetch(`/api/${kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { authMsg.textContent = data.error || "error"; authMsg.className = "modal-msg"; return; }
      authMsg.textContent = kind === "register" ? "Account created." : "Signed in.";
      authMsg.className = "modal-msg ok";
      setUser(data.username, data.token);
    } catch (e) { authMsg.textContent = "network unavailable"; authMsg.className = "modal-msg"; }
  }

  authOpenBtn.addEventListener("click", () => { authModal.hidden = false; });
  document.getElementById("authClose").addEventListener("click", () => { authModal.hidden = true; });
  document.getElementById("doLogin").addEventListener("click", () => auth("login"));
  document.getElementById("doRegister").addEventListener("click", () => auth("register"));

  // восстановить сессию
  try {
    const saved = JSON.parse(localStorage.getItem("siege_user") || "null");
    if (saved && saved.username) setUser(saved.username, saved.token);
  } catch (e) {}
})();
