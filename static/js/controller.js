// CastOn Mobile Controller Client

let ws = null;
let currentRoomCode = "";
let playerId = localStorage.getItem("caston_pid") || "";
let isVip = false;

const params = new URLSearchParams(location.search);
if (params.get("code")) {
    const c = params.get("code").toUpperCase();
    document.getElementById("room-code").value = c;
    currentRoomCode = c;
}
if (localStorage.getItem("caston_name")) {
    document.getElementById("player-name").value = localStorage.getItem("caston_name");
}

function vibrate(ms = 25) {
    if (navigator.vibrate) {
        try { navigator.vibrate(ms); } catch (e) {}
    }
}

function connectRoom() {
    const codeInput = document.getElementById("room-code");
    const code = codeInput.value.trim().toUpperCase();
    const name = document.getElementById("player-name").value.trim() || "Player";
    const errEl = document.getElementById("join-error");

    if (code.length !== 4) {
        errEl.innerText = "Please enter the 4-letter Room Code from your TV.";
        errEl.classList.remove("hidden");
        return;
    }

    errEl.classList.add("hidden");
    currentRoomCode = code;
    localStorage.setItem("caston_name", name);

    ws = new WebSocket(`ws://${location.host}/ws/controller/${code}?name=${encodeURIComponent(name)}&pid=${encodeURIComponent(playerId)}`);

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "error") {
            errEl.innerText = msg.message;
            errEl.classList.remove("hidden");
        } else if (msg.type === "joined") {
            playerId = msg.player.id;
            localStorage.setItem("caston_pid", playerId);

            document.getElementById("join-screen").classList.add("hidden");
            document.getElementById("controller-shell").classList.remove("hidden");

            // Profile header & stats (David Courtney mockup style)
            const avatarBox = document.getElementById("player-avatar-box");
            if (avatarBox) {
                avatarBox.style.borderColor = msg.player.color;
                avatarBox.style.backgroundColor = msg.player.color + "33";
            }
            document.getElementById("player-avatar").innerText = msg.player.avatar;
            document.getElementById("player-label").innerText = msg.player.name;
            
            const roomStat = document.getElementById("stat-room-code");
            if (roomStat) roomStat.innerText = currentRoomCode;

            const scoreStat = document.getElementById("stat-score");
            if (scoreStat) scoreStat.innerText = (msg.player.score || 0) + " PTS";

            updateVipUI(msg.player.is_vip);
            switchLayout(msg.layout, msg.state);
            vibrate(50);
        } else if (msg.type === "vip_update") {
            updateVipUI(msg.is_vip);
        } else if (msg.type === "layout_update") {
            switchLayout(msg.layout, msg.state);
            vibrate(35);
        } else if (msg.type === "score_update") {
            const scoreStat = document.getElementById("stat-score");
            if (scoreStat) scoreStat.innerText = (msg.score || 0) + " PTS";
        } else if (msg.type === "vibrate") {
            vibrate(msg.ms || 50);
        } else if (msg.type === "room_closed") {
            alert("The TV console session ended.");
            location.reload();
        }
    };

    ws.onerror = () => {
        errEl.innerText = "Connection error. Is the server running?";
        errEl.classList.remove("hidden");
    };
}

function updateVipUI(vip) {
    isVip = vip;
    const vipBadge = document.getElementById("vip-badge");
    const homeBtn = document.getElementById("home-btn");
    const statRole = document.getElementById("stat-status");

    if (vipBadge) vipBadge.classList.toggle("hidden", !vip);
    if (homeBtn) homeBtn.classList.toggle("hidden", !vip);
    if (statRole) {
        statRole.innerText = vip ? "VIP HOST" : "PLAYER";
        statRole.className = vip 
            ? "text-base font-black text-amber-300 font-outfit tracking-wide" 
            : "text-base font-black text-blue-200 font-outfit tracking-wide";
    }

    if (window.lucide) lucide.createIcons();
}

function switchLayout(layout, state = {}) {
    document.querySelectorAll(".controller-layout").forEach(el => el.classList.add("hidden"));
    const target = document.getElementById(`layout-${layout}`);
    if (target) target.classList.remove("hidden");

    if (state.title) {
        const statusLabel = document.getElementById("game-status-label");
        if (statusLabel) statusLabel.innerText = state.title;
    }
    if (state.subtitle) {
        const hintEl = document.getElementById("dpad-hint-text");
        if (hintEl) hintEl.innerText = state.subtitle;
    }

    if (layout === "trivia" && state.options) {
        state.options.forEach((opt, i) => {
            const el = document.getElementById(`trivia-opt-${i}`);
            if (el) el.innerText = opt;
        });
    } else if (layout === "draw") {
        document.getElementById("secret-word-label").innerText = state.word || "DRAW!";
        setTimeout(initDrawPad, 60);
    }

    if (window.lucide) lucide.createIcons();
}

function sendInput(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

function sendHome() {
    vibrate(40);
    sendInput({ action: "home" });
}

// Bind D-Pad & A/B Multi-touch Buttons
document.querySelectorAll(".dpad-btn").forEach(btn => {
    const button = btn.getAttribute("data-btn");
    btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
        vibrate(20);
        sendInput({ action: "btn", button, state: "down" });
    });
    btn.addEventListener("pointerup", (e) => {
        e.preventDefault();
        sendInput({ action: "btn", button, state: "up" });
    });
    btn.addEventListener("pointercancel", (e) => {
        e.preventDefault();
        sendInput({ action: "btn", button, state: "up" });
    });
});

// Trivia Buzzer
function sendTrivia(choice) {
    vibrate(40);
    sendInput({ action: "trivia_answer", choice });
}

// Sketch Pad Touch Streaming
let padReady = false;
let drawing = false;
let lastPos = { x: 0, y: 0 };

function initDrawPad() {
    const pad = document.getElementById("draw-pad");
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    pad.width = rect.width;
    pad.height = rect.height;
    const pCtx = pad.getContext("2d");
    pCtx.fillStyle = "#ffffff";
    pCtx.fillRect(0, 0, pad.width, pad.height);

    if (padReady) return;
    padReady = true;

    const getNormPos = (e) => {
        const r = pad.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
            y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
        };
    };

    pad.addEventListener("pointerdown", (e) => {
        drawing = true;
        lastPos = getNormPos(e);
    });

    pad.addEventListener("pointermove", (e) => {
        if (!drawing) return;
        const pos = getNormPos(e);
        const ctx2 = pad.getContext("2d");
        ctx2.beginPath();
        ctx2.moveTo(lastPos.x * pad.width, lastPos.y * pad.height);
        ctx2.lineTo(pos.x * pad.width, pos.y * pad.height);
        ctx2.strokeStyle = "#1d4ed8";
        ctx2.lineWidth = 5;
        ctx2.lineCap = "round";
        ctx2.stroke();

        sendInput({
            action: "draw_stroke",
            x0: lastPos.x, y0: lastPos.y,
            x1: pos.x, y1: pos.y,
            color: "#1d4ed8"
        });
        lastPos = pos;
    });

    window.addEventListener("pointerup", () => { drawing = false; });
}

function clearPad() {
    const pad = document.getElementById("draw-pad");
    if (!pad) return;
    const ctx2 = pad.getContext("2d");
    ctx2.fillStyle = "#ffffff";
    ctx2.fillRect(0, 0, pad.width, pad.height);
    sendInput({ action: "draw_stroke", clear: true });
}

function submitGuess() {
    const input = document.getElementById("guess-input");
    const text = input.value.trim();
    if (!text) return;
    vibrate(30);
    sendInput({ action: "submit_guess", text });
    input.value = "";
}
