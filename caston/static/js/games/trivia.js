/* ==========================================================================
   Game — Family Trivia
   Phones become four-colour buzzers. Faster correct answers score higher,
   so the board rewards both knowledge and nerve.
   ========================================================================== */
(function (w) {
'use strict';

const C = w.CastOn;
const T = C.tools;

const QUESTION_MS = 15000;
const REVEAL_MS = 5000;
const QUESTIONS_PER_MATCH = 10;

const OPTION_COLORS = ['#f43f5e', '#2563eb', '#f59e0b', '#10b981'];
const LETTERS = 'ABCD';

// Fallback questions in case trivia-questions.js is not loaded
const DEFAULT_QUESTIONS = [
    { q: 'Which planet in our solar system has the most moons?', options: ['Jupiter', 'Saturn', 'Neptune', 'Mars'], answer: 1, difficulty: 'medium', category: 'Science' },
    { q: 'What is the fastest land animal in the world?', options: ['Lion', 'Pronghorn', 'Cheetah', 'Greyhound'], answer: 2, difficulty: 'easy', category: 'Science' },
    { q: 'In Swedish, what do you call a coffee and pastry break?', options: ['Lagom', 'Fika', 'Smörgås', 'Kanel'], answer: 1, difficulty: 'easy', category: 'Food & Drink' },
    { q: 'How many bones are in an adult human body?', options: ['206', '186', '256', '300'], answer: 0, difficulty: 'easy', category: 'Science' },
    { q: "Which element has the chemical symbol 'Au'?", options: ['Silver', 'Copper', 'Argon', 'Gold'], answer: 3, difficulty: 'medium', category: 'Science' },
    { q: 'Which ocean is the largest and deepest on Earth?', options: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], answer: 2, difficulty: 'easy', category: 'Geography' },
    { q: 'Which country is credited with inventing paper?', options: ['Egypt', 'China', 'Greece', 'India'], answer: 1, difficulty: 'easy', category: 'History' },
    { q: 'What is the hardest natural substance on Earth?', options: ['Quartz', 'Steel', 'Diamond', 'Obsidian'], answer: 2, difficulty: 'easy', category: 'Science' },
    { q: 'How many strings does a standard violin have?', options: ['Four', 'Five', 'Six', 'Seven'], answer: 0, difficulty: 'medium', category: 'Music' },
    { q: 'Which gas do plants absorb from the air?', options: ['Oxygen', 'Nitrogen', 'Hydrogen', 'Carbon dioxide'], answer: 3, difficulty: 'easy', category: 'Science' }
];

function getQuestionBank() {
    return (C && C.TRIVIA_QUESTIONS && C.TRIVIA_QUESTIONS.length >= 10)
        ? C.TRIVIA_QUESTIONS
        : DEFAULT_QUESTIONS;
}

function getPointsConfig(difficulty) {
    if (difficulty === 'hard') {
        return { base: 1000, speed: 1000, max: 2000 };
    }
    if (difficulty === 'medium') {
        return { base: 750, speed: 750, max: 1500 };
    }
    return { base: 500, speed: 500, max: 1000 };
}

function shuffledDeck() {
    const list = getQuestionBank();

    const easy = [];
    const medium = [];
    const hard = [];
    const other = [];

    list.forEach((item, index) => {
        const diff = (item.difficulty || '').toLowerCase();
        if (diff === 'easy') easy.push(index);
        else if (diff === 'medium') medium.push(index);
        else if (diff === 'hard') hard.push(index);
        else other.push(index);
    });

    const shuffle = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
    };

    shuffle(easy);
    shuffle(medium);
    shuffle(hard);
    shuffle(other);

    // Pick 3 Easy, 4 Medium, 3 Hard for escalating difficulty
    const deck = [
        ...easy.slice(0, 3),
        ...medium.slice(0, 4),
        ...hard.slice(0, 3)
    ];

    // If any group was short, fill up to QUESTIONS_PER_MATCH from the rest
    if (deck.length < QUESTIONS_PER_MATCH) {
        const pool = shuffle([...easy.slice(3), ...medium.slice(4), ...hard.slice(3), ...other]);
        while (deck.length < QUESTIONS_PER_MATCH && pool.length > 0) {
            deck.push(pool.pop());
        }
    }

    return deck.slice(0, QUESTIONS_PER_MATCH);
}

class FamilyTrivia {
    constructor(ctx) {
        this.ctx = ctx || C;
        this.id = 'trivia';
        this.scores = {};
        this.answers = {};
        this.order = shuffledDeck();
        this.qIndex = -1;
        this.accepting = false;
        this.phase = 'idle'; // 'idle' | 'asking' | 'choices' | 'reveal' | 'done'
        this.rafId = null;
        this.timeoutId = null;
        this.revealTimeoutId = null;
        this.roundResultsHtml = '';
        this.allGuessesIn = false;

        Object.keys(C.players).forEach(id => { this.scores[id] = 0; });

        const g = C.ctx;
        if (g && C.canvas) {
            g.save();
            g.setTransform(1, 0, 0, 1, 0, 0);
            g.clearRect(0, 0, C.canvas.width, C.canvas.height);
            g.restore();
        }

        C.chord([523, 659], 120, 'triangle');
        this.enterHowToPhase();
    }

    enterHowToPhase() {
        this.phase = 'howto';
        this.accepting = false;

        C.setLayout('dpad', {
            title: 'Family Trivia',
            subtitle: 'Press A to Start Game!'
        });

        C.hud(T.howToPlay({
            title: 'How to Play Family Trivia',
            subtitle: `${this.order.length} Questions · Escalating Difficulty & Speed Bonus`,
            steps: [
                { icon: '❓', title: '1. Read the Question', text: 'Each question appears on the TV with 4 colored choices (A, B, C, D) and a 15-second timer.' },
                { icon: '⚡', title: '2. Buzz In Fast', text: 'Tap your answer on your phone. Choices stay secret until everyone locks in or time expires!' },
                { icon: '📈', title: '3. Escalating Stakes', text: 'Questions progress from Easy to Medium to Hard — worth up to +350 points per question!' },
                { icon: '🏆', title: '4. Claim the Crown', text: 'Speed + accuracy wins. Highest total score after 10 questions takes the podium!' }
            ],
            controls: [
                { key: 'A B C D', label: 'Tap Answer Buzzer on Phone' },
                { key: 'A', label: 'Start Game' }
            ],
            footerText: 'Press A on your phone controller to start Question 1!'
        }));
    }

    /* ---------- flow ----------------------------------------------------- */

    get item() {
        const bank = getQuestionBank();
        return bank[this.order[this.qIndex]] || bank[0];
    }

    beginQuestion() {
        this.qIndex++;

        if (this.qIndex >= this.order.length) {
            this.finish();
            return;
        }

        clearTimeout(this.timeoutId);
        clearTimeout(this.revealTimeoutId);
        this.timeoutId = null;
        this.revealTimeoutId = null;

        this.answers = {};
        this.accepting = true;
        this.phase = 'asking';
        this.allGuessesIn = false;
        this.roundResultsHtml = '';
        this.questionStart = performance.now();

        const item = this.item;
        const ptsCfg = getPointsConfig(item.difficulty);

        C.setLayout('trivia', {
            title: 'Question ' + (this.qIndex + 1) + ' of ' + this.order.length,
            subtitle: (item.difficulty || 'Easy').toUpperCase() + ' · ' + (item.category || 'Trivia') + ' · Up to +' + ptsCfg.max + ' pts',
            options: item.options,
            difficulty: item.difficulty,
            maxPoints: ptsCfg.max
        });

        this.renderBoard();
        C.chord([659, 784], 80, 'triangle');
    }

    startClock() {
        const tick = () => {
            if (this.phase === 'done') return;

            if (this.accepting && this.phase === 'asking') {
                const elapsed = performance.now() - this.questionStart;
                if (elapsed >= QUESTION_MS) {
                    this.showChoices();
                } else {
                    this.updateClock(elapsed);
                }
            }
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    updateClock(elapsed) {
        if (this.phase !== 'asking') return;

        const left = Math.max(0, 1 - elapsed / QUESTION_MS);
        const bar = document.getElementById('q-bar');
        const clock = document.getElementById('q-clock');

        if (bar) bar.style.width = (left * 100) + '%';
        if (clock) {
            const secs = Math.ceil(Math.max(0, QUESTION_MS - elapsed) / 1000);
            if (clock.textContent !== secs + 's') clock.textContent = secs + 's';
            clock.classList.toggle('is-hot', secs <= 5);
        }
    }

    /* ---------- input ---------------------------------------------------- */

    onInput(playerId, data) {
        if (this.phase === 'howto') {
            if (data.action === 'btn' && data.state === 'down' && (data.button === 'A' || data.button === 'B')) {
                this.beginQuestion();
                this.startClock();
            }
            return;
        }
        if (!this.accepting || this.phase !== 'asking') return;
        if (data.action !== 'trivia_answer') return;
        if (this.answers[playerId] !== undefined) return;
        if (!C.players[playerId]) return;

        const elapsed = performance.now() - this.questionStart;
        this.answers[playerId] = {
            choice: data.choice,
            elapsed: elapsed
        };

        C.tone(620, 70, 'sine');
        C.vibrate(playerId, 30);

        C.toController(playerId, {
            type: 'trivia_locked',
            choice: data.choice,
            elapsedSec: (elapsed / 1000).toFixed(1)
        });

        // Update footer guess tracker (keeps choice secret while answering)
        this.markPicks();

        const total = Object.keys(C.players).length;
        const answeredCount = Object.keys(this.answers).length;

        // When all connected players have submitted their guess:
        // Show "All have made their guesses!", then reveal choices
        if (total > 0 && answeredCount >= total) {
            this.allGuessesIn = true;
            this.markPicks();
            C.tone(784, 90, 'triangle');
            setTimeout(() => {
                if (this.phase === 'asking') this.showChoices();
            }, 350);
        }
    }

    /* ---------- step 1: show user choices -------------------------------- */

    showChoices() {
        if (!this.accepting && this.phase !== 'asking') return;
        this.accepting = false;
        this.phase = 'choices';

        // Play suspense lock-in sound
        C.chord([523, 659], 90, 'triangle');

        // Render the board showing who chose which option (correct answer still hidden)
        this.renderBoard();

        // Reveal the correct answer with a short suspense delay (1.6s)
        this.revealTimeoutId = setTimeout(() => {
            if (this.phase === 'choices') {
                this.reveal();
            }
        }, 1600);
    }

    /* ---------- step 2: reveal correct answer & award points ------------- */

    reveal() {
        if (this.phase === 'reveal' || this.phase === 'done') return;
        this.accepting = false;
        this.phase = 'reveal';
        clearTimeout(this.revealTimeoutId);
        this.revealTimeoutId = null;

        const item = this.item;
        const ptsCfg = getPointsConfig(item.difficulty);
        let anyCorrect = false;

        // Identify the fastest correct answer
        let fastestId = null;
        let fastestElapsed = Infinity;
        Object.keys(C.players).forEach(id => {
            const ans = this.answers[id];
            if (ans && ans.choice === item.answer && ans.elapsed < fastestElapsed) {
                fastestElapsed = ans.elapsed;
                fastestId = id;
            }
        });

        // Compute points strictly based on speed for correct answers
        const results = [];
        Object.keys(C.players).forEach(id => {
            const p = C.players[id];
            if (!p) return;
            const ans = this.answers[id];
            const isCorrect = !!(ans && ans.choice === item.answer);
            let gained = 0;
            let elapsedSec = null;

            if (isCorrect) {
                // Speed ratio: 1.0 (instant) to 0.0 (at QUESTION_MS)
                const speedRatio = Math.max(0, Math.min(1, (QUESTION_MS - ans.elapsed) / QUESTION_MS));
                const speedBonus = Math.round(ptsCfg.speed * speedRatio);
                gained = ptsCfg.base + speedBonus;
                this.scores[id] = (this.scores[id] || 0) + gained;
                elapsedSec = (ans.elapsed / 1000).toFixed(1);
                anyCorrect = true;
                C.vibrate(id, 120);
            } else if (ans) {
                C.vibrate(id, 45);
            }

            C.toController(id, {
                type: 'trivia_result',
                correct: isCorrect,
                timedOut: !ans,
                points: gained,
                elapsedSec: elapsedSec,
                fastest: id === fastestId,
                totalScore: this.scores[id] || 0
            });

            results.push({
                player: p,
                correct: isCorrect,
                timedOut: !ans,
                gained: gained,
                elapsedSec: elapsedSec,
                isFastest: id === fastestId
            });
        });

        // Build round breakdown chips without revealing wrong choices
        this.roundResultsHtml = results.map(r => {
            if (r.correct) {
                return `
                    <span class="q-reveal-chip is-correct" style="--ring-color:${r.player.color}">
                        <span class="q-player-chip__face">${T.avatar(r.player.avatar)}</span>
                        <span class="q-player-chip__name">${C.escapeHtml(r.player.name)}</span>
                        <span class="q-reveal-pts">+${r.gained.toLocaleString()}</span>
                        <span class="q-reveal-speed">⚡ ${r.elapsedSec}s</span>
                        ${r.isFastest ? '<span class="q-reveal-badge">Fastest</span>' : ''}
                    </span>
                `;
            } else if (r.timedOut) {
                return `
                    <span class="q-reveal-chip is-wrong" style="--ring-color:${r.player.color}">
                        <span class="q-player-chip__face">${T.avatar(r.player.avatar)}</span>
                        <span class="q-player-chip__name">${C.escapeHtml(r.player.name)}</span>
                        <span class="q-reveal-pts">+0</span>
                        <span class="q-reveal-status">Time out</span>
                    </span>
                `;
            } else {
                return `
                    <span class="q-reveal-chip is-wrong" style="--ring-color:${r.player.color}">
                        <span class="q-player-chip__face">${T.avatar(r.player.avatar)}</span>
                        <span class="q-player-chip__name">${C.escapeHtml(r.player.name)}</span>
                        <span class="q-reveal-pts">+0</span>
                        <span class="q-reveal-status">Incorrect</span>
                    </span>
                `;
            }
        }).join('');

        C.chord(anyCorrect ? [784, 988] : [262, 196], 140, anyCorrect ? 'triangle' : 'square');
        this.renderBoard();

        this.timeoutId = setTimeout(() => this.beginQuestion(), REVEAL_MS);
    }

    finish() {
        this.phase = 'done';
        this.accepting = false;

        C.setLayout('dpad', {
            title: 'Trivia complete',
            subtitle: 'Leader: press A for the next game'
        });

        C.hud(T.results({
            title: 'Family Trivia',
            kicker: 'All ' + this.order.length + ' questions answered',
            rows: T.sorted(C.players, this.scores),
            footer: 'Leader: press A to pick the next game'
        }));

        C.chord([523, 659, 784, 1047], 170, 'triangle');
    }

    /* ---------- render --------------------------------------------------- */

    onPlayersSync() {
        Object.keys(C.players).forEach(id => {
            if (this.scores[id] === undefined) this.scores[id] = 0;
        });
        if (this.phase === 'asking' || this.phase === 'choices' || this.phase === 'reveal') {
            this.renderBoard();
        }
    }

    markPicks() {
        const total = Object.keys(C.players).length;
        const answeredCount = Object.keys(this.answers).length;
        const allAnswered = total > 0 && answeredCount >= total;

        const counter = document.getElementById('q-counter-tag');
        if (counter) {
            if (allAnswered || this.allGuessesIn) {
                counter.className = 'tag tag--all-guesses';
                counter.innerHTML = '<span class="q-check-pulse">✓</span>All have made their guesses!';
            } else {
                counter.className = 'tag';
                counter.innerHTML = `<span class="dot is-active"></span>Answered ${answeredCount} / ${total}`;
            }
        }

        const roster = document.getElementById('q-players-status');
        if (roster) {
            roster.innerHTML = Object.keys(C.players).map(id => {
                const p = C.players[id];
                if (!p) return '';
                const hasAnswered = !!this.answers[id];
                return `
                    <span class="q-player-chip ${hasAnswered ? 'is-answered' : 'is-waiting'}" style="--ring-color:${p.color}">
                        <span class="q-player-chip__face">${T.avatar(p.avatar)}</span>
                        <span class="q-player-chip__name">${C.escapeHtml(p.name)}</span>
                        <span class="q-player-chip__badge">${hasAnswered ? '✓' : '…'}</span>
                    </span>
                `;
            }).join('');
        }
    }

    renderBoard() {
        if (this.qIndex < 0 || this.qIndex >= this.order.length) return;

        const item = this.item;
        const isChoices = this.phase === 'choices';
        const isReveal = this.phase === 'reveal';
        const showPicks = isChoices || isReveal;
        const ptsCfg = getPointsConfig(item.difficulty);

        // Render option cards
        // When in 'choices' or 'reveal' phase, render the player avatars on their chosen cards!
        // Only in 'reveal' phase is the correct answer marked as winner and incorrect cards dimmed.
        const cards = item.options.map((opt, i) => {
            const isAnswer = i === item.answer;

            let picksHtml = '';
            if (showPicks) {
                const pickedPlayers = Object.keys(this.answers)
                    .filter(id => this.answers[id].choice === i)
                    .map(id => {
                        const p = C.players[id];
                        return p ? `<span class="q-card__face" style="--ring-color:${p.color}">${T.avatar(p.avatar)}</span>` : '';
                    }).join('');

                if (pickedPlayers) {
                    picksHtml = `<span class="q-card__picks" id="q-picks-${i}">${pickedPlayers}</span>`;
                }
            }

            return `
                <div class="q-card${isReveal && !isAnswer ? ' is-dim' : ''}${isReveal && isAnswer ? ' is-winner' : ''}"
                     style="--card-accent:${OPTION_COLORS[i]}">
                    <span class="q-card__key">${LETTERS[i]}</span>
                    <span class="q-card__text">${C.escapeHtml(opt)}</span>
                    ${picksHtml}
                    ${isReveal && isAnswer ? `<span class="q-card__tick">${C.icon('check')}</span>` : ''}
                </div>`;
        }).join('');

        const totalPlayers = Object.keys(C.players).length;
        const answeredCount = Object.keys(this.answers).length;
        const allAnswered = totalPlayers > 0 && answeredCount >= totalPlayers;

        let statusHtml = '';
        if (isReveal) {
            statusHtml = `
                <div class="q-reveal-banner">
                    <span class="eyebrow" style="margin-right:4px">Results:</span>
                    ${this.roundResultsHtml || '<span class="dim t-xs">No answers recorded</span>'}
                </div>
            `;
        } else if (isChoices) {
            statusHtml = `
                <div class="q-status-wrap">
                    <span class="tag tag--choices">
                        <span class="q-check-pulse">✓</span>All guesses in · Revealing answer…
                    </span>
                </div>
            `;
        } else {
            const playerChips = Object.keys(C.players).map(id => {
                const p = C.players[id];
                if (!p) return '';
                const hasAnswered = !!this.answers[id];
                return `
                    <span class="q-player-chip ${hasAnswered ? 'is-answered' : 'is-waiting'}" style="--ring-color:${p.color}">
                        <span class="q-player-chip__face">${T.avatar(p.avatar)}</span>
                        <span class="q-player-chip__name">${C.escapeHtml(p.name)}</span>
                        <span class="q-player-chip__badge">${hasAnswered ? '✓' : '…'}</span>
                    </span>
                `;
            }).join('');

            statusHtml = `
                <div class="q-status-wrap">
                    <span class="${allAnswered || this.allGuessesIn ? 'tag tag--all-guesses' : 'tag'}" id="q-counter-tag">
                        ${(allAnswered || this.allGuessesIn)
                            ? '<span class="q-check-pulse">✓</span>All have made their guesses!'
                            : `<span class="dot is-active"></span>Answered ${answeredCount} / ${totalPlayers}`
                        }
                    </span>
                    <div class="q-players-status" id="q-players-status">${playerChips}</div>
                </div>
            `;
        }

        let clockDisplay = Math.ceil(QUESTION_MS / 1000) + 's';
        let clockLabel = 'Time left';
        if (isReveal) {
            clockDisplay = 'A+';
            clockLabel = 'Answer';
        } else if (isChoices) {
            clockDisplay = '•••';
            clockLabel = 'Revealing';
        }

        C.hud(`
            <div class="q-screen">
                <div class="q-screen__top">
                    <div class="grow">
                        <div class="row" style="gap:8px;align-items:center;margin-bottom:6px">
                            <p class="eyebrow is-accent" style="margin:0">Family Trivia · Round ${this.qIndex + 1} of ${this.order.length}</p>
                            <span class="tag tag--difficulty tag--${item.difficulty || 'easy'}">${(item.difficulty || 'easy').toUpperCase()}</span>
                            <span class="tag tag--category">${C.escapeHtml(item.category || 'General')}</span>
                            <span class="tag tag--pts">Up to +${ptsCfg.max.toLocaleString()} pts</span>
                        </div>
                        <h2 class="q-screen__question">${C.escapeHtml(item.q)}</h2>
                    </div>
                    <div class="q-screen__clock">
                        <span class="numeral" id="q-clock">${clockDisplay}</span>
                        <span class="eyebrow">${clockLabel}</span>
                    </div>
                </div>

                <div class="timer-bar"><span id="q-bar" style="width:${isChoices ? '0%' : '100%'}"></span></div>

                <div class="q-grid">${cards}</div>

                <div class="q-screen__foot">
                    ${statusHtml}
                    ${T.scoreRail(T.sorted(C.players, this.scores).slice(0, 6))}
                </div>
            </div>
        `);

        if (this.phase === 'asking') {
            this.updateClock(performance.now() - this.questionStart);
        }
    }

    destroy() {
        this.phase = 'done';
        this.accepting = false;
        if (this.rafId) cancelAnimationFrame(this.rafId);
        clearTimeout(this.timeoutId);
        clearTimeout(this.revealTimeoutId);
        this.rafId = null;
        this.timeoutId = null;
        this.revealTimeoutId = null;
    }
}

C.registerGame({
    id: 'trivia',
    title: 'Family Trivia',
    tagline: 'Quiz',
    players: '2–8 players',
    control: '4-button buzzer',
    description: 'Fast-paced quiz showdown. Over 500 questions across all difficulties with live speed bonuses.',
    accent: '#2563eb',
    icon: 'brain',
    create: (ctx) => new FamilyTrivia(ctx)
});

})(window);

