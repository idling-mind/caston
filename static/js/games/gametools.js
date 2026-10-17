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

/** Draw the standard dark arena backdrop used by the canvas games. */
T.arenaBackdrop = function (view) {
    const g = CastOn.ctx;
    const grad = g.createRadialGradient(
        view.w / 2, view.h * 0.42, 0,
        view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.75
    );
    grad.addColorStop(0, '#132552');
    grad.addColorStop(0.55, '#0a1229');
    grad.addColorStop(1, '#05080f');
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

CastOn.tools = T;

})(window);
