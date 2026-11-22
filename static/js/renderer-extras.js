/*
  CS50x final project - Math & Physics page: keyboard shortcuts for the renderer.
  Written by Ian: Space = pause / play, Left and Right arrows = rotation speed.
  AI-ASSISTED CHANGE: Claude removed the unused `speedSlider` line (the code below uses `speedInput`)
  and gave the file this header. It is loaded from math_physics.html.
  Note: this file is a classic script, so `pauseButton` and `speedInput` are looked up here again.
*/
const pauseButton = document.querySelector("#rd-pause");
const speedInput = document.querySelector("#rd-speed");          // lowercase document

document.addEventListener("keydown", event => {                   // listen on document; event is a parameter
    const tag = event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;   // typing, or a button: leave it alone
    if (event.key === " ") {
        event.preventDefault();                                   // stops the page from scrolling
        pauseButton.click();
    }
});



document.addEventListener("keydown", event => {  
    const tag = event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;   // typing, or a button: leave it alone
    if (event.key === "ArrowRight") {
        event.preventDefault();                                   // stops the page from scrolling
        const value = Number(speedInput.value);
        let shift = 0.1;

        if (value >= 3.0) {
            return;
        }

        speedInput.value = Math.round((value + shift) * 10) / 10
        speedInput.dispatchEvent(new Event("input"));
    }
    else if (event.key === "ArrowLeft") {
        event.preventDefault();                                   // stops the page from scrolling
        const value = Number(speedInput.value);
        let shift = -0.1;

        if (value <= -3.0) {
            return;
        }

        speedInput.value = Math.round((value + shift) * 10) / 10
        speedInput.dispatchEvent(new Event("input"));
    };
});