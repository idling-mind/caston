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
const REVEAL_MS = 5200;
const QUESTIONS_PER_MATCH = 8;
const CORRECT = 800;      // base points
const SPEED_BONUS = 500;  // extra for answering instantly

const OPTION_COLORS = ['#f43f5e', '#2563eb', '#f59e0b', '#10b981'];
const LETTERS = 'ABCD';

const QUESTIONS = [
    { q: 'Which planet in our solar system has the most moons?', options: ['Jupiter', 'Saturn', 'Neptune', 'Mars'], answer: 1 },
    { q: 'What is the fastest land animal in the world?', options: ['Lion', 'Pronghorn', 'Cheetah', 'Greyhound'], answer: 2 },
    { q: 'In Swedish, what do you call a coffee and pastry break?', options: ['Lagom', 'Fika', 'Smörgås', 'Kanel'], answer: 1 },
    { q: 'How many bones are in an adult human body?', options: ['206', '186', '256', '300'], answer: 0 },
    { q: "Which element has the chemical symbol 'Au'?", options: ['Silver', 'Copper', 'Argon', 'Gold'], answer: 3 },
    { q: 'Which ocean is the largest and deepest on Earth?', options: ['Atlantic', 'Indian', 'Pacific', 'Arctic'], answer: 2 },
    { q: 'Which country is credited with inventing paper?', options: ['Egypt', 'China', 'Greece', 'India'], answer: 1 },
    { q: 'What is the hardest natural substance on Earth?', options: ['Quartz', 'Steel', 'Diamond', 'Obsidian'], answer: 2 },
    { q: 'How many strings does a standard violin have?', options: ['Four', 'Five', 'Six', 'Seven'], answer: 0 },
    { q: 'Which gas do plants absorb from the air?', options: ['Oxygen', 'Nitrogen', 'Hydrogen', 'Carbon dioxide'], answer: 3 },
    { q: 'What is the capital of Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], answer: 2 },
    { q: 'How long does sunlight take to reach Earth?', options: ['8 seconds', '8 minutes', '8 hours', '8 days'], answer: 1 },
    { q: 'Which animal is known as the ship of the desert?', options: ['Horse', 'Camel', 'Llama', 'Elephant'], answer: 1 },
    { q: 'How many players are on a standard football (soccer) team?', options: ['Nine', 'Ten', 'Eleven', 'Twelve'], answer: 2 },
    { q: 'What is the largest species of shark?', options: ['Great white', 'Whale shark', 'Tiger shark', 'Hammerhead'], answer: 1 },
    { q: 'Which vitamin does sunlight help your body produce?', options: ['Vitamin A', 'Vitamin B12', 'Vitamin C', 'Vitamin D'], answer: 3 }
];

function shuffledDeck() {
    const idx = QUESTIONS.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    return idx.slice(0, QUESTIONS_PER_MATCH);
}

class FamilyTrivia {
    constructor() {
        this.id = 'trivia';
        this.scores = {};
        this.answers = {};
        this.order = shuffledDeck();
        this.qIndex = -1;
        this.accepting = false;
        this.phase = 'idle';
        this.rafId = null;
        this.timeoutId = null;

        Object.keys(C.players).forEach(id => { this.scores[id] = 0; });

        const g = C.ctx;
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, C.canvas.width, C.canvas.height);
        g.restore();

        C.chord([523, 659], 120, 'triangle');
        this.beginQuestion();
        this.startClock();
    }

    /* ---------- flow ----------------------------------------------------- */

    get item() {
        return QUESTIONS[this.order[this.qIndex]];
    }

    beginQuestion() {
        this.qIndex++;

        if (this.qIndex >= this.order.length) {
            this.finish();
            return;
        }

        this.answers = {};
        this.accepting = true;
        this.phase = 'asking';
        this.questionStart = performance.now();

        C.setLayout('trivia', {
            title: 'Question ' + (this.qIndex + 1) + ' of ' + this.order.length,
            subtitle: 'Tap the answer you think is right',
            options: this.item.options
        });

        this.renderBoard();
        C.chord([659, 784], 80, 'triangle');
    }

    startClock() {
        const tick = () => {
            if (this.phase === 'done') return;

            if (this.accepting) {
                const elapsed = performance.now() - this.questionStart;
                if (elapsed >= QUESTION_MS) {
                    this.reveal();
                } else {
                    this.updateClock(elapsed);
                }
            }
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    updateClock(elapsed) {
        // The countdown only exists while the question is open. During the
        // reveal the clock is a static "A+" badge, so never overwrite it.
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
        if (!this.accepting || this.phase !== 'asking') return;
        if (data.action !== 'trivia_answer') return;
        if (this.answers[playerId] !== undefined) return;
        if (!C.players[playerId]) return;

        this.answers[playerId] = {
            choice: data.choice,
            elapsed: performance.now() - this.questionStart
        };

        C.tone(620, 70, 'sine');
        C.vibrate(playerId, 25);
        this.markPicks();

        const total = Object.keys(C.players).length;
        if (total > 0 && Object.keys(this.answers).length >= total) {
            setTimeout(() => this.reveal(), 450);
        }
    }

    /* ---------- scoring -------------------------------------------------- */

    reveal() {
        if (!this.accepting) return;
        this.accepting = false;
        this.phase = 'reveal';

        const item = this.item;
        let anyCorrect = false;

        Object.keys(C.players).forEach(id => {
            const ans = this.answers[id];
            if (!ans) return;

            if (ans.choice === item.answer) {
                const speed = Math.max(0, 1 - ans.elapsed / QUESTION_MS);
                const gained = Math.round(CORRECT + SPEED_BONUS * speed);
                this.scores[id] = (this.scores[id] || 0) + gained;
                C.toController(id, { type: 'score_update', score: this.scores[id] });
                C.vibrate(id, 130);
                anyCorrect = true;
            } else {
                C.vibrate(id, 45);
            }
        });

        C.chord(anyCorrect ? [784, 988] : [262, 196], 140, anyCorrect ? 'triangle' : 'square');
        this.renderBoard();

        this.timeoutId = setTimeout(() => this.beginQuestion(), REVEAL_MS);
    }

    finish() {
        this.phase = 'done';
        this.accepting = false;

        C.setLayout('trivia', {
            title: 'Trivia complete',
            subtitle: 'Leader: press A for the next game',
            options: ['—', '—', '—', '—']
        });

        C.hud(T.results({
            title: 'Family Trivia',
            kicker: 'All questions answered',
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
        if (this.phase === 'asking' || this.phase === 'reveal') this.renderBoard();
    }

    markPicks() {
        this.item.options.forEach((_, i) => {
            const host = document.getElementById('q-picks-' + i);
            if (!host) return;
            host.innerHTML = Object.keys(this.answers)
                .filter(id => this.answers[id].choice === i)
                .map(id => {
                    const p = C.players[id];
                    return p ? `<span class="q-card__face" style="--ring-color:${p.color}">${T.avatar(p.avatar)}</span>` : '';
                })
                .join('');
        });

        const answered = document.getElementById('q-answered');
        if (answered) {
            answered.textContent = 'Answered ' + Object.keys(this.answers).length + ' / ' + Object.keys(C.players).length;
        }
    }

    renderBoard() {
        if (this.qIndex < 0 || this.qIndex >= this.order.length) return;

        const item = this.item;
        const revealed = this.phase === 'reveal';

        const cards = item.options.map((opt, i) => {
            const isAnswer = i === item.answer;
            const picked = Object.keys(this.answers)
                .filter(id => this.answers[id].choice === i)
                .map(id => {
                    const p = C.players[id];
                    return p ? `<span class="q-card__face" style="--ring-color:${p.color}">${T.avatar(p.avatar)}</span>` : '';
                }).join('');

            return `
                <div class="q-card${revealed && !isAnswer ? ' is-dim' : ''}${revealed && isAnswer ? ' is-winner' : ''}"
                     style="--card-accent:${OPTION_COLORS[i]}">
                    <span class="q-card__key">${LETTERS[i]}</span>
                    <span class="q-card__text">${C.escapeHtml(opt)}</span>
                    <span class="q-card__picks" id="q-picks-${i}">${picked}</span>
                    ${revealed && isAnswer ? `<span class="q-card__tick">${C.icon('check')}</span>` : ''}
                </div>`;
        }).join('');

        C.hud(`
            <div class="q-screen">
                <div class="q-screen__top">
                    <div class="grow">
                        <p class="eyebrow is-accent">Family Trivia · Round ${this.qIndex + 1} of ${this.order.length}</p>
                        <h2 class="q-screen__question">${C.escapeHtml(item.q)}</h2>
                    </div>
                    <div class="q-screen__clock">
                        <span class="numeral" id="q-clock">${revealed ? 'A+' : Math.ceil(QUESTION_MS / 1000) + 's'}</span>
                        <span class="eyebrow">${revealed ? 'Answer' : 'Time left'}</span>
                    </div>
                </div>

                <div class="timer-bar"><span id="q-bar" style="width:100%"></span></div>

                <div class="q-grid">${cards}</div>

                <div class="q-screen__foot">
                    <span class="tag" id="q-answered">Answered ${Object.keys(this.answers).length} / ${Object.keys(C.players).length}</span>
                    ${T.scoreRail(T.sorted(C.players, this.scores).slice(0, 6))}
                </div>
            </div>
        `);

        // Only drive the live countdown while the question is open; during the
        // reveal the clock shows the "A+" badge set by renderBoard().
        if (this.phase === 'asking') {
            this.updateClock(performance.now() - this.questionStart);
        }
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
    id: 'trivia',
    title: 'Family Trivia',
    tagline: 'Quiz',
    players: '2–8 players',
    control: '4-button buzzer',
    description: 'Fast-paced quiz showdown. Colour-coded buzzers, live scoring, and speed bonuses for the bold.',
    accent: '#2563eb',
    icon: 'brain',
    create: () => new FamilyTrivia()
});

})(window);
