# AI-ASSISTED FILE (CS50x final project): Ian wrote the Flask routes; Claude (Anthropic)
# fixed the /api/score validation and moved the database startup (see comments marked FIX).
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from pathlib import Path
import os
import secrets
import sqlite3
import string
from functools import wraps

from renderer3d import build_model

app = Flask(__name__)
# FIX 2: a real random key. Set SECRET_KEY in your environment to keep logins across restarts;
# without it, a new random key is made every start (everyone is logged out on restart, fine for now).
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"



database = Path(__file__).parent / "database.db"
DB_INIT_COMMAND = """
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE,
    hash       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id),
    player     TEXT NOT NULL,
    level      INTEGER NOT NULL DEFAULT 1,
    score      INTEGER NOT NULL,
    won        INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
"""

# As a single string (fastest for checking membership with 'in')
ALLOWED_CHARS = string.ascii_letters + string.digits + "_-."

def emergency_db_startup():
    db = sqlite3.connect(database)
    db.executescript(DB_INIT_COMMAND)
    db.commit()
    db.close()

# FIX: run the table creation at import time, so it happens with both
# `python app.py` and `flask run` (IF NOT EXISTS makes a second run harmless).
emergency_db_startup()

def get_db():
    conn = sqlite3.connect(database)
    conn.row_factory = sqlite3.Row            # rows behave like dicts
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def log_in(user_id, username):
    session.clear()
    session["user_id"] = user_id
    session["username"] = username
    
# log_in_required("api_score")
# view == api_score
# wrapper replaces all of log_in_required("api_score") (?)

def log_in_required(view):             # 1. receives the real route function
    @wraps(view)
    def wrapper(*args, **kwargs):      # 2. this runs on every request instead of the view
        if not session.get("user_id"):                        #    not logged in? (use session.get)
            return jsonify({"error": "Log in to save your score"}), 401   #    stop here
        return view(*args, **kwargs)   # 3. logged in: run the real view, return ITS result
    return wrapper                     # 4. hand back the guard function

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        # Reject if : no pass or user
        # Reject if : user contains invalid char, user len too long/short, username taken
        # Reject if : password is too short or too long
        # Aditional pass security, reject if : no uppercase found, no number found, no special character, pass == user

        data = request.get_json(silent=True) or {}
        username, password = data.get("username"), data.get("password") 
        
        if not isinstance(username, str) or not isinstance(password, str):
            return jsonify({"error": "Username and Password must be a string type"}), 400
        
        username = username.strip().lower() 
        
        db = get_db()
        username_exist = db.execute("SELECT username FROM users WHERE username = ?", 
                                    (username,)).fetchone()
        db.close()
        
        if not username or not password:
            return jsonify({"error": "Empty username or password"}), 400
        
        
        
        for i in username:
            if i not in ALLOWED_CHARS:
                return jsonify({"error": "Username can only consist of letters, digits, and '_ - .'"}), 400
            
        if not 3 <= len(username) <= 16: 
            return jsonify({"error": "Username can only be 3 to 16 inclusive characters long"}), 400
        
        if username_exist:
            return jsonify({"error": "This username already exist"}), 400
        
        
        
        if not 8 <= len(password) <= 128: 
            return jsonify({"error": "Password can only be 8 to 128 inclusive characters long"}), 400
        
        
        
        # I'm too lazy to look for the ascii range for uppercase chars lol
        if password.lower() == password:
            return jsonify({"error": "Password must have at least an upper case letter"}), 400
        
        digit_found = False
        special_character_found = False
        for i in password:
            if i.isdigit():
                digit_found = True
            if not (i.isdigit() or i.isalpha()):
                special_character_found = True
        
        if not digit_found:
            return jsonify({"error": "Password must have at least a number"}), 400
        
        if not special_character_found:
            return jsonify({"error": "Password must have at least a special character"}), 400
        
        if username == password.lower():
            return jsonify({"error": "Password must not be equal to username"}), 400
        
        
        
        # if all passes
        password_hash = generate_password_hash(password)
        
        db = get_db()
        
        try:
            cursor = db.execute("INSERT INTO users (username, hash) VALUES (?, ?)",
                    (username, password_hash))
            user_id = cursor.lastrowid        # FIX 1: the id comes from the INSERT's cursor
        except sqlite3.IntegrityError:
            db.close()
            return jsonify({"error": "This username already exist"}), 400
        
        db.commit()
        db.close()
        
           
        log_in(user_id, username)
        
        return jsonify({"ok": True}), 201
    
    return render_template("register.html")
    
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        username, password = data.get("username"), data.get("password") 
        
        if not isinstance(username, str) or not isinstance(password, str):
            return jsonify({"error": "Username and Password must be a string type"}), 400
        
        username = username.strip().lower()
        
        db = get_db()
        row = db.execute("SELECT id, hash FROM users WHERE username = ?", 
                            (username,)).fetchone()
        db.close()
        
        if row is None:
            return jsonify({"error": "Incorrect Username or Password"}), 401
            
        database_hash = row["hash"]
        user_id = row["id"]
        
        if not check_password_hash(database_hash, password):
            return jsonify({"error": "Incorrect Username or Password"}), 401
        
        log_in(user_id, username)
        
        return jsonify({"ok": True}), 200
    
    return render_template("login.html")
    
@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/cs")
def cs():
    return render_template("cs.html")

@app.route("/math-physics")
def math_physics():
    return render_template("math_physics.html")

@app.route("/piano")
def piano():
    return render_template("piano.html")

@app.route("/api/model", methods=["POST"])
def api_model():
    data = request.get_json(silent=True) or {}
    formula = str(data.get("formula", "")).strip()

    if not formula or len(formula) > 200:
        return jsonify({"error": "Please enter a formula (max 200 characters)."}), 400

    try:
        result = build_model(formula)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    return jsonify(result)

@app.route("/api/score", methods=["POST"])
@log_in_required
def api_score():
    data = request.get_json(silent=True) or {}

    # FIX: a JSON list/number would crash data.get() with a 500
    if not isinstance(data, dict):
        return jsonify({"error": "Expected a JSON object"}), 400

    user_id = session["user_id"] 
    user_name = session["username"]
    score, level, won = data.get("score"), data.get("level"), data.get("won")


    # FIX: the range check was inverted; bool is also rejected (True counts as an int in Python)
    if not isinstance(level, int) or isinstance(level, bool) or not (1 <= level <= 99):
        return jsonify({"error": "Level Error"}), 400

    if (not isinstance(score, int) or isinstance(score, bool)
            or score > 30000 * level or score < 0 or score % 10 != 0):
        return jsonify({"error": "Score Error"}), 400

    if not isinstance(won, bool):
        return jsonify({"error": "Completion Error"}), 400

    # FIX: removed the "for i in [...] is None" loop: the checks above already cover it

    db = get_db()
    cursor = db.cursor()

    cursor.execute("INSERT INTO scores (user_id, player, level, score, won) VALUES (?, ?, ?, ?, ?)",
                    (user_id, user_name, level, score, int(won)))

    db.commit()
    db.close()

    return jsonify({"ok": True}), 201

@app.route("/api/leaderboard", methods=["GET"])
def api_leaderboard():
    db = get_db()

    rows = db.execute("SELECT player, level, score, won FROM scores ORDER BY score DESC, created_at ASC LIMIT 10").fetchall()

    db.close()

    leaderboard_dict = [dict(r) for r in rows]

    return jsonify(leaderboard_dict)



# FIX: the server must actually start when you run `python app.py`
if __name__ == "__main__":
    app.run(debug=False)


# C:\sqlite\sqlite3.exe database.db