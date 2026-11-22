/*
 * pacman-view.js  -  AI-ASSISTED FILE (CS50x final project)
 * Written with AI assistance (Claude, Anthropic) for Ian's portfolio.
 *
 * Draws a PacmanGame (pacman-game.js) on a <canvas>, reads the keyboard,
 * plays sounds (pacman-sound.js) and shows start / pause / game-over overlays.
 * It knows nothing about Flask or scores: when a game ends it calls
 * options.onGameOver(result, extraSlot).
 *
 * Two skins draw the SAME game:
 *   "terminal" - monospace blocks and characters, snaps tile to tile (like the Python version)
 *   "arcade"   - smooth movement, round ghosts
 *
 *   const view = PacmanView.mount(containerElement, game, { onGameOver(result, extraSlot) {...} })
 *   view.start()   starts / restarts the game
 */
(function (root) {
  "use strict";

  const CELL = 16;   // logical pixels per map tile
  const KEYS = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", a: "left", s: "down", d: "right",
    i: "up", j: "left", k: "down", l: "right",
  };
  const ARCADE = {
    blinky: "#ef4b4b", pinky: "#f08ac5", inky: "#4fd6e8", clyde: "#f2a33a",
    scared: "#3446c9", wallFill: "#23283a", wallEdge: "#6f7fe0",
    coin: "#ece8e1", pacman: "#f5d04a", text: "#ece8e1",
  };
  const TERM = {
    bg: "#0a0d0c", wall: "#8f98f5", coin: "#d9d4c7", pacman: "#ffe66d", text: "#d9d4c7",
    blinky: "#ff6b6b", pinky: "#ff8fe0", inky: "#5ee6ff", clyde: "#ffc15e",
    scared: "#4d8dff", dead: "#f4f4f4",
  };
  const MONO = "'Cascadia Mono','Cascadia Code',Consolas,Menlo,'DejaVu Sans Mono',monospace";
  const ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

  function mount(container, game, options) {
    options = options || {};
    const w = game.w, h = game.h;
    const W = w * CELL, H = h * CELL;
    const sound = root.PacmanSound || { play() {}, unlock() {}, setMuted() {}, isMuted() { return true; } };

    container.classList.add("pm-widget");
    container.innerHTML =
      '<div class="pm-hud">' +
        '<span>SCORE <b class="pm-score">000000</b></span>' +
        '<span>LEVEL <b class="pm-level">1</b></span>' +
        '<span>MODE <b class="pm-mode">SCATTER</b></span>' +
        '<span>POWER <b class="pm-power">0.0</b></span>' +
        '<span>COINS <b class="pm-pellets">0</b></span>' +
        '<span class="pm-lives" aria-label="lives"></span>' +
        '<span class="pm-tools">' +
          '<button type="button" class="pm-btn pm-btn-sound" title="Sound (M)"></button>' +
          '<button type="button" class="pm-btn pm-btn-skin" title="Skin (T)"></button>' +
        '</span>' +
      '</div>' +
      '<div class="pm-stage">' +
        '<canvas class="pm-canvas" tabindex="0" aria-label="Pac-Man game"></canvas>' +
        '<div class="pm-overlay" role="button" tabindex="0">' +
          '<div class="pm-overlay-title"></div>' +
          '<div class="pm-overlay-text"></div>' +
          '<div class="pm-overlay-hint"></div>' +
          '<div class="pm-extra"></div>' +
        '</div>' +
      '</div>' +
      '<div class="pm-help">Arrows / WASD / IJKL move &middot; Space pauses &middot; M sound &middot; T skin</div>';

    const canvas = container.querySelector(".pm-canvas");
    const overlay = container.querySelector(".pm-overlay");
    const elTitle = container.querySelector(".pm-overlay-title");
    const elText = container.querySelector(".pm-overlay-text");
    const elHint = container.querySelector(".pm-overlay-hint");
    const extraSlot = container.querySelector(".pm-extra");
    const btnSound = container.querySelector(".pm-btn-sound");
    const btnSkin = container.querySelector(".pm-btn-skin");
    const hud = {
      score: container.querySelector(".pm-score"),
      level: container.querySelector(".pm-level"),
      mode: container.querySelector(".pm-mode"),
      power: container.querySelector(".pm-power"),
      pellets: container.querySelector(".pm-pellets"),
      lives: container.querySelector(".pm-lives"),
    };

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.aspectRatio = W + " / " + H;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // ------------------------------------------------------ skins ----
    let skin = "terminal";
    try { if (localStorage.getItem("pm-skin") === "arcade") skin = "arcade"; } catch (e) { /* ignore */ }

    function setSkin(name) {
      skin = name;
      container.dataset.skin = name;
      btnSkin.textContent = "SKIN: " + name.toUpperCase();
      try { localStorage.setItem("pm-skin", name); } catch (e) { /* ignore */ }
    }
    function refreshSoundButton() { btnSound.textContent = "SOUND: " + (sound.isMuted() ? "OFF" : "ON"); }
    function toggleSound() { sound.setMuted(!sound.isMuted()); sound.unlock(); refreshSoundButton(); }
    function toggleSkin() { setSkin(skin === "terminal" ? "arcade" : "terminal"); }

    btnSound.addEventListener("click", function () { toggleSound(); btnSound.blur(); });
    btnSkin.addEventListener("click", function () { toggleSkin(); btnSkin.blur(); });

    // walls never change: draw each skin's walls once on a hidden canvas
    function makeWallCanvas(drawFn) {
      const c = document.createElement("canvas");
      c.width = W * dpr;
      c.height = H * dpr;
      const cx = c.getContext("2d");
      cx.scale(dpr, dpr);
      drawFn(cx);
      return c;
    }
    const gridAtStart = game.state.grid;
    const isWallAt = (x, y) => y >= 0 && y < h && x >= 0 && x < w && PacmanGame.isWall(gridAtStart[y][x]);

    const wallsArcade = makeWallCanvas(function (c) {
      c.fillStyle = ARCADE.wallFill;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (isWallAt(x, y)) c.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
      c.strokeStyle = ARCADE.wallEdge;
      c.lineWidth = 1.5;
      c.lineCap = "round";
      c.beginPath();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!isWallAt(x, y)) continue;
        const X = x * CELL, Y = y * CELL, i = 2;   // edge only where wall meets open floor
        if (!isWallAt(x, y - 1)) { c.moveTo(X + i, Y + i); c.lineTo(X + CELL - i, Y + i); }
        if (!isWallAt(x, y + 1)) { c.moveTo(X + i, Y + CELL - i); c.lineTo(X + CELL - i, Y + CELL - i); }
        if (!isWallAt(x - 1, y)) { c.moveTo(X + i, Y + i); c.lineTo(X + i, Y + CELL - i); }
        if (!isWallAt(x + 1, y)) { c.moveTo(X + CELL - i, Y + i); c.lineTo(X + CELL - i, Y + CELL - i); }
      }
      c.stroke();
    });

    const wallsTerminal = makeWallCanvas(function (c) {   // every wall tile = "■■", like render_row() in the Python
      c.fillStyle = TERM.bg;
      c.fillRect(0, 0, W, H);
      c.fillStyle = TERM.wall;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!isWallAt(x, y)) continue;
        c.fillRect(x * CELL + 1, y * CELL + 3, 6, 10);
        c.fillRect(x * CELL + 9, y * CELL + 3, 6, 10);
      }
    });

    // ----------------------------------------------------- drawing ----
    const lerp = (a, b, t) => a + (b - a) * t;

    function drawPacman(cx, cy, dir, mouth, color) {
      const r = CELL * 0.46, a = ANGLE[dir] || 0;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a + mouth, a + Math.PI * 2 - mouth);
      ctx.closePath();
      ctx.fill();
    }

    function drawGhostArcade(gh, cx, cy, s, now) {
      const r = CELL * 0.46;
      const flashing = s.power > 0 && s.power < 4 && s.blink % 2 === 0;
      const scared = gh.state === "scared" && !flashing;
      const dead = gh.state === "dead";

      if (!dead) {
        ctx.fillStyle = scared ? ARCADE.scared : ARCADE[gh.name];
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, 0);
        ctx.lineTo(cx + r, cy + r);
        const wob = Math.floor(now / 140) % 2 ? 0.65 : 1;       // feet wiggle
        const k = [[0.67, wob], [0.33, 1], [0, wob], [-0.33, 1], [-0.67, wob], [-1, 1]];
        for (const [fx, fy] of k) ctx.lineTo(cx + r * fx, cy + r * (fy === 1 ? 1 : 0.62));
        ctx.closePath();
        ctx.fill();
      }
      if (scared) {                                             // little face
        ctx.fillStyle = "#f4e7c8";
        ctx.fillRect(cx - r * 0.4, cy - r * 0.25, r * 0.2, r * 0.2);
        ctx.fillRect(cx + r * 0.2, cy - r * 0.25, r * 0.2, r * 0.2);
        return;
      }
      for (const sx of [-0.35, 0.35]) {                         // eyes follow the direction
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(cx + r * sx, cy - r * 0.15, r * 0.27, r * 0.33, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1b2a8a";
        ctx.beginPath();
        ctx.arc(cx + r * sx + gh.dx * r * 0.13, cy - r * 0.15 + gh.dy * r * 0.15, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawGhostTerminal(gh, cx, cy, s) {                 // a character, like the Python sprites
      const flashing = s.power > 0 && s.power < 4 && s.blink % 2 === 0;
      let glyph = "♟︎", color = TERM[gh.name];        // ♟ (the FE0E forces text, not emoji)
      if (gh.state === "scared" && !flashing) color = TERM.scared;
      else if (gh.state === "dead") { glyph = "∞"; color = TERM.dead; }   // ∞
      ctx.font = "bold " + Math.round(CELL * 1.05) + "px " + MONO;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(glyph, cx, cy + 1);
    }

    // Pac-Man's death: the mouth opens until he vanishes (p goes 0 -> 1)
    function drawDeath(d, p, color) {
      if (p >= 1) return;
      drawPacman((d.x + 0.5) * CELL, (d.y + 0.5) * CELL, d.dir === "right" || d.dir === "left" ? "up" : d.dir, 0.1 + p * (Math.PI - 0.1), color);
    }

    // death bookkeeping for the view only (the game just says "he died here")
    let seenDeath = null, deathT0 = 0, deathMs = 1200;

    function draw(alpha, now) {
      const s = game.state;
      const term = skin === "terminal";
      const a = term ? 1 : alpha;                 // terminal skin snaps tile to tile
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(term ? wallsTerminal : wallsArcade, 0, 0, W, H);

      if (s.death && s.death !== seenDeath) {
        seenDeath = s.death;
        deathT0 = now;
        deathMs = s.tickLen * 4 * 1000;
      }
      const dying = seenDeath !== null && s.death === seenDeath && now - deathT0 < deathMs;

      // coins and power pellets
      ctx.fillStyle = term ? TERM.coin : ARCADE.coin;
      const pulse = 0.26 + 0.06 * Math.sin(now / 180);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = s.grid[y][x];
        if (c === ".") {
          ctx.beginPath();
          ctx.arc((x + 0.5) * CELL, (y + 0.5) * CELL, CELL * (term ? 0.08 : 0.11), 0, Math.PI * 2);
          ctx.fill();
        } else if (c === "◉") {
          ctx.beginPath();
          ctx.arc((x + 0.5) * CELL, (y + 0.5) * CELL, CELL * pulse, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const gh of s.ghosts) {
        const gx = (lerp(gh.px, gh.x, a) + 0.5) * CELL, gy = (lerp(gh.py, gh.y, a) + 0.5) * CELL;
        if (term) drawGhostTerminal(gh, gx, gy, s);
        else drawGhostArcade(gh, gx, gy, s, now);
      }

      const pcolor = term ? TERM.pacman : ARCADE.pacman;
      if (dying) {
        drawDeath(s.death, (now - deathT0) / deathMs, pcolor);
      } else {
        const pl = s.player;
        const open = term ? (Math.floor(now / 200) % 2 ? 0.7 : 0.08) : 0.12 + 0.55 * Math.abs(Math.sin(now / 90));
        drawPacman((lerp(pl.px, pl.x, a) + 0.5) * CELL, (lerp(pl.py, pl.y, a) + 0.5) * CELL, pl.dir, pl.blocked ? 0.06 : open, pcolor);
      }

      // floating popups ("CHOMP! +400", "LEVEL 2")
      ctx.font = "bold " + Math.round(CELL * 0.8) + "px " + MONO;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      for (const p of s.popups) {
        const tx = Math.min(Math.max((p.x + 0.5) * CELL, CELL * 4), W - CELL * 4);
        const ty = (p.y - 0.4 - (4 - p.ttl) * 0.25) * CELL;
        ctx.fillStyle = "rgba(0,0,0,.7)";
        ctx.fillText(p.text, tx + 1, ty + 1);
        ctx.fillStyle = term ? TERM.text : ARCADE.text;
        ctx.fillText(p.text, tx, ty);
      }

      // HUD (plain DOM text, cheap to update)
      hud.score.textContent = String(s.score).padStart(6, "0");
      hud.level.textContent = s.level;
      hud.mode.textContent = s.mode.toUpperCase();
      hud.power.textContent = s.power.toFixed(1);
      hud.pellets.textContent = s.pellets;
      hud.lives.textContent = "♥ ".repeat(Math.max(s.lives, 0)).trim();
    }

    // ------------------------------------------- state / overlay ----
    let status = "idle";        // idle | running | paused | over
    let visible = true;
    let overlayTimer = 0;

    function showOverlay(title, text, hint) {
      elTitle.textContent = title;
      elText.textContent = text;
      elHint.textContent = hint;
      overlay.classList.remove("pm-hidden");
    }
    function hideOverlay() { overlay.classList.add("pm-hidden"); }

    function start() {
      clearTimeout(overlayTimer);
      if (status === "over") { game.reset(); extraSlot.innerHTML = ""; seenDeath = null; }
      status = "running";
      acc = 0;
      sound.unlock();
      hideOverlay();
    }
    function pause() {
      if (status !== "running") return;
      status = "paused";
      showOverlay("PAUSED", "", "Space or click to resume");
    }
    function toggle() {
      if (status === "running") pause();
      else start();
    }

    game.onGameOver = function (result) {
      status = "over";
      const wait = game.state.tickLen * 4 * 1000 + 100;      // let the death animation finish first
      overlayTimer = setTimeout(function () {
        if (status !== "over") return;
        showOverlay(
          "GAME OVER",
          "Final score: " + String(result.score).padStart(6, "0") + "  ·  level " + result.level,
          "Enter or click to play again"
        );
        if (options.onGameOver) options.onGameOver(result, extraSlot);
      }, wait);
    };

    overlay.addEventListener("click", function (e) {
      if (e.target.closest(".pm-extra")) return;             // clicks in the name form don't restart
      toggle();
    });
    canvas.addEventListener("click", function () { if (status === "running") pause(); });

    window.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "");
      if (typing || !visible) return;

      if (key === "m") { toggleSound(); return; }
      if (key === "t") { toggleSkin(); return; }

      if (KEYS[key] && (status === "running" || status === "paused")) {
        e.preventDefault();                       // keep the page from scrolling
        if (status === "running") game.setDirection(KEYS[key]);
      } else if (key === " " && status !== "idle" && status !== "over") {
        e.preventDefault();
        toggle();
      } else if ((key === "Enter" || key === "e" || key === " ") && (status === "idle" || status === "over")) {
        e.preventDefault();
        start();
      }
    });

    // pause by itself when scrolled away or the tab is hidden
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (!visible) pause();
      }, { threshold: 0.3 }).observe(container);
    }
    document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); });

    // ----------------------------------------------------- main loop ----
    let last = null, acc = 0;
    function frame(t) {
      requestAnimationFrame(frame);
      if (last === null) last = t;
      const dt = Math.min((t - last) / 1000, 0.25);
      last = t;
      if (status === "running") {
        acc += dt;
        let n = 0;
        while (status === "running" && n < 3 && acc >= game.state.tickLen) {
          game.step();
          acc -= game.state.tickLen;
          n++;
          for (const ev of game.state.events) sound.play(ev);
        }
      }
      const alpha = status === "running" || status === "paused" ? Math.min(acc / game.state.tickLen, 1) : 1;
      draw(alpha, t);
    }

    setSkin(skin);
    refreshSoundButton();
    requestAnimationFrame(frame);
    showOverlay("PAC-MAN", "Eat every coin. Avoid the ghosts. Grab a ◉ to hunt them. Clear the board to reach the next level.", "Press Enter or click to start");
    return { extraSlot, start, pause };
  }

  root.PacmanView = { mount };
})(window);
