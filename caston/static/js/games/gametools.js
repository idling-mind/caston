/* ==========================================================================
   CastOn — shared game toolkit
   Canvas + DOM helpers reused by every game module. Keeps the individual
   games focused on rules rather than plumbing.
   ========================================================================== */
(function (w) {
'use strict';

const CastOn = w.CastOn;
const esc = CastOn.escapeHtml || ((s) => String(s == null ? '' : s));
const icon = (n, o) => CastOn.icon(n, o);

const T = {};

T.avatar = function (face) {
    if (CastOn.renderAvatar) return CastOn.renderAvatar(face);
    if (!face) return '🎮';
    if (typeof face === 'string' && (face.startsWith('data:image/') || face.startsWith('http://') || face.startsWith('https://') || face.startsWith('/'))) {
        return `<img class="avatar__img" src="${face}" alt="Avatar">`;
    }
    return esc(face);
};

/* ---------- canvas primitives -------------------------------------------- */

T.roundRect = function (g, x, y, rw, rh, r) {
    const rr = Math.max(0, Math.min(r, rw / 2, rh / 2));
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + rw, y, x + rw, y + rh, rr);
    g.arcTo(x + rw, y + rh, x, y + rh, rr);
    g.arcTo(x, y + rh, x, y, rr);
    g.arcTo(x, y, x + rw, y, rr);
    g.closePath();
};

T.circle = function (g, x, y, r) {
    g.beginPath();
    g.arc(x, y, Math.max(1, r), 0, Math.PI * 2);
};

/** Return the active console theme palette tokens for canvas rendering. */
T.theme = function (id) {
    if (CastOn.themePalette) return CastOn.themePalette(id);
    if (CastOn.themeMeta) return CastOn.themeMeta(id);
    return {
        id: 'broadcast',
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
    };
};

/**
 * Clear the canvas so the console's themed SVG wave background (.app-bg)
 * shines through, with a soft radial edge vignette for foreground contrast.
 */
T.arenaBackdrop = function (view) {
    const g = CastOn.ctx;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    g.restore();

    const grad = g.createRadialGradient(
        view.w / 2, view.h * 0.46, Math.min(view.w, view.h) * 0.18,
        view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.78
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.65, 'rgba(4, 8, 22, 0.14)');
    grad.addColorStop(1, 'rgba(2, 6, 18, 0.36)');
    g.fillStyle = grad;
    g.fillRect(0, 0, view.w, view.h);
};

T.label = function (text, x, y, o) {
    const g = CastOn.ctx;
    const opts = o || {};
    g.font = (opts.weight || 700) + ' ' + (opts.size || 14) + 'px ' +
        (opts.display === false ? '"Inter", sans-serif' : '"Space Grotesk", "Inter", sans-serif');
    g.fillStyle = opts.color || '#ffffff';
    g.textAlign = opts.align || 'center';
    g.textBaseline = opts.baseline || 'middle';
    g.fillText(text, x, y);
};

/* ---------- score helpers ------------------------------------------------ */

/**
 * Rank a set of players by score.
 * @param {object|Array} players  CastOn.players (a keyed map) or an array
 * @param {object} scores         map of playerId -> numeric score
 * @returns {Array} new array, highest score first
 */
T.sorted = function (players, scores) {
    const list = Array.isArray(players) ? players : Object.values(players || {});
    const table = scores || {};
    return list
        .map(p => Object.assign({}, p, { score: Math.round(table[p.id] || 0) }))
        .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));
};

/* ---------- DOM fragments used inside the TV overlay -------------------- */

/**
 * Ranked leaderboard list.
 * @param {Array} rows  output of T.sorted()
 * @param {{compact?:boolean}} [opts]
 */
T.leaderboard = function (rows, opts) {
    if (!rows.length) {
        return '<p class="dim t-sm" style="text-align:center;padding:12px">Waiting for players…</p>';
    }
    return '<div class="lb' + (opts && opts.compact ? ' lb--tight' : '') + '">' + rows.map((r, i) => `
        <div class="lb__row" style="--ring-color:${r.color}">
            <span class="lb__rank">${i + 1}</span>
            <span class="row" style="gap:10px;min-width:0">
                <span class="avatar avatar--sm" style="--ring-color:${r.color}">${T.avatar(r.avatar)}</span>
                <span class="lb__name">${esc(r.name)}</span>
            </span>
            <span class="lb__score">${r.score}</span>
        </div>
    `).join('') + '</div>';
};

/** A horizontal score rail for the top of the screen during play. */
T.scoreRail = function (rows) {
    if (!rows.length) return '';
    return '<div class="rail">' + rows.map(r => `
        <span class="rail__item" style="--ring-color:${r.color}">
            <span class="rail__face">${T.avatar(r.avatar)}</span>
            <span class="rail__name">${esc(r.name)}</span>
            <span class="rail__score">${r.score}</span>
        </span>
    `).join('') + '</div>';
};

/**
 * End-of-game results card.
 * @param {{title:string, kicker?:string, rows:Array, playerCount:number,
 *          footer?:string, accent?:string}} cfg
 */
T.results = function (cfg) {
    const top = cfg.rows[0];
    const podium = cfg.rows.slice(0, 3);
    const rest = cfg.rows.slice(3);

    const podiumHtml = podium.map((r, i) => `
        <div class="podium__slot podium__slot--${i + 1}" style="--ring-color:${r.color}">
            <span class="podium__place">${i === 0 ? icon('trophy') : (i + 1) + ''}</span>
            <span class="avatar avatar--lg" style="--ring-color:${r.color}">${T.avatar(r.avatar)}</span>
            <span class="podium__name">${esc(r.name)}</span>
            <span class="podium__score">${r.score}</span>
        </div>
    `).join('');

    return `
        <div class="scoreboard">
            <div class="scoreboard__head">
                <p class="eyebrow is-accent">${esc(cfg.kicker || 'Final results')}</p>
                <h2 class="display t-xl">${esc(top ? top.name : cfg.title)}</h2>
                <p class="muted t-sm" style="margin-top:6px">takes it with ${top ? top.score : 0} points</p>
            </div>
            <div class="podium">${podiumHtml}</div>
            ${rest.length ? `<div class="scoreboard__rest">${T.leaderboard(rest, { compact: true })}</div>` : ''}
            <p class="scoreboard__foot">${icon('crown')}<span>${esc(cfg.footer || 'Leader: press A on your phone to pick the next game')}</span></p>
        </div>
    `;
};

/**
 * Standard game clock display component.
 * @param {number|string} seconds
 * @param {{isHot?: boolean, label?: string}} [opts]
 */
T.clock = function (seconds, opts) {
    const o = opts || {};
    const hotClass = o.isHot ? ' is-hot' : '';
    return `
        <div class="q-screen__clock">
            ${o.label ? `<span class="eyebrow">${esc(o.label)}</span>` : ''}
            <span class="numeral${hotClass}">${esc(String(seconds))}</span>
        </div>
    `;
};

/**
 * Standard top HUD bar for game stages.
 * @param {{title?: string, subtitle?: string, kicker?: string, right?: string}} cfg
 */
T.hudBanner = function (cfg) {
    return `
        <div class="row row--between" style="width:100%;align-items:flex-start;padding:12px var(--gutter);gap:16px;">
            <div>
                ${cfg.kicker ? `<p class="eyebrow is-accent">${esc(cfg.kicker)}</p>` : ''}
                ${cfg.title ? `<h2 class="display t-lg" style="margin-top:2px">${esc(cfg.title)}</h2>` : ''}
                ${cfg.subtitle ? `<p class="dim t-xs" style="margin-top:4px">${esc(cfg.subtitle)}</p>` : ''}
            </div>
            ${cfg.right ? `<div>${cfg.right}</div>` : ''}
        </div>
    `;
};

/**
 * Standard floating panel / dialog card.
 * @param {string} contentHtml
 * @param {{width?: number|string, align?: string}} [opts]
 */
T.card = function (contentHtml, opts) {
    const o = opts || {};
    const maxW = typeof o.width === 'number' ? o.width + 'px' : (o.width || '520px');
    return `
        <div class="scoreboard" style="max-width:${maxW};margin:auto;pointer-events:auto;">
            ${contentHtml}
        </div>
    `;
};

/**
 * Universal Design System "How to Play" Rules Modal (No auto-countdown; starts on button press).
 * @param {object} cfg
 */
T.howToPlay = function (cfg) {
    const stepsHtml = (cfg.steps || []).map((st, idx) => `
        <div class="howto-step">
            <span class="howto-step__num">${idx + 1}</span>
            <h4 class="howto-step__title">${esc(st.title)}</h4>
            <p class="howto-step__desc">${esc(st.text)}</p>
        </div>
    `).join('');

    const rightActionHtml = cfg.isMidGame
        ? `<button type="button" class="howto-start-btn" data-howto-start="true"><span class="howto-start-btn__key">Y</span><span>Resume Game</span></button>`
        : `<button type="button" class="howto-start-btn" data-howto-start="true"><span class="howto-start-btn__key">A</span><span>Start Game</span></button>`;

    return `
        <div class="howto-modal-wrap">
            <div class="howto-card">
                <div class="howto-head">
                    <div class="howto-head__left">
                        <p class="eyebrow is-accent">${esc(cfg.tagline || 'HOW TO PLAY · GAME BRIEFING')}</p>
                        <h2 class="display t-xl" style="margin:0">${esc(cfg.title || 'Game Rules')}</h2>
                        ${cfg.subtitle ? `<p class="muted t-sm" style="margin:2px 0 0">${esc(cfg.subtitle)}</p>` : ''}
                    </div>
                    ${rightActionHtml}
                </div>
                <div class="howto-grid">${stepsHtml}</div>
                <div class="howto-controls">
                    <div class="howto-controls__item">
                        <span class="howto-controls__key">PHONE</span>
                        <span>${esc(cfg.controls || 'Follow the prompts on your phone controller.')}</span>
                    </div>
                    <div class="howto-controls__item">
                        <span class="howto-controls__key">GOAL</span>
                        <span>${esc(cfg.scoring || 'Outscore your rivals to take the crown!')}</span>
                    </div>
                </div>
                <div class="howto-foot">
                    <span class="dim t-xs">${cfg.isMidGame ? 'Press Y on controller to close this rules guide' : 'Take your time reading the rules — no countdown timer!'}</span>
                    <span class="hud-pill hud-pill--accent">${cfg.isMidGame ? 'Press Y to Resume' : 'Press A or Tap "▶ Start Game" on Phone to Begin'}</span>
                </div>
            </div>
        </div>
    `;
};

CastOn.tools = T;

/* ---------- Formal Game Base Class --------------------------------------- */

/**
 * Base class for all CastOn games. Optional to extend, but serves as the
 * authoritative reference for the Game Interface Contract.
 */
class CastOnGame {
    /**
     * @param {object} ctx - Injected GameContext providing all engine services
     */
    constructor(ctx) {
        this.ctx = ctx || CastOn;
    }

    /**
     * Called when the TV canvas view changes dimensions or pixel density.
     * @param {{w: number, h: number, dpr: number, scale: number}} view
     */
    onResize(view) {}

    /**
     * Called whenever a player connects, disconnects, or updates their profile.
     */
    onPlayersSync() {}

    /**
     * Called when a mobile controller sends input (buttons, strokes, answers).
     * @param {string} playerId
     * @param {object} data
     */
    onInput(playerId, data) {}

    /**
     * Called when exiting the game. Stop all rAF loops, intervals, and audio here.
     */
    destroy() {}
}

CastOn.Game = CastOnGame;

})(window);
