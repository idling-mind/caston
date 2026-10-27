/* ==========================================================================
   CastOn — Game: Danger Row (6 Takes! / Bullhead Strategy)
   - Everyone simultaneously picks 1 numbered card (1–66) from their phone hand.
   - Cards resolve in ascending order onto 4 rows on the TV table.
   - Each card goes to the row with the closest lower number.
   - Land on the 6th slot of a row (or play lower than all rows) and you eat
     all the penalty skulls in that row!
   - Includes built-in How-To-Play instructions on both TV and phones.
   ========================================================================== */
(function (w) {
'use strict';

const CastOn = w.CastOn;
const C = CastOn.cards;
const T = CastOn.tools;

const PENALTY_PER_SKULL = 15;

const INSTRUCTIONS = [
    'Everyone simultaneously selects 1 card (numbered 1–66) from their phone hand each turn.',
    'Cards are placed in ascending order (lowest first) onto the row with the closest lower last card.',
    'DANGER SLOT #6: If your card is the 6th card in a row, you eat all 5 cards in that row as penalty skulls!',
    'TOO LOW: If your card is lower than all 4 rows, you eat the row with the fewest skulls!'
];

const HOWTO_STEPS = [
    {
        title: 'Pick 1 Card Simultaneously',
        text: 'Everyone picks a card from their phone at the same time. Cards are revealed and placed from lowest number to highest.'
    },
    {
        title: 'Closest Lower Row Rule',
        text: 'Your card automatically attaches to the row whose last card is lower than yours with the smallest gap.'
    },
    {
        title: 'Avoid the 6th Danger Slot!',
        text: 'Each row only holds 5 safe cards! Whoever places the 6th card eats the row\'s skulls (-15 pts per 💀).'
    }
];

class DangerRowGame extends CastOn.Game {
    constructor(ctx) {
        super(ctx);
        this.ctx = ctx;
        this.running = true;
        this.rafId = null;

        this.roster = C.buildRoster(ctx, 3);
        this.scores = {};
        this.skullsTaken = {};
        this.roster.forEach(p => {
            this.scores[p.id] = 660;
            this.skullsTaken[p.id] = 0;
        });

        this.turn = 0;
        this.maxTurns = 7;
        this.phase = 'howto'; // 'howto' | 'select' | 'resolve' | 'done'
        this.showHelpModal = false;

        this.deck = C.createDangerDeck(66);
        this.rows = [[], [], [], []];
        this.hands = {};
        this.picked = {}; // pid -> card
        this.resolutionLog = [];

        this.statusBanner = 'Avoid the 6th Danger Slot!';
        this.clock = 12;
        this.clockTimer = null;
        this.stepTimer = null;
        this.animator = new C.CardAnimator();

        this.dealMatch();

        this.loop = this.loop.bind(this);
        this.rafId = requestAnimationFrame(this.loop);

        this.enterHowToPhase();
    }

    clearTimers() {
        if (this.clockTimer) { clearInterval(this.clockTimer); this.clockTimer = null; }
        if (this.stepTimer) { clearTimeout(this.stepTimer); this.stepTimer = null; }
    }

    dealMatch() {
        this.deck = C.createDangerDeck(66);
        for (let r = 0; r < 4; r++) {
            this.rows[r] = [this.deck.pop()];
        }
        // Sort initial 4 rows ascending for visual clarity
        this.rows.sort((a, b) => a[0].value - b[0].value);

        this.roster.forEach(p => {
            const h = [];
            for (let i = 0; i < this.maxTurns; i++) {
                h.push(this.deck.pop());
            }
            h.sort((a, b) => a.value - b.value);
            this.hands[p.id] = h;
        });
    }

    onPlayersSync() {
        Object.values(this.ctx.players || {}).forEach(p => {
            if (this.scores[p.id] === undefined) {
                this.scores[p.id] = 660;
                this.skullsTaken[p.id] = 0;
                this.roster.push(Object.assign({}, p));
                this.hands[p.id] = [];
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

    startTurn() {
        this.clearTimers();
        this.turn++;
        if (this.turn > this.maxTurns) {
            this.finishGame();
            return;
        }

        this.phase = 'select';
        this.picked = {};
        this.resolutionLog = [];
        this.clock = 14;
        this.statusBanner = `Turn ${this.turn} of ${this.maxTurns}: Secretly pick 1 card on your phone!`;
        this.ctx.sound.blip();

        // AI picks smartly
        this.stepTimer = setTimeout(() => {
            this.roster.forEach(p => {
                if (!p.__ai || this.picked[p.id]) return;
                const hand = this.hands[p.id] || [];
                if (!hand.length) return;
                const pick = this.chooseAiCard(hand);
                this.lockCard(p.id, pick.id);
            });
        }, 1000);

        this.syncControllers();
        this.updateOverlay();

        this.clockTimer = setInterval(() => {
            if (!this.running || this.phase !== 'select') return;
            this.clock--;
            if (this.clock <= 0) {
                this.roster.forEach(p => {
                    if (!this.picked[p.id]) {
                        const h = this.hands[p.id] || [];
                        if (h.length) this.lockCard(p.id, h[0].id);
                    }
                });
                this.resolveTurn();
            } else {
                this.updateOverlay();
            }
        }, 1000);
    }

    chooseAiCard(hand) {
        // Prefer a card that fits onto a row with < 4 cards and small positive delta
        let bestCard = hand[0];
        let bestScore = -9999;
        hand.forEach(c => {
            let targetRow = -1;
            let minDiff = 999;
            this.rows.forEach((row, rIdx) => {
                const last = row[row.length - 1];
                const diff = c.value - last.value;
                if (diff > 0 && diff < minDiff) {
                    minDiff = diff;
                    targetRow = rIdx;
                }
            });
            let score = 0;
            if (targetRow === -1) {
                score = -200;
            } else {
                const len = this.rows[targetRow].length;
                if (len === 5) score = -150;
                else score = 100 - minDiff - len * 15;
            }
            if (score > bestScore) {
                bestScore = score;
                bestCard = c;
            }
        });
        return bestCard;
    }

    lockCard(playerId, cardId) {
        if (this.phase !== 'select') return;
        if (this.picked[playerId]) return;
        const hand = this.hands[playerId] || [];
        const idx = hand.findIndex(c => String(c.id) === String(cardId));
        if (idx < 0) return;

        const chosen = hand.splice(idx, 1)[0];
        this.picked[playerId] = chosen;
        this.ctx.sound.pop();

        this.syncControllers();
        this.updateOverlay();

        if (this.roster.every(p => !!this.picked[p.id] || !(this.hands[p.id] || []).length)) {
            this.clearTimers();
            this.stepTimer = setTimeout(() => this.resolveTurn(), 500);
        }
    }

    resolveTurn() {
        this.clearTimers();
        this.phase = 'resolve';

        // Sort all played cards in strictly ascending order
        const plays = this.roster
            .filter(p => !!this.picked[p.id])
            .map(p => ({ player: p, card: this.picked[p.id] }))
            .sort((a, b) => a.card.value - b.card.value);

        const events = [];

        plays.forEach(item => {
            const { player, card } = item;
            // Find row whose last card is < card.value and closest
            let bestRow = -1;
            let bestDiff = 9999;
            for (let r = 0; r < 4; r++) {
                const row = this.rows[r];
                const last = row[row.length - 1];
                const diff = card.value - last.value;
                if (diff > 0 && diff < bestDiff) {
                    bestDiff = diff;
                    bestRow = r;
                }
            }

            if (bestRow === -1) {
                // Card is smaller than all 4 rows! Eat the row with the fewest skulls
                let minRow = 0;
                let minBulls = 9999;
                for (let r = 0; r < 4; r++) {
                    const bulls = this.rows[r].reduce((acc, c) => acc + c.bulls, 0);
                    if (bulls < minBulls) {
                        minBulls = bulls;
                        minRow = r;
                    }
                }
                this.applyPenalty(player, minBulls);
                this.rows[minRow] = [card];
                events.push(`💀 ${player.name} played #${card.rank} (too low!) & ate Row ${minRow + 1} (${minBulls}💀)`);
            } else if (this.rows[bestRow].length >= 5) {
                // 6th card! Eat the 5 cards in bestRow
                const bulls = this.rows[bestRow].reduce((acc, c) => acc + c.bulls, 0);
                this.applyPenalty(player, bulls);
                this.rows[bestRow] = [card];
                events.push(`💥 6TH CARD! ${player.name} played #${card.rank} & ate Row ${bestRow + 1} (${bulls}💀)`);
            } else {
                this.rows[bestRow].push(card);
                events.push(`✓ ${player.name} placed #${card.rank} on Row ${bestRow + 1}`);
            }
        });

        this.resolutionLog = events;
        this.statusBanner = events.find(e => e.startsWith('💥') || e.startsWith('💀')) || events[events.length - 1] || 'Cards placed!';
        if (events.some(e => e.startsWith('💥') || e.startsWith('💀'))) {
            this.ctx.sound.fail();
        } else {
            this.ctx.sound.success();
        }

        this.syncControllers();
        this.updateOverlay();

        this.stepTimer = setTimeout(() => {
            this.startTurn();
        }, 4200);
    }

    applyPenalty(player, skulls) {
        this.skullsTaken[player.id] = (this.skullsTaken[player.id] || 0) + skulls;
        this.scores[player.id] = Math.max(0, (this.scores[player.id] || 660) - skulls * PENALTY_PER_SKULL);
    }

    finishGame() {
        this.clearTimers();
        this.phase = 'done';
        this.ended = true;
        const ranked = this.getRankedRoster();
        this.ctx.setOverlay(T.results({
            title: 'Danger Row',
            kicker: 'Final Survival Standings',
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
                title: 'Danger Row (6 Takes!)',
                subtitle: 'Read the rules below or tap Start Game!',
                instructions: INSTRUCTIONS,
                openRules: true,
                hand: [],
                emptyText: 'Your numbered cards (1–66) will appear here!',
                actions: [
                    { id: 'start_game', label: '▶ Start Game Now', style: 'primary' }
                ]
            });
            return;
        }

        const rowTips = this.rows.map((r, i) => `R${i + 1}: #${r[r.length - 1].rank} (${r.length}/5)`).join(' · ');

        this.roster.forEach(p => {
            if (p.__bot || p.__demo) return;
            const myPicked = this.picked[p.id];
            const myHand = (this.hands[p.id] || []).map(c => C.toPhoneCard(c, {
                playable: this.phase === 'select' && !myPicked
            }));

            this.ctx.controller.setLayout('cards', {
                eyebrow: myPicked
                    ? `✓ LOCKED IN #${myPicked.rank}`
                    : (this.phase === 'select' ? `TURN ${this.turn}/${this.maxTurns} · PICK 1 CARD` : 'RESOLVING ROWS...'),
                title: myPicked ? `You Picked #${myPicked.rank} (${myPicked.bulls}💀)` : 'Tap 1 Card to Play Simultaneously',
                subtitle: rowTips,
                instructions: INSTRUCTIONS,
                selectMode: (this.phase === 'select' && !myPicked) ? 'single' : 'none',
                tableInfo: {
                    label: `Score: ${this.scores[p.id]} pts`,
                    badge: `${this.skullsTaken[p.id] || 0} 💀 Eaten`
                },
                hand: myHand,
                actions: []
            }, p.id);
        });
    }

    onInput(playerId, data) {
        if (!this.running) return;

        if (this.phase === 'howto') {
            if ((data.action === 'btn' && data.state === 'down' && data.button === 'A') ||
                (data.action === 'card_action' && data.id === 'start_game')) {
                this.startTurn();
            }
            return;
        }

        if (data.action === 'btn' && data.state === 'down' && data.button === 'Y') {
            this.showHelpModal = !this.showHelpModal;
            this.updateOverlay();
            return;
        }

        if (data.action === 'card_play' && this.phase === 'select') {
            this.lockCard(playerId, data.cardId);
            return;
        }

        // Demo keyboard support
        if (data.action === 'btn' && data.state === 'down' && this.phase === 'select' && data.button === 'A') {
            const h = this.hands[playerId] || [];
            if (h.length) {
                const pick = this.chooseAiCard(h);
                this.lockCard(playerId, pick.id);
            }
        }
    }

    updateOverlay() {
        if (this.phase === 'done') return;

        if (this.phase === 'howto') {
            this.ctx.setOverlay(C.renderHowToPlayModal({
                title: 'Danger Row (6 Takes! Strategy)',
                tagline: 'HOW TO PLAY · SIMULTANEOUS MIND GAME',
                subtitle: 'Play numbered cards onto 4 ascending rows — but never be the player who drops the 6th card!',
                steps: HOWTO_STEPS,
                controls: 'Everyone simultaneously taps 1 card from their phone hand. Lowest card resolves first.',
                scoring: 'Everyone starts with 660 pts. Every penalty skull (💀) you eat subtracts 15 pts!',
                countdown: this.clock
            }));
            return;
        }

        const ranked = this.getRankedRoster();
        const modalHtml = this.showHelpModal ? C.renderHowToPlayModal({
            title: 'Danger Row — Rules',
            steps: HOWTO_STEPS,
            isMidGame: true
        }) : '';

        this.ctx.setOverlay(C.renderHudFrame({
            kicker: `DANGER ROW · TURN ${this.turn} OF ${this.maxTurns}`,
            title: this.statusBanner,
            statusPill: 'Slot #6 = Eat Row!',
            scoreRail: T.scoreRail(ranked),
            clock: this.phase === 'select' ? this.clock : null,
            quickSteps: [
                'Everyone secretly picks 1 card on their phone at the same time',
                'Cards place in ascending order onto the closest lower row',
                'Avoid Slot #6 (and playing lower than all 4 rows)!'
            ],
            footerNote: 'Cards ending in 5 have 2💀, 0 have 3💀, doubles (11, 22…) have 5💀!',
            modalHtml
        }));
    }

    loop() {
        if (!this.running) return;
        const { ctx: g, view } = this.ctx;

        C.drawTableBackdrop(g, view, {
            feltCenter: '#2b1321',
            feltEdge: '#12070d',
            railColor: '#f43f5e',
            tableLabel: 'Danger Row · 5 Safe Slots Per Row · 6th Slot Eats the Row!'
        });

        // Draw the 4 Rows in the center of the table
        const startX = view.w / 2 - 225;
        const startY = view.h * 0.25;
        const rowGapY = 92;
        const colGapX = 82;

        for (let r = 0; r < 4; r++) {
            const y = startY + r * rowGapY;
            const row = this.rows[r] || [];

            // Row label
            g.save();
            g.font = '800 12px "Space Grotesk", sans-serif';
            g.fillStyle = 'rgba(255, 255, 255, 0.65)';
            g.textAlign = 'right';
            g.textBaseline = 'middle';
            const rowBulls = row.reduce((acc, c) => acc + c.bulls, 0);
            g.fillText(`ROW ${r + 1} (${rowBulls}💀)`, startX - 46, y);
            g.restore();

            for (let cIdx = 0; cIdx < 6; cIdx++) {
                const x = startX + cIdx * colGapX;
                const card = row[cIdx];
                if (card) {
                    C.drawCard(g, x, y, 64, 84, card);
                } else {
                    const isDanger = cIdx === 5;
                    g.save();
                    T.roundRect(g, x - 32, y - 42, 64, 84, 8);
                    g.fillStyle = isDanger ? 'rgba(244, 63, 94, 0.16)' : 'rgba(255, 255, 255, 0.03)';
                    g.fill();
                    g.lineWidth = isDanger ? 2 : 1.2;
                    g.strokeStyle = isDanger ? '#f43f5e' : 'rgba(255, 255, 255, 0.14)';
                    g.setLineDash(isDanger ? [] : [4, 4]);
                    g.stroke();

                    g.font = '800 10px "Space Grotesk", sans-serif';
                    g.fillStyle = isDanger ? '#fda4af' : 'rgba(255, 255, 255, 0.25)';
                    g.textAlign = 'center';
                    g.textBaseline = 'middle';
                    g.fillText(isDanger ? '💥 #6' : `#${cIdx + 1}`, x, y);
                    g.restore();
                }
            }
        }

        // Draw Player Seats along Left & Right flanks so center rows stay clear
        this.roster.forEach((p, idx) => {
            const isLeft = idx % 2 === 0;
            const rowSlot = Math.floor(idx / 2);
            const sx = isLeft ? 115 : view.w - 115;
            const sy = view.h * 0.26 + rowSlot * 115;
            const hasPicked = !!this.picked[p.id];

            C.drawPlayerSeat(g, sx, sy, p, {
                isActive: this.phase === 'select' && !hasPicked,
                subtitle: `${this.scores[p.id]} pts (${this.skullsTaken[p.id] || 0}💀)`,
                badge: this.phase === 'resolve' && hasPicked
                    ? `PLAYED #${this.picked[p.id].rank}`
                    : (hasPicked ? '✓ LOCKED' : 'PICKING...'),
                badgeBg: hasPicked ? '#10b981' : '#f43f5e'
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
    id: 'dangerrow',
    title: 'Danger Row',
    tagline: 'Simultaneous Card Strategy',
    players: '1–8 players',
    control: 'Simultaneous Card Pick',
    description: 'Secretly pick numbered cards at the same time — cards place in ascending order, and the 6th card in a row eats the skulls!',
    accent: '#fb7185',
    icon: 'alert-triangle',
    css: C.HOWTO_CSS,
    create: (ctx) => new DangerRowGame(ctx)
});

})(window);

