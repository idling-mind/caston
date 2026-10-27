/* ==========================================================================
   CastOn — TV console engine
   Owns the websocket, room state, theming, the lobby and the game registry.
   Games live in ./games/*.js and talk to this module through window.CastOn.
   ========================================================================== */
(function (w) {
'use strict';

const CastOn = (w.CastOn = w.CastOn || {});
const icon = (name, opts) => CastOn.icon(name, opts);

/* ==========================================================================
   Themes
   ========================================================================== */

const THEMES = [
    {
        id: 'broadcast',
        label: 'Broadcast',
        ink: '#0b1533',
        swatch: 'linear-gradient(135deg,#1b3fb0,#e11d48 70%,#f59e0b)',
        bgBase: '#060b1d',
        bgA: '#122a72',
        bgB: '#1b3fb0',
        wave1: '#e11d48',
        wave2: '#f59e0b',
        wave3: '#06b6d4',
        wave4: '#8b5cf6',
        accent: '#fbbf24',
        accentInk: '#1a1003',
        panel: 'rgba(10, 20, 52, 0.78)',
        panelSolid: '#0e1d4a',
        boardFrame: 'rgba(18, 42, 114, 0.84)',
        boardInset: 'rgba(6, 11, 29, 0.88)',
        boardBorder: 'rgba(6, 182, 212, 0.48)',
        tableCenter: 'rgba(20, 48, 124, 0.82)',
        tableEdge: 'rgba(8, 16, 44, 0.92)',
        tableRim: '#fbbf24'
    },
    {
        id: 'arcade',
        label: 'Arcade',
        ink: '#0a0f2e',
        swatch: 'linear-gradient(135deg,#2f6bff,#ff2e63)',
        bgBase: '#050a20',
        bgA: '#1d4ed8',
        bgB: '#2f6bff',
        wave1: '#ff2e63',
        wave2: '#ffb020',
        wave3: '#2fd0e8',
        wave4: '#6d28d9',
        accent: '#fbbf24',
        accentInk: '#1a1003',
        panel: 'rgba(8, 18, 56, 0.76)',
        panelSolid: '#102468',
        boardFrame: 'rgba(29, 78, 216, 0.82)',
        boardInset: 'rgba(5, 10, 32, 0.88)',
        boardBorder: 'rgba(47, 208, 232, 0.52)',
        tableCenter: 'rgba(32, 76, 196, 0.82)',
        tableEdge: 'rgba(8, 16, 48, 0.92)',
        tableRim: '#ff2e63'
    },
    {
        id: 'void',
        label: 'Void',
        ink: '#0b0620',
        swatch: 'linear-gradient(135deg,#7c3aed,#06b6d4)',
        bgBase: '#04040a',
        bgA: '#12123a',
        bgB: '#1f1b4d',
        wave1: '#7c3aed',
        wave2: '#06b6d4',
        wave3: '#e11d48',
        wave4: '#22d3ee',
        accent: '#a78bfa',
        accentInk: '#0f0728',
        panel: 'rgba(10, 10, 28, 0.82)',
        panelSolid: '#11102e',
        boardFrame: 'rgba(31, 27, 77, 0.84)',
        boardInset: 'rgba(4, 4, 12, 0.9)',
        boardBorder: 'rgba(167, 139, 250, 0.5)',
        tableCenter: 'rgba(34, 24, 78, 0.84)',
        tableEdge: 'rgba(6, 6, 18, 0.92)',
        tableRim: '#22d3ee'
    },
    {
        id: 'sunset',
        label: 'Sunset',
        ink: '#3a0d18',
        swatch: 'linear-gradient(135deg,#f0592b,#ffb020)',
        bgBase: '#2a0a18',
        bgA: '#b3123f',
        bgB: '#f0592b',
        wave1: '#ffb020',
        wave2: '#ff2e63',
        wave3: '#7c2d8f',
        wave4: '#ff8a3d',
        accent: '#ffd166',
        accentInk: '#301003',
        panel: 'rgba(44, 10, 26, 0.78)',
        panelSolid: '#420d24',
        boardFrame: 'rgba(124, 22, 54, 0.84)',
        boardInset: 'rgba(34, 7, 19, 0.88)',
        boardBorder: 'rgba(255, 209, 102, 0.5)',
        tableCenter: 'rgba(116, 20, 50, 0.82)',
        tableEdge: 'rgba(38, 8, 22, 0.92)',
        tableRim: '#ffd166'
    },
    {
        id: 'candy',
        label: 'Candy',
        ink: '#062430',
        swatch: 'linear-gradient(135deg,#34d399,#6366f1)',
        bgBase: '#071a20',
        bgA: '#0e7490',
        bgB: '#6366f1',
        wave1: '#34d399',
        wave2: '#a78bfa',
        wave3: '#38bdf8',
        wave4: '#f472b6',
        accent: '#5eead4',
        accentInk: '#04231f',
        panel: 'rgba(8, 28, 40, 0.78)',
        panelSolid: '#0b2c3d',
        boardFrame: 'rgba(14, 94, 118, 0.84)',
        boardInset: 'rgba(6, 20, 28, 0.88)',
        boardBorder: 'rgba(94, 234, 212, 0.5)',
        tableCenter: 'rgba(14, 88, 112, 0.82)',
        tableEdge: 'rgba(7, 24, 34, 0.92)',
        tableRim: '#5eead4'
    }
];
const THEME_KEY = 'caston_theme';

const themeId = () => localStorage.getItem(THEME_KEY) || 'broadcast';
const themeMeta = (id) => THEMES.find(t => t.id === (id || themeId())) || THEMES[0];
const themeIndexOf = (id) => Math.max(0, THEMES.findIndex(t => t.id === (id || themeId())));

function applyTheme(id) {
    const valid = themeMeta(id);
    localStorage.setItem(THEME_KEY, valid.id);
    document.documentElement.dataset.theme = valid.id;
    renderThemeSwitcher();
    redrawQr();
    send({ type: 'set_theme', theme: valid.id });
    if (state.game && typeof state.game.onThemeChange === 'function') {
        try { state.game.onThemeChange(valid.id); } catch (_) {}
    }
}

/* Cycling is the phone-friendly form of the switcher: one D-Pad button
   steps through the five palettes without a pointer. */
function cycleTheme(delta) {
    const next = (themeIndexOf(themeId()) + (delta || 1) + THEMES.length) % THEMES.length;
    applyTheme(THEMES[next].id);
    tone(660, 90, 'triangle');
}

/* ==========================================================================
   State
   ========================================================================== */

const DEMO_COUNT = (() => {
    const raw = new URLSearchParams(location.search).get('demo');
    if (raw === null) return 0;
    const n = parseInt(raw, 10);
    return isNaN(n) ? 1 : Math.max(0, Math.min(8, n));
})();

const state = {
    ws: null,
    code: '----',
    joinUrl: '',
    lanIp: '',
    players: {},
    vipId: null,
    mode: 'lobby',
    selected: 0,
    game: null
};

const DEMO_NAMES = ['Nova', 'Rex', 'Juno', 'Pip', 'Ash', 'Mika', 'Zed', 'Wren'];
const DEMO_COLORS = ['#2563eb', '#f43f5e', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];
const DEMO_FACES = ['🦊', '🐼', '🦁', '🐸', '🐙', '🦄', '🦖', '🤖'];

/* ==========================================================================
   DOM handles
   ========================================================================== */

const dom = {};

function cacheDom() {
    dom.canvas = document.getElementById('game-canvas');
    dom.overlay = document.getElementById('game-overlay');
    dom.stage = document.querySelector('.stage');
    dom.lobby = document.getElementById('lobby-view');
    dom.gameView = document.getElementById('game-view');
    dom.grid = document.getElementById('game-grid');
    dom.roster = document.getElementById('roster');
    dom.rosterCount = document.getElementById('roster-count');
    dom.strip = document.getElementById('roster-strip');
    dom.roomKey = document.getElementById('room-key-value');
    dom.qrHost = document.getElementById('qr-hero');
    dom.codeSlots = document.getElementById('code-slots');
    dom.joinUrl = document.getElementById('join-url');
    dom.themeChip = document.getElementById('theme-chip');
    dom.themeSwatch = document.getElementById('theme-swatch');
    dom.themeName = document.getElementById('theme-name');
    dom.rosterCountSide = document.getElementById('roster-count-side');
}

/* ==========================================================================
   Audio — tiny WebAudio blip synth
   ========================================================================== */

let audioCtx = null;

function tone(freq, ms, type) {
    try {
        const AC = w.AudioContext || w.webkitAudioContext;
        if (!AC) return;
        if (!audioCtx) audioCtx = new AC();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const dur = (ms || 120) / 1000;
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.13, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    } catch (e) { /* audio is a nicety, never a blocker */ }
}

function chord(freqs, ms, type) {
    freqs.forEach((f, i) => setTimeout(() => tone(f, ms, type), i * 50));
}

/* ==========================================================================
   TV Viewport Scaling & Canvas sizing
   ========================================================================== */

function updateTvScale() {
    const baseW = 1280;
    const baseH = 720;
    const winW = w.innerWidth || document.documentElement.clientWidth || baseW;
    const winH = w.innerHeight || document.documentElement.clientHeight || baseH;

    const scale = Math.min(winW / baseW, winH / baseH);
    CastOn.scale = scale;
    document.documentElement.style.setProperty('--tv-scale', String(scale));
    return scale;
}

function fitCanvas() {
    if (!dom.canvas || !dom.stage) return;
    const scale = CastOn.scale || 1;
    const dpr = Math.min(w.devicePixelRatio || 1, 2);
    const effectiveDpr = Math.min(4, dpr * scale);

    const cw = dom.stage.clientWidth || 1280;
    const ch = dom.stage.clientHeight || 720;

    dom.canvas.width = Math.floor(cw * effectiveDpr);
    dom.canvas.height = Math.floor(ch * effectiveDpr);
    dom.canvas.style.width = '100%';
    dom.canvas.style.height = '100%';

    CastOn.ctx.setTransform(effectiveDpr, 0, 0, effectiveDpr, 0, 0);
    CastOn.view = { w: cw, h: ch, dpr: effectiveDpr, scale: scale };

    if (state.game && state.game.onResize) state.game.onResize(CastOn.view);
}

/* ==========================================================================
   Controller plumbing
   ========================================================================== */

function send(msg) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify(msg));
    }
}

function setLayout(layout, layoutState, target) {
    send({
        type: 'set_layout',
        layout: layout,
        state: layoutState || {},
        theme: themeId(),
        target: target || 'all'
    });
}

function toController(target, payload) {
    send({ type: 'to_controller', target: target || 'all', payload: payload });
}

function vibrate(target, ms) {
    toController(target || 'all', { type: 'vibrate', ms: ms || 45 });
}

/* ==========================================================================
   Helpers
   ========================================================================== */

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
CastOn.escapeHtml = escapeHtml;

function renderAvatar(avatar) {
    if (!avatar) return '🎮';
    if (typeof avatar === 'string' && (avatar.startsWith('data:image/') || avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/'))) {
        return `<img class="avatar__img" src="${avatar}" alt="Avatar">`;
    }
    return escapeHtml(avatar);
}
CastOn.renderAvatar = renderAvatar;

function playerList() {
    return Object.values(state.players);
}

/* ==========================================================================
   Roster
   ========================================================================== */

function renderStrip() {
    if (!dom.strip) return;
    const list = playerList();

    if (!list.length) {
        if (dom.rosterCount) dom.rosterCount.textContent = 'Waiting';
        dom.strip.innerHTML = '<span class="tag"><span class="dot is-idle"></span>No players yet</span>';
        return;
    }

    if (dom.rosterCount) {
        dom.rosterCount.textContent = list.length + (list.length === 1 ? ' player' : ' players');
    }

    dom.strip.innerHTML = list.map(p => `
        <span class="mini${p.connected === false ? ' is-away' : ''}" style="--ring-color:${p.color};${p.connected === false ? ' opacity:0.55;' : ''}">
            <span class="mini__avatar">${renderAvatar(p.avatar)}</span>
            <span class="mini__name">${escapeHtml(p.name)}${p.connected === false ? ' (Away)' : ''}</span>
            ${p.is_vip ? '<span class="mini__crown">' + icon('crown') + '</span>' : ''}
        </span>
    `).join('');
}

function renderRoster() {
    if (!dom.roster) return;
    const list = playerList();
    const MAX_PLAYERS = 8;

    if (dom.rosterCount) {
        dom.rosterCount.textContent = list.length + ' / ' + MAX_PLAYERS;
    }
    if (dom.rosterCountSide) {
        dom.rosterCountSide.textContent = list.length + ' / ' + MAX_PLAYERS;
    }

    if (!list.length) {
        dom.roster.innerHTML = `
            <div class="roster__empty">
                <span class="roster__bounce"><i></i><i></i><i></i></span>
                <span>Nobody here yet — scanned phones drop in automatically.</span>
            </div>`;
        return;
    }

    const seats = list.map((p, i) => `
        <div class="roster__cell${p.connected === false ? ' is-away' : ''}" style="--ring-color:${p.color};${p.connected === false ? ' opacity:0.55;' : ''} animation-delay:${i * 45}ms">
            <span class="avatar">${renderAvatar(p.avatar)}</span>
            <span class="roster__namebar">
                <span class="roster__name">${escapeHtml(p.name)}</span>
                <span class="roster__role">${p.connected === false ? 'Reconnecting…' : (p.is_vip ? 'Leader' : 'Player')}</span>
            </span>
            ${p.is_vip ? '<span class="roster__star">' + icon('crown') + '</span>' : ''}
        </div>`).join('');

    // Show open seats so the capacity is obvious and the panel reads as
    // intentionally roomy rather than unfinished. Only the current row is
    // topped up; trimRosterOverflow() removes any that still do not fit.
    const open = Math.min(MAX_PLAYERS - list.length, 3);
    const placeholders = open > 0
        ? Array.from({ length: open }, () => `
            <div class="roster__cell roster__cell--open">
                <span class="avatar avatar--dashed">${icon('plus', { stroke: 2.4 })}</span>
                <span class="roster__namebar">
                    <span class="roster__name dim">Open seat</span>
                    <span class="roster__role">Scan the code</span>
                </span>
            </div>`).join('')
        : '';

    dom.roster.innerHTML = seats + placeholders;
    scheduleRosterTrim();
}

/* The roster grid's column count is responsive, so how many open seats fit is
   only knowable after layout. Drop trailing placeholders until the panel no
   longer scrolls — real players are never removed. Deferred a frame so the
   panel has settled, and skipped entirely while it is hidden or unsized. */
let rosterTrimPending = false;

function scheduleRosterTrim() {
    if (rosterTrimPending) return;
    rosterTrimPending = true;
    requestAnimationFrame(() => {
        rosterTrimPending = false;
        trimRosterOverflow();
    });
}

function trimRosterOverflow() {
    if (!dom.roster) return;
    let guard = 0;
    while (dom.roster.clientHeight > 0 &&
           dom.roster.scrollHeight > dom.roster.clientHeight + 1 &&
           guard++ < 8) {
        const opens = dom.roster.querySelectorAll('.roster__cell--open');
        if (!opens.length) break;
        opens[opens.length - 1].remove();
    }
}

/* ==========================================================================
   Lobby tiles
   ========================================================================== */

function renderLobbyTiles() {
    if (!dom.grid) return;
    const hasPlayers = Object.keys(state.players).length > 0;
    const isLeader = hasPlayers && (state.vipId === null || !!state.players[state.vipId]);

    dom.grid.innerHTML = CastOn.games.map((g, i) => {
        const focused = i === state.selected;
        let cta;
        if (!hasPlayers) {
            cta = 'Connect to play';
        } else if (focused) {
            cta = isLeader ? 'Press A to play' : 'Leader to start';
        } else {
            cta = 'Move to select';
        }

        return `
        <button type="button" class="tile${focused ? ' is-focused' : ''}"
                style="--tile-accent:${g.accent}" data-index="${i}"
                aria-label="Play ${escapeHtml(g.title)}. ${cta}.">
            <span class="tile__cover">
                <span class="tile__eyebrow">${escapeHtml(g.tagline)}</span>
                <span class="tile__players">${icon('users')}${escapeHtml(g.players)}</span>
                <span class="tile__art" aria-hidden="true">${icon(g.icon, { stroke: 1.6 })}</span>
            </span>
            <span class="tile__body">
                <span class="tile__title">${escapeHtml(g.title)}</span>
                <span class="tile__desc">${escapeHtml(g.description)}</span>
                <span class="tile__foot">
                    <span class="tile__control">${icon('gamepad')}${escapeHtml(g.control)}</span>
                    <span class="tile__cta">
                        ${focused && hasPlayers ? '<span class="key">A</span>' : ''}
                        <span>${cta}</span>
                    </span>
                </span>
            </span>
        </button>`;
    }).join('');

    dom.grid.querySelectorAll('.tile').forEach(el => {
        el.addEventListener('click', () => {
            if (Object.keys(state.players).length === 0) {
                tone(220, 150, 'sawtooth');
                return;
            }
            state.selected = Number(el.dataset.index);
            renderLobbyTiles();
            launchGame(state.selected);
        });
    });

    // Auto-scroll the horizontal row to keep the focused game centered
    const focusedEl = dom.grid.querySelector('.tile.is-focused');
    if (focusedEl) {
        requestAnimationFrame(() => {
            const gridRect = dom.grid.getBoundingClientRect();
            const elRect = focusedEl.getBoundingClientRect();
            const targetLeft = dom.grid.scrollLeft + (elRect.left - gridRect.left) - (dom.grid.clientWidth - focusedEl.clientWidth) / 2;
            dom.grid.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
        });
    }
}

function renderAll() {
    renderStrip();
    renderRoster();
    renderLobbyTiles();
}

function moveSelection(delta) {
    const n = CastOn.games.length;
    if (!n) return;
    state.selected = (state.selected + delta + n) % n;
    renderLobbyTiles();
    tone(560, 70, 'sine');
}

/* ==========================================================================
   Theme switcher
   ========================================================================== */

function renderThemeSwitcher() {
    if (!dom.themeSwatch) return;
    const meta = themeMeta();
    dom.themeSwatch.style.background = meta.swatch;
    if (dom.themeChip) dom.themeChip.setAttribute('aria-label', 'Console theme: ' + meta.label);
    if (dom.themeName) dom.themeName.textContent = meta.label;
}

/* ==========================================================================
   Room code + themed QR
   ========================================================================== */

function renderCodeSlots() {
    if (!dom.codeSlots) return;
    dom.codeSlots.innerHTML = (state.code || '----').split('').map(c => `<span>${c}</span>`).join('');
}

function redrawQr() {
    if (!dom.qrHost || !state.joinUrl) return;
    const meta = themeMeta();
    const size = dom.qrHost.clientWidth || 116;
    const scale = CastOn.scale || 1;
    const dpr = Math.min(4, (w.devicePixelRatio || 1) * scale);
    CastOn.qr.draw(dom.qrHost, state.joinUrl, {
        size: size,
        dpr: dpr,
        quiet: 2,
        dark: meta.ink,
        light: '#ffffff',
        radius: 0.3,
        ecc: 'M'
    });
}

/* ==========================================================================
   Lobby <-> game
   ========================================================================== */

function showLobby() {
    dom.lobby.classList.remove('hidden');
    dom.gameView.classList.add('hidden');
    state.mode = 'lobby';
    renderLobbyTiles();
}

/* The lobby D-Pad gains two extra legends so the leader can cycle the theme
   from the phone — the TV has no pointer, so the old popover was unreachable. */
function setLobbyLayout() {
    setLayout('dpad', {
        title: 'Console lobby',
        subtitle: 'Leader picks a game',
        extras: [{ button: 'X', label: 'Theme' }, { button: 'Y', label: 'Theme' }]
    });
}

/* ==========================================================================
   Active Game Style Scoping & Game Context
   ========================================================================== */

let activeGameStyleEl = null;

function applyGameStyles(css) {
    if (!css) {
        clearGameStyles();
        return;
    }
    if (!activeGameStyleEl) {
        activeGameStyleEl = document.createElement('style');
        activeGameStyleEl.id = 'active-game-styles';
        document.head.appendChild(activeGameStyleEl);
    }
    activeGameStyleEl.textContent = css;
}

function clearGameStyles() {
    if (activeGameStyleEl) {
        activeGameStyleEl.textContent = '';
    }
}

function createGameContext(def) {
    return {
        id: def.id,
        meta: def,

        // Stage & Canvas
        get canvas() { return dom.canvas; },
        get ctx() { return CastOn.ctx; },
        get overlay() { return dom.overlay; },
        get view() { return CastOn.view; },
        get scale() { return CastOn.scale; },

        setOverlay(html) {
            if (dom.overlay) dom.overlay.innerHTML = html;
        },
        clearCanvas() {
            if (CastOn.ctx && dom.canvas) {
                CastOn.ctx.save();
                CastOn.ctx.setTransform(1, 0, 0, 1, 0, 0);
                CastOn.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
                CastOn.ctx.restore();
            }
        },

        // Players & State
        get players() { return state.players; },
        get vipId() { return state.vipId; },
        get vip() { return state.players[state.vipId] || null; },

        getRankedPlayers(scores) {
            return (CastOn.tools && CastOn.tools.sorted)
                ? CastOn.tools.sorted(state.players, scores)
                : Object.values(state.players || {});
        },

        // Mobile Controller Communication
        controller: {
            setLayout(layout, layoutState, target) {
                setLayout(layout, layoutState, target);
            },
            vibrate(ms, target) {
                vibrate(target, ms);
            },
            send(payload, target) {
                toController(target, payload);
            }
        },

        // Audio Blip Synth
        sound: {
            tone(freq, ms, type) { tone(freq, ms, type); },
            chord(freqs, ms, type) { chord(freqs, ms, type); },
            blip() { tone(580, 80, 'sine'); },
            pop() { tone(420, 60, 'triangle'); },
            success() { chord([523, 659, 784], 140, 'triangle'); },
            fail() { chord([311, 293], 180, 'sawtooth'); },
            fanfare() { chord([392, 523, 659, 784], 220, 'triangle'); }
        },

        // Shared UI & Graphics Toolkit
        ui: CastOn.tools || {},
        graphics: {
            get roundRect() { return CastOn.tools ? CastOn.tools.roundRect : null; },
            get circle() { return CastOn.tools ? CastOn.tools.circle : null; },
            get arenaBackdrop() { return CastOn.tools ? CastOn.tools.arenaBackdrop : null; },
            get label() { return CastOn.tools ? CastOn.tools.label : null; }
        },

        // Navigation
        backToLobby() {
            returnToLobby();
        }
    };
}

function launchGame(index) {
    const def = CastOn.games[index];
    if (!def) return;

    if (Object.keys(state.players).length === 0) {
        tone(220, 150, 'sawtooth');
        returnToLobby();
        return;
    }

    if (state.game && state.game.destroy) state.game.destroy();
    state.game = null;

    dom.lobby.classList.add('hidden');
    dom.gameView.classList.remove('hidden');
    state.mode = def.id;
    fitCanvas();
    dom.overlay.innerHTML = '';

    applyGameStyles(def.css);

    const ctx = createGameContext(def);
    try {
        state.game = def.create(ctx);
    } catch (err) {
        console.error('Game failed to start:', def.id, err);
        clearGameStyles();
        dom.overlay.innerHTML =
            '<div class="float-panel" style="position:static;max-width:460px;margin:auto">' +
            '<p class="eyebrow">Could not start</p>' +
            '<h2 class="display t-lg" style="margin-top:6px">' + escapeHtml(def.title) + '</h2>' +
            '<p class="muted t-sm" style="margin-top:8px">' + escapeHtml(String(err && err.message || err)) + '</p>' +
            '</div>';
    }
}

function returnToLobby() {
    if (state.game && state.game.destroy) state.game.destroy();
    state.game = null;
    clearGameStyles();
    dom.overlay.innerHTML = '';
    if (CastOn.ctx && dom.canvas) {
        CastOn.ctx.save();
        CastOn.ctx.setTransform(1, 0, 0, 1, 0, 0);
        CastOn.ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
        CastOn.ctx.restore();
    }
    showLobby();
    setLobbyLayout();
    chord([392, 523, 659], 130, 'triangle');
}

/* ==========================================================================
   Input routing
   ========================================================================== */

function onControllerInput(playerId, data) {
    if (data.action === 'home' && playerId === state.vipId) {
        returnToLobby();
        return;
    }

    if (state.mode === 'lobby') {
        if (playerId !== state.vipId) return;
        if (data.action !== 'btn' || data.state !== 'down') return;

        if (data.button === 'LEFT' || data.button === 'UP') moveSelection(-1);
        else if (data.button === 'RIGHT' || data.button === 'DOWN') moveSelection(1);
        else if (data.button === 'X') cycleTheme(-1);
        else if (data.button === 'Y') cycleTheme(1);
        else if (data.button === 'A') {
            chord([660, 880], 120, 'triangle');
            launchGame(state.selected);
        }
        return;
    }

    // When any active game has ended, pressing A (by the leader) returns to lobby to pick the next game
    if (state.game && (state.game.ended || state.game.phase === 'done' || state.game.finished)) {
        if (data.action === 'btn' && data.button === 'A' && data.state === 'down') {
            if (!state.vipId || playerId === state.vipId) {
                returnToLobby();
                return;
            }
        }
    }

    if (state.game && state.game.onInput) state.game.onInput(playerId, data);
}

/* ==========================================================================
   Websocket
   ========================================================================== */

function onPlayersSync(msg) {
    state.vipId = msg.vip_id;

    const incoming = {};
    msg.players.forEach(p => {
        incoming[p.id] = Object.assign({}, state.players[p.id] || {}, p);
    });

    // In preview mode keep locally seeded players the server knows nothing about.
    Object.keys(state.players).forEach(id => {
        if (!incoming[id] && state.players[id].__demo) incoming[id] = state.players[id];
    });

    // Exactly one leader. Seeded players default to is_vip, so clear the crown
    // from anyone the server has not actually promoted.
    Object.values(incoming).forEach(p => { p.is_vip = (p.id === state.vipId); });

    state.players = incoming;
    renderStrip();
    renderRoster();

    // If no one is connected or the last person disconnects, stop the game and return to the lobby
    if (Object.keys(state.players).length === 0) {
        if (state.mode !== 'lobby' || state.game !== null) {
            returnToLobby();
            return;
        }
    }

    if (state.game && state.game.onPlayersSync) state.game.onPlayersSync();
}

function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    try {
        ws = new WebSocket(proto + '//' + location.host + '/ws/tv');
    } catch (e) {
        return;
    }
    state.ws = ws;

    // Publish the lobby layout (with its theme legends) as soon as the socket
    // is up, so controllers that join later receive it from the server.
    ws.onopen = () => {
        send({ type: 'set_theme', theme: themeId() });
        setLobbyLayout();
    };

    ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }

        if (msg.type === 'reload') {
            location.reload();
            return;
        }

        if (msg.type === 'room_init') {
            state.code = msg.code;
            state.joinUrl = msg.join_url;
            state.lanIp = msg.lan_ip;
            if (dom.roomKey) dom.roomKey.textContent = msg.code;
            if (dom.joinUrl) dom.joinUrl.textContent = msg.lan_ip + '/controller';
            renderCodeSlots();
            redrawQr();
        } else if (msg.type === 'players_sync') {
            onPlayersSync(msg);
        } else if (msg.type === 'controller_input') {
            onControllerInput(msg.player_id, msg.data);
        }
    };

    ws.onclose = () => {
        const sub = document.getElementById('status-subtitle');
        if (sub) sub.textContent = 'Disconnected';
        if (state.mode !== 'lobby' || state.game !== null) {
            returnToLobby();
        }
    };
}

/* ==========================================================================
   Preview mode — seed fake players and map the keyboard onto a controller
   so the console can be driven from any desktop browser (?demo=N).
   ========================================================================== */

function seedDemoPlayers(n) {
    for (let i = 0; i < n; i++) {
        const id = 'demo_' + i;
        state.players[id] = {
            id: id,
            name: DEMO_NAMES[i % DEMO_NAMES.length],
            color: DEMO_COLORS[i % DEMO_COLORS.length],
            avatar: DEMO_FACES[i % DEMO_FACES.length],
            score: 0,
            is_vip: i === 0,
            __demo: true
        };
    }
    if (n) state.vipId = 'demo_0';
}

function bindPreviewKeyboard() {
    if (!DEMO_COUNT) return;

    const map = {
        ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN',
        Enter: 'A', ' ': 'A', Backspace: 'B', Escape: 'B',
        x: 'X', X: 'X', y: 'Y', Y: 'Y'
    };
    // The keyboard stands in for the room leader, matching server routing.
    const activeId = () => state.vipId || Object.keys(state.players)[0];

    w.addEventListener('keydown', (e) => {
        const btn = map[e.key];
        if (!btn || e.repeat) return;
        e.preventDefault();

        if (e.key === 'Escape') { returnToLobby(); return; }

        const id = activeId();
        if (!id) return;
        onControllerInput(id, { action: 'btn', button: btn, state: 'down' });
    });

    w.addEventListener('keyup', (e) => {
        const btn = map[e.key];
        if (!btn) return;
        const id = activeId();
        if (id) onControllerInput(id, { action: 'btn', button: btn, state: 'up' });
    });

    // Preview shortcut: number keys jump straight into a game.
    w.addEventListener('keydown', (e) => {
        const n = parseInt(e.key, 10);
        if (isNaN(n) || n < 1 || n > CastOn.games.length) return;
        state.selected = n - 1;
        renderLobbyTiles();
        launchGame(state.selected);
    });
}

/* ==========================================================================
   Public API consumed by the game modules
   ========================================================================== */

CastOn.state = state;
CastOn.themes = THEMES;
Object.defineProperty(CastOn, 'players', { get: () => state.players });
Object.defineProperty(CastOn, 'vipId', { get: () => state.vipId });
Object.defineProperty(CastOn, 'joinUrl', { get: () => state.joinUrl });

CastOn.games = [];
CastOn.registerGame = (def) => {
    if (!def || !def.id || !def.title || typeof def.create !== 'function') {
        console.error('CastOn: Invalid game registration', def);
        return;
    }
    const idx = CastOn.games.findIndex(g => g.id === def.id);
    if (idx >= 0) {
        CastOn.games[idx] = def;
    } else {
        CastOn.games.push(def);
    }
    if (dom.grid && state.mode === 'lobby') {
        renderLobbyTiles();
    }
};
CastOn.createGameContext = createGameContext;
CastOn.launchGame = launchGame;
CastOn.returnToLobby = returnToLobby;
CastOn.setLayout = setLayout;
CastOn.toController = toController;
CastOn.vibrate = vibrate;
CastOn.tone = tone;
CastOn.chord = chord;
CastOn.sound = {
    tone: (freq, ms, type) => tone(freq, ms, type),
    chord: (freqs, ms, type) => chord(freqs, ms, type),
    blip: () => tone(580, 80, 'sine'),
    pop: () => tone(420, 60, 'triangle'),
    success: () => chord([523, 659, 784], 140, 'triangle'),
    fail: () => chord([311, 293], 180, 'sawtooth'),
    fanfare: () => chord([392, 523, 659, 784], 220, 'triangle')
};
CastOn.escapeHtml = escapeHtml;
CastOn.themeId = themeId;
CastOn.themeMeta = themeMeta;
CastOn.themePalette = themeMeta;
CastOn.fitCanvas = fitCanvas;
CastOn.redrawQr = redrawQr;
CastOn.renderAll = renderAll;
CastOn.showLobby = showLobby;
CastOn.hud = (html) => { if (dom.overlay) dom.overlay.innerHTML = html; };
CastOn.inDemoMode = () => DEMO_COUNT > 0;
CastOn.scale = 1;
CastOn.updateTvScale = updateTvScale;

/* ==========================================================================
   Boot
   ========================================================================== */

function boot() {
    cacheDom();

    // dom.overlay and friends may be missing if the markup changed.
    if (!dom.canvas || !dom.overlay) return;

    document.documentElement.dataset.theme = themeId();

    CastOn.canvas = dom.canvas;
    CastOn.ctx = dom.canvas.getContext('2d');
    CastOn.overlay = dom.overlay;
    CastOn.view = { w: 0, h: 0, dpr: 1 };

    updateTvScale();
    renderThemeSwitcher();
    setLobbyLayout();
    seedDemoPlayers(DEMO_COUNT);
    renderAll();
    fitCanvas();
    bindPreviewKeyboard();
    redrawQr();

    const autoGame = new URLSearchParams(location.search).get('game');
    if (autoGame !== null) {
        const gIdx = parseInt(autoGame, 10);
        if (!isNaN(gIdx) && gIdx >= 0 && gIdx < CastOn.games.length) {
            launchGame(gIdx);
        }
    }

    if (dom.overlay) {
        dom.overlay.addEventListener('click', (e) => {
            const startBtn = e.target.closest('[data-howto-start="true"]');
            if (startBtn && state.game && typeof state.game.onInput === 'function') {
                const pid = state.vipId || Object.keys(state.players)[0] || 'tv';
                state.game.onInput(pid, { action: 'btn', button: 'A', state: 'down' });
            }
        });
    }

    if (dom.grid) {
        dom.grid.addEventListener('wheel', (e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                dom.grid.scrollLeft += e.deltaY;
                e.preventDefault();
            }
        }, { passive: false });
    }

    w.addEventListener('resize', () => {
        updateTvScale();
        redrawQr();
        fitCanvas();
        // Column count changes with width, so rebuild before re-trimming.
        renderRoster();
    });

    connect();
}

document.addEventListener('DOMContentLoaded', boot);

})(window);
