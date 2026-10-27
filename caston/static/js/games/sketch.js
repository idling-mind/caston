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

const POINTS_CONFIG = {
    easy:   { guessBase: 600, speedBonus: 200, drawer: 350 },
    medium: { guessBase: 800, speedBonus: 300, drawer: 450 },
    hard:   { guessBase: 1000, speedBonus: 400, drawer: 600 }
};

const DEFAULT_WORDS = [
    { word: 'PIZZA', difficulty: 'easy', category: 'Food & Drink' },
    { word: 'BICYCLE', difficulty: 'easy', category: 'Vehicles' },
    { word: 'SNOWMAN', difficulty: 'easy', category: 'Nature & Weather' },
    { word: 'ELEPHANT', difficulty: 'easy', category: 'Animals' },
    { word: 'GUITAR', difficulty: 'easy', category: 'Everyday Objects' },
    { word: 'UMBRELLA', difficulty: 'easy', category: 'Everyday Objects' },
    { word: 'BALLOON', difficulty: 'easy', category: 'Everyday Objects' },
    { word: 'CAT', difficulty: 'easy', category: 'Animals' },
    { word: 'LIGHTHOUSE', difficulty: 'medium', category: 'Places & Buildings' },
    { word: 'HELICOPTER', difficulty: 'medium', category: 'Vehicles & Transport' },
    { word: 'TELESCOPE', difficulty: 'medium', category: 'Science & Tech' },
    { word: 'SUBMARINE', difficulty: 'medium', category: 'Vehicles & Transport' },
    { word: 'VOLCANO', difficulty: 'medium', category: 'Nature & Weather' },
    { word: 'DINOSAUR', difficulty: 'medium', category: 'Animals' },
    { word: 'SKATEBOARD', difficulty: 'medium', category: 'Sports & Fun' },
    { word: 'JELLYFISH', difficulty: 'medium', category: 'Animals' },
    { word: 'WINDMILL', difficulty: 'medium', category: 'Places & Buildings' },
    { word: 'BLACK HOLE', difficulty: 'hard', category: 'Science & Space' },
    { word: 'TIME TRAVEL', difficulty: 'hard', category: 'Abstract & Actions' },
    { word: 'AVALANCHE', difficulty: 'hard', category: 'Nature & Weather' },
    { word: 'DRAGON', difficulty: 'hard', category: 'Fantasy & Lore' },
    { word: 'CHANDELIER', difficulty: 'hard', category: 'Everyday Objects' },
    { word: 'STATUE OF LIBERTY', difficulty: 'hard', category: 'Places & Buildings' }
];

function getWordBank() {
    return (C && C.SKETCH_WORDS && C.SKETCH_WORDS.length >= 20)
        ? C.SKETCH_WORDS
        : DEFAULT_WORDS;
}

function normalizeText(str) {
    return String(str || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isCorrectGuess(guess, target) {
    const g = normalizeText(guess);
    const t = normalizeText(target);
    if (!g || !t) return false;
    if (g === t) return true;
    // Handle standard plural forms (+S, +ES)
    if (g + 'S' === t || t + 'S' === g) return true;
    if (g + 'ES' === t || t + 'ES' === g) return true;
    return false;
}

function isCloseGuess(guess, target) {
    const g = normalizeText(guess);
    const t = normalizeText(target);
    if (!g || !t || g === t) return false;
    if (g.length < 4 || Math.abs(g.length - t.length) > 1) return false;

    // Single character substitution
    if (g.length === t.length) {
        let diffs = 0;
        for (let i = 0; i < g.length; i++) {
            if (g[i] !== t[i]) diffs++;
            if (diffs > 1) return false;
        }
        return diffs === 1;
    }
    return false;
}

class SketchGuess {
    constructor(ctx) {
        this.ctx = ctx || C;
        this.id = 'sketch';
        this.scores = {};
        this.round = -1;
        this.order = [];
        this.drawerId = null;
        this.lastDrawerId = null;
        this.totalRounds = this.calculateTotalRounds();
        this.word = '';
        this.difficulty = 'easy';
        this.category = 'General';
        this.pointsConfig = POINTS_CONFIG.easy;
        this.guesses = [];
        this.solvedBy = null;
        this.phase = 'idle';
        this.rafId = null;
        this.timeoutId = null;
        this.strokes = [];
        this.aspect = 4 / 3;
        this.revealOrder = [];
        this.revealedIndices = new Set();
        this.revealedCount = 0;

        Object.keys(C.players).forEach(id => { this.scores[id] = 0; });
        this.buildWordDecks();
        this.buildOrder();
        this.enterHowToPhase();
    }

    enterHowToPhase() {
        this.phase = 'howto';
        this.accepting = false;
        this.paintBoard();

        C.setLayout('dpad', {
            title: 'Sketch & Guess',
            subtitle: 'Press A to Start Game!'
        });

        C.hud(T.howToPlay({
            title: 'How to Play Sketch & Guess',
            subtitle: `${this.totalRounds} Rounds · Take turns drawing & guessing`,
            steps: [
                { icon: '🎨', title: '1. The Artist Draws', text: 'Each round, one player receives a secret word on their phone and sketches it live on the TV canvas.' },
                { icon: '💬', title: '2. Race to Guess', text: 'Everyone else types guesses on their phone. Faster correct guesses earn bigger speed bonuses!' },
                { icon: '🗣️', title: '3. Verbal & Clue Assist', text: 'Letter clues appear over time, and the artist can also tap a player\'s name to credit a verbal guess.' },
                { icon: '🏆', title: '4. Score Points', text: 'Both the solver and the artist score points when the word is cracked before the 60s timer runs out.' }
            ],
            controls: [
                { key: 'Touch Pad', label: 'Draw on Phone' },
                { key: 'Keyboard', label: 'Type Guesses' },
                { key: 'A', label: 'Start Game' }
            ],
            footerText: 'Press A on your phone controller to start Round 1!'
        }));
    }

    buildWordDecks() {
        const bank = getWordBank();
        this.wordDecks = { easy: [], medium: [], hard: [] };

        bank.forEach(item => {
            const diff = (item.difficulty || 'medium').toLowerCase();
            const entry = {
                word: item.word,
                difficulty: diff,
                category: item.category || 'General'
            };
            if (this.wordDecks[diff]) {
                this.wordDecks[diff].push(entry);
            } else {
                this.wordDecks.medium.push(entry);
            }
        });

        // Fisher-Yates shuffle each deck
        Object.keys(this.wordDecks).forEach(diff => {
            const arr = this.wordDecks[diff];
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            }
        });
    }

    getTargetDifficulty(roundIndex, totalRounds) {
        const third = Math.max(1, Math.floor(totalRounds / 3));
        if (roundIndex < third) return 'easy';
        if (roundIndex < third * 2) return 'medium';
        return 'hard';
    }

    pickWord(targetDifficulty) {
        const deck = this.wordDecks[targetDifficulty];
        if (deck && deck.length > 0) {
            return deck.pop();
        }
        // Fallback: search non-empty decks
        for (const diff of ['medium', 'easy', 'hard']) {
            if (this.wordDecks[diff] && this.wordDecks[diff].length > 0) {
                return this.wordDecks[diff].pop();
            }
        }
        // If exhausted, rebuild decks
        this.buildWordDecks();
        return this.wordDecks[targetDifficulty].pop() || DEFAULT_WORDS[0];
    }

    calculateTotalRounds() {
        const count = Object.keys(C.players).length;
        if (count <= 1) return ROUNDS;
        if (count <= 4) return count * 2;
        return count;
    }

    /* ---------- setup ---------------------------------------------------- */

    buildOrder() {
        const ids = Object.keys(C.players);
        this.order = ids.slice();
    }

    getNextDrawerId() {
        // Ensure any newly joined players are added to the sequential order
        Object.keys(C.players).forEach(id => {
            if (!this.order.includes(id)) {
                this.order.push(id);
            }
        });

        if (!this.order.length) return null;

        let startIndex = 0;
        if (this.lastDrawerId) {
            const prevIndex = this.order.indexOf(this.lastDrawerId);
            if (prevIndex !== -1) {
                startIndex = (prevIndex + 1) % this.order.length;
            }
        }

        // Search in sequence starting from startIndex for the next connected player
        for (let i = 0; i < this.order.length; i++) {
            const idx = (startIndex + i) % this.order.length;
            const candidateId = this.order[idx];
            if (C.players[candidateId]) {
                return candidateId;
            }
        }
        return null;
    }

    onPlayersSync() {
        Object.keys(C.players).forEach(id => {
            if (this.scores[id] === undefined) this.scores[id] = 0;
            if (!this.order.includes(id)) this.order.push(id);
        });

        if (this.phase === 'howto') {
            this.totalRounds = this.calculateTotalRounds();
            return;
        }

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
        clearTimeout(this.timeoutId);
        this.timeoutId = null;

        this.round++;

        if (this.round >= this.totalRounds || !Object.keys(C.players).length) {
            this.finish();
            return;
        }

        const nextDrawer = this.getNextDrawerId();
        if (!nextDrawer) {
            this.finish();
            return;
        }

        this.drawerId = nextDrawer;
        this.lastDrawerId = nextDrawer;

        const targetDiff = this.getTargetDifficulty(this.round, this.totalRounds);
        const wordObj = this.pickWord(targetDiff);
        this.word = wordObj.word;
        this.difficulty = wordObj.difficulty;
        this.category = wordObj.category;
        this.pointsConfig = POINTS_CONFIG[this.difficulty] || POINTS_CONFIG.medium;

        // Collect alphabetic letter positions for clues
        const eligible = [];
        for (let i = 0; i < this.word.length; i++) {
            const ch = this.word[i];
            if (ch >= 'A' && ch <= 'Z') {
                eligible.push(i);
            }
        }

        // Maximum 3 letters revealed as clues across the round
        let maxClues = 3;
        if (eligible.length <= 4) {
            maxClues = 1;
        } else if (eligible.length <= 6) {
            maxClues = 2;
        } else {
            maxClues = 3;
        }

        // Shuffle eligible positions randomly
        for (let i = eligible.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = eligible[i]; eligible[i] = eligible[j]; eligible[j] = tmp;
        }

        this.revealOrder = eligible.slice(0, maxClues);
        this.revealedIndices = new Set();
        this.revealedCount = 0;

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
                    subtitle: `Illustrate: ${this.word} · ${this.difficulty.toUpperCase()}`,
                    word: this.word,
                    difficulty: this.difficulty,
                    category: this.category,
                    guessers: guessers
                }, id);
            } else {
                C.setLayout('guess', {
                    title: 'Guess the sketch',
                    subtitle: `${drawerName} is drawing · ${this.difficulty.toUpperCase()}`
                }, id);
            }
        });

        this.paintBoard();
        this.render();
        C.chord([523, 659], 110, 'triangle');
    }

    getClueThresholds(count) {
        if (count === 1) return [0.50];
        if (count === 2) return [0.40, 0.70];
        return [0.35, 0.60, 0.80];
    }

    checkClueReveal() {
        if (!this.accepting || this.phase !== 'drawing') return;
        if (!this.revealOrder || !this.revealOrder.length) return;

        const elapsed = performance.now() - this.roundStart;
        const ratio = elapsed / ROUND_MS;
        const thresholds = this.getClueThresholds(this.revealOrder.length);

        let targetCount = 0;
        for (let i = 0; i < thresholds.length; i++) {
            if (ratio >= thresholds[i]) {
                targetCount = i + 1;
            }
        }
        targetCount = Math.min(targetCount, this.revealOrder.length);

        if (targetCount > this.revealedCount) {
            while (this.revealedCount < targetCount) {
                this.revealedIndices.add(this.revealOrder[this.revealedCount]);
                this.revealedCount++;
            }
            C.tone(659, 100, 'triangle');
            const wordVal = document.getElementById('sk-word-value');
            if (wordVal) {
                wordVal.textContent = this.getHintString();
                wordVal.classList.remove('has-clue-pop');
                void wordVal.offsetWidth;
                wordVal.classList.add('has-clue-pop');
            }
        }
    }

    getHintString() {
        if (this.phase === 'solved' || this.phase === 'timeup') {
            return this.word;
        }
        return this.word.split('').map((c, idx) => {
            if (c === ' ') return '·';
            if (c === '-') return '-';
            if (this.revealedIndices && this.revealedIndices.has(idx)) {
                return c;
            }
            return '_';
        }).join(' ');
    }

    startClock() {
        const tick = () => {
            if (this.phase === 'done') return;

            if (this.accepting && performance.now() - this.roundStart >= ROUND_MS) {
                this.timeUp();
            } else if (this.accepting) {
                this.updateClock();
                this.checkClueReveal();
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
        if (this.phase === 'howto') {
            if (data.action === 'btn' && data.state === 'down' && (data.button === 'A' || data.button === 'B')) {
                this.beginRound();
                this.startClock();
            }
            return;
        }

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

        const cfg = this.pointsConfig || POINTS_CONFIG.medium;
        const elapsed = performance.now() - this.roundStart;
        const speed = Math.max(0, 1 - elapsed / ROUND_MS);
        const gained = Math.round(cfg.guessBase + cfg.speedBonus * speed);
        this.scores[winnerId] = (this.scores[winnerId] || 0) + gained;

        if (C.players[this.drawerId]) {
            this.scores[this.drawerId] = (this.scores[this.drawerId] || 0) + cfg.drawer;
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

        if (isCorrectGuess(text, this.word)) {
            this.solveRound(playerId, false);
            return;
        }

        const close = isCloseGuess(text, this.word);
        if (close) {
            C.tone(480, 80, 'sine');
            C.vibrate(playerId, 40);
        } else {
            C.tone(340, 70, 'sine');
        }

        this.guesses.unshift({
            name: p.name,
            avatar: p.avatar,
            text: text,
            correct: false,
            close: close
        });
        this.guesses = this.guesses.slice(0, 6);
        this.renderGuesses();
    }

    timeUp() {
        this.accepting = false;
        this.phase = 'timeup';

        // Neither the artist nor guessers receive points if the word was not guessed.

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
            kicker: (this.totalRounds || ROUNDS) + ' rounds drawn',
            rows: T.sorted(C.players, this.scores),
            footer: 'Leader: press A to pick the next game'
        }));

        C.chord([523, 659, 784, 1047], 170, 'triangle');
    }

    /* ---------- render --------------------------------------------------- */

    paintBoard() {
        const v = C.view;
        const g = C.ctx;
        const scale = (v && v.scale) || C.scale || 1;
        const b = this.getBoardRect();
        const th = T.theme();

        // Let the console's themed SVG wave background shine through around the drawing pad
        T.arenaBackdrop(v);

        if (this.phase === 'howto' || this.phase === 'done') return;

        g.save();
        // Elevated board frame & shadow
        g.shadowColor = 'rgba(0, 0, 0, 0.48)';
        g.shadowBlur = 28 * scale;
        g.shadowOffsetY = 10 * scale;
        T.roundRect(g, b.x, b.y, b.w, b.h, 14 * scale);
        g.fillStyle = '#ffffff';
        g.fill();
        g.shadowColor = 'transparent';

        // Clip dot grid inside the drawing pad
        g.save();
        T.roundRect(g, b.x, b.y, b.w, b.h, 14 * scale);
        g.clip();
        g.fillStyle = 'rgba(15, 23, 42, 0.065)';
        const step = Math.max(16, Math.round(24 * scale));
        for (let x = b.x + step; x < b.x + b.w; x += step) {
            for (let y = b.y + step; y < b.y + b.h; y += step) {
                g.fillRect(x, y, 1.6 * scale, 1.6 * scale);
            }
        }
        g.restore();

        // Theme-accented board border
        T.roundRect(g, b.x, b.y, b.w, b.h, 14 * scale);
        g.lineWidth = 2.5 * scale;
        g.strokeStyle = th.boardBorder || 'rgba(56, 189, 248, 0.45)';
        g.stroke();
        g.restore();
    }

    render() {
        const drawer = C.players[this.drawerId];
        const drawerName = drawer ? drawer.name : 'Waiting';
        const hint = this.getHintString();

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
            : (this.phase === 'timeup' ? 'The secret word was' : 'Word hint · ' + this.word.length + ' letters');

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
                        <div class="sk__meta">
                            <span class="tag tag--round">Round ${this.round + 1}/${this.totalRounds}</span>
                            <span class="tag tag--difficulty tag--${this.difficulty}">${this.difficulty.toUpperCase()}</span>
                            <span class="tag tag--category">${C.escapeHtml(this.category)}</span>
                            <span class="tag tag--pts">+${this.pointsConfig.guessBase} pts</span>
                        </div>
                        <span class="sk__word-value ${this.phase === 'solved' ? 'is-solved' : ''}" id="sk-word-value">${hint}</span>
                        <span class="eyebrow">${wordEyebrow}</span>
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
            <div class="sk__guess${g.correct ? ' is-correct' : ''}${g.close ? ' is-close' : ''}">
                <span class="sk__guess-face">${T.avatar(g.avatar)}</span>
                <span class="sk__guess-name">${C.escapeHtml(g.name)}</span>
                <span class="sk__guess-text">
                    ${C.escapeHtml(g.text)}
                    ${g.verbal ? '<span class="sk__guess-tag">🗣️ Verbal</span>' : ''}
                    ${g.close ? '<span class="sk__guess-tag sk__guess-tag--close">⚡ Close!</span>' : ''}
                </span>
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
        this.revealOrder = [];
        this.revealedIndices = new Set();
        this.revealedCount = 0;
        this.order = [];
        this.lastDrawerId = null;
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
        .sk__guess-tag--close {
            background: color-mix(in srgb, var(--c-amber) 24%, transparent) !important;
            color: var(--c-amber) !important;
            border-color: color-mix(in srgb, var(--c-amber) 45%, transparent) !important;
        }
        .sk__guess.is-close {
            background: color-mix(in srgb, var(--c-amber) 14%, transparent);
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-amber) 45%, transparent);
        }
        .sk__meta {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-bottom: 2px;
        }
        .sk__meta .tag {
            font-size: 11px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: var(--r-xs, 4px);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        @keyframes clue-pop {
            0% { transform: scale(1); }
            50% { transform: scale(1.08); color: var(--accent); }
            100% { transform: scale(1); }
        }
        .has-clue-pop {
            animation: clue-pop 0.35s ease;
        }
    `,
    create: (ctx) => new SketchGuess(ctx)
});

})(window);
