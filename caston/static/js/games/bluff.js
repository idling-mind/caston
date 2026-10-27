/* ==========================================================================
   CastOn — Game: Royal Bluff (Cheat / I Doubt It)
   - Select 1–3 cards on your phone to play face-down, claiming they match the
     required Target Rank (10s → Jacks → Queens → Kings → Aces).
   - For 5 seconds, every other player gets a giant "🚨 CALL BLUFF!" button!
   - Get caught lying and you eat the whole pot; catch a liar for +150 pts!
   - Includes built-in How-To-Play instructions on both TV and phones.
   ========================================================================== */
(function (w) {
'use strict';

const CastOn = w.CastOn;
const C = CastOn.cards;
const T = CastOn.tools;

const ROYAL_RANKS = ['10', 'J', 'Q', 'K', 'A'];
const RANK_NAMES = { '10': '10s', 'J': 'Jacks', 'Q': 'Queens', 'K': 'Kings', 'A': 'Aces' };

const INSTRUCTIONS = [
    'On your turn, you MUST claim to play the required Target Rank (cycling 10 → J → Q → K → A).',
    'Select 1 to 3 cards on your phone (truthfully OR bluffing!) and tap "Play Claimed Cards".',
    'For 5 seconds, everyone else can tap "🚨 CALL BLUFF!" on their phone to flip your cards!',
    'If you lied, you pick up the whole center pot! If you told the truth, the challenger eats the pot!'
];

const HOWTO_STEPS = [
    {
        title: 'Claim the Target Rank',
        text: 'Select 1–3 cards from your phone hand to play face-down. You can play matching cards honestly or lie with a poker face!'
    },
    {
        title: '5-Second Bluff Window',
        text: 'After every play, rivals have 5 seconds to hit "🚨 CALL BLUFF!" on their phones if they smell a lie.'
    },
    {
        title: 'Shed Your Hand & Catch Liars',
        text: 'Whoever loses a Bluff challenge picks up the entire center pot! Empty your hand first (+300 pts) or catch liars (+150 pts).'
    }
];

function createRoyalShoe(playerCount) {
    const copies = playerCount > 4 ? 2 : 1;
    const out = [];
    let uid = 1;
    for (let c = 0; c < copies; c++) {
        C.SUITS.forEach(s => {
            ROYAL_RANKS.forEach(rk => {
                out.push({
                    id: `blf_${uid++}`,
                    kind: 'standard',
                    rank: rk,
                    value: ROYAL_RANKS.indexOf(rk) + 10,
                    suitId: s.id,
                    suit: s.symbol,
                    suitName: s.name,
                    color: s.color,
                    isRed: s.isRed
                });
            });
        });
    }
    return C.shuffle(out);
}

class RoyalBluffGame extends CastOn.Game {
    constructor(ctx) {
        super(ctx);
        this.ctx = ctx;
        this.running = true;
        this.rafId = null;

        this.roster = C.buildRoster(ctx, 3);
        this.scores = {};
        this.roster.forEach(p => { this.scores[p.id] = 0; });

        this.phase = 'howto'; // 'howto' | 'play_turn' | 'challenge' | 'reveal' | 'done'
        this.showHelpModal = false;

        this.hands = {};
        this.pot = [];
        this.lastClaim = null; // { playerId, cards, claimedRank }
        this.revealInfo = null; // { lied, challenger, actor, cards }

        this.turnIdx = 0;
        this.rankIdx = 0;
        this.turnCounter = 0;
        this.maxTurns = 16;

        this.statusBanner = 'Prepare your poker face!';
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
            if (this.scores[p.id] === undefined) {
                this.scores[p.id] = 0;
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

    startMatch() {
        this.clearTimers();
        this.phase = 'play_turn';
        this.pot = [];
        this.hands = {};
        this.roster.forEach(p => { this.hands[p.id] = []; });

        const shoe = createRoyalShoe(this.roster.length);
        shoe.forEach((card, i) => {
            const owner = this.roster[i % this.roster.length];
            this.hands[owner.id].push(card);
        });
        // Sort each hand by rank
        this.roster.forEach(p => {
            this.hands[p.id].sort((a, b) => a.value - b.value);
        });

        this.turnIdx = 0;
        this.rankIdx = 0;
        this.turnCounter = 0;
        this.ctx.sound.fanfare();
        this.beginTurn();
    }

    targetRank() {
        return ROYAL_RANKS[this.rankIdx % ROYAL_RANKS.length];
    }

    currentTurnPlayer() {
        return this.roster[this.turnIdx % this.roster.length];
    }

    beginTurn() {
        this.clearTimers();
        this.turnCounter++;
        if (this.turnCounter > this.maxTurns) {
            this.finishGame();
            return;
        }

        this.phase = 'play_turn';
        this.lastClaim = null;
        this.revealInfo = null;
        const active = this.currentTurnPlayer();
        const rk = this.targetRank();
        this.statusBanner = `${active.name}'s turn to play ${RANK_NAMES[rk]} (${rk})`;
        this.clock = 16;

        this.syncControllers();
        this.updateOverlay();

        this.clockTimer = setInterval(() => {
            if (!this.running || this.phase !== 'play_turn') return;
            this.clock--;
            if (this.clock <= 0) {
                this.runAiPlay(active.id);
            } else {
                this.updateOverlay();
            }
        }, 1000);

        if (active && active.__ai) {
            this.aiTimer = setTimeout(() => {
                this.runAiPlay(active.id);
            }, 1400);
        }
    }

    runAiPlay(pid) {
        if (!this.running || this.phase !== 'play_turn') return;
        const hand = this.hands[pid] || [];
        if (!hand.length) {
            this.finishGame();
            return;
        }
        const rk = this.targetRank();
        const matching = hand.filter(c => c.rank === rk);
        if (matching.length > 0 && Math.random() < 0.72) {
            const pick = matching.slice(0, Math.min(2, matching.length)).map(c => c.id);
            this.submitClaim(pid, pick);
        } else {
            // Bluff with 1 or 2 random cards!
            const shuffled = C.shuffle(hand);
            const count = Math.min(hand.length, Math.random() < 0.75 ? 1 : 2);
            this.submitClaim(pid, shuffled.slice(0, count).map(c => c.id));
        }
    }

    submitClaim(playerId, cardIds) {
        if (this.phase !== 'play_turn') return;
        const active = this.currentTurnPlayer();
        if (!active || active.id !== playerId) return;

        const hand = this.hands[playerId] || [];
        const ids = Array.isArray(cardIds) ? cardIds.map(String) : [];
        let chosen = hand.filter(c => ids.includes(String(c.id)));
        if (!chosen.length && hand.length) {
            chosen = [hand[0]];
        }
        chosen = chosen.slice(0, 3);

        // Remove chosen cards from hand and add to pot
        const chosenSet = new Set(chosen.map(c => c.id));
        this.hands[playerId] = hand.filter(c => !chosenSet.has(c.id));
        this.pot.push(...chosen);

        const view = this.ctx.view;
        const seats = C.computeSeats(view, this.roster.length);
        const seat = seats[this.turnIdx] || { x: view.w / 2, y: view.h - 80 };
        chosen.forEach((c, idx) => {
            this.animator.fly({
                card: c,
                fromX: seat.x,
                fromY: seat.y,
                toX: view.w / 2 + (idx - (chosen.length - 1) / 2) * 28,
                toY: view.h * 0.5,
                faceDown: true,
                duration: 360
            });
        });

        const rk = this.targetRank();
        this.lastClaim = {
            playerId: active.id,
            player: active,
            cards: chosen,
            claimedRank: rk
        };

        this.ctx.sound.pop();
        this.enterChallengePhase();
    }

    enterChallengePhase() {
        this.clearTimers();
        this.phase = 'challenge';
        this.clock = 5;
        const claim = this.lastClaim;
        this.statusBanner = `🕵️ ${claim.player.name} claims ${claim.cards.length} × ${RANK_NAMES[claim.claimedRank]}! Call Bluff?`;

        this.syncControllers();
        this.updateOverlay();

        // AI rivals might call bluff!
        const aiRivals = this.roster.filter(p => p.__ai && p.id !== claim.playerId);
        if (aiRivals.length > 0) {
            const caller = aiRivals[Math.floor(Math.random() * aiRivals.length)];
            // Higher chance to call bluff if 2+ cards played or pot is big
            const callProb = 0.25 + (claim.cards.length - 1) * 0.18;
            if (Math.random() < callProb) {
                this.aiTimer = setTimeout(() => {
                    if (this.phase === 'challenge') {
                        this.handleCallBluff(caller.id);
                    }
                }, 1800 + Math.random() * 1400);
            }
        }

        this.clockTimer = setInterval(() => {
            if (!this.running || this.phase !== 'challenge') return;
            this.clock--;
            if (this.clock <= 0) {
                this.passUnchallenged();
            } else {
                this.updateOverlay();
            }
        }, 1000);
    }

    passUnchallenged() {
        this.clearTimers();
        const claim = this.lastClaim;
        if (claim) {
            this.scores[claim.playerId] = (this.scores[claim.playerId] || 0) + 40 * claim.cards.length;
            // Check if player emptied their hand
            if ((this.hands[claim.playerId] || []).length === 0) {
                this.scores[claim.playerId] += 300;
                this.statusBanner = `🏆 ${claim.player.name} shed their last card unchallenged (+300 pts)!`;
                this.ctx.sound.fanfare();
                this.finishGame();
                return;
            }
        }
        this.ctx.sound.blip();
        this.advanceNextTurn();
    }

    handleCallBluff(challengerId) {
        if (this.phase !== 'challenge' || !this.lastClaim) return;
        if (challengerId === this.lastClaim.playerId) return;
        this.clearTimers();

        const challenger = this.roster.find(p => p.id === challengerId) || this.roster[0];
        const actor = this.lastClaim.player;
        const claimedRank = this.lastClaim.claimedRank;
        const playedCards = this.lastClaim.cards;

        const lied = playedCards.some(c => c.rank !== claimedRank);
        this.phase = 'reveal';
        this.revealInfo = {
            lied,
            challenger,
            actor,
            cards: playedCards,
            claimedRank,
            potCount: this.pot.length
        };

        if (lied) {
            // Actor lied! Actor eats the pot, challenger scores +150
            this.hands[actor.id].push(...this.pot);
            this.hands[actor.id].sort((a, b) => a.value - b.value);
            this.pot = [];
            this.scores[challenger.id] = (this.scores[challenger.id] || 0) + 150;
            this.statusBanner = `🚨 BUSTED! ${actor.name} LIED! ${challenger.name} earns +150 pts & ${actor.name} takes the pot!`;
            this.ctx.sound.fail();
        } else {
            // Actor told the truth! Challenger eats the pot, actor scores +150
            this.hands[challenger.id].push(...this.pot);
            this.hands[challenger.id].sort((a, b) => a.value - b.value);
            this.pot = [];
            this.scores[actor.id] = (this.scores[actor.id] || 0) + 150;
            this.statusBanner = `💎 TRUTH! ${actor.name} had real ${RANK_NAMES[claimedRank]}! ${challenger.name} eats the pot!`;
            this.ctx.sound.success();
        }

        this.syncControllers();
        this.updateOverlay();

        this.aiTimer = setTimeout(() => {
            if (!this.running) return;
            if ((this.hands[actor.id] || []).length === 0) {
                this.scores[actor.id] += 300;
                this.finishGame();
            } else {
                this.advanceNextTurn();
            }
        }, 4000);
    }

    advanceNextTurn() {
        this.turnIdx = (this.turnIdx + 1) % this.roster.length;
        this.rankIdx = (this.rankIdx + 1) % ROYAL_RANKS.length;
        this.beginTurn();
    }

    finishGame() {
        this.clearTimers();
        this.phase = 'done';
        this.ended = true;
        // Bonus points for fewest cards remaining
        this.roster.forEach(p => {
            const left = (this.hands[p.id] || []).length;
            this.scores[p.id] = Math.max(0, (this.scores[p.id] || 0) + Math.max(0, (10 - left) * 20));
        });
        const ranked = this.getRankedRoster();
        this.ctx.setOverlay(T.results({
            title: 'Royal Bluff',
            kicker: 'Final Standings',
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
                title: 'Royal Bluff (Cheat)',
                subtitle: 'Read the rules below or tap Start Game!',
                instructions: INSTRUCTIONS,
                openRules: true,
                hand: [],
                emptyText: 'Dealt cards appear here once the match starts!',
                actions: [
                    { id: 'start_game', label: '▶ Start Game Now', style: 'primary' }
                ]
            });
            return;
        }

        const active = this.currentTurnPlayer();
        const rk = this.targetRank();

        this.roster.forEach(p => {
            if (p.__bot || p.__demo) return;
            const myHand = (this.hands[p.id] || []).map(c => C.toPhoneCard(c, {
                playable: true,
                subText: c.rank === rk ? '✓ TRUTH' : '🕵️ BLUFF'
            }));

            if (this.phase === 'play_turn') {
                const isMyTurn = active && active.id === p.id;
                this.ctx.controller.setLayout('cards', {
                    eyebrow: isMyTurn ? `YOUR TURN · CLAIM ${RANK_NAMES[rk].toUpperCase()}` : `${active.name.toUpperCase()}'S TURN`,
                    title: isMyTurn ? `Select 1–3 Cards as "${RANK_NAMES[rk]}"` : `Watching ${active.name}...`,
                    subtitle: isMyTurn
                        ? 'Tap 1 to 3 cards (honest or bluffing), then tap Play below!'
                        : `Get ready to call Bluff if ${active.name} lies!`,
                    instructions: INSTRUCTIONS,
                    secretHand: true,
                    selectMode: isMyTurn ? 'multi' : 'none',
                    maxSelect: 3,
                    tableInfo: {
                        label: `Center Pot: ${this.pot.length} cards`,
                        badge: `Target: ${RANK_NAMES[rk]}`
                    },
                    hand: myHand,
                    actions: isMyTurn ? [
                        {
                            id: 'play_claim',
                            label: `Play as ${RANK_NAMES[rk]}`,
                            sublabel: 'Face-down into the pot',
                            style: 'primary',
                            requireSelection: true
                        }
                    ] : []
                }, p.id);
            } else if (this.phase === 'challenge') {
                const isActor = this.lastClaim && this.lastClaim.playerId === p.id;
                this.ctx.controller.setLayout('cards', {
                    eyebrow: '5-SECOND CHALLENGE WINDOW!',
                    title: isActor
                        ? 'Keep a Straight Face!  poker-face'
                        : `${this.lastClaim.player.name} claims ${this.lastClaim.cards.length} × ${RANK_NAMES[rk]}!`,
                    subtitle: isActor
                        ? 'Waiting to see if anyone calls your bluff...'
                        : 'Tap CALL BLUFF below if you think they are lying!',
                    instructions: INSTRUCTIONS,
                    secretHand: true,
                    selectMode: 'none',
                    tableInfo: {
                        label: `Center Pot: ${this.pot.length} cards`,
                        badge: `Claim: ${this.lastClaim.cards.length}× ${rk}`
                    },
                    hand: myHand,
                    actions: isActor ? [] : [
                        { id: 'call_bluff', label: '🚨 CALL BLUFF!', sublabel: '+150 pts if they lied!', style: 'danger' }
                    ]
                }, p.id);
            } else {
                this.ctx.controller.setLayout('cards', {
                    eyebrow: 'SHOWDOWN REVEAL',
                    title: this.statusBanner,
                    subtitle: 'Watch the TV table for the card flip!',
                    instructions: INSTRUCTIONS,
                    secretHand: true,
                    selectMode: 'none',
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
                this.startMatch();
            }
            return;
        }

        if (data.action === 'btn' && data.state === 'down' && data.button === 'Y') {
            this.showHelpModal = !this.showHelpModal;
            this.updateOverlay();
            return;
        }

        if (data.action === 'card_action') {
            if (data.id === 'play_claim') {
                this.submitClaim(playerId, data.selectedIds);
            } else if (data.id === 'call_bluff') {
                this.handleCallBluff(playerId);
            }
            return;
        }

        // Demo keyboard controls
        if (data.action === 'btn' && data.state === 'down') {
            if (this.phase === 'play_turn' && data.button === 'A') {
                const active = this.currentTurnPlayer();
                if (active) this.runAiPlay(active.id);
            } else if (this.phase === 'challenge' && data.button === 'A') {
                const rival = this.roster.find(p => p.id !== this.lastClaim.playerId);
                if (rival) this.handleCallBluff(rival.id);
            }
        }
    }

    updateOverlay() {
        if (this.phase === 'done') return;

        if (this.phase === 'howto') {
            this.ctx.setOverlay(C.renderHowToPlayModal({
                title: 'Royal Bluff (Cheat / I Doubt It)',
                tagline: 'HOW TO PLAY · SOCIAL DECEPTION',
                subtitle: 'Play cards face-down, lie with confidence, and catch your friends bluffing!',
                steps: HOWTO_STEPS,
                controls: 'Tap 1–3 cards on your phone and tap "Play as [Rank]". When rivals play, tap "🚨 CALL BLUFF!" to challenge.',
                scoring: '+150 pts for catching a liar or getting challenged when honest. +300 pts for emptying your hand first!',
                countdown: this.clock
            }));
            return;
        }

        const rk = this.targetRank();
        const ranked = this.getRankedRoster();
        const modalHtml = this.showHelpModal ? C.renderHowToPlayModal({
            title: 'Royal Bluff — Rules',
            steps: HOWTO_STEPS,
            isMidGame: true
        }) : '';

        this.ctx.setOverlay(C.renderHudFrame({
            kicker: `ROYAL BLUFF · TURN ${this.turnCounter} OF ${this.maxTurns}`,
            title: this.statusBanner,
            statusPill: `Target Rank: ${RANK_NAMES[rk]} (${rk})`,
            scoreRail: T.scoreRail(ranked),
            clock: (this.phase === 'play_turn' || this.phase === 'challenge') ? this.clock : null,
            quickSteps: [
                `Active player selects 1–3 cards on phone claiming "${RANK_NAMES[rk]}"`,
                'Rivals have 5 seconds to hit "🚨 CALL BLUFF!" on their phones',
                'Loser of a challenge picks up the entire center pot!'
            ],
            footerNote: 'Use "🙈 Hide Cards" on your phone if sitting close on the couch',
            modalHtml
        }));
    }

    loop() {
        if (!this.running) return;
        const { ctx: g, view } = this.ctx;

        C.drawTableBackdrop(g, view, {
            feltCenter: '#2e1038',
            feltEdge: '#15071c',
            railColor: '#a855f7',
            tableLabel: `Royal Bluff · Target Rank: ${RANK_NAMES[this.targetRank()]}`
        });

        const cx = view.w / 2;
        const cy = view.h * 0.5;

        // Draw Center Pot & Last Claimed Cards
        if (this.phase === 'reveal' && this.revealInfo) {
            const cards = this.revealInfo.cards || [];
            const spacing = 86;
            cards.forEach((c, i) => {
                const x = cx + (i - (cards.length - 1) / 2) * spacing;
                const matched = c.rank === this.revealInfo.claimedRank;
                C.drawCard(g, x, cy, 78, 110, c, {
                    highlight: matched ? '#10b981' : '#f43f5e',
                    badge: matched ? 'TRUTH' : 'LIED!',
                    badgeColor: matched ? '#10b981' : '#e11d48'
                });
            });
        } else {
            C.drawDeckStack(g, cx - 64, cy, 74, 104, this.pot.length, `Pot: ${this.pot.length} cards`);
            if (this.lastClaim) {
                const cnt = this.lastClaim.cards.length;
                for (let i = 0; i < cnt; i++) {
                    C.drawCard(g, cx + 44 + i * 22, cy, 74, 104, null, {
                        faceDown: true,
                        highlight: '#f59e0b'
                    });
                }
            }
        }

        // Draw Player Seats
        const seats = C.computeSeats(view, this.roster.length);
        const active = this.currentTurnPlayer();
        this.roster.forEach((p, idx) => {
            const s = seats[idx];
            const isTurn = this.phase === 'play_turn' && active && active.id === p.id;
            const handCount = (this.hands[p.id] || []).length;
            let badge = null;
            if (this.phase === 'challenge' && this.lastClaim && this.lastClaim.playerId === p.id) {
                badge = `CLAIMED ${this.lastClaim.cards.length}× ${this.lastClaim.claimedRank}`;
            } else if (isTurn) {
                badge = 'PLAYING';
            }
            C.drawPlayerSeat(g, s.x, s.y, p, {
                isActive: isTurn,
                subtitle: `${this.scores[p.id] || 0} pts`,
                cardCount: handCount,
                badge: badge,
                badgeBg: '#7c3aed'
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
    id: 'bluff',
    title: 'Royal Bluff',
    tagline: 'Bluff & Challenge',
    players: '2–8 players',
    control: 'Secret Hand + Buzzer',
    description: 'Play face-down cards claiming the target rank — or hit the Call Bluff buzzer when your friends lie!',
    accent: '#a855f7',
    icon: 'eye-off',
    css: C.HOWTO_CSS,
    create: (ctx) => new RoyalBluffGame(ctx)
});

})(window);

