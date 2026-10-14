https://noyfintz.github.io/ai-agents-course-lab1-game/

# 🧊 Icy Climb

A fast-paced vertical platformer for the browser, inspired by the classic *Icy Tower*. Jump from floor to floor, use the walls to build speed, chain multi-floor combos, and climb as high as you can before the screen leaves you behind.

> Developed as part of Lab 1 in the Agentic Programming course, using Claude Code as an AI coding agent.

---

## 🎮 Play

**Live site:** https://noyfintz.github.io/ai-agents-course-lab1-game/

Or run it locally: no build step and no dependencies. Open `index.html` in any modern browser.

---

## ✨ Features

- **Two game modes**
  - **Solo**: climb as high as you can.
  - **vs Computer**: race an AI opponent side by side and finish with the higher score.
- **Three AI difficulty levels** (Easy / Medium / Hard). Each one has its own reaction time, jump ambition, accuracy and taste for combos.
- **Combo system**: jump two or more floors at a time to chain combos. Bigger combos earn bonus points and ratings from *Good!* up to *LEGENDARY!*
- **Wall bouncing**: hit the side walls to rebound and keep your momentum.
- **Increasing difficulty**: every 30 seconds the screen scrolls faster ("HURRY UP!"), up to 10 speed levels.
- **8 floor themes** as you climb: Ice, Wood, Stone, Bubblegum, Jungle, Gold, Neon and Lava.
- **Synthesized sound effects** made with the Web Audio API, so the game ships with no audio files.
- **Persistent best score**: your best score, highest floor and longest combo are saved in `localStorage`.
- **Mobile friendly**: responsive canvas scaling and on-screen touch controls.

---

## 🕹️ Controls

| Action            | Keyboard                    | Touch        |
|-------------------|-----------------------------|--------------|
| Move left / right | `←` `→` or `A` `D`          | ◀ ▶ buttons  |
| Jump              | `↑`, `W` or `Space`         | JUMP button  |
| Start game        | `Space` or `Enter`          | Tap          |
| Pause / resume    | `P` or `Esc`                |              |
| Mute / unmute     | `M`                         |              |
| Menu navigation   | Arrow keys / `WASD`         |              |

**Tip:** The faster you run, the higher you jump. Build speed across the floor and off the walls to clear several floors in one jump.

---

## 🏆 Scoring

- **10 points** for every floor reached.
- **Bonus points** for combos (two or more consecutive multi-floor jumps before the combo timer runs out).
- In **vs Computer** mode the game ends as soon as one player falls and the survivor is ahead.

---

## 🗂️ Project Structure

```
.
├── index.html   # Page layout, canvas and touch controls
├── style.css    # Styling and responsive layout
└── game.js      # All game logic: physics, rendering, AI, audio, input
```

**Tech stack:** vanilla JavaScript, HTML5 Canvas and the Web Audio API. No frameworks and no external assets.

---

## 🤖 About the Project

This project was developed as part of the Agentic Programming (Lab 1), with the goal of exploring AI-assisted software development.

Claude Code was used to generate the game's implementation from natural-language instructions, including gameplay mechanics, physics, graphics, and sound. The project demonstrates how AI coding agents can be guided to create a complete, interactive browser game.
