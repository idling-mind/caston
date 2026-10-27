/* ==========================================================================
   CastOn — Game: Hi-Lo Streak (Push Your Luck)
   - Simultaneous party card game! Watch the TV card and predict whether the
     next card drawn will be HIGHER, LOWER, or the EXACT SAME RANK.
   - Build a Streak Multiplier up to 5× or Bank Safely when the card is tricky!
   - Includes built-in How-To-Play instructions on both TV and phones.
   ========================================================================== */
(function (w) {
'use strict';

const CastOn = w.CastOn;
const C = CastOn.cards;
const T = CastOn.tools;

const INSTRUCTIONS = [
    'Rank Order (Low → High): 2, 3, 4, 5, 6, 7, 8, 9, 10, J (11), Q (12), K (13), A (14).',
    'Each round, everyone simultaneously predicts if the NEXT card will be HIGHER, LOWER, or SAME RANK.',
    'Every correct call boosts your Streak Multiplier (1× → 2× → 3× → 4× → 5×) for massive points!',
    'Stuck on a middle card (like 7 or 8)? Tap "💰 Bank Safe (+75 pts)" to score without risking your streak!'
];

const HOWTO_STEPS = [
    {
        title: 'Predict Higher or Lower',
        text: 'Check the current card on the TV (2 is lowest, Ace is highest). Lock in HIGHER, LOWER, or SAME on your phone!'
    },
    {
        title: 'Build Your 5× Streak',
        text: 'Consecutive correct predictions multiply your score up to 5×! A wrong call resets your multiplier back to 1×.'
    },
    {
        title: 'Know When to Bank Safe',
        text: 'When a risky middle card (7, 8, 9) appears, you can tap "💰 Bank Safe" to protect your multiplier and take guaranteed points!'
    }
];

class HiLoStreakGame extends CastOn.Game {
    constructor(ctx) {
        super(ctx);
        this.ctx = ctx;
        this.running = true;
        this.rafId = null;

        this.roster = C.buildRoster(ctx, 1);
        this.scores = {};
        this.streaks = {};
        this.choices = {};
        this.roundDelta = {};

        this.roster.forEach(p => {
            this.scores[p.id] = 0;
            this.streaks[p.id] = 1;
        });

        this.round = 0;
        this.maxRounds = 8;
        this.phase = 'howto'; // 'howto' | 'predict' | 'reveal' | 'done'
        this.showHelpModal = false;

        this.deck = C.createStandardDeck({ decks: 1 });
        this.currentCard = this.deck.pop();
        this.nextCard = null;
        this.history = [this.currentCard];

        this.statusBanner = 'Get ready to ride the streak!';
        this.clock = 12;
        this.clockTimer = null;
        this.stepTimer = null;
        this.animator = new C.CardAnimator();

        this.loop = this.loop.bind(this);
        this.rafId = requestAnimationFrame(this.loop);

        this.enterHowToPhase();
    }

    clearTimers() {
        if (this.clockTimer) { clearInterval(this.clockTimer); this.clockTimer = null; }
        if (this.stepTimer) { clearTimeout(this.stepTimer); this.stepTimer = null; }
    }

    onPlayersSync() {
        Object.values(this.ctx.players || {}).forEach(p => {
            if (this.scores[p.id] === undefined) {
                this.scores[p.id] = 0;
                this.streaks[p.id] = 1;
                this.roster.push(Object.assign({}, p));
            }
        });
        this.syncControllers();
    }

    enterHowToPhase() {
        this.clearTimers();
        this.phase = 'howto';
        this.clock = null;
        this.syncControllers();
        this.updateOverlay();
    }

    startRound() {
        this.clearTimers();
        this.round++;
        if (this.round > this.maxRounds) {
            this.finishGame();
            return;
        }

        if (this.deck.length < 5) {
            this.deck = C.createStandardDeck({ decks: 1 });
        }

        this.phase = 'predict';
        this.nextCard = null;
        this.choices = {};
        this.roundDelta = {};
        this.clock = 10;
        this.statusBanner = `Card ${this.round} of ${this.maxRounds}: Current is ${this.currentCard.rank}${this.currentCard.suit} — Higher or Lower?`;
        this.ctx.sound.blip();

        // AI choices
        this.stepTimer = setTimeout(() => {
            this.roster.forEach(p => {
                if (!p.__ai || this.choices[p.id]) return;
                const val = this.currentCard.value;
                let pick = 'higher';
                if (val >= 7 && val <= 9 && this.streaks[p.id] >= 3) pick = 'bank';
                else if (val > 8) pick = 'lower';
                else if (val < 8) pick = 'higher';
                else pick = Math.random() < 0.5 ? 'higher' : 'lower';
                this.lockPrediction(p.id, pick);
            });
        }, 900);

        this.syncControllers();
        this.updateOverlay();

        this.clockTimer = setInterval(() => {
            if (!this.running || this.phase !== 'predict') return;
            this.clock--;
            if (this.clock <= 0) {
                this.revealNextCard();
            } else {
                this.updateOverlay();
            }
        }, 1000);
    }

    lockPrediction(playerId, choice) {
        if (this.phase !== 'predict') return;
        if (this.choices[playerId]) return;
        this.choices[playerId] = choice; // 'higher' | 'lower' | 'same' | 'bank'
        this.ctx.sound.pop();

        this.syncControllers();
        this.updateOverlay();

        if (this.roster.every(p => !!this.choices[p.id])) {
            this.clearTimers();
            this.stepTimer = setTimeout(() => this.revealNextCard(), 500);
        }
    }

    revealNextCard() {
        this.clearTimers();
        this.phase = 'reveal';
        this.nextCard = this.deck.pop();

        const view = this.ctx.view;
        this.animator.fly({
            card: this.nextCard,
            fromX: view.w / 2 - 140,
            fromY: view.h * 0.49,
            toX: view.w / 2 + 110,
            toY: view.h * 0.49,
            duration: 360
        });

        const curVal = this.currentCard.value;
        const nxtVal = this.nextCard.value;
        const actual = nxtVal > curVal ? 'higher' : (nxtVal < curVal ? 'lower' : 'same');

        this.roster.forEach(p => {
            const ch = this.choices[p.id];
            const mult = this.streaks[p.id] || 1;
            if (!ch) {
                this.streaks[p.id] = 1;
                this.roundDelta[p.id] = '⏰ MISSED (1×)';
                return;
            }
            if (ch === 'bank') {
                const pts = 75 * mult;
                this.scores[p.id] += pts;
                this.roundDelta[p.id] = `💰 BANKED +${pts}`;
                return;
            }
            if (ch === actual) {
                const base = ch === 'same' ? 400 : 120;
                const pts = base * mult;
                this.scores[p.id] += pts;
                this.streaks[p.id] = Math.min(5, mult + 1);
                this.roundDelta[p.id] = `🔥 +${pts} (${this.streaks[p.id]}×)`;
            } else {
                this.streaks[p.id] = 1;
                this.roundDelta[p.id] = '❌ WRONG (1×)';
            }
        });

        const dirLabel = actual === 'higher' ? '⬆️ HIGHER' : (actual === 'lower' ? '⬇️ LOWER' : '🎯 EXACT SAME');
        this.statusBanner = `Revealed ${this.nextCard.rank}${this.nextCard.suit} (${dirLabel} than ${this.currentCard.rank}${this.currentCard.suit})!`;
        this.ctx.sound.fanfare();

        this.syncControllers();
        this.updateOverlay();

        this.stepTimer = setTimeout(() => {
            this.currentCard = this.nextCard;
            this.history.push(this.currentCard);
            if (this.history.length > 6) this.history.shift();
            this.startRound();
        }, 3600);
    }

    finishGame() {
        this.clearTimers();
        this.phase = 'done';
        this.ended = true;
        const ranked = this.getRankedRoster();
        this.ctx.setOverlay(T.results({
            title: 'Hi-Lo Streak',
            kicker: 'Final Streak Standings',
            rows: ranked,
            playerCount: ranked.length
        }));
        this.ctx.controller.setLayout('dpad', {
            title: 'Game Over',
            subtitle: 'Leader: press A to return to lobby'
        });
        this.ctx.sound.fanfare();
    }

    getRankedRoster() {
        return this.roster
            .map(p => Object.assign({}, p, { score: Math.round(this.scores[p.id] || 0) }))
            .sort((a, b) => b.score - a.score);
    }

    syncControllers() {
        if (this.phase === 'howto') {
            this.ctx.controller.setLayout('cards', {
                eyebrow: 'HOW TO PLAY',
                title: 'Hi-Lo Streak',
                subtitle: 'Read the rules below or tap Start Game!',
                instructions: INSTRUCTIONS,
                openRules: true,
                hand: [],
                emptyText: 'Predict Higher, Lower, or Same Rank on your phone each round!',
                actions: [
                    { id: 'start_game', label: '▶ Start Game Now', style: 'primary' }
                ]
            });
            return;
        }

        const cPhone = C.toPhoneCard(this.currentCard, { playable: false, subText: `Value: ${this.currentCard.value}/14` });
        const nPhone = this.nextCard ? C.toPhoneCard(this.nextCard, { playable: false, subText: 'REVEALED' }) : null;

        this.roster.forEach(p => {
            if (p.__bot || p.__demo) return;
            const myChoice = this.choices[p.id];
            const mult = this.streaks[p.id] || 1;

            if (this.phase === 'predict') {
                this.ctx.controller.setLayout('cards', {
                    eyebrow: myChoice ? `✓ LOCKED IN: ${myChoice.toUpperCase()}` : `ROUND ${this.round}/${this.maxRounds} · ${mult}× STREAK`,
                    title: myChoice ? 'Waiting for reveal...' : `Current Card: ${this.currentCard.rank}${this.currentCard.suit}`,
                    subtitle: `Your Multiplier: ${mult}× · Correct call awards +${120 * mult} pts!`,
                    instructions: INSTRUCTIONS,
                    selectMode: 'none',
                    tableInfo: {
                        label: `Current Card: ${this.currentCard.rank}${this.currentCard.suit} (Val ${this.currentCard.value}/14)`,
                        badge: `Streak: ${mult}×`
                    },
                    hand: [cPhone],
                    actions: myChoice ? [] : [
                        { id: 'higher', label: '⬆️ HIGHER', sublabel: `+${120 * mult} pts`, style: 'emerald' },
                        { id: 'lower',  label: '⬇️ LOWER',  sublabel: `+${120 * mult} pts`, style: 'danger' },
                        { id: 'same',   label: '🎯 SAME RANK', sublabel: `+${400 * mult} Jackpot!`, style: 'amber' },
                        { id: 'bank',   label: '💰 BANK SAFE', sublabel: `+${75 * mult} pts · Keep ${mult}×`, style: 'primary' }
                    ]
                }, p.id);
            } else {
                this.ctx.controller.setLayout('cards', {
                    eyebrow: 'CARD REVEALED!',
                    title: this.roundDelta[p.id] || 'Next Card Dealt!',
                    subtitle: `New Streak Multiplier: ${this.streaks[p.id] || 1}×`,
                    instructions: INSTRUCTIONS,
                    selectMode: 'none',
                    hand: nPhone ? [cPhone, nPhone] : [cPhone],
                    actions: []
                }, p.id);
            }
        });
    }

    onInput(playerId, data) {
        if (!this.running) return;

        if (this.phase === 'howto') {
            if ((data.action === 'btn' && data.state === 'down' && data.button === 'A') ||
                (data.action === 'card_action' && data.id === 'start_game')) {
                this.startRound();
            }
            return;
        }

        if (data.action === 'btn' && data.state === 'down' && data.button === 'Y') {
            this.showHelpModal = !this.showHelpModal;
            this.updateOverlay();
            return;
        }

        if (data.action === 'card_action' && this.phase === 'predict') {
            this.lockPrediction(playerId, data.id);
            return;
        }

        // Demo keyboard controls
        if (data.action === 'btn' && data.state === 'down' && this.phase === 'predict') {
            if (data.button === 'UP' || data.button === 'A') this.lockPrediction(playerId, 'higher');
            else if (data.button === 'DOWN' || data.button === 'B') this.lockPrediction(playerId, 'lower');
            else if (data.button === 'LEFT') this.lockPrediction(playerId, 'bank');
            else if (data.button === 'RIGHT') this.lockPrediction(playerId, 'same');
        }
    }

    updateOverlay() {
        if (this.phase === 'done') return;

        if (this.phase === 'howto') {
            this.ctx.setOverlay(C.renderHowToPlayModal({
                title: 'Hi-Lo Streak (Push Your Luck)',
                tagline: 'HOW TO PLAY · SIMULTANEOUS PREDICTION',
                subtitle: 'Predict Higher, Lower, or Same Rank to build a massive 5× Streak Multiplier!',
                steps: HOWTO_STEPS,
                controls: 'Tap HIGHER, LOWER, SAME RANK, or BANK SAFE on your phone before the 10s timer runs out.',
                scoring: 'Correct calls award 120 × Streak pts (400 × Streak for Same Rank). Bank Safe awards 75 × Streak pts without risk.',
                countdown: this.clock
            }));
            return;
        }

        const ranked = this.getRankedRoster();
        const modalHtml = this.showHelpModal ? C.renderHowToPlayModal({
            title: 'Hi-Lo Streak — Rules',
            steps: HOWTO_STEPS,
            isMidGame: true
        }) : '';

        this.ctx.setOverlay(C.renderHudFrame({
            kicker: `HI-LO STREAK · CARD ${this.round} OF ${this.maxRounds}`,
            title: this.statusBanner,
            statusPill: `Current: ${this.currentCard.rank}${this.currentCard.suit} (Val ${this.currentCard.value}/14)`,
            scoreRail: T.scoreRail(ranked),
            clock: this.phase === 'predict' ? this.clock : null,
            quickSteps: [
                '2 is Lowest (2) · Ace is Highest (14)',
                'Correct call boosts your Streak Multiplier up to 5×',
                'Tap "💰 Bank Safe" on middle cards (7, 8, 9) to protect your streak!'
            ],
            footerNote: 'Recent cards history shown at top of table',
            modalHtml
        }));
    }

    loop() {
        if (!this.running) return;
        const { ctx: g, view } = this.ctx;

        C.drawTableBackdrop(g, view, {
            feltCenter: '#0f2942',
            feltEdge: '#071321',
            railColor: '#38bdf8',
            tableLabel: 'Hi-Lo Streak · 2 is Low · Ace is High · Build Your 5× Multiplier'
        });

        const cx = view.w / 2;
        const cy = view.h * 0.49;

        // Draw recent history mini-trail at top of table
        const histY = view.h * 0.25;
        this.history.forEach((hc, idx) => {
            const hx = cx + (idx - (this.history.length - 1) / 2) * 52;
            C.drawCard(g, hx, histY, 44, 62, hc);
        });

        // Draw Shoe, Current Card, and Next Card slot
        C.drawDeckStack(g, cx - 140, cy, 82, 116, this.deck.length, `${this.deck.length} left`);
        C.drawCard(g, cx - 15, cy, 92, 130, this.currentCard, {
            highlight: '#38bdf8',
            badge: 'CURRENT',
            badgeColor: '#0284c7'
        });

        if (this.nextCard) {
            C.drawCard(g, cx + 110, cy, 92, 130, this.nextCard, {
                highlight: '#10b981',
                badge: 'NEXT',
                badgeColor: '#10b981'
            });
        } else {
            C.drawCard(g, cx + 110, cy, 92, 130, null, {
                faceDown: true,
                highlight: '#f59e0b'
            });
        }

        // Draw Player Seats
        const seats = C.computeSeats(view, this.roster.length, {
            semicircle: true,
            cy: view.h * 0.46,
            rx: Math.min(view.w * 0.39, 480),
            ry: Math.min(view.h * 0.34, 225)
        });

        this.roster.forEach((p, idx) => {
            const s = seats[idx];
            const ch = this.choices[p.id];
            const mult = this.streaks[p.id] || 1;
            let badge = `${mult}× STREAK`;
            let badgeBg = '#0284c7';
            if (this.phase === 'reveal' && this.roundDelta[p.id]) {
                badge = this.roundDelta[p.id];
                badgeBg = badge.includes('❌') || badge.includes('⏰') ? '#e11d48' : '#10b981';
            } else if (ch) {
                badge = '✓ LOCKED';
                badgeBg = '#10b981';
            }
            C.drawPlayerSeat(g, s.x, s.y, p, {
                isActive: this.phase === 'predict' && !ch,
                subtitle: `${this.scores[p.id] || 0} pts (${mult}×)`,
                badge: badge,
                badgeBg: badgeBg
            });
        });

        this.animator.draw(g);
        this.rafId = requestAnimationFrame(this.loop);
    }

    destroy() {
        this.running = false;
        this.clearTimers();
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }
}

CastOn.registerGame({
    id: 'hilo',
    title: 'Hi-Lo Streak',
    tagline: 'Push Your Luck',
    players: '1–8 players',
    control: 'Simultaneous Buzzer',
    description: 'Predict Higher, Lower, or Same Rank simultaneously to build a 5× streak multiplier — or bank safely!',
    accent: '#38bdf8',
    icon: 'trending-up',
    css: C.HOWTO_CSS,
    create: (ctx) => new HiLoStreakGame(ctx)
});

})(window);

