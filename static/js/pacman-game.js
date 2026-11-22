/*
 * pacman-game.js  -  AI-ASSISTED FILE (CS50x final project)
 *
 * Game design, rules and the original Python code are Ian's
 * (Terminal_Pacman_Display_V2.py). This JavaScript port was written with
 * AI assistance (Claude, Anthropic) and follows his Python step by step.
 *
 * This file is PURE LOGIC: it never touches the page (no DOM, no canvas),
 * so it can be tested in Node. pacman-view.js draws it.
 *
 * Usage:
 *   const game = PacmanGame.create();
 *   game.onGameOver = (result) => { ... result = {score, level, won} ... };
 *   game.setDirection("left");   // remember the last key pressed
 *   game.step();                 // advance ONE tick (state.tickLen seconds of game time)
 *
 * Differences from the Python on purpose:
 *   - terrain (walls/coins) and entities (player/ghosts) are kept apart, so the
 *     "trail" trick is not needed
 *   - every tick is exactly state.tickLen seconds of game time (no real-time dt)
 *   - the game does not end when the coins run out: you go on to the next LEVEL
 *     (faster ghosts, shorter power-ups). It ends when the lives run out.
 *   - queued turns: a key pressed just before a corner still turns at the corner
 *   - state.events lists what happened this tick ("coin", "power", "ghost",
 *     "death", "level") so the view can play sounds
 *   - the ghost-box timeout targets the NEAREST exit (not a random one every tick)
 *   - no blocking sleep: popups and the "ouch" pause are counted in ticks
 */
(function (root) {
  "use strict";

  const TICK = 0.30;          // seconds of game time per step on level 1
  const MIN_TICK = 0.14;      // the fastest the game ever gets
  const tickLength = (level) => Math.max(MIN_TICK, TICK * Math.pow(0.92, level - 1));
  const powerTime = (level) => Math.max(4, 12 - 1.5 * (level - 1));   // seconds a power pellet lasts
  const BOX_TIMEOUT = 10;     // seconds before a boxed ghost aims for an exit

  // The same 48 x 32 map as the Python version (P player, B/K/I/C ghosts,
  // b box cells, e exit cells, ◉ power pellets, . coins).
  const MAP_ROWS = [
    "■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■",
    "■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■",
    "■■◉..........................................◉■■",
    "■■.■■■■■.■■■■■■.■■■■■■■■■■■■■■■■.■■■■■■.■■■■■.■■",
    "■■.■■■■■.■■■■■■.■■■■■■■■■■■■■■■■.■■■■■■.■■■■■.■■",
    "■■.■■■■■.■■■■■■.■■■■■■■■■■■■■■■■.■■■■■■.■■■■■.■■",
    "■■............................................■■",
    "■■.■■■.■■■■■■.■■■■■■■■■■■■■■■■■■■■.■■■■■■.■■■.■■",
    "■■.■■■.■■■■■■.■■■■■■■■■■■■■■■■■■■■.■■■■■■.■■■.■■",
    "■■.■■■.■■■■■■.■■■■■■■■■■■■■■■■■■■■.■■■■■■.■■■.■■",
    "■■............................................■■",
    "■■.■■■■■.■■■■■■.■■■■■■■■■■■■■■■■.■■■■■■.■■■■■.■■",
    "■■.■■■■■.■■■■■■.■■■■■■■■■■■■■■■■.■■■■■■.■■■■■.■■",
    "■■............................................■■",
    "■■.■■■■■.■■■■■■■■.■■■■■ee■■■■■.■■■■■■■■.■■■■■.■■",
    "■■.■■■■■.■■■■■■■■.■bbKbbbbbCb■.■■■■■■■■.■■■■■.■■",
    "■■.■■■■■.■■■■■■■■.■bBbbbbbIbb■.■■■■■■■■.■■■■■.■■",
    "■■.■■■■■.■■■■■■■■.■■■■■ee■■■■■.■■■■■■■■.■■■■■.■■",
    "■■............................................■■",
    "■■.■■■■■.■■■■■■.■■■■■■■■■■■■■■■■.■■■■■■.■■■■■.■■",
    "■■.■■■■■.■■■■■■.■■■■■■■■■■■■■■■■.■■■■■■.■■■■■.■■",
    "■■............................................■■",
    "■■.■■■.■■■■■■.■■■■■■■■■■■■■■■■■■■■.■■■■■■.■■■.■■",
    "■■.■■■.■■■■■■.■■■■■■■■■■■■■■■■■■■■.■■■■■■.■■■.■■",
    "■■.■■■.■■■■■■.■■■■■■■■■■■■■■■■■■■■.■■■■■■.■■■.■■",
    "■■............................................■■",
    "■■.■■■■■.■■■■■■.■■■■■■■■■■■■■■■■.■■■■■■.■■■■■.■■",
    "■■.■■■■■.■■■■■■.■■■■■■■■■■■■■■■■.■■■■■■.■■■■■.■■",
    "■■.■■■■■.■■■■■■.■■■■■■■■■■■■■■■■.■■■■■■.■■■■■.■■",
    "■■◉....................P.....................◉■■",
    "■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■",
    "■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■",
  ];

  const ORDER = ["up", "right", "down", "left"];
  const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };
  const GHOST_NAMES = ["blinky", "pinky", "inky", "clyde"];
  const MARKERS = { blinky: "B", pinky: "K", inky: "I", clyde: "C" };
  const SCATTER_TARGETS = {
    blinky: [45, 2], pinky: [2, 2], inky: [45, 29], clyde: [2, 29],
  };
  const MODE_SCHEDULE = [
    ["init", 0], ["scatter", 7], ["chase", 20], ["scatter", 7], ["chase", 20],
    ["scatter", 5], ["chase", 20], ["scatter", 5], ["chase", Infinity],
  ];

  const isWall = (c) => c === "■" || c === "|";

  // ---------------------------------------------------------------- map ----
  function parseMap() {
    const h = MAP_ROWS.length;
    const w = Array.from(MAP_ROWS[0]).length;
    const grid = [];
    const boxCells = new Set();
    const exits = [];
    const starts = {};
    let playerStart = null;

    for (let y = 0; y < h; y++) {
      const row = Array.from(MAP_ROWS[y]);
      const out = [];
      for (let x = 0; x < w; x++) {
        const c = row[x];
        if (c === "P") {
          playerStart = [x, y];
          out.push(" ");
        } else if ("BKIC".includes(c)) {
          const name = GHOST_NAMES.find((n) => MARKERS[n] === c);
          starts[name] = [x, y];
          boxCells.add(x + "," + y);
          out.push(" ");
        } else if (c === "b") {
          boxCells.add(x + "," + y);
          out.push(" ");
        } else if (c === "e") {
          exits.push([x, y]);
          out.push(" ");
        } else {
          out.push(c);
        }
      }
      grid.push(out);
    }
    return { grid, w, h, boxCells, exits, starts, playerStart };
  }

  // Walking distance from every open tile to `goal` ("ripple" / flood fill).
  // Same idea as build_distance_map() in the Python. -1 = unreachable / wall.
  function buildDistanceMap(grid, w, h, goal) {
    const dist = new Int16Array(w * h).fill(-1);
    dist[goal[1] * w + goal[0]] = 0;
    let frontier = [goal];
    while (frontier.length) {
      const next = [];
      for (const [x, y] of frontier) {
        for (const d of ORDER) {
          const nx = x + DIRS[d][0];
          const ny = y + DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (dist[ny * w + nx] === -1 && !isWall(grid[ny][nx])) {
            dist[ny * w + nx] = dist[y * w + x] + 1;
            next.push([nx, ny]);
          }
        }
      }
      frontier = next;
    }
    return dist;
  }

  // --------------------------------------------------------------- game ----
  function create(options) {
    options = options || {};
    const rng = options.rng || Math.random;
    const map = parseMap();
    const { w, h } = map;

    const distHome = {};
    for (const name of GHOST_NAMES) {
      distHome[name] = buildDistanceMap(map.grid, w, h, map.starts[name]);
    }

    const game = {
      TICK, w, h,
      state: null,
      onGameOver: options.onGameOver || null,
      pendingDir: null,
      setDirection(dir) { if (DIRS[dir]) this.pendingDir = dir; },
      reset, step,
    };

    function makeGhost(name) {
      const [x, y] = map.starts[name];
      return {
        name, x, y, px: x, py: y, start: [x, y],
        state: "normal", movement: "", dx: 0, dy: 0,
        boxedTime: 0, forceReverse: false, slowPhase: false,
        validMoves: [], points: {}, target: [0, 0],
      };
    }

    function reset() {
      const grid = map.grid.map((r) => r.slice());
      let coins = 0;
      for (const r of grid) for (const c of r) if (c === ".") coins++;
      const [sx, sy] = map.playerStart;
      game.pendingDir = null;
      game.state = {
        grid, w, h,
        player: { x: sx, y: sy, px: sx, py: sy, dx: 0, dy: 0, dir: "right", blocked: false, queued: null, queuedAge: 0 },
        ghosts: GHOST_NAMES.map(makeGhost),
        score: 0, lives: 3, pellets: coins,
        mode: "scatter", modeTimer: 7, scheduleIndex: 1,
        power: 0, powerUp: false, blink: 0, combo: 0,
        freeze: 0, popups: [], tick: 0, over: null,
        level: 1, tickLen: TICK, events: [], death: null,
      };
      return game.state;
    }

    // all coins eaten: fresh board, ghosts home, a bit faster. Score and lives stay.
    function nextLevel(s) {
      const board = map.grid.map((r) => r.slice());
      let coins = 0;
      for (const r of board) for (const c of r) if (c === ".") coins++;
      s.level++;
      s.tickLen = tickLength(s.level);
      s.grid = board;
      s.pellets = coins;
      s.power = 0; s.powerUp = false; s.blink = 0; s.combo = 0;
      s.mode = "scatter"; s.modeTimer = 7; s.scheduleIndex = 1;
      s.ghosts = GHOST_NAMES.map(makeGhost);
      const pl = s.player, [sx, sy] = map.playerStart;
      pl.x = pl.px = sx; pl.y = pl.py = sy;
      pl.dir = "right"; pl.dx = 0; pl.dy = 0; pl.blocked = false; pl.queued = null;
      s.popups = [{ x: 24, y: 18, text: "LEVEL " + s.level, ttl: 4 }];
      s.freeze = 4;
      s.events.push("level");
    }

    function step() {
      const s = game.state;
      if (s.over) return;
      const pl = s.player;
      const ghosts = s.ghosts;
      const dt = s.tickLen;
      s.tick++;
      s.events = [];

      // remember where everyone was (the view slides between old and new)
      pl.px = pl.x; pl.py = pl.y;
      for (const gh of ghosts) { gh.px = gh.x; gh.py = gh.y; }
      s.popups = s.popups.filter((p) => --p.ttl > 0);

      if (s.freeze > 0) {                            // pause after losing a life / starting a level
        s.freeze--;
        if (s.death && --s.death.ttl <= 0) s.death = null;
        return;
      }

      // 1. key -> a QUEUED turn. The turn happens as soon as that way is free, so
      //    pressing a key slightly before a corner still turns at the corner.
      //    (The Python read one key per tick and wasted a tick when blocked.)
      if (game.pendingDir) { pl.queued = game.pendingDir; pl.queuedAge = 0; game.pendingDir = null; }
      const isFree = (d) => !isWall(s.grid[pl.y + DIRS[d][1]][pl.x + DIRS[d][0]]);
      if (pl.queued) {
        if (isFree(pl.queued)) { pl.dir = pl.queued; pl.queued = null; }
        else if (++pl.queuedAge > 6) pl.queued = null;   // forget turns that never became possible
      }

      // 2. chase / scatter schedule
      if (s.modeTimer <= 0 && s.scheduleIndex + 1 < MODE_SCHEDULE.length) {
        s.scheduleIndex++;
        [s.mode, s.modeTimer] = MODE_SCHEDULE[s.scheduleIndex];
      }

      // 3. player velocity: walk in `dir` unless a wall is right ahead
      pl.blocked = !isFree(pl.dir);
      if (pl.blocked) { pl.dx = 0; pl.dy = 0; }
      else { [pl.dx, pl.dy] = DIRS[pl.dir]; }

      const nx = pl.x + pl.dx;
      const ny = pl.y + pl.dy;
      const ahead = s.grid[ny][nx];
      if (ahead === "◉") {
        s.combo = 0;
        s.power = powerTime(s.level);
        s.events.push("power");
        s.blink = 0;
        s.score += 50;
        for (const gh of ghosts) gh.forceReverse = true;
        s.grid[ny][nx] = " ";
      } else if (ahead === ".") {
        s.pellets--;
        s.score += 10;
        s.events.push("coin");
        s.grid[ny][nx] = " ";
      }
      if (!pl.blocked) { pl.x = nx; pl.y = ny; }

      // 4. timers and scared / normal switching
      s.modeTimer -= dt;
      if (s.power > 0) {
        s.power -= Math.min(dt, s.power);
        s.powerUp = true;
        for (const gh of ghosts) if (gh.state === "normal") gh.state = "scared";
      } else {
        s.powerUp = false;
        for (const gh of ghosts) if (gh.state === "scared") gh.state = "normal";
      }
      if (!s.powerUp) s.blink = 0;

      // 5. ghost targets
      const byName = {};
      for (const gh of ghosts) byName[gh.name] = gh;
      const blinky = byName.blinky, pinky = byName.pinky, inky = byName.inky, clyde = byName.clyde;

      blinky.target = [pl.x, pl.y];

      let tx = pl.x + 10 * pl.dx, ty = pl.y + 10 * pl.dy, guard = 0;
      while (!(tx >= 0 && tx < w && ty >= 0 && ty < h) && guard++ < 200) {
        if (pl.dx === 0 && pl.dy === 0 && pinky.dx === 0 && pinky.dy === 0) { tx -= 1; ty -= 1; }
        else if (pl.dx === 0 && pl.dy === 0) { tx -= pinky.dx; ty -= pinky.dy; }
        else { tx -= pl.dx; ty -= pl.dy; }
      }
      pinky.target = [tx, ty];

      const aheadX = pl.x + 2 * pl.dx, aheadY = pl.y + 2 * pl.dy;
      let ix = 2 * aheadX - blinky.x, iy = 2 * aheadY - blinky.y;
      guard = 0;
      while (!(ix >= 0 && ix < w && iy >= 0 && iy < h) && guard++ < 400) {
        if (ix < 0) ix++; else if (ix >= w) ix--;
        if (iy < 0) iy++; else if (iy >= h) iy--;
      }
      inky.target = [ix, iy];

      const cd = Math.hypot(clyde.x - pl.x, clyde.y - pl.y);
      clyde.target = cd > 8 ? [pl.x, pl.y] : SCATTER_TARGETS.clyde.slice();

      // 6. each ghost's free neighbours (walls and other ghosts block)
      const occupied = new Set(ghosts.map((gh) => gh.x + "," + gh.y));
      for (const gh of ghosts) {
        gh.points = {
          up: [gh.x, gh.y - 1], right: [gh.x + 1, gh.y],
          down: [gh.x, gh.y + 1], left: [gh.x - 1, gh.y],
        };
        gh.validMoves = ORDER.filter((d) => {
          const [x, y] = gh.points[d];
          return !isWall(s.grid[y][x]) && !occupied.has(x + "," + y);
        });
      }

      // 7. no U-turns, scatter corners, box timeout
      for (const gh of ghosts) {
        if (!gh.forceReverse && OPPOSITE[gh.movement]) {
          const back = OPPOSITE[gh.movement];
          if (gh.validMoves.length > 1 && gh.validMoves.includes(back)) {
            gh.validMoves.splice(gh.validMoves.indexOf(back), 1);
          }
        }
        if (s.mode === "scatter") gh.target = SCATTER_TARGETS[gh.name].slice();

        if (map.boxCells.has(gh.x + "," + gh.y)) {
          gh.boxedTime += dt;
          if (gh.boxedTime >= BOX_TIMEOUT) {
            let best = map.exits[0], bestD = Infinity;
            for (const e of map.exits) {
              const d = (e[0] - gh.x) ** 2 + (e[1] - gh.y) ** 2;
              if (d < bestD) { bestD = d; best = e; }
            }
            gh.target = best.slice();
          }
        } else {
          gh.boxedTime = 0;
        }
      }

      // 8. dead ghosts revive when they reach their home tile
      for (const gh of ghosts) {
        if (gh.state === "dead" && gh.x === gh.start[0] && gh.y === gh.start[1]) gh.state = "normal";
      }

      // 9. pick each ghost's move
      for (const gh of ghosts) {
        if (gh.state === "dead") {                       // shortest way home
          const dist = distHome[gh.name];
          let bestMove = "", bestDist = Infinity;
          for (const d of ORDER) {
            const [x, y] = gh.points[d];
            const v = dist[y * w + x];
            if (v >= 0 && v < bestDist) { bestDist = v; bestMove = d; }
          }
          if (bestMove) gh.movement = bestMove;
          gh.forceReverse = false;
          continue;
        }
        if (gh.forceReverse) {                           // power pellet: turn around
          if (OPPOSITE[gh.movement]) gh.movement = OPPOSITE[gh.movement];
          gh.forceReverse = false;
          continue;
        }
        if (s.powerUp) {                                 // frightened: wander
          gh.movement = gh.validMoves.length
            ? gh.validMoves[Math.floor(rng() * gh.validMoves.length)] : "";
        } else {                                         // chase / scatter: closest neighbour
          let bestMove = "", bestDist = Infinity;
          for (const d of gh.validMoves) {
            const [x, y] = gh.points[d];
            const dd = Math.hypot(gh.target[0] - x, gh.target[1] - y);
            if (dd < bestDist) { bestDist = dd; bestMove = d; }
          }
          gh.movement = bestMove;
        }
      }

      // 10. move -> velocity, scared ghosts only move every other tick
      for (const gh of ghosts) {
        const v = DIRS[gh.movement];
        gh.dx = v ? v[0] : 0;
        gh.dy = v ? v[1] : 0;
        if (gh.state === "scared") {
          gh.slowPhase = !gh.slowPhase;
          if (gh.slowPhase) { gh.dx = 0; gh.dy = 0; }
        }
      }

      // 11. who is each ghost about to walk into?
      const entityAt = new Map();
      entityAt.set(pl.x + "," + pl.y, "player");
      for (const gh of ghosts) entityAt.set(gh.x + "," + gh.y, gh.name);
      for (const gh of ghosts) {
        gh.collidingWith = entityAt.get((gh.x + gh.dx) + "," + (gh.y + gh.dy)) || null;
      }

      // 12. Pac-Man eats scared ghosts that touch him
      for (const gh of ghosts) {
        if ((gh.x - pl.x) ** 2 + (gh.y - pl.y) ** 2 < 2 && gh.state === "scared" && s.powerUp) {
          gh.state = "dead";
          s.combo++;
          const points = 200 * 2 ** s.combo;
          s.score += points;
          s.popups.push({ x: gh.x, y: gh.y, text: "CHOMP! +" + points, ttl: 4 });
          s.events.push("ghost");
        }
      }

      // 13. two ghosts may not overlap (the player is handled separately)
      for (const gh of ghosts) {
        if (gh.collidingWith !== null && gh.collidingWith !== "player" && gh.collidingWith !== gh.name) {
          gh.dx = 0; gh.dy = 0;
        }
      }
      const claimed = new Set();
      for (const gh of ghosts) if (!gh.dx && !gh.dy) claimed.add(gh.x + "," + gh.y);
      for (const gh of ghosts) {
        if (!gh.dx && !gh.dy) continue;
        const tx2 = gh.x + gh.dx, ty2 = gh.y + gh.dy;
        const key = tx2 + "," + ty2;
        if (isWall(s.grid[ty2][tx2]) || claimed.has(key)) {   // wall or already taken
          gh.dx = 0; gh.dy = 0; claimed.add(gh.x + "," + gh.y);
        } else {
          claimed.add(key);
        }
      }

      // 14. everybody moves
      for (const gh of ghosts) { gh.x += gh.dx; gh.y += gh.dy; }

      // 15. blink counter (scared ghosts flash when the power is running out)
      if (s.power > 0 && s.power < 4) s.blink++;

      // 16. ghost touches Pac-Man while not powered up -> lose a life
      if (!s.powerUp) {
        for (const gh of ghosts) {
          const close = (gh.x - pl.x) ** 2 + (gh.y - pl.y) ** 2 <= 1;
          const headingIn = pl.x === gh.x + gh.dx && pl.y === gh.y + gh.dy;
          if (close && !headingIn && gh.state === "normal") {
            s.lives--;
            s.death = { x: pl.x, y: pl.y, dir: pl.dir, ttl: 4 };   // the view plays the death animation here
            s.events.push("death");
            for (const g2 of ghosts) {                       // like the arcade: ALL ghosts go home
              g2.x = g2.px = g2.start[0];
              g2.y = g2.py = g2.start[1];
              g2.state = "normal"; g2.movement = ""; g2.dx = 0; g2.dy = 0;
              g2.boxedTime = 0; g2.forceReverse = false;
            }
            pl.x = pl.px = map.playerStart[0];
            pl.y = pl.py = map.playerStart[1];
            pl.dir = "right"; pl.dx = 0; pl.dy = 0; pl.blocked = false; pl.queued = null;
            s.freeze = 4;
            break;
          }
        }
      }

      // 17. game over?
      if (s.lives <= 0) {
        s.over = { won: s.level > 1, score: s.score, level: s.level };   // won = cleared at least one board
        if (game.onGameOver) game.onGameOver(s.over);
      } else if (s.pellets <= 0) {
        nextLevel(s);
      }
    }

    reset();
    return game;
  }

  const api = { create, TICK, tickLength, powerTime, MAP_ROWS, isWall, buildDistanceMap, parseMap };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PacmanGame = api;
})(typeof window !== "undefined" ? window : globalThis);
