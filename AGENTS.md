# CastOn — AI Agent Context & System Architecture Specification

> **Purpose of this Document:** This file serves as the primary system context (`AGENT.md` / `CLAUDE.md` / `.cursorrules` equivalent) for AI coding assistants working on the **CastOn** codebase located at `d:\najeem\dev\caston`. Read this document before modifying endpoints, WebSocket payloads, game classes, or controller layouts.

---

## 1. Project Overview

**CastOn** is a self-hosted, local-area-network (LAN) multiplayer party game console inspired by **AirConsole** and **Jackbox Party Pack**. 
- **Primary Display (`TV`):** Opened on an Android TV browser or kiosk WebView (`/tv`). Renders the console lobby, QR code, room code, audio synthesizer, and HTML5 Canvas / DOM overlays for active games.
- **Input Devices (`Controllers`):** Players on the same Wi-Fi network scan the QR code on the TV using their smartphones (`/controller?code=XXXX`). Their mobile browser transforms into a low-latency, context-aware virtual gamepad that dynamically shifts layouts depending on the active game state.
- **Signaling & Hosting (`Hub`):** A Python **FastAPI** server running on `0.0.0.0:8000` manages rooms, player sessions, VIP host privileges, and real-time bidirectional WebSocket message routing.

### Running the console
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py        # or run_lan.bat on Windows
```
Open `http://<LAN-IP>:8000/tv` on the TV and `http://<LAN-IP>:8000/controller` on
each phone. `python -m http.server` is **not** enough — the WebSocket endpoints
only exist in the FastAPI app.

---

## 2. Directory Structure

```text
d:\najeem\dev\caston\
├── app.py                     # FastAPI server, Room state manager, WebSocket router
├── requirements.txt           # Python dependencies (fastapi, uvicorn, websockets)
├── run_lan.bat                # Windows batch launcher for local execution
├── AGENTS.md                  # This architectural specification document
├── tools/
│   └── vendor_fonts.ps1       # One-off script that downloads the web fonts locally
└── static/
    ├── tv.html                # Big-screen shell: top bar, lobby, game stage, overlay
    ├── controller.html        # Mobile shell: join screen + all four layout hosts
    ├── css/
    │   ├── design.css         # Design system: tokens, themes, typography, primitives
    │   ├── console.css        # TV-only: top bar, lobby, tiles, room band
    │   ├── controller.css     # Phone-only: join form, D-Pad, buzzers, sketch pad
    │   └── game.css           # In-game TV overlays (trivia board, sketch HUD, results)
    ├── js/
    │   ├── icons.js           # Inline SVG icon sprite — replaces the Lucide CDN
    │   ├── qr.js              # Dependency-free QR encoder + themed canvas renderer
    │   ├── console.js         # TV engine: websocket, room state, theming, lobby
    │   ├── controller-app.js  # Mobile client: websocket, layouts, pointer input
    │   └── games/
    │       ├── gametools.js   # Shared canvas helpers and TV overlay fragments
    │       ├── brawl.js       # Game: Bumper Brawl
    │       ├── trivia.js      # Game: Family Trivia
    │       └── sketch.js      # Game: Sketch & Guess
    └── vendor/
        └── fonts/             # Self-hosted woff2 subsets + generated fonts.css
```

There are **no runtime CDN dependencies**. Icons, QR generation and fonts are all
served locally so the console works on a TV with no internet access.

---

## 2.1 Visual Language (read before touching any CSS)

The console is designed to read as a **TV app**, not a web page. The rules below
are deliberate; please keep changes consistent with them.

- **Fonts:** `Space Grotesk` for display/numbers/eyebrows, `Inter` for body copy.
  Both are self-hosted variable fonts (see `tools/vendor_fonts.ps1`). Every
  numeric readout uses `.numeral` (tabular figures) so live values never jitter.
- **Radii are restrained.** `--r-sm: 6px`, `--r-md: 10px`, `--r-lg: 14px`,
  `--r-xl: 18px`. Only avatars, D-pad keys and arcade buttons are circles.
  Do **not** reintroduce 24–36px "pill" corners.
- **No pill-inside-pill.** One bordered rectangle per concept. A tag never
  contains another tag; a panel header uses `.panel__head`, not a nested card.
- **Focus is an inset ring.** `.tile::after` draws the selection border *inside*
  the card. An `outline` with a negative offset gets clipped by the card's
  `overflow: hidden` — that was a real bug.
- **Themes are tokens.** All colour lives in `[data-theme="…"]` blocks in
  `design.css` (`--bg-a`, `--wave-1..4`, `--accent`, `--panel`, `--card`…).
  Never hard-code a brand colour in a component; add or use a token.
- **Five themes ship:** `broadcast` (default), `arcade`, `void`, `sunset`,
  `candy`. The chosen theme is persisted in `localStorage.caston_theme`.
- **Reference baseline & proportional scaling:** The console layout is anchored to a
  **1280×720 reference canvas**. Proportional scaling (`--tv-scale`) scales the UI
  up or down smoothly on any display (540p, 720p, 1080p, 1440p, 4K) and aspect ratio.

### 2.2 Themed QR code
`static/js/qr.js` is a self-contained QR encoder (versions 1–9, ECC L/M/Q/H,
Reed–Solomon, all 8 masks with penalty scoring). `CastOn.qr.draw(canvas, text,
opts)` renders it with rounded modules and shaped "eyes", tinted from the active
theme via `CastOn.themeMeta().ink`. Encoding is verified against a third-party
decoder; if you change `qr.js`, re-verify that the code still scans.

### 2.3 TV Resolution Scaling & Stage Architecture
The TV console is anchored to a **1280×720 reference layout** (64px topbar, 656px stage)
and scales proportionally across displays and aspect ratios:
- **Dynamic Scale Factor (`--tv-scale`):** Computed as `min(window.innerWidth / 1280, window.innerHeight / 720)`.
  Set directly on `:root` synchronously in `<head>` (to prevent first-paint layout shifts)
  and updated dynamically on `window.resize`.
- **Full-Width Topbar:** `.console` is a full-viewport flex column (`100vw × 100vh`). The topbar
  (`.topbar`) spans **100% full width edge-to-edge** with its internal elements scaled via
  `zoom: var(--tv-scale, 1)`. On ultra-wide or non-16:9 displays (e.g. 21:9 or 2:1 aspect ratios),
  the topbar stretches completely across the screen without side pillarbox gaps or truncated navigation.
- **Stage & Lobby Centering:** `.stage` flexes to fill all remaining viewport height (`flex: 1`).
  In lobby mode, `#lobby` renders at fixed 1280×656 reference coordinates and is centered
  with `transform: scale(var(--tv-scale, 1))`.
- **Crisp High-DPI Canvas & QR:** Active games and canvas overlays fill the full stage (`.game-stage`).
  Canvas buffers scale by `effectiveDpr = (window.devicePixelRatio || 1) * scale`, ensuring crystal-clear
  text, geometry, and QR code rendering on 4K TVs without blurring or coordinate distortion.
- **Mobile Isolation:** Mobile controllers (`body.pad` / `controller.html` / `controller.css`) use
  standard responsive flexbox/grid layouts and are completely isolated from `--tv-scale`.

---

## 3. Core Architectural Concepts

### 3.1 Room Lifecycle & Session Persistence
- When `/tv` connects to `ws://<HOST>:8000/ws/tv`, the server generates a unique 4-letter uppercase `code` (e.g., `ABCD`) and instantiates a `Room` object in memory (`rooms[code]`).
- When a mobile browser connects to `/ws/controller/{code}?name={name}&pid={pid}`, the server checks if `pid` (stored in the phone's `localStorage` as `caston_pid`) already exists in `room.players`.
  - **New Player:** Generates a unique `p_XXXXX` ID, assigns a distinct hex color from `PLAYER_COLORS` and an emoji from `AVATARS`.
  - **Reconnecting Player:** Restores their existing player slot, color, avatar, and VIP status seamlessly (preventing accidental page refreshes on mobile from ruining a game).
- If the TV disconnects, the room is destroyed and all connected mobile controllers receive `{"type": "room_closed"}`.

### 3.2 VIP Player (Room Leader) System
- The first player to join a room is automatically assigned `is_vip = True` (`room.vip_id`).
- If the VIP disconnects, `room.assign_vip()` automatically promotes the next remaining player in `room.players` and broadcasts `vip_update` to all controllers.
- **VIP Privileges:**
  1. Navigating the TV Lobby (`LEFT`, `RIGHT`, `A` to launch a game, `X`/`Y` to cycle the console theme).
  2. Pressing the persistent `🏠 Lobby` button on the top-right of the mobile controller header (`{"action": "home"}`) to exit an active game and return everyone to the TV Lobby.

### 3.3 Dynamic Controller Layouts
The TV acts as the **authoritative state machine** for every game. Whenever a game starts or changes phase, the TV sends a `set_layout` command through the server to either `"all"` controllers or a specific `player_id`.

Currently supported layouts in `static/controller.html`:
1. **`dpad`** (`#layout-dpad`): Cross D-Pad (`UP`, `DOWN`, `LEFT`, `RIGHT`) + Action buttons (`A`, `B`), plus optional shoulder buttons (`X`, `Y`) declared per-state via `setLayout(..., { extras: [{ button: 'X', label: 'Theme' }] })`. Supports simultaneous multi-touch via `setPointerCapture`.
2. **`trivia`** (`#layout-trivia`): 2x2 grid of colored buzzer buttons (`0`, `1`, `2`, `3`) with dynamic option text injected via `state.options`.
3. **`draw`** (`#layout-draw`): HTML5 `<canvas>` touch drawing pad that normalizes coordinates to `[0.0, 1.0]` and streams stroke vectors in real time, plus a secret word banner and Clear button.
4. **`guess`** (`#layout-guess`): Text input field + Submit button for word-guessing games.

---

## 4. WebSocket Protocol Specification

All WebSocket communication uses JSON payloads.

### 4.1 Server $\rightarrow$ TV (`/ws/tv`)
| `type` | Payload Fields | Description |
| :--- | :--- | :--- |
| `room_init` | `code`, `join_url`, `lan_ip` | Sent immediately when TV connects so it can render the QR code and room code. |
| `players_sync` | `players` (Array), `vip_id` | Sent whenever a player joins, reconnects, or leaves. |
| `controller_input` | `player_id`, `player` (Object), `data` (Object) | Forwarded directly from a mobile controller whenever a player interacts with their screen. |

### 4.2 TV $\rightarrow$ Server (`/ws/tv`)
| `type` | Payload Fields | Description |
| :--- | :--- | :--- |
| `set_layout` | `layout` (str), `state` (dict), `target` (`"all"` or `player_id`) | Instructs mobile controllers to switch their visible UI layout and updates `room.current_layout`. |
| `to_controller` | `target` (`"all"` or `player_id`), `payload` (dict) | Sends direct events to controllers (e.g., `{"type": "vibrate", "ms": 50}`). |

### 4.3 Server $\rightarrow$ Controller (`/ws/controller/{code}`)
| `type` | Payload Fields | Description |
| :--- | :--- | :--- |
| `joined` | `player` (dict), `layout` (str), `state` (dict) | Confirms connection, sends assigned color/avatar/ID, and sets initial controller layout. |
| `vip_update` | `is_vip` (bool) | Toggles the `👑 VIP` badge and `🏠 Lobby` button on the phone header. |
| `layout_update` | `layout` (str), `state` (dict) | Switches the active `#layout-*` container on the phone and vibrates `35ms`. |
| `vibrate` | `ms` (int) | Triggers `navigator.vibrate(ms)` on the mobile device. |
| `error` | `message` (str) | Displayed on the join screen if room code is invalid. |
| `room_closed` | None | Alerts the user and reloads the controller page when the TV closes. |

### 4.4 Controller $\rightarrow$ Server (`/ws/controller/{code}`)
Sent via `sendInput(payload)` in `controller-app.js` and wrapped into `controller_input.data` for the TV:
- **Lobby Return (VIP only):** `{"action": "home"}`
- **Gamepad Buttons (`dpad` layout):** `{"action": "btn", "button": "UP|DOWN|LEFT|RIGHT|A|B|X|Y", "state": "down|up"}`
- **Trivia Selection (`trivia` layout):** `{"action": "trivia_answer", "choice": 0|1|2|3}`
- **Drawing Stroke (`draw` layout):** `{"action": "draw_stroke", "x0": float, "y0": float, "x1": float, "y1": float, "color": "#hex", "clear": bool}`
- **Text Guess (`guess` layout):** `{"action": "submit_guess", "text": "USER INPUT"}`

---

## 5. Guide for AI Agents: How to Add a New Game

Games are **separate files**. The TV engine (`static/js/console.js`) owns the
websocket, room state, theming and the lobby; it knows nothing about individual
game rules. Each game registers itself into a registry, and the lobby renders
one tile per registry entry — there is no fixed game count to update anywhere.

### Step 1: Create `static/js/games/mygame.js`
Wrap the file in an IIFE, pull helpers off `CastOn`, implement the interface
below, then call `CastOn.registerGame({...})` at the bottom.

```javascript
(function (w) {
'use strict';

const C = w.CastOn;      // engine API
const T = C.tools;       // canvas + overlay helpers (gametools.js)

class MyGame {
    constructor() {
        this.phase = 'play';
        this.rafId = null;

        // Tell the phones what UI to show.
        C.setLayout('dpad', { title: 'My Game', subtitle: 'D-Pad moves' });

        // C.view is the CSS-pixel size of the stage; C.ctx is already
        // scaled for devicePixelRatio.
        this.loop = this.loop.bind(this);
        this.rafId = requestAnimationFrame(this.loop);
    }

    onResize(view) { /* the TV was resized; recompute derived geometry */ }

    onPlayersSync() { /* someone joined or left mid-game */ }

    onInput(playerId, data) { /* data.action, data.button, data.state, … */ }

    destroy() {
        // CRITICAL: stop every loop and timer here. Leaked rAF loops keep
        // drawing over the lobby after the game ends.
        if (this.rafId) cancelAnimationFrame(this.rafId);
        clearTimeout(this.timerId);
        this.rafId = null;
    }
}

C.registerGame({
    id: 'mygame',
    title: 'My Game',
    tagline: 'Category',          // short chip on the tile cover
    players: '2–8 players',
    control: 'D-Pad + action',
    description: 'One sentence describing the hook.',
    accent: '#8b5cf6',            // tile + cover colour
    icon: 'zap',                  // a key from js/icons.js
    create: () => new MyGame()
});

})(window);
```

### Step 2: Add the `<script>` tag to `static/tv.html`
Add it **after** `games/gametools.js` and after `console.js`:

```html
<script src="/static/js/games/mygame.js"></script>
```

That is all — the lobby, keyboard navigation and `LEFT`/`RIGHT` wrapping are
driven by `CastOn.games.length`, so a new game appears automatically.

### Step 3: (Optional) Add a Custom Controller Layout
1. Add `<section id="layout-mycustom" class="layout layout--mycustom hidden">`
   inside `#controller-shell` in `static/controller.html`.
2. Add the id to `LAYOUT_IDS` in `static/js/controller-app.js`, handle any
   bespoke setup in `switchLayout(layout, state)`, and wire the pointer
   handlers next to the D-pad/buzzer bindings.
3. Call `C.setLayout('mycustom', { ... })` from your TV game class.

### Engine API cheat-sheet (`window.CastOn`)
| Member | Purpose |
| :--- | :--- |
| `CastOn.players` | Live map of `playerId → player` (re-read every frame, never cache) |
| `CastOn.vipId` | Id of the room leader, or `null` |
| `CastOn.ctx` / `CastOn.canvas` | The TV canvas and its `devicePixelRatio`-scaled context |
| `CastOn.view` | `{ w, h, dpr }` in CSS pixels — use this, not `canvas.width` |
| `CastOn.overlay` | The DOM layer above the canvas for HUDs |
| `CastOn.hud(html)` | Replace the overlay contents |
| `CastOn.setLayout(layout, state, target?)` | Switch phone layouts (`target`: `"all"` or a player id) |
| `CastOn.toController(target, payload)` | Send a one-off event (e.g. `{type:'vibrate', ms:50}`) |
| `CastOn.vibrate(target, ms)` | Shorthand haptic |
| `CastOn.tone(freq, ms, type)` / `CastOn.chord([…])` | WebAudio blips |
| `CastOn.tools` | `sorted`, `leaderboard`, `scoreRail`, `results`, `roundRect`, `label`… |

> **Helpers are shared, so prefer them.** `T.sorted(players, scores)` returns a
> ranked array; `T.results({…})` renders the standard end-of-game podium;
> `T.leaderboard(rows)` renders a ranked list. Reusing these keeps every game
> looking like it belongs to the same console.

---

## 6. Technical Constraints & Best Practices

1. **Zero-Latency Local Networking:**
   - Keep `app.py` stateless regarding game physics/logic. The FastAPI server acts strictly as a WebSocket multiplexer so game ticks run at a smooth 60FPS directly inside the TV browser's JavaScript engine without round-trip server serialization bottlenecks.
2. **Mobile Touch Ergonomics (`controller.html`):**
   - Always preserve `touch-action: none; user-select: none;` on gamepad elements so rapid button mashing on iOS Safari and Android Chrome never triggers pinch-zoom, double-tap zoom, or text selection popups. Only `<input>` and `<textarea>` set `touch-action: auto` (see `controller.css`).
   - Always use `pointerdown`, `pointerup`, and `pointercancel` with `btn.setPointerCapture(e.pointerId)` instead of `click` or `touchstart` for arcade buttons to ensure reliable multi-touch (e.g., holding `RIGHT` while pressing `A`).
   - **Fully clear every `requestAnimationFrame` loop in `destroy()`.** A leaked loop keeps painting over the lobby after the game ends.
   - **Overlays must never erase the playfield.** `#game-overlay` sits on top of the canvas; re-rendering the HUD is safe, but repainting the canvas background during a re-render wipes the drawing (this bit the Sketch game).
3. **Normalized Coordinates across Screens:**
   - Because phones and TVs have vastly different resolutions and aspect ratios, any pointer/drawing coordinates sent from a mobile controller to the TV must be normalized to `[0.0, 1.0]` on the phone and multiplied by the TV view size on the other end.
4. **Audio Policy on Android TV:**
   - Browsers block WebAudio until the first user interaction or WebSocket event callback. `CastOn.tone()` already resumes a suspended `AudioContext`, so always route sound through it.
5. **Testing without phones (`?demo=N`, `?game=N`):**
   - Append `?demo=4` to `/tv` to seed fake players. The keyboard then stands in for a controller: arrows = D-Pad, `Enter`/`Space` = `A`, `Backspace` = `B`, `Escape` = back to lobby, and `1`–`9` jump straight into a game.
   - Append `?game=0` (or `1`, `2`) to `/tv` to launch straight into an active game on boot (useful for headless screenshot and layout testing).
   - Test TV layouts across various resolutions: 1280×720 (baseline reference), 1920×1080 (1080p), 3840×2160 (4K), 960×540 (small/540p), and ultrawide/2:1 viewports (e.g. 956×476 or 2560×1080) to verify edge-to-edge topbar and centered stage presentation.