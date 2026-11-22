/*
  CS50x final project - Math & Physics page demo: 3D renderer (browser side).

  AI-ASSISTED FILE: written by Claude (Anthropic).
  This is a JavaScript PORT of the drawing half of Ian's Python renderer (display_1):
  the same rotation about the (1,1,1) diagonal (rotate_diagonal), the same 60 x 30
  character grid, CD = 2.47 cell correction, depth test, back-face rule for closed
  shapes, light vector (0, 1, -1) and the same 10 brightness characters.
  The MODEL itself (the surface points) is built by Ian's Python (renderer3d.py,
  served by the Flask route /api/model) or loaded from a pre-built example file.

  Two modes: flat (display_1) and donut (display_2: glaze, bread and sprinkles in colour).
  The donut set-up (which side is glazed, where the sprinkles go) is a port of the first
  part of display_2, sprinkle_settings() and add_sprinkles(); it runs here in the browser
  on the same list of surface points, so no server change is needed.
*/
(function () {
"use strict";

// ---------- settings (same numbers as Ian's Python) ----------
const CD = 2.47;                       // terminal cell correction
const W = 60, H = 30;                  // screen_width, screen_height
const CX = (W - 1) / 2, CY = (H - 1) / 2;
const ASCII = "-~:;=!*#$@";            // brightness 1..10
const LIGHT_Y = 1 / Math.SQRT2, LIGHT_Z = -1 / Math.SQRT2;
const TWO_PI = 2 * Math.PI;

// donut mode (same numbers as Ian's Python)
const SAMPLE_STEP = 0.33;
const SURFACE_TOLERANCE = 0.75 * SAMPLE_STEP;
const MIN_LENGTH = 2;                                  // thinnest direction must be at least this long
const SPRINKLE_SIZE_RATIO = 0.022;
const MIN_SPRINKLE_RADIUS = 0.45;
const SPRINKLE_LENGTH_RATIO = 1.8;
const SPRINKLE_GAP_RATIO = 4.9;
const SPRINKLE_COVERAGE = 0.22;
const SPRINKLE_COLORS = [196, 46, 33];                 // terminal colour codes: red, green, blue
const BREAD_PALETTE = [94, 130, 166, 172, 208, 208, 214, 220, 226, 227];   // brightness 1..10
const GLAZE_PALETTE = [125, 162, 168, 169, 205, 206, 211, 212, 212, 218];

// Python's round() rounds halves to the nearest EVEN number; Math.round does not.
function pyRound(x) {
    const f = Math.floor(x);
    const diff = x - f;
    if (diff < 0.5) return f;
    if (diff > 0.5) return f + 1;
    return f % 2 === 0 ? f : f + 1;
}

// ---------- terminal colour codes -> web colours ----------
function ansi256ToHex(code) {
    let r, g, b;
    if (code >= 232) {                                 // grey ramp
        r = g = b = 8 + (code - 232) * 10;
    } else if (code >= 16) {                           // 6 x 6 x 6 colour cube
        const levels = [0, 95, 135, 175, 215, 255];
        const n = code - 16;
        r = levels[Math.floor(n / 36)];
        g = levels[Math.floor(n / 6) % 6];
        b = levels[n % 6];
    } else {
        r = g = b = 170;                               // the 16 basic colours are not used here
    }
    const hex = v => v.toString(16).padStart(2, "0");
    return "#" + hex(r) + hex(g) + hex(b);
}

// ---------- donut set-up (port of the start of display_2) ----------
// Marks every surface point as glaze or bread, then adds sprinkles. Returns {ok, reason}.
function prepareDonut(model, rand) {
    const data = model.data, n = model.n;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) {
            const v = data[i * 6 + k];
            if (v < min[k]) min[k] = v;
            if (v > max[k]) max[k] = v;
        }
    }
    const len = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

    // the glaze/bread split cuts across the thinnest direction (ties: x, then y, then z)
    let axis;
    if (len[0] <= len[1] && len[0] <= len[2]) axis = 0;
    else if (len[1] <= len[0] && len[1] <= len[2]) axis = 1;
    else axis = 2;
    if (len[axis] < MIN_LENGTH) {
        return { ok: false, reason: "thin" };
    }

    model.splitAxis = axis;
    model.splitCoordinate = (min[axis] + max[axis]) / 2;
    model.modelSize = Math.max(len[0], len[1], len[2]);
    model.glaze = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        model.glaze[i] = data[i * 6 + axis] > model.splitCoordinate ? 1 : 0;
    }
    addSprinkles(model, rand);
    model.donutReady = true;
    return { ok: true };
}

function sprinkleSettings(model) {
    const radius = Math.max(MIN_SPRINKLE_RADIUS, SPRINKLE_SIZE_RATIO * model.modelSize);
    const halfLen = SPRINKLE_LENGTH_RATIO * radius;
    const minGap = SPRINKLE_GAP_RATIO * radius;
    let glazeDots = 0;
    for (let i = 0; i < model.n; i++) glazeDots += model.glaze[i];
    const glazeArea = glazeDots * Math.pow(SAMPLE_STEP, 3) / (2 * SURFACE_TOLERANCE);
    const sprinkleArea = (2 * halfLen) * (2 * radius) + Math.PI * radius * radius;
    const count = pyRound(SPRINKLE_COVERAGE * glazeArea / sprinkleArea);
    return { radius, halfLen, minGap, count };
}

// Port of add_sprinkles(): pick well-spaced spots on the glaze, give each a direction along
// the surface, then colour every glaze point that falls inside a sprinkle (a rounded stick).
// rand is Math.random in the page; a test can pass its own.
function addSprinkles(model, rand) {
    const data = model.data, n = model.n, axis = model.splitAxis;
    const { radius, halfLen, minGap, count } = sprinkleSettings(model);
    model.sprinkle = new Int16Array(n);                // 0 = no sprinkle, otherwise a colour code
    model.sprinkleList = [];

    const candidates = [];
    for (let i = 0; i < n; i++) {
        if (data[i * 6 + axis] > model.splitCoordinate + 2 * radius) candidates.push(i);
    }
    if (candidates.length === 0) return;

    const sprinkles = model.sprinkleList;              // [cx, cy, cz, dx, dy, dz, colour]
    for (let attempt = 0; attempt < count * 50; attempt++) {
        if (sprinkles.length === count) break;
        const o = candidates[Math.floor(rand() * candidates.length)] * 6;
        const cx = data[o], cy = data[o + 1], cz = data[o + 2];
        let tooClose = false;
        for (const s of sprinkles) {
            const dx = cx - s[0], dy = cy - s[1], dz = cz - s[2];
            if (dx * dx + dy * dy + dz * dz < minGap * minGap) { tooClose = true; break; }
        }
        if (tooClose) continue;

        // a random direction lying along the surface (remove the part along the normal)
        const nx = data[o + 3], ny = data[o + 4], nz = data[o + 5];
        let dx, dy, dz, length;
        do {
            dx = rand() * 2 - 1; dy = rand() * 2 - 1; dz = rand() * 2 - 1;
            const dot = dx * nx + dy * ny + dz * nz;
            dx -= dot * nx; dy -= dot * ny; dz -= dot * nz;
            length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        } while (length <= 0.2);
        sprinkles.push([cx, cy, cz, dx / length, dy / length, dz / length,
                        SPRINKLE_COLORS[Math.floor(rand() * SPRINKLE_COLORS.length)]]);
    }

    paintSprinkles(model, radius, halfLen);
}

function paintSprinkles(model, radius, halfLen) {
    const data = model.data, sprinkles = model.sprinkleList;
    for (let i = 0; i < model.n; i++) {
        if (!model.glaze[i]) continue;                 // bread: no sprinkles
        const o = i * 6;
        for (const [sx, sy, sz, dx, dy, dz, colour] of sprinkles) {
            const px = data[o] - sx, py = data[o + 1] - sy, pz = data[o + 2] - sz;
            const t = Math.max(-halfLen, Math.min(halfLen, px * dx + py * dy + pz * dz));
            const ex = px - t * dx, ey = py - t * dy, ez = pz - t * dz;
            if (ex * ex + ey * ey + ez * ez <= radius * radius) {
                model.sprinkle[i] = colour;
                break;
            }
        }
    }
}

// ---------- the drawing maths (port of display_1 and display_2) ----------
const depthBuf = new Float64Array(W * H);
const cellChar = new Array(W * H).fill(" ");
const cellColor = new Int16Array(W * H);

// model = { data: Float64Array [x,y,z,nx,ny,nz, ...], n, closed } (+ glaze/sprinkle for donut)
// donut = true draws glaze, bread and sprinkles in colour (needs prepareDonut first).
// Returns { rows: [30 strings], colors: Int16Array(60*30) or null (0 = no colour) }.
function renderFrame(model, theta, donut) {
    depthBuf.fill(Infinity);
    cellChar.fill(" ");
    if (donut) cellColor.fill(0);

    const c = Math.cos(theta), s = Math.sin(theta), q = Math.sqrt(3);
    // rotate_diagonal as three numbers: xr = a*x + b*y + d*z, and so on
    const a = (1 + 2 * c) / 3;
    const b = (1 - c - q * s) / 3;
    const d = (1 - c + q * s) / 3;

    const data = model.data, n = model.n, closed = model.closed;

    for (let i = 0; i < n; i++) {
        const o = i * 6;
        const x = data[o], y = data[o + 1], z = data[o + 2];

        const rx = a * x + b * y + d * z;
        const ry = d * x + a * y + b * z;
        const rz = b * x + d * y + a * z;

        const sx = pyRound(rx * CD + CX);
        const sy = pyRound(-ry + CY);
        if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;

        const cell = sy * W + sx;
        if (rz >= depthBuf[cell]) continue;          // something nearer is already here
        depthBuf[cell] = rz;

        const nx = data[o + 3], ny = data[o + 4], nz = data[o + 5];
        let rny = d * nx + a * ny + b * nz;
        let rnz = b * nx + d * ny + a * nz;

        if (rnz > 0) {
            if (closed) continue;                    // back of a closed shape: never visible
            rny = -rny; rnz = -rnz;                  // open shape: show the side facing us
        }

        let brightness = rny * LIGHT_Y + rnz * LIGHT_Z;
        brightness = Math.max(0, Math.min(1, brightness));
        const index = pyRound(1 + (ASCII.length - 1) * brightness);     // 1..10

        if (!donut) {
            cellChar[cell] = ASCII[index - 1];
        } else if (model.sprinkle[i]) {
            cellColor[cell] = model.sprinkle[i];
            cellChar[cell] = "#$@"[Math.floor(((index - 1) * 3) / 10)];
        } else if (model.glaze[i]) {
            cellColor[cell] = GLAZE_PALETTE[index - 1];
            cellChar[cell] = ASCII[index - 1];
        } else {
            cellColor[cell] = BREAD_PALETTE[index - 1];
            cellChar[cell] = ASCII[index - 1];
        }
    }

    const rows = [];
    for (let r = 0; r < H; r++) rows.push(cellChar.slice(r * W, (r + 1) * W).join(""));
    return { rows, colors: donut ? cellColor : null };
}

// Lets a test (Node.js) use the maths without the page.
if (typeof module !== "undefined" && module.exports) {
    module.exports = { renderFrame, pyRound, prepareDonut, addSprinkles, paintSprinkles,
                       sprinkleSettings, ansi256ToHex, W, H };
    return;
}

// ====================== PAGE (browser only) ======================
const root = document.querySelector("#renderer");
if (!root) return;

const form = root.querySelector("#rd-form");
const formulaInput = root.querySelector("#rd-formula");
const renderButton = root.querySelector("#rd-render");
const speedInput = root.querySelector("#rd-speed");
const speedOut = root.querySelector("#rd-speed-out");
const pauseButton = root.querySelector("#rd-pause");
const statusEl = root.querySelector("#rd-status");
const displayEl = root.querySelector(".rd-display");
const canvas = root.querySelector("#rd-canvas");
const ctx = canvas.getContext("2d");
const exampleButtons = [...root.querySelectorAll(".rd-example")];
const modeRadios = [...root.querySelectorAll('input[name="rd-mode"]')];
const resprinkleButton = root.querySelector("#rd-resprinkle");

const FRAME_MS = 33;                                   // about 30 frames per second
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let model = null;
let theta = 0;
let speed = Number(speedInput.value);
let paused = reducedMotion;
let mode = "flat";                                      // "flat" or "donut"
let visible = true;
let needsDraw = true;
let last = performance.now();
let currentRequest = null;                             // AbortController of the running request
let timerId = null;

// formula (no spaces, lower case) -> pre-built example file
const normalize = text => text.toLowerCase().replace(/\s+/g, "");
const exampleFiles = new Map(
    exampleButtons.map(btn => [normalize(btn.dataset.formula), btn.dataset.file])
);

// ---------- status line ----------
function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.classList.toggle("is-error", kind === "error");
}

// ---------- canvas size and drawing ----------
let cellH = 18, fontSizePx = 15, glyphScaleX = 1, dpr = 1;
const FONT_FAMILY = '"Cascadia Mono", Consolas, "Liberation Mono", Menlo, monospace';

function layoutCanvas() {
    const available = Math.max(180, displayEl.clientWidth);
    const cssWidth = Math.min(available, 440);
    const cellW = cssWidth / W;
    cellH = CD * cellW;
    const cssHeight = H * cellH;

    dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    fontSizePx = cellH * 0.82;
    ctx.font = fontSizePx + "px " + FONT_FAMILY;
    const advance = ctx.measureText("M").width;
    glyphScaleX = cellW / advance;                     // squeeze glyphs so a character is cellW wide
    needsDraw = true;
}

const colourCache = new Map();
function cssColour(code) {
    if (!colourCache.has(code)) colourCache.set(code, ansi256ToHex(code));
    return colourCache.get(code);
}

function draw() {
    if (!model) return;
    const donut = mode === "donut" && model.donutReady;
    const frame = renderFrame(model, theta, donut);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * glyphScaleX, 0, 0, dpr, 0, 0);
    ctx.font = fontSizePx + "px " + FONT_FAMILY;
    ctx.textBaseline = "middle";

    if (!donut) {
        ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--accent-text").trim() || "#e8e8e8";
        for (let r = 0; r < H; r++) ctx.fillText(frame.rows[r], 0, (r + 0.5) * cellH);
        return;
    }

    // donut: draw each row as runs of characters that share one colour
    const advance = ctx.measureText("M").width;
    for (let r = 0; r < H; r++) {
        const row = frame.rows[r];
        let col = 0;
        while (col < W) {
            const colour = frame.colors[r * W + col];
            if (colour === 0) { col++; continue; }       // empty cell
            let end = col + 1;
            while (end < W && frame.colors[r * W + end] === colour) end++;
            ctx.fillStyle = cssColour(colour);
            ctx.fillText(row.slice(col, end), col * advance, (r + 0.5) * cellH);
            col = end;
        }
    }
}

// ---------- animation loop ----------
function tick(now) {
    requestAnimationFrame(tick);
    if (!model || !visible || document.hidden) { last = now; return; }
    const elapsed = now - last;
    if (elapsed < FRAME_MS && !needsDraw) return;
    last = now;
    if (!paused) {
        const dt = Math.min(elapsed, 100) / 1000;
        theta = (((theta + speed * dt) % TWO_PI) + TWO_PI) % TWO_PI;
        needsDraw = true;
    }
    if (needsDraw) { draw(); needsDraw = false; }
}

// ---------- getting a model ----------
function modelFromApi(json) {                          // rows: [x, y, z, nx, ny, nz, flag, flag]
    const rows = json.voxels;
    const data = new Float64Array(rows.length * 6);
    for (let i = 0; i < rows.length; i++) {
        for (let k = 0; k < 6; k++) data[i * 6 + k] = rows[i][k];
    }
    return { data, n: rows.length, closed: !!json.closed };
}

function modelFromFile(json) {                         // flat list, 6 numbers per point
    return { data: Float64Array.from(json.data), n: json.n, closed: !!json.closed };
}

function startBuilding() {
    renderButton.disabled = true;
    const started = Date.now();
    clearInterval(timerId);
    timerId = setInterval(() => {
        const seconds = Math.round((Date.now() - started) / 1000);
        setStatus(`Building the model on the server... ${seconds} s (heavy equations can take up to 20 s)`);
    }, 1000);
    setStatus("Building the model on the server... (can take 5 to 20 seconds)");
}

function stopBuilding() {
    clearInterval(timerId);
    renderButton.disabled = false;
}

function showModel(newModel, message) {
    model = newModel;
    needsDraw = true;
    setStatus(message);
    applyMode();                                       // donut mode needs set-up for each new model
}

// Called when the mode changes or a new model arrives.
function applyMode() {
    if (mode === "donut" && model && !model.donutReady) {
        const result = prepareDonut(model, Math.random);
        if (!result.ok) {
            mode = "flat";
            modeRadios.forEach(radio => { radio.checked = radio.value === "flat"; });
            setStatus("Donut mode needs a shape at least 2 units thick in its thinnest direction. "
                      + "This one is too thin, so the flat style is shown.", "error");
        }
    }
    resprinkleButton.hidden = mode !== "donut";
    needsDraw = true;
}

async function loadExample(url, label) {
    if (currentRequest) currentRequest.abort();
    const controller = new AbortController();
    currentRequest = controller;
    stopBuilding();
    setStatus("Loading example...");
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("not found");
        const loaded = modelFromFile(await response.json());
        showModel(loaded, `${label}: ${loaded.n.toLocaleString()} surface points.`);
    } catch (error) {
        if (error.name === "AbortError") return;
        setStatus("Could not load that example file.", "error");
    }
}

async function buildFromServer(formula) {
    if (currentRequest) currentRequest.abort();
    const controller = new AbortController();
    currentRequest = controller;
    const giveUp = setTimeout(() => controller.abort(), 60000);
    startBuilding();
    try {
        const response = await fetch("/api/model", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ formula }),
            signal: controller.signal
        });
        let json = null;
        try { json = await response.json(); } catch (parseError) { /* not JSON */ }
        if (!response.ok || !json || json.error) {
            setStatus((json && json.error) || "The server could not build that model.", "error");
            return;
        }
        const built = modelFromApi(json);
        showModel(built, `Model ready: ${built.n.toLocaleString()} surface points.`);
    } catch (error) {
        if (error.name === "AbortError") {
            if (currentRequest === controller) setStatus("Stopped waiting for the server.", "error");
            return;
        }
        setStatus("Could not reach the server. Is Flask running?", "error");
    } finally {
        clearTimeout(giveUp);
        if (currentRequest === controller) { stopBuilding(); currentRequest = null; }
    }
}

function submitFormula(formula) {
    const text = formula.trim();
    if (!text) { setStatus("Please type an equation first.", "error"); return; }
    const file = exampleFiles.get(normalize(text));
    if (file) loadExample(file, "Example");              // pre-built: instant
    else buildFromServer(text);
}

// ---------- controls ----------
form.addEventListener("submit", event => {
    event.preventDefault();
    submitFormula(formulaInput.value);
});

for (const button of exampleButtons) {
    button.addEventListener("click", () => {
        formulaInput.value = button.dataset.formula;
        loadExample(button.dataset.file, button.textContent.trim());
    });
}

for (const radio of modeRadios) {
    radio.addEventListener("change", () => {
        if (!radio.checked) return;
        mode = radio.value;
        applyMode();
    });
}

resprinkleButton.addEventListener("click", () => {
    if (model && model.donutReady) {
        addSprinkles(model, Math.random);
        needsDraw = true;
    }
});

speedInput.addEventListener("input", () => {
    speed = Number(speedInput.value);
    speedOut.textContent = speed.toFixed(1);
});

pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.textContent = paused ? "Play" : "Pause";
    pauseButton.setAttribute("aria-pressed", String(paused));
});

new ResizeObserver(layoutCanvas).observe(displayEl);
new IntersectionObserver(entries => { visible = entries[0].isIntersecting; })
    .observe(canvas);

// ---------- start ----------
pauseButton.textContent = paused ? "Play" : "Pause";
layoutCanvas();
requestAnimationFrame(tick);
if (exampleButtons.length) {
    formulaInput.value = exampleButtons[0].dataset.formula;
    loadExample(exampleButtons[0].dataset.file, exampleButtons[0].textContent.trim());
}

})();
