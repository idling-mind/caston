/* ==========================================================================
   Game — Sketch & Guess
   One player gets a drawing pad on their phone and streams normalised
   stroke vectors to the TV; everyone else races to type the word.
   ========================================================================== */
(function (w) {
'use strict';

const C = w.CastOn;
const T = C.tools;

const ROUND_MS = 90000;
const ROUNDS = 6;
const REVEAL_MS = 4000;
const GUESS_POINTS = 700;
const DRAWER_POINTS = 400;

const WORDS = [
    'BICYCLE', 'PIZZA', 'ROBOT', 'CASTLE', 'VOLCANO', 'GIRAFFE', 'SNOWMAN',
    'HELICOPTER', 'ELEPHANT', 'GUITAR', 'UMBRELLA', 'PENGUIN', 'ROCKET',
    'LIGHTHOUSE', 'CACTUS', 'BALLOON', 'CROCODILE', 'TELESCOPE', 'TEAPOT',
    'DINOSAUR', 'SKATEBOARD', 'JELLYFISH', 'WINDMILL', 'SUBMARINE'
];

class SketchGuess {
    constructor(ctx) {
        this.ctx = ctx || C;
        this.id = 'sketch';
        this.scores = {};
        this.round = -1;
        this.order = [];
        this.drawerId = null;
        this.word = '';
        this.guesses = [];
        this.solvedBy = null;
        this.phase = 'idle';
        this.rafId = null;
        this.timeoutId = null;
        this.strokes = [];
        this.aspect = 4 / 3;

        Object.keys(C.players).forEach(id => { this.scores[id] = 0; });
        this.buildOrder();
        this.beginRound();
        this.startClock();
    }

    /* ---------- setup ---------------------------------------------------- */

    buildOrder() {
        const ids = Object.keys(C.players);
        this.order = ids.slice();
        for (let i = this.order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = this.order[i]; this.order[i] = this.order[j]; this.order[j] = tmp;
        }
    }

    onPlayersSync() {
        Object.keys(C.players).forEach(id => {
            if (this.scores[id] === undefined) this.scores[id] = 0;
        });

        if (!C.players[this.drawerId] && this.phase !== 'done') {
            this.beginRound();
            return;
        }

        if (this.phase === 'drawing' && this.drawerId && C.players[this.drawerId]) {
            C.toController(this.drawerId, {
                type: 'update_guessers',
                guessers: this.getGuessersList()
            });
        }
    }

    getGuessersList() {
        return Object.values(C.players)
            .filter(p => p.id !== this.drawerId)
            .map(p => ({
                id: p.id,
                name: p.name,
                avatar: p.avatar,
                color: p.color
            }));
    }

    /* ---------- flow ----------------------------------------------------- */

    beginRound() {
        this.round++;

        if (this.round >= ROUNDS || !Object.keys(C.players).length) {
            this.finish();
            return;
        }

        this.buildOrder();
        this.drawerId = this.order[this.round % this.order.length];
        this.word = WORDS[(this.round * 7 + Math.floor(Math.random() * 5)) % WORDS.length];
        this.guesses = [];
        this.solvedBy = null;
        this.solvedVerbal = false;
        this.strokes = [];
        this.phase = 'drawing';
        this.accepting = true;
        this.roundStart = performance.now();

        const drawer = C.players[this.drawerId];
        const drawerName = drawer ? drawer.name : 'Player';
        const guessers = this.getGuessersList();

        Object.keys(C.players).forEach(id => {
            if (id === this.drawerId) {
                C.setLayout('draw', {
                    title: 'You are drawing',
                    subtitle: 'Illustrate: ' + this.word,
                    word: this.word,
                    guessers: guessers
                }, id);
            } else {
                C.setLayout('guess', { title: 'Guess the sketch', subtitle: drawerName + ' is drawing' }, id);
            }
        });

        this.paintBoard();
        this.render();
        C.chord([523, 659], 110, 'triangle');
    }

    startClock() {
        const tick = () => {
            if (this.phase === 'done') return;

            if (this.accepting && performance.now() - this.roundStart >= ROUND_MS) {
                this.timeUp();
            } else if (this.accepting) {
                this.updateClock();
            }
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    updateClock() {
        const left = Math.max(0, 1 - (performance.now() - this.roundStart) / ROUND_MS);
        const bar = document.getElementById('sk-bar');
        const clock = document.getElementById('sk-clock');
        if (bar) bar.style.width = (left * 100) + '%';
        if (clock) {
            const secs = Math.ceil(Math.max(0, ROUND_MS - (performance.now() - this.roundStart)) / 1000);
            if (clock.textContent !== secs + 's') clock.textContent = secs + 's';
            clock.classList.toggle('is-hot', secs <= 10);
        }
    }

    /* ---------- input ---------------------------------------------------- */

    onResize(view) {
        this.redrawStrokes();
    }

    getBoardRect() {
        const v = C.view;
        const scale = (v && v.scale) || C.scale || 1;
        const topOffset = 118 * scale;
        const bottomOffset = 22 * scale;
        const availH = Math.max(100 * scale, v.h - topOffset - bottomOffset);

        // Maximum width centered on screen that leaves clearance for the right-hand guesses panel
        const maxCenteredW = Math.max(100 * scale, Math.min(v.w - 48 * scale, v.w - 600 * scale));

        const aspect = (typeof this.aspect === 'number' && this.aspect > 0.1 && this.aspect < 10) ? this.aspect : (4 / 3);

        let bw = availH * aspect;
        let bh = availH;

        if (bw > maxCenteredW) {
            bw = maxCenteredW;
            bh = bw / aspect;
        }

        // Exact horizontal center on the full TV screen
        const bx = (v.w - bw) / 2;
        // Exact vertical center in the stage area below the top HUD
        const by = topOffset + (availH - bh) / 2;

        return { x: bx, y: by, w: bw, h: bh };
    }

    onInput(playerId, data) {
        if (playerId === this.drawerId) {
            if (data.action === 'draw_pad_init') {
                if (typeof data.aspect === 'number' && data.aspect > 0) {
                    if (Math.abs(data.aspect - (this.aspect || 0)) > 0.01) {
                        this.aspect = data.aspect;
                        this.redrawStrokes();
                    }
                }
                return;
            }
            if (data.action === 'draw_stroke') {
                this.onStroke(data);
                return;
            }
            if (data.action === 'accept_guess' && this.accepting) {
                this.solveRound(data.guesserId, true);
                return;
            }
            if ((this.phase === 'solved' || this.phase === 'timeup') && data.action === 'submit_guess') {
                clearTimeout(this.timeoutId);
                this.beginRound();
                return;
            }
        }

        if (data.action === 'submit_guess' && this.accepting && playerId !== this.drawerId) {
            this.onGuess(playerId, data.text);
        }
    }

    solveRound(winnerId, isVerbal = false) {
        if (!this.accepting) return;
        const p = C.players[winnerId];
        if (!p || winnerId === this.drawerId) return;

        const elapsed = performance.now() - this.roundStart;
        const speed = Math.max(0, 1 - elapsed / ROUND_MS);
        const gained = Math.round(GUESS_POINTS + 300 * speed);
        this.scores[winnerId] = (this.scores[winnerId] || 0) + gained;

        if (C.players[this.drawerId]) {
            this.scores[this.drawerId] = (this.scores[this.drawerId] || 0) + DRAWER_POINTS;
            C.toController(this.drawerId, { type: 'score_update', score: this.scores[this.drawerId] });
            C.vibrate(this.drawerId, 70);
        }

        this.solvedBy = winnerId;
        this.solvedVerbal = !!isVerbal;

        C.toController(winnerId, { type: 'score_update', score: this.scores[winnerId] });
        C.vibrate(winnerId, 140);
        C.chord([784, 988, 1175], 130, 'triangle');

        this.guesses.unshift({
            name: p.name,
            avatar: p.avatar,
            text: this.word,
            correct: true,
            verbal: !!isVerbal
        });
        this.accepting = false;
        this.phase = 'solved';
        this.render();

        this.timeoutId = setTimeout(() => this.beginRound(), REVEAL_MS);
    }

    drawSegment(x0, y0, x1, y1, color) {
        const b = this.getBoardRect();
        const g = C.ctx;
        const scale = (C.view && C.view.scale) || C.scale || 1;

        g.save();
        g.beginPath();
        g.rect(b.x, b.y, b.w, b.h);
        g.clip();

        g.strokeStyle = color || '#1d4ed8';
        g.lineWidth = Math.max(3.5 * scale, b.h * 0.012);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(b.x + x0 * b.w, b.y + y0 * b.h);
        g.lineTo(b.x + x1 * b.w, b.y + y1 * b.h);
        g.stroke();
        g.restore();
    }

    redrawStrokes() {
        this.paintBoard();
        const b = this.getBoardRect();
        const g = C.ctx;
        const scale = (C.view && C.view.scale) || C.scale || 1;

        g.save();
        g.beginPath();
        g.rect(b.x, b.y, b.w, b.h);
        g.clip();

        g.lineWidth = Math.max(3.5 * scale, b.h * 0.012);
        g.lineCap = 'round';
        g.lineJoin = 'round';

        for (let i = 0; i < this.strokes.length; i++) {
            const s = this.strokes[i];
            g.strokeStyle = s[4] || '#1d4ed8';
            g.beginPath();
            g.moveTo(b.x + s[0] * b.w, b.y + s[1] * b.h);
            g.lineTo(b.x + s[2] * b.w, b.y + s[3] * b.h);
            g.stroke();
        }
        g.restore();
    }

    onStroke(data) {
        if (data.clear) {
            this.strokes = [];
            this.paintBoard();
            return;
        }

        if (typeof data.aspect === 'number' && data.aspect > 0) {
            if (Math.abs(data.aspect - (this.aspect || 0)) > 0.01) {
                this.aspect = data.aspect;
                this.redrawStrokes();
            }
        }

        const x0 = Math.min(1, Math.max(0, Number(data.x0) || 0));
        const y0 = Math.min(1, Math.max(0, Number(data.y0) || 0));
        const x1 = Math.min(1, Math.max(0, Number(data.x1) || 0));
        const y1 = Math.min(1, Math.max(0, Number(data.y1) || 0));
        const color = data.color || '#1d4ed8';

        this.strokes.push([x0, y0, x1, y1, color]);
        if (this.strokes.length > 4000) this.strokes.shift();

        this.drawSegment(x0, y0, x1, y1, color);
    }

    onGuess(playerId, rawText) {
        const p = C.players[playerId];
        if (!p) return;

        const text = String(rawText || '').trim().toUpperCase();
        if (!text) return;
        if (this.solvedBy === playerId) return;

        if (text === this.word) {
            this.solveRound(playerId, false);
            return;
        }

        C.tone(340, 70, 'sine');
        this.guesses.unshift({ name: p.name, avatar: p.avatar, text: text, correct: false });
        this.guesses = this.guesses.slice(0, 6);
        this.renderGuesses();
    }

    timeUp() {
        this.accepting = false;
        this.phase = 'timeup';

        // The artist still earns credit for a clean, readable sketch nobody solved.
        if (this.solvedBy === null && C.players[this.drawerId]) {
            this.scores[this.drawerId] = (this.scores[this.drawerId] || 0) + DRAWER_POINTS;
        }

        C.chord([392, 330], 150, 'square');
        this.render();

        this.timeoutId = setTimeout(() => this.beginRound(), REVEAL_MS);
    }

    finish() {
        this.phase = 'done';
        this.accepting = false;
        C.ctx.clearRect(0, 0, C.view.w, C.view.h);

        C.setLayout('dpad', {
            title: 'Sketch & Guess',
            subtitle: 'Leader: press A to pick the next game'
        });

        C.hud(T.results({
            title: 'Sketch & Guess',
            kicker: ROUNDS + ' rounds drawn',
            rows: T.sorted(C.players, this.scores),
            footer: 'Leader: press A to pick the next game'
        }));

        C.chord([523, 659, 784, 1047], 170, 'triangle');
    }

    /* ---------- render --------------------------------------------------- */

    paintBoard() {
        const v = C.view;
        const g = C.ctx;

        g.save();
        // Fill entire screen with the canvas paper color (#ffffff) for full-screen illusion
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, v.w, v.h);

        // Dot grid paper texture across the full screen
        g.fillStyle = 'rgba(15, 23, 42, 0.055)';
        const step = 26;
        for (let x = step; x < v.w; x += step) {
            for (let y = step; y < v.h; y += step) {
                g.fillRect(x, y, 1.6, 1.6);
            }
        }
        g.restore();
    }

    render() {
        const drawer = C.players[this.drawerId];
        const drawerName = drawer ? drawer.name : 'Waiting';
        const hint = this.phase === 'solved' || this.phase === 'timeup'
            ? this.word
            : this.word.split('').map((c) => (c === ' ' ? '·' : '_')).join(' ');

        let statusText = 'Time left';
        if (this.phase === 'solved') {
            const winner = C.players[this.solvedBy];
            if (winner) {
                statusText = this.solvedVerbal ? `${C.escapeHtml(winner.name)} guessed verbally!` : `${C.escapeHtml(winner.name)} solved!`;
            } else {
                statusText = 'Solved!';
            }
        } else if (this.phase === 'timeup') {
            statusText = 'Time up';
        }

        // Once the round is decided the artist is the only one still typing.
        if (this.phase === 'solved' || this.phase === 'timeup') {
            C.setLayout('guess', {
                title: 'Round over',
                subtitle: 'Type ' + this.word + ' to continue',
                prefill: this.word
            }, this.drawerId);
        }

        const wordEyebrow = this.phase === 'solved'
            ? (this.solvedVerbal ? 'Verbal guess accepted!' : 'Solved!')
            : (this.phase === 'timeup' ? 'The word was' : 'Word hint · ' + this.word.length + ' letters');

        C.hud(`
            <div class="sk">
                <div class="sk__top">
                    <div class="sk__artist">
                        <span class="eyebrow">Drawing now</span>
                        <span class="sk__artist-name">
                            <span class="avatar avatar--sm" style="--ring-color:${drawer ? drawer.color : '#fff'}">${drawer ? T.avatar(drawer.avatar) : '?'}</span>
                            ${C.escapeHtml(drawerName)}
                        </span>
                    </div>

                    <div class="sk__word">
                        <span class="eyebrow">${wordEyebrow}</span>
                        <span class="sk__word-value ${this.phase === 'solved' ? 'is-solved' : ''}">${hint}</span>
                    </div>

                    <div class="sk__clock">
                        <span class="numeral" id="sk-clock">${Math.ceil(ROUND_MS / 1000)}s</span>
                        <span class="eyebrow" id="sk-status">${statusText}</span>
                    </div>
                </div>

                <div class="timer-bar sk__bar"><span id="sk-bar" style="width:100%"></span></div>

                <div class="sk__side">
                    <p class="eyebrow">Live guesses</p>
                    <div class="sk__guesses" id="sk-guesses">${this.guessesHtml()}</div>
                    ${this.phase === 'solved' || this.phase === 'timeup' ? `
                        <div class="sk__resume">
                            <span class="key">A</span>
                            <span>Artist: type <b>${C.escapeHtml(this.word)}</b> to start the next round</span>
                        </div>` : ''}
                    <div class="sk__tally">
                        ${T.leaderboard(T.sorted(C.players, this.scores).slice(0, 4), { compact: true })}
                    </div>
                </div>
            </div>
        `);

        this.updateClock();
    }

    guessesHtml() {
        if (!this.guesses.length) {
            return '<p class="dim t-sm">Type your guess on your phone…</p>';
        }
        return this.guesses.map(g => `
            <div class="sk__guess${g.correct ? ' is-correct' : ''}">
                <span class="sk__guess-face">${T.avatar(g.avatar)}</span>
                <span class="sk__guess-name">${C.escapeHtml(g.name)}</span>
                <span class="sk__guess-text">${C.escapeHtml(g.text)}${g.verbal ? '<span class="sk__guess-tag">🗣️ Verbal</span>' : ''}</span>
            </div>
        `).join('');
    }

    renderGuesses() {
        const host = document.getElementById('sk-guesses');
        if (host) host.innerHTML = this.guessesHtml();
    }

    destroy() {
        this.phase = 'done';
        this.accepting = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        clearTimeout(this.timeoutId);
        this.rafId = null;
        this.timeoutId = null;
        this.strokes = [];
    }
}

C.registerGame({
    id: 'sketch',
    title: 'Sketch & Guess',
    tagline: 'Draw',
    players: '3–8 players',
    control: 'Touch pad + typing',
    description: 'One artist, one hundred strokes. Sketch the secret prompt on your phone while the room races to name it.',
    accent: '#10b981',
    icon: 'palette',
    css: `
        .sk__guess-tag {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: var(--r-xs, 4px);
            background: color-mix(in srgb, var(--c-emerald) 24%, transparent);
            color: var(--c-emerald);
            border: 1px solid color-mix(in srgb, var(--c-emerald) 45%, transparent);
            margin-left: 6px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            vertical-align: middle;
        }
    `,
    create: (ctx) => new SketchGuess(ctx)
});

})(window);
