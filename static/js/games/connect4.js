/* ==========================================================================
   Game — Connect 4 (Mega Grid Party Edition)
   - Screen-filling slot grid dynamically tailored to fill the TV stage.
   - Multi-player support (2–8 players, plus smart AI bots for solo/demo play).
   - Supports both Turn-Based rotation and Simultaneous Blitz mode (toggle with X).
   - Game lasts until the first player connects 4 horizontally, vertically, or diagonally.
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

        // Board dimensions computed to fill the screen space with slots
        this.cols = 18;
        this.rows = 9;
        this.grid = []; // grid[row][col] = { playerId, color, avatar, name, placedAt } | null

        this.playerState = {}; // playerId -> { col, heldDir, nextMoveAt, cooldownUntil, pieces, blocks, bestChain }
        this.scores = {};
        this.turnOrder = [];
        this.turnIndex = 0;
        this.turnStartedAt = performance.now();

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

        this.initBoardDimensions();
        this.resetBoard(false);
        this.syncPlayers();
        this.updateControllerLayouts();

        this.ctx.sound.fanfare();

        this.loop = this.loop.bind(this);
        this.rafId = requestAnimationFrame(this.loop);
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
        const availW = Math.max(400, v.w - 24 * s);
        const availH = Math.max(240, v.h - 76 * s);

        // Target ~62px per slot at 1280x720 reference scale so slots are large, crisp, and fill the screen
        const targetCell = 62 * s;
        this.rows = Math.max(7, Math.min(11, Math.round(availH / targetCell)));
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
            // Add a rival bot if only 1 player is in the room so solo play works immediately
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
        this.updateControllerLayouts();
    }

    onResize(view) {
        // Logical grid stays intact; geometry scales dynamically in computeLayout()
    }

    updateControllerLayouts() {
        const participants = this.getAllParticipants();
        const activeId = this.getCurrentTurnPlayerId();
        const activePlayer = participants[activeId];
        const modeLabel = this.mode === 'turns' ? 'Mode: Blitz' : 'Mode: Turns';
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

        // Turn-based mode: give general layout, then customize active player's status
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

        let col = st.col;
        let targetRow = this.getLowestEmptyRow(col);

        // If the chosen column is full, sound an error buzzer (or if turn timeout, pick nearest open column)
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

        // Check if this placement blocked an opponent's 3-in-a-row threat!
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

        // Spawn smooth falling disc animation
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

        // Score calculation for leaderboard engagement
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

        // Check if this player connected 4!
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

        // Check if the entire board is full (draw)
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
            { dr: 0, dc: 1 },  // Horizontal
            { dr: 1, dc: 0 },  // Vertical
            { dr: 1, dc: 1 },  // Diagonal \
            { dr: 1, dc: -1 }  // Diagonal /
        ];

        let maxLen = 1;
        let winningCells = null;

        for (const { dr, dc } of dirs) {
            const cells = [{ r, c }];

            // Forward
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

            // Backward
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

        // 1. Can bot win immediately?
        for (const { c, r } of validCols) {
            if (this.CheckBestLineAt(r, c, botId).maxLen >= 4) return c;
        }

        // 2. Must bot block an opponent from winning on their next drop?
        const participants = this.getAllParticipants();
        for (const { c, r } of validCols) {
            for (const otherId of Object.keys(participants)) {
                if (otherId === botId) continue;
                if (this.CheckBestLineAt(r, c, otherId).maxLen >= 4) return c;
            }
        }

        // 3. Score heuristic: build 3-in-a-row / 2-in-a-row or block opponent's 3-in-a-row
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

            // Avoid giving an opponent a winning slot directly above (r - 1, c)
            if (r > 0) {
                for (const otherId of Object.keys(participants)) {
                    if (otherId === botId) continue;
                    if (this.CheckBestLineAt(r - 1, c, otherId).maxLen >= 4) {
                        score -= 200;
                    }
                }
            }

            // Slight preference for columns near existing pieces or center
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
        if (this.winningLine || this.isDraw || this.ended) return;

        const participants = this.getAllParticipants();

        // Handle held directional auto-repeat for all players
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

            // Check if this seat is an AI bot or a non-VIP demo player
            const isAutoBot = activePlayer.__bot || (activePlayer.__demo && !activePlayer.is_vip && !st.humanInteracted);

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

            // Turn shot clock expiration: auto-drop in current or nearest open column
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
            // Blitz mode: let AI bots & non-VIP demo seats play at a fun pace
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

        // Leader shortcuts (X = toggle Turn/Blitz mode, Y = reset board)
        const isVip = !this.ctx.vipId || playerId === this.ctx.vipId;
        if (data.action === 'btn' && data.state === 'down' && isVip) {
            if (data.button === 'X' && !this.ended) {
                this.mode = this.mode === 'turns' ? 'blitz' : 'turns';
                this.turnStartedAt = performance.now();
                this.ctx.sound.chord([523, 659], 100, 'triangle');
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
        const padX = 12 * s;
        const topHudH = 38 * s;
        const dropZoneH = 34 * s;
        const padBot = 10 * s;

        const boardX = padX;
        const boardY = topHudH + dropZoneH;
        const boardW = Math.max(200, view.w - padX * 2);
        const boardH = Math.max(150, view.h - boardY - padBot);

        const cellW = boardW / this.cols;
        const cellH = boardH / this.rows;
        const slotR = Math.max(6, Math.min(cellW, cellH) * 0.425);

        return {
            s,
            topHudH,
            dropZoneH,
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

        // Outer disc body
        this.ctx.graphics.circle(g, cx, cy, r);
        g.fillStyle = color;
        g.fill();

        // Top-left 3D specular highlight gradient
        const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
        grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.0)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
        this.ctx.graphics.circle(g, cx, cy, r);
        g.fillStyle = grad;
        g.fill();

        // Inner coin ridge
        this.ctx.graphics.circle(g, cx, cy, r * 0.78);
        g.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        g.lineWidth = Math.max(1, 1.5 * s);
        g.stroke();

        // Outer crisp border
        this.ctx.graphics.circle(g, cx, cy, r);
        g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        g.lineWidth = Math.max(1, 1.6 * s);
        g.stroke();

        // Player Avatar inside disc
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

    drawTopHud(g, view, layout, now) {
        const s = layout.s;
        const participants = this.getAllParticipants();
        const ids = Object.keys(participants);
        const padX = layout.boardX;
        const hudY = 6 * s;
        const hudH = 28 * s;

        // Left: Mode pill + Turn / Status readout
        const modeText = this.mode === 'turns' ? 'TURN-BASED' : '⚡ BLITZ FREE-FOR-ALL';
        g.font = `700 ${Math.round(11 * s)}px "Space Grotesk", sans-serif`;
        const modeW = g.measureText(modeText).width + 20 * s;

        this.ctx.graphics.roundRect(g, padX, hudY, modeW, hudH, 6 * s);
        g.fillStyle = this.mode === 'turns' ? 'rgba(37, 99, 235, 0.28)' : 'rgba(245, 158, 11, 0.28)';
        g.fill();
        g.strokeStyle = this.mode === 'turns' ? 'rgba(96, 165, 250, 0.55)' : 'rgba(251, 191, 36, 0.65)';
        g.lineWidth = 1 * s;
        g.stroke();

        this.ctx.graphics.label(modeText, padX + modeW / 2, hudY + hudH / 2, {
            size: Math.round(10.5 * s),
            weight: 700,
            color: this.mode === 'turns' ? '#93c5fd' : '#fde047'
        });

        // Status / Active Turn Banner
        const statusX = padX + modeW + 12 * s;
        if (this.winningLine && this.winner) {
            this.ctx.graphics.label(
                `🏆 ${this.winner.name.toUpperCase()} CONNECTS 4!`,
                statusX,
                hudY + hudH / 2,
                { size: Math.round(15 * s), weight: 700, color: '#fde047', align: 'left' }
            );
        } else if (this.isDraw) {
            this.ctx.graphics.label(
                'BOARD FULL — DRAW GAME! (Press Y to Reset)',
                statusX,
                hudY + hudH / 2,
                { size: Math.round(14 * s), weight: 700, color: '#f8fafc', align: 'left' }
            );
        } else if (this.mode === 'turns') {
            const activeId = this.getCurrentTurnPlayerId();
            const activeP = participants[activeId];
            const remSec = Math.max(0, Math.ceil((TURN_TIME_MS - (now - this.turnStartedAt)) / 1000));
            if (activeP) {
                // Active player turn pill
                this.ctx.graphics.circle(g, statusX + 8 * s, hudY + hudH / 2, 6 * s);
                g.fillStyle = activeP.color;
                g.fill();

                this.ctx.graphics.label(
                    `${activeP.name}'s Turn (${remSec}s) · ◀ ▶ Aim · A Drop · X Mode`,
                    statusX + 20 * s,
                    hudY + hudH / 2,
                    { size: Math.round(12.5 * s), weight: 700, color: '#f8fafc', align: 'left' }
                );
            }
        } else {
            this.ctx.graphics.label(
                'Everyone drops at once! First to Connect 4 wins · ◀ ▶ Aim · A Drop · X Mode',
                statusX,
                hudY + hudH / 2,
                { size: Math.round(12.5 * s), weight: 600, color: '#cbd5e1', align: 'left' }
            );
        }

        // Right: Compact Player Chips showing best chain & disc count
        let rightX = view.w - padX;
        for (let i = ids.length - 1; i >= 0; i--) {
            const id = ids[i];
            const p = participants[id];
            const st = this.playerState[id] || {};
            const isTurn = this.mode === 'turns' && id === this.getCurrentTurnPlayerId() && !this.winningLine;
            const label = `${p.name} (${st.bestChain || 0}/4)`;

            g.font = `700 ${Math.round(11.5 * s)}px "Space Grotesk", sans-serif`;
            const chipW = Math.min(155 * s, g.measureText(label).width + 32 * s);
            rightX -= chipW;
            if (rightX < statusX + 260 * s) break; // Never overlap status text

            this.ctx.graphics.roundRect(g, rightX, hudY, chipW, hudH, 999);
            g.fillStyle = isTurn ? 'rgba(255, 255, 255, 0.16)' : 'rgba(15, 23, 42, 0.65)';
            g.fill();
            g.strokeStyle = p.color;
            g.lineWidth = (isTurn ? 2.2 : 1.2) * s;
            g.stroke();

            this.drawDisc(g, rightX + 14 * s, hudY + hudH / 2, 9 * s, p.color, p.avatar, 1, s);

            this.ctx.graphics.label(label, rightX + 27 * s, hudY + hudH / 2, {
                size: Math.round(11 * s),
                weight: 700,
                color: isTurn ? '#ffffff' : '#e2e8f0',
                align: 'left'
            });

            rightX -= 6 * s;
        }
    }

    drawColumnCursors(g, layout, now) {
        const s = layout.s;
        const participants = this.getAllParticipants();
        const ids = Object.keys(participants);
        const activeTurnId = this.getCurrentTurnPlayerId();

        // Group cursors by column so multiple players aiming at the same column fan out cleanly
        const byCol = new Map();
        for (const id of ids) {
            const st = this.playerState[id];
            if (!st) continue;
            if (!byCol.has(st.col)) byCol.set(st.col, []);
            byCol.get(st.col).push(id);
        }

        const cursorCenterY = layout.topHudH + layout.dropZoneH * 0.48;
        const tokenR = Math.min(13 * s, layout.slotR * 0.62);

        for (const [col, colPlayerIds] of byCol.entries()) {
            const baseCx = layout.colCenterX(col);
            const count = colPlayerIds.length;
            const spread = Math.min(16 * s, (layout.cellW * 0.7) / Math.max(1, count));

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

                // Token disc
                this.drawDisc(g, cx, cy, tokenR, p.color, p.avatar, isTurn ? 1 : 0.62, s);

                // In Blitz mode, draw cooldown recharge arc if cooling down
                if (this.mode === 'blitz' && now < st.cooldownUntil) {
                    const pct = 1 - (st.cooldownUntil - now) / BLITZ_COOLDOWN_MS;
                    g.beginPath();
                    g.arc(cx, cy, tokenR + 2.5 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, pct)));
                    g.strokeStyle = '#fde047';
                    g.lineWidth = 2.2 * s;
                    g.stroke();
                } else if (this.mode === 'turns' && id === activeTurnId && !this.winningLine) {
                    // Glowing active turn halo
                    this.ctx.graphics.circle(g, cx, cy, tokenR + 3.5 * s);
                    g.strokeStyle = '#fde047';
                    g.lineWidth = 2.2 * s;
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
            fd.velRow += 0.0024 * dt; // Gravity in rows/ms^2
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

        // Trigger results modal after celebration delay
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

        // 2. Top HUD & Column Drop Cursors
        this.drawTopHud(g, view, layout, now);
        this.drawColumnCursors(g, layout, now);

        // 3. Board Frame filling the screen space
        const frameR = 14 * s;
        this.ctx.graphics.roundRect(g, layout.boardX, layout.boardY, layout.boardW, layout.boardH, frameR);
        const boardGrad = g.createLinearGradient(layout.boardX, layout.boardY, layout.boardX, layout.boardY + layout.boardH);
        boardGrad.addColorStop(0, 'rgba(30, 58, 138, 0.72)');
        boardGrad.addColorStop(1, 'rgba(15, 23, 42, 0.88)');
        g.fillStyle = boardGrad;
        g.fill();

        g.strokeStyle = 'rgba(96, 165, 250, 0.35)';
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

                // Subtle vertical column highlight beam
                g.fillStyle = isPrimary ? 'rgba(255, 255, 255, 0.055)' : 'rgba(255, 255, 255, 0.02)';
                g.fillRect(colX + 2 * s, layout.boardY + 2 * s, layout.cellW - 4 * s, layout.boardH - 4 * s);

                // Ghost landing indicator in the lowest open slot for this player
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

                // Recessed circular slot cutout
                this.ctx.graphics.circle(g, cx, cy, layout.slotR);
                g.fillStyle = 'rgba(4, 9, 20, 0.86)';
                g.fill();

                // Slot inner bezel rim
                this.ctx.graphics.circle(g, cx, cy, layout.slotR);
                g.strokeStyle = 'rgba(148, 163, 184, 0.22)';
                g.lineWidth = 1.4 * s;
                g.stroke();

                // Column number watermark on top row of empty slots for easy scanning
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

                    // Last dropped piece indicator ring
                    if (this.lastMove && this.lastMove.r === r && this.lastMove.c === c && !this.winningLine) {
                        this.ctx.graphics.circle(g, cx, cy, layout.slotR * 0.98);
                        g.strokeStyle = '#ffffff';
                        g.lineWidth = 2.2 * s;
                        g.stroke();
                    }

                    // Winning 4-in-a-row golden halo
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

