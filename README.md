# CastOn 🎮

> **Self-hosted LAN multiplayer party game console for Android TV and smartphones.**  
> Turn any TV or big screen into a video game console, and players' phones into dynamic gamepads — zero app installation required.

---

## 🌟 Overview

**CastOn** brings the couch multiplayer party experience to your living room without requiring expensive dedicated hardware or proprietary app store downloads. Inspired by platforms like **AirConsole** and **Jackbox Party Pack**, CastOn runs entirely over your local Wi-Fi network:

- 📺 **TV Display (`/tv`)**: Open on an Android TV browser, Smart TV, projector, or PC. Displays the game console lobby, room code, themed QR code, WebAudio sound synthesizer, and the active game arena.
- 📱 **Mobile Controllers (`/controller`)**: Players scan the on-screen QR code with their smartphone camera. The mobile browser instantly transforms into a low-latency, context-aware virtual gamepad that morphs dynamically depending on the active game (D-Pad, 360° Analog Joystick, 4-choice Buzzers, Touch Drawing Canvas, or Word Guesser).
- ⚡ **Local & Offline-First**: Zero external CDN runtime dependencies! Fonts, SVG icons, and QR code generators are all bundled locally. It works flawlessly even when disconnected from the internet.
- 👑 **VIP Host System**: The first player to connect becomes the Room VIP, gaining privileges to navigate the TV game catalog, toggle visual console themes, and return everyone to the lobby at any time.

---

## 🕹️ Built-in Games

CastOn includes several built-in party games ready to play out of the box:

| Game | Players | Controller Mode | Description |
| :--- | :--- | :--- | :--- |
| **💥 Bumper Brawl** | 2–8 | 360° Analog Joystick / D-Pad + Boost | High-octane arena physics sumo! Bump rivals off the shrinking platform, dodge moving laser barriers, and survive the heat. |
| **🧠 Family Trivia** | 1–8 | 4-Color Arcade Buzzers | Fast-paced trivia quiz across multiple fun categories. Earn bonus points for fast answers and building answer streaks. |
| **🎨 Sketch & Guess** | 2–8 | Touch Canvas Drawing & Text Input | Pictionary-style party fun! One player draws secret prompts with real-time vector streaming, while others race to guess the word. |
| **🔴 Connect 4** | 2 (vs AI/PVP) | Tactile D-Pad (`LEFT`, `RIGHT`, `A`) | The classic vertical disc-drop strategy board game with smooth turn indicators and celebratory animations. |
| **🐍 Snakes & Ladders** | 1–8 | Mystery Dice & D-Pad | Slither past realistic serpents with 3D scales and exotic patterns, climb golden stairs, and race to 100 before only one player remains! |

---

## 🚀 Quick Start

### 1. Installation

CastOn requires **Python 3.9 or newer**.

#### Option A: Install via pip
```bash
pip install caston
```

#### Option B: Install from source (Development)
```bash
git clone https://github.com/najeem/caston.git
cd caston
pip install -e .
```

---

### 2. Running the Console

Once installed, simply run the `caston` command in your terminal:

```bash
caston
```

You can also pass custom arguments:
```bash
# Custom host and port
caston --host 0.0.0.0 --port 8000

# Development mode with live auto-reload
caston --reload
```

Alternatively, you can run CastOn as a Python module or using the included batch script:
```bash
python -m caston
# or
python app.py
# or on Windows
run_lan.bat
```

When started, CastOn detects your local IP address and displays a startup banner:
```text
============================================================
  🎮 CastOn LAN Game Console Platform is Ready!
  📺 Open on Android TV : http://192.168.1.150:8000/tv
  📱 Mobile Controller  : http://192.168.1.150:8000/controller
============================================================
```

---

## 🎮 How to Play

```
   ┌─────────────────────────────────────────────────────────┐
   │                       Android TV                        │
   │  ┌─────────────────┐       ┌─────────────────────────┐  │
   │  │   QR Code &     │       │     Active Game /       │  │
   │  │   Room: ABCD    │       │     Console Lobby       │  │
   │  └─────────────────┘       └─────────────────────────┘  │
   └────────────────────────────┬────────────────────────────┘
                                │ WebSocket (LAN)
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
  📱 Player 1 (VIP)                             📱 Player 2..8
  ┌─────────────────────────┐                   ┌─────────────────────────┐
  │ 👑 VIP · Room ABCD  [🏠]│                   │ Player 2 · Room ABCD    │
  │                         │                   │                         │
  │      [D-Pad / Stick]    │                   │      [D-Pad / Stick]    │
  │      (A)         (B)    │                   │      (A)         (B)    │
  └─────────────────────────┘                   └─────────────────────────┘
```

1. **Open the TV Console**:  
   On your Android TV, Smart TV browser, projector, or computer monitor, navigate to:
   ```text
   http://<YOUR-LAN-IP>:8000/tv
   ```
   *(Click or tap anywhere on the TV screen once to enable WebAudio sound effects).*

2. **Connect Players' Phones**:  
   Each player opens their smartphone camera, scans the QR code on the TV (or visits `http://<YOUR-LAN-IP>:8000/controller`), chooses a player name and avatar, and taps **Join Room**.

3. **Navigate the Console Lobby**:  
   - The first player to join is assigned **VIP Leader (👑)** privileges.
   - The VIP can use their phone's **`LEFT`** and **`RIGHT`** buttons to cycle through games on the TV.
   - The VIP can press **`X`** or **`Y`** on their phone to cycle console visual themes.
   - The VIP presses **`A`** to launch the selected game for all connected players.

4. **Play the Game**:  
   Connected phones will automatically switch their layout to match the active game:
   - **Bumper Brawl**: Virtual 360° Analog Joystick + Boost button.
   - **Family Trivia**: 4 colored buzzer buttons.
   - **Sketch & Guess**: Touch drawing pad for the artist, text input for guessers.
   - **Connect 4**: Tactile D-Pad (`LEFT`, `RIGHT`, `A`).
   - **Snakes & Ladders**: 6 Mystery Dice Cards on TV + Phone controller touch grid or D-Pad.

5. **Return to Lobby**:  
   The VIP can tap the persistent **`🏠 Lobby`** button in the top-right header of their mobile controller at any time to exit the active game and return all players to the main TV lobby.

---

## 🎨 Visual Themes

CastOn includes five distinctive themes out of the box, switchable via the VIP controller or by clicking the theme selector on the TV:

- **Broadcast** *(Default)*: Clean studio aesthetic with deep navy gradients and bright cyan accents.
- **Arcade**: High-contrast neo-retro arcade cabinet styling with vibrant coral and golden amber tones.
- **Void**: Ultra-deep OLED pitch black designed for low-light living room environments.
- **Sunset**: Warm, nostalgic 80s synthwave vaporwave palette with purple and pink glows.
- **Candy**: Playful, vibrant pastel styling with energetic contrast.

The selected theme is automatically persisted in the TV's `localStorage`.

---

## 💻 Python API Usage

CastOn can be imported and integrated directly into your existing Python applications or ASGI servers:

```python
import uvicorn
from caston import app, create_app

# The FastAPI application instance is directly accessible:
# uvicorn.run(app, host="0.0.0.0", port=8000)

# Or create a custom instance:
custom_app = create_app()
```

### CLI Reference

```text
usage: caston [-h] [--host HOST] [-p PORT] [--reload] [-v]

CastOn — Self-hosted LAN party game console for Android TV and smartphones.

options:
  -h, --help            show this help message and exit
  --host HOST           Host interface to bind to (default: 0.0.0.0)
  -p PORT, --port PORT  Port number to listen on (default: 8000)
  --reload              Enable auto-reload on code changes (development mode)
  -v, --version         show program's version number and exit
```

---

## 🛠️ Adding Custom Games

CastOn uses a **modular cartridge system**. The core engine manages WebSockets, audio contexts, room persistence, and player sessions, while games are self-contained cartridges registered via `CastOn.registerGame({...})`.

To create a new game:

1. Add your game script under `caston/static/js/games/mygame.js`:
   ```javascript
   (function (w) {
     'use strict';
     const CastOn = w.CastOn;

     class MyCustomGame extends CastOn.Game {
       constructor(ctx) {
         super(ctx);
         this.ctx = ctx;

         // Set the mobile controller layout for all players
         this.ctx.controller.setLayout('dpad', {
           title: 'My Game',
           subtitle: 'D-Pad moves · A acts'
         });

         this.ctx.sound.fanfare();
       }

       onInput(playerId, data) {
         if (data.action === 'btn' && data.state === 'down') {
           // Handle button presses: UP, DOWN, LEFT, RIGHT, A, B, X, Y
         }
       }

       destroy() {
         // Clean up loops and timers when returning to the lobby
       }
     }

     CastOn.registerGame({
       id: 'mygame',
       title: 'My Custom Game',
       tagline: 'Action / Strategy',
       players: '2–8 players',
       control: 'D-Pad + Action',
       description: 'A fun party game for friends and family.',
       accent: '#10B981',
       icon: 'zap',
       create: (ctx) => new MyCustomGame(ctx)
     });
   })(window);
   ```

2. Include your script in `caston/static/tv.html`:
   ```html
   <script src="/static/js/games/mygame.js"></script>
   ```

The TV lobby will automatically display the new cartridge tile, and VIP players can navigate to and launch it immediately.

---

## 🔧 Troubleshooting & FAQ

### 1. Phones cannot open the controller URL or connect
- **Check Wi-Fi Network**: Ensure your TV/computer and phones are connected to the **same Wi-Fi network**.
- **Wi-Fi Client Isolation**: Some guest Wi-Fi networks enable "Client Isolation" or "AP Isolation", preventing devices on the same Wi-Fi from communicating with each other. If this happens, disable client isolation in your router settings or connect to your primary Wi-Fi network.
- **Firewall**: Ensure your host machine's firewall allows incoming connections on port `8000` (e.g., Windows Defender Firewall prompt: choose "Allow on Private Networks").

### 2. Audio is not playing on the TV
- Modern web browsers block audio playback until the user interacts with the page. **Click or press any key once on the TV browser** to activate the WebAudio synthesizer.

### 3. Remote asset reloading (`/api/reload`)
- If you edit HTML, CSS, or JavaScript assets while the TV or phones are connected, you can trigger a seamless refresh across all connected devices by opening:
  ```text
  http://<YOUR-LAN-IP>:8000/api/reload
  ```
  Both the TV and all connected phones will instantly reload without losing room state.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

