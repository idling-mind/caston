/* ==========================================================================
   CastOn — Game: Royale Blackjack (21 vs. TV Dealer)
   - All players bet chips and play simultaneously against the TV House Dealer!
   - Hit, Stand, or Double Down on your phone to get as close to 21 as possible
     without going over (Bust).
   - Includes built-in How-To-Play instructions on both TV and phones.
   ========================================================================== */
(function (w) {
'use strict';

const CastOn = w.CastOn;
const C = CastOn.cards;
const T = CastOn.tools;

const INSTRUCTIONS = [
    'Goal: Beat the TV Dealer\'s hand without exceeding 21! Face cards (J, Q, K) = 10, Aces = 11 or 1.',
    'Step 1 (Betting): Choose your chip wager ($50, $100, $250, or $500) before the cards are dealt.',
    'Step 2 (Action): Tap HIT for another card, STAND to hold your total, or DOUBLE DOWN (2x bet, 1 card).',
    'Step 3 (Showdown): Dealer draws to 17. Natural Blackjack (Ace + 10-card) pays 3:2 bonus!'
];

const HOWTO_STEPS = [
    {
        title: 'Place Your Chip Wager',
        text: 'Everyone starts with $1,000 in casino chips. Pick your bet ($50 to $500) on your phone at the start of each hand.'
    },
    {
        title: 'Hit, Stand, or Double',
        text: 'Everyone plays simultaneously on their phones! Get closer to 21 than the Dealer without busting over 21.'
    },
    {
        title: 'Beat the House Dealer',
        text: 'The TV Dealer must draw until reaching 17+. Win 1:1 on normal wins, or 3:2 on a 2-card 21 Blackjack!'
    }
];

class RoyaleBlackjackGame extends CastOn.Game {
    constructor(ctx) {
        super(ctx);
        this.ctx = ctx;
        this.running = true;
        this.rafId = null;

        this.roster = C.buildRoster(ctx, 1);
        this.chips = {};
        this.roster.forEach(p => { this.chips[p.id] = 1000; });

        this.round = 0;
        this.maxRounds = 5;
        this.phase = 'howto'; // 'howto' | 'betting' | 'action' | 'dealer' | 'done'
        this.showHelpModal = false;

        this.shoe = C.createStandardDeck({ decks: 2 });
        this.dealerHand = [];
        this.hands = {};
        this.bets = {};
        this.states = {}; // 'betting' | 'playing' | 'stand' | 'bust' | 'blackjack'
        this.resultsText = {};

        this.statusBanner = 'Welcome to Royale Blackjack!';
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
            if (this.chips[p.id] === undefined) {
                this.chips[p.id] = 1000;
                this.roster.push(Object.assign({}, p));
            }
        });
        this.syncControllers();
    }

    drawCardFromShoe(faceDown) {
        if (this.shoe.length < 10) {
            this.shoe = C.createStandardDeck({ decks: 2 });
        }
        const c = Object.assign({}, this.shoe.pop());
        c.faceDown = !!faceDown;
        return c;
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

        this.phase = 'betting';
        this.dealerHand = [];
        this.hands = {};
        this.bets = {};
        this.states = {};
        this.resultsText = {};

        this.roster.forEach(p => {
            if ((this.chips[p.id] || 0) < 50) {
                this.chips[p.id] = 250; // Lucky house rebuy
            }
            this.hands[p.id] = [];
            this.bets[p.id] = 0;
            this.states[p.id] = 'betting';
        });

        this.statusBanner = `Hand ${this.round} of ${this.maxRounds}: Place your chip bets on your phones!`;
        this.clock = 10;
        this.ctx.sound.blip();

        // AI players lock bets after 1s
        this.stepTimer = setTimeout(() => {
            this.roster.forEach(p => {
                if (p.__ai && !this.bets[p.id]) {
                    const opts = [50, 100, 250].filter(v => v <= this.chips[p.id]);
                    const pick = opts[Math.floor(Math.random() * opts.length)] || 50;
                    this.lockBet(p.id, pick);
                }
            });
        }, 900);

        this.syncControllers();
        this.updateOverlay();

        this.clockTimer = setInterval(() => {
            if (!this.running || this.phase !== 'betting') return;
            this.clock--;
            if (this.clock <= 0) {
                this.roster.forEach(p => {
                    if (!this.bets[p.id]) this.lockBet(p.id, Math.min(100, this.chips[p.id]));
                });
                this.dealInitialCards();
            } else {
                this.updateOverlay();
            }
        }, 1000);
    }

    lockBet(playerId, amount) {
        if (this.phase !== 'betting') return;
        if (this.bets[playerId] > 0) return;
        const maxAvail = this.chips[playerId] || 100;
        const wager = Math.max(50, Math.min(maxAvail, Number(amount) || 100));
        this.bets[playerId] = wager;
        this.chips[playerId] -= wager;
        this.states[playerId] = 'bet_locked';
        this.ctx.sound.pop();

        this.syncControllers();
        this.updateOverlay();

        if (this.roster.every(p => this.bets[p.id] > 0)) {
            this.dealInitialCards();
        }
    }

    dealInitialCards() {
        this.clearTimers();
        this.phase = 'action';

        // Deal 2 cards to each player and 2 to dealer (second face-down)
        this.dealerHand = [
            this.drawCardFromShoe(false),
            this.drawCardFromShoe(true)
        ];

        this.roster.forEach(p => {
            this.hands[p.id] = [
                this.drawCardFromShoe(false),
                this.drawCardFromShoe(false)
            ];
            const ev = C.blackjackValue(this.hands[p.id]);
            if (ev.blackjack) {
                this.states[p.id] = 'blackjack';
            } else {
                this.states[p.id] = 'playing';
            }
        });

        this.statusBanner = `Dealer shows ${this.dealerHand[0].rank}${this.dealerHand[0].suit} — Hit, Stand, or Double Down!`;
        this.clock = 15;
        this.ctx.sound.fanfare();

        // AI decisions
        this.stepTimer = setTimeout(() => {
            this.runAiActions();
        }, 1200);

        this.syncControllers();
        this.updateOverlay();

        if (this.allPlayersDone()) {
            this.stepTimer = setTimeout(() => this.runDealerPhase(), 1200);
            return;
        }

        this.clockTimer = setInterval(() => {
            if (!this.running || this.phase !== 'action') return;
            this.clock--;
            if (this.clock <= 0) {
                this.roster.forEach(p => {
                    if (this.states[p.id] === 'playing') this.states[p.id] = 'stand';
                });
                this.runDealerPhase();
            } else {
                this.updateOverlay();
            }
        }, 1000);
    }

    runAiActions() {
        if (!this.running || this.phase !== 'action') return;
        this.roster.forEach(p => {
            if (!p.__ai || this.states[p.id] !== 'playing') return;
            while (this.states[p.id] === 'playing') {
                const ev = C.blackjackValue(this.hands[p.id]);
                if (ev.total < 16) {
                    this.handlePlayerAction(p.id, 'hit');
                } else {
                    this.handlePlayerAction(p.id, 'stand');
                }
            }
        });
    }

    allPlayersDone() {
        return this.roster.every(p => this.states[p.id] !== 'playing');
    }

    handlePlayerAction(playerId, act) {
        if (this.phase !== 'action') return;
        if (this.states[playerId] !== 'playing') return;
        const hand = this.hands[playerId] || [];

        if (act === 'hit') {
            const c = this.drawCardFromShoe(false);
            hand.push(c);
            this.ctx.sound.pop();
            const ev = C.blackjackValue(hand);
            if (ev.bust) {
                this.states[playerId] = 'bust';
                this.ctx.sound.fail();
            } else if (ev.total === 21) {
                this.states[playerId] = 'stand';
                this.ctx.sound.success();
            }
        } else if (act === 'stand') {
            this.states[playerId] = 'stand';
            this.ctx.sound.blip();
        } else if (act === 'double' && hand.length === 2) {
            const extra = Math.min(this.bets[playerId], this.chips[playerId] || 0);
            this.chips[playerId] -= extra;
            this.bets[playerId] += extra;
            const c = this.drawCardFromShoe(false);
            hand.push(c);
            const ev = C.blackjackValue(hand);
            this.states[playerId] = ev.bust ? 'bust' : 'stand';
            this.ctx.sound.pop();
        }

        this.syncControllers();
        this.updateOverlay();

        if (this.allPlayersDone()) {
            this.clearTimers();
            this.stepTimer = setTimeout(() => this.runDealerPhase(), 900);
        }
    }

    runDealerPhase() {
        this.clearTimers();
        this.phase = 'dealer';

        // Reveal dealer hole card
        this.dealerHand.forEach(c => { c.faceDown = false; });

        // Dealer hits until 17+
        while (C.blackjackValue(this.dealerHand).total < 17) {
            this.dealerHand.push(this.drawCardFromShoe(false));
        }

        const dEval = C.blackjackValue(this.dealerHand);

        // Settle all player bets
        this.roster.forEach(p => {
            const pEval = C.blackjackValue(this.hands[p.id]);
            const wager = this.bets[p.id] || 0;
            if (pEval.bust) {
                this.resultsText[p.id] = `BUST (-$${wager})`;
            } else if (pEval.blackjack && !dEval.blackjack) {
                const win = Math.round(wager * 2.5);
                this.chips[p.id] += win;
                this.resultsText[p.id] = `BLACKJACK! +$${win - wager}`;
            } else if (dEval.bust || pEval.total > dEval.total) {
                const win = wager * 2;
                this.chips[p.id] += win;
                this.resultsText[p.id] = `WIN +$${wager}`;
            } else if (pEval.total === dEval.total) {
                this.chips[p.id] += wager;
                this.resultsText[p.id] = 'PUSH ($0)';
            } else {
                this.resultsText[p.id] = `LOSE (-$${wager})`;
            }
        });

        this.statusBanner = dEval.bust
            ? `💥 DEALER BUSTS (${dEval.total})! All standing players win!`
            : `Dealer stands on ${dEval.total} — Bets settled!`;
        this.ctx.sound.fanfare();

        this.syncControllers();
        this.updateOverlay();

        this.stepTimer = setTimeout(() => {
            this.startRound();
        }, 4500);
    }

    finishGame() {
        this.clearTimers();
        this.phase = 'done';
        this.ended = true;
        const ranked = this.getRankedRoster();
        this.ctx.setOverlay(T.results({
            title: 'Royale Blackjack',
            kicker: 'Final Casino Chip Counts',
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
            .map(p => Object.assign({}, p, { score: Math.round(this.chips[p.id] || 0) }))
            .sort((a, b) => b.score - a.score);
    }

    syncControllers() {
        if (this.phase === 'howto') {
            this.ctx.controller.setLayout('cards', {
                eyebrow: 'HOW TO PLAY',
                title: 'Royale Blackjack (21)',
                subtitle: 'Read the rules below or tap Start Game!',
                instructions: INSTRUCTIONS,
                openRules: true,
                hand: [],
                emptyText: 'Your cards and chip bets appear here each hand!',
                actions: [
                    { id: 'start_game', label: '▶ Deal First Hand', style: 'primary' }
                ]
            });
            return;
        }

        const upCard = this.dealerHand[0];
        const dEval = C.blackjackValue(this.dealerHand);

        this.roster.forEach(p => {
            if (p.__bot || p.__demo) return;
            const bank = this.chips[p.id] || 0;
            const wager = this.bets[p.id] || 0;
            const myHand = (this.hands[p.id] || []).map(c => C.toPhoneCard(c, { playable: false }));
            const pEval = C.blackjackValue(this.hands[p.id] || []);
            const st = this.states[p.id];

            if (this.phase === 'betting') {
                const locked = wager > 0;
                this.ctx.controller.setLayout('cards', {
                    eyebrow: `HAND ${this.round} OF ${this.maxRounds} · PLACE YOUR BET`,
                    title: locked ? `Bet Locked: $${wager}` : `Bankroll: $${bank}`,
                    subtitle: locked ? 'Waiting for other players to bet...' : 'Tap a chip amount below to wager on this hand:',
                    instructions: INSTRUCTIONS,
                    selectMode: 'none',
                    hand: [],
                    emptyText: locked ? `✓ $${wager} chip wager placed on the felt!` : 'Choose a chip bet below to receive your 2 cards.',
                    actions: locked ? [] : [
                        { id: 'bet', value: 50,  label: '$50 Chip',  sublabel: 'Safe bet', style: 'ghost' },
                        { id: 'bet', value: 100, label: '$100 Chip', sublabel: 'Standard', style: 'emerald', disabled: bank < 100 },
                        { id: 'bet', value: 250, label: '$250 Chip', sublabel: 'Big bet',  style: 'amber',   disabled: bank < 250 },
                        { id: 'bet', value: Math.min(500, bank), label: `$${Math.min(500, bank)} Max`, sublabel: 'High Roller', style: 'primary' }
                    ]
                }, p.id);
            } else if (this.phase === 'action') {
                const canAct = st === 'playing';
                const canDouble = canAct && (this.hands[p.id] || []).length === 2 && bank >= wager;
                this.ctx.controller.setLayout('cards', {
                    eyebrow: canAct ? 'YOUR ACTION' : `LOCKED IN (${st.toUpperCase()})`,
                    title: `Your Hand: ${pEval.label}`,
                    subtitle: `Dealer Shows: ${upCard ? upCard.rank + upCard.suit : '?'} · Wager: $${wager}`,
                    instructions: INSTRUCTIONS,
                    selectMode: 'none',
                    tableInfo: {
                        label: `Chips: $${bank} · Bet: $${wager}`,
                        badge: `Total: ${pEval.label}`
                    },
                    hand: myHand,
                    actions: canAct ? [
                        { id: 'hit',    label: '🃏 HIT',         sublabel: 'Draw 1 card', style: 'primary' },
                        { id: 'stand',  label: '✋ STAND',       sublabel: `Hold on ${pEval.total}`, style: 'emerald' },
                        { id: 'double', label: '💰 DOUBLE DOWN', sublabel: '2× Bet & 1 Card', style: 'amber', disabled: !canDouble }
                    ] : []
                }, p.id);
            } else {
                this.ctx.controller.setLayout('cards', {
                    eyebrow: 'SHOWDOWN',
                    title: this.resultsText[p.id] || `Hand: ${pEval.label}`,
                    subtitle: `Dealer Total: ${dEval.label} · Bankroll: $${bank}`,
                    instructions: INSTRUCTIONS,
                    selectMode: 'none',
                    tableInfo: {
                        label: `Dealer: ${dEval.label}`,
                        badge: `Bank: $${bank}`
                    },
                    hand: myHand,
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

        if (data.action === 'card_action') {
            if (data.id === 'bet') {
                this.lockBet(playerId, data.value);
            } else if (data.id === 'hit' || data.id === 'stand' || data.id === 'double') {
                this.handlePlayerAction(playerId, data.id);
            }
            return;
        }

        // Demo keyboard controls
        if (data.action === 'btn' && data.state === 'down') {
            if (this.phase === 'betting' && data.button === 'A') {
                this.lockBet(playerId, 100);
            } else if (this.phase === 'action') {
                if (data.button === 'A') this.handlePlayerAction(playerId, 'hit');
                else if (data.button === 'B') this.handlePlayerAction(playerId, 'stand');
            }
        }
    }

    updateOverlay() {
        if (this.phase === 'done') return;

        if (this.phase === 'howto') {
            this.ctx.setOverlay(C.renderHowToPlayModal({
                title: 'Royale Blackjack (21 vs. Dealer)',
                tagline: 'HOW TO PLAY · CASINO TABLE',
                subtitle: 'Everyone plays simultaneously against the TV House Dealer across 5 hands!',
                steps: HOWTO_STEPS,
                controls: 'Tap a chip bet on your phone, then use HIT, STAND, or DOUBLE DOWN to build your hand.',
                scoring: 'Start with $1,000 chips. Beat the dealer for 1:1 payout or hit 2-card 21 Blackjack for 3:2!',
                countdown: this.clock
            }));
            return;
        }

        const ranked = this.getRankedRoster();
        const dEval = C.blackjackValue(this.dealerHand);
        const modalHtml = this.showHelpModal ? C.renderHowToPlayModal({
            title: 'Royale Blackjack — Rules',
            steps: HOWTO_STEPS,
            isMidGame: true
        }) : '';

        this.ctx.setOverlay(C.renderHudFrame({
            kicker: `ROYALE BLACKJACK · HAND ${this.round} OF ${this.maxRounds}`,
            title: this.statusBanner,
            statusPill: this.dealerHand.length ? `Dealer: ${dEval.label}` : 'Betting Open',
            scoreRail: T.scoreRail(ranked),
            clock: (this.phase === 'betting' || this.phase === 'action') ? this.clock : null,
            quickSteps: [
                'Place your chip bet ($50–$500) before the deal',
                'Tap HIT to draw a card or STAND to hold your total <= 21',
                'Dealer must draw to 17 · Blackjack pays 3:2!'
            ],
            footerNote: 'Simultaneous play — everyone acts at once on their phones!',
            modalHtml
        }));
    }

    loop() {
        if (!this.running) return;
        const { ctx: g, view } = this.ctx;

        C.drawTableBackdrop(g, view, {
            feltCenter: '#0f4c3a',
            feltEdge: '#06261d',
            railColor: '#10b981',
            tableLabel: 'Royale Blackjack · Dealer Stands on All 17s · Blackjack Pays 3 to 2'
        });

        const cx = view.w / 2;

        // Draw Dealer Hand at top of table
        const dealerY = view.h * 0.28;
        g.save();
        g.font = '800 12px "Space Grotesk", sans-serif';
        g.fillStyle = 'rgba(255, 255, 255, 0.75)';
        g.textAlign = 'center';
        const dEval = C.blackjackValue(this.dealerHand);
        g.fillText(`HOUSE DEALER (${this.dealerHand.length ? dEval.label : 'WAITING'})`, cx, dealerY - 64);
        g.restore();

        this.dealerHand.forEach((c, idx) => {
            const x = cx + (idx - (this.dealerHand.length - 1) / 2) * 56;
            C.drawCard(g, x, dealerY, 68, 96, c, { faceDown: !!c.faceDown });
        });

        // Draw Player Semicircle Seats + Player Cards
        const seats = C.computeSeats(view, this.roster.length, {
            semicircle: true,
            cy: view.h * 0.44,
            rx: Math.min(view.w * 0.38, 470),
            ry: Math.min(view.h * 0.34, 230)
        });

        this.roster.forEach((p, idx) => {
            const s = seats[idx];
            const pHand = this.hands[p.id] || [];
            const pEval = C.blackjackValue(pHand);
            const wager = this.bets[p.id] || 0;
            const st = this.states[p.id];

            // Draw player's cards fanned slightly above their seat
            pHand.forEach((c, ci) => {
                const cardX = s.x + (ci - (pHand.length - 1) / 2) * 32;
                const cardY = s.y - 78;
                C.drawCard(g, cardX, cardY, 56, 80, c, {
                    highlight: pEval.blackjack ? '#f59e0b' : (pEval.bust ? '#e11d48' : null)
                });
            });

            let badge = null;
            let badgeBg = p.color;
            if (this.phase === 'dealer' && this.resultsText[p.id]) {
                badge = this.resultsText[p.id];
                badgeBg = badge.startsWith('WIN') || badge.startsWith('BLACK') ? '#10b981' : (badge.startsWith('PUSH') ? '#64748b' : '#e11d48');
            } else if (pHand.length) {
                badge = `${pEval.label} · $${wager}`;
                if (pEval.bust) badgeBg = '#e11d48';
                else if (st === 'stand' || st === 'blackjack') badgeBg = '#10b981';
            } else if (wager > 0) {
                badge = `BET $${wager}`;
                badgeBg = '#10b981';
            }

            C.drawPlayerSeat(g, s.x, s.y, p, {
                isActive: st === 'playing' || (this.phase === 'betting' && !wager),
                subtitle: `$${this.chips[p.id] || 0} chips`,
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
    id: 'blackjack',
    title: 'Royale Blackjack',
    tagline: 'Casino 21 Table',
    players: '1–8 players',
    control: 'Simultaneous Bets + Actions',
    description: 'Place your chip wagers and Hit, Stand, or Double Down simultaneously against the TV House Dealer!',
    accent: '#10b981',
    icon: 'coins',
    css: C.HOWTO_CSS,
    create: (ctx) => new RoyaleBlackjackGame(ctx)
});

})(window);

