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
    constructor() {
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
        }
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
        this.strokes = [];
        this.phase = 'drawing';
        this.accepting = true;
        this.roundStart = performance.now();

        const drawer = C.players[this.drawerId];
        const drawerName = drawer ? drawer.name : 'Player';

        Object.keys(C.players).forEach(id => {
            if (id === this.drawerId) {
                C.setLayout('draw', { title: 'You are drawing', subtitle: 'Illustrate: ' + this.word, word: this.word }, id);
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

    onInput(playerId, data) {
        if (data.action === 'draw_stroke' && playerId === this.drawerId) {
            this.onStroke(data);
            return;
        }

        if (data.action === 'submit_guess' && this.accepting && playerId !== this.drawerId) {
            this.onGuess(playerId, data.text);
        }
    }

    onStroke(data) {
        const g = C.ctx;

        if (data.clear) {
            this.strokes = [];
            this.paintBoard();
            g.clearRect(0, 0, C.view.w, C.view.h);
            return;
        }

        const v = C.view;
        const x0 = data.x0 * v.w;
        const y0 = data.y0 * v.h;
        const x1 = data.x1 * v.w;
        const y1 = data.y1 * v.h;

        this.strokes.push([x0, y0, x1, y1, data.color]);
        if (this.strokes.length > 4000) this.strokes.shift();

        g.save();
        g.strokeStyle = data.color || '#111827';
        g.lineWidth = Math.max(4, v.h * 0.008);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.restore();
    }

    onGuess(playerId, rawText) {
        const p = C.players[playerId];
        if (!p) return;

        const text = String(rawText || '').trim().toUpperCase();
        if (!text) return;
        if (this.solvedBy === playerId) return;

        if (text === this.word) {
            const elapsed = performance.now() - this.roundStart;
            const speed = Math.max(0, 1 - elapsed / ROUND_MS);
            const gained = Math.round(GUESS_POINTS + 300 * speed);
            this.scores[playerId] = (this.scores[playerId] || 0) + gained;
            this.solvedBy = playerId;

            C.toController(playerId, { type: 'score_update', score: this.scores[playerId] });
            C.vibrate(playerId, 140);
            C.chord([784, 988, 1175], 130, 'triangle');

            this.guesses.unshift({ name: p.name, avatar: p.avatar, text: text, correct: true });
            this.accepting = false;
            this.phase = 'solved';
            this.render();

            this.timeoutId = setTimeout(() => this.beginRound(), REVEAL_MS);
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
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = '#f8fafc';
        g.fillRect(0, 0, C.canvas.width, C.canvas.height);
        g.restore();

        // Paper texture: a light dot grid so the board reads as a sketchpad.
        g.save();
        g.fillStyle = 'rgba(15,23,42,0.055)';
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

        const statusText = this.phase === 'solved'
            ? 'Solved!'
            : (this.phase === 'timeup' ? 'Time up' : 'Time left');

        // Once the round is decided the artist is the only one still typing.
        if (this.phase === 'solved' || this.phase === 'timeup') {
            C.setLayout('guess', {
                title: 'Round over',
                subtitle: 'Type ' + this.word + ' to continue',
                prefill: this.word
            }, this.drawerId);
        }

        C.hud(`
            <div class="sk">
                <div class="sk__top">
                    <div class="sk__artist">
                        <span class="eyebrow">Drawing now</span>
                        <span class="sk__artist-name">
                            <span class="avatar avatar--sm" style="--ring-color:${drawer ? drawer.color : '#fff'}">${drawer ? drawer.avatar : '?'}</span>
                            ${C.escapeHtml(drawerName)}
                        </span>
                    </div>

                    <div class="sk__word">
                        <span class="eyebrow">${this.phase === 'solved' || this.phase === 'timeup' ? 'The word was' : 'Word hint · ' + this.word.length + ' letters'}</span>
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
                <span class="sk__guess-face">${g.avatar}</span>
                <span class="sk__guess-name">${C.escapeHtml(g.name)}</span>
                <span class="sk__guess-text">${C.escapeHtml(g.text)}</span>
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
    create: () => new SketchGuess()
});

})(window);
