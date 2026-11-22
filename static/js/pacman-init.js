/*
 * pacman-init.js  -  AI-ASSISTED FILE (CS50x final project)
 * Written with AI assistance (Claude, Anthropic).
 *
 * Glue between the game and the Flask server:
 *   - builds the game inside #pacman-root
 *   - when a game ends, POSTs the score to Flask (logged in) or offers Log in / Register links (guest)
 *   - shows the top 10 (GET) in #pacman-board
 *
 * The routes are Ian's (Flask + SQL). What this file sends and expects:
 *
 *   POST  data-score-url   (default /api/score)
 *     request  JSON  { "score": 1230, "level": 2, "won": true }
 *                    (no "player": the server takes the name and user id from the session)
 *     success  JSON  { "ok": true }              (HTTP 200 or 201; "rank" is shown if present)
 *     failure  JSON  { "error": "message" }      (HTTP 400, 401, 429 ...; message is shown)
 *
 *   GET   data-board-url   (default /api/leaderboard)
 *     response JSON  [ { "player": "Ian", "score": 1230, "level": 2 }, ... ]   best first
 *              ("level" is optional; { "scores": [...] } is accepted too)
 *
 * Changed in login round: guests no longer type a name; only logged-in players save scores.
 * Names come from strangers, so they are put on the page with textContent
 * (never innerHTML): a name like "<script>" is just text.
 */
(function () {
  "use strict";

  const root = document.getElementById("pacman-root");
  if (!root) return;
  const board = document.getElementById("pacman-board");
  const scoreUrl = root.dataset.scoreUrl || "/api/score";
  const boardUrl = root.dataset.boardUrl || "/api/leaderboard";
  const user = root.dataset.user || "";            // the logged-in username ("" for guests)
  const loginUrl = root.dataset.loginUrl || "/login";
  const registerUrl = root.dataset.registerUrl || "/register";

  const game = PacmanGame.create();
  const view = PacmanView.mount(root, game, { onGameOver: onGameOver });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ------------------------------------------------------ leaderboard ----
  function renderBoard(rows, note) {
    if (!board) return;
    board.replaceChildren();
    board.appendChild(el("h3", "pm-board-title", "Leaderboard · top 10"));
    if (note) { board.appendChild(el("p", "pm-board-note", note)); return; }
    if (!rows.length) { board.appendChild(el("p", "pm-board-note", "No scores yet. Be the first.")); return; }
    const list = el("ol", "pm-board-list");
    rows.slice(0, 10).forEach(function (row) {
      const li = el("li");
      li.appendChild(el("span", "pm-b-name", String(row.player)));
      li.appendChild(el("span", "pm-b-level", row.level ? "L" + row.level : ""));
      li.appendChild(el("span", "pm-b-score", String(row.score).padStart(6, "0")));
      list.appendChild(li);
    });
    board.appendChild(list);
  }

  async function loadBoard() {
    try {
      const res = await fetch(boardUrl, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      renderBoard(Array.isArray(data) ? data : (data.scores || []));
    } catch (err) {
      renderBoard([], "Leaderboard not available right now.");
    }
  }

  // -------------------------------------------------------- submitting ----
  async function postScore(payload) {
    const res = await fetch(scoreUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* the server sent no JSON */ }
    if (!res.ok) throw new Error(data.error || "The server said " + res.status);
    return data;
  }

  function onGameOver(result, slot) {
    // result = { won, score, level }
    slot.replaceChildren();
    const msg = el("p", "pm-msg");
    const again = el("button", "pm-btn pm-btn-again", "Play again");
    again.type = "button";
    again.addEventListener("click", function () { view.start(); });

    if (result.score <= 0) { slot.appendChild(again); return; }      // nothing worth saving

    async function send() {
      const payload = { score: result.score, level: result.level, won: result.won };
      msg.textContent = "Saving...";
      try {
        const data = await postScore(payload);
        msg.textContent = data.rank ? "Saved! You are #" + data.rank + "." : "Saved!";
        loadBoard();
        return true;
      } catch (err) {
        msg.textContent = "Could not save: " + err.message;
        return false;
      }
    }

    if (user) {                                   // logged in: no form, save straight away
      slot.appendChild(msg);
      slot.appendChild(again);
      send();
      return;
    }

    // not logged in: scores are saved only for accounts, so offer the login / register links
    msg.textContent = "Log in to save your score to the leaderboard. ";
    const loginLink = el("a", "pm-link", "Log in");
    const back = "?next=" + encodeURIComponent(window.location.pathname);   // come back to this page after logging in
    loginLink.href = loginUrl + back;
    const registerLink = el("a", "pm-link", "Register");
    registerLink.href = registerUrl + back;
    msg.append(loginLink, " or ", registerLink, ".");
    slot.append(msg, again);
  }

  loadBoard();
})();
