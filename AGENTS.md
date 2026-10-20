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
1. **`dpad`** (`#layout-dpad`): Tactile Cross D-Pad (`UP`, `DOWN`, `LEFT`, `RIGHT`) + Action buttons (`A`, `B`), plus optional shoulder buttons (`X`, `Y`) declared per-state via `setLayout(..., { extras: [{ button: 'X', label: 'Theme' }] })`. Used for console lobby navigation and discrete grid games (e.g. Connect 4).
2. **`joystick`** (`#layout-joystick`): Virtual 360° analog joystick + Action buttons (`A`, `B`), plus optional shoulder buttons (`X`, `Y`). Used for continuous physics/action games (e.g. Bumper Brawl).
3. **`trivia`** (`#layout-trivia`): 2x2 grid of colored buzzer buttons (`0`, `1`, `2`, `3`) with dynamic option text injected via `state.options`.
4. **`draw`** (`#layout-draw`): HTML5 `<canvas>` touch drawing pad that normalizes coordinates to `[0.0, 1.0]` and streams stroke vectors in real time, plus a secret word banner and Clear button.
5. **`guess`** (`#layout-guess`): Text input field + Submit button for word-guessing games.

### 3.4 Dynamic Cache-Busting & Hot Invalidation
- **Automated Asset Fingerprinting:** Mobile Safari/Chrome and Smart TV WebViews aggressively cache `.js` and `.css` files. `render_html_with_cache_busting()` in `app.py` dynamically injects `?v=<timestamp>` (the latest `mtime` of files in `static/`) into all `href` and `src` asset references. Any changes to game code or styling automatically force all clients to fetch fresh assets.
- **Strict Anti-Caching Headers:** A FastAPI middleware enforces `Cache-Control: no-cache, no-store, must-revalidate` on HTML entry points (`/tv`, `/controller`, `/`) so browsers never retain stale page shells.
- **Remote Force Reload (`/api/reload`):** When code updates are deployed, calling `GET /api/reload` broadcasts `{"type": "reload"}` via WebSocket to both the TV and all connected mobile controllers, prompting them to execute `location.reload()` without requiring anyone to touch the TV remote or mobile browser settings.

---

## 4. WebSocket Protocol Specification

All WebSocket communication uses JSON payloads.

### 4.1 Server $\rightarrow$ TV (`/ws/tv`)
| `type` | Payload Fields | Description |
| :--- | :--- | :--- |
| `room_init` | `code`, `join_url`, `lan_ip` | Sent immediately when TV connects so it can render the QR code and room code. |
| `players_sync` | `players` (Array), `vip_id` | Sent whenever a player joins, reconnects, or leaves. |
| `controller_input` | `player_id`, `player` (Object), `data` (Object) | Forwarded directly from a mobile controller whenever a player interacts with their screen. |
| `reload` | None | Instructs the TV browser to immediately refresh and load fresh assets. |

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
| `reload` | None | Instructs the mobile phone browser to immediately refresh and load fresh assets. |

### 4.4 Controller $\rightarrow$ Server (`/ws/controller/{code}`)
Sent via `sendInput(payload)` in `controller-app.js` and wrapped into `controller_input.data` for the TV:
- **Lobby Return (VIP only):** `{"action": "home"}`
- **Gamepad Buttons (`dpad` layout):** `{"action": "btn", "button": "UP|DOWN|LEFT|RIGHT|A|B|X|Y", "state": "down|up"}`
- **Trivia Selection (`trivia` layout):** `{"action": "trivia_answer", "choice": 0|1|2|3}`
- **Drawing Stroke (`draw` layout):** `{"action": "draw_stroke", "x0": float, "y0": float, "x1": float, "y1": float, "color": "#hex", "clear": bool}`
- **Text Guess (`guess` layout):** `{"action": "submit_guess", "text": "USER INPUT"}`

## 5. Formal Game Interface Specification & Guide for AI Agents

Games are **modular drop-in cartridges**. The TV engine (`static/js/console.js`) owns the
WebSocket connection, room state, audio context, theming, and the lobby; it knows nothing
about individual game rules. Each game registers itself with `CastOn.registerGame({...})`,
and the console automatically adds its tile, navigation, and launch handlers.

---

### 5.1 The Game Interface Contract (`CastOn.Game`)

Every game class must implement this lifecycle interface (either by extending `CastOn.Game`
or as a standalone class):

```javascript
class MyGame extends CastOn.Game {
    /**
     * @param {GameContext} ctx - Injected engine services adapter
     */
    constructor(ctx) {
        super(ctx);
        this.ctx = ctx;
        this.running = true;

        // 1. Tell phones what layout to display
        this.ctx.controller.setLayout('dpad', {
            title: 'My Game',
            subtitle: 'D-Pad moves · A acts'
        });

        // 2. Start animation or game loops
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    /**
     * Called when the TV canvas view changes dimensions or DPR.
     * @param {{w: number, h: number, dpr: number, scale: number}} view
     */
    onResize(view) {
        // Recalculate any positions derived from view dimensions
    }

    /**
     * Called when a player connects, reconnects, leaves, or changes their profile.
     */
    onPlayersSync() {
        // Re-read this.ctx.players and sync internal entities/scores
    }

    /**
     * Called whenever a connected mobile controller sends an action.
     * @param {string} playerId - e.g. "p_1a2b3"
     * @param {object} data - Normalized input payload from controller
     */
    onInput(playerId, data) {
        if (data.action === 'btn') {
            // data.button: 'UP'|'DOWN'|'LEFT'|'RIGHT'|'A'|'B'|'X'|'Y'
            // data.state: 'down'|'up'
        }
    }

    /**
     * MANDATORY cleanup. Called when exiting to the lobby or switching games.
     */
    destroy() {
        this.running = false;
        // CRITICAL: cancel every requestAnimationFrame, clearTimeout, and setInterval.
        // Any leaked timer or loop will continue drawing over the lobby or next game!
    }
}
```

---

### 5.2 The `GameContext` (`ctx`) Engine Reference

When a game is launched, the engine instantiates it with an injected `ctx` object.
Never reach into global DOM nodes or window properties; use `ctx`:

| Property / Method | Type / Signature | Description |
| :--- | :--- | :--- |
| `ctx.id` | `string` | The unique ID of the active game (e.g. `'brawl'`). |
| `ctx.view` | `{ w, h, dpr, scale }` | Current canvas dimensions in CSS pixels (`w`, `h`), device pixel ratio (`dpr`), and scale factor. |
| `ctx.canvas` | `HTMLCanvasElement` | The TV canvas element. |
| `ctx.ctx` | `CanvasRenderingContext2D` | Pre-scaled 2D context matching `effectiveDpr`. |
| `ctx.overlay` | `HTMLElement` | DOM container (`#game-overlay`) sitting directly above the canvas for HTML HUDs. |
| `ctx.setOverlay(html)` | `(html: string) => void` | Replaces the inner HTML of the TV HUD overlay. |
| `ctx.clearCanvas()` | `() => void` | Clears the entire canvas back to transparent. |
| `ctx.players` | `Object.<string, Player>` | Live dictionary of connected players (`{ id, name, color, avatar, is_vip, score }`). |
| `ctx.vipId` | `string \| null` | Player ID of the room leader. |
| `ctx.vip` | `Player \| null` | Player object of the room leader. |
| `ctx.getRankedPlayers(scores)` | `(scores: Object) => Array` | Returns players sorted by score descending (highest first). |
| `ctx.controller.setLayout(layout, state, target?)` | `(layout: string, state?: object, target?: string) => void` | Switches phone UI (`target`: `'all'` or specific `playerId`). |
| `ctx.controller.vibrate(ms, target?)` | `(ms?: number, target?: string) => void` | Sends a haptic vibration to phones. |
| `ctx.controller.send(payload, target?)` | `(payload: object, target?: string) => void` | Sends arbitrary custom events to phones. |
| `ctx.sound.tone(freq, ms?, type?)` | `(freq: number, ms?: number, type?: string) => void` | Plays a synthesized WebAudio tone. |
| `ctx.sound.chord([freqs], ms?, type?)` | `(freqs: number[], ms?: number, type?: string) => void` | Plays a synthesized chord. |
| `ctx.sound.blip()`, `pop()`, `success()`, `fail()`, `fanfare()` | `() => void` | Built-in sound effects. |
| `ctx.ui.results(cfg)` | `(cfg: object) => string` | Returns the standard HTML end-of-game podium scoreboard. |
| `ctx.ui.leaderboard(rows, opts?)` | `(rows: Array, opts?: object) => string` | Returns standard ranked player leaderboard HTML. |
| `ctx.ui.scoreRail(rows)` | `(rows: Array) => string` | Returns compact score chips for screen headers. |
| `ctx.ui.clock(seconds, opts?)` | `(seconds: number\|string, opts?: object) => string` | Returns tabular numeral clock HTML (`opts.isHot = true` for red warning). |
| `ctx.ui.hudBanner(cfg)` | `(cfg: object) => string` | Returns standard top HUD bar with title, subtitle, and badges. |
| `ctx.ui.card(html, opts?)` | `(html: string, opts?: object) => string` | Returns a styled floating card panel matching the active theme. |
| `ctx.graphics.roundRect(g, x, y, w, h, r)` | Canvas helper | Draws a rounded rectangle path on context `g`. |
| `ctx.graphics.circle(g, x, y, r)` | Canvas helper | Draws a circular arc path on context `g`. |
| `ctx.graphics.arenaBackdrop(view)` | Canvas helper | Draws the standard radial dark vignette backdrop. |
| `ctx.graphics.label(text, x, y, opts?)` | Canvas helper | Draws crisp text using the console's typography tokens. |
| `ctx.backToLobby()` | `() => void` | Returns all players to the TV lobby. |

---

### 5.3 Scoped Styling (`css` property in registration)

New games do **not** need to touch `static/css/game.css`. Provide a `css` string in `CastOn.registerGame({...})`. The engine automatically injects it into `<head>` when the game starts and removes it when returning to the lobby:

```javascript
CastOn.registerGame({
    id: 'mygame',
    title: 'My Game',
    tagline: 'Action',
    players: '2–8 players',
    control: 'D-Pad + Boost',
    description: 'Dodge meteors and outlast rivals.',
    accent: '#f43f5e',
    icon: 'flame', // Key from static/js/icons.js (e.g. 'flame', 'zap', 'brain', 'palette', 'trophy', 'users')
    css: `
        .mygame-hud {
            position: absolute;
            top: 20px; left: var(--gutter);
            display: flex; gap: 12px;
        }
        .mygame-shield {
            color: var(--accent);
            font-weight: 700;
        }
    `,
    create: (ctx) => new MyGame(ctx)
});
```

---

### 5.4 Supported Phone Controller Layouts

Switch phone layouts anytime with `ctx.controller.setLayout(layoutName, state)`:

1. **`'dpad'`** — Tactile Cross D-Pad (`UP`, `DOWN`, `LEFT`, `RIGHT`) + A and B arcade action buttons.
   - **Optional shoulder buttons**: pass `state.extras: [{ button: 'X', label: 'Shield' }, { button: 'Y', label: 'Bomb' }]`.
   - **Input payload**: `{"action": "btn", "button": "UP|DOWN|LEFT|RIGHT|A|B|X|Y", "state": "down|up"}`.
2. **`'joystick'`** — Virtual 360° analog joystick + A and B arcade action buttons.
   - **Optional shoulder buttons**: pass `state.extras: [{ button: 'X', label: 'Boost' }, { button: 'Y', label: 'Bomb' }]`.
   - **Input payload**: `{"action": "joystick", "x": float, "y": float, "active": bool}` and synthesized `{"action": "btn", ...}`.
3. **`'trivia'`** — 4 large arcade buzzer buttons (Red, Blue, Yellow, Green).
   - **Option labels**: pass `state.options: ['Choice A', 'Choice B', 'Choice C', 'Choice D']`.
   - **Input payload**: `{"action": "trivia_answer", "choice": 0|1|2|3}`.
3. **`'draw'`** — Touch canvas with normalized vectors and secret prompt banner.
   - **Word banner**: pass `state.word: 'ELEPHANT'`.
   - **Input payload**: `{"action": "draw_stroke", "x0": float, "y0": float, "x1": float, "y1": float, "color": "#hex", "clear": bool}`.
4. **`'guess'`** — Single-line text input field and submit button.
   - **Pre-fill**: pass `state.prefill: '...'`.
   - **Input payload**: `{"action": "submit_guess", "text": "USER INPUT"}`.

---

### 5.5 Turnkey Boilerplate Template for AI Agents

When asked to create a new game, copy this exact pattern into `static/js/games/<id>.js`:

```javascript
(function (w) {
'use strict';

const CastOn = w.CastOn;

class NewPartyGame extends CastOn.Game {
    constructor(ctx) {
        super(ctx);
        this.ctx = ctx;
        this.scores = {};
        this.running = true;
        this.rafId = null;

        // Initialize player scores
        Object.keys(this.ctx.players).forEach(id => { this.scores[id] = 0; });

        // Set controller layout
        this.ctx.controller.setLayout('dpad', {
            title: 'New Game',
            subtitle: 'Survive and score points'
        });

        // Audio cue on start
        this.ctx.sound.fanfare();

        // Start render loop
        this.loop = this.loop.bind(this);
        this.rafId = requestAnimationFrame(this.loop);
    }

    onPlayersSync() {
        Object.keys(this.ctx.players).forEach(id => {
            if (this.scores[id] === undefined) this.scores[id] = 0;
        });
    }

    onInput(playerId, data) {
        if (!this.running) return;

        if (data.action === 'btn' && data.state === 'down') {
            if (data.button === 'A') {
                this.scores[playerId] = (this.scores[playerId] || 0) + 10;
                this.ctx.sound.pop();
            }
        }
    }

    onResize(view) {
        // Re-align geometry if needed
    }

    loop() {
        if (!this.running) return;
        const { ctx, view } = this.ctx;

        // 1. Draw arena backdrop
        this.ctx.graphics.arenaBackdrop(view);

        // 2. Render game entities on canvas...

        // 3. Render HUD overlay via shared tools
        const ranked = this.ctx.getRankedPlayers(this.scores);
        this.ctx.setOverlay(this.ctx.ui.scoreRail(ranked));

        this.rafId = requestAnimationFrame(this.loop);
    }

    endGame() {
        this.running = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);

        const ranked = this.ctx.getRankedPlayers(this.scores);
        this.ctx.setOverlay(this.ctx.ui.results({
            title: 'Game Over',
            rows: ranked,
            footer: 'Leader: press A on phone to return to lobby'
        }));
        this.ctx.sound.fanfare();
    }

    destroy() {
        this.running = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }
}

CastOn.registerGame({
    id: 'newgame',
    title: 'New Party Game',
    tagline: 'Arcade',
    players: '1–8 players',
    control: 'D-Pad + Action',
    description: 'A fun party game hook explained in one punchy sentence.',
    accent: '#38bdf8',
    icon: 'zap',
    create: (ctx) => new NewPartyGame(ctx)
});

})(window);
```

---

### 5.6 Step-by-Step AI Agent Checklist for New Games

1. **Create the Game File**: Create `static/js/games/<id>.js` following the boilerplate above.
2. **Register Script in `static/tv.html`**:
   Add `<script src="/static/js/games/<id>.js"></script>` directly after `static/js/games/gametools.js`.
3. **Verify with Demo Mode**:
   Launch `http://localhost:8000/tv?demo=4&game=<index>` to test headless execution and keyboard inputs without requiring physical phones.
4. **Verify `destroy()`**: Ensure switching between games and returning to the lobby leaves zero leaked intervals or animation frames.

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