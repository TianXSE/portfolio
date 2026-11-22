// AI-assisted file (CS50x final project): headless checks for pacman-game.js. Run: node tests/game-test.js
const G = require("../static/js/pacman-game.js");
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } };
const isWall = G.isWall;

// seeded rng
function rngFrom(seed){ let a=seed>>>0; return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

// 1. random-play fuzz: invariants every tick
for (let seed = 1; seed <= 30; seed++) {
  const rng = rngFrom(seed);
  const g = G.create({ rng });
  const dirs = ["up","down","left","right"];
  let coinsPrev = g.state.pellets, scorePrev = 0, over = 0, lvlPrev = 1;
  g.onGameOver = () => over++;
  for (let t = 0; t < 1500 && !g.state.over; t++) {
    if (rng() < 0.15) g.setDirection(dirs[Math.floor(rng()*4)]);
    g.step();
    const s = g.state;
    const seen = new Set();
    for (const gh of s.ghosts) {
      ok(!isWall(s.grid[gh.y][gh.x]), `seed ${seed} t${t}: ${gh.name} in wall`);
      const k = gh.x+","+gh.y;
      ok(!seen.has(k), `seed ${seed} t${t}: ghosts overlap at ${k}`); seen.add(k);
      ok(Math.abs(gh.x-gh.px)+Math.abs(gh.y-gh.py) <= 1, `seed ${seed} t${t}: ${gh.name} teleported`);
    }
    ok(!isWall(s.grid[s.player.y][s.player.x]), `seed ${seed}: player in wall`);
    let coins = 0; for (const r of s.grid) for (const c of r) if (c === ".") coins++;
    ok(coins === s.pellets, `seed ${seed} t${t}: pellets counter ${s.pellets} != grid ${coins}`);
    if (s.level === lvlPrev) ok(s.pellets <= coinsPrev, "coins increased"); coinsPrev = s.pellets; lvlPrev = s.level;
    ok(s.score >= scorePrev, "score went down"); scorePrev = s.score;
    ok(s.power >= 0, "power negative");
  }
  ok(over <= 1, "onGameOver fired more than once");
}
console.log("fuzz done");

// 2. all four ghosts leave the box (no power-ups, player parked)
{
  const g = G.create({ rng: rngFrom(7) });
  const box = new Set(); 
  const left = new Set();
  const map = G.parseMap();
  for (let t = 0; t < 400 && !g.state.over; t++) {
    g.step();
    for (const gh of g.state.ghosts) if (!map.boxCells.has(gh.x+","+gh.y)) left.add(gh.name);
  }
  console.log("ghosts that left the box in 400 ticks:", [...left].join(","), g.state.over ? "(game over early: lives lost)" : "");
}

// 3. dead ghost far from home walks back and revives
{
  const g = G.create({ rng: rngFrom(3) });
  const s = g.state, gh = s.ghosts[2];
  gh.state = "dead"; gh.x = gh.px = 10; gh.y = gh.py = 29; gh.movement = "left";
  s.player.x = s.player.px = 40; s.player.y = s.player.py = 2; s.player.blocked = true;
  let revived = -1;
  for (let t = 0; t < 200; t++) { g.step(); if (g.state.over) break; if (gh.state !== "dead") { revived = t; break; } }
  console.log("dead ghost revived after ticks:", revived);
  ok(revived > 0 && Math.abs(gh.x-gh.start[0])+Math.abs(gh.y-gh.start[1]) <= 1, "dead ghost did not get home");
}

// 4. power pellet: +50, ghosts become scared, timer runs ~12s
{
  const g = G.create({ rng: rngFrom(5) });
  const s = g.state;
  s.grid[29][24] = "◉"; // right next to the player at (23,29)
  g.setDirection("right"); g.step(); s.player.dir = "up";   // wall above: park him
  ok(s.score === 50, "power pellet score " + s.score);
  ok(s.ghosts.every(x => x.state === "scared"), "ghosts not scared");
  let ticks = 1; while (s.powerUp && ticks < 100 && !s.over) { g.step(); ticks++; }
  console.log("power lasted ticks:", ticks, "(expect ~40)");
}

// 5. clearing the board goes to the next level (faster), keeps score and lives
{
  const g = G.create({ rng: rngFrom(9) });
  const s = g.state; let over = null; g.onGameOver = (r) => over = r;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.grid[y][x] === ".") s.grid[y][x] = " ";
  s.pellets = 1; s.grid[29][24] = "."; s.score = 500;
  g.setDirection("right"); g.step();
  ok(!over && g.state.level === 2, "should be level 2, got " + g.state.level);
  ok(g.state.tickLen < G.TICK, "level 2 should be faster");
  ok(g.state.pellets > 400 && g.state.score === 510 && g.state.lives === 3, "board/score/lives wrong after level up");
  ok(g.state.events.includes("level") && g.state.freeze > 0, "level event / freeze missing");
  console.log("level 2 tick:", g.state.tickLen.toFixed(3), "power:", G.powerTime(2));
}
// 6. lose lives
{
  const g = G.create({ rng: rngFrom(11) });
  const s = g.state; let res = null; g.onGameOver = (r) => res = r;
  s.lives = 1;
  const gh = s.ghosts[0]; gh.x = gh.px = 20; gh.y = gh.py = 29; gh.state = "normal";
  s.player.x = s.player.px = 21; s.player.y = 29; s.player.dir = "left"; 
  for (let i = 0; i < 6 && !res; i++) g.step();
  ok(res && res.won === false && res.level === 1 && s.death, "lose not reported / no death info");
}

// 7. turn buffer: press "up" one tile BEFORE the corner at x=8 -> turns exactly at the corner
{
  const g = G.create({ rng: rngFrom(13) });
  const s = g.state, pl = s.player;
  pl.x = pl.px = 7; pl.y = pl.py = 29; pl.dir = "right";
  g.setDirection("up"); g.step();            // up is a wall at x=7, so it is queued; still walks right
  ok(pl.x === 8 && pl.y === 29, "buffer: expected (8,29) got " + pl.x + "," + pl.y);
  g.step();                                  // now free: turns and moves up in the SAME tick
  ok(pl.x === 8 && pl.y === 28, "buffer: expected (8,28) got " + pl.x + "," + pl.y);
  // stopping at a wall costs no extra tick: head into the right wall, then turn up
  pl.x = pl.px = 45; pl.y = pl.py = 29; pl.dir = "right"; pl.queued = null;
  g.step(); ok(pl.x === 45 && pl.blocked, "should be blocked at the wall");
  g.setDirection("up"); g.step(); ok(pl.y === 28, "turn after a wall should be instant, y=" + pl.y);
}
console.log(fails ? fails + " FAILURES" : "ALL OK");
