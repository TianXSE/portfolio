<!-- AI-assisted file (CS50x final project): the contract between pacman-init.js (browser) and Ian's Flask routes. -->
# Pacman leaderboard: what the browser sends and expects

The JavaScript is finished. Your Flask routes only have to match this.

## POST /api/score  (browser -> Flask)

Request body (`Content-Type: application/json`):

```json
{ "player": "Ian", "score": 1230, "level": 2, "won": true }
```

| field    | type    | meaning                                              | check on the server                         |
|----------|---------|------------------------------------------------------|---------------------------------------------|
| `player` | string  | name typed in the box (left OUT once login exists)   | strip spaces, 1 to 16 characters            |
| `score`  | integer | final score                                          | whole number, `0 <= score <= 30000 * level` |
| `level`  | integer | level reached (starts at 1)                          | whole number, 1 to 99                       |
| `won`    | boolean | true if at least one board was fully cleared         | any bool (store as 1 / 0)                   |

The score cap is only a sanity check: the browser can lie, so a leaderboard here is casual.

Values for the INSERT, after validating (this is what goes in `execute`):

```python
data = request.get_json(silent=True) or {}
player = str(data.get("player", "")).strip()
score, level, won = data.get("score"), data.get("level"), data.get("won")
# ... validate (return jsonify(error="...") , 400 on bad input) ...
(player, score, level, int(bool(won)))      # -> INSERT INTO scores (player, score, level, won) VALUES (?, ?, ?, ?)
```

Responses (always JSON):

* success: status 201 (or 200) and `{"ok": true}`. Optional `"rank": 2` is shown as "You are #2".
* failure: status 400 (bad input), 401 (not logged in, later), 429 (too many) and `{"error": "name required"}`.
  The `error` text is shown to the player.

## GET /api/leaderboard  (browser <- Flask)

A JSON list, best score first, at most 10 rows:

```json
[ { "player": "ada", "score": 5400, "level": 3 },
  { "player": "Ian", "score": 1230, "level": 2 } ]
```

(`level` is optional. `{ "scores": [...] }` is accepted too.) A database row becomes a dict with
`[dict(row) for row in rows]` if you use `conn.row_factory = sqlite3.Row`, then `jsonify(...)`.

```sql
SELECT player, score, level FROM scores ORDER BY score DESC, created_at ASC LIMIT 10;
```

## One schema change: the `level` column

Your table was made without it. Add it with this (put it in `schema.sql` too, and for a fresh
database just add the line to the CREATE TABLE):

```sql
ALTER TABLE scores ADD COLUMN level INTEGER NOT NULL DEFAULT 1;
```

If you re-run `init_db.py` on an existing database the ALTER fails with "duplicate column" once the
column exists. That is fine: run it once in a one-off script, not inside `schema.sql`.

## Later: login

When a user is logged in, put the username into `cs.html`:

```html
<div id="pacman-root" data-user="{{ session.get('username', '') }}" ...>
```

Then the browser stops asking for a name and omits `player`; the route reads the name (and
`user_id`) from `session` instead, and a `login_required` decorator that returns
`jsonify(error="log in to save scores"), 401` protects it.

## Test the routes without the game (PowerShell)

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:5000/api/score -Method Post -ContentType "application/json" -Body '{"player":"Ian","score":1230,"level":2,"won":true}'
Invoke-RestMethod http://127.0.0.1:5000/api/leaderboard
```
