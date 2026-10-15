// CastOn TV Console Engine + Built-in Multiplayer Games

const ws = new WebSocket(`ws://${location.host}/ws/tv`);
let players = {};
let vipId = null;
let currentMode = "lobby"; // "lobby" | "brawl" | "trivia" | "sketch"
let selectedGameIdx = 0;
let activeGameInstance = null;

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("game-overlay");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 96;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// WebAudio Synthesizer for TV Sound Effects
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playTone(freq = 440, duration = 0.12, type = "sine") {
    try {
        if (audioCtx.state === "suspended") audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "room_init") {
        document.getElementById("top-room-code").innerText = msg.code;
        document.getElementById("top-join-url").innerText = msg.lan_ip + "/controller";
        document.getElementById("qrcode-mini").innerHTML = "";
        new QRCode(document.getElementById("qrcode-mini"), {
            text: msg.join_url,
            width: 58,
            height: 58
        });
    } else if (msg.type === "players_sync") {
        vipId = msg.vip_id;
        const updated = {};
        msg.players.forEach(p => {
            updated[p.id] = { ...(players[p.id] || {}), ...p };
        });
        players = updated;
        renderPlayersBar();
        if (activeGameInstance && activeGameInstance.onPlayersSync) {
            activeGameInstance.onPlayersSync();
        }
    } else if (msg.type === "controller_input") {
        handleControllerInput(msg.player_id, msg.data);
    }
};

function renderPlayersBar() {
    const bar = document.getElementById("players-bar");
    const list = Object.values(players);
    if (list.length === 0) {
        bar.innerHTML = `
            <div class="text-blue-200/70 text-sm font-semibold flex items-center gap-2">
                <i data-lucide="users" class="w-4 h-4 text-blue-400 animate-pulse"></i>
                <span>Waiting for players to join...</span>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }
    bar.innerHTML = list.map(p => `
        <div class="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-white text-slate-800 shadow-md border-2 font-bold text-sm shrink-0 transition" style="border-color: ${p.color}; box-shadow: 0 4px 12px ${p.color}33;">
            <span class="text-lg leading-none">${p.avatar}</span>
            <span class="font-extrabold text-sm text-slate-800">${p.name}</span>
            ${p.is_vip ? '<span class="text-[10px] bg-amber-400 text-slate-950 font-black px-1.5 py-0.5 rounded-full uppercase" title="VIP Leader">👑 VIP</span>' : ''}
        </div>
    `).join("");
    if (window.lucide) lucide.createIcons();
}

function setControllerLayout(layout, state = {}, target = "all") {
    ws.send(JSON.stringify({ type: "set_layout", layout, state, target }));
}

function sendToController(target, payload) {
    ws.send(JSON.stringify({ type: "to_controller", target, payload }));
}

function handleControllerInput(playerId, data) {
    // VIP can return to Lobby anytime
    if (data.action === "home" && playerId === vipId) {
        playTone(300, 0.15, "triangle");
        returnToLobby();
        return;
    }

    if (currentMode === "lobby") {
        if (playerId !== vipId) return; // Only VIP navigates lobby
        if (data.action === "btn" && data.state === "down") {
            if (data.button === "LEFT") {
                selectedGameIdx = (selectedGameIdx + 2) % 3;
                updateLobbyHighlight();
                playTone(520, 0.08);
            } else if (data.button === "RIGHT") {
                selectedGameIdx = (selectedGameIdx + 1) % 3;
                updateLobbyHighlight();
                playTone(520, 0.08);
            } else if (data.button === "A") {
                playTone(880, 0.18, "triangle");
                launchGame(selectedGameIdx);
            }
        }
    } else if (activeGameInstance && activeGameInstance.onInput) {
        activeGameInstance.onInput(playerId, data);
    }
}

function updateLobbyHighlight() {
    const cards = document.querySelectorAll(".game-card");
    cards.forEach((c, idx) => {
        const isSel = (idx === selectedGameIdx);
        c.classList.toggle("selected", isSel);
        c.style.borderColor = isSel ? "#f59e0b" : "transparent";
    });
}

function returnToLobby() {
    if (activeGameInstance && activeGameInstance.destroy) {
        activeGameInstance.destroy();
    }
    activeGameInstance = null;
    currentMode = "lobby";
    overlay.innerHTML = "";
    document.getElementById("game-view").classList.add("hidden");
    document.getElementById("lobby-view").classList.remove("hidden");
    setControllerLayout("dpad", { title: "Console Lobby", subtitle: "VIP navigates with D-Pad & A" });
}

function launchGame(index) {
    document.getElementById("lobby-view").classList.add("hidden");
    document.getElementById("game-view").classList.remove("hidden");
    resizeCanvas();
    overlay.innerHTML = "";

    if (index === 0) {
        currentMode = "brawl";
        activeGameInstance = new BumperBrawlGame();
    } else if (index === 1) {
        currentMode = "trivia";
        activeGameInstance = new FamilyTriviaGame();
    } else if (index === 2) {
        currentMode = "sketch";
        activeGameInstance = new SketchGuessGame();
    }
}

// ============================================================================
// GAME 1: BUMPER BRAWL (Real-time 60FPS Arena Physics + Orbs + Dash)
// ============================================================================
class BumperBrawlGame {
    constructor() {
        this.running = true;
        this.entities = {};
        this.orb = this.spawnOrb();
        setControllerLayout("dpad", { title: "Bumper Brawl", subtitle: "D-Pad: Move | A: Turbo Dash" });
        this.syncEntities();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    spawnOrb() {
        const margin = 120;
        return {
            x: margin + Math.random() * (canvas.width - margin * 2),
            y: margin + Math.random() * (canvas.height - margin * 2),
            r: 20
        };
    }

    syncEntities() {
        for (const id in players) {
            if (!this.entities[id]) {
                this.entities[id] = {
                    x: canvas.width / 2 + (Math.random() * 240 - 120),
                    y: canvas.height / 2 + (Math.random() * 240 - 120),
                    vx: 0, vy: 0, r: 32, score: 0,
                    inputs: { UP: false, DOWN: false, LEFT: false, RIGHT: false }
                };
            }
        }
        for (const id in this.entities) {
            if (!players[id]) delete this.entities[id];
        }
    }

    onPlayersSync() {
        this.syncEntities();
    }

    onInput(playerId, data) {
        const ent = this.entities[playerId];
        if (!ent) return;
        if (data.action === "btn") {
            const { button, state } = data;
            if (["UP", "DOWN", "LEFT", "RIGHT"].includes(button)) {
                ent.inputs[button] = (state === "down");
            } else if (button === "A" && state === "down") {
                ent.vx *= 2.8;
                ent.vy *= 2.8;
                playTone(620, 0.08, "sawtooth");
            }
        }
    }

    loop() {
        if (!this.running) return;
        
        // Deep Royal Navy Canvas Background
        ctx.fillStyle = "#0a1128";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Arena Ring
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const arenaR = Math.min(cx, cy) - 50;

        // Arena Interior
        ctx.beginPath();
        ctx.arc(cx, cy, arenaR, 0, Math.PI * 2);
        ctx.fillStyle = "#111c38";
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#2563eb";
        ctx.shadowColor = "#3b82f6";
        ctx.shadowBlur = 25;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Draw Golden Energy Orb
        ctx.beginPath();
        ctx.arc(this.orb.x, this.orb.y, this.orb.r, 0, Math.PI * 2);
        ctx.fillStyle = "#fbbf24";
        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 24;
        ctx.fill();
        ctx.shadowBlur = 0;

        const ids = Object.keys(this.entities);
        const accel = 0.9;

        // Update Positions
        ids.forEach(id => {
            const e = this.entities[id];
            const p = players[id];
            if (!p) return;

            if (e.inputs.UP) e.vy -= accel;
            if (e.inputs.DOWN) e.vy += accel;
            if (e.inputs.LEFT) e.vx -= accel;
            if (e.inputs.RIGHT) e.vx += accel;

            e.vx *= 0.92;
            e.vy *= 0.92;
            e.x += e.vx;
            e.y += e.vy;

            // Orb pickup
            const dxOrb = e.x - this.orb.x;
            const dyOrb = e.y - this.orb.y;
            if (Math.hypot(dxOrb, dyOrb) < e.r + this.orb.r) {
                e.score += 10;
                playTone(880, 0.12);
                sendToController(id, { type: "vibrate", ms: 50 });
                sendToController(id, { type: "score_update", score: e.score });
                this.orb = this.spawnOrb();
            }

            // Ring boundary bounce
            const distCenter = Math.hypot(e.x - cx, e.y - cy);
            if (distCenter + e.r > arenaR) {
                const angle = Math.atan2(e.y - cy, e.x - cx);
                e.x = cx + Math.cos(angle) * (arenaR - e.r);
                e.y = cy + Math.sin(angle) * (arenaR - e.r);
                e.vx *= -0.8;
                e.vy *= -0.8;
            }
        });

        // Player-to-Player Collisions
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const a = this.entities[ids[i]];
                const b = this.entities[ids[j]];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                if (dist < a.r + b.r && dist > 0) {
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const force = 10;
                    a.vx -= nx * force;
                    a.vy -= ny * force;
                    b.vx += nx * force;
                    b.vy += ny * force;
                    playTone(220, 0.08, "square");
                    sendToController("all", { type: "vibrate", ms: 40 });
                }
            }
        }

        // Render Players & Scoreboard
        ids.forEach(id => {
            const e = this.entities[id];
            const p = players[id];
            if (!p) return;

            // Player Disc
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.lineWidth = 4;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();

            // Avatar Emoji
            ctx.font = "26px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(p.avatar, e.x, e.y);

            // Name Tag with Outfit / Plus Jakarta Sans
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 14px 'Plus Jakarta Sans', sans-serif";
            ctx.fillText(`${p.name} (${e.score})`, e.x, e.y - e.r - 14);
        });

        requestAnimationFrame(this.loop);
    }

    destroy() {
        this.running = false;
    }
}

// ============================================================================
// GAME 2: FAMILY TRIVIA SHOWDOWN (4-Button Color Quiz Layout)
// ============================================================================
const TRIVIA_QUESTIONS = [
    { q: "Which planet in our solar system has the most moons?", options: ["Jupiter", "Saturn", "Neptune", "Mars"], answer: 1 },
    { q: "What is the fastest land animal in the world?", options: ["Lion", "Pronghorn", "Cheetah", "Greyhound"], answer: 2 },
    { q: "In Swedish, what do you call a traditional coffee and pastry break?", options: ["Lagom", "Fika", "Smörgås", "Kanel"], answer: 1 },
    { q: "How many bones does an adult human body have?", options: ["206", "186", "256", "300"], answer: 0 },
    { q: "Which element has the chemical symbol 'Au'?", options: ["Silver", "Copper", "Argon", "Gold"], answer: 3 },
    { q: "Which ocean is the largest and deepest on Earth?", options: ["Atlantic", "Indian", "Pacific", "Arctic"], answer: 2 }
];

class FamilyTriviaGame {
    constructor() {
        this.qIndex = 0;
        this.scores = {};
        this.answers = {};
        this.accepting = false;
        this.timer = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.startQuestion();
    }

    startQuestion() {
        this.answers = {};
        this.accepting = true;
        const item = TRIVIA_QUESTIONS[this.qIndex % TRIVIA_QUESTIONS.length];

        setControllerLayout("trivia", {
            title: `Question ${this.qIndex + 1}`,
            options: item.options
        });

        this.renderQuestionScreen(item, null);

        let timeLeft = 12;
        this.timer = setInterval(() => {
            timeLeft--;
            const timerEl = document.getElementById("trivia-timer");
            if (timerEl) timerEl.innerText = `${timeLeft}s`;
            if (timeLeft <= 0) {
                clearInterval(this.timer);
                this.revealAnswer();
            }
        }, 1000);
    }

    onInput(playerId, data) {
        if (!this.accepting || data.action !== "trivia_answer") return;
        if (this.answers[playerId] !== undefined) return; // Already answered

        this.answers[playerId] = data.choice;
        playTone(600, 0.07);
        const item = TRIVIA_QUESTIONS[this.qIndex % TRIVIA_QUESTIONS.length];
        this.renderQuestionScreen(item, null);

        if (Object.keys(this.answers).length >= Object.keys(players).length && Object.keys(players).length > 0) {
            clearInterval(this.timer);
            setTimeout(() => this.revealAnswer(), 600);
        }
    }

    revealAnswer() {
        this.accepting = false;
        const item = TRIVIA_QUESTIONS[this.qIndex % TRIVIA_QUESTIONS.length];

        Object.entries(this.answers).forEach(([pid, choice]) => {
            if (choice === item.answer) {
                this.scores[pid] = (this.scores[pid] || 0) + 100;
                sendToController(pid, { type: "vibrate", ms: 100 });
                sendToController(pid, { type: "score_update", score: this.scores[pid] });
            }
        });

        playTone(750, 0.25, "triangle");
        this.renderQuestionScreen(item, item.answer);

        this.timer = setTimeout(() => {
            this.qIndex++;
            this.startQuestion();
        }, 4500);
    }

    renderQuestionScreen(item, revealedIndex) {
        const colors = [
            "bg-gradient-to-br from-rose-500 to-rose-600 border-rose-400/40",
            "bg-gradient-to-br from-blue-500 to-blue-700 border-blue-400/40",
            "bg-gradient-to-br from-amber-400 to-orange-500 border-amber-300/40 text-slate-950",
            "bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400/40"
        ];
        const labels = ["A", "B", "C", "D"];

        overlay.innerHTML = `
            <div class="max-w-4xl w-full bg-slate-900/90 border border-white/20 backdrop-blur-2xl rounded-[36px] p-10 shadow-2xl">
                <div class="flex justify-between items-center mb-6">
                    <span class="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-3.5 py-1.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        <i data-lucide="help-circle" class="w-3.5 h-3.5"></i>
                        <span>Family Trivia Showdown • Round ${this.qIndex + 1}</span>
                    </span>
                    <span id="trivia-timer" class="text-3xl font-black font-outfit text-amber-400">
                        ${revealedIndex !== null ? "Answer Revealed!" : "12s"}
                    </span>
                </div>
                <h2 class="text-3xl font-black font-outfit mb-8 leading-tight text-white">${item.q}</h2>
                <div class="grid grid-cols-2 gap-5">
                    ${item.options.map((opt, idx) => {
                        const isCorrect = (revealedIndex === idx);
                        const dim = (revealedIndex !== null && !isCorrect) ? "opacity-30 scale-95" : "";
                        const ring = isCorrect ? "ring-4 ring-white scale-[1.03] shadow-2xl" : "shadow-lg";
                        return `
                            <div class="${colors[idx]} ${dim} ${ring} p-5 rounded-2xl flex items-center gap-4 transition-all border">
                                <span class="w-12 h-12 rounded-xl bg-black/20 flex items-center justify-center font-black font-outfit text-2xl text-white">${labels[idx]}</span>
                                <span class="text-xl font-extrabold leading-snug">${opt}</span>
                            </div>
                        `;
                    }).join("")}
                </div>
                <div class="mt-8 pt-6 border-t border-white/10 flex items-center justify-between">
                    <div class="text-sm font-bold text-blue-200">
                        Answered: <b class="text-white text-base">${Object.keys(this.answers).length} / ${Object.keys(players).length}</b>
                    </div>
                    <div class="flex gap-4">
                        ${Object.values(players).map(p => `
                            <div class="text-sm font-extrabold flex items-center gap-2 px-3 py-1 rounded-xl bg-white/10 border border-white/15">
                                <span>${p.avatar}</span>
                                <span>${p.name}:</span>
                                <span class="text-amber-400 font-outfit">${this.scores[p.id] || 0} pts</span>
                            </div>
                        `).join("")}
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) lucide.createIcons();
    }

    destroy() {
        clearInterval(this.timer);
        clearTimeout(this.timer);
    }
}

// ============================================================================
// GAME 3: SKETCH & GUESS (Mobile Touch Drawing Canvas -> Live TV Canvas)
// ============================================================================
const SKETCH_WORDS = ["BICYCLE", "PIZZA", "ROBOT", "CASTLE", "VOLCANO", "GIRAFFE", "SNOWMAN", "HELICOPTER"];

class SketchGuessGame {
    constructor() {
        this.round = 0;
        this.drawerId = null;
        this.secretWord = "";
        this.guesses = [];
        this.timer = null;
        this.startNewRound();
    }

    startNewRound() {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        this.guesses = [];

        const pIds = Object.keys(players);
        if (pIds.length === 0) return;

        this.drawerId = pIds[this.round % pIds.length];
        this.secretWord = SKETCH_WORDS[this.round % SKETCH_WORDS.length];
        const drawer = players[this.drawerId];

        // Drawer gets drawing pad; everyone else gets text guess input
        pIds.forEach(pid => {
            if (pid === this.drawerId) {
                setControllerLayout("draw", { word: this.secretWord }, pid);
            } else {
                setControllerLayout("guess", { drawerName: drawer.name }, pid);
            }
        });

        this.renderHUD();
    }

    onInput(playerId, data) {
        if (playerId === this.drawerId && data.action === "draw_stroke") {
            const { x0, y0, x1, y1, color, clear } = data;
            if (clear) {
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                return;
            }
            ctx.beginPath();
            ctx.moveTo(x0 * canvas.width, y0 * canvas.height);
            ctx.lineTo(x1 * canvas.width, y1 * canvas.height);
            ctx.strokeStyle = color || "#1d4ed8";
            ctx.lineWidth = 6;
            ctx.lineCap = "round";
            ctx.stroke();
        } else if (data.action === "submit_guess") {
            const p = players[playerId];
            if (!p) return;
            const guessText = (data.text || "").trim().toUpperCase();
            if (!guessText) return;

            if (guessText === this.secretWord) {
                playTone(880, 0.3, "triangle");
                this.guesses.unshift(`🎉 ${p.avatar} ${p.name} guessed the word (${this.secretWord})!`);
                this.renderHUD();
                setTimeout(() => {
                    this.round++;
                    this.startNewRound();
                }, 3500);
            } else {
                playTone(340, 0.08);
                this.guesses.unshift(`${p.avatar} ${p.name}: ${guessText}`);
                this.guesses = this.guesses.slice(0, 5);
                this.renderHUD();
            }
        }
    }

    renderHUD() {
        const drawer = players[this.drawerId];
        const drawerName = drawer ? `${drawer.avatar} ${drawer.name}` : "Waiting...";
        const hint = this.secretWord.split("").map(() => "_").join(" ");

        overlay.innerHTML = `
            <div class="w-full h-full flex flex-col justify-between pointer-events-none">
                <div class="flex justify-between items-start">
                    <div class="bg-white text-slate-800 border border-white/80 px-7 py-4 rounded-3xl shadow-2xl">
                        <div class="text-[11px] uppercase text-emerald-600 font-extrabold tracking-wider">Artist Drawing Now</div>
                        <div class="text-2xl font-black font-outfit text-slate-900">${drawerName}</div>
                    </div>
                    <div class="bg-white text-slate-800 border border-white/80 px-9 py-4 rounded-3xl shadow-2xl text-center">
                        <div class="text-[11px] uppercase text-blue-600 font-extrabold tracking-wider">Word Hint (${this.secretWord.length} Letters)</div>
                        <div class="text-4xl font-mono font-black font-outfit tracking-widest text-slate-900">${hint}</div>
                    </div>
                </div>
                <div class="bg-white/95 text-slate-800 border border-white/80 p-5 rounded-3xl max-w-md shadow-2xl">
                    <div class="text-[11px] uppercase text-slate-400 font-black mb-2 tracking-wider">Live Guesses</div>
                    <div class="space-y-1.5 text-sm font-bold">
                        ${this.guesses.length ? this.guesses.map(g => `<div class="p-2 bg-slate-50 rounded-xl border border-slate-100">${g}</div>`).join("") : '<div class="text-slate-400 italic">Type your guess on your phone!</div>'}
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) lucide.createIcons();
    }

    destroy() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}
