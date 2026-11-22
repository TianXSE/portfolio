/*
 * pacman-sound.js  -  AI-ASSISTED FILE (CS50x final project)
 * Written with AI assistance (Claude, Anthropic).
 *
 * Tiny sound effects made with the browser's Web Audio API: no sound files.
 * Browsers only allow audio after a click or key press, so the sound context
 * is created lazily on the first play() / unlock() call (the game start).
 *
 *   PacmanSound.play("coin" | "power" | "ghost" | "death" | "level")
 *   PacmanSound.setMuted(true/false), PacmanSound.isMuted()
 */
(function (root) {
  "use strict";

  let ctx = null;
  let muted = false;
  let waka = 0;
  try { muted = localStorage.getItem("pm-muted") === "1"; } catch (e) { /* storage blocked: fine */ }

  function ensure() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // one beep: starts at `freq`, slides to `to` (optional), fades out over `dur` seconds
  function tone(c, freq, dur, opts) {
    opts = opts || {};
    const t = c.currentTime + (opts.delay || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = opts.type || "square";
    osc.frequency.setValueAtTime(freq, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const vol = opts.vol || 0.04;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const SOUNDS = {
    coin(c) {                                   // "waka": two alternating blips
      waka++;
      if (waka % 2) tone(c, 520, 0.09, { to: 300 });
      else tone(c, 300, 0.09, { to: 520 });
    },
    power(c) {                                  // rising sweep
      tone(c, 200, 0.35, { to: 900, type: "sawtooth", vol: 0.035 });
    },
    ghost(c) {                                  // quick chirp up
      tone(c, 300, 0.12, { to: 1200 });
      tone(c, 600, 0.12, { to: 1600, delay: 0.1 });
    },
    death(c) {                                  // falling wobble
      for (let i = 0; i < 6; i++) tone(c, 700 - i * 90, 0.16, { to: 420 - i * 55, delay: i * 0.15, type: "triangle", vol: 0.06 });
    },
    level(c) {                                  // little arpeggio
      [392, 494, 587, 784].forEach((f, i) => tone(c, f, 0.14, { delay: i * 0.11, type: "triangle", vol: 0.06 }));
    },
  };

  root.PacmanSound = {
    play(name) {
      if (muted || !SOUNDS[name]) return;
      const c = ensure();
      if (c) SOUNDS[name](c);
    },
    unlock() { ensure(); },
    setMuted(value) {
      muted = !!value;
      try { localStorage.setItem("pm-muted", muted ? "1" : "0"); } catch (e) { /* ignore */ }
    },
    isMuted() { return muted; },
  };
})(window);
