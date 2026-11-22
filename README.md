# My Personal Website

#### Video Demo: <URL HERE>

#### Description:

This is my personal portfolio website that I plan to use or at least link to my career CV (though I plan to update it in the future). Not only do I think that this will be a good way to show what I've done and what I can do, but it also provides people an easier sense of getting to know who I am by what I've built.

This project was inspired by several other things, some of them are:

- The fact that I've heard about website portfolios
- Some promotion ads with good styling that make me awe in a split second visually
- Convenience, accessibility, and personality driven
- A project that is not boilerplate nor something that I do not understand (even professional ones)

## What it does

- Four pages: Home, Computer Science, Math & Physics, Piano
- Register, log in, log out
- Interactives: Pac-man, Renderer, Chord Presser
- Database and SQL for leaderboard and account

## Necessary Files

### `static/`

**`css/`**

- `auth.css`: styles login and register
- `pacman-demo.css`: styles the pacman interactive
- `piano-demo.css`: styles the piano interactive
- `renderer-demo.css`: styles the renderer interactive
- `theme.css`: the main site style

**`data/`**

- `models/`: math equations for quick display (also containing voxels information)

**`icons/`**

- `langs/`: icons for my programming languages
- `social/`: icons for my socials

**`image/`**

- posters and pictures that are displayed

**`js/`**

- `auth.js`: handles login and register
- `pacman-game.js`: handles pacman game's rules
- `pacman-init.js`: connects all the pieces and interacts with /api/score
- `pacman-sound.js`: sound effect and the mute button
- `pacman-view.js`: draws the game on the canvas
- `piano-demo.js`: the chord player: the keys, the chord buttons and the sound
- `renderer-demo.js`: the browser version of my 3D renderer (the formula containing voxel building is still in `renderer3d.py`)
- `renderer-extras.js`: additional features I wrote

### `templates/`

- `_components.html`: reusable pieces (macros) like the picture frame, collapsible card and demo slot
- `_site.html`: shared site info, like my links and email, kept in one place
- `cs.html`: one of the four main pages
- `index.html`: one of the four main pages
- `layout.html`: the base page every other page extends (head, navbar with login links, footer)
- `login.html`: authentication page
- `math_physics.html`: one of the four main pages
- `piano.html`: one of the four main pages
- `register.html`: authentication page

### Other files

- `tests/game-test.js`: automated tests for the Pacman game logic
- `app.py`: where URL requests are accepted and interpreted using Flask, which then returns the corresponding HTML
- `PACMAN_API.md`: development note
- `renderer3d.py`: the modified version of my original renderer code to fit in this project
- `requirements.txt`: Python packages needed to run the project
- `.gitignore`: files git should not track (database, caches)

## Design choices

The languages and code used in this project are mainly what I've stumbled upon and learned when doing the CS50x course. It's the biggest tool I have currently as a newbie, and thus I want to integrate something with it as my biggest project yet.

### Why SQLite

Before learning about SQL and databases, I might have saved the data of this website using something like txt, json, or csv. But I think .db and SQL is the most manageable and efficient tool I can find, as it's integrated, structured, and maintained.

### Why passwords are hashed

A hash is almost impossible to revert (except by brute force). It is stored this way as an additional guardrail, in case there are cyber attacks that make my website leak because of SQL injection, POST manipulation, or something else. Hashing prevents immediate leakage from happening.

Salting (adding an additional string to the original password before hashing) also provides another protection, so that the same password can generate different hashes.

### Why `?` placeholders in SQL

It prevents dangerous user input that allows SQL injection to manipulate the .db.

### Why the server checks everything

The browser can lie, especially with a manipulated POST, so adding guardrails is the counteraction for this reason (though mine is not perfect).

### Why Pacman is in JavaScript

It has to run in the visitor's browser. My original idea was to use my .py as the whole engine and connect it to the JS, but I learned that it's a bad idea, since my Python would have to send the "screen" every frame (which may cause a blinking page or add some processing resistance).

### Why login is required to save a score, and why the server takes the name from the session

Login is required to save a score because I want to prevent one user from submitting results as multiple names or imitating another person.

### Why sessions use a signed cookie and a secret key

The secret key is the way for Flask to generate a cryptographic signature for the session cookie. The session cookie stores who is logged in. Flask signs it with a secret key that only the server knows, so a visitor can't edit it to pretend to be someone else. The server takes the name from that signed session, never from the request, so nobody can submit a score under another person's name. The secret key adds an additional guardrail against those who want to impersonate other users.

## How to run it

```bash
pip install -r requirements.txt
flask run
```

## AI use

Claude reviewed my Flask code and pointed out bugs, and in a few places wrote the fix.

- **What tools I used:** Claude, and some online resources
- **What I wrote myself:** Flask, Python, and SQL and the database, with help on extra features and run-test debugging
- **What I did on the AI-written parts:** read, edits (if necessary), testing, debugging, visual checks, and directing the work
- **Where other code came from:** my past projects, and the piano base from an online source
- **How it's marked in the code:** every file Claude wrote or changed starts with a header comment saying so
- **What I understand overall:** website management and integration, multilanguage programming and conditioning, database management, basic cyberattack prevention, how hashing and sessions work, why the server validates input, how a decorator guards a route

#### Website Link: <URL HERE>
