/* ==========================================================================
   CastOn — mobile controller client
   One websocket, four switchable layouts, and reliable multi-touch arcs.
   ========================================================================== */
(function (w) {
'use strict';

const doc = document;

/* ---------- element handles ---------------------------------------------- */

const el = {
    joinScreen: doc.getElementById('join-screen'),
    shell: doc.getElementById('controller-shell'),
    code: doc.getElementById('room-code'),
    name: doc.getElementById('player-name'),
    joinBtn: doc.getElementById('join-btn'),
    error: doc.getElementById('join-error'),

    avatar: doc.getElementById('player-avatar-box'),
    avatarFace: doc.getElementById('player-avatar-box'),
    label: doc.getElementById('player-label'),
    vipBadge: doc.getElementById('vip-badge'),
    homeBtn: doc.getElementById('home-btn'),
    status: doc.getElementById('game-status-label'),

    statRoom: doc.getElementById('stat-room-code'),
    statRole: doc.getElementById('stat-role'),
    statScore: doc.getElementById('stat-score'),

    hint: doc.getElementById('dpad-hint-text'),
    extras: doc.getElementById('dpad-extras'),
    secretWord: doc.getElementById('secret-word-label'),
    clearPad: doc.getElementById('clear-pad'),
    guessInput: doc.getElementById('guess-input'),
    guessSubmit: doc.getElementById('guess-submit')
};

/* The avatar face span is the first child text node of the avatar chip. */
function setAvatar(face) {
    if (!el.avatar) return;
    el.avatar.textContent = face;
}

/* ---------- connection state --------------------------------------------- */

let ws = null;
let roomCode = '';
const storedPid = localStorage.getItem('caston_pid') || '';

/* ---------- haptics ------------------------------------------------------- */

function buzz(ms) {
    if (navigator.vibrate) {
        try { navigator.vibrate(ms || 22); } catch (e) { /* unsupported */ }
    }
}

/* ---------- outbound ------------------------------------------------------ */

function send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

/* ==========================================================================
   Join
   ========================================================================== */

const params = new URLSearchParams(location.search);
if (params.get('code')) {
    roomCode = params.get('code').toUpperCase().slice(0, 4);
    if (el.code) el.code.value = roomCode;
}
if (localStorage.getItem('caston_name') && el.name) {
    el.name.value = localStorage.getItem('caston_name');
}

function showError(message) {
    if (!el.error) return;
    el.error.textContent = message;
    el.error.classList.remove('hidden');
}

function hideError() {
    if (el.error) el.error.classList.add('hidden');
}

function joinRoom() {
    const code = (el.code ? el.code.value : '').trim().toUpperCase();
    const name = (el.name ? el.name.value : '').trim() || 'Player';

    if (code.length !== 4) {
        showError('Enter the 4-letter code shown on the TV.');
        if (el.code) el.code.focus();
        return;
    }

    hideError();
    roomCode = code;
    localStorage.setItem('caston_name', name);

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = proto + '//' + location.host + '/ws/controller/' + encodeURIComponent(code) +
        '?name=' + encodeURIComponent(name) + '&pid=' + encodeURIComponent(storedPid);

    try {
        ws = new WebSocket(url);
    } catch (e) {
        showError('Could not open a connection to the console.');
        return;
    }

    if (el.joinBtn) el.joinBtn.disabled = true;

    ws.onopen = () => {
        if (el.joinBtn) el.joinBtn.disabled = false;
    };

    ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }
        handleMessage(msg);
    };

    ws.onerror = () => {
        if (el.joinBtn) el.joinBtn.disabled = false;
        showError('Connection problem — is the console still running?');
    };

    ws.onclose = () => {
        if (el.joinBtn) el.joinBtn.disabled = false;
        // Only treat this as a dropped connection if we were already playing;
        // a deliberate room_closed already moved us back to the join screen.
        if (el.shell && !el.shell.classList.contains('hidden')) {
            el.shell.classList.add('hidden');
            el.joinScreen.classList.remove('hidden');
            showError('Lost the connection to the console.');
        }
    };
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'error':
            if (el.joinBtn) el.joinBtn.disabled = false;
            showError(msg.message || 'Could not join that room.');
            break;

        case 'joined':
            onJoined(msg);
            break;

        case 'vip_update':
            setVip(!!msg.is_vip);
            break;

        case 'layout_update':
            switchLayout(msg.layout, msg.state || {});
            buzz(30);
            break;

        case 'vibrate':
            buzz(msg.ms || 45);
            break;

        case 'score_update':
            if (el.statScore) el.statScore.textContent = (msg.score || 0).toLocaleString();
            break;

        case 'room_closed':
            // Do not use a blocking alert(): it freezes the page and the user
            // cannot dismiss it without losing the tab. Show an inline notice
            // and drop the player back onto the join screen instead.
            onRoomClosed();
            break;
    }
}

function onRoomClosed() {
    if (ws) {
        try { ws.close(); } catch (e) { /* already closing */ }
        ws = null;
    }
    if (el.shell) el.shell.classList.add('hidden');
    if (el.joinScreen) el.joinScreen.classList.remove('hidden');
    showError('The console closed this room. Ask for a new code, or reload the TV.');
    buzz(120);
}

function onJoined(msg) {
    const player = msg.player || {};
    localStorage.setItem('caston_pid', player.id || '');
    localStorage.setItem('caston_name', player.name || '');

    if (el.joinScreen) el.joinScreen.classList.add('hidden');
    if (el.shell) el.shell.classList.remove('hidden');

    setAvatar(player.avatar || '🎮');
    if (el.avatar) el.avatar.style.setProperty('--ring-color', player.color || '#fff');
    if (el.label) el.label.textContent = player.name || 'Player';
    if (el.statRoom) el.statRoom.textContent = msg.room_code || roomCode;
    if (el.statScore) el.statScore.textContent = (player.score || 0).toLocaleString();

    setVip(!!player.is_vip);
    switchLayout(msg.layout || 'dpad', msg.state || {});
    buzz(45);
}

/* ==========================================================================
   Layout switching
   ========================================================================== */

const LAYOUT_IDS = ['dpad', 'trivia', 'draw', 'guess'];

function switchLayout(layout, state) {
    if (LAYOUT_IDS.indexOf(layout) === -1) layout = 'dpad';

    LAYOUT_IDS.forEach(id => {
        const node = doc.getElementById('layout-' + id);
        if (node) node.classList.toggle('hidden', id !== layout);
    });

    if (state.title && el.status) el.status.textContent = state.title;

    // Secondary D-Pad buttons are declared by the TV in `state.extras`, so a
    // game can add or drop its own without a client change.
    renderExtras(layout === 'dpad' ? state.extras : null);

    // Subtitle explains the current game; the footer is the only place with room
    // for a full sentence. The draw pad already shows the word in its own bar, so
    // echoing the subtitle there would just duplicate it.
    if (state.subtitle && layout !== 'draw') {
        const foot = doc.getElementById('pad-foot');
        if (foot) foot.textContent = state.subtitle;
    }

    if (layout === 'trivia' && state.options) {
        state.options.forEach((opt, i) => {
            const node = doc.getElementById('trivia-opt-' + i);
            if (node) node.textContent = opt;
        });
    }

    if (layout === 'draw') {
        if (el.secretWord) el.secretWord.textContent = state.word || 'DRAW';
        requestAnimationFrame(setupPad);
    }

    if (layout === 'guess' && el.guessInput) {
        // `prefill` is used at the end of a Sketch round, when the artist is the
        // only player who still needs to send anything.
        el.guessInput.value = state.prefill || '';
        setTimeout(() => {
            try {
                el.guessInput.focus();
                el.guessInput.select();
            } catch (e) { /* focus is best-effort */ }
        }, 120);
    }
}

function setVip(isVip) {
    isLeader = !!isVip;
    if (el.vipBadge) el.vipBadge.classList.toggle('hidden', !isVip);
    if (el.homeBtn) el.homeBtn.classList.toggle('hidden', !isVip);
    if (el.statRole) {
        el.statRole.textContent = isVip ? 'Leader' : 'Player';
        el.statRole.style.color = isVip ? 'var(--accent)' : '';
    }
    // Only the leader's buttons reach the TV, so non-leaders must not be
    // shown controls that would silently do nothing.
    renderExtras(lastExtras);
}

let isLeader = false;
let lastExtras = null;

/* Secondary buttons the TV asks for at runtime (the lobby's theme cycle). */
function renderExtras(extras) {
    if (!el.extras) return;
    lastExtras = extras || null;
    const list = isLeader ? (extras || []) : [];
    const signature = list.map(e => e.button + ':' + (e.label || '')).join('|');

    if (el.extras.dataset.signature === signature) return;
    el.extras.dataset.signature = signature;
    el.extras.innerHTML = '';

    if (!list.length) {
        el.extras.classList.add('hidden');
        return;
    }
    el.extras.classList.remove('hidden');

    list.forEach((e, i) => {
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'arcade__btn arcade__btn--aux';
        btn.setAttribute('data-btn', e.button);
        btn.style.animationDelay = (i * 45) + 'ms';
        btn.innerHTML = '<span>' + e.button + '</span><span class="arcade__aux-cap">' +
            (e.label || '') + '</span>';
        el.extras.appendChild(btn);
        bindHoldButton(btn, e.button);
    });
}

/* ==========================================================================
   D-Pad & arcade buttons
   Pointer capture keeps a held direction alive while another finger taps A.
   ========================================================================== */

function bindHoldButton(btn, button) {
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        btn.classList.add('is-pressed');
        buzz(18);
        send({ action: 'btn', button: button, state: 'down' });
    });

    const release = (e) => {
        if (e) e.preventDefault();
        btn.classList.remove('is-pressed');
        send({ action: 'btn', button: button, state: 'up' });
    };

    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', () => btn.classList.remove('is-pressed'));
}

doc.querySelectorAll('.dpad__key[data-btn], .arcade__btn[data-btn]').forEach(btn => {
    bindHoldButton(btn, btn.getAttribute('data-btn'));
});

/* ==========================================================================
   Trivia buzzers
   ========================================================================== */

doc.querySelectorAll('.buzzer[data-choice]').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        buzz(35);
        send({ action: 'trivia_answer', choice: Number(btn.getAttribute('data-choice')) });
    });
});

/* ==========================================================================
   Guess input
   ========================================================================== */

function submitGuess() {
    if (!el.guessInput) return;
    const text = el.guessInput.value.trim();
    if (!text) return;
    buzz(25);
    send({ action: 'submit_guess', text: text });
    el.guessInput.value = '';
    el.guessInput.focus();
}

if (el.guessSubmit) el.guessSubmit.addEventListener('click', submitGuess);
if (el.guessInput) {
    el.guessInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submitGuess(); }
    });
}

/* ==========================================================================
   Sketch pad
   Coordinates are normalised to 0..1 so any phone resolution maps cleanly.
   ========================================================================== */

let padBound = false;
let drawing = false;
let last = null;
let padCtx = null;

function setupPad() {
    const pad = doc.getElementById('draw-pad');
    if (!pad) return;

    const rect = pad.getBoundingClientRect();
    const dpr = Math.min(w.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));

    pad.width = Math.round(cssW * dpr);
    pad.height = Math.round(cssH * dpr);
    padCtx = pad.getContext('2d');
    padCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    padCtx.lineCap = 'round';
    padCtx.lineJoin = 'round';
    padCtx.strokeStyle = '#1d4ed8';
    padCtx.lineWidth = Math.max(3, cssH * 0.012);

    // Clear local + remote canvases when the pad is (re)created.
    padCtx.fillStyle = '#ffffff';
    padCtx.fillRect(0, 0, cssW, cssH);

    if (padBound) return;
    padBound = true;

    const pos = (e) => {
        const r = pad.getBoundingClientRect();
        return {
            x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
            y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
        };
    };

    pad.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        drawing = true;
        last = pos(e);
        try { pad.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        buzz(12);
    });

    pad.addEventListener('pointermove', (e) => {
        if (!drawing || !last) return;
        e.preventDefault();

        const next = pos(e);
        const r = pad.getBoundingClientRect();
        const ctx = pad.getContext('2d');

        ctx.beginPath();
        ctx.moveTo(last.x * r.width, last.y * r.height);
        ctx.lineTo(next.x * r.width, next.y * r.height);
        ctx.stroke();

        send({
            action: 'draw_stroke',
            x0: last.x, y0: last.y,
            x1: next.x, y1: next.y,
            color: '#1d4ed8'
        });
        last = next;
    });

    const stop = (e) => {
        if (!drawing) return;
        if (e) e.preventDefault();
        drawing = false;
        last = null;
    };

    pad.addEventListener('pointerup', stop);
    pad.addEventListener('pointercancel', stop);
    pad.addEventListener('pointerleave', stop);
}

if (el.clearPad) {
    el.clearPad.addEventListener('click', () => {
        const pad = doc.getElementById('draw-pad');
        if (pad && padCtx) {
            const r = pad.getBoundingClientRect();
            const dpr = Math.min(w.devicePixelRatio || 1, 2);
            padCtx.save();
            padCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            padCtx.fillStyle = '#ffffff';
            padCtx.fillRect(0, 0, r.width, r.height);
            padCtx.restore();
        }
        buzz(20);
        send({ action: 'draw_stroke', clear: true });
    });
}

/* ==========================================================================
   Header actions
   ========================================================================== */

if (el.homeBtn) {
    el.homeBtn.addEventListener('click', () => {
        buzz(40);
        send({ action: 'home' });
    });
}

/* ==========================================================================
   Wiring
   ========================================================================== */

if (el.joinBtn) el.joinBtn.addEventListener('click', joinRoom);

if (el.code) {
    el.code.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); el.name && el.name.focus(); }
    });
    el.code.addEventListener('input', () => {
        el.code.value = el.code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
        hideError();
    });
}

if (el.name) {
    el.name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); joinRoom(); }
    });
}

// Auto-connect when a room code arrived via the QR link.
if (roomCode.length === 4) {
    const savedName = localStorage.getItem('caston_name');
    if (savedName) {
        joinRoom();
    } else if (el.name) {
        el.name.focus();
    }
}

// The controller is a one-shot page; closing the tab should free the slot.
w.addEventListener('beforeunload', () => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
});

})(window);
