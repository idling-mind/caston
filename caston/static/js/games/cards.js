/* ==========================================================================
   CastOn — Shared Card Game Engine & How-To-Play Toolkit (CastOn.cards)
   Provides:
   1. Standard 52-card French deck, Wild Eights (UNO-style) deck, and Danger
      Row (1–66 bullhead) deck generators + Fisher-Yates shuffle.
   2. Blackjack hand calculator & 7-card Texas Hold'em Poker hand evaluator.
   3. High-DPI Canvas casino table felt, 3D card stack, face-up / face-down /
      flipping card renderer, player seat layout engine, and flying card animator.
   4. Built-in "How to Play" interactive instructions overlay + persistent
      TV quick-rules bar + phone controller rules synchronization.
   ========================================================================== */
(function (w) {
'use strict';

const CastOn = (w.CastOn = w.CastOn || {});
const T = CastOn.tools || {};
const esc = CastOn.escapeHtml || ((s) => String(s == null ? '' : s));
const icon = (n, o) => (CastOn.icon ? CastOn.icon(n, o) : '');

const C = {};

/* ---------- 1. Suit, Color & Deck Definitions ---------------------------- */

C.SUITS = [
    { id: 'S', symbol: '♠', name: 'Spades',   color: '#0f172a', accent: '#3b82f6', isRed: false },
    { id: 'H', symbol: '♥', name: 'Hearts',   color: '#e11d48', accent: '#f43f5e', isRed: true  },
    { id: 'D', symbol: '♦', name: 'Diamonds', color: '#e11d48', accent: '#f59e0b', isRed: true  },
    { id: 'C', symbol: '♣', name: 'Clubs',    color: '#0f172a', accent: '#10b981', isRed: false }
];

C.SUIT_MAP = {};
C.SUITS.forEach(s => { C.SUIT_MAP[s.id] = s; C.SUIT_MAP[s.symbol] = s; });

C.RANKS = [
    { rank: '2',  value: 2,  blackjack: 2,  label: '2s' },
    { rank: '3',  value: 3,  blackjack: 3,  label: '3s' },
    { rank: '4',  value: 4,  blackjack: 4,  label: '4s' },
    { rank: '5',  value: 5,  blackjack: 5,  label: '5s' },
    { rank: '6',  value: 6,  blackjack: 6,  label: '6s' },
    { rank: '7',  value: 7,  blackjack: 7,  label: '7s' },
    { rank: '8',  value: 8,  blackjack: 8,  label: '8s' },
    { rank: '9',  value: 9,  blackjack: 9,  label: '9s' },
    { rank: '10', value: 10, blackjack: 10, label: '10s' },
    { rank: 'J',  value: 11, blackjack: 10, label: 'Jacks' },
    { rank: 'Q',  value: 12, blackjack: 10, label: 'Queens' },
    { rank: 'K',  value: 13, blackjack: 10, label: 'Kings' },
    { rank: 'A',  value: 14, blackjack: 11, label: 'Aces' }
];

C.WILD_COLORS = [
    { id: 'RED',    label: 'Crimson', symbol: '♦', bg: '#e11d48', light: '#ffe4e6' },
    { id: 'BLUE',   label: 'Royal',   symbol: '♠', bg: '#2563eb', light: '#dbeafe' },
    { id: 'YELLOW', label: 'Amber',   symbol: '★', bg: '#d97706', light: '#fef3c7' },
    { id: 'GREEN',  label: 'Emerald', symbol: '♣', bg: '#059669', light: '#d1fae5' }
];

C.WILD_COLOR_MAP = {};
C.WILD_COLORS.forEach(wc => { C.WILD_COLOR_MAP[wc.id] = wc; });

/** Fisher-Yates shuffle (returns a shuffled copy). */
C.shuffle = function (list) {
    const arr = Array.isArray(list) ? list.slice() : [];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
};

/** Create a standard 52-card French deck (or multi-deck shoe). */
C.createStandardDeck = function (opts) {
    const o = opts || {};
    const decks = o.decks || 1;
    const out = [];
    let uid = 1;
    for (let d = 0; d < decks; d++) {
        C.SUITS.forEach(suit => {
            C.RANKS.forEach(r => {
                out.push({
                    id: `std_${uid++}`,
                    kind: 'standard',
                    rank: r.rank,
                    value: r.value,
                    blackjack: r.blackjack,
                    suitId: suit.id,
                    suit: suit.symbol,
                    suitName: suit.name,
                    color: suit.color,
                    isRed: suit.isRed
                });
            });
        });
    }
    return o.shuffle !== false ? C.shuffle(out) : out;
};

/** Create a Wild Eights / Party UNO deck (76 cards). */
C.createWildDeck = function () {
    const out = [];
    let uid = 1;
    C.WILD_COLORS.forEach(wc => {
        // Numbers 0–9 (two of 1–9, one of 0)
        for (let n = 0; n <= 9; n++) {
            const copies = n === 0 ? 1 : 2;
            for (let c = 0; c < copies; c++) {
                out.push({
                    id: `wild_${uid++}`,
                    kind: 'wild',
                    rank: String(n),
                    value: n,
                    colorId: wc.id,
                    colorLabel: wc.label,
                    suit: wc.symbol,
                    bgColor: wc.bg,
                    action: null,
                    isWild: n === 8 // 8s are also wild in Wild Eights!
                });
            }
        }
        // Action cards: SKIP, REV, +2 (two of each per color)
        [
            { rank: 'SKIP', label: '⊘', sub: 'SKIP', val: 20 },
            { rank: 'REV',  label: '⇄', sub: 'REV',  val: 20 },
            { rank: '+2',   label: '+2', sub: 'DRAW 2', val: 20 }
        ].forEach(act => {
            for (let c = 0; c < 2; c++) {
                out.push({
                    id: `wild_${uid++}`,
                    kind: 'wild',
                    rank: act.rank,
                    centerText: act.label,
                    subText: act.sub,
                    value: act.val,
                    colorId: wc.id,
                    colorLabel: wc.label,
                    suit: wc.symbol,
                    bgColor: wc.bg,
                    action: act.rank,
                    isWild: false
                });
            }
        });
    });

    // 4 Rainbow WILD and 4 WILD +4
    for (let i = 0; i < 4; i++) {
        out.push({
            id: `wild_${uid++}`,
            kind: 'wild',
            rank: 'WILD',
            centerText: '★',
            subText: 'WILD',
            value: 50,
            colorId: 'WILD',
            colorLabel: 'Any Color',
            suit: '★',
            bgColor: '#7c3aed',
            action: 'WILD',
            isWild: true
        });
        out.push({
            id: `wild_${uid++}`,
            kind: 'wild',
            rank: '+4',
            centerText: '+4',
            subText: 'WILD +4',
            value: 50,
            colorId: 'WILD',
            colorLabel: 'Any Color',
            suit: '★',
            bgColor: '#db2777',
            action: 'WILD4',
            isWild: true
        });
    }

    return C.shuffle(out);
};

/** Create a Danger Row (6 Takes! / Bullhead) deck of cards 1..66. */
C.createDangerDeck = function (maxCard) {
    const limit = maxCard || 66;
    const out = [];
    for (let n = 1; n <= limit; n++) {
        let bulls = 1;
        let bg = '#1e293b';
        let accent = '#38bdf8';
        if (n === 55) {
            bulls = 7;
            bg = '#991b1b';
            accent = '#f43f5e';
        } else if (n % 11 === 0) {
            bulls = 5;
            bg = '#9a3412';
            accent = '#f97316';
        } else if (n % 10 === 0) {
            bulls = 3;
            bg = '#854d0e';
            accent = '#f59e0b';
        } else if (n % 5 === 0) {
            bulls = 2;
            bg = '#065f46';
            accent = '#10b981';
        }
        out.push({
            id: `dgr_${n}`,
            kind: 'danger',
            rank: String(n),
            value: n,
            bulls: bulls,
            suit: '💀'.repeat(Math.min(3, bulls)),
            bgColor: bg,
            accent: accent
        });
    }
    return C.shuffle(out);
};

/** Convert a TV card object into a phone controller hand card descriptor. */
C.toPhoneCard = function (card, opts) {
    const o = opts || {};
    if (!card) return null;
    if (card.kind === 'wild') {
        const isWild = !!card.isWild || card.colorId === 'WILD' || card.rank === '8';
        return {
            id: card.id,
            rank: card.rank,
            suit: card.suit || '★',
            bgColor: card.bgColor || '#2563eb',
            centerText: card.centerText || card.rank,
            subText: card.subText || (card.rank === '8' ? 'WILD 8' : card.colorLabel),
            footLeft: isWild ? 'WILD' : card.colorId,
            footRight: card.rank,
            playable: o.playable !== false,
            disabled: !!o.disabled,
            selected: !!o.selected,
            needsSuit: isWild,
            suitOptions: C.WILD_COLORS
        };
    }
    if (card.kind === 'danger') {
        return {
            id: card.id,
            rank: card.rank,
            suit: `${card.bulls}💀`,
            bgColor: card.bgColor,
            centerText: card.rank,
            subText: `${card.bulls} Penalty`,
            footLeft: `${card.bulls}💀`,
            footRight: `#${card.rank}`,
            playable: o.playable !== false,
            disabled: !!o.disabled,
            selected: !!o.selected
        };
    }
    // Standard French card
    return {
        id: card.id,
        rank: card.rank,
        suit: card.suit,
        color: card.color || (card.isRed ? '#e11d48' : '#0f172a'),
        centerText: `${card.rank}${card.suit}`,
        subText: o.subText || card.suitName || '',
        footLeft: card.suit,
        footRight: card.rank,
        playable: o.playable !== false,
        disabled: !!o.disabled,
        selected: !!o.selected
    };
};

/* ---------- 2. Hand Evaluators (Blackjack & Texas Hold'em) --------------- */

/** Compute Blackjack hand total, soft status, natural 21, and bust. */
C.blackjackValue = function (cards) {
    let total = 0;
    let aces = 0;
    (cards || []).forEach(c => {
        if (!c || c.faceDown) return;
        if (c.rank === 'A') {
            aces++;
            total += 11;
        } else {
            total += (c.blackjack || Math.min(10, c.value || 0));
        }
    });
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    const visibleCount = (cards || []).filter(c => c && !c.faceDown).length;
    const isBlackjack = visibleCount === 2 && total === 21;
    const isBust = total > 21;
    let label = String(total);
    if (isBlackjack) label = 'BLACKJACK!';
    else if (isBust) label = `BUST (${total})`;
    else if (aces > 0 && total <= 21) label = `Soft ${total}`;
    return { total, soft: aces > 0, blackjack: isBlackjack, bust: isBust, label };
};

/** Evaluate a 5-to-7 card Texas Hold'em hand. Returns numeric score & name. */
C.evaluatePokerHand = function (cards) {
    const list = (cards || []).filter(Boolean);
    if (list.length < 5) {
        const hi = list.slice().sort((a, b) => b.value - a.value)[0];
        return {
            category: 0,
            name: hi ? `High Card ${hi.rank}` : 'High Card',
            score: hi ? hi.value : 0,
            bestIds: list.map(c => c.id)
        };
    }

    // Generate all 5-card combinations
    const combos = [];
    const n = list.length;
    function pick(start, chosen) {
        if (chosen.length === 5) {
            combos.push(chosen.slice());
            return;
        }
        for (let i = start; i < n; i++) {
            chosen.push(list[i]);
            pick(i + 1, chosen);
            chosen.pop();
        }
    }
    pick(0, []);

    let best = null;
    combos.forEach(five => {
        const res = scoreFiveCards(five);
        if (!best || res.score > best.score) {
            best = res;
        }
    });
    return best;
};

function scoreFiveCards(five) {
    const sorted = five.slice().sort((a, b) => b.value - a.value);
    const vals = sorted.map(c => c.value);
    const suits = sorted.map(c => c.suitId);
    const isFlush = suits.every(s => s === suits[0]);

    // Check straight (including A-2-3-4-5 wheel)
    let isStraight = false;
    let straightHigh = vals[0];
    const uniqueVals = Array.from(new Set(vals));
    if (uniqueVals.length === 5) {
        if (vals[0] - vals[4] === 4) {
            isStraight = true;
            straightHigh = vals[0];
        } else if (vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
            isStraight = true;
            straightHigh = 5;
        }
    }

    // Count frequencies
    const counts = {};
    vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    const groups = Object.keys(counts)
        .map(v => ({ val: Number(v), count: counts[v] }))
        .sort((a, b) => b.count - a.count || b.val - a.val);

    const rankLabel = (v) => {
        const r = C.RANKS.find(item => item.value === v);
        return r ? r.rank : String(v);
    };

    let category = 0;
    let name = 'High Card';
    let tie = groups.map(g => g.val);

    if (isFlush && isStraight) {
        category = straightHigh === 14 ? 9 : 8;
        name = straightHigh === 14 ? 'Royal Flush!' : `Straight Flush (${rankLabel(straightHigh)} High)`;
        tie = [straightHigh];
    } else if (groups[0].count === 4) {
        category = 7;
        name = `Four of a Kind (${rankLabel(groups[0].val)}s)`;
    } else if (groups[0].count === 3 && groups[1].count === 2) {
        category = 6;
        name = `Full House (${rankLabel(groups[0].val)}s full of ${rankLabel(groups[1].val)}s)`;
    } else if (isFlush) {
        category = 5;
        name = `Flush (${rankLabel(vals[0])} High)`;
    } else if (isStraight) {
        category = 4;
        name = `Straight (${rankLabel(straightHigh)} High)`;
        tie = [straightHigh];
    } else if (groups[0].count === 3) {
        category = 3;
        name = `Three of a Kind (${rankLabel(groups[0].val)}s)`;
    } else if (groups[0].count === 2 && groups[1].count === 2) {
        category = 2;
        name = `Two Pair (${rankLabel(groups[0].val)}s & ${rankLabel(groups[1].val)}s)`;
    } else if (groups[0].count === 2) {
        category = 1;
        name = `Pair of ${rankLabel(groups[0].val)}s`;
    } else {
        category = 0;
        name = `High Card ${rankLabel(vals[0])}`;
    }

    let score = category * 1e10;
    for (let i = 0; i < 5; i++) {
        score += (tie[i] || 0) * Math.pow(15, 4 - i);
    }

    return {
        category,
        name,
        score,
        bestIds: sorted.map(c => c.id)
    };
}

/* ---------- 3. Canvas Table, Cards, Seats & Animations ------------------- */

/** Draw a theme-integrated party card table on the TV canvas over .app-bg. */
C.drawTableBackdrop = function (g, view, opts) {
    const o = opts || {};
    const th = T.theme ? T.theme() : {};
    const cx = view.w / 2;
    const cy = view.h * 0.52;

    // 1. Clear outer canvas so the console's .app-bg SVG wave background shines around the table
    if (T.arenaBackdrop) {
        T.arenaBackdrop(view);
    } else {
        g.clearRect(0, 0, view.w, view.h);
    }

    // 2. Oval casino table rail & theme-matched felt surface
    const rx = Math.min(view.w * 0.43, 535);
    const ry = Math.min(view.h * 0.37, 245);

    g.save();
    // Outer table rim shadow & padded rail
    g.shadowColor = 'rgba(0, 0, 0, 0.55)';
    g.shadowBlur = 28;
    g.shadowOffsetY = 10;
    g.beginPath();
    g.ellipse(cx, cy, rx + 16, ry + 16, 0, 0, Math.PI * 2);
    g.fillStyle = th.panel || 'rgba(10, 20, 52, 0.86)';
    g.fill();

    g.shadowBlur = 0;
    g.shadowOffsetY = 0;
    g.lineWidth = 3;
    g.strokeStyle = o.railColor || th.tableRim || th.accent || 'rgba(255, 255, 255, 0.28)';
    g.stroke();

    // Inner theme-tinted felt gradient
    g.beginPath();
    g.ellipse(cx, cy, rx + 2, ry + 2, 0, 0, Math.PI * 2);
    const feltGrad = g.createRadialGradient(cx, cy, 24, cx, cy, Math.max(rx, ry));
    feltGrad.addColorStop(0, th.tableCenter || o.feltCenter || 'rgba(20, 48, 124, 0.85)');
    feltGrad.addColorStop(1, th.tableEdge || o.feltEdge || 'rgba(8, 16, 44, 0.94)');
    g.fillStyle = feltGrad;
    g.fill();

    // Inner dashed betting ring
    g.beginPath();
    g.ellipse(cx, cy, rx - 12, ry - 12, 0, 0, Math.PI * 2);
    g.lineWidth = 1.5;
    g.setLineDash([8, 6]);
    g.strokeStyle = o.innerRing || th.boardBorder || 'rgba(255, 255, 255, 0.18)';
    g.stroke();
    g.setLineDash([]);

    if (o.tableLabel) {
        g.font = '800 12.5px "Space Grotesk", sans-serif';
        g.fillStyle = 'rgba(255, 255, 255, 0.32)';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(o.tableLabel.toUpperCase(), cx, cy - ry + 34);
    }
    g.restore();
};

/**
 * Draw a single crisp playing card on the TV canvas.
 * @param {CanvasRenderingContext2D} g
 * @param {number} x - center X of the card
 * @param {number} y - center Y of the card
 * @param {number} w - width (e.g. 74)
 * @param {number} h - height (e.g. 104)
 * @param {object|null} card - card descriptor
 * @param {object} [opts] - { faceDown, angle, scale, flipX, highlight, dimmed, badge }
 */
C.drawCard = function (g, x, y, w, h, card, opts) {
    const o = opts || {};
    const scale = o.scale != null ? o.scale : 1;
    const flipX = o.flipX != null ? o.flipX : 1;
    const faceDown = o.faceDown || !card;
    const r = Math.max(6, Math.min(12, w * 0.13));

    g.save();
    g.translate(x, y);
    if (o.angle) g.rotate(o.angle);
    g.scale(scale * flipX, scale);
    if (o.dimmed) g.globalAlpha = 0.42;

    const hw = w / 2;
    const hh = h / 2;

    // Shadow
    g.shadowColor = o.highlight ? o.highlight : 'rgba(0, 0, 0, 0.48)';
    g.shadowBlur = o.highlight ? 18 : 12;
    g.shadowOffsetY = o.highlight ? 0 : 5;

    T.roundRect(g, -hw, -hh, w, h, r);

    if (faceDown) {
        // Theme-aware card back
        const th = T.theme ? T.theme() : {};
        const backGrad = g.createLinearGradient(-hw, -hh, hw, hh);
        backGrad.addColorStop(0, o.backColorA || th.bgA || '#122a72');
        backGrad.addColorStop(1, o.backColorB || th.bgBase || '#060b1d');
        g.fillStyle = backGrad;
        g.fill();

        g.shadowBlur = 0;
        g.shadowOffsetY = 0;
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        g.stroke();

        // Inner geometric trim
        T.roundRect(g, -hw + 5, -hh + 5, w - 10, h - 10, Math.max(3, r - 3));
        g.lineWidth = 1;
        g.strokeStyle = th.boardBorder || 'rgba(255, 255, 255, 0.28)';
        g.stroke();

        // Emblem
        g.font = `700 ${Math.round(w * 0.34)}px "Space Grotesk", sans-serif`;
        g.fillStyle = th.accent || 'rgba(255, 255, 255, 0.42)';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('❖', 0, 0);
        g.restore();
        return;
    }

    const isColored = card.kind === 'wild' || card.kind === 'danger' || !!card.bgColor;
    if (isColored) {
        const cGrad = g.createLinearGradient(-hw, -hh, hw, hh);
        cGrad.addColorStop(0, card.bgColor || '#2563eb');
        cGrad.addColorStop(1, '#0f172a');
        g.fillStyle = cGrad;
    } else {
        const fGrad = g.createLinearGradient(-hw, -hh, hw, hh);
        fGrad.addColorStop(0, '#ffffff');
        fGrad.addColorStop(1, '#f1f5f9');
        g.fillStyle = fGrad;
    }
    g.fill();

    g.shadowBlur = 0;
    g.shadowOffsetY = 0;
    g.lineWidth = o.highlight ? 3 : 2;
    g.strokeStyle = o.highlight ? o.highlight : 'rgba(255, 255, 255, 0.92)';
    g.stroke();

    const ink = isColored ? '#ffffff' : (card.color || (card.isRed ? '#e11d48' : '#0f172a'));

    // Top-left corner index
    g.fillStyle = ink;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = `800 ${Math.round(w * 0.22)}px "Space Grotesk", sans-serif`;
    g.fillText(String(card.rank || ''), -hw + 7, -hh + 6);

    if (card.suit && card.kind !== 'danger') {
        g.font = `700 ${Math.round(w * 0.18)}px "Space Grotesk", sans-serif`;
        g.fillText(String(card.suit), -hw + 7, -hh + 6 + Math.round(w * 0.22));
    }

    // Center pip / symbol
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (card.kind === 'danger') {
        g.font = `800 ${Math.round(w * 0.36)}px "Space Grotesk", sans-serif`;
        g.fillText(String(card.rank), 0, -4);
        g.font = `700 ${Math.round(w * 0.16)}px "Inter", sans-serif`;
        g.fillStyle = '#fca5a5';
        g.fillText(`${card.bulls} 💀`, 0, hh - 16);
    } else if (card.kind === 'wild') {
        // Inner oval
        g.save();
        g.beginPath();
        g.ellipse(0, 2, w * 0.34, h * 0.28, -0.25, 0, Math.PI * 2);
        g.fillStyle = 'rgba(255, 255, 255, 0.16)';
        g.fill();
        g.restore();

        g.fillStyle = '#ffffff';
        g.font = `800 ${Math.round(w * 0.34)}px "Space Grotesk", sans-serif`;
        g.fillText(String(card.centerText || card.rank), 0, 1);
        if (card.subText) {
            g.font = `700 ${Math.round(w * 0.13)}px "Space Grotesk", sans-serif`;
            g.fillText(String(card.subText), 0, hh - 13);
        }
    } else {
        g.font = `700 ${Math.round(w * 0.42)}px "Space Grotesk", sans-serif`;
        g.fillText(String(card.suit || '♠'), 0, 2);
    }

    // Bottom-right rank
    if (card.kind !== 'danger') {
        g.fillStyle = ink;
        g.textAlign = 'right';
        g.textBaseline = 'bottom';
        g.font = `800 ${Math.round(w * 0.2)}px "Space Grotesk", sans-serif`;
        g.fillText(String(card.rank || ''), hw - 7, hh - 5);
    }

    if (o.badge) {
        g.fillStyle = o.badgeColor || '#10b981';
        T.roundRect(g, -hw + 4, hh - 20, w - 8, 16, 5);
        g.fill();
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '800 9.5px "Space Grotesk", sans-serif';
        g.fillText(String(o.badge), 0, hh - 12);
    }

    g.restore();
};

/** Draw a 3D deck draw-pile stack on the TV canvas. */
C.drawDeckStack = function (g, x, y, w, h, count, label) {
    const layers = Math.min(4, Math.max(1, Math.ceil((count || 1) / 10)));
    for (let i = layers - 1; i >= 0; i--) {
        C.drawCard(g, x - i * 3, y + i * 3, w, h, null, { faceDown: true });
    }
    if (label || count != null) {
        g.save();
        g.font = '700 11px "Space Grotesk", sans-serif';
        g.fillStyle = 'rgba(255, 255, 255, 0.8)';
        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillText(label || `${count} left`, x, y + h / 2 + 10);
        g.restore();
    }
};

/** Compute seat coordinates around the table for 1 to 8 players. */
C.computeSeats = function (view, count, opts) {
    const o = opts || {};
    const cx = view.w / 2;
    const cy = o.cy || view.h * 0.53;
    const rx = o.rx || Math.min(view.w * 0.39, 490);
    const ry = o.ry || Math.min(view.h * 0.31, 210);
    const seats = [];

    if (o.semicircle) {
        // Semicircle along the bottom (great for Blackjack vs Dealer at top)
        for (let i = 0; i < count; i++) {
            const t = count === 1 ? 0.5 : i / (count - 1);
            const angle = Math.PI * 0.84 - t * Math.PI * 0.68; // left-bottom to right-bottom
            seats.push({
                x: cx + Math.cos(angle) * rx,
                y: cy + Math.sin(angle) * ry * 0.95,
                angle
            });
        }
        return seats;
    }

    // Full ellipse around the table
    for (let i = 0; i < count; i++) {
        const angle = Math.PI / 2 + (i / Math.max(1, count)) * Math.PI * 2;
        seats.push({
            x: cx + Math.cos(angle) * rx,
            y: cy + Math.sin(angle) * ry,
            angle
        });
    }
    return seats;
};

/** Draw a player seat badge around the table on the TV canvas. */
C.drawPlayerSeat = function (g, x, y, player, opts) {
    if (!player) return;
    const o = opts || {};
    const isActive = !!o.isActive;
    const boxW = o.width || 148;
    const boxH = o.height || 58;
    const hx = x - boxW / 2;
    const hy = y - boxH / 2;

    g.save();

    // Active turn glow
    const th = T.theme ? T.theme() : {};
    if (isActive) {
        g.shadowColor = player.color || th.accent || '#38bdf8';
        g.shadowBlur = 20;
    }

    T.roundRect(g, hx, hy, boxW, boxH, 12);
    g.fillStyle = isActive ? (th.panelSolid || '#0e1d4a') : (th.panel || 'rgba(10, 20, 52, 0.82)');
    g.fill();
    g.shadowBlur = 0;

    g.lineWidth = isActive ? 2.5 : 1.2;
    g.strokeStyle = isActive ? (player.color || th.accent || '#38bdf8') : 'rgba(255, 255, 255, 0.2)';
    g.stroke();

    // Avatar circle
    const avX = hx + 26;
    const avY = y;
    T.circle(g, avX, avY, 17);
    g.fillStyle = 'rgba(255, 255, 255, 0.1)';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = player.color || '#38bdf8';
    g.stroke();

    const face = (typeof player.avatar === 'string' && !player.avatar.startsWith('data:') && !player.avatar.startsWith('http'))
        ? player.avatar
        : '🎮';
    g.font = '16px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.fillText(face, avX, avY + 1);

    // Name & Subtitle (score / chips / card count)
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = '700 13px "Space Grotesk", sans-serif';
    g.fillStyle = '#ffffff';
    const nameStr = String(player.name || 'Player').slice(0, 11);
    g.fillText(nameStr, hx + 50, hy + 10);

    g.font = '600 11.5px "Inter", sans-serif';
    g.fillStyle = o.subColor || 'rgba(255, 255, 255, 0.7)';
    g.fillText(String(o.subtitle != null ? o.subtitle : ''), hx + 50, hy + 29);

    // Optional mini card count fan on top-right of seat
    if (typeof o.cardCount === 'number') {
        const badgeW = 34;
        const badgeH = 22;
        const bx = hx + boxW - badgeW - 6;
        const by = hy - 10;
        T.roundRect(g, bx, by, badgeW, badgeH, 6);
        g.fillStyle = o.cardCount === 1 ? '#e11d48' : '#1e293b';
        g.fill();
        g.lineWidth = 1.5;
        g.strokeStyle = o.cardCount === 1 ? '#fda4af' : 'rgba(255, 255, 255, 0.35)';
        g.stroke();

        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '800 11px "Space Grotesk", sans-serif';
        g.fillStyle = '#ffffff';
        g.fillText(`${o.cardCount}🂠`, bx + badgeW / 2, by + badgeH / 2);
    }

    // Optional status pill (e.g. "UNO!", "STAND", "BUST", "LOCKED")
    if (o.badge) {
        const pillW = Math.max(54, o.badge.length * 7 + 16);
        const px = x - pillW / 2;
        const py = hy + boxH - 8;
        T.roundRect(g, px, py, pillW, 18, 9);
        g.fillStyle = o.badgeBg || (player.color || '#2563eb');
        g.fill();
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '800 10px "Space Grotesk", sans-serif';
        g.fillStyle = '#ffffff';
        g.fillText(String(o.badge).toUpperCase(), x, py + 9);
    }

    g.restore();
};

/** Simple flying card animator for smooth card movements across the TV table. */
class CardAnimator {
    constructor() {
        this.items = [];
    }

    fly(cfg) {
        this.items.push({
            card: cfg.card || null,
            fromX: cfg.fromX || 0,
            fromY: cfg.fromY || 0,
            toX: cfg.toX || 0,
            toY: cfg.toY || 0,
            w: cfg.w || 68,
            h: cfg.h || 96,
            faceDown: !!cfg.faceDown,
            start: performance.now(),
            duration: cfg.duration || 360
        });
    }

    draw(g) {
        if (!this.items.length) return;
        const now = performance.now();
        this.items = this.items.filter(it => {
            const t = Math.min(1, (now - it.start) / it.duration);
            const ease = 1 - Math.pow(1 - t, 3);
            const x = it.fromX + (it.toX - it.fromX) * ease;
            const y = it.fromY + (it.toY - it.fromY) * ease - Math.sin(t * Math.PI) * 24;
            const angle = (1 - ease) * 0.25;
            C.drawCard(g, x, y, it.w, it.h, it.card, { faceDown: it.faceDown, angle });
            return t < 1;
        });
    }
}
C.CardAnimator = CardAnimator;

/* ---------- 4. Built-in Playing Instructions ("How to Play") UI ---------- */

/**
 * Shared CSS for the Card Game HUD Frame (uses Design System theme tokens).
 */
C.HOWTO_CSS = `
    .cardgame-hud {
        position: absolute;
        inset: 0;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 14px var(--gutter) 12px;
        box-sizing: border-box;
        zoom: var(--tv-scale, 1);
    }
    .cardgame-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        width: 100%;
    }
    .cardgame-topbar__left {
        display: flex;
        align-items: center;
        gap: 12px;
        background: var(--surface-glass);
        border: 1px solid var(--line-strong);
        padding: 8px 16px;
        border-radius: var(--r-md);
        backdrop-filter: blur(16px);
        box-shadow: var(--shadow-tile);
    }
    .cardgame-topbar__right {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .cardgame-rules-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 13px;
        border-radius: var(--r-sm);
        background: var(--surface-glass);
        border: 1px solid var(--line-strong);
        font-family: var(--font-display);
        font-size: 12px;
        font-weight: 700;
        color: var(--ink-2);
        backdrop-filter: blur(14px);
    }
    .cardgame-bottom-strip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 9px 18px;
        border-radius: var(--r-md);
        background: var(--surface-glass);
        border: 1px solid var(--line-strong);
        backdrop-filter: blur(16px);
        font-size: 12.5px;
        color: var(--ink);
        box-shadow: var(--shadow-tile);
    }
    .cardgame-bottom-strip__steps {
        display: flex;
        align-items: center;
        gap: 18px;
        flex-wrap: wrap;
    }
    .cardgame-bottom-strip__step {
        display: inline-flex;
        align-items: center;
        gap: 7px;
    }
    .cardgame-bottom-strip__num {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--accent);
        color: var(--accent-ink);
        font-family: var(--font-display);
        font-size: 11px;
        font-weight: 800;
        display: grid;
        place-items: center;
    }
`;

/**
 * Render the full-screen How-To-Play Briefing Overlay on the TV (no auto-countdown).
 */
C.renderHowToPlayModal = function (cfg) {
    if (T && T.howToPlay) {
        return T.howToPlay(cfg);
    }
    return '';
};

/**
 * Render the standard top + bottom HUD frame for an active card game.
 */
C.renderHudFrame = function (cfg) {
    const quickSteps = (cfg.quickSteps || []).map((st, i) => `
        <span class="cardgame-bottom-strip__step">
            <span class="cardgame-bottom-strip__num">${i + 1}</span>
            <span>${esc(st)}</span>
        </span>
    `).join('');

    return `
        <div class="cardgame-hud">
            <div class="cardgame-topbar">
                <div class="cardgame-topbar__left">
                    <div>
                        <p class="eyebrow is-accent">${esc(cfg.kicker || 'CARD TABLE')}</p>
                        <h3 class="display t-md" style="margin:2px 0 0">${esc(cfg.title || '')}</h3>
                    </div>
                    ${cfg.statusPill ? `<span class="tag" style="margin-left:8px">${esc(cfg.statusPill)}</span>` : ''}
                </div>
                <div class="cardgame-topbar__right">
                    ${cfg.scoreRail || ''}
                    <span class="cardgame-rules-chip">📖 Rules on Phone</span>
                    ${cfg.clock != null ? T.clock(cfg.clock, { isHot: cfg.clock <= 5 }) : ''}
                </div>
            </div>

            ${cfg.centerHtml || ''}

            <div class="cardgame-bottom-strip">
                <div class="cardgame-bottom-strip__steps">
                    <strong style="color:var(--accent);font-family:var(--font-display)">HOW TO PLAY:</strong>
                    ${quickSteps}
                </div>
                <span class="dim t-xs">${esc(cfg.footerNote || 'Look at your phone for your private hand')}</span>
            </div>
        </div>
        ${cfg.modalHtml || ''}
    `;
};

/* ---------- 5. Party Roster & AI Bot Helper ------------------------------ */

const BOT_POOL = [
    { id: '__bot_1', name: 'Ace Bot',   color: '#f43f5e', avatar: '🤖', __bot: true },
    { id: '__bot_2', name: 'Lady Luck', color: '#8b5cf6', avatar: '🦊', __bot: true },
    { id: '__bot_3', name: 'Maverick',  color: '#10b981', avatar: '🦁', __bot: true }
];

/**
 * Build an ordered roster of players for card games, automatically padding with
 * AI bots if fewer than `minPlayers` humans are connected, and marking non-VIP
 * `?demo=N` seeded players as AI-assisted so solo desktop testing plays smoothly.
 */
C.buildRoster = function (ctx, minPlayers) {
    const minP = minPlayers || 2;
    const raw = Object.values(ctx.players || {}).map(p => Object.assign({}, p));
    const inDemo = CastOn.inDemoMode && CastOn.inDemoMode();

    raw.forEach(p => {
        // In ?demo=4 mode, only the VIP (demo_0) is steered by the keyboard;
        // other demo slots act as AI opponents unless a real phone message arrives.
        if (inDemo && p.__demo && p.id !== ctx.vipId) {
            p.__ai = true;
        }
    });

    let botIdx = 0;
    while (raw.length < minP && botIdx < BOT_POOL.length) {
        const b = Object.assign({}, BOT_POOL[botIdx++]);
        b.__ai = true;
        raw.push(b);
    }
    return raw;
};

CastOn.cards = C;

})(window);

