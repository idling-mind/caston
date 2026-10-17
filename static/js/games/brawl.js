/* ==========================================================================
   Game — Bumper Brawl
   Real-time arena physics. Players accelerate with the D-Pad, scoop energy
   orbs for points, and ram each other to knock opponents off their axis.
   ========================================================================== */
(function (w) {
'use strict';

const C = w.CastOn;
const T = C.tools;

const avatarImgCache = new Map();
function getAvatarImg(src) {
    let img = avatarImgCache.get(src);
    if (!img) {
        img = new Image();
        img.src = src;
        avatarImgCache.set(src, img);
    }
    return img;
}

const ARENA = { pad: 46, accel: 0.95, drag: 0.915, maxSpeed: 26 };
const ORB_VALUE = 10;
const ROUND_MS = 75000;
const SUDDEN_DEATH_MS = 15000;

class BumperBrawl {
    constructor() {
        this.id = 'brawl';
        this.entities = {};
        this.orbs = [];
        this.scores = {};
        this.running = true;
        this.ended = false;
        this.startTime = performance.now();
        this.lastFrame = this.startTime;
        this.matchEndsAt = this.startTime + ROUND_MS;
        C.setLayout('dpad', { title: 'Bumper brawl', subtitle: 'Joystick moves · A boosts' });

        this.view = C.view;
        this.spawnOrbs(4);
        this.sync();
        this.draw = this.draw.bind(this);
        requestAnimationFrame(this.draw);
    }

    /* ---------- setup ---------------------------------------------------- */

    sync() {
        const players = C.players;

        Object.keys(players).forEach((id, i) => {
            if (this.entities[id]) { this.entities[id].player = players[id]; return; }
            const angle = (i / Math.max(1, Object.keys(players).length)) * Math.PI * 2;
            this.entities[id] = {
                player: players[id],
                x: this.view.w / 2 + Math.cos(angle) * 180,
                y: this.view.h / 2 + Math.sin(angle) * 180,
                vx: 0, vy: 0,
                r: 30,
                boost: 0,
                bob: Math.random() * Math.PI * 2
            };
            this.scores[id] = 0;
        });

        Object.keys(this.entities).forEach(id => {
            if (!players[id]) { delete this.entities[id]; delete this.scores[id]; }
        });
    }

    spawnOrbs(n) {
        for (let i = 0; i < n; i++) this.orbs.push(this.makeOrb());
    }

    makeOrb() {
        // Orbs must live inside the ring, otherwise they are unreachable.
        const view = this.view;
        const arenaR = Math.min(view.w, view.h) / 2 - ARENA.pad;
        const r = 15;
        const maxR = Math.max(40, arenaR - r - 46);
        const angle = Math.random() * Math.PI * 2;
        // sqrt keeps the distribution even across the disc instead of clumping
        // everything towards the centre.
        const dist = Math.sqrt(Math.random()) * maxR;

        return {
            x: view.w / 2 + Math.cos(angle) * dist,
            y: view.h / 2 + Math.sin(angle) * dist,
            r: r,
            phase: Math.random() * Math.PI * 2
        };
    }

    /* ---------- lifecycle ------------------------------------------------ */

    onResize(view) {
        this.view = view;
    }

    onPlayersSync() {
        this.sync();
    }

    onInput(id, data) {
        const e = this.entities[id];
        if (!e || this.ended) return;

        if (data.action === 'joystick') {
            e.jx = data.x;
            e.jy = data.y;
            e.useJoystick = (data.active !== false && (data.x !== 0 || data.y !== 0));
        } else if (data.action === 'btn') {
            const { button, state } = data;
            if (['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(button)) {
                e.inputs = e.inputs || {};
                e.inputs[button] = state === 'down';
            } else if (button === 'A' && state === 'down') {
                e.boost = 14;
                C.vibrate(id, 30);
                C.tone(680, 80, 'sawtooth');
            }
        }
    }

    /* ---------- simulation ----------------------------------------------- */

    draw() {
        if (!this.running) return;
        const g = C.ctx;
        const view = this.view;

        const now = performance.now();
        const dt = Math.min(32, now - this.lastFrame);
        this.lastFrame = now;

        if (!this.ended) this.step(dt, now);
        this.render(g, view, now);

        // Once the results card is up there is nothing left to animate, so we
        // stop the loop and leave the final arena frame on screen.
        if (this.ended) return;
        requestAnimationFrame(this.draw);
    }

    step(dt, now) {
        const view = this.view;
        const k = dt / 16.67; // normalise to 60fps
        const remaining = this.matchEndsAt - now;
        this.phase = remaining < SUDDEN_DEATH_MS ? 'sudden' : 'play';

        const cx = view.w / 2;
        const cy = view.h / 2;
        const arenaR = Math.min(view.w, view.h) / 2 - ARENA.pad;

        Object.keys(this.entities).forEach(id => {
            const e = this.entities[id];
            const inp = e.inputs || {};

            if (e.useJoystick) {
                e.vx += (e.jx || 0) * ARENA.accel * k;
                e.vy += (e.jy || 0) * ARENA.accel * k;
            } else {
                if (inp.UP) e.vy -= ARENA.accel * k;
                if (inp.DOWN) e.vy += ARENA.accel * k;
                if (inp.LEFT) e.vx -= ARENA.accel * k;
                if (inp.RIGHT) e.vx += ARENA.accel * k;
            }

            if (e.boost > 0) {
                const speed = Math.hypot(e.vx, e.vy);
                if (speed > 0.6) {
                    e.vx += (e.vx / speed) * e.boost * 0.55;
                    e.vy += (e.vy / speed) * e.boost * 0.55;
                }
                e.boost = Math.max(0, e.boost - k);
            }

            const drag = Math.pow(ARENA.drag, k);
            e.vx *= drag;
            e.vy *= drag;

            const speed = Math.hypot(e.vx, e.vy);
            if (speed > ARENA.maxSpeed) {
                e.vx = (e.vx / speed) * ARENA.maxSpeed;
                e.vy = (e.vy / speed) * ARENA.maxSpeed;
            }

            e.x += e.vx * k;
            e.y += e.vy * k;

            // Arena ring
            const dx = e.x - cx;
            const dy = e.y - cy;
            const dist = Math.hypot(dx, dy) || 0.001;
            if (dist + e.r > arenaR) {
                const nx = dx / dist;
                const ny = dy / dist;
                e.x = cx + nx * (arenaR - e.r);
                e.y = cy + ny * (arenaR - e.r);
                const dot = e.vx * nx + e.vy * ny;
                e.vx -= 1.7 * dot * nx;
                e.vy -= 1.7 * dot * ny;
                if (Math.abs(dot) > 7) C.tone(180, 60, 'square');
            }

            // Orbs
            this.orbs.forEach((orb, i) => {
                if (Math.hypot(e.x - orb.x, e.y - orb.y) < e.r + orb.r + 4) {
                    this.scores[id] = (this.scores[id] || 0) + ORB_VALUE;
                    C.tone(920, 110, 'sine');
                    C.vibrate(id, 35);
                    C.toController(id, { type: 'score_update', score: this.scores[id] });
                    this.orbs[i] = this.makeOrb();
                }
            });
        });

        // Player-vs-player shoving
        const ids = Object.keys(this.entities);
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const a = this.entities[ids[i]];
                const b = this.entities[ids[j]];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy) || 0.001;
                const min = a.r + b.r;

                if (dist < min) {
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const overlap = min - dist;
                    a.x -= nx * overlap * 0.5;
                    a.y -= ny * overlap * 0.5;
                    b.x += nx * overlap * 0.5;
                    b.y += ny * overlap * 0.5;

                    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
                    const impulse = Math.max(6, Math.abs(rel) * 1.15);
                    a.vx -= nx * impulse;
                    a.vy -= ny * impulse;
                    b.vx += nx * impulse;
                    b.vy += ny * impulse;

                    a.hit = b.hit = 1;
                    if (Math.abs(rel) > 3) {
                        C.tone(150, 70, 'square');
                        C.vibrate('all', 30);
                    }
                }
            }
        }

        // Boost ring for the closing seconds
        this.orbs = this.orbs.filter(Boolean);
        if (this.orbs.length < (this.phase === 'sudden' ? 7 : 4)) {
            this.orbs.push(this.makeOrb());
        }

        if (now >= this.matchEndsAt) this.finish();
    }

    finish() {
        if (this.ended) return;
        this.ended = true;
        C.chord([523, 659, 784], 150, 'triangle');
        const rows = T.sorted(C.players, this.scores);
        C.hud(T.results({
            title: 'Bumper Brawl',
            kicker: 'Brawl complete',
            rows: rows,
            footer: 'Leader: press A to pick the next game'
        }));
    }

    /* ---------- render --------------------------------------------------- */

    render(g, view, now) {
        T.arenaBackdrop(view);

        const cx = view.w / 2;
        const cy = view.h / 2;
        const arenaR = Math.min(view.w, view.h) / 2 - ARENA.pad;

        // Arena floor
        g.save();
        T.circle(g, cx, cy, arenaR);
        const floor = g.createRadialGradient(cx, cy, arenaR * 0.15, cx, cy, arenaR);
        floor.addColorStop(0, 'rgba(56,112,255,0.16)');
        floor.addColorStop(1, 'rgba(6,12,28,0.9)');
        g.fillStyle = floor;
        g.fill();

        g.lineWidth = 5;
        g.strokeStyle = this.phase === 'sudden' ? 'rgba(244,63,94,0.95)' : 'rgba(59,130,246,0.85)';
        g.shadowColor = this.phase === 'sudden' ? '#f43f5e' : '#3b82f6';
        g.shadowBlur = 26;
        g.stroke();
        g.restore();

        // Inner guide rings
        g.save();
        g.globalAlpha = 0.16;
        g.strokeStyle = '#93c5fd';
        g.lineWidth = 1.5;
        [0.33, 0.66].forEach(f => {
            T.circle(g, cx, cy, arenaR * f);
            g.stroke();
        });
        g.restore();

        // Energy orbs
        this.orbs.filter(Boolean).forEach(orb => {
            const pulse = 1 + Math.sin(now / 320 + orb.phase) * 0.14;
            g.save();
            T.circle(g, orb.x, orb.y, orb.r * pulse);
            g.fillStyle = '#fbbf24';
            g.shadowColor = '#f59e0b';
            g.shadowBlur = 26;
            g.fill();
            g.restore();
        });

        // Players
        Object.keys(this.entities).forEach(id => {
            const e = this.entities[id];
            const p = e.player;
            if (!p) return;

            if (e.hit) {
                g.save();
                T.circle(g, e.x, e.y, e.r + 18 * e.hit);
                g.strokeStyle = 'rgba(255,255,255,' + (0.5 * e.hit) + ')';
                g.lineWidth = 3;
                g.stroke();
                g.restore();
                e.hit *= 0.88;
                if (e.hit < 0.02) e.hit = 0;
            }

            const wobble = Math.sin(now / 260 + e.bob) * 2;
            const r = e.r + (e.boost > 0 ? e.boost * 0.5 : 0) + wobble * 0.3;

            g.save();
            g.shadowColor = p.color;
            g.shadowBlur = e.boost > 0 ? 34 : 18;
            T.circle(g, e.x, e.y, r);
            g.fillStyle = p.color;
            g.fill();
            g.shadowBlur = 0;
            g.lineWidth = 3.5;
            g.strokeStyle = 'rgba(255,255,255,0.9)';
            g.restore();

            const isImg = p.avatar && typeof p.avatar === 'string' &&
                (p.avatar.startsWith('data:image/') || p.avatar.startsWith('http://') || p.avatar.startsWith('https://') || p.avatar.startsWith('/'));

            if (isImg) {
                const img = getAvatarImg(p.avatar);
                if (img && img.complete && img.naturalWidth > 0) {
                    g.save();
                    g.beginPath();
                    g.arc(e.x, e.y, r - 3, 0, Math.PI * 2);
                    g.clip();
                    g.drawImage(img, e.x - r + 3, e.y - r + 3, (r - 3) * 2, (r - 3) * 2);
                    g.restore();
                } else {
                    g.font = '24px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
                    g.textAlign = 'center';
                    g.textBaseline = 'middle';
                    g.fillText('👤', e.x, e.y + 1);
                }
            } else {
                g.font = '26px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.fillText(p.avatar || '🎮', e.x, e.y + 1);
            }

            T.label(p.name.toUpperCase(), e.x, e.y - r - 20, {
                size: 12, weight: 600, color: 'rgba(255,255,255,0.72)'
            });
            T.label(String(Math.round(this.scores[id] || 0)), e.x, e.y - r - 40, {
                size: 20, color: '#fbbf24'
            });
        });

        if (!this.ended) this.renderHud(g, view, now);
    }

    renderHud(g, view, now) {
        const left = Math.max(0, Math.ceil((this.matchEndsAt - now) / 1000));
        const mm = String(Math.floor(left / 60)).padStart(2, '0');
        const ss = String(left % 60).padStart(2, '0');

        T.label(mm + ':' + ss, view.w / 2, 42, {
            size: 40, color: left <= 15 ? '#f43f5e' : 'rgba(255,255,255,0.92)'
        });

        if (this.phase === 'sudden') {
            T.label('SUDDEN DEATH', view.w / 2, 76, { size: 13, color: '#f43f5e' });
        }

        const rows = T.sorted(C.players, this.scores);
        const top = rows.slice(0, 5);

        top.forEach((r, i) => {
            const y = 32 + i * 30;
            g.save();
            g.globalAlpha = 0.9;
            T.roundRect(g, view.w - 210, y - 13, 182, 26, 6);
            g.fillStyle = 'rgba(6,10,24,0.55)';
            g.fill();
            g.fillStyle = r.color;
            g.fillRect(view.w - 210, y - 13, 3, 26);
            g.restore();

            const rAvatar = (r.avatar && typeof r.avatar === 'string' && r.avatar.startsWith('data:image/')) ? '👤' : (r.avatar || '🎮');
            T.label(rAvatar + ' ' + r.name, view.w - 200, y, {
                size: 13, weight: 600, align: 'left', color: 'rgba(255,255,255,0.9)'
            });
            T.label(String(r.score), view.w - 40, y, {
                size: 15, align: 'right', color: '#fbbf24'
            });
        });
    }

    destroy() {
        this.running = false;
    }
}

C.registerGame({
    id: 'brawl',
    title: 'Bumper Brawl',
    tagline: 'Hot',
    players: '2–8 players',
    control: 'Joystick + boost',
    description: 'Scoop energy orbs and ram rivals out of the arena ring. Last dash wins the crowd.',
    accent: '#f43f5e',
    icon: 'flame',
    create: () => new BumperBrawl()
});

})(window);
