/* ==========================================================================
   CastOn — Game: Texas Hold'em (Couch Poker)
   - 2 private hole cards on your phone + 5 shared community cards on the TV!
   - Live hand-strength helper on your phone tells you your best 5-card hand.
   - Check, Call, Raise, or Fold across Pre-Flop, Flop, Turn, and River!
   - Includes built-in How-To-Play instructions on both TV and phones.
   ========================================================================== */
(function (w) {
'use strict';

const CastOn = w.CastOn;
const C = CastOn.cards;
const T = CastOn.tools;

const STREETS = ['Pre-Flop', 'The Flop', 'The Turn', 'The River'];

const INSTRUCTIONS = [
    'You get 2 private Hole Cards on your phone. The TV deals up to 5 shared Community Cards.',
    'Your phone automatically calculates and displays your best 5-card Poker hand!',
    'On your turn, tap CHECK/CALL to stay in, RAISE (+50 / +150) to build the pot, or FOLD.',
    'Hand Ranks (High→Low): Royal Flush, Straight Flush, 4-of-a-Kind, Full House, Flush, Straight, 3-of-a-Kind, Two Pair, Pair, High Card.'
];

const HOWTO_STEPS = [
    {
        title: '2 Private Hole Cards',
        text: 'Check your phone for your 2 secret cards (use "🙈 Hide Cards" for couch privacy). Your phone shows your live hand strength!'
    },
    {
        title: 'Flop, Turn & River',
        text: 'Bet chips across 4 streets as 5 community cards are revealed on the TV. Bluff with big raises or slow-play a monster hand!'
    },
    {
        title: 'Best 5-Card Hand Wins',
        text: 'Combine your 2 hole cards with the 5 TV community cards. The strongest 5-card Poker hand at Showdown scoops the pot!'
    }
];

class TexasHoldemGame extends CastOn.Game {
    constructor(ctx) {
        super(ctx);
        this.ctx = ctx;
        this.running = true;
        this.rafId = null;

        this.roster = C.buildRoster(ctx, 2);
        this.chips = {};
        this.roster.forEach(p => { this.chips[p.id] = 1000; });

        this.handNum = 0;
        this.maxHands = 4;
        this.phase = 'howto'; // 'howto' | 'betting' | 'showdown' | 'done'
        this.showHelpModal = false;

        this.deck = [];
        this.community = [];
        this.holeCards = {};
        this.folded = {};
        this.streetBets = {};
        this.acted = {};
        this.currentBet = 0;
        this.pot = 0;
        this.streetIdx = 0; // 0=Pre-Flop, 1=Flop, 2=Turn, 3=River
        this.turnIdx = 0;
        this.lastActionText = {};
        this.winnersInfo = null;

        this.statusBanner = 'Welcome to Couch Texas Hold\'em!';
        this.clock = 12;
        this.clockTimer = null;
        this.aiTimer = null;
        this.animator = new C.CardAnimator();

        this.loop = this.loop.bind(this);
        this.rafId = requestAnimationFrame(this.loop);

        this.enterHowToPhase();
    }

    clearTimers() {
        if (this.clockTimer) { clearInterval(this.clockTimer); this.clockTimer = null; }
        if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
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

    enterHowToPhase() {
        this.clearTimers();
        this.phase = 'howto';
        this.clock = null;
        this.syncControllers();
        this.updateOverlay();
    }

    startNewHand() {
        this.clearTimers();
        this.handNum++;
        if (this.handNum > this.maxHands) {
            this.finishGame();
            return;
        }

        this.phase = 'betting';
        this.deck = C.createStandardDeck({ decks: 1 });
        this.community = [];
        this.holeCards = {};
        this.folded = {};
        this.streetBets = {};
        this.acted = {};
        this.lastActionText = {};
        this.winnersInfo = null;
        this.pot = 0;
        this.streetIdx = 0;
        this.currentBet = 0;

        const ante = 25;
        this.roster.forEach(p => {
            if ((this.chips[p.id] || 0) < 100) {
                this.chips[p.id] = 400; // Rebuy
            }
            this.chips[p.id] -= ante;
            this.pot += ante;
            this.holeCards[p.id] = [this.deck.pop(), this.deck.pop()];
            this.folded[p.id] = false;
            this.streetBets[p.id] = 0;
            this.acted[p.id] = false;
            this.lastActionText[p.id] = 'ANTE $25';
        });

        this.turnIdx = (this.handNum - 1) % this.roster.length;
        this.ctx.sound.fanfare();
        this.statusBanner = `Hand ${this.handNum}/${this.maxHands} · Pre-Flop ($${this.pot} Pot)`;
        this.promptNextPlayer();
    }

    activePlayers() {
        return this.roster.filter(p => !this.folded[p.id]);
    }

    promptNextPlayer() {
        this.clearTimers();
        if (this.phase !== 'betting') return;

        const alive = this.activePlayers();
        if (alive.length <= 1) {
            this.resolveShowdown();
            return;
        }

        // Check if everyone alive has acted and matched currentBet (or is all-in)
        const allSettled = alive.every(p =>
            this.acted[p.id] && ((this.streetBets[p.id] || 0) >= this.currentBet || (this.chips[p.id] || 0) === 0)
        );
        if (allSettled) {
            this.advanceStreet();
            return;
        }

        // Find next player who needs to act
        let guard = 0;
        while (guard++ < this.roster.length * 2) {
            const candidate = this.roster[this.turnIdx % this.roster.length];
            const needsAction = !this.folded[candidate.id] &&
                (this.chips[candidate.id] || 0) > 0 &&
                (!this.acted[candidate.id] || (this.streetBets[candidate.id] || 0) < this.currentBet);
            if (needsAction) break;
            this.turnIdx = (this.turnIdx + 1) % this.roster.length;
        }

        const current = this.roster[this.turnIdx % this.roster.length];
        if (!current || this.folded[current.id] || (this.chips[current.id] || 0) === 0) {
            this.advanceStreet();
            return;
        }

        const toCall = Math.max(0, this.currentBet - (this.streetBets[current.id] || 0));
        this.statusBanner = `${STREETS[this.streetIdx]}: ${current.name}'s turn (${toCall > 0 ? 'Call $' + toCall : 'Check or Bet'})`;
        this.clock = 15;
        this.syncControllers();
        this.updateOverlay();

        this.clockTimer = setInterval(() => {
            if (!this.running || this.phase !== 'betting') return;
            this.clock--;
            if (this.clock <= 0) {
                this.handleBetAction(current.id, toCall > 0 ? 'call' : 'check');
            } else {
                this.updateOverlay();
            }
        }, 1000);

        if (current.__ai) {
            this.aiTimer = setTimeout(() => {
                this.runAiDecision(current.id);
            }, 1200);
        }
    }

    runAiDecision(pid) {
        if (!this.running || this.phase !== 'betting') return;
        const toCall = Math.max(0, this.currentBet - (this.streetBets[pid] || 0));
        const ev = C.evaluatePokerHand((this.holeCards[pid] || []).concat(this.community));

        if (toCall === 0) {
            if (ev.category >= 1 && Math.random() < 0.5) {
                this.handleBetAction(pid, 'raise50');
            } else {
                this.handleBetAction(pid, 'check');
            }
        } else {
            if (toCall > 150 && ev.category === 0 && Math.random() < 0.55) {
                this.handleBetAction(pid, 'fold');
            } else if (ev.category >= 2 && Math.random() < 0.45) {
                this.handleBetAction(pid, 'raise50');
            } else {
                this.handleBetAction(pid, 'call');
            }
        }
    }

    handleBetAction(playerId, actionId) {
        if (this.phase !== 'betting') return;
        const current = this.roster[this.turnIdx % this.roster.length];
        if (!current || current.id !== playerId) return;

        const bank = this.chips[playerId] || 0;
        const myBet = this.streetBets[playerId] || 0;
        const toCall = Math.max(0, this.currentBet - myBet);

        if (actionId === 'fold') {
            this.folded[playerId] = true;
            this.acted[playerId] = true;
            this.lastActionText[playerId] = 'FOLDED';
            this.ctx.sound.fail();
        } else if (actionId === 'check' || actionId === 'call') {
            const paid = Math.min(bank, toCall);
            this.chips[playerId] -= paid;
            this.streetBets[playerId] = myBet + paid;
            this.pot += paid;
            this.acted[playerId] = true;
            this.lastActionText[playerId] = paid > 0 ? `CALL $${paid}` : 'CHECK';
            this.ctx.sound.pop();
        } else if (actionId === 'raise50' || actionId === 'raise150') {
            const raiseAmt = actionId === 'raise150' ? 150 : 50;
            const totalNeeded = toCall + raiseAmt;
            const paid = Math.min(bank, totalNeeded);
            this.chips[playerId] -= paid;
            this.streetBets[playerId] = myBet + paid;
            this.pot += paid;
            if (this.streetBets[playerId] > this.currentBet) {
                this.currentBet = this.streetBets[playerId];
            }
            this.acted[playerId] = true;
            this.lastActionText[playerId] = `RAISE $${paid}`;
            this.ctx.sound.blip();
        }

        this.turnIdx = (this.turnIdx + 1) % this.roster.length;
        this.promptNextPlayer();
    }

    advanceStreet() {
        this.clearTimers();
        this.streetIdx++;
        if (this.streetIdx > 3) {
            this.resolveShowdown();
            return;
        }

        // Reset street bets
        this.currentBet = 0;
        this.roster.forEach(p => {
            this.streetBets[p.id] = 0;
            this.acted[p.id] = false;
            if (!this.folded[p.id]) this.lastActionText[p.id] = '';
        });

        const view = this.ctx.view;
        if (this.streetIdx === 1) {
            // Deal Flop (3 cards)
            for (let i = 0; i < 3; i++) {
                const c = this.deck.pop();
                this.community.push(c);
                this.animator.fly({ card: c, fromX: view.w / 2 - 220, fromY: view.h * 0.48, toX: view.w / 2 + (i - 1) * 76, toY: view.h * 0.48 });
            }
        } else {
            // Deal Turn or River (1 card)
            const c = this.deck.pop();
            this.community.push(c);
            this.animator.fly({ card: c, fromX: view.w / 2 - 220, fromY: view.h * 0.48, toX: view.w / 2 + (this.community.length - 3) * 76, toY: view.h * 0.48 });
        }

        this.ctx.sound.pop();
        this.turnIdx = (this.handNum - 1) % this.roster.length;
        this.promptNextPlayer();
    }

    resolveShowdown() {
        this.clearTimers();
        this.phase = 'showdown';

        // Ensure all 5 community cards are dealt if more than 1 player is alive
        const alive = this.activePlayers();
        if (alive.length > 1) {
            while (this.community.length < 5) {
                this.community.push(this.deck.pop());
            }
        }

        let bestScore = -1;
        let winners = [];
        const evals = {};

        alive.forEach(p => {
            const ev = C.evaluatePokerHand((this.holeCards[p.id] || []).concat(this.community));
            evals[p.id] = ev;
            this.lastActionText[p.id] = ev.name;
            if (ev.score > bestScore) {
                bestScore = ev.score;
                winners = [p];
            } else if (ev.score === bestScore) {
                winners.push(p);
            }
        });

        if (!winners.length && this.roster.length) {
            winners = [this.roster[0]];
        }

        const share = Math.floor(this.pot / winners.length);
        winners.forEach(w => {
            this.chips[w.id] = (this.chips[w.id] || 0) + share;
        });

        const winNames = winners.map(w => w.name).join(' & ');
        const winHandName = (alive.length === 1)
            ? 'Everyone else folded'
            : (evals[winners[0].id] ? evals[winners[0].id].name : 'Best Hand');

        this.winnersInfo = {
            winnerIds: new Set(winners.map(w => w.id)),
            bestIds: new Set(evals[winners[0].id] ? evals[winners[0].id].bestIds : []),
            evals
        };

        this.statusBanner = `🏆 ${winNames} wins $${this.pot} Pot (${winHandName})!`;
        this.ctx.sound.fanfare();
        this.syncControllers();
        this.updateOverlay();

        this.aiTimer = setTimeout(() => {
            this.startNewHand();
        }, 5000);
    }

    finishGame() {
        this.clearTimers();
        this.phase = 'done';
        this.ended = true;
        const ranked = this.getRankedRoster();
        this.ctx.setOverlay(T.results({
            title: 'Texas Hold\'em',
            kicker: 'Final Poker Chip Standings',
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
                title: 'Texas Hold\'em Poker',
                subtitle: 'Read the rules below or tap Start Game!',
                instructions: INSTRUCTIONS,
                openRules: true,
                hand: [],
                emptyText: 'Your 2 secret hole cards will appear here each hand!',
                actions: [
                    { id: 'start_game', label: '▶ Deal First Hand', style: 'primary' }
                ]
            });
            return;
        }

        const current = this.roster[this.turnIdx % this.roster.length];

        this.roster.forEach(p => {
            if (p.__bot || p.__demo) return;
            const hole = (this.holeCards[p.id] || []).map(c => C.toPhoneCard(c, { playable: false }));
            const ev = C.evaluatePokerHand((this.holeCards[p.id] || []).concat(this.community));
            const isMyTurn = this.phase === 'betting' && current && current.id === p.id && !this.folded[p.id];
            const bank = this.chips[p.id] || 0;
            const toCall = Math.max(0, this.currentBet - (this.streetBets[p.id] || 0));

            this.ctx.controller.setLayout('cards', {
                eyebrow: this.folded[p.id]
                    ? 'YOU FOLDED THIS HAND'
                    : (isMyTurn ? `YOUR TURN · ${STREETS[this.streetIdx].toUpperCase()}` : `${STREETS[Math.min(3, this.streetIdx)].toUpperCase()}`),
                title: `Best Hand: ${ev.name}`,
                subtitle: `Pot: $${this.pot} · Your Chips: $${bank}`,
                instructions: INSTRUCTIONS,
                secretHand: true,
                selectMode: 'none',
                tableInfo: {
                    label: `Pot: $${this.pot} · To Call: $${toCall}`,
                    badge: `Chips: $${bank}`
                },
                hand: hole,
                actions: isMyTurn ? [
                    {
                        id: toCall > 0 ? 'call' : 'check',
                        label: toCall > 0 ? `✓ Call $${Math.min(bank, toCall)}` : '✓ Check ($0)',
                        sublabel: 'Stay in hand',
                        style: 'emerald'
                    },
                    {
                        id: 'raise50',
                        label: '⬆️ Raise +$50',
                        sublabel: `Total $${toCall + 50}`,
                        style: 'primary',
                        disabled: bank <= toCall
                    },
                    {
                        id: 'raise150',
                        label: '🔥 Raise +$150',
                        sublabel: 'Big pressure',
                        style: 'amber',
                        disabled: bank < toCall + 100
                    },
                    {
                        id: 'fold',
                        label: '🏳️ Fold',
                        sublabel: 'Forfeit pot',
                        style: 'danger'
                    }
                ] : []
            }, p.id);
        });
    }

    onInput(playerId, data) {
        if (!this.running) return;

        if (this.phase === 'howto') {
            if ((data.action === 'btn' && data.state === 'down' && data.button === 'A') ||
                (data.action === 'card_action' && data.id === 'start_game')) {
                this.startNewHand();
            }
            return;
        }

        if (data.action === 'btn' && data.state === 'down' && data.button === 'Y') {
            this.showHelpModal = !this.showHelpModal;
            this.updateOverlay();
            return;
        }

        if (data.action === 'card_action') {
            this.handleBetAction(playerId, data.id);
            return;
        }

        // Demo keyboard controls
        if (data.action === 'btn' && data.state === 'down' && this.phase === 'betting') {
            const current = this.roster[this.turnIdx % this.roster.length];
            if (!current) return;
            if (data.button === 'A') this.handleBetAction(current.id, 'call');
            else if (data.button === 'UP') this.handleBetAction(current.id, 'raise50');
            else if (data.button === 'B') this.handleBetAction(current.id, 'fold');
        }
    }

    updateOverlay() {
        if (this.phase === 'done') return;

        if (this.phase === 'howto') {
            this.ctx.setOverlay(C.renderHowToPlayModal({
                title: 'Texas Hold\'em (Couch Poker)',
                tagline: 'HOW TO PLAY · NO-LIMIT PARTY POKER',
                subtitle: '2 secret hole cards on your phone, 5 shared community cards on the TV!',
                steps: HOWTO_STEPS,
                controls: 'Use Check/Call, Raise +$50, Raise +$150, or Fold on your phone. Tap "🙈 Hide Cards" for privacy.',
                scoring: 'Everyone starts with $1,000 in chips across 4 hands. Richest player after Hand 4 wins!',
                countdown: this.clock
            }));
            return;
        }

        const ranked = this.getRankedRoster();
        const modalHtml = this.showHelpModal ? C.renderHowToPlayModal({
            title: 'Texas Hold\'em — Rules & Hand Ranks',
            steps: HOWTO_STEPS,
            isMidGame: true
        }) : '';

        this.ctx.setOverlay(C.renderHudFrame({
            kicker: `TEXAS HOLD'EM · HAND ${this.handNum} OF ${this.maxHands}`,
            title: this.statusBanner,
            statusPill: `💰 Pot: $${this.pot}`,
            scoreRail: T.scoreRail(ranked),
            clock: this.phase === 'betting' ? this.clock : null,
            quickSteps: [
                'Combine your 2 Phone Hole Cards with the 5 TV Community Cards',
                'Check/Call to stay in, Raise to build the pot, or Fold',
                'Your phone automatically shows your live best 5-card hand!'
            ],
            footerNote: 'Tap "🙈 Hide Cards" on your phone to keep your hole cards secret',
            modalHtml
        }));
    }

    loop() {
        if (!this.running) return;
        const { ctx: g, view } = this.ctx;

        C.drawTableBackdrop(g, view, {
            feltCenter: '#0d3b2e',
            feltEdge: '#061a14',
            railColor: '#f59e0b',
            tableLabel: `Texas Hold'em · Pot: $${this.pot} · ${STREETS[Math.min(3, this.streetIdx)]}`
        });

        const cx = view.w / 2;
        const cy = view.h * 0.48;

        // Draw 5 Community Card Slots in Center
        const slotSpacing = 76;
        for (let i = 0; i < 5; i++) {
            const x = cx + (i - 2) * slotSpacing;
            const c = this.community[i];
            if (c) {
                const isBest = this.phase === 'showdown' && this.winnersInfo && this.winnersInfo.bestIds.has(c.id);
                C.drawCard(g, x, cy, 68, 96, c, {
                    highlight: isBest ? '#f59e0b' : null
                });
            } else {
                // Empty community slot outline
                g.save();
                T.roundRect(g, x - 34, cy - 48, 68, 96, 9);
                g.strokeStyle = 'rgba(255, 255, 255, 0.16)';
                g.lineWidth = 1.5;
                g.setLineDash([5, 5]);
                g.stroke();
                g.restore();
            }
        }

        // Draw Player Seats & Hole Cards (face-up at Showdown!)
        const seats = C.computeSeats(view, this.roster.length);
        const current = this.roster[this.turnIdx % this.roster.length];

        this.roster.forEach((p, idx) => {
            const s = seats[idx];
            const isTurn = this.phase === 'betting' && current && current.id === p.id && !this.folded[p.id];
            const hole = this.holeCards[p.id] || [];
            const isWinner = this.phase === 'showdown' && this.winnersInfo && this.winnersInfo.winnerIds.has(p.id);

            if (this.phase === 'showdown' && !this.folded[p.id] && hole.length === 2) {
                hole.forEach((c, ci) => {
                    C.drawCard(g, s.x + (ci - 0.5) * 44, s.y - 68, 52, 74, c, {
                        highlight: isWinner ? '#f59e0b' : null
                    });
                });
            }

            C.drawPlayerSeat(g, s.x, s.y, p, {
                isActive: isTurn || isWinner,
                subtitle: `$${this.chips[p.id] || 0} chips`,
                cardCount: this.folded[p.id] ? 0 : hole.length,
                badge: this.lastActionText[p.id] || null,
                badgeBg: isWinner ? '#f59e0b' : (this.folded[p.id] ? '#64748b' : '#10b981')
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
    id: 'holdem',
    title: 'Texas Hold\'em',
    tagline: 'Couch Poker Night',
    players: '1–8 players',
    control: 'Secret Hole Cards + Bets',
    description: 'Peek at your 2 secret hole cards on your phone, bet the Flop, Turn, and River, and win the pot!',
    accent: '#f59e0b',
    icon: 'spade',
    css: C.HOWTO_CSS,
    create: (ctx) => new TexasHoldemGame(ctx)
});

})(window);

