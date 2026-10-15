# CastOn — AI Agent Context & System Architecture Specification

> **Purpose of this Document:** This file serves as the primary system context (`AGENT.md` / `CLAUDE.md` / `.cursorrules` equivalent) for AI coding assistants working on the **CastOn** codebase located at `d:\najeem\dev\caston`. Read this document before modifying endpoints, WebSocket payloads, game classes, or controller layouts.

---

## 1. Project Overview

**CastOn** is a self-hosted, local-area-network (LAN) multiplayer party game console inspired by **AirConsole** and **Jackbox Party Pack**. 
- **Primary Display (`TV`):** Opened on an Android TV browser or kiosk WebView (`/tv`). Renders the console lobby, QR code, room code, audio synthesizer, and HTML5 Canvas / DOM overlays for active games.
- **Input Devices (`Controllers`):** Players on the same Wi-Fi network scan the QR code on the TV using their smartphones (`/controller?code=XXXX`). Their mobile browser transforms into a low-latency, context-aware virtual gamepad that dynamically shifts layouts depending on the active game state.
- **Signaling & Hosting (`Hub`):** A Python **FastAPI** server running on `0.0.0.0:8000` manages rooms, player sessions, VIP host privileges, and real-time bidirectional WebSocket message routing.

---

## 2. Directory Structure

```text
d:\najeem\dev\caston\
├── app.py                     # FastAPI server, Room state manager, WebSocket router
├── requirements.txt           # Python dependencies (fastapi, uvicorn, websockets)
├── run_lan.bat                # Windows batch launcher for local execution
├── AI_AGENT_CONTEXT.md        # This architectural specification document
└── static/
    ├── tv.html                # Big-screen console shell, header bar, game lobby cards
    ├── controller.html        # Mobile browser gamepad shell & all layout containers
    └── js/
        ├── console_tv.js      # TV state machine, WebAudio synth, and Game classes
        └── controller.js      # Mobile WebSocket client, multi-touch & canvas input handlers
```

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
  1. Navigating the TV Lobby (`LEFT`, `RIGHT`, `A` to launch a game).
  2. Pressing the persistent `🏠 Lobby` button on the top-right of the mobile controller header (`{"action": "home"}`) to exit an active game and return everyone to the TV Lobby.

### 3.3 Dynamic Controller Layouts
The TV acts as the **authoritative state machine** for every game. Whenever a game starts or changes phase, the TV sends a `set_layout` command through the server to either `"all"` controllers or a specific `player_id`.

Currently supported layouts in `static/controller.html`:
1. **`dpad`** (`#layout-dpad`): Cross D-Pad (`UP`, `DOWN`, `LEFT`, `RIGHT`) + Action buttons (`A`, `B`). Supports simultaneous multi-touch via `setPointerCapture`.
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
Sent via `sendInput(payload)` in `controller.js` and wrapped into `controller_input.data` for the TV:
- **Lobby Return (VIP only):** `{"action": "home"}`
- **Gamepad Buttons (`dpad` layout):** `{"action": "btn", "button": "UP|DOWN|LEFT|RIGHT|A|B", "state": "down|up"}`
- **Trivia Selection (`trivia` layout):** `{"action": "trivia_answer", "choice": 0|1|2|3}`
- **Drawing Stroke (`draw` layout):** `{"action": "draw_stroke", "x0": float, "y0": float, "x1": float, "y1": float, "color": "#hex", "clear": bool}`
- **Text Guess (`guess` layout):** `{"action": "submit_guess", "text": "USER INPUT"}`

---

## 5. Guide for AI Agents: How to Add a New Game

The TV engine (`static/js/console_tv.js`) uses a modular class pattern for games. To add a new game (e.g., **Game 3: Tank Battle** or **Quiplash Clone**), follow these steps:

### Step 1: Create the Game Class in `static/js/console_tv.js`
Every game class should implement the following interface:
```javascript
class MyNewGame {
    constructor() {
        // 1. Initialize game state, canvas, or DOM overlay (`overlay.innerHTML`)
        // 2. Set the mobile controller layout for all players:
        setControllerLayout("dpad", { title: "My New Game" });
        // 3. Start requestAnimationFrame loop or timers
    }

    onPlayersSync() {
        // Optional: Handle players joining or leaving mid-game
    }

    onInput(playerId, data) {
        // Handle incoming controller events (`data.action`, `data.button`, etc.)
    }

    destroy() {
        // CRITICAL: Stop any requestAnimationFrame loops, clearIntervals, or clearTimeouts
        // Clear canvas and overlay when returning to the lobby
    }
}
```

### Step 2: Register the Game Card in `static/tv.html` & `static/js/console_tv.js`
1. Add a new `.game-card` block inside `#game-grid` in `static/tv.html` with `onclick="launchGame(3)"`.
2. Update the modulo math in `handleControllerInput()` in `console_tv.js` (change `% 3` to `% 4` for `LEFT`/`RIGHT` navigation).
3. Add the `else if (index === 3)` branch inside `launchGame(index)` in `console_tv.js` to instantiate `new MyNewGame()`.

### Step 3: (Optional) Add a Custom Controller Layout
If your new game requires a specialized phone UI (e.g., a virtual analog joystick or a card hand):
1. Add `<div id="layout-mycustom" class="controller-layout hidden ...">` inside `#controller-shell` in `static/controller.html`.
2. Handle any custom initialization inside `switchLayout(layout, state)` in `static/js/controller.js`.
3. Call `setControllerLayout("mycustom", { ... })` from your TV game class.

---

## 6. Technical Constraints & Best Practices

1. **Zero-Latency Local Networking:** 
   - Keep `app.py` stateless regarding game physics/logic. The FastAPI server acts strictly as a WebSocket multiplexer so game ticks run at a smooth 60FPS directly inside the TV browser's JavaScript engine without round-trip server serialization bottlenecks.
2. **Mobile Touch Ergonomics (`controller.html`):**
   - Always preserve `* { touch-action: none; user-select: none; -webkit-user-select: none; }` on gamepad elements so rapid button mashing on iOS Safari and Android Chrome never triggers pinch-zoom, double-tap zoom, or text selection popups.
   - Only enable `touch-action: auto; user-select: text;` on `<input>` and `<textarea>` elements.
   - Always use `pointerdown`, `pointerup`, and `pointercancel` with `btn.setPointerCapture(e.pointerId)` instead of `click` or `touchstart` for arcade buttons to ensure reliable multi-touch (e.g., holding `RIGHT` while pressing `A`).
3. **Normalized Coordinates across Screens:**
   - Because phones and TVs have vastly different resolutions and aspect ratios, any pointer/drawing coordinates sent from a mobile controller to the TV must be normalized to `[0.0, 1.0]` on the phone and multiplied by `canvas.width` / `canvas.height` on the TV.
4. **Audio Policy on Android TV:**
   - Browsers block WebAudio until the first user interaction or WebSocket event callback. Always check `if (audioCtx.state === "suspended") audioCtx.resume();` inside `playTone()`.