/* ==========================================================================
   Game — Connect 4 (Mega Grid Party Edition)
   - Screen-filling slot grid dynamically tailored to fill the TV stage.
   - Multi-player support (2–8 players, plus smart AI bots for solo/demo play).
   - Supports both Turn-Based rotation and Simultaneous Blitz mode (toggle with X).
   - Clear visual hierarchy:
       * Top-Left: Prominent segmented Mode Switcher with explicit [X] callout
       * Top-Center: Dedicated Turn Spotlight with visual progress bar & circular shot clock
       * Top-Right: Player cards with 4-dot connection progress meters (●●○○)
       * Drop Rail: Player column droppers with live draining countdown ring
       * Bottom Bar: Dedicated control legend with arcade keycap badges
   ========================================================================== */
(function (w) {
'use strict';

const CastOn = w.CastOn;

const avatarImgCache = new Map();
function getAvatarImg(src) {
    let img = avatarImgCache.get(src);
    if (!img) {
        img = new Image();
        img.src = src;
        avatarImgCache.set(src, img);
    }
    return img;
}

const BOT_FALLBACK = {
    id: '__bot_rival',
    name: 'Robo-Four',
    color: '#f43f5e',
    avatar: '🤖',
    is_vip: false,
    __bot: true
};

const TURN_TIME_MS = 9000;
const BLITZ_COOLDOWN_MS = 1450;
const REPEAT_INITIAL_MS = 210;
const REPEAT_INTERVAL_MS = 115;

class Connect4Game extends CastOn.Game {
    constructor(ctx) {
        super(ctx);
        this.ctx = ctx;
        this.running = true;
        this.ended = false;
        this.rafId = null;

        // Modes: 'turns' (classic rotation) or 'blitz' (simultaneous with cooldown)
        this.mode = 'turns';
        this.modeBannerUntil = 0;

        // Board dimensions computed to fill the screen space with slots
        this.cols = 18;
        this.rows = 8;
        this.grid = []; // grid[row][col] = { playerId, color, avatar, name, placedAt } | null

        this.playerState = {}; // playerId -> { col, heldDir, nextMoveAt, cooldownUntil, pieces, blocks, bestChain }
        this.scores = {};
        this.turnOrder = [];
        this.turnIndex = 0;
        this.turnStartedAt = performance.now();
        this.lastTickSec = -1;

        this.fallingDiscs = []; // animated discs currently dropping into slots
        this.particles = [];
        this.lastMove = null; // { r, c, playerId }
        this.winningLine = null; // Array of { r, c }
        this.winner = null;
        this.isDraw = false;
        this.winCelebrationUntil = 0;
        this.resultsShown = false;
        this.screenShake = 0;

        this.lastFrame = performance.now();
        this.phase = 'howto';

        this.initBoardDimensions();
        this.resetBoard(false);
        this.syncPlayers();
        this.enterHowToPhase();

        this.ctx.sound.fanfare();

        this.loop = this.loop.bind(this);
        this.rafId = requestAnimationFrame(this.loop);
    }

    enterHowToPhase() {
        this.phase = 'howto';
        this.ctx.controller.setLayout('dpad', {
            title: 'Connect 4',
            subtitle: 'Press A to Start Match!'
        }, 'all');

        this.ctx.setOverlay(CastOn.tools.howToPlay({
            title: 'How to Play Connect 4',
            subtitle: '2–8 Players · Turn-Based Strategy or Blitz Chaos',
            steps: [
                { icon: '◀ ▶', title: '1. Aim Your Column', text: 'Use Left & Right on your D-Pad to aim your disc above any column on the giant grid.' },
                { icon: '🔴', title: '2. Drop & Connect 4', text: 'Press A (or Down) to drop your disc. Connect 4 of your discs horizontally, vertically, or diagonally!' },
                { icon: '🛡️', title: '3. Block Opponents', text: 'Cutting off an opponent\'s 3-in-a-row awards a +120 pt defensive block bonus.' },
                { icon: '⚡', title: '4. Switch Modes Anytime', text: 'The room leader can press X to toggle between Turn-Based (10s shot clock) and simultaneous Blitz mode!' }
            ],
            controls: [
                { key: '◀ ▶', label: 'Aim Column' },
                { key: 'A / ▼', label: 'Drop Disc / Start' },
                { key: 'X', label: 'Toggle Blitz Mode' }
            ],
            footerText: 'Press A on your phone controller to start the match!'
        }));
    }

    getScale() {
        const v = this.ctx.view || { w: 1280, h: 720, scale: 1 };
        return (typeof v.scale === 'number' && v.scale > 0)
            ? v.scale
            : Math.min(v.w / 1280, v.h / 720) || 1;
    }

    initBoardDimensions() {
        const v = this.ctx.view || { w: 1280, h: 656 };
        const s = this.getScale();
        const availW = Math.max(400, v.w - 28 * s);
        const availH = Math.max(240, v.h - 122 * s);

        // Target ~64px per slot at 1280x720 reference scale so slots are large, crisp, and fill the screen
        const targetCell = 64 * s;
        this.rows = Math.max(7, Math.min(10, Math.round(availH / targetCell)));
        this.cols = Math.max(12, Math.min(22, Math.round(this.rows * (availW / availH))));
    }

    resetBoard(announce) {
        this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
        this.fallingDiscs = [];
        this.particles = [];
        this.lastMove = null;
        this.winningLine = null;
        this.winner = null;
        this.isDraw = false;
        this.ended = false;
        this.resultsShown = false;
        this.winCelebrationUntil = 0;
        this.screenShake = 0;
        this.turnStartedAt = performance.now();
        this.lastTickSec = -1;

        this.ctx.setOverlay('');

        const ids = this.getActivePlayerIds();
        ids.forEach((id, i) => {
            if (this.playerState[id]) {
                this.playerState[id].col = Math.floor(((i + 0.5) / Math.max(1, ids.length)) * this.cols);
                this.playerState[id].cooldownUntil = 0;
                this.playerState[id].pieces = 0;
                this.playerState[id].blocks = 0;
                this.playerState[id].bestChain = 0;
            }
        });

        if (announce) {
            this.ctx.sound.chord([440, 554, 659], 110, 'triangle');
            this.updateControllerLayouts();
        }
    }

    getAllParticipants() {
        const realPlayers = Object.assign({}, this.ctx.players || {});
        const keys = Object.keys(realPlayers);
        if (keys.length === 1) {
            const p0 = realPlayers[keys[0]];
            const botColor = (p0 && p0.color && p0.color.toLowerCase() === '#f43f5e') ? '#10b981' : '#f43f5e';
            realPlayers[BOT_FALLBACK.id] = Object.assign({}, BOT_FALLBACK, { color: botColor });
        }
        return realPlayers;
    }

    getActivePlayerIds() {
        return Object.keys(this.getAllParticipants());
    }

    syncPlayers() {
        const participants = this.getAllParticipants();
        const ids = Object.keys(participants);

        ids.forEach((id, idx) => {
            if (!this.playerState[id]) {
                const startCol = Math.min(this.cols - 1, Math.max(0, Math.floor(((idx + 0.5) / Math.max(1, ids.length)) * this.cols)));
                this.playerState[id] = {
                    col: startCol,
                    heldDir: 0,
                    nextMoveAt: 0,
                    cooldownUntil: 0,
                    pieces: 0,
                    blocks: 0,
                    bestChain: 0,
                    botThinkUntil: performance.now() + 750,
                    humanInteracted: false
                };
            }
            if (this.scores[id] === undefined) {
                this.scores[id] = 0;
            }
        });

        Object.keys(this.playerState).forEach(id => {
            if (!participants[id]) {
                delete this.playerState[id];
            }
        });

        this.turnOrder = ids;
        if (this.turnIndex >= this.turnOrder.length) {
            this.turnIndex = 0;
        }
    }

    onPlayersSync() {
        this.syncPlayers();
        if (this.phase !== 'howto') {
            this.updateControllerLayouts();
        }
    }

    onResize(view) {
        // Logical grid stays intact; geometry scales dynamically in computeBoardLayout()
    }

    updateControllerLayouts() {
        const participants = this.getAllParticipants();
        const activeId = this.getCurrentTurnPlayerId();
        const activePlayer = participants[activeId];
        const modeLabel = this.mode === 'turns' ? 'Switch to Blitz' : 'Switch to Turns';
        const extras = [
            { button: 'X', label: modeLabel },
            { button: 'Y', label: 'Reset Board' }
        ];

        if (this.mode === 'blitz') {
            this.ctx.controller.setLayout('dpad', {
                title: '⚡ Connect 4 — Blitz Mode!',
                subtitle: '◀ ▶ Aim Column · A or ▼ Drop Disc · First to Connect 4 wins!',
                extras: extras
            }, 'all');
            return;
        }

        const waitingTitle = activePlayer
            ? `⏳ ${activePlayer.name}'s Turn`
            : 'Connect 4';
        this.ctx.controller.setLayout('dpad', {
            title: waitingTitle,
            subtitle: '◀ ▶ Pre-aim your column anytime · Press A when it is your turn!',
            extras: extras
        }, 'all');

        if (activeId && !activeId.startsWith('__bot') && this.ctx.players[activeId]) {
            this.ctx.controller.setLayout('dpad', {
                title: '🟢 YOUR TURN! Drop a Disc',
                subtitle: '◀ ▶ Choose Column · Press A (or ▼) to Drop!',
                extras: extras
            }, activeId);
        }
    }

    getCurrentTurnPlayerId() {
        if (!this.turnOrder.length) return null;
        return this.turnOrder[this.turnIndex % this.turnOrder.length];
    }

    advanceTurn() {
        if (!this.turnOrder.length) return;
        this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
        this.turnStartedAt = performance.now();
        this.lastTickSec = -1;
        const nextId = this.getCurrentTurnPlayerId();
        if (nextId && this.playerState[nextId]) {
            this.playerState[nextId].botThinkUntil = performance.now() + 650 + Math.random() * 450;
        }
        if (nextId && this.ctx.players[nextId]) {
            this.ctx.controller.vibrate(35, nextId);
        }
        this.updateControllerLayouts();
    }

    moveColumn(playerId, delta) {
        const st = this.playerState[playerId];
        if (!st || this.winningLine || this.isDraw) return;
        st.col = (st.col + delta + this.cols) % this.cols;
        this.ctx.sound.tone(480 + st.col * 14, 35, 'sine');
    }

    getLowestEmptyRow(col) {
        for (let r = this.rows - 1; r >= 0; r--) {
            if (!this.grid[r][col]) return r;
        }
        return -1;
    }

    attemptDrop(playerId) {
        if (this.winningLine || this.isDraw || this.ended) return false;
        const participants = this.getAllParticipants();
        const player = participants[playerId];
        const st = this.playerState[playerId];
        if (!player || !st) return false;

        const now = performance.now();

        if (this.mode === 'turns') {
            const activeId = this.getCurrentTurnPlayerId();
            if (playerId !== activeId) {
                this.ctx.sound.tone(210, 60, 'sawtooth');
                return false;
            }
        } else {
            if (now < st.cooldownUntil) {
                this.ctx.sound.tone(240, 50, 'sawtooth');
                return false;
            }
        }

        const col = st.col;
        const targetRow = this.getLowestEmptyRow(col);

        if (targetRow === -1) {
            this.ctx.sound.fail();
            return false;
        }

        return this.commitDrop(playerId, col, targetRow);
    }

    commitDrop(playerId, col, targetRow) {
        const participants = this.getAllParticipants();
        const player = participants[playerId];
        const st = this.playerState[playerId];
        if (!player || !st) return false;

        const now = performance.now();
        st.cooldownUntil = now + BLITZ_COOLDOWN_MS;
        st.pieces = (st.pieces || 0) + 1;

        const blockedOpponent = this.wouldCompleteFourForOther(targetRow, col, playerId);

        const cellData = {
            playerId: playerId,
            color: player.color || '#38bdf8',
            avatar: player.avatar || '🎮',
            name: player.name || 'Player',
            placedAt: now
        };

        this.grid[targetRow][col] = cellData;
        this.lastMove = { r: targetRow, c: col, playerId: playerId };

        this.fallingDiscs.push({
            r: targetRow,
            c: col,
            currRow: -1.1,
            velRow: 0,
            bounces: 0,
            color: cellData.color,
            avatar: cellData.avatar,
            playerId: playerId,
            done: false
        });

        this.ctx.sound.tone(340 + (this.rows - targetRow) * 28, 75, 'triangle');

        const chainInfo = this.CheckBestLineAt(targetRow, col, playerId);
        st.bestChain = Math.max(st.bestChain || 0, chainInfo.maxLen);
        let movePts = 25 + Math.max(0, (chainInfo.maxLen - 1) * 40);
        if (blockedOpponent) {
            st.blocks = (st.blocks || 0) + 1;
            movePts += 120;
        }
        if (this.scores[playerId] !== undefined) {
            this.scores[playerId] += movePts;
        }

        if (chainInfo.winningCells && chainInfo.winningCells.length >= 4) {
            this.winningLine = chainInfo.winningCells;
            this.winner = player;
            this.scores[playerId] = (this.scores[playerId] || 0) + 1000;
            this.winCelebrationUntil = now + 3000;
            this.screenShake = 12;
            this.ctx.sound.fanfare();
            this.ctx.controller.vibrate(180, 'all');
            this.spawnWinParticles();
            return true;
        }

        if (this.isBoardFull()) {
            this.isDraw = true;
            this.winCelebrationUntil = now + 2400;
            this.ctx.sound.chord([330, 293, 261], 180, 'sawtooth');
            return true;
        }

        if (this.mode === 'turns') {
            this.advanceTurn();
        }
        return true;
    }

    isBoardFull() {
        for (let c = 0; c < this.cols; c++) {
            if (!this.grid[0][c]) return false;
        }
        return true;
    }

    wouldCompleteFourForOther(r, c, myPlayerId) {
        const participants = this.getAllParticipants();
        for (const otherId of Object.keys(participants)) {
            if (otherId === myPlayerId) continue;
            const info = this.CheckBestLineAt(r, c, otherId);
            if (info.maxLen >= 4) return true;
        }
        return false;
    }

    CheckBestLineAt(r, c, playerId) {
        const dirs = [
            { dr: 0, dc: 1 },
            { dr: 1, dc: 0 },
            { dr: 1, dc: 1 },
            { dr: 1, dc: -1 }
        ];

        let maxLen = 1;
        let winningCells = null;

        for (const { dr, dc } of dirs) {
            const cells = [{ r, c }];

            for (let step = 1; step < 8; step++) {
                const nr = r + dr * step;
                const nc = c + dc * step;
                if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) break;
                const cell = this.grid[nr][nc];
                if (cell && cell.playerId === playerId) {
                    cells.push({ r: nr, c: nc });
                } else {
                    break;
                }
            }

            for (let step = 1; step < 8; step++) {
                const nr = r - dr * step;
                const nc = c - dc * step;
                if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) break;
                const cell = this.grid[nr][nc];
                if (cell && cell.playerId === playerId) {
                    cells.unshift({ r: nr, c: nc });
                } else {
                    break;
                }
            }

            if (cells.length > maxLen) {
                maxLen = cells.length;
            }
            if (cells.length >= 4 && (!winningCells || cells.length > winningCells.length)) {
                winningCells = cells;
            }
        }

        return { maxLen, winningCells };
    }

    /* ---------- Smart Bot AI (for solo play or idle demo seats) ----------- */

    chooseBestBotColumn(botId) {
        const validCols = [];
        for (let c = 0; c < this.cols; c++) {
            const r = this.getLowestEmptyRow(c);
            if (r !== -1) validCols.push({ c, r });
        }
        if (!validCols.length) return 0;

        for (const { c, r } of validCols) {
            if (this.CheckBestLineAt(r, c, botId).maxLen >= 4) return c;
        }

        const participants = this.getAllParticipants();
        for (const { c, r } of validCols) {
            for (const otherId of Object.keys(participants)) {
                if (otherId === botId) continue;
                if (this.CheckBestLineAt(r, c, otherId).maxLen >= 4) return c;
            }
        }

        let bestScore = -Infinity;
        let bestCandidates = [];

        for (const { c, r } of validCols) {
            let score = 0;
            const myChain = this.CheckBestLineAt(r, c, botId).maxLen;
            score += myChain * myChain * 12;

            for (const otherId of Object.keys(participants)) {
                if (otherId === botId) continue;
                const oppChain = this.CheckBestLineAt(r, c, otherId).maxLen;
                if (oppChain === 3) score += 85;
                else if (oppChain === 2) score += 18;
            }

            if (r > 0) {
                for (const otherId of Object.keys(participants)) {
                    if (otherId === botId) continue;
                    if (this.CheckBestLineAt(r - 1, c, otherId).maxLen >= 4) {
                        score -= 200;
                    }
                }
            }

            const centerBias = 1 - Math.abs(c - (this.cols - 1) / 2) / (this.cols / 2);
            score += centerBias * 4 + Math.random() * 6;

            if (score > bestScore) {
                bestScore = score;
                bestCandidates = [c];
            } else if (Math.abs(score - bestScore) < 2) {
                bestCandidates.push(c);
            }
        }

        return bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
    }

    updateBotsAndTimers(now) {
        if (this.phase === 'howto' || this.winningLine || this.isDraw || this.ended) return;

        const participants = this.getAllParticipants();

        for (const [id, st] of Object.entries(this.playerState)) {
            if (st.heldDir !== 0 && now >= st.nextMoveAt) {
                this.moveColumn(id, st.heldDir);
                st.nextMoveAt = now + REPEAT_INTERVAL_MS;
            }
        }

        if (this.mode === 'turns') {
            const activeId = this.getCurrentTurnPlayerId();
            if (!activeId) return;
            const activePlayer = participants[activeId];
            const st = this.playerState[activeId];
            if (!activePlayer || !st) return;

            const remMs = Math.max(0, TURN_TIME_MS - (now - this.turnStartedAt));
            const remSec = Math.ceil(remMs / 1000);

            // Subtle audio tick during the final 3 seconds of a human turn
            const isAutoBot = activePlayer.__bot || (activePlayer.__demo && !activePlayer.is_vip && !st.humanInteracted);
            if (!isAutoBot && remSec <= 3 && remSec >= 1 && remSec !== this.lastTickSec) {
                this.lastTickSec = remSec;
                this.ctx.sound.tone(remSec === 1 ? 880 : 660, 55, 'sine');
            }

            if (isAutoBot && now >= (st.botThinkUntil || 0)) {
                const targetCol = this.chooseBestBotColumn(activeId);
                if (st.col !== targetCol) {
                    const diff = targetCol - st.col;
                    st.col += Math.sign(diff);
                    st.botThinkUntil = now + 95;
                    this.ctx.sound.tone(480 + st.col * 14, 25, 'sine');
                } else {
                    this.attemptDrop(activeId);
                }
                return;
            }

            if (now - this.turnStartedAt >= TURN_TIME_MS) {
                let row = this.getLowestEmptyRow(st.col);
                if (row === -1) {
                    for (let offset = 1; offset < this.cols; offset++) {
                        const cRight = (st.col + offset) % this.cols;
                        row = this.getLowestEmptyRow(cRight);
                        if (row !== -1) {
                            st.col = cRight;
                            break;
                        }
                    }
                }
                if (row !== -1) {
                    this.commitDrop(activeId, st.col, row);
                } else {
                    this.advanceTurn();
                }
            }
        } else {
            for (const [id, p] of Object.entries(participants)) {
                const st = this.playerState[id];
                if (!st) continue;
                const isAutoBot = p.__bot || (p.__demo && !p.is_vip && !st.humanInteracted);
                if (!isAutoBot) continue;

                if (now >= Math.max(st.cooldownUntil + 350, st.botThinkUntil || 0)) {
                    const targetCol = this.chooseBestBotColumn(id);
                    if (st.col !== targetCol) {
                        st.col += Math.sign(targetCol - st.col);
                        st.botThinkUntil = now + 130;
                    } else {
                        this.attemptDrop(id);
                        st.botThinkUntil = now + BLITZ_COOLDOWN_MS + 400 + Math.random() * 700;
                    }
                }
            }
        }
    }

    /* ---------- Controller Input ------------------------------------------ */

    onInput(playerId, data) {
        if (!this.running) return;

        if (this.phase === 'howto') {
            if (data.action === 'btn' && data.state === 'down' && (data.button === 'A' || data.button === 'B')) {
                this.phase = 'play';
                this.turnStartedAt = performance.now();
                this.lastTickSec = -1;
                Object.values(this.playerState).forEach(st => {
                    st.botThinkUntil = performance.now() + 850;
                });
                this.ctx.setOverlay('');
                this.updateControllerLayouts();
                this.ctx.sound.chord([523, 659, 784], 100, 'triangle');
            }
            return;
        }

        const isVip = !this.ctx.vipId || playerId === this.ctx.vipId;
        if (data.action === 'btn' && data.state === 'down' && isVip) {
            if (data.button === 'X' && !this.ended) {
                this.mode = this.mode === 'turns' ? 'blitz' : 'turns';
                this.turnStartedAt = performance.now();
                this.lastTickSec = -1;
                this.modeBannerUntil = performance.now() + 1800;
                this.ctx.sound.chord(this.mode === 'blitz' ? [523, 659, 784] : [659, 523], 100, 'triangle');
                this.updateControllerLayouts();
                return;
            }
            if (data.button === 'Y') {
                this.resetBoard(true);
                return;
            }
        }

        if (this.winningLine || this.isDraw || this.ended) return;

        this.syncPlayers();
        const st = this.playerState[playerId];
        if (!st) return;
        st.humanInteracted = true;

        const now = performance.now();

        if (data.action === 'btn') {
            if (data.state === 'down') {
                if (data.button === 'LEFT') {
                    this.moveColumn(playerId, -1);
                    st.heldDir = -1;
                    st.nextMoveAt = now + REPEAT_INITIAL_MS;
                } else if (data.button === 'RIGHT') {
                    this.moveColumn(playerId, 1);
                    st.heldDir = 1;
                    st.nextMoveAt = now + REPEAT_INITIAL_MS;
                } else if (data.button === 'A' || data.button === 'B' || data.button === 'DOWN') {
                    this.attemptDrop(playerId);
                }
            } else if (data.state === 'up') {
                if ((data.button === 'LEFT' && st.heldDir === -1) ||
                    (data.button === 'RIGHT' && st.heldDir === 1)) {
                    st.heldDir = 0;
                }
            }
        } else if (data.action === 'joystick') {
            if (!data.active || Math.abs(data.x) < 0.36) {
                st.heldDir = 0;
            } else {
                const dir = data.x < 0 ? -1 : 1;
                if (st.heldDir !== dir) {
                    this.moveColumn(playerId, dir);
                    st.heldDir = dir;
                    st.nextMoveAt = now + REPEAT_INITIAL_MS;
                }
            }
        }
    }

    /* ---------- Layout & Rendering ---------------------------------------- */

    computeBoardLayout(view) {
        const s = this.getScale();
        const padX = 14 * s;
        const topHudH = 64 * s;     // Top dashboard with pill elements
        const dropZoneH = 34 * s;   // Column dropper track above the board
        const botBarH = 40 * s;     // Dedicated bottom controls legend bar with generous padding

        const boardX = padX;
        const boardY = topHudH + dropZoneH;
        const boardW = Math.max(200, view.w - padX * 2);
        const boardH = Math.max(150, view.h - boardY - botBarH);

        const cellW = boardW / this.cols;
        const cellH = boardH / this.rows;
        const slotR = Math.max(6, Math.min(cellW, cellH) * 0.425);

        return {
            s,
            padX,
            topHudH,
            dropZoneH,
            botBarH,
            boardX,
            boardY,
            boardW,
            boardH,
            cellW,
            cellH,
            slotR,
            colCenterX: (c) => boardX + (c + 0.5) * cellW,
            rowCenterY: (r) => boardY + (r + 0.5) * cellH
        };
    }

    spawnWinParticles() {
        if (!this.winningLine) return;
        const view = this.ctx.view || { w: 1280, h: 656 };
        const layout = this.computeBoardLayout(view);
        const s = layout.s;

        for (const cell of this.winningLine) {
            const cx = layout.colCenterX(cell.c);
            const cy = layout.rowCenterY(cell.r);
            const entry = this.grid[cell.r][cell.c];
            const color = (entry && entry.color) || '#fbbf24';

            for (let i = 0; i < 24; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = (2.5 + Math.random() * 7.5) * s;
                this.particles.push({
                    x: cx,
                    y: cy,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 1.5 * s,
                    r: (3 + Math.random() * 4.5) * s,
                    color: i % 3 === 0 ? '#fde047' : (i % 3 === 1 ? '#ffffff' : color),
                    alpha: 1,
                    decay: 0.014 + Math.random() * 0.015
                });
            }
        }
    }

    drawDisc(g, cx, cy, r, color, avatar, alpha, s) {
        g.save();
        if (alpha != null && alpha < 1) g.globalAlpha = alpha;

        this.ctx.graphics.circle(g, cx, cy, r);
        g.fillStyle = color;
        g.fill();

        const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
        grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.0)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
        this.ctx.graphics.circle(g, cx, cy, r);
        g.fillStyle = grad;
        g.fill();

        this.ctx.graphics.circle(g, cx, cy, r * 0.78);
        g.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        g.lineWidth = Math.max(1, 1.5 * s);
        g.stroke();

        this.ctx.graphics.circle(g, cx, cy, r);
        g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        g.lineWidth = Math.max(1, 1.6 * s);
        g.stroke();

        if (avatar) {
            if (typeof avatar === 'string' && (avatar.startsWith('data:image/') || avatar.startsWith('http') || avatar.startsWith('/'))) {
                const img = getAvatarImg(avatar);
                if (img && img.complete && img.naturalWidth > 0) {
                    const ir = r * 0.64;
                    g.save();
                    this.ctx.graphics.circle(g, cx, cy, ir);
                    g.clip();
                    g.drawImage(img, cx - ir, cy - ir, ir * 2, ir * 2);
                    g.restore();
                }
            } else {
                g.font = `700 ${Math.round(r * 0.88)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.fillStyle = '#ffffff';
                g.fillText(avatar, cx, cy + r * 0.04);
            }
        }

        g.restore();
    }

    /**
     * Draw a pill container (radius = h / 2)
     */
    drawPill(g, x, y, w, h, fillStyle, strokeStyle, lineWidth) {
        this.ctx.graphics.roundRect(g, x, y, w, h, h / 2);
        if (fillStyle) {
            g.fillStyle = fillStyle;
            g.fill();
        }
        if (strokeStyle) {
            g.strokeStyle = strokeStyle;
            g.lineWidth = lineWidth || 1;
            g.stroke();
        }
    }

    /**
     * Structured Top Dashboard:
     *   1. Left: Single game mode pill (without redundant X button)
     *   2. Center: Prominent Circular Shot Clock containing active player's avatar inside with name on top
     *   3. Right: Player pills with avatar, name, and 4-dot chain progress circles
     */
    drawTopHud(g, view, layout, now) {
        const s = layout.s;
        const th = CastOn.tools.theme();
        const participants = this.getAllParticipants();
        const ids = Object.keys(participants);
        const padX = layout.boardX;
        const hudY = 10 * s;
        const hudH = 46 * s;

        /* =================================================================
           ZONE 1 (LEFT): GAME MODE PILL
           ================================================================= */
        const isTurns = this.mode === 'turns';
        const modeLabel = isTurns ? '🎯 TURN-BASED' : '⚡ BLITZ CHAOS';
        g.font = `700 ${Math.round(12.5 * s)}px "Space Grotesk", sans-serif`;
        const modePillW = g.measureText(modeLabel).width + 36 * s;
        const modePillH = 36 * s;
        const modePillY = hudY + (hudH - modePillH) / 2;

        this.drawPill(
            g,
            padX,
            modePillY,
            modePillW,
            modePillH,
            isTurns ? (th.panel || 'rgba(37, 99, 235, 0.22)') : 'rgba(217, 119, 6, 0.22)',
            isTurns ? (th.accent || '#3b82f6') : '#f59e0b',
            1.6 * s
        );

        this.ctx.graphics.label(modeLabel, padX + modePillW / 2, modePillY + modePillH / 2, {
            size: Math.round(12.5 * s),
            weight: 700,
            color: isTurns ? (th.accent || '#93c5fd') : '#fde047'
        });

        /* =================================================================
           ZONE 2 (CENTER): UNIFIED TURN SPOTLIGHT PILL WITH TIMER CIRCLE
           ================================================================= */
        const centerX = view.w / 2;

        if (this.winningLine && this.winner) {
            const winPillW = 320 * s;
            const winPillH = 38 * s;
            const winPillY = hudY + (hudH - winPillH) / 2;
            this.drawPill(g, centerX - winPillW / 2, winPillY, winPillW, winPillH, 'rgba(234, 179, 8, 0.22)', '#fde047', 2 * s);
            this.drawDisc(g, centerX - winPillW / 2 + 20 * s, winPillY + winPillH / 2, 13 * s, this.winner.color, this.winner.avatar, 1, s);
            this.ctx.graphics.label(
                `🏆 ${this.winner.name.toUpperCase()} CONNECTS 4!`,
                centerX + 10 * s,
                winPillY + winPillH / 2,
                { size: Math.round(14 * s), weight: 700, color: '#fde047' }
            );
        } else if (this.isDraw) {
            const drawPillW = 280 * s;
            const drawPillH = 38 * s;
            const drawPillY = hudY + (hudH - drawPillH) / 2;
            this.drawPill(g, centerX - drawPillW / 2, drawPillY, drawPillW, drawPillH, 'rgba(30, 41, 59, 0.85)', '#94a3b8', 1.5 * s);
            this.ctx.graphics.label(
                'BOARD FULL — DRAW GAME!',
                centerX,
                drawPillY + drawPillH / 2,
                { size: Math.round(14 * s), weight: 700, color: '#f8fafc' }
            );
        } else if (isTurns) {
            const activeId = this.getCurrentTurnPlayerId();
            const activeP = participants[activeId];
            const elapsed = Math.max(0, now - this.turnStartedAt);
            const remMs = Math.max(0, TURN_TIME_MS - elapsed);
            const pct = Math.max(0, Math.min(1, remMs / TURN_TIME_MS));
            const remSec = Math.ceil(remMs / 1000);

            let timerColor = '#10b981';
            if (remSec <= 3) timerColor = '#f43f5e';
            else if (remSec <= 5) timerColor = '#f59e0b';

            const isUrgent = remSec <= 3;
            const urgentPulse = isUrgent ? (0.5 + 0.5 * Math.sin(now * 0.02)) : 0;

            if (activeP) {
                const turnH = 40 * s;
                const turnY = hudY + (hudH - turnH) / 2;
                const turnMidY = turnY + turnH / 2;
                const pillR = turnH / 2; // Radius of pill end caps (20*s)

                const nameText = `${activeP.name}'s Turn`;
                g.font = `700 ${Math.round(14 * s)}px "Space Grotesk", sans-serif`;
                const nameW = g.measureText(nameText).width;

                const circleR = 14.5 * s; // Inset of 5.5*s from outer pill cap
                const secBadgeH = circleR * 2; // 29*s, matching the timer's vertical extent and 5.5*s inset
                const secBadgeR = secBadgeH / 2; // 14.5*s
                const secBadgeW = 38 * s;
                const gap = 12 * s;

                // Relative offsets from startX:
                // circleCxRel = pillR (left arc center)
                // Right arc center will be at startX + totalW - pillR
                // Right badge's right semicircular cap has center at startX + totalW - pillR!
                // So secX + secBadgeW - secBadgeR = totalW - pillR => secX = totalW - pillR - secBadgeW + secBadgeR
                // And totalW:
                const circleCxRel = pillR;
                const nameLeftRel = circleCxRel + circleR + gap;
                const secLeftRel = nameLeftRel + nameW + gap;
                const totalW = secLeftRel + (secBadgeW - secBadgeR) + pillR;
                const startX = centerX - totalW / 2;

                // Main unified spotlight pill
                this.drawPill(
                    g,
                    startX,
                    turnY,
                    totalW,
                    turnH,
                    isUrgent ? 'rgba(225, 29, 72, 0.25)' : (th.panel || 'rgba(15, 23, 42, 0.88)'),
                    isUrgent ? '#f43f5e' : (activeP.color || th.accent || '#3b82f6'),
                    isUrgent ? 2 * s : 1.4 * s
                );

                // 1. Left: Concentric circular timer with avatar inside
                const circleCx = startX + circleCxRel;
                const circleCy = turnMidY;

                // Track ring
                this.ctx.graphics.circle(g, circleCx, circleCy, circleR);
                g.fillStyle = 'rgba(2, 6, 23, 0.9)';
                g.fill();
                g.strokeStyle = 'rgba(148, 163, 184, 0.25)';
                g.lineWidth = 2.8 * s;
                g.stroke();

                // Draining progress arc
                g.beginPath();
                g.arc(circleCx, circleCy, circleR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct, false);
                g.strokeStyle = timerColor;
                g.lineWidth = 3.2 * s;
                g.lineCap = 'round';
                g.stroke();

                // Player avatar inside circle
                this.drawDisc(g, circleCx, circleCy, circleR * 0.72, activeP.color, activeP.avatar, 1, s);

                // 2. Middle: Player name
                const nameX = startX + nameLeftRel;
                this.ctx.graphics.label(nameText, nameX, turnMidY, {
                    size: Math.round(14 * s),
                    weight: 700,
                    color: '#ffffff',
                    align: 'left'
                });

                // 3. Right: Concentric countdown pill
                const secX = startX + secLeftRel;
                const secY = turnMidY - secBadgeH / 2;

                this.drawPill(
                    g,
                    secX,
                    secY,
                    secBadgeW,
                    secBadgeH,
                    isUrgent ? '#e11d48' : 'rgba(2, 6, 23, 0.9)',
                    timerColor,
                    1.4 * s
                );

                const numScale = isUrgent ? (1 + urgentPulse * 0.12) : 1;
                this.ctx.graphics.label(`${remSec}s`, secX + secBadgeW / 2, turnMidY, {
                    size: Math.round(12 * s * numScale),
                    weight: 700,
                    color: '#ffffff'
                });
            }
        } else {
            // Blitz Free-For-All center info pill
            let threatPlayer = null;
            for (const id of ids) {
                const st = this.playerState[id];
                if (st && st.bestChain >= 3) {
                    threatPlayer = participants[id];
                    break;
                }
            }

            const blitzPillW = 340 * s;
            const blitzPillH = 36 * s;
            const blitzPillY = hudY + (hudH - blitzPillH) / 2;

            if (threatPlayer) {
                this.drawPill(g, centerX - blitzPillW / 2, blitzPillY, blitzPillW, blitzPillH, 'rgba(180, 83, 9, 0.3)', '#fbbf24', 1.8 * s);
                this.ctx.graphics.label(`⚠️ ${threatPlayer.name} has 3-in-a-row! Block!`, centerX, blitzPillY + blitzPillH / 2, {
                    size: Math.round(13 * s),
                    weight: 700,
                    color: '#fde047'
                });
            } else {
                this.drawPill(g, centerX - blitzPillW / 2, blitzPillY, blitzPillW, blitzPillH, 'rgba(15, 23, 42, 0.82)', 'rgba(245, 158, 11, 0.5)', 1.5 * s);
                this.ctx.graphics.label('⚡ All players drop simultaneously!', centerX, blitzPillY + blitzPillH / 2, {
                    size: Math.round(13 * s),
                    weight: 700,
                    color: '#f8fafc'
                });
            }
        }

        /* =================================================================
           ZONE 3 (RIGHT): PLAYER PILLS & 4-DOT PROGRESS CIRCLES
           ================================================================= */
        const rightAreaMinX = centerX + 180 * s;
        const availRightW = view.w - padX - rightAreaMinX;
        if (availRightW > 90 * s && ids.length > 0) {
            const maxCards = Math.min(ids.length, Math.max(1, Math.floor(availRightW / (110 * s))));
            const cardGap = 8 * s;
            const cardW = Math.min(136 * s, (availRightW - cardGap * (maxCards - 1)) / maxCards);
            const cardH = 36 * s;
            const cardY = hudY + (hudH - cardH) / 2;
            let currX = view.w - padX - (cardW * maxCards + cardGap * (maxCards - 1));

            for (let i = 0; i < maxCards; i++) {
                const id = ids[i];
                const p = participants[id];
                const st = this.playerState[id] || {};
                const isTurn = isTurns && id === this.getCurrentTurnPlayerId() && !this.winningLine;
                const chain = Math.min(4, st.bestChain || 0);

                this.drawPill(
                    g,
                    currX,
                    cardY,
                    cardW,
                    cardH,
                    isTurn ? (th.boardFrame || 'rgba(30, 58, 138, 0.55)') : (th.panel || 'rgba(15, 23, 42, 0.78)'),
                    isTurn ? p.color : (th.boardBorder || 'rgba(148, 163, 184, 0.28)'),
                    (isTurn ? 2 : 1.2) * s
                );

                this.drawDisc(g, currX + cardH / 2, cardY + cardH / 2, 11 * s, p.color, p.avatar, 1, s);

                g.save();
                g.font = `700 ${Math.round(11 * s)}px "Space Grotesk", sans-serif`;
                let nameStr = p.name || 'Player';
                const maxNameW = cardW - cardH - 12 * s;
                while (nameStr.length > 3 && g.measureText(nameStr).width > maxNameW) {
                    nameStr = nameStr.slice(0, -1);
                }
                g.restore();

                this.ctx.graphics.label(nameStr, currX + cardH + 2 * s, cardY + 11 * s, {
                    size: Math.round(11 * s),
                    weight: 700,
                    color: isTurn ? '#ffffff' : '#cbd5e1',
                    align: 'left'
                });

                // 4-Dot Connect Progress (Circles)
                const dotStartX = currX + cardH + 4 * s;
                const dotY = cardY + 25 * s;
                const dotSpacing = 11 * s;
                for (let d = 0; d < 4; d++) {
                    const filled = d < chain;
                    this.ctx.graphics.circle(g, dotStartX + d * dotSpacing, dotY, 3.4 * s);
                    g.fillStyle = filled ? p.color : 'rgba(148, 163, 184, 0.25)';
                    g.fill();
                    if (filled) {
                        g.strokeStyle = '#ffffff';
                        g.lineWidth = 0.8 * s;
                        g.stroke();
                    }
                }

                currX += cardW + cardGap;
            }
        }
    }

    /**
     * Dedicated Bottom Control Legend Bar with ample top and bottom padding and pill badges
     */
    drawBottomBar(g, view, layout) {
        const s = layout.s;
        const th = CastOn.tools.theme();
        const totalBarH = layout.botBarH;
        const yTop = view.h - totalBarH;
        const pillH = 24 * s;
        const pillY = yTop + (totalBarH - pillH) / 2;

        const items = [
            { key: '◀ ▶', label: 'Aim Column' },
            { key: 'A', label: 'Drop Disc', accent: '#10b981' },
            { key: 'X', label: this.mode === 'turns' ? 'Switch to Blitz' : 'Switch to Turn-Based', accent: th.accent || '#38bdf8' },
            { key: 'Y', label: 'Reset Board' }
        ];

        g.font = `600 ${Math.round(11.5 * s)}px "Inter", sans-serif`;
        let totalW = 0;
        const measured = items.map(item => {
            g.font = `700 ${Math.round(11 * s)}px "Space Grotesk", sans-serif`;
            const keyW = Math.max(pillH, g.measureText(item.key).width + 14 * s);
            g.font = `600 ${Math.round(11.5 * s)}px "Inter", sans-serif`;
            const labelW = g.measureText(item.label).width;
            const fullPillW = keyW + labelW + 12 * s;
            totalW += fullPillW;
            return { item, keyW, labelW, fullPillW };
        });
        const gap = 16 * s;
        totalW += gap * (items.length - 1);

        let currX = (view.w - totalW) / 2;
        for (const m of measured) {
            // Pill container for each shortcut
            this.drawPill(
                g,
                currX,
                pillY,
                m.fullPillW,
                pillH,
                th.panel || 'rgba(15, 23, 42, 0.72)',
                th.boardBorder || 'rgba(148, 163, 184, 0.28)',
                1.2 * s
            );

            // Circular/pill key bubble inside
            this.drawPill(
                g,
                currX + 2 * s,
                pillY + 2 * s,
                m.keyW - 4 * s,
                pillH - 4 * s,
                m.item.accent || 'rgba(51, 65, 85, 0.95)',
                null,
                0
            );

            this.ctx.graphics.label(m.item.key, currX + 2 * s + (m.keyW - 4 * s) / 2, pillY + pillH / 2, {
                size: Math.round(10.5 * s),
                weight: 700,
                color: m.item.accent ? '#0f172a' : '#f8fafc'
            });

            this.ctx.graphics.label(m.item.label, currX + m.keyW + 4 * s, pillY + pillH / 2, {
                size: Math.round(11.5 * s),
                weight: 600,
                color: '#cbd5e1',
                align: 'left',
                display: false
            });

            currX += m.fullPillW + gap;
        }
    }

    drawColumnCursors(g, layout, now) {
        const s = layout.s;
        const participants = this.getAllParticipants();
        const ids = Object.keys(participants);
        const activeTurnId = this.getCurrentTurnPlayerId();

        const byCol = new Map();
        for (const id of ids) {
            const st = this.playerState[id];
            if (!st) continue;
            if (!byCol.has(st.col)) byCol.set(st.col, []);
            byCol.get(st.col).push(id);
        }

        const cursorCenterY = layout.topHudH + layout.dropZoneH * 0.46;
        const tokenR = Math.min(13.5 * s, layout.slotR * 0.64);

        for (const [col, colPlayerIds] of byCol.entries()) {
            const baseCx = layout.colCenterX(col);
            const count = colPlayerIds.length;
            const spread = Math.min(18 * s, (layout.cellW * 0.72) / Math.max(1, count));

            colPlayerIds.forEach((id, idx) => {
                const p = participants[id];
                const st = this.playerState[id];
                if (!p || !st) return;

                const isTurn = this.mode === 'turns' ? (id === activeTurnId) : (now >= st.cooldownUntil);
                const offsetX = (idx - (count - 1) / 2) * spread;
                const cx = baseCx + offsetX;
                const bob = isTurn ? Math.sin(now * 0.008) * 2.5 * s : 0;
                const cy = cursorCenterY + bob;

                // Downward pointer triangle below token
                g.beginPath();
                g.moveTo(cx - 5 * s, cy + tokenR - 1 * s);
                g.lineTo(cx + 5 * s, cy + tokenR - 1 * s);
                g.lineTo(cx, cy + tokenR + 6 * s);
                g.closePath();
                g.fillStyle = p.color;
                g.fill();

                this.drawDisc(g, cx, cy, tokenR, p.color, p.avatar, isTurn ? 1 : 0.55, s);

                // Subtle active indicator ring in turn mode (without duplicate timer text or duplicate draining ring)
                if (this.mode === 'turns' && id === activeTurnId && !this.winningLine) {
                    this.ctx.graphics.circle(g, cx, cy, tokenR + 3 * s);
                    g.strokeStyle = '#fde047';
                    g.lineWidth = 2 * s;
                    g.stroke();
                } else if (this.mode === 'blitz' && now < st.cooldownUntil) {
                    const pct = 1 - (st.cooldownUntil - now) / BLITZ_COOLDOWN_MS;
                    g.beginPath();
                    g.arc(cx, cy, tokenR + 2.8 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, pct)));
                    g.strokeStyle = '#fde047';
                    g.lineWidth = 2.4 * s;
                    g.stroke();
                }
            });
        }
    }

    endGame() {
        if (this.resultsShown) return;
        this.resultsShown = true;
        this.ended = true;

        const participants = this.getAllParticipants();
        const rows = CastOn.tools.sorted(participants, this.scores);
        const title = this.winner ? `${this.winner.name} Connects 4!` : 'Board Full — Draw!';

        this.ctx.setOverlay(this.ctx.ui.results({
            title: title,
            kicker: 'Connect 4 — Final Standings',
            rows: rows,
            playerCount: rows.length,
            footer: 'Leader: press A for Lobby · press Y to Play Again'
        }));
    }

    loop(now) {
        if (!this.running) return;
        const dt = Math.min(50, Math.max(1, now - this.lastFrame));
        this.lastFrame = now;

        const { ctx: g, view } = this.ctx;
        const layout = this.computeBoardLayout(view);
        const s = layout.s;

        this.updateBotsAndTimers(now);

        // Update falling disc physics
        const hiddenGridCells = new Set();
        for (let i = this.fallingDiscs.length - 1; i >= 0; i--) {
            const fd = this.fallingDiscs[i];
            fd.velRow += 0.0024 * dt;
            fd.currRow += fd.velRow * dt;

            if (fd.currRow >= fd.r) {
                fd.currRow = fd.r;
                if (Math.abs(fd.velRow) > 0.012 && fd.bounces < 2) {
                    fd.velRow = -fd.velRow * 0.32;
                    fd.bounces++;
                    this.ctx.sound.pop();
                } else {
                    this.fallingDiscs.splice(i, 1);
                    continue;
                }
            }
            hiddenGridCells.add(fd.r + ':' + fd.c);
        }

        // Update celebration particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const pt = this.particles[i];
            pt.x += pt.vx;
            pt.y += pt.vy;
            pt.vy += 0.18 * s;
            pt.alpha -= pt.decay;
            if (pt.alpha <= 0) this.particles.splice(i, 1);
        }

        if ((this.winningLine || this.isDraw) && !this.resultsShown && now >= this.winCelebrationUntil) {
            this.endGame();
        }

        // 1. Arena backdrop
        g.save();
        if (this.screenShake > 0.2) {
            const sx = (Math.random() - 0.5) * this.screenShake * s;
            const sy = (Math.random() - 0.5) * this.screenShake * s;
            g.translate(sx, sy);
            this.screenShake *= 0.88;
        }
        this.ctx.graphics.arenaBackdrop(view);

        // 2. Top 3-Zone Dashboard & Column Drop Cursors
        const th = CastOn.tools.theme();
        this.drawTopHud(g, view, layout, now);
        this.drawColumnCursors(g, layout, now);

        // 3. Board Frame filling the screen space
        const frameR = 14 * s;
        this.ctx.graphics.roundRect(g, layout.boardX, layout.boardY, layout.boardW, layout.boardH, frameR);
        const boardGrad = g.createLinearGradient(layout.boardX, layout.boardY, layout.boardX, layout.boardY + layout.boardH);
        boardGrad.addColorStop(0, th.boardFrame || 'rgba(30, 58, 138, 0.72)');
        boardGrad.addColorStop(1, th.panel || 'rgba(15, 23, 42, 0.88)');
        g.fillStyle = boardGrad;
        g.fill();

        g.strokeStyle = th.boardBorder || 'rgba(96, 165, 250, 0.35)';
        g.lineWidth = 2 * s;
        g.stroke();

        // 4. Highlight targeted columns & ghost landing preview
        const participants = this.getAllParticipants();
        const activeTurnId = this.getCurrentTurnPlayerId();

        if (!this.winningLine && !this.isDraw) {
            for (const [id, st] of Object.entries(this.playerState)) {
                const p = participants[id];
                if (!p) continue;
                const isPrimary = this.mode === 'turns' ? (id === activeTurnId) : true;
                const colX = layout.boardX + st.col * layout.cellW;

                g.fillStyle = isPrimary ? 'rgba(255, 255, 255, 0.055)' : 'rgba(255, 255, 255, 0.02)';
                g.fillRect(colX + 2 * s, layout.boardY + 2 * s, layout.cellW - 4 * s, layout.boardH - 4 * s);

                const landR = this.getLowestEmptyRow(st.col);
                if (landR !== -1 && isPrimary) {
                    const gx = layout.colCenterX(st.col);
                    const gy = layout.rowCenterY(landR);
                    g.save();
                    g.setLineDash([4 * s, 4 * s]);
                    this.ctx.graphics.circle(g, gx, gy, layout.slotR * 0.88);
                    g.strokeStyle = p.color;
                    g.lineWidth = 2 * s;
                    g.globalAlpha = 0.65;
                    g.stroke();
                    g.restore();
                }
            }
        }

        // 5. Draw all slots and settled discs across the screen
        const winSet = new Set(
            (this.winningLine || []).map(cell => cell.r + ':' + cell.c)
        );

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cx = layout.colCenterX(c);
                const cy = layout.rowCenterY(r);
                const key = r + ':' + c;
                const cell = this.grid[r][c];
                const isFalling = hiddenGridCells.has(key);

                this.ctx.graphics.circle(g, cx, cy, layout.slotR);
                g.fillStyle = th.boardInset || 'rgba(4, 9, 20, 0.86)';
                g.fill();

                this.ctx.graphics.circle(g, cx, cy, layout.slotR);
                g.strokeStyle = th.boardBorder || 'rgba(148, 163, 184, 0.22)';
                g.lineWidth = 1.4 * s;
                g.stroke();

                if (r === 0 && (!cell || isFalling)) {
                    this.ctx.graphics.label(String(c + 1), cx, cy, {
                        size: Math.round(layout.slotR * 0.55),
                        weight: 700,
                        color: 'rgba(148, 163, 184, 0.22)'
                    });
                }

                if (cell && !isFalling) {
                    const isWinCell = winSet.has(key);
                    const pulse = isWinCell ? (1 + Math.sin(now * 0.014) * 0.08) : 1;
                    this.drawDisc(
                        g,
                        cx,
                        cy,
                        layout.slotR * 0.94 * pulse,
                        cell.color,
                        cell.avatar,
                        this.winningLine && !isWinCell ? 0.42 : 1,
                        s
                    );

                    if (this.lastMove && this.lastMove.r === r && this.lastMove.c === c && !this.winningLine) {
                        this.ctx.graphics.circle(g, cx, cy, layout.slotR * 0.98);
                        g.strokeStyle = '#ffffff';
                        g.lineWidth = 2.2 * s;
                        g.stroke();
                    }

                    if (isWinCell) {
                        this.ctx.graphics.circle(g, cx, cy, layout.slotR * 1.04 * pulse);
                        g.strokeStyle = '#fde047';
                        g.lineWidth = 3.2 * s;
                        g.stroke();
                    }
                }
            }
        }

        // 6. Draw animated falling discs clipped to the board
        g.save();
        this.ctx.graphics.roundRect(g, layout.boardX, layout.boardY, layout.boardW, layout.boardH, frameR);
        g.clip();
        for (const fd of this.fallingDiscs) {
            const cx = layout.colCenterX(fd.c);
            const cy = layout.rowCenterY(fd.currRow);
            this.drawDisc(g, cx, cy, layout.slotR * 0.94, fd.color, fd.avatar, 1, s);
        }
        g.restore();

        // 7. Draw Winning Connect-4 Laser Beam & Particles
        if (this.winningLine && this.winningLine.length >= 2) {
            const first = this.winningLine[0];
            const last = this.winningLine[this.winningLine.length - 1];
            const x1 = layout.colCenterX(first.c);
            const y1 = layout.rowCenterY(first.r);
            const x2 = layout.colCenterX(last.c);
            const y2 = layout.rowCenterY(last.r);

            g.save();
            g.beginPath();
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);
            g.strokeStyle = 'rgba(253, 224, 71, 0.92)';
            g.lineWidth = 6 * s;
            g.lineCap = 'round';
            g.shadowColor = '#f59e0b';
            g.shadowBlur = 16 * s;
            g.stroke();
            g.restore();
        }

        for (const pt of this.particles) {
            g.save();
            g.globalAlpha = Math.max(0, pt.alpha);
            this.ctx.graphics.circle(g, pt.x, pt.y, pt.r);
            g.fillStyle = pt.color;
            g.fill();
            g.restore();
        }

        // 8. Transient Mode Switch Confirmation Toast
        if (now < this.modeBannerUntil) {
            const bw = 340 * s;
            const bh = 46 * s;
            const bx = (view.w - bw) / 2;
            const by = layout.boardY + 18 * s;
            g.save();
            this.ctx.graphics.roundRect(g, bx, by, bw, bh, 10 * s);
            g.fillStyle = 'rgba(2, 6, 23, 0.92)';
            g.fill();
            g.strokeStyle = this.mode === 'turns' ? '#60a5fa' : '#fbbf24';
            g.lineWidth = 2 * s;
            g.stroke();
            this.ctx.graphics.label(
                this.mode === 'turns' ? '🎯 SWITCHED TO TURN-BASED MODE' : '⚡ SWITCHED TO BLITZ FREE-FOR-ALL',
                bx + bw / 2,
                by + bh / 2,
                { size: Math.round(13.5 * s), weight: 700, color: '#ffffff' }
            );
            g.restore();
        }

        // 9. Bottom Controls Legend Bar
        this.drawBottomBar(g, view, layout);

        g.restore();

        this.rafId = requestAnimationFrame(this.loop);
    }

    destroy() {
        this.running = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
}

CastOn.registerGame({
    id: 'connect4',
    title: 'Connect 4',
    tagline: 'Strategy · Party Grid',
    players: '1–8 players',
    control: 'D-Pad + Drop',
    description: 'Drop your discs into a giant screen-filling grid! Outsmart and block your rivals to be the first to connect 4 in a row.',
    accent: '#10b981',
    icon: 'grid',
    create: (ctx) => new Connect4Game(ctx)
});

})(window);
