/*
  AI-ASSISTED FILE (CS50x final project): written by Claude (Anthropic).
  Page script for Log in and Register. What it does, in plain words:
    1. When you press the button, stop the normal form submit (the browser would reload the page).
    2. Send {"username": ..., "password": ...} as JSON to the route in data-endpoint (POST).
    3. If the server answers OK (200 or 201), go to the page in data-next (the home page),
       or to the page named in the address (?next=/cs), which is how the Pacman "Log in" link
       sends you back to the game. Only paths on this site are accepted (see safeNext).
       Otherwise show the server's {"error": "..."} text in the red box.
  The browser checks here are only HINTS for the user. Ian's Flask route checks everything again,
  because anyone can skip this script and send their own request.

  The same file serves both pages: the Register page also has the live password checklist.
*/
(function () {
"use strict";

const form = document.querySelector("#auth-form");
if (!form) return;

const endpoint = form.dataset.endpoint;
// ?next=/cs in the address means "after logging in, go back there".
// Only a path on THIS site is accepted: it must start with one "/" (not "//" or "/\\"),
// otherwise a crafted link could send people to another website after login.
function safeNext(value, fallback) {
    if (typeof value === "string" && /^\/(?![\/\\])/.test(value)) return value;
    return fallback;
}
const nextUrl = safeNext(new URLSearchParams(window.location.search).get("next"), form.dataset.next || "/");
const userInput = form.querySelector("#auth-username");
const passInput = form.querySelector("#auth-password");
const confirmInput = form.querySelector("#auth-confirm");          // Register page only
const showBox = form.querySelector("#auth-show");
const errorEl = document.querySelector("#auth-error");
const button = form.querySelector("button[type=submit]");
const rules = [...document.querySelectorAll("#pw-rules li")];      // Register page only

function showError(text) {
    errorEl.textContent = text;          // textContent, never innerHTML: the text is shown as plain text
    errorEl.hidden = false;
}

// the Log in <-> Register link keeps ?next=... so the choice survives switching pages
for (const link of document.querySelectorAll(".auth-switch-link")) {
    link.search = window.location.search;
}

// --- show / hide password ---
if (showBox) {
    showBox.addEventListener("change", () => {
        const type = showBox.checked ? "text" : "password";
        passInput.type = type;
        if (confirmInput) confirmInput.type = type;
    });
}

// --- live checklist (Register only) ---
const checks = {
    length:  (p) => p.length >= 8 && p.length <= 128,
    upper:   (p) => /[A-Z]/.test(p),
    digit:   (p) => /[0-9]/.test(p),
    special: (p) => /[^A-Za-z0-9]/.test(p),
    differs: (p, u) => p !== "" && p.toLowerCase() !== u.trim().toLowerCase(),
};
function updateRules() {
    for (const li of rules) {
        li.classList.toggle("ok", checks[li.dataset.rule](passInput.value, userInput.value));
    }
}
if (rules.length) {
    passInput.addEventListener("input", updateRules);
    userInput.addEventListener("input", updateRules);
    updateRules();
}

// --- submit ---
form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    if (confirmInput && passInput.value !== confirmInput.value) {
        showError("The two passwords are not the same.");
        confirmInput.focus();
        return;
    }

    button.disabled = true;
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ username: userInput.value, password: passInput.value }),
        });
        let data = {};
        try { data = await response.json(); } catch (e) { /* the server sent no JSON */ }

        if (response.ok) {
            window.location.assign(nextUrl);
            return;                      // leave the button disabled while the page changes
        }
        showError(data.error || "Something went wrong (code " + response.status + "). Please try again.");
    } catch (e) {
        showError("Could not reach the server. Check your connection and try again.");
    }
    button.disabled = false;
});
})();
