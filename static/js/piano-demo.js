/*
  CS50x final project - piano page demo: chord player.

  ORIGINAL: the base piano (keys, single-note click logic and the HTML/CSS it runs on) came from an
    AI search summary that quoted a website. Ian studied
    that code to understand it, then wrote the chord buttons and chord logic himself on top of it.
    CLAUDE'S CHANGES: wrapped it in an IIFE, renamed the element ids, added statusEl, and added blur handling.
  
    AI-ASSISTED CHANGES (Claude, Anthropic), nothing else touched:
    1. Whole file wrapped in an IIFE (a function that runs immediately), so its
       variable names cannot clash with other scripts on the site.
    2. Looks up its elements inside #chord-player using the ids
       #cp-keyboard, #cp-status, #cp-major, #cp-minor (renamed from
       #keyboard, #status, #major-chords, #minor-chords). If #chord-player
       is missing the script stops quietly.
    3. Variable "status" renamed to "statusEl" (window.status already exists).
    4. On window blur, chord buttons also lose their "active" look.
*/
(function () {
"use strict";

const root = document.querySelector("#chord-player");
if (!root) return;   // not on this page

const keyboard = root.querySelector("#cp-keyboard");
const statusEl = root.querySelector("#cp-status");

// -------------------- NOTE CONFIGURATION --------------------

const noteNames = [
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B"
];

const blackNotes = new Set([
    "C#", "D#", "F#", "G#", "A#"
]);

const notes = [];

// Generate C4 to B5
for (let octave = 4; octave <= 5; octave++) {

    for (let i = 0; i < noteNames.length; i++) {

        const noteName = noteNames[i];

        notes.push({
            name: `${noteName}${octave}`,
            midi: 60 + (octave - 4) * 12 + i,
            black: blackNotes.has(noteName),
            element: null
        });

    }

}

// Add final C6
notes.push({
    name: "C6",
    midi: 84,
    black: false,
    element: null
});


// -------------------- AUDIO CONFIGURATION --------------------

const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

let audioContext = null;

// Store currently playing notes and chords
const activeNotes = new Map();
const activeChords = new Map();


function getAudioContext() {

    if (!AudioContextClass) {
        throw new Error("Web Audio API is unavailable.");
    }

    if (!audioContext) {
        audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
        audioContext.resume();
    }

    return audioContext;

}


// -------------------- WHITE KEY GENERATION --------------------

const whiteKeys = notes.filter(note => !note.black);

for (const note of whiteKeys) {

    const key = document.createElement("button");

    key.type = "button";
    key.classList.add("white-key");

    key.dataset.note = note.name;

    const label = document.createElement("span");

    label.className = "note-label";
    label.textContent = note.name;

    key.appendChild(label);

    keyboard.appendChild(key);

    note.element = key;

    setupPointerEvents(
        key,
        () => playNote(note, key),
        () => stopNote(note, key)
    );

}


// -------------------- BLACK KEY GENERATION --------------------

for (let i = 0; i < notes.length; i++) {

    const note = notes[i];

    if (!note.black) {
        continue;
    }

    const key = document.createElement("button");

    key.type = "button";
    key.classList.add("black-key");

    key.dataset.note = note.name;

    const label = document.createElement("span");

    label.className = "note-label";
    label.textContent = note.name;

    key.appendChild(label);

    // Count the white keys preceding this black key
    const whiteBefore = notes
        .slice(0, i)
        .filter(n => !n.black)
        .length;

    // Position the black key between two white keys
    const position =
        (whiteBefore / whiteKeys.length) * 100;

    key.style.left = `${position}%`;

    keyboard.appendChild(key);

    note.element = key;

    setupPointerEvents(
        key,
        () => playNote(note, key),
        () => stopNote(note, key)
    );

}


// -------------------- POINTER INTERACTION --------------------

function setupPointerEvents(element, onPress, onRelease) {

    element.addEventListener("pointerdown", event => {

        event.preventDefault();

        element.setPointerCapture(event.pointerId);

        onPress();

    });

    const release = () => onRelease();

    element.addEventListener("pointerup", release);
    element.addEventListener("pointercancel", release);
    element.addEventListener("lostpointercapture", release);

}


// -------------------- PLAY NOTE --------------------

function playNote(note, owner) {

    const existingVoice = activeNotes.get(note.name);

    // If this note is already playing, register another owner.
    if (existingVoice) {

        existingVoice.owners.add(owner);

        return;
    }

    const context = getAudioContext();

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    const frequency =
        440 * Math.pow(2, (note.midi - 69) / 12);

    oscillator.type = "triangle";

    oscillator.frequency.setValueAtTime(
        frequency,
        context.currentTime
    );

    // Attack envelope
    gain.gain.setValueAtTime(
        0.0001,
        context.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
        0.12,
        context.currentTime + 0.02
    );

    // Connect audio nodes
    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();

    // Store the active note and its owner
    activeNotes.set(note.name, {
        oscillator: oscillator,
        gain: gain,
        owners: new Set([owner])
    });

    note.element.classList.add("active");

    updateStatus();

}


// -------------------- STOP NOTE --------------------

function stopNote(note, owner) {

    const voice = activeNotes.get(note.name);

    if (!voice || !voice.owners.delete(owner)) {
        return;
    }

    // Other interactions still need this note.
    if (voice.owners.size > 0) {
        return;
    }

    const now = audioContext.currentTime;

    // Release envelope
    voice.gain.gain.cancelScheduledValues(now);

    voice.gain.gain.setTargetAtTime(
        0.0001,
        now,
        0.05
    );

    voice.oscillator.stop(now + 0.2);

    activeNotes.delete(note.name);

    note.element.classList.remove("active");

    updateStatus();

}


// -------------------- STATUS DISPLAY --------------------

function updateStatus() {

    if (activeNotes.size === 0) {

        statusEl.textContent = "READY";

    } else {

        const playing = [...activeNotes.keys()].join(" · ");

        statusEl.textContent = playing;

    }

}


// -------------------- EMERGENCY RELEASE --------------------

window.addEventListener("blur", () => {

    for (const note of notes) {

        const voice = activeNotes.get(note.name);

        if (!voice) {
            continue;
        }

        for (const owner of [...voice.owners]) {

            stopNote(note, owner);

        }

    }

    // (changed) also remove the pressed look from chord buttons before forgetting them
    for (const chordButton of activeChords.keys()) {
        chordButton.classList.remove("active");
    }

    activeChords.clear();

});



// -------------------- CHORD GENERATOR --------------------

// Major and minor chords
const chordTypes = [
    {
        id: "major",
        label: "Major",
        intervals: [0, 4, 7]
    },
    {
        id: "minor",
        label: "Minor",
        intervals: [0, 3, 7]
    }
];

const maxMidi = 84; // C6

const chordRoots = notes.filter(note => {
    return note.midi + 7 <= maxMidi;
});



const chordContainers = {
    major: root.querySelector("#cp-major"),
    minor: root.querySelector("#cp-minor")
};

for (const root of chordRoots) {
    for (const chordType of chordTypes) {
        const button = document.createElement("button");

        button.type = "button";
        button.textContent = `${root.name} ${chordType.label}`;

        button.dataset.root = root.name;
        button.dataset.chordType = chordType.id;

        chordContainers[chordType.id].appendChild(button);

        setupPointerEvents(
            button,
            () => playChord(button),
            () => stopChord(button)
        );
    }
}



// -------------------- SETUP CHORD PLAYER --------------------


function playChord(button) {

    // Prevent repeated activation of the same chord button.
    if (activeChords.has(button)) {
        return;
    }

    const chordNotes = [];

    const selectedChordType = chordTypes.find(type => {
        return type.id === button.dataset.chordType;
    });

    const chordRootName = button.dataset.root;

    const chordRoot = notes.find(note => {
        return note.name === chordRootName;
    });

    const chordRootMidi = chordRoot.midi;

    const sequence = selectedChordType.intervals;

    for (const leap of sequence) {

        const currentMidi = chordRootMidi + leap;

        const currentNote = notes.find(note => {
            return note.midi === currentMidi;
        });

        if (!currentNote) {
            return;
        }

        chordNotes.push(currentNote);
    }

    // Remember which notes this chord button owns.
    activeChords.set(button, chordNotes);

    // Register the chord button as owner of every note.
    for (const chordNote of chordNotes) {

        playNote(chordNote, button);

    }

    button.classList.add("active");
}

function stopChord(button) {

    // Check whether this chord is currently active.
    if (!activeChords.has(button)) {
        return;
    }

    // Retrieve the chord's note objects.
    const chordNotes = activeChords.get(button);

    // Remove the chord from the active collection.
    activeChords.delete(button);

    // Release this chord's ownership of each note.
    for (const note of chordNotes) {

        stopNote(note, button);

    }

    button.classList.remove("active");
}

})();
