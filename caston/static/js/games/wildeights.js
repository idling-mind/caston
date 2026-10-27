/* ==========================================================================
   CastOn — Game: Wild Eights (Party UNO)
   - Shed all your cards by matching the Active Color or Number/Symbol on the TV!
   - Special cards: 8 / WILD (pick any color), SKIP, REVERSE, +2, and WILD +4.
   - Includes built-in How-To-Play instructions on both TV and phones.
   ========================================================================== */
(function (w) {
'use strict';

const CastOn = w.CastOn;
const C = CastOn.cards;
const T = CastOn.tools;

const TURN_TIME_SEC = 18;
const HOWTO_TIME_SEC = 12;

const INSTRUCTIONS = [
    'Match the top card on the TV by Color (Crimson, Royal, Amber, Emerald) or by Number/Symbol.',
    '8s, WILD, and WILD +4 can be played on anything — pick the new active color on your phone!',
    'Action cards: SKIP jumps the next player, REV flips direction, +2 and +4 force draws.',
    'If you have no playable card, tap "Draw Card" on your phone. First to 0 cards wins the round!'
];

const HOWTO_STEPS = [
    {
        title: 'Match Color or Rank',
        text: 'Look at your phone hand. Glowing cards match the TV pile\'s active color or number — tap one to play it!'
    },
    {
        title: 'Unleash Wilds & Actions',
        text: 'Play SKIP, REVERSE, or +2 to trip up rivals. Play an 8, WILD, or +4 to change the active color!'
    },
    {
        title: 'Empty Your Hand First',
        text: 'First player to shed all their cards wins the round and scores points for every card left in rivals\' hands!'
    }
];

class WildEightsGame extends CastOn.Game {
    constructor(ctx) {
        super(ctx);
        this.ctx = ctx;
        this.running = true;
        this.rafId = null;

        this.roster = C.buildRoster(ctx, 2);
        this.scores = {};
        this.roster.forEach(p => { this.scores[p.id] = 0; });

        this.round = 0;
        this.maxRounds = 2;
        this.phase = 'howto'; // 'howto' | 'playing' | 'round_over' | 'done'
        this.showHelpModal = false;

        this.deck = [];
        this.discard = [];
        this.hands = {};
        this.activeColor = 'RED';
        this.direction = 1; // 1 = clockwise, -1 = counter-clockwise
        this.turnIdx = 0;
        this.statusBanner = 'Get ready to shed your hand!';

        this.clock = HOWTO_TIME_SEC;
        this.clockTimer = null;
        this.aiTimer = null;
        this.roundTimer = null;
        this.animator = new C.CardAnimator();

        this.loop = this.loop.bind(this);
        this.rafId = requestAnimationFrame(this.loop);

        this.enterHowToPhase();
    }

    clearTimers() {
        if (this.clockTimer) { clearInterval(this.clockTimer); this.clockTimer = null; }
        if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
        if (this.roundTimer) { clearTimeout(this.roundTimer); this.roundTimer = null; }
    }

    onPlayersSync() {
        Object.values(this.ctx.players || {}).forEach(p => {
            if (this.scores[p.id] === undefined) {
                this.scores[p.id] = 0;
                this.roster.push(Object.assign({}, p));
                if (this.phase === 'playing') {
                    this.hands[p.id] = this.drawCards(5);
                }
            }
        });
        this.syncControllers();
    }

    /* ---------- How-To-Play Phase ---------------------------------------- */

    enterHowToPhase() {
        this.clearTimers();
        this.phase = 'howto';
        this.clock = null;
        this.syncControllers();
        this.updateOverlay();
    }

    /* ---------- Round Setup & Turn Flow ---------------------------------- */

    startNextRound() {
        this.clearTimers();
        this.round++;
        if (this.round > this.maxRounds) {
            this.finishGame();
            return;
        }

        this.phase = 'playing';
        this.showHelpModal = false;
        this.deck = C.createWildDeck();
        this.discard = [];
        this.hands = {};
        this.direction = 1;

        this.roster.forEach(p => {
            this.hands[p.id] = this.drawCards(7);
        });

        // Pull first non-wild card as starter discard
        let starterIdx = this.deck.findIndex(c => !c.isWild && !c.action);
        if (starterIdx < 0) starterIdx = 0;
        const starter = this.deck.splice(starterIdx, 1)[0];
        this.discard.push(starter);
        this.activeColor = starter.colorId || 'RED';

        this.turnIdx = (this.round - 1) % this.roster.length;
        this.statusBanner = `Round ${this.round}: Match ${this.getColorMeta().label} (${this.getColorMeta().symbol}) or ${starter.rank}!`;
        this.ctx.sound.fanfare();

        this.beginTurn();
    }

    drawCards(count) {
        const out = [];
        for (let i = 0; i < count; i++) {
            if (this.deck.length === 0) {
                if (this.discard.length > 1) {
                    const top = this.discard.pop();
                    this.deck = C.shuffle(this.discard);
                    this.discard = [top];
                } else {
                    this.deck = C.createWildDeck();
                }
            }
            out.push(this.deck.pop());
        }
        return out;
    }

    topCard() {
        return this.discard[this.discard.length - 1] || null;
    }

    getColorMeta(colorId) {
        return C.WILD_COLOR_MAP[colorId || this.activeColor] || C.WILD_COLORS[0];
    }

    canPlayCard(card) {
        if (!card) return false;
        if (card.isWild || card.colorId === 'WILD' || card.rank === '8') return true;
        const top = this.topCard();
        if (!top) return true;
        if (card.colorId === this.activeColor) return true;
        if (card.rank === top.rank) return true;
        return false;
    }

    currentTurnPlayer() {
        return this.roster[this.turnIdx] || this.roster[0];
    }

    beginTurn() {
        this.clearTimers();
        if (this.phase !== 'playing') return;

        const active = this.currentTurnPlayer();
        this.clock = TURN_TIME_SEC;
        this.syncControllers();
        this.updateOverlay();

        this.clockTimer = setInterval(() => {
            if (!this.running || this.phase !== 'playing') return;
            this.clock--;
            if (this.clock <= 0) {
                this.handleDrawAction(active.id, true);
            } else {
                this.updateOverlay();
            }
        }, 1000);

        if (active && active.__ai) {
            this.aiTimer = setTimeout(() => {
                this.runAiTurn(active.id);
            }, 1300);
        }
    }

    advanceTurn(steps) {
        const n = this.roster.length;
        const jump = steps || 1;
        this.turnIdx = (this.turnIdx + this.direction * jump + n * 10) % n;
        this.beginTurn();
    }

    runAiTurn(pid) {
        if (!this.running || this.phase !== 'playing') return;
        const hand = this.hands[pid] || [];
        const playable = hand.filter(c => this.canPlayCard(c));
        if (playable.length > 0) {
            // Prefer non-wilds first
            const nonWild = playable.find(c => !c.isWild);
            const chosen = nonWild || playable[0];
            // Pick most common color in hand if wild
            const counts = { RED: 0, BLUE: 0, YELLOW: 0, GREEN: 0 };
            hand.forEach(c => { if (counts[c.colorId] !== undefined) counts[c.colorId]++; });
            const bestColor = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 'RED';
            this.handlePlayCard(pid, chosen.id, bestColor);
        } else {
            this.handleDrawAction(pid, false);
        }
    }

    handlePlayCard(playerId, cardId, chosenSuit) {
        if (this.phase !== 'playing') return;
        const active = this.currentTurnPlayer();
        if (!active || active.id !== playerId) return;

        const hand = this.hands[playerId] || [];
        const idx = hand.findIndex(c => String(c.id) === String(cardId));
        if (idx < 0) return;

        const card = hand[idx];
        if (!this.canPlayCard(card)) {
            this.ctx.sound.fail();
            return;
        }

        // Remove from hand & animate to center discard
        hand.splice(idx, 1);
        this.discard.push(card);

        const view = this.ctx.view;
        const seats = C.computeSeats(view, this.roster.length);
        const seat = seats[this.turnIdx] || { x: view.w / 2, y: view.h - 80 };
        this.animator.fly({
            card: card,
            fromX: seat.x,
            fromY: seat.y,
            toX: view.w / 2 + 54,
            toY: view.h * 0.5,
            duration: 340
        });

        this.ctx.sound.pop();

        // Update active color
        if (card.isWild || card.colorId === 'WILD' || card.rank === '8') {
            this.activeColor = C.WILD_COLOR_MAP[chosenSuit] ? chosenSuit : 'RED';
        } else {
            this.activeColor = card.colorId;
        }

        const cMeta = this.getColorMeta(this.activeColor);

        // Check for round win
        if (hand.length === 0) {
            this.endRound(active);
            return;
        }

        const unoNotice = hand.length === 1 ? ` · 🔥 ${active.name} has 1 CARD LEFT!` : '';

        // Apply special card actions
        let stepCount = 1;
        if (card.action === 'SKIP') {
            const skipped = this.roster[(this.turnIdx + this.direction + this.roster.length) % this.roster.length];
            this.statusBanner = `⊘ ${active.name} skipped ${skipped ? skipped.name : 'next player'}!${unoNotice}`;
            stepCount = 2;
            this.ctx.sound.blip();
        } else if (card.action === 'REV') {
            if (this.roster.length === 2) {
                stepCount = 2;
                this.statusBanner = `⇄ ${active.name} played Reverse (acts as Skip in 2P)!${unoNotice}`;
            } else {
                this.direction *= -1;
                this.statusBanner = `⇄ ${active.name} reversed play direction!${unoNotice}`;
            }
            this.ctx.sound.blip();
        } else if (card.action === '+2') {
            const victimIdx = (this.turnIdx + this.direction + this.roster.length) % this.roster.length;
            const victim = this.roster[victimIdx];
            if (victim) {
                const drawn = this.drawCards(2);
                this.hands[victim.id].push(...drawn);
                this.statusBanner = `💥 ${active.name} hit ${victim.name} with +2 Cards!${unoNotice}`;
            }
            stepCount = 2;
            this.ctx.sound.fail();
        } else if (card.action === 'WILD4') {
            const victimIdx = (this.turnIdx + this.direction + this.roster.length) % this.roster.length;
            const victim = this.roster[victimIdx];
            if (victim) {
                const drawn = this.drawCards(4);
                this.hands[victim.id].push(...drawn);
                this.statusBanner = `💣 WILD +4! ${victim.name} draws 4 · Active color is ${cMeta.label}!${unoNotice}`;
            }
            stepCount = 2;
            this.ctx.sound.fail();
        } else if (card.isWild || card.rank === '8') {
            this.statusBanner = `★ ${active.name} played Wild ${card.rank} → Color is now ${cMeta.label} (${cMeta.symbol})!${unoNotice}`;
        } else {
            this.statusBanner = `${active.name} played ${cMeta.label} ${card.rank}${unoNotice}`;
        }

        this.advanceTurn(stepCount);
    }

    handleDrawAction(playerId, isTimeout) {
        if (this.phase !== 'playing') return;
        const active = this.currentTurnPlayer();
        if (!active || active.id !== playerId) return;

        const drawn = this.drawCards(1)[0];
        if (drawn) {
            this.hands[playerId].push(drawn);
            const view = this.ctx.view;
            const seats = C.computeSeats(view, this.roster.length);
            const seat = seats[this.turnIdx] || { x: view.w / 2, y: view.h - 80 };
            this.animator.fly({
                card: drawn,
                fromX: view.w / 2 - 54,
                fromY: view.h * 0.5,
                toX: seat.x,
                toY: seat.y,
                faceDown: true,
                duration: 340
            });
        }
        this.ctx.sound.blip();
        this.statusBanner = isTimeout
            ? `⏰ ${active.name} ran out of time and drew 1 card.`
            : `${active.name} drew a card from the deck.`;
        this.advanceTurn(1);
    }

    endRound(winner) {
        this.clearTimers();
        this.phase = 'round_over';

        // Calculate points from remaining cards in opponents' hands
        let bonus = 50;
        this.roster.forEach(p => {
            if (p.id === winner.id) return;
            (this.hands[p.id] || []).forEach(c => {
                bonus += (c.value || 10);
            });
        });
        this.scores[winner.id] = (this.scores[winner.id] || 0) + bonus;
        this.statusBanner = `🎉 ${winner.name} cleared their hand and wins +${bonus} pts!`;
        this.ctx.sound.fanfare();
        this.syncControllers();
        this.updateOverlay();

        this.roundTimer = setTimeout(() => {
            this.startNextRound();
        }, 4200);
    }

    finishGame() {
        this.clearTimers();
        this.phase = 'done';
        this.ended = true;
        const ranked = this.getRankedRoster();
        this.ctx.setOverlay(T.results({
            title: 'Wild Eights',
            kicker: `Final Standings (${this.maxRounds} Rounds)`,
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

    /* ---------- Controller Synchronization ------------------------------- */

    syncControllers() {
        if (this.phase === 'howto') {
            this.ctx.controller.setLayout('cards', {
                eyebrow: 'HOW TO PLAY',
                title: 'Wild Eights (Party UNO)',
                subtitle: 'Read the rules below or tap Start Game!',
                instructions: INSTRUCTIONS,
                openRules: true,
                hand: [],
                emptyText: 'Cards will be dealt as soon as the round starts!',
                actions: [
                    { id: 'start_game', label: '▶ Start Game Now', style: 'primary' }
                ]
            });
            return;
        }

        const active = this.currentTurnPlayer();
        const top = this.topCard();
        const cMeta = this.getColorMeta(this.activeColor);

        this.roster.forEach(p => {
            if (p.__bot || p.__demo) return;
            const isMyTurn = this.phase === 'playing' && active && active.id === p.id;
            const hand = (this.hands[p.id] || []).map(c => C.toPhoneCard(c, {
                playable: isMyTurn && this.canPlayCard(c)
            }));

            this.ctx.controller.setLayout('cards', {
                eyebrow: isMyTurn ? 'YOUR TURN!' : `WAITING FOR ${active ? active.name.toUpperCase() : 'PLAYER'}`,
                title: isMyTurn ? 'Tap a Glowing Card to Play' : `${active ? active.name : 'Player'}'s Turn`,
                subtitle: `Active Color: ${cMeta.label} (${cMeta.symbol}) · Top Card: ${top ? top.rank : '-'}`,
                instructions: INSTRUCTIONS,
                tableInfo: {
                    label: `Pile: ${top ? top.rank : '-'} · Direction: ${this.direction === 1 ? '↻ Clockwise' : '↺ Counter'}`,
                    badge: `${cMeta.symbol} ${cMeta.label}`
                },
                selectMode: 'single',
                hand: hand,
                actions: isMyTurn ? [
                    { id: 'draw', label: '🃏 Draw Card (+1)', sublabel: 'If you cannot play or want to save wilds', style: 'amber' }
                ] : []
            }, p.id);
        });
    }

    /* ---------- Input Handling ------------------------------------------- */

    onInput(playerId, data) {
        if (!this.running) return;

        if (this.phase === 'howto') {
            if ((data.action === 'btn' && data.state === 'down' && data.button === 'A') ||
                (data.action === 'card_action' && data.id === 'start_game')) {
                this.startNextRound();
            }
            return;
        }

        // Toggle mid-game How-to-Play overlay with Y button in demo/gamepad mode
        if (data.action === 'btn' && data.state === 'down' && data.button === 'Y') {
            this.showHelpModal = !this.showHelpModal;
            this.updateOverlay();
            return;
        }

        if (this.showHelpModal && data.action === 'btn' && data.state === 'down' && data.button === 'A') {
            this.showHelpModal = false;
            this.updateOverlay();
            return;
        }

        if (this.phase !== 'playing') return;

        if (data.action === 'card_play') {
            this.handlePlayCard(playerId, data.cardId, data.suit);
            return;
        }

        if (data.action === 'card_action' && data.id === 'draw') {
            this.handleDrawAction(playerId, false);
            return;
        }

        // Demo keyboard fallback: pressing A plays first playable card or draws
        if (data.action === 'btn' && data.state === 'down') {
            const active = this.currentTurnPlayer();
            if (!active) return;
            if (data.button === 'A') {
                this.runAiTurn(active.id);
            } else if (data.button === 'B') {
                this.handleDrawAction(active.id, false);
            }
        }
    }

    /* ---------- Overlay & Canvas Rendering ------------------------------- */

    updateOverlay() {
        if (this.phase === 'done') return;

        if (this.phase === 'howto') {
            this.ctx.setOverlay(C.renderHowToPlayModal({
                title: 'Wild Eights (Party UNO)',
                tagline: 'HOW TO PLAY · 2–8 PLAYERS',
                subtitle: 'Match the active color or symbol, drop action cards, and empty your hand first!',
                steps: HOWTO_STEPS,
                controls: 'On your phone, playable cards glow automatically. Tap a card to play it, or tap "Draw Card" if stuck.',
                scoring: 'Round winner scores +50 pts plus the value of all cards left in opponents\' hands (Wilds = 50, Actions = 20).',
                countdown: this.clock
            }));
            return;
        }

        const ranked = this.getRankedRoster();
        const cMeta = this.getColorMeta(this.activeColor);
        const modalHtml = this.showHelpModal ? C.renderHowToPlayModal({
            title: 'Wild Eights — Rules',
            steps: HOWTO_STEPS,
            controls: 'Tap glowing cards on your phone to play, or tap Draw Card.',
            scoring: 'First to 0 cards wins the round!',
            isMidGame: true
        }) : '';

        this.ctx.setOverlay(C.renderHudFrame({
            kicker: `WILD EIGHTS · ROUND ${this.round} OF ${this.maxRounds}`,
            title: this.statusBanner,
            statusPill: `${cMeta.symbol} Active: ${cMeta.label}`,
            scoreRail: T.scoreRail(ranked),
            clock: this.phase === 'playing' ? this.clock : null,
            quickSteps: [
                'Match Active Color or Rank on the center pile',
                '8s & Wilds change the color · +2 / SKIP / REV disrupt rivals',
                'Tap "Draw Card" on your phone if you have no match'
            ],
            footerNote: 'Press Y or tap "📖 How to Play" on your phone for full rules',
            modalHtml: modalHtml
        }));
    }

    loop() {
        if (!this.running) return;
        const { ctx: g, view } = this.ctx;
        const cMeta = this.getColorMeta(this.activeColor);

        C.drawTableBackdrop(g, view, {
            feltCenter: '#132a4a',
            feltEdge: '#091526',
            railColor: cMeta.bg,
            tableLabel: `Wild Eights · ${this.direction === 1 ? '↻ Clockwise' : '↺ Counter-Clockwise'}`
        });

        const cx = view.w / 2;
        const cy = view.h * 0.51;

        // Draw direction ring around center piles
        g.save();
        g.beginPath();
        g.arc(cx, cy, 118, 0, Math.PI * 2);
        g.lineWidth = 3;
        g.strokeStyle = cMeta.bg;
        g.setLineDash([12, 8]);
        g.stroke();
        g.setLineDash([]);
        g.restore();

        // Draw Deck Stack on Left, Top Discard Card on Right
        C.drawDeckStack(g, cx - 54, cy, 78, 110, this.deck.length, `Draw (${this.deck.length})`);

        const top = this.topCard();
        if (top) {
            C.drawCard(g, cx + 54, cy, 78, 110, top, {
                highlight: cMeta.bg,
                badge: cMeta.label
            });
        }

        // Draw Player Seats around the table
        const seats = C.computeSeats(view, this.roster.length);
        const active = this.currentTurnPlayer();
        this.roster.forEach((p, idx) => {
            const s = seats[idx];
            const handCount = (this.hands[p.id] || []).length;
            const isTurn = this.phase === 'playing' && active && active.id === p.id;
            C.drawPlayerSeat(g, s.x, s.y, p, {
                isActive: isTurn,
                subtitle: `${this.scores[p.id] || 0} pts`,
                cardCount: handCount,
                badge: handCount === 1 ? '🔥 UNO!' : (isTurn ? 'THINKING' : null),
                badgeBg: handCount === 1 ? '#e11d48' : p.color
            });
        });

        // Draw flying card animations
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
    id: 'wildeights',
    title: 'Wild Eights',
    tagline: 'Party Card Shedder',
    players: '1–8 players',
    control: 'Phone Card Hand',
    description: 'Match colors or numbers, drop +2s, Skips, and Wild 8s, and be the first to empty your hand!',
    accent: '#e11d48',
    icon: 'cards',
    css: C.HOWTO_CSS,
    create: (ctx) => new WildEightsGame(ctx)
});

})(window);

