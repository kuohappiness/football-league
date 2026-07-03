(function () {
  "use strict";

  const WORLD = { width: 1280, height: 720 };
  const FIELD = {
    x: 70,
    y: 70,
    width: 1140,
    height: 580,
    goalDepth: 34,
    goalWidth: 178,
    get midX() {
      return this.x + this.width / 2;
    },
    get midY() {
      return this.y + this.height / 2;
    },
    get goalTop() {
      return this.midY - this.goalWidth / 2;
    },
    get goalBottom() {
      return this.midY + this.goalWidth / 2;
    }
  };

  const MATCH_SECONDS = 180;
  const COUNTDOWN_SECONDS = 3.2;
  const PLAYER_RADIUS = 16;
  const BALL_RADIUS = 7;
  const BALL_PLAYER_RESTITUTION = 0.78;
  const KEEPER_BLOCK_RADIUS = 58;
  const KEEPER_BLOCK_COOLDOWN = 0.55;
  const MAX_CHARGE_SECONDS = 1.15;
  const GAME_KEYS = new Set([
    "w", "a", "s", "d", "r", "e", "q", "f",
    "i", "j", "k", "l", "p", "o", "u"
  ]);

  const TEAM_DEFS = [
    {
      name: "赤焰隊",
      color: "#ef476f",
      dark: "#7f1736",
      glow: "#ff9e64",
      attackDir: 1
    },
    {
      name: "湛藍隊",
      color: "#118ab2",
      dark: "#0b496b",
      glow: "#73d2de",
      attackDir: -1
    }
  ];

  const DIFFICULTIES = {
    easy: {
      label: "輕鬆",
      speed: 0.62,
      reaction: 0.55,
      shootPower: 0.72,
      tackleRange: 34,
      passChance: 0.22
    },
    normal: {
      label: "標準",
      speed: 0.72,
      reaction: 0.38,
      shootPower: 0.86,
      tackleRange: 39,
      passChance: 0.34
    },
    hard: {
      label: "強勁",
      speed: 0.84,
      reaction: 0.24,
      shootPower: 0.98,
      tackleRange: 43,
      passChance: 0.48
    }
  };

  const ROLE_LABELS = {
    goalkeeper: "守門員",
    defender: "後衛",
    midfielder: "中場",
    forward: "前鋒",
    field: "一般球員"
  };

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const menu = document.getElementById("menu");
  const panel = document.getElementById("menuPanel");
  const hud = document.getElementById("hud");
  const scoreText = document.getElementById("scoreText");
  const matchClock = document.getElementById("matchClock");
  const centerMessage = document.getElementById("centerMessage");
  const playerStatus = document.getElementById("playerStatus");
  document.getElementById("teamAName").textContent = TEAM_DEFS[0].name;
  document.getElementById("teamBName").textContent = TEAM_DEFS[1].name;

  const app = {
    settings: createDefaultSettings(),
    match: null,
    pressed: new Set(),
    lastFrame: performance.now()
  };

  function createDefaultSettings() {
    return {
      mode: "solo",
      playerCount: 1,
      difficulty: "normal",
      players: [
        { slot: 1, team: 0, roleChoice: "field", name: "玩家一" }
      ]
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distSq(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function distance(a, b) {
    return Math.sqrt(distSq(a, b));
  }

  function normalize(vec) {
    const length = Math.hypot(vec.x, vec.y);
    if (length < 0.0001) {
      return { x: 0, y: 0, length: 0 };
    }
    return { x: vec.x / length, y: vec.y / length, length };
  }

  function formatClock(seconds) {
    const safe = Math.max(0, Math.ceil(seconds));
    const mins = String(Math.floor(safe / 60)).padStart(2, "0");
    const secs = String(safe % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function teamGoalX(teamIndex) {
    return TEAM_DEFS[teamIndex].attackDir > 0
      ? FIELD.x + FIELD.width + FIELD.goalDepth
      : FIELD.x - FIELD.goalDepth;
  }

  function ownGoalX(teamIndex) {
    return TEAM_DEFS[teamIndex].attackDir > 0
      ? FIELD.x - FIELD.goalDepth
      : FIELD.x + FIELD.width + FIELD.goalDepth;
  }

  function isInputFocused(event) {
    const target = event.target;
    return target && target.tagName === "INPUT";
  }

  function renderHome() {
    menu.classList.remove("hidden");
    hud.classList.add("hidden");
    panel.innerHTML = `
      <h1 class="menu-title">足球大聯盟</h1>
      <p class="menu-subtitle">俯視角 4 對 4 街機足球，固定全場視角，每場 3 分鐘。</p>
      <div class="menu-grid">
        <button class="choice" data-action="mode" data-mode="solo">
          <strong>一人遊玩</strong>
          <span>玩家一對抗電腦隊伍。</span>
        </button>
        <button class="choice" data-action="mode" data-mode="duo">
          <strong>兩人遊玩</strong>
          <span>同隊合作或不同隊對戰。</span>
        </button>
      </div>
    `;
  }

  function renderTeamSelect() {
    const players = app.settings.players;
    const teamButtons = (slot) => TEAM_DEFS.map((team, index) => {
      const selected = players.find((player) => player.slot === slot).team === index;
      return `
        <button class="choice ${selected ? "selected" : ""}" data-action="set-team" data-slot="${slot}" data-team="${index}">
          <span class="team-swatch" style="background: linear-gradient(90deg, ${team.color}, ${team.glow});"></span>
          <strong>${team.name}</strong>
          <span>${index === 0 ? "左側開局，向右進攻。" : "右側開局，向左進攻。"}</span>
        </button>
      `;
    }).join("");

    if (app.settings.mode === "solo") {
      panel.innerHTML = `
        <h1 class="menu-title">選擇隊伍</h1>
        <p class="menu-subtitle">足球是白點，球員會使用隊伍顏色。</p>
        <div class="menu-grid">${teamButtons(1)}</div>
        <div class="actions">
          <button class="secondary" data-action="home">返回</button>
          <button class="primary" data-action="difficulty">下一步</button>
        </div>
      `;
      return;
    }

    panel.innerHTML = `
      <h1 class="menu-title">選擇隊伍</h1>
      <p class="menu-subtitle">兩位玩家可以同隊合作，也可以分屬兩隊。</p>
      <div class="form-list">
        <div>
          <strong>玩家一</strong>
          <div class="menu-grid">${teamButtons(1)}</div>
        </div>
        <div>
          <strong>玩家二</strong>
          <div class="menu-grid">${teamButtons(2)}</div>
        </div>
      </div>
      <div class="actions">
        <button class="secondary" data-action="home">返回</button>
        <button class="primary" data-action="difficulty">下一步</button>
      </div>
    `;
  }

  function renderDifficulty() {
    panel.innerHTML = `
      <h1 class="menu-title">電腦強度</h1>
      <p class="menu-subtitle">強度會影響 AI 反應、跑位、射門與搶球侵略性。</p>
      <div class="menu-grid three">
        ${Object.entries(DIFFICULTIES).map(([key, value]) => `
          <button class="choice ${app.settings.difficulty === key ? "selected" : ""}" data-action="set-difficulty" data-difficulty="${key}">
            <strong>${value.label}</strong>
            <span>${key === "easy" ? "適合先熟悉節奏。" : key === "normal" ? "平衡的第一版手感。" : "壓迫更快，射門更果斷。"}</span>
          </button>
        `).join("")}
      </div>
      <div class="actions">
        <button class="secondary" data-action="teams">返回</button>
        <button class="primary" data-action="roles">下一步</button>
      </div>
    `;
  }

  function renderRoles() {
    const rows = app.settings.players.map((player) => `
      <div>
        <strong>玩家${player.slot}</strong>
        <div class="menu-grid">
          <button class="choice ${player.roleChoice === "goalkeeper" ? "selected" : ""}" data-action="set-role" data-slot="${player.slot}" data-role="goalkeeper">
            <strong>守門員</strong>
            <span>守門範圍較大，開球更穩。</span>
          </button>
          <button class="choice ${player.roleChoice === "field" ? "selected" : ""}" data-action="set-role" data-slot="${player.slot}" data-role="field">
            <strong>一般球員</strong>
            <span>速度較快，進攻選擇更多。</span>
          </button>
        </div>
      </div>
    `).join("");

    panel.innerHTML = `
      <h1 class="menu-title">選擇職位</h1>
      <p class="menu-subtitle">同隊時若兩人都選守門員，第二位會自動改控一般球員。</p>
      <div class="form-list">${rows}</div>
      <div class="actions">
        <button class="secondary" data-action="difficulty">返回</button>
        <button class="primary" data-action="names">下一步</button>
      </div>
    `;
  }

  function renderNames() {
    const fields = app.settings.players.map((player) => `
      <div class="form-row">
        <label for="name-${player.slot}">玩家${player.slot}</label>
        <input class="text-input" id="name-${player.slot}" maxlength="10" value="${escapeHtml(player.name)}">
      </div>
    `).join("");

    panel.innerHTML = `
      <h1 class="menu-title">輸入姓名</h1>
      <p class="menu-subtitle">姓名會顯示在你目前控制的球員上方。</p>
      <div class="form-list">${fields}</div>
      <div class="actions">
        <button class="secondary" data-action="roles">返回</button>
        <button class="primary" data-action="start">開始比賽</button>
      </div>
    `;
  }

  function renderResult() {
    const match = app.match;
    const result = match.score[0] === match.score[1]
      ? "平手"
      : `${TEAM_DEFS[match.score[0] > match.score[1] ? 0 : 1].name} 勝利`;
    menu.classList.remove("hidden");
    panel.innerHTML = `
      <h1 class="menu-title">${result}</h1>
      <div class="result-score">${match.score[0]} : ${match.score[1]}</div>
      <p class="menu-subtitle">比賽結束。</p>
      <div class="actions">
        <button class="secondary" data-action="home">主選單</button>
        <button class="primary" data-action="rematch">再踢一場</button>
      </div>
    `;
  }

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    if (action === "home") {
      app.settings = createDefaultSettings();
      renderHome();
      return;
    }

    if (action === "mode") {
      const mode = button.dataset.mode;
      app.settings.mode = mode;
      app.settings.playerCount = mode === "solo" ? 1 : 2;
      app.settings.players = mode === "solo"
        ? [{ slot: 1, team: 0, roleChoice: "field", name: "玩家一" }]
        : [
          { slot: 1, team: 0, roleChoice: "field", name: "玩家一" },
          { slot: 2, team: 1, roleChoice: "field", name: "玩家二" }
        ];
      renderTeamSelect();
      return;
    }

    if (action === "teams") {
      renderTeamSelect();
      return;
    }

    if (action === "set-team") {
      const slot = Number(button.dataset.slot);
      const team = Number(button.dataset.team);
      const player = app.settings.players.find((item) => item.slot === slot);
      if (player) {
        player.team = team;
      }
      renderTeamSelect();
      return;
    }

    if (action === "difficulty") {
      renderDifficulty();
      return;
    }

    if (action === "set-difficulty") {
      app.settings.difficulty = button.dataset.difficulty;
      renderDifficulty();
      return;
    }

    if (action === "roles") {
      renderRoles();
      return;
    }

    if (action === "set-role") {
      const slot = Number(button.dataset.slot);
      const player = app.settings.players.find((item) => item.slot === slot);
      if (player) {
        player.roleChoice = button.dataset.role;
      }
      renderRoles();
      return;
    }

    if (action === "names") {
      renderNames();
      return;
    }

    if (action === "start") {
      app.settings.players.forEach((player) => {
        const input = document.getElementById(`name-${player.slot}`);
        const value = input ? input.value.trim() : "";
        player.name = value || `玩家${player.slot}`;
      });
      startMatch();
      return;
    }

    if (action === "rematch") {
      startMatch();
    }
  });

  function createPlayer(team, index, role, x, y) {
    return {
      id: `T${team}P${index}`,
      team,
      index,
      role,
      x,
      y,
      homeX: x,
      homeY: y,
      vx: 0,
      vy: 0,
      speed: role === "goalkeeper" ? 192 : 238,
      lastDir: { x: TEAM_DEFS[team].attackDir, y: 0 },
      controlledBy: null,
      aiActionAt: 0,
      tackleReadyAt: 0,
      blockReadyAt: 0,
      noPickupUntil: 0
    };
  }

  function createPlayers() {
    const left = [
      { role: "goalkeeper", x: FIELD.x + 58, y: FIELD.midY },
      { role: "defender", x: FIELD.x + 230, y: FIELD.midY },
      { role: "midfielder", x: FIELD.x + 395, y: FIELD.midY - 115 },
      { role: "forward", x: FIELD.x + 465, y: FIELD.midY + 120 }
    ];

    const players = [];
    left.forEach((slot, index) => {
      players.push(createPlayer(0, index, slot.role, slot.x, slot.y));
    });

    left.forEach((slot, index) => {
      const mirrorX = FIELD.x + FIELD.width - (slot.x - FIELD.x);
      const mirrorY = FIELD.y + FIELD.height - (slot.y - FIELD.y);
      players.push(createPlayer(1, index, slot.role, mirrorX, mirrorY));
    });

    return players;
  }

  function createController(config) {
    const isSecond = config.slot === 2;
    return {
      slot: config.slot,
      team: config.team,
      playerId: null,
      name: config.name,
      keys: isSecond
        ? { up: "i", left: "j", down: "k", right: "l", shoot: "p", pass: "o", tackle: "u", switch: "" }
        : { up: "w", left: "a", down: "s", right: "d", shoot: "r", pass: "e", tackle: "q", switch: "f" },
      aimDir: { x: TEAM_DEFS[config.team].attackDir, y: 0 },
      charging: false,
      chargeStartedAt: 0,
      charge: 0
    };
  }

  function assignControllers(players, controllers) {
    const taken = new Set();
    controllers.forEach((controller) => {
      const config = app.settings.players.find((player) => player.slot === controller.slot);
      const teamPlayers = players.filter((player) => player.team === controller.team);
      let pick = null;

      if (config.roleChoice === "goalkeeper") {
        pick = teamPlayers.find((player) => player.role === "goalkeeper" && !taken.has(player.id));
      }

      if (!pick) {
        const preferred = ["forward", "midfielder", "defender", "goalkeeper"];
        for (const role of preferred) {
          pick = teamPlayers.find((player) => player.role === role && !taken.has(player.id));
          if (pick) {
            break;
          }
        }
      }

      if (pick) {
        pick.controlledBy = controller.slot;
        controller.playerId = pick.id;
        taken.add(pick.id);
      }
    });
  }

  function startMatch() {
    app.pressed.clear();
    const players = createPlayers();
    const controllers = app.settings.players.map(createController);
    assignControllers(players, controllers);

    app.match = {
      phase: "countdown",
      countdown: COUNTDOWN_SECONDS,
      timeLeft: MATCH_SECONDS,
      score: [0, 0],
      players,
      controllers,
      ball: {
        x: FIELD.midX,
        y: FIELD.midY,
        vx: 0,
        vy: 0,
        carrierId: null,
        lastTouchTeam: null,
        looseUntil: 0
      },
      effects: [],
      now: 0,
      message: "",
      messageTimer: 0,
      kickoffTeam: 0,
      grassOffset: Math.random() * 1000
    };

    resetPositions();
    menu.classList.add("hidden");
    hud.classList.remove("hidden");
    updateHud();
  }

  function resetPositions() {
    const match = app.match;
    if (!match) {
      return;
    }

    match.players.forEach((player) => {
      player.x = player.homeX;
      player.y = player.homeY;
      player.vx = 0;
      player.vy = 0;
      player.lastDir = { x: TEAM_DEFS[player.team].attackDir, y: 0 };
      player.aiActionAt = match.now + 0.4 + Math.random() * 0.35;
      player.tackleReadyAt = match.now + 0.3;
      player.blockReadyAt = match.now + 0.15;
      player.noPickupUntil = match.now + 0.25;
    });

    match.ball.x = FIELD.midX;
    match.ball.y = FIELD.midY;
    match.ball.vx = 0;
    match.ball.vy = 0;
    match.ball.carrierId = null;
    match.ball.lastTouchTeam = null;
    match.ball.looseUntil = match.now + 0.5;
    match.controllers.forEach((controller) => {
      controller.charging = false;
      controller.charge = 0;
      const player = getPlayer(controller.playerId);
      if (player) {
        controller.aimDir = { ...player.lastDir };
      }
    });
  }

  function getPlayer(id) {
    const match = app.match;
    return match ? match.players.find((player) => player.id === id) : null;
  }

  function getCarrier() {
    const match = app.match;
    return match && match.ball.carrierId ? getPlayer(match.ball.carrierId) : null;
  }

  function controllerForPlayer(player) {
    const match = app.match;
    if (!match || !player || player.controlledBy == null) {
      return null;
    }
    return match.controllers.find((controller) => controller.slot === player.controlledBy) || null;
  }

  function otherTeam(team) {
    return team === 0 ? 1 : 0;
  }

  function update(dt) {
    const match = app.match;
    if (!match) {
      return;
    }

    match.now += dt;
    updateEffects(dt);

    if (match.messageTimer > 0) {
      match.messageTimer = Math.max(0, match.messageTimer - dt);
    }

    if (match.phase === "countdown") {
      match.countdown -= dt;
      if (match.countdown <= 0) {
        match.phase = "playing";
      }
      updateHud();
      updateCenterMessage();
      return;
    }

    if (match.phase === "goal") {
      match.countdown -= dt;
      if (match.countdown <= 0) {
        resetPositions();
        match.countdown = 1.6;
        match.phase = "countdown";
      }
      updateHud();
      updateCenterMessage();
      return;
    }

    if (match.phase === "finished") {
      updateCenterMessage();
      return;
    }

    match.timeLeft -= dt;
    if (match.timeLeft <= 0) {
      match.timeLeft = 0;
      match.phase = "finished";
      updateHud();
      updateCenterMessage();
      renderResult();
      return;
    }

    clearPlayerVelocities();
    updateHumanControllers(dt);
    updateAI(dt);
    resolvePlayerCollisions();
    updateBall(dt);
    updateHud();
    updateCenterMessage();
  }

  function clearPlayerVelocities() {
    const match = app.match;
    match.players.forEach((player) => {
      player.vx = 0;
      player.vy = 0;
    });
  }

  function updateHumanControllers(dt) {
    const match = app.match;
    match.controllers.forEach((controller) => {
      const player = getPlayer(controller.playerId);
      if (!player) {
        return;
      }

      const x = Number(app.pressed.has(controller.keys.right)) - Number(app.pressed.has(controller.keys.left));
      const y = Number(app.pressed.has(controller.keys.down)) - Number(app.pressed.has(controller.keys.up));
      const dir = normalize({ x, y });

      if (dir.length > 0) {
        controller.aimDir = { x: dir.x, y: dir.y };
        movePlayer(player, dir, dt, controller.charging ? 0.72 : 1);
      }

      if (controller.charging) {
        controller.charge = clamp((match.now - controller.chargeStartedAt) / MAX_CHARGE_SECONDS, 0, 1);
      }
    });
  }

  function updateAI(dt) {
    const match = app.match;
    const carrier = getCarrier();
    const difficulty = DIFFICULTIES[app.settings.difficulty] || DIFFICULTIES.normal;

    match.players.forEach((player) => {
      if (player.controlledBy != null) {
        return;
      }

      const target = getAITarget(player, carrier);
      const dir = normalize({ x: target.x - player.x, y: target.y - player.y });
      const speedFactor = difficulty.speed * (player.role === "goalkeeper" ? 0.9 : 1);
      movePlayer(player, dir, dt, speedFactor);

      if (player.role === "goalkeeper") {
        maybeGoalkeeperAutoBlock(player, difficulty);
      }

      if (match.now < player.aiActionAt) {
        return;
      }

      player.aiActionAt = match.now + difficulty.reaction + Math.random() * 0.18;

      if (carrier && carrier.id === player.id) {
        maybeAIUseBall(player, difficulty);
        return;
      }

      if (carrier && carrier.team !== player.team) {
        const range = difficulty.tackleRange + (player.role === "defender" ? 6 : 0);
        if (distance(player, carrier) < range) {
          tryTackle(player, true);
        }
      }
    });
  }

  function getAITarget(player, carrier) {
    const match = app.match;
    const ball = match.ball;
    const dir = TEAM_DEFS[player.team].attackDir;
    const home = { x: player.homeX, y: player.homeY };
    const goalCenter = { x: teamGoalX(player.team), y: FIELD.midY };

    if (player.role === "goalkeeper") {
      const goalLine = dir > 0 ? FIELD.x + 52 : FIELD.x + FIELD.width - 52;
      return {
        x: goalLine,
        y: clamp(ball.y, FIELD.goalTop + 12, FIELD.goalBottom - 12)
      };
    }

    if (carrier && carrier.id === player.id) {
      return {
        x: goalCenter.x - dir * 28,
        y: clamp(FIELD.midY + (player.y - FIELD.midY) * 0.18, FIELD.y + 90, FIELD.y + FIELD.height - 90)
      };
    }

    if (!carrier) {
      const nearest = nearestTeamPlayer(player.team, ball, false);
      if (nearest && nearest.id === player.id) {
        return { x: ball.x, y: ball.y };
      }
      return formationTarget(player, "loose");
    }

    if (carrier.team === player.team) {
      return formationTarget(player, "attack");
    }

    const nearestDefender = nearestTeamPlayer(player.team, carrier, false);
    if (nearestDefender && nearestDefender.id === player.id) {
      return {
        x: carrier.x - dir * 12,
        y: carrier.y
      };
    }

    return formationTarget(player, "defend");
  }

  function formationTarget(player, mode) {
    const match = app.match;
    const ball = match.ball;
    const dir = TEAM_DEFS[player.team].attackDir;
    let x = player.homeX;
    let y = player.homeY;

    if (mode === "attack") {
      x += dir * (player.role === "forward" ? 155 : player.role === "midfielder" ? 115 : 70);
      y += (ball.y - FIELD.midY) * (player.role === "forward" ? 0.2 : 0.14);
    }

    if (mode === "defend") {
      x -= dir * (player.role === "defender" ? 90 : 56);
      y += (ball.y - FIELD.midY) * 0.26;
    }

    if (mode === "loose") {
      x += dir * 36;
      y += (ball.y - FIELD.midY) * 0.16;
    }

    return {
      x: clamp(x, FIELD.x + PLAYER_RADIUS, FIELD.x + FIELD.width - PLAYER_RADIUS),
      y: clamp(y, FIELD.y + PLAYER_RADIUS, FIELD.y + FIELD.height - PLAYER_RADIUS)
    };
  }

  function maybeAIUseBall(player, difficulty) {
    const match = app.match;
    const dir = TEAM_DEFS[player.team].attackDir;
    const goalX = teamGoalX(player.team);
    const distanceToGoal = Math.abs(goalX - player.x);
    const goalAngle = Math.abs(player.y - FIELD.midY);
    const nearbyOpponent = nearestOpponent(player);

    if (distanceToGoal < 280 && goalAngle < 160) {
      shootBall(player, difficulty.shootPower, {
        x: dir,
        y: clamp((FIELD.midY - player.y) / 260, -0.42, 0.42)
      });
      return;
    }

    if (
      nearbyOpponent &&
      distance(player, nearbyOpponent) < 62 &&
      Math.random() < difficulty.passChance
    ) {
      performPass(player);
    }
  }

  function maybeGoalkeeperAutoBlock(player, difficulty) {
    const match = app.match;
    const ball = match.ball;
    const carrier = getCarrier();
    const triggerRange = KEEPER_BLOCK_RADIUS + difficulty.tackleRange * 0.18;

    if (carrier && carrier.team !== player.team && distance(player, carrier) <= triggerRange) {
      tryGoalkeeperBlock(player, true);
      return;
    }

    if (carrier) {
      return;
    }

    const dir = TEAM_DEFS[player.team].attackDir;
    const movingTowardOwnGoal = dir > 0 ? ball.vx < -45 : ball.vx > 45;
    if (distance(player, ball) <= triggerRange && (movingTowardOwnGoal || Math.hypot(ball.vx, ball.vy) > 280)) {
      tryGoalkeeperBlock(player, true);
    }
  }

  function nearestTeamPlayer(team, point, includeHumans) {
    const match = app.match;
    let best = null;
    let bestDist = Infinity;
    match.players.forEach((player) => {
      if (player.team !== team) {
        return;
      }
      if (!includeHumans && player.controlledBy != null) {
        return;
      }
      const value = distSq(player, point);
      if (value < bestDist) {
        best = player;
        bestDist = value;
      }
    });
    return best;
  }

  function nearestOpponent(player) {
    const match = app.match;
    let best = null;
    let bestDist = Infinity;
    match.players.forEach((candidate) => {
      if (candidate.team === player.team) {
        return;
      }
      const value = distSq(player, candidate);
      if (value < bestDist) {
        best = candidate;
        bestDist = value;
      }
    });
    return best;
  }

  function movePlayer(player, dir, dt, speedFactor) {
    if (!dir || dir.length === 0) {
      return;
    }

    const normal = normalize(dir);
    if (normal.length === 0) {
      return;
    }

    player.lastDir = { x: normal.x, y: normal.y };
    player.vx = normal.x * player.speed * speedFactor;
    player.vy = normal.y * player.speed * speedFactor;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    clampPlayer(player);
  }

  function clampPlayer(player) {
    player.x = clamp(player.x, FIELD.x + PLAYER_RADIUS, FIELD.x + FIELD.width - PLAYER_RADIUS);
    player.y = clamp(player.y, FIELD.y + PLAYER_RADIUS, FIELD.y + FIELD.height - PLAYER_RADIUS);
  }

  function resolvePlayerCollisions() {
    const match = app.match;
    for (let pass = 0; pass < 3; pass += 1) {
      for (let i = 0; i < match.players.length; i += 1) {
        for (let j = i + 1; j < match.players.length; j += 1) {
          const a = match.players[i];
          const b = match.players[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const length = Math.hypot(dx, dy) || 1;
          const minDistance = PLAYER_RADIUS * 2 + 1;
          if (length >= minDistance) {
            continue;
          }

          const overlap = (minDistance - length) * 0.5;
          const nx = dx / length;
          const ny = dy / length;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          clampPlayer(a);
          clampPlayer(b);
        }
      }
    }
  }

  function updateBall(dt) {
    const match = app.match;
    const ball = match.ball;
    const carrier = getCarrier();

    if (carrier) {
      const dir = normalize(carrier.lastDir).length > 0
        ? normalize(carrier.lastDir)
        : { x: TEAM_DEFS[carrier.team].attackDir, y: 0 };
      ball.x = carrier.x + dir.x * (PLAYER_RADIUS + BALL_RADIUS + 3);
      ball.y = carrier.y + dir.y * (PLAYER_RADIUS + BALL_RADIUS + 3);
      ball.vx = 0;
      ball.vy = 0;
      ball.lastTouchTeam = carrier.team;
      return;
    }

    const prevX = ball.x;
    const prevY = ball.y;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    const friction = Math.pow(0.24, dt);
    ball.vx *= friction;
    ball.vy *= friction;

    if (Math.hypot(ball.vx, ball.vy) < 6) {
      ball.vx = 0;
      ball.vy = 0;
    }

    resolveBallPlayerCollisions(prevX, prevY);
    handleBallBounds();
    checkGoal();
    tryAutoPickup();
  }

  function resolveBallPlayerCollisions(prevX, prevY) {
    const match = app.match;
    const ball = match.ball;
    const segmentX = ball.x - prevX;
    const segmentY = ball.y - prevY;
    const segmentLengthSq = segmentX * segmentX + segmentY * segmentY;
    const minDistance = PLAYER_RADIUS + BALL_RADIUS;

    match.players.forEach((player) => {
      const t = segmentLengthSq > 0
        ? clamp(((player.x - prevX) * segmentX + (player.y - prevY) * segmentY) / segmentLengthSq, 0, 1)
        : 1;
      const closestX = prevX + segmentX * t;
      const closestY = prevY + segmentY * t;
      let normal = normalize({ x: closestX - player.x, y: closestY - player.y });

      if (normal.length === 0) {
        normal = normalize({ x: prevX - player.x, y: prevY - player.y });
      }
      if (normal.length === 0) {
        normal = normalize({ x: ball.vx || player.lastDir.x, y: ball.vy || player.lastDir.y });
      }
      if (normal.length === 0) {
        normal = { x: TEAM_DEFS[player.team].attackDir, y: 0, length: 1 };
      }

      const dx = closestX - player.x;
      const dy = closestY - player.y;
      if (dx * dx + dy * dy > minDistance * minDistance) {
        return;
      }

      ball.x = player.x + normal.x * (minDistance + 0.6);
      ball.y = player.y + normal.y * (minDistance + 0.6);
      bounceBallFromPlayer(player, normal, player.role === "goalkeeper" ? 0.86 : BALL_PLAYER_RESTITUTION, 0);

      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > 150) {
        player.noPickupUntil = match.now + 0.22;
      }
      addBurst(ball.x, ball.y, player.role === "goalkeeper" ? TEAM_DEFS[player.team].glow : "#d9fff0", 5, 95);
    });
  }

  function bounceBallFromPlayer(player, normal, restitution, minExitSpeed) {
    const match = app.match;
    const ball = match.ball;
    const relVx = ball.vx - player.vx * 0.5;
    const relVy = ball.vy - player.vy * 0.5;
    const incoming = relVx * normal.x + relVy * normal.y;

    if (incoming < 0) {
      const reflectedX = relVx - (1 + restitution) * incoming * normal.x;
      const reflectedY = relVy - (1 + restitution) * incoming * normal.y;
      ball.vx = reflectedX + player.vx * 0.35;
      ball.vy = reflectedY + player.vy * 0.35;
    }

    const speed = Math.hypot(ball.vx, ball.vy);
    if (minExitSpeed > 0 && speed < minExitSpeed) {
      ball.vx = normal.x * minExitSpeed + player.vx * 0.25;
      ball.vy = normal.y * minExitSpeed + player.vy * 0.25;
    }
  }

  function handleBallBounds() {
    const match = app.match;
    const ball = match.ball;
    const inGoalMouth = ball.y > FIELD.goalTop && ball.y < FIELD.goalBottom;
    const leftLine = FIELD.x + BALL_RADIUS;
    const rightLine = FIELD.x + FIELD.width - BALL_RADIUS;
    const topLine = FIELD.y + BALL_RADIUS;
    const bottomLine = FIELD.y + FIELD.height - BALL_RADIUS;

    if (ball.y < topLine) {
      ball.y = topLine;
      ball.vy = Math.abs(ball.vy) * 0.72;
      addBurst(ball.x, ball.y, "#d9fff0", 4, 75);
    }

    if (ball.y > bottomLine) {
      ball.y = bottomLine;
      ball.vy = -Math.abs(ball.vy) * 0.72;
      addBurst(ball.x, ball.y, "#d9fff0", 4, 75);
    }

    if (!inGoalMouth && ball.x < leftLine) {
      ball.x = leftLine;
      ball.vx = Math.abs(ball.vx) * 0.72;
      addBurst(ball.x, ball.y, "#d9fff0", 4, 75);
    }

    if (!inGoalMouth && ball.x > rightLine) {
      ball.x = rightLine;
      ball.vx = -Math.abs(ball.vx) * 0.72;
      addBurst(ball.x, ball.y, "#d9fff0", 4, 75);
    }
  }

  function checkGoal() {
    const match = app.match;
    const ball = match.ball;
    const inGoalMouth = ball.y > FIELD.goalTop && ball.y < FIELD.goalBottom;
    if (!inGoalMouth) {
      return;
    }

    if (ball.x > FIELD.x + FIELD.width + FIELD.goalDepth - BALL_RADIUS) {
      scoreGoal(0);
      return;
    }

    if (ball.x < FIELD.x - FIELD.goalDepth + BALL_RADIUS) {
      scoreGoal(1);
    }
  }

  function scoreGoal(teamIndex) {
    const match = app.match;
    match.score[teamIndex] += 1;
    match.phase = "goal";
    match.countdown = 1.65;
    match.message = `${TEAM_DEFS[teamIndex].name} 進球`;
    match.messageTimer = 1.6;
    match.ball.vx = 0;
    match.ball.vy = 0;
    match.ball.carrierId = null;
    addBurst(match.ball.x, match.ball.y, TEAM_DEFS[teamIndex].glow, 34, 240);
  }

  function tryAutoPickup() {
    const match = app.match;
    const ball = match.ball;
    if (match.now < ball.looseUntil) {
      return;
    }

    const speed = Math.hypot(ball.vx, ball.vy);
    let best = null;
    let bestDist = Infinity;
    match.players.forEach((player) => {
      if (match.now < player.noPickupUntil) {
        return;
      }
      const pickupRange = PLAYER_RADIUS + BALL_RADIUS + (speed < 220 ? 12 : 5);
      const value = distSq(player, ball);
      if (value < pickupRange * pickupRange && value < bestDist) {
        best = player;
        bestDist = value;
      }
    });

    if (best && speed < 720) {
      attachBall(best);
    }
  }

  function attachBall(player) {
    const match = app.match;
    match.ball.carrierId = player.id;
    match.ball.vx = 0;
    match.ball.vy = 0;
    match.ball.lastTouchTeam = player.team;
  }

  function releaseBall(player, velocity, looseTime) {
    const match = app.match;
    const dir = normalize(player.lastDir);
    match.ball.x = player.x + dir.x * (PLAYER_RADIUS + BALL_RADIUS + 6);
    match.ball.y = player.y + dir.y * (PLAYER_RADIUS + BALL_RADIUS + 6);
    match.ball.vx = velocity.x;
    match.ball.vy = velocity.y;
    match.ball.carrierId = null;
    match.ball.lastTouchTeam = player.team;
    match.ball.looseUntil = match.now + looseTime;
    player.noPickupUntil = match.now + looseTime + 0.08;
  }

  function handleShootButtonDown(controller) {
    const match = app.match;
    const player = getPlayer(controller.playerId);
    if (!player) {
      return;
    }

    if (player.role === "goalkeeper") {
      tryGoalkeeperBlock(player, false);
      return;
    }

    startShotCharge(controller);
  }

  function startShotCharge(controller) {
    const match = app.match;
    const player = getPlayer(controller.playerId);
    if (!player || player.role === "goalkeeper" || match.ball.carrierId !== player.id) {
      return;
    }

    controller.charging = true;
    controller.chargeStartedAt = match.now;
    controller.charge = 0;
  }

  function tryGoalkeeperBlock(player, fromAI) {
    const match = app.match;
    if (!player || player.role !== "goalkeeper" || match.now < player.blockReadyAt) {
      return false;
    }

    player.blockReadyAt = match.now + (fromAI ? KEEPER_BLOCK_COOLDOWN * 1.15 : KEEPER_BLOCK_COOLDOWN);
    const ball = match.ball;
    const carrier = getCarrier();
    let didBlock = false;

    if (carrier && carrier.id !== player.id && carrier.team !== player.team && distance(player, carrier) <= KEEPER_BLOCK_RADIUS) {
      let normal = normalize({ x: carrier.x - player.x, y: carrier.y - player.y });
      if (normal.length === 0) {
        normal = normalize(player.lastDir);
      }
      if (normal.length === 0) {
        normal = { x: TEAM_DEFS[player.team].attackDir, y: 0, length: 1 };
      }

      const exitSpeed = 280 + Math.hypot(carrier.vx, carrier.vy) * 0.42 + Math.hypot(player.vx, player.vy) * 0.35;
      ball.carrierId = null;
      ball.x = player.x + normal.x * (PLAYER_RADIUS + BALL_RADIUS + 6);
      ball.y = player.y + normal.y * (PLAYER_RADIUS + BALL_RADIUS + 6);
      ball.vx = normal.x * exitSpeed + player.vx * 0.25;
      ball.vy = normal.y * exitSpeed + player.vy * 0.25;
      ball.lastTouchTeam = player.team;
      ball.looseUntil = match.now + 0.24;
      carrier.noPickupUntil = match.now + 0.58;
      didBlock = true;
    } else if (!carrier && distance(player, ball) <= KEEPER_BLOCK_RADIUS) {
      let normal = normalize({ x: ball.x - player.x, y: ball.y - player.y });
      if (normal.length === 0) {
        normal = normalize(player.lastDir);
      }
      if (normal.length === 0) {
        normal = { x: TEAM_DEFS[player.team].attackDir, y: 0, length: 1 };
      }

      ball.x = player.x + normal.x * (PLAYER_RADIUS + BALL_RADIUS + 8);
      ball.y = player.y + normal.y * (PLAYER_RADIUS + BALL_RADIUS + 8);
      bounceBallFromPlayer(player, normal, 0.94, 260);
      ball.lastTouchTeam = player.team;
      ball.looseUntil = match.now + 0.22;
      didBlock = true;
    }

    player.noPickupUntil = match.now + 0.24;
    addBurst(player.x, player.y, didBlock ? TEAM_DEFS[player.team].glow : "rgba(245,255,250,0.86)", didBlock ? 18 : 8, didBlock ? 190 : 110);
    return didBlock;
  }

  function releaseShotCharge(controller) {
    const match = app.match;
    const player = getPlayer(controller.playerId);
    if (!controller.charging) {
      return;
    }

    controller.charging = false;
    const elapsed = match.now - controller.chargeStartedAt;
    const charge = clamp(elapsed / MAX_CHARGE_SECONDS, 0.12, 1);
    controller.charge = 0;

    if (!player || match.ball.carrierId !== player.id) {
      return;
    }

    const overCharge = Math.max(0, elapsed - MAX_CHARGE_SECONDS);
    const aim = normalize(controller.aimDir).length > 0 ? controller.aimDir : player.lastDir;
    shootBall(player, charge, aim, overCharge);
  }

  function shootBall(player, power, aim, overCharge) {
    const match = app.match;
    if (match.ball.carrierId !== player.id) {
      return;
    }

    const towardGoal = {
      x: teamGoalX(player.team) - player.x,
      y: FIELD.midY - player.y
    };
    let dir = normalize(aim || player.lastDir);
    if (dir.length === 0) {
      dir = normalize(towardGoal);
    }

    const miss = overCharge ? clamp(overCharge * 0.16, 0, 0.22) : 0;
    const angle = Math.atan2(dir.y, dir.x) + (Math.random() - 0.5) * miss;
    const speed = 520 + 520 * clamp(power, 0.12, 1);
    releaseBall(player, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, 0.2);
    addBurst(player.x, player.y, TEAM_DEFS[player.team].glow, 18, 190);
  }

  function performPass(player) {
    const match = app.match;
    if (!player || match.ball.carrierId !== player.id) {
      return;
    }

    const target = choosePassTarget(player);
    if (!target) {
      return;
    }

    if (isOffside(player, target)) {
      callOffside(player, target);
      return;
    }

    const toTarget = normalize({ x: target.x - player.x, y: target.y - player.y });
    if (toTarget.length === 0) {
      return;
    }

    const speed = clamp(distance(player, target) * 2.8, 430, 680);
    releaseBall(player, { x: toTarget.x * speed, y: toTarget.y * speed }, 0.16);
    addBurst(player.x, player.y, "#f7f3a5", 10, 140);
  }

  function choosePassTarget(player) {
    const match = app.match;
    const dir = TEAM_DEFS[player.team].attackDir;
    const opponents = match.players.filter((candidate) => candidate.team !== player.team);
    const teammates = match.players.filter((candidate) => candidate.team === player.team && candidate.id !== player.id);
    let best = null;
    let bestScore = -Infinity;

    teammates.forEach((mate) => {
      const progress = dir * (mate.x - player.x);
      const goalProgress = dir * (mate.x - FIELD.midX);
      const nearestPressure = opponents.reduce((bestValue, opponent) => {
        return Math.min(bestValue, distance(mate, opponent));
      }, 260);
      const passDistance = distance(player, mate);
      const roleBonus = mate.role === "forward" ? 52 : mate.role === "midfielder" ? 26 : mate.role === "goalkeeper" ? -95 : 0;
      const score = progress * 1.25 + goalProgress * 0.34 + nearestPressure * 0.38 - passDistance * 0.18 + roleBonus;
      if (score > bestScore) {
        best = mate;
        bestScore = score;
      }
    });

    return best;
  }

  function isOffside(passer, target) {
    const dir = TEAM_DEFS[passer.team].attackDir;
    const opponents = app.match.players.filter((player) => player.team !== passer.team);
    if (target.team !== passer.team || opponents.length < 2) {
      return false;
    }

    if (dir > 0 && target.x <= FIELD.midX) {
      return false;
    }

    if (dir < 0 && target.x >= FIELD.midX) {
      return false;
    }

    const defenderLines = opponents
      .map((player) => player.x)
      .sort((a, b) => dir > 0 ? b - a : a - b);
    const secondLastDefender = defenderLines[1];
    const aheadOfBall = dir > 0 ? target.x > app.match.ball.x : target.x < app.match.ball.x;
    const beyondDefender = dir > 0 ? target.x > secondLastDefender : target.x < secondLastDefender;
    return aheadOfBall && beyondDefender;
  }

  function callOffside(passer, target) {
    const match = app.match;
    const defendingTeam = otherTeam(passer.team);
    const receiver = nearestTeamPlayer(defendingTeam, target, true);
    match.message = "越位";
    match.messageTimer = 1.25;
    match.ball.x = target.x;
    match.ball.y = target.y;
    match.ball.vx = 0;
    match.ball.vy = 0;
    match.ball.carrierId = null;
    match.ball.looseUntil = match.now + 0.25;
    passer.noPickupUntil = match.now + 0.7;
    target.noPickupUntil = match.now + 0.7;
    if (receiver) {
      attachBall(receiver);
    }
    addBurst(target.x, target.y, "#ffd166", 18, 170);
  }

  function tryTackle(player, fromAI) {
    const match = app.match;
    if (match.now < player.tackleReadyAt) {
      return;
    }

    player.tackleReadyAt = match.now + (fromAI ? 0.72 : 0.58);
    addBurst(player.x, player.y, "#f6fff5", 8, 120);
    const carrier = getCarrier();

    if (carrier && carrier.team !== player.team && distance(player, carrier) < PLAYER_RADIUS * 2 + 18) {
      carrier.noPickupUntil = match.now + 0.55;
      attachBall(player);
      match.message = "";
      match.messageTimer = 0;
      addBurst(player.x, player.y, TEAM_DEFS[player.team].glow, 16, 160);
      return;
    }

    if (!carrier && distance(player, match.ball) < PLAYER_RADIUS + BALL_RADIUS + 18) {
      attachBall(player);
    }
  }

  function switchSoloPlayer(controller) {
    if (app.settings.mode !== "solo" || controller.slot !== 1) {
      return;
    }

    const match = app.match;
    const current = getPlayer(controller.playerId);
    const candidates = match.players
      .filter((player) => player.team === controller.team)
      .sort((a, b) => distSq(a, match.ball) - distSq(b, match.ball));
    const next = candidates.find((player) => player.id !== controller.playerId) || candidates[0];
    if (!next || next.id === controller.playerId) {
      return;
    }

    if (current) {
      current.controlledBy = null;
    }
    next.controlledBy = controller.slot;
    controller.playerId = next.id;
    controller.aimDir = { ...next.lastDir };
    controller.charging = false;
    controller.charge = 0;
    addBurst(next.x, next.y, TEAM_DEFS[next.team].glow, 10, 120);
  }

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (isInputFocused(event) || !GAME_KEYS.has(key)) {
      return;
    }

    event.preventDefault();
    if (app.pressed.has(key)) {
      return;
    }

    app.pressed.add(key);
    const match = app.match;
    if (!match || match.phase !== "playing") {
      return;
    }

    match.controllers.forEach((controller) => {
      if (key === controller.keys.shoot) {
        handleShootButtonDown(controller);
      }
      if (key === controller.keys.pass) {
        performPass(getPlayer(controller.playerId));
      }
      if (key === controller.keys.tackle) {
        tryTackle(getPlayer(controller.playerId), false);
      }
      if (controller.keys.switch && key === controller.keys.switch) {
        switchSoloPlayer(controller);
      }
    });
  });

  document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (isInputFocused(event) || !GAME_KEYS.has(key)) {
      return;
    }

    event.preventDefault();
    app.pressed.delete(key);
    const match = app.match;
    if (!match) {
      return;
    }

    match.controllers.forEach((controller) => {
      if (key === controller.keys.shoot) {
        releaseShotCharge(controller);
      }
    });
  });

  window.addEventListener("blur", () => {
    app.pressed.clear();
    if (!app.match) {
      return;
    }
    app.match.controllers.forEach((controller) => {
      controller.charging = false;
      controller.charge = 0;
    });
  });

  function addBurst(x, y, color, count, strength) {
    const match = app.match;
    if (!match) {
      return;
    }

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = strength * (0.3 + Math.random() * 0.7);
      match.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        size: 2 + Math.random() * 3,
        color
      });
    }
  }

  function updateEffects(dt) {
    const match = app.match;
    if (!match) {
      return;
    }

    match.effects = match.effects.filter((effect) => {
      effect.life -= dt;
      effect.x += effect.vx * dt;
      effect.y += effect.vy * dt;
      effect.vx *= Math.pow(0.16, dt);
      effect.vy *= Math.pow(0.16, dt);
      return effect.life > 0;
    });
  }

  function updateHud() {
    const match = app.match;
    if (!match) {
      return;
    }

    scoreText.textContent = `${match.score[0]} : ${match.score[1]}`;
    matchClock.textContent = formatClock(match.timeLeft);

    playerStatus.innerHTML = match.controllers.map((controller) => {
      const player = getPlayer(controller.playerId);
      const team = TEAM_DEFS[controller.team];
      const role = player ? ROLE_LABELS[player.role] : "";
      return `
        <div class="player-row">
          <span class="dot" style="background:${team.color}"></span>
          <span>${escapeHtml(controller.name)} ${role}</span>
        </div>
      `;
    }).join("");
  }

  function updateCenterMessage() {
    const match = app.match;
    if (!match || menu.classList.contains("hidden") === false) {
      centerMessage.classList.add("hidden");
      return;
    }

    centerMessage.classList.remove("small");
    if (match.phase === "countdown") {
      const value = Math.ceil(match.countdown);
      centerMessage.textContent = value > 0 ? String(value) : "開始";
      centerMessage.classList.remove("hidden");
      return;
    }

    if (match.phase === "goal" || match.messageTimer > 0) {
      centerMessage.textContent = match.message;
      centerMessage.classList.toggle("small", match.phase !== "goal");
      centerMessage.classList.remove("hidden");
      return;
    }

    centerMessage.classList.add("hidden");
  }

  function draw() {
    resizeCanvasIfNeeded();
    const scaleX = canvas.width / WORLD.width;
    const scaleY = canvas.height / WORLD.height;
    ctx.save();
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    drawBackdrop();
    drawField();
    drawEffects(true);
    drawPlayers();
    drawBall();
    drawEffects(false);
    ctx.restore();
  }

  function resizeCanvasIfNeeded() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function drawBackdrop() {
    const gradient = ctx.createLinearGradient(0, 0, WORLD.width, WORLD.height);
    gradient.addColorStop(0, "#07100d");
    gradient.addColorStop(0.45, "#0e3422");
    gradient.addColorStop(1, "#050807");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.fillRect(0, 0, WORLD.width, 52);
    ctx.fillRect(0, WORLD.height - 52, WORLD.width, 52);
  }

  function drawField() {
    const grass = ctx.createLinearGradient(FIELD.x, FIELD.y, FIELD.x, FIELD.y + FIELD.height);
    grass.addColorStop(0, "#1f8f56");
    grass.addColorStop(0.5, "#167345");
    grass.addColorStop(1, "#0f5f3a");
    ctx.fillStyle = grass;
    ctx.fillRect(FIELD.x, FIELD.y, FIELD.width, FIELD.height);

    for (let i = 0; i < 12; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.045)";
      ctx.fillRect(FIELD.x + i * FIELD.width / 12, FIELD.y, FIELD.width / 12, FIELD.height);
    }

    for (let y = FIELD.y; y < FIELD.y + FIELD.height; y += 18) {
      ctx.strokeStyle = "rgba(255,255,255,0.025)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(FIELD.x, y);
      ctx.lineTo(FIELD.x + FIELD.width, y + Math.sin(y * 0.03) * 2);
      ctx.stroke();
    }

    drawGoals();

    ctx.strokeStyle = "rgba(240,255,241,0.9)";
    ctx.lineWidth = 3;
    ctx.strokeRect(FIELD.x, FIELD.y, FIELD.width, FIELD.height);

    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(FIELD.midX, FIELD.y);
    ctx.lineTo(FIELD.midX, FIELD.y + FIELD.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(FIELD.midX, FIELD.midY, 84, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(240,255,241,0.92)";
    ctx.beginPath();
    ctx.arc(FIELD.midX, FIELD.midY, 4, 0, Math.PI * 2);
    ctx.fill();

    drawPenaltyArea(0);
    drawPenaltyArea(1);

    const vignette = ctx.createRadialGradient(FIELD.midX, FIELD.midY, 180, FIELD.midX, FIELD.midY, 660);
    vignette.addColorStop(0, "rgba(255,255,255,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = vignette;
    ctx.fillRect(FIELD.x, FIELD.y, FIELD.width, FIELD.height);
  }

  function drawGoals() {
    const top = FIELD.goalTop;
    const height = FIELD.goalWidth;
    const leftX = FIELD.x - FIELD.goalDepth;
    const rightX = FIELD.x + FIELD.width;

    ctx.fillStyle = "rgba(235,255,243,0.14)";
    ctx.fillRect(leftX, top, FIELD.goalDepth, height);
    ctx.fillRect(rightX, top, FIELD.goalDepth, height);

    ctx.strokeStyle = "rgba(245,255,250,0.52)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 5; i += 1) {
      const y = top + i * height / 5;
      ctx.beginPath();
      ctx.moveTo(leftX, y);
      ctx.lineTo(FIELD.x, y);
      ctx.moveTo(rightX, y);
      ctx.lineTo(rightX + FIELD.goalDepth, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 3; i += 1) {
      const lx = leftX + i * FIELD.goalDepth / 3;
      const rx = rightX + i * FIELD.goalDepth / 3;
      ctx.beginPath();
      ctx.moveTo(lx, top);
      ctx.lineTo(lx, top + height);
      ctx.moveTo(rx, top);
      ctx.lineTo(rx, top + height);
      ctx.stroke();
    }
  }

  function drawPenaltyArea(teamIndex) {
    const leftSide = teamIndex === 0;
    const lineX = leftSide ? FIELD.x : FIELD.x + FIELD.width;
    const sign = leftSide ? 1 : -1;
    ctx.strokeStyle = "rgba(240,255,241,0.84)";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(
      lineX,
      FIELD.midY - 145,
      sign * 170,
      290
    );
    ctx.strokeRect(
      lineX,
      FIELD.midY - 78,
      sign * 72,
      156
    );
    ctx.beginPath();
    ctx.arc(lineX + sign * 118, FIELD.midY, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(240,255,241,0.9)";
    ctx.fill();
  }

  function drawPlayers() {
    const match = app.match;
    if (!match) {
      return;
    }

    match.players.forEach((player) => {
      const team = TEAM_DEFS[player.team];
      const controller = controllerForPlayer(player);
      const isCarrier = match.ball.carrierId === player.id;
      const gradient = ctx.createRadialGradient(player.x - 6, player.y - 8, 2, player.x, player.y, PLAYER_RADIUS + 4);
      gradient.addColorStop(0, "#fff5c7");
      gradient.addColorStop(0.2, team.color);
      gradient.addColorStop(1, team.dark);

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.42)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(player.x, player.y + 13, PLAYER_RADIUS * 1.1, PLAYER_RADIUS * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      if (controller) {
        ctx.strokeStyle = team.glow;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER_RADIUS + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (isCarrier) {
        ctx.strokeStyle = "rgba(255, 209, 102, 0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER_RADIUS + 13, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.58)";
      ctx.lineWidth = 2;
      ctx.stroke();

      const direction = normalize(player.lastDir);
      if (direction.length > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.74)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(player.x + direction.x * 13, player.y + direction.y * 13);
        ctx.stroke();
      }

      if (controller) {
        drawNameTag(controller.name, player.x, player.y - PLAYER_RADIUS - 18, team.glow);
      }

      if (controller && controller.charging) {
        drawChargeRing(player, controller.charge);
      }

      ctx.restore();
    });
  }

  function drawChargeRing(player, charge) {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER_RADIUS + 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
    ctx.stroke();
  }

  function drawNameTag(name, x, y, color) {
    ctx.save();
    ctx.font = "700 18px Microsoft JhengHei, Noto Sans TC, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = ctx.measureText(name).width + 20;
    ctx.fillStyle = "rgba(4, 12, 9, 0.72)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x - width / 2, y - 13, width, 26, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f8fff8";
    ctx.fillText(name, x, y + 1);
    ctx.restore();
  }

  function drawBall() {
    const match = app.match;
    if (!match) {
      return;
    }

    const ball = match.ball;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.42)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(ball.x, ball.y + 7, BALL_RADIUS * 1.35, BALL_RADIUS * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const gradient = ctx.createRadialGradient(ball.x - 3, ball.y - 4, 1, ball.x, ball.y, BALL_RADIUS + 3);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.72, "#f8fafc");
    gradient.addColorStop(1, "#cfd8dc");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(20,25,24,0.42)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "rgba(20,25,24,0.42)";
    ctx.beginPath();
    ctx.arc(ball.x - 2, ball.y - 1, 1.7, 0, Math.PI * 2);
    ctx.arc(ball.x + 3, ball.y + 2, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEffects(behindPlayers) {
    const match = app.match;
    if (!match) {
      return;
    }

    match.effects.forEach((effect) => {
      const alpha = clamp(effect.life / effect.maxLife, 0, 1);
      const isLarge = effect.size > 3.2;
      if (behindPlayers !== isLarge) {
        return;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = effect.color;
      ctx.shadowColor = effect.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.size * (1.1 - alpha * 0.2), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function loop(now) {
    const dt = clamp((now - app.lastFrame) / 1000, 0, 0.033);
    app.lastFrame = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  renderHome();
  resizeCanvasIfNeeded();
  requestAnimationFrame(loop);
}());
