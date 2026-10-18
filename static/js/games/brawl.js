/* ==========================================================================
   Game — Bumper Brawl
   Enhanced arena combat:
   - Procedurally generated organic arena layouts with guaranteed 100% reachability.
   - Wide, spacious channels (120–140px) and well-spaced dead islands for smooth,
     dynamic navigation and tactical bumping.
   - Continuous Signed Distance Field (SDF) physics with tangential sliding:
     players glide smoothly along curved walls and islands without sticking.
   - Special power coins:
       ❄️ Freeze Coin: Freeze an opponent into an ice block upon collision!
       ⚡ Mega Knock Coin: Blasts rivals with insane kinetic force!
       🔥 Lava Walls Coin: Turns all outer and island walls into lethal molten lava!
   ========================================================================== */
(function (w) {
'use strict';

const C = w.CastOn;
const T = C.tools;

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

const ARENA_CONFIG = {
    accel: 0.98,
    drag: 0.92,
    maxSpeed: 27,
    playerR: 24, // Nimble, responsive radius with comfortable clearance
    restitution: 0.55
};

const ROUND_MS = 75000;
const SUDDEN_DEATH_MS = 16000;
const LAVA_DURATION_MS = 7500;
const FREEZE_DURATION_MS = 10000;
const FREEZE_HIT_DURATION_MS = 3500;
const KNOCK_DURATION_MS = 10000;

/* ==========================================================================
   1D Distance Transform helper (Felzenszwalb & Huttenlocher, exact O(N))
   ========================================================================== */
function dt1D(f, n) {
    const d = new Float32Array(n);
    const v = new Int32Array(n);
    const z = new Float32Array(n + 1);
    let k = 0;
    v[0] = 0;
    z[0] = -1e7;
    z[1] = 1e7;

    for (let q = 1; q < n; q++) {
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) {
            k--;
            s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        }
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = 1e7;
    }

    k = 0;
    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        const dx = q - v[k];
        d[q] = dx * dx + f[v[k]];
    }
    return d;
}

function compute2D_EDT(solidGrid, cols, rows, cellW, cellH) {
    const N = cols * rows;
    const fIn = new Float32Array(N);
    const fOut = new Float32Array(N);

    for (let i = 0; i < N; i++) {
        fIn[i] = solidGrid[i] ? 0 : 1e7;
        fOut[i] = solidGrid[i] ? 1e7 : 0;
    }

    function transformGrid(f) {
        const temp = new Float32Array(N);
        const colBuf = new Float32Array(rows);
        for (let x = 0; x < cols; x++) {
            for (let y = 0; y < rows; y++) colBuf[y] = f[y * cols + x];
            const dCol = dt1D(colBuf, rows);
            for (let y = 0; y < rows; y++) temp[y * cols + x] = dCol[y];
        }
        const result = new Float32Array(N);
        const rowBuf = new Float32Array(cols);
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) rowBuf[x] = temp[y * cols + x];
            const dRow = dt1D(rowBuf, cols);
            for (let x = 0; x < cols; x++) result[y * cols + x] = dRow[x];
        }
        return result;
    }

    const distToSolid = transformGrid(fIn);
    const distToWalkable = transformGrid(fOut);
    const sdf = new Float32Array(N);

    const avgCell = (cellW + cellH) * 0.5;
    for (let i = 0; i < N; i++) {
        if (solidGrid[i]) {
            sdf[i] = -Math.sqrt(distToWalkable[i]) * avgCell;
        } else {
            sdf[i] = Math.sqrt(distToSolid[i]) * avgCell;
        }
    }
    return sdf;
}

/* ==========================================================================
   Chaikin curve smoothing & Exact Integer Marching Squares Loop Extractor
   ========================================================================== */
function chaikinSmooth(pts, iterations) {
    let curr = pts;
    for (let it = 0; it < (iterations || 2); it++) {
        if (curr.length < 3) break;
        const next = [];
        const n = curr.length;
        for (let i = 0; i < n; i++) {
            const p0 = curr[i];
            const p1 = curr[(i + 1) % n];
            next.push({
                x: 0.75 * p0.x + 0.25 * p1.x,
                y: 0.75 * p0.y + 0.25 * p1.y
            });
            next.push({
                x: 0.25 * p0.x + 0.75 * p1.x,
                y: 0.25 * p0.y + 0.75 * p1.y
            });
        }
        curr = next;
    }
    return curr;
}

function extractBoundaryLoops(solid, cols, rows, x0, y0, cellW, cellH) {
    const hEdge = (gx, gy) => 2 * (gy * cols + gx);
    const vEdge = (gx, gy) => 2 * (gy * cols + gx) + 1;

    const adj = new Map();
    function addSeg(v1, v2) {
        if (!adj.has(v1)) adj.set(v1, []);
        if (!adj.has(v2)) adj.set(v2, []);
        adj.get(v1).push(v2);
        adj.get(v2).push(v1);
    }

    for (let gy = 0; gy < rows - 1; gy++) {
        for (let gx = 0; gx < cols - 1; gx++) {
            const tl = solid[gy * cols + gx] ? 0 : 1;
            const tr = solid[gy * cols + (gx + 1)] ? 0 : 1;
            const br = solid[(gy + 1) * cols + (gx + 1)] ? 0 : 1;
            const bl = solid[(gy + 1) * cols + gx] ? 0 : 1;

            const idx = (tl << 3) | (tr << 2) | (br << 1) | bl;
            if (idx === 0 || idx === 15) continue;

            const top = hEdge(gx, gy);
            const right = vEdge(gx + 1, gy);
            const bottom = hEdge(gx, gy + 1);
            const left = vEdge(gx, gy);

            switch (idx) {
                case 1: addSeg(bottom, left); break;
                case 2: addSeg(right, bottom); break;
                case 3: addSeg(right, left); break;
                case 4: addSeg(top, right); break;
                case 5: addSeg(top, left); addSeg(right, bottom); break;
                case 6: addSeg(top, bottom); break;
                case 7: addSeg(top, left); break;
                case 8: addSeg(left, top); break;
                case 9: addSeg(bottom, top); break;
                case 10: addSeg(left, bottom); addSeg(top, right); break;
                case 11: addSeg(right, top); break;
                case 12: addSeg(left, right); break;
                case 13: addSeg(bottom, right); break;
                case 14: addSeg(left, bottom); break;
            }
        }
    }

    function vertToPos(vid) {
        const type = vid % 2;
        const cellIdx = Math.floor(vid / 2);
        const gx = cellIdx % cols;
        const gy = Math.floor(cellIdx / cols);
        if (type === 0) {
            return { x: x0 + (gx + 0.5) * cellW, y: y0 + gy * cellH };
        } else {
            return { x: x0 + gx * cellW, y: y0 + (gy + 0.5) * cellH };
        }
    }

    const visited = new Set();
    const loops = [];

    for (const [startV, neighbors] of adj.entries()) {
        if (visited.has(startV) || neighbors.length === 0) continue;

        const loop = [startV];
        visited.add(startV);
        let curr = neighbors[0];
        let prev = startV;

        let closed = false;
        while (curr !== undefined) {
            visited.add(curr);
            loop.push(curr);
            const nexts = adj.get(curr) || [];
            let nextV = nexts.find(n => n !== prev && !visited.has(n));
            if (!nextV) {
                if (nexts.includes(startV)) closed = true;
                break;
            }
            prev = curr;
            curr = nextV;
        }

        if (closed && loop.length > 8) {
            loops.push(chaikinSmooth(loop.map(vertToPos), 2));
        }
    }

    loops.sort((a, b) => b.length - a.length);
    return loops;
}

/* ==========================================================================
   Procedural Arena Generator with Wide Channels & 100% Reachability
   ========================================================================== */
class ProceduralArena {
    constructor(view) {
        this.view = view;
        this.cols = 84;
        this.rows = 48;

        const padX = 50;
        const topY = 74;
        const botY = view.h - 44;
        this.x0 = padX;
        this.y0 = topY;
        this.playW = Math.max(300, view.w - padX * 2);
        this.playH = Math.max(200, botY - topY);
        this.cellW = this.playW / this.cols;
        this.cellH = this.playH / this.rows;

        this.solid = new Uint8Array(this.cols * this.rows);
        this.sdf = null;
        this.outerLoop = [];
        this.islandLoops = [];
        this.arenaPath = null;
        this.walkableCells = [];

        this.generate();
    }

    carveRect(x, y, w, h, isWalkable) {
        const insetX = this.cellW * 2.5;
        const insetY = this.cellH * 2.5;
        const cx1 = Math.max(this.x0 + insetX, x);
        const cy1 = Math.max(this.y0 + insetY, y);
        const cx2 = Math.min(this.x0 + this.playW - insetX, x + w);
        const cy2 = Math.min(this.y0 + this.playH - insetY, y + h);
        if (cx2 <= cx1 || cy2 <= cy1) return;

        const minGx = Math.max(2, Math.floor((cx1 - this.x0) / this.cellW));
        const maxGx = Math.min(this.cols - 3, Math.ceil((cx2 - this.x0) / this.cellW));
        const minGy = Math.max(2, Math.floor((cy1 - this.y0) / this.cellH));
        const maxGy = Math.min(this.rows - 3, Math.ceil((cy2 - this.y0) / this.cellH));
        const val = isWalkable ? 0 : 1;
        for (let gy = minGy; gy <= maxGy; gy++) {
            for (let gx = minGx; gx <= maxGx; gx++) {
                this.solid[gy * this.cols + gx] = val;
            }
        }
    }

    generate() {
        let attempts = 0;
        let success = false;

        while (attempts < 10 && !success) {
            attempts++;
            this.solid.fill(1);
            const archetype = Math.floor(Math.random() * 4);
            const cx = this.x0 + this.playW * 0.5;
            const cy = this.y0 + this.playH * 0.5;

            const varX = (Math.random() - 0.5) * 20;
            const varY = (Math.random() - 0.5) * 16;

            if (archetype === 0) {
                // Dual Rectangular Wings + Central Atrium + Wide Channels
                const rw = this.playW * 0.34;
                const rh = this.playH * 0.82;
                const sep = this.playW * 0.28;
                this.carveRect(cx - sep - rw * 0.5 + varX, cy - rh * 0.5 + varY, rw, rh, true);
                this.carveRect(cx + sep - rw * 0.5 - varX, cy - rh * 0.5 - varY, rw, rh, true);
                this.carveRect(cx - 170, cy - 145, 340, 290, true);

                // Top & Bottom rectangular passages
                this.carveRect(cx - this.playW * 0.35, cy - rh * 0.36, this.playW * 0.70, 125, true);
                this.carveRect(cx - this.playW * 0.35, cy + rh * 0.36 - 125, this.playW * 0.70, 125, true);

                // Rectangular Dead Islands
                this.carveRect(cx - 50, cy - 40, 100, 80, false);
                this.carveRect(cx - this.playW * 0.30 - 30, cy + (Math.random() < 0.5 ? -70 : 70) - 30, 60, 60, false);
                this.carveRect(cx + this.playW * 0.30 - 30, cy + (Math.random() < 0.5 ? -70 : 70) - 30, 60, 60, false);
            } else if (archetype === 1) {
                // Tri-Chamber Compound (Top Hangar & Lower Vaults)
                const th = this.playH * 0.38;
                const tw = this.playW * 0.72;
                this.carveRect(cx - tw * 0.5 + varX, cy - this.playH * 0.26 - th * 0.5, tw, th, true);

                const bh = this.playH * 0.44;
                const bw = this.playW * 0.38;
                this.carveRect(cx - this.playW * 0.26 - bw * 0.5, cy + this.playH * 0.22 - bh * 0.5, bw, bh, true);
                this.carveRect(cx + this.playW * 0.26 - bw * 0.5, cy + this.playH * 0.22 - bh * 0.5, bw, bh, true);

                // Rectangular Corridors
                this.carveRect(cx - this.playW * 0.26 - 60, cy - this.playH * 0.20, 125, this.playH * 0.45, true);
                this.carveRect(cx + this.playW * 0.26 - 65, cy - this.playH * 0.20, 125, this.playH * 0.45, true);
                this.carveRect(cx - 150, cy - 80, 300, 160, true);
                this.carveRect(cx - this.playW * 0.26, cy + this.playH * 0.24 - 60, this.playW * 0.52, 125, true);

                // Dead Islands
                this.carveRect(cx - 45, cy - 35, 90, 70, false);
                this.carveRect(cx - this.playW * 0.26 - 28, cy + this.playH * 0.22 - 28, 56, 56, false);
                this.carveRect(cx + this.playW * 0.26 - 28, cy + this.playH * 0.22 - 28, 56, 56, false);
            } else if (archetype === 2) {
                // 4-Quadrant Matrix (Crossroads Plaza & Corner Bastions)
                this.carveRect(cx - 170, cy - 140, 340, 280, true);
                const qw = this.playW * 0.34;
                const qh = this.playH * 0.36;
                this.carveRect(cx - this.playW * 0.28 - qw * 0.5, cy - this.playH * 0.26 - qh * 0.5, qw, qh, true);
                this.carveRect(cx + this.playW * 0.28 - qw * 0.5, cy - this.playH * 0.26 - qh * 0.5, qw, qh, true);
                this.carveRect(cx - this.playW * 0.28 - qw * 0.5, cy + this.playH * 0.26 - qh * 0.5, qw, qh, true);
                this.carveRect(cx + this.playW * 0.28 - qw * 0.5, cy + this.playH * 0.26 - qh * 0.5, qw, qh, true);

                // Central Avenues & Perimeter Channels
                this.carveRect(cx - 65, this.y0 + 10, 130, this.playH - 20, true);
                this.carveRect(this.x0 + 10, cy - 60, this.playW - 20, 125, true);
                this.carveRect(cx - this.playW * 0.35, cy - this.playH * 0.35, this.playW * 0.70, 115, true);
                this.carveRect(cx - this.playW * 0.35, cy + this.playH * 0.35 - 115, this.playW * 0.70, 115, true);

                // 4 Rectangular Pylon Dead Islands
                const ioX = 85, ioY = 75, iw = 50, ih = 45;
                this.carveRect(cx - ioX - iw * 0.5, cy - ioY - ih * 0.5, iw, ih, false);
                this.carveRect(cx + ioX - iw * 0.5, cy - ioY - ih * 0.5, iw, ih, false);
                this.carveRect(cx - ioX - iw * 0.5, cy + ioY - ih * 0.5, iw, ih, false);
                this.carveRect(cx + ioX - iw * 0.5, cy + ioY - ih * 0.5, iw, ih, false);
            } else {
                // Circuit Ring & Rectangular Fortress
                this.carveRect(this.x0 + 15, this.y0 + 15, this.playW - 30, 140, true);
                this.carveRect(this.x0 + 15, this.y0 + this.playH - 155, this.playW - 30, 140, true);
                this.carveRect(this.x0 + 15, this.y0 + 15, 145, this.playH - 30, true);
                this.carveRect(this.x0 + this.playW - 160, this.y0 + 15, 145, this.playH - 30, true);
                this.carveRect(cx - 65, this.y0 + 15, 130, this.playH - 30, true);
                this.carveRect(this.x0 + 15, cy - 60, this.playW - 30, 125, true);

                // Rectangular Dead Islands
                const bw = 150, bh = 100;
                this.carveRect(cx - 170 - bw * 0.5, cy - 120 - bh * 0.5, bw, bh, false);
                this.carveRect(cx + 170 - bw * 0.5, cy - 120 - bh * 0.5, bw, bh, false);
                this.carveRect(cx - 170 - bw * 0.5, cy + 120 - bh * 0.5, bw, bh, false);
                this.carveRect(cx + 170 - bw * 0.5, cy + 120 - bh * 0.5, bw, bh, false);
                this.carveRect(cx - 45, cy - 35, 90, 70, false);
            }

            // Guaranteed Reachability via Flood Fill (BFS)
            let seedIdx = -1;
            for (let i = 0; i < this.solid.length; i++) {
                if (this.solid[i] === 0) { seedIdx = i; break; }
            }

            if (seedIdx >= 0) {
                const visited = new Uint8Array(this.cols * this.rows);
                const queue = [seedIdx];
                visited[seedIdx] = 1;
                let reachedCount = 0;

                while (queue.length > 0) {
                    const idx = queue.shift();
                    reachedCount++;
                    const gx = idx % this.cols;
                    const gy = Math.floor(idx / this.cols);

                    const neighbors = [
                        gx > 0 ? idx - 1 : -1,
                        gx < this.cols - 1 ? idx + 1 : -1,
                        gy > 0 ? idx - this.cols : -1,
                        gy < this.rows - 1 ? idx + this.cols : -1
                    ];

                    for (const nIdx of neighbors) {
                        if (nIdx >= 0 && this.solid[nIdx] === 0 && !visited[nIdx]) {
                            visited[nIdx] = 1;
                            queue.push(nIdx);
                        }
                    }
                }

                // Any unreached pockets become solid wall to guarantee 100% reachability
                for (let i = 0; i < this.solid.length; i++) {
                    if (this.solid[i] === 0 && !visited[i]) {
                        this.solid[i] = 1;
                    }
                }

                if (reachedCount > (this.cols * this.rows) * 0.25) {
                    success = true;
                }
            }
        }

        // 5. Compute Signed Distance Field
        this.sdf = compute2D_EDT(this.solid, this.cols, this.rows, this.cellW, this.cellH);

        // 6. Build list of safe walkable cells
        this.walkableCells = [];
        for (let gy = 1; gy < this.rows - 1; gy++) {
            for (let gx = 1; gx < this.cols - 1; gx++) {
                const idx = gy * this.cols + gx;
                if (this.sdf[idx] >= 30) {
                    this.walkableCells.push({
                        x: this.x0 + gx * this.cellW,
                        y: this.y0 + gy * this.cellH,
                        dist: this.sdf[idx]
                    });
                }
            }
        }

        // 7. Extract Smooth Marching Squares Vector Loops
        const loops = extractBoundaryLoops(this.solid, this.cols, this.rows, this.x0, this.y0, this.cellW, this.cellH);
        if (loops.length > 0) {
            this.outerLoop = loops[0];
            this.islandLoops = loops.slice(1);
        } else {
            const r = Math.min(this.playW, this.playH) * 0.45;
            const cx = this.x0 + this.playW * 0.5;
            const cy = this.y0 + this.playH * 0.5;
            const pts = [];
            for (let a = 0; a < 64; a++) {
                const th = (a / 64) * Math.PI * 2;
                pts.push({ x: cx + Math.cos(th) * r, y: cy + Math.sin(th) * r });
            }
            this.outerLoop = pts;
            this.islandLoops = [];
        }

        this.buildPath();
    }

    buildPath() {
        this.arenaPath = new Path2D();
        if (this.outerLoop.length > 0) {
            this.arenaPath.moveTo(this.outerLoop[0].x, this.outerLoop[0].y);
            for (let i = 1; i < this.outerLoop.length; i++) {
                this.arenaPath.lineTo(this.outerLoop[i].x, this.outerLoop[i].y);
            }
            this.arenaPath.closePath();
        }

        for (const isl of this.islandLoops) {
            if (isl.length > 2) {
                this.arenaPath.moveTo(isl[0].x, isl[0].y);
                for (let i = 1; i < isl.length; i++) {
                    this.arenaPath.lineTo(isl[i].x, isl[i].y);
                }
                this.arenaPath.closePath();
            }
        }
    }

    getDistance(x, y) {
        const gx = (x - this.x0) / this.cellW;
        const gy = (y - this.y0) / this.cellH;

        if (gx <= 0.5 || gx >= this.cols - 1.5 || gy <= 0.5 || gy >= this.rows - 1.5) {
            return -20;
        }

        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const fx = gx - ix;
        const fy = gy - iy;

        const d00 = this.sdf[iy * this.cols + ix];
        const d10 = this.sdf[iy * this.cols + (ix + 1)];
        const d01 = this.sdf[(iy + 1) * this.cols + ix];
        const d11 = this.sdf[(iy + 1) * this.cols + (ix + 1)];

        const top = d00 * (1 - fx) + d10 * fx;
        const bottom = d01 * (1 - fx) + d11 * fx;
        return top * (1 - fy) + bottom * fy;
    }

    getNormal(x, y) {
        const eps = 3.5;
        const dx = this.getDistance(x + eps, y) - this.getDistance(x - eps, y);
        const dy = this.getDistance(x, y + eps) - this.getDistance(x, y - eps);
        const len = Math.hypot(dx, dy);
        if (len < 0.0001) {
            const cx = this.x0 + this.playW * 0.5;
            const cy = this.y0 + this.playH * 0.5;
            const dcx = cx - x;
            const dcy = cy - y;
            const dlen = Math.hypot(dcx, dcy) || 1;
            return { nx: dcx / dlen, ny: dcy / dlen };
        }
        return { nx: dx / len, ny: dy / len };
    }

    getRandomSafeSpawn(minClearance) {
        const req = minClearance || 35;
        let viable = this.walkableCells.filter(c => c.dist >= req);
        if (viable.length === 0) {
            viable = this.walkableCells.filter(c => c.dist >= 24);
        }
        if (viable.length > 0) {
            const pick = viable[Math.floor(Math.random() * viable.length)];
            return { x: pick.x, y: pick.y };
        }
        // Guaranteed fallback: pick the cell with maximum distance from any wall
        let best = this.walkableCells[0];
        for (let i = 1; i < this.walkableCells.length; i++) {
            if (this.walkableCells[i].dist > (best ? best.dist : 0)) best = this.walkableCells[i];
        }
        return { x: best ? best.x : this.x0 + 100, y: best ? best.y : this.y0 + 100 };
    }
}

/* ==========================================================================
   Bumper Brawl Game Engine
   ========================================================================== */
class BumperBrawl {
    constructor(ctx) {
        this.ctx = ctx || C;
        this.id = 'brawl';
        this.view = C.view || { w: 1280, h: 720 };
        this.arena = new ProceduralArena(this.view);

        this.entities = {};
        this.regularOrbs = [];
        this.specialCoins = [];
        this.particles = [];
        this.toasts = [];
        this.scores = {};
        this.screenShake = 0;

        this.running = true;
        this.ended = false;
        this.startTime = performance.now();
        this.lastFrame = this.startTime;
        this.matchEndsAt = this.startTime + ROUND_MS;

        // Lava Walls State
        this.lavaWallsEndsAt = 0;
        this.lavaActivator = null;
        this.lavaWasActive = false;

        // Timers for scheduled special coin drops
        this.nextFreezeCoinAt = this.startTime + 9000;
        this.nextKnockCoinAt = this.startTime + 17000;
        this.nextLavaCoinAt = this.startTime + 26000;

        C.setLayout('dpad', {
            title: 'Bumper Brawl',
            subtitle: 'Joystick moves · A boosts · Grab special coins!'
        });

        this.spawnRegularOrbs(5);
        this.sync();

        this.draw = this.draw.bind(this);
        requestAnimationFrame(this.draw);
    }

    /* ---------- Spawn & Coin Logic ---------------------------------------- */

    spawnRegularOrbs(n) {
        for (let i = 0; i < n; i++) {
            const pt = this.arena.getRandomSafeSpawn(36);
            this.regularOrbs.push({
                x: pt.x,
                y: pt.y,
                r: 14,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    spawnSpecialCoin(type) {
        const pt = this.arena.getRandomSafeSpawn(44);
        const coin = {
            type: type,
            x: pt.x,
            y: pt.y,
            r: 21,
            phase: Math.random() * Math.PI * 2,
            spawnedAt: performance.now()
        };
        this.specialCoins.push(coin);

        C.sound.tone(type === 'freeze' ? 880 : type === 'knock' ? 330 : 260, 140, 'triangle');
        this.addToast(`NEW COIN: ${type.toUpperCase().replace('_', ' ')}!`, '#ffffff', 2000);
    }

    addToast(text, color, durationMs) {
        this.toasts.push({
            text: text,
            color: color || '#ffffff',
            expiresAt: performance.now() + (durationMs || 2500)
        });
        if (this.toasts.length > 3) this.toasts.shift();
    }

    /* ---------- Player State Sync ----------------------------------------- */

    sync() {
        const players = (this.ctx && this.ctx.players) || C.players || {};
        const pKeys = Object.keys(players);

        pKeys.forEach((id) => {
            if (this.entities[id]) {
                this.entities[id].player = players[id];
                return;
            }
            const pt = this.arena.getRandomSafeSpawn(46);
            this.entities[id] = {
                id: id,
                player: players[id],
                x: pt.x,
                y: pt.y,
                vx: 0,
                vy: 0,
                r: ARENA_CONFIG.playerR,
                boost: 0,
                bob: Math.random() * Math.PI * 2,
                hit: 0,
                dead: false,
                respawnAt: 0,
                invulnerableUntil: performance.now() + 2500,
                freezePowerUntil: 0,
                knockPowerUntil: 0,
                frozenUntil: 0,
                frozenBy: null,
                lastHitBy: null,
                lastHitAt: 0
            };
            if (this.scores[id] === undefined) this.scores[id] = 0;
        });

        Object.keys(this.entities).forEach(id => {
            if (!players[id]) {
                delete this.entities[id];
                delete this.scores[id];
            }
        });
    }

    /* ---------- Lifecycle ------------------------------------------------- */

    onResize(view) {
        this.view = view;
        this.arena = new ProceduralArena(view);
        Object.values(this.entities).forEach(e => {
            if (this.arena.getDistance(e.x, e.y) < e.r) {
                const pt = this.arena.getRandomSafeSpawn(46);
                e.x = pt.x;
                e.y = pt.y;
            }
        });
    }

    onPlayersSync() {
        this.sync();
    }

    onInput(id, data) {
        if (this.ended) {
            if (data.action === 'btn' && data.button === 'A' && data.state === 'down') {
                const vipId = (this.ctx && this.ctx.vipId) || C.vipId;
                if (!vipId || id === vipId) {
                    if (this.ctx && this.ctx.backToLobby) {
                        this.ctx.backToLobby();
                    } else if (C.returnToLobby) {
                        C.returnToLobby();
                    }
                }
            }
            return;
        }

        const e = this.entities[id];
        if (!e || e.dead) return;

        // Record inputs continuously so player state is never lost
        if (data.action === 'joystick') {
            e.jx = data.x;
            e.jy = data.y;
            e.useJoystick = (data.active !== false && (data.x !== 0 || data.y !== 0));
        } else if (data.action === 'btn') {
            const { button, state } = data;
            if (['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(button)) {
                e.inputs = e.inputs || {};
                e.inputs[button] = state === 'down';
            } else if (button === 'A' && state === 'down' && e.frozenUntil <= performance.now()) {
                e.boost = 14;
                C.vibrate(id, 30);
                C.tone(680, 80, 'sawtooth');
            }
        }
    }

    /* ---------- Simulation Step ------------------------------------------- */

    draw() {
        if (!this.running) return;
        const g = C.ctx;
        const view = this.view;

        const now = performance.now();
        const dt = Math.min(32, now - this.lastFrame);
        this.lastFrame = now;

        if (!this.ended) this.step(dt, now);
        this.render(g, view, now);

        if (this.ended) return;
        requestAnimationFrame(this.draw);
    }

    step(dt, now) {
        const k = dt / 16.67;
        const remaining = this.matchEndsAt - now;
        this.phase = remaining < SUDDEN_DEATH_MS ? 'sudden' : 'play';
        const isLavaActive = this.lavaWallsEndsAt > now;

        // Detect Lava Wall activation/expiration for controller notifications
        if (isLavaActive && !this.lavaWasActive) {
            this.lavaWasActive = true;
            C.setLayout('dpad', {
                title: 'Bumper Brawl',
                subtitle: '🔥 LAVA WALLS ACTIVE! STAY AWAY FROM WALLS! 🔥'
            });
        } else if (!isLavaActive && this.lavaWasActive) {
            this.lavaWasActive = false;
            C.setLayout('dpad', {
                title: 'Bumper Brawl',
                subtitle: 'Joystick moves · A boosts · Grab special coins!'
            });
        }

        // Spawning scheduled special coins
        if (now >= this.nextFreezeCoinAt && this.specialCoins.length < 2) {
            this.spawnSpecialCoin('freeze');
            this.nextFreezeCoinAt = now + 24000;
        }
        if (now >= this.nextKnockCoinAt && this.specialCoins.length < 2) {
            this.spawnSpecialCoin('knock');
            this.nextKnockCoinAt = now + 27000;
        }
        if (now >= this.nextLavaCoinAt && this.specialCoins.length < 2) {
            this.spawnSpecialCoin('lava');
            this.nextLavaCoinAt = now + 34000;
        }

        // Substepping physics by 2 for tunneling prevention
        const subSteps = 2;
        const subK = k / subSteps;

        for (let stepIdx = 0; stepIdx < subSteps; stepIdx++) {
            this.stepPhysics(subK, now, isLavaActive);
        }

        // Maintain regular orbs
        const targetOrbs = this.phase === 'sudden' ? 7 : 5;
        this.regularOrbs = this.regularOrbs.filter(Boolean);
        while (this.regularOrbs.length < targetOrbs) {
            const pt = this.arena.getRandomSafeSpawn(36);
            this.regularOrbs.push({ x: pt.x, y: pt.y, r: 14, phase: Math.random() * Math.PI * 2 });
        }

        // Update particle lifetimes
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * k;
            p.y += p.vy * k;
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // Lava Wall Embers during active lava
        if (isLavaActive && Math.random() < 0.6) {
            const loop = (this.arena.islandLoops.length && Math.random() < 0.4)
                ? this.arena.islandLoops[Math.floor(Math.random() * this.arena.islandLoops.length)]
                : this.arena.outerLoop;
            if (loop && loop.length > 0) {
                const pt = loop[Math.floor(Math.random() * loop.length)];
                const n = this.arena.getNormal(pt.x, pt.y);
                this.particles.push({
                    type: 'ember',
                    x: pt.x,
                    y: pt.y,
                    vx: n.nx * (0.8 + Math.random() * 1.5) + (Math.random() - 0.5) * 1.2,
                    vy: n.ny * (0.8 + Math.random() * 1.5) + (Math.random() - 0.5) * 1.2,
                    r: 2.5 + Math.random() * 3,
                    life: 700 + Math.random() * 500,
                    maxLife: 1200,
                    color: Math.random() < 0.5 ? '#ff3700' : '#ffaa00'
                });
            }
        }

        // Screen shake decay
        if (this.screenShake > 0) {
            this.screenShake = Math.max(0, this.screenShake - 0.7 * k);
        }

        // Check Match Over
        if (now >= this.matchEndsAt) this.finish();
    }

    stepPhysics(k, now, isLavaActive) {
        const eKeys = Object.keys(this.entities);

        eKeys.forEach(id => {
            const e = this.entities[id];
            if (e.dead) {
                if (now >= e.respawnAt) {
                    e.dead = false;
                    const pt = this.arena.getRandomSafeSpawn(44);
                    e.x = pt.x;
                    e.y = pt.y;
                    e.vx = 0;
                    e.vy = 0;
                    e.invulnerableUntil = now + 3500;
                    C.sound.tone(523, 160, 'triangle');
                    this.addToast(`${e.player.name} RESPAWNED!`, e.player.color, 1800);
                }
                return;
            }

            const isFrozen = e.frozenUntil > now;
            const inp = e.inputs || {};

            // Movement acceleration: seamless blending of joystick and buttons
            if (!isFrozen) {
                let moveX = 0;
                let moveY = 0;

                if (e.useJoystick) {
                    moveX += e.jx || 0;
                    moveY += e.jy || 0;
                }
                if (inp.UP) moveY -= 1;
                if (inp.DOWN) moveY += 1;
                if (inp.LEFT) moveX -= 1;
                if (inp.RIGHT) moveX += 1;

                const mLen = Math.hypot(moveX, moveY);
                if (mLen > 0.05) {
                    const normFactor = mLen > 1 ? 1 / mLen : 1;
                    e.vx += moveX * normFactor * ARENA_CONFIG.accel * k;
                    e.vy += moveY * normFactor * ARENA_CONFIG.accel * k;
                }

                if (e.boost > 0) {
                    const speed = Math.hypot(e.vx, e.vy);
                    if (speed > 0.6) {
                        e.vx += (e.vx / speed) * e.boost * 0.55;
                        e.vy += (e.vy / speed) * e.boost * 0.55;
                    }
                    e.boost = Math.max(0, e.boost - k);
                }
            }

            // Drag: Low friction when frozen (curling stone slide), standard otherwise
            const dragCoeff = isFrozen ? 0.985 : ARENA_CONFIG.drag;
            const drag = Math.pow(dragCoeff, k);
            e.vx *= drag;
            e.vy *= drag;

            // Speed clamp
            const maxSpd = e.knockPowerUntil > now ? ARENA_CONFIG.maxSpeed * 1.3 : ARENA_CONFIG.maxSpeed;
            const speed = Math.hypot(e.vx, e.vy);
            if (speed > maxSpd) {
                e.vx = (e.vx / speed) * maxSpd;
                e.vy = (e.vy / speed) * maxSpd;
            }

            e.x += e.vx * k;
            e.y += e.vy * k;

            // Stage boundary clamp safety
            e.x = Math.max(30, Math.min(this.view.w - 30, e.x));
            e.y = Math.max(65, Math.min(this.view.h - 35, e.y));

            // Collision with Procedural Arena Walls & Dead Islands via SDF
            const dist = this.arena.getDistance(e.x, e.y);
            if (dist < e.r) {
                const normal = this.arena.getNormal(e.x, e.y);
                const pen = e.r - dist;

                // Push position out along normal with pushout limit to prevent pinballing
                const push = Math.min(pen, 12);
                e.x += normal.nx * push;
                e.y += normal.ny * push;

                const vdot = e.vx * normal.nx + e.vy * normal.ny;
                if (vdot < 0) {
                    // Tangential sliding: reflect only the normal component, preserve tangential sliding!
                    const nVx = vdot * normal.nx;
                    const nVy = vdot * normal.ny;
                    e.vx -= (1 + ARENA_CONFIG.restitution) * nVx;
                    e.vy -= (1 + ARENA_CONFIG.restitution) * nVy;

                    if (Math.abs(vdot) > 5) {
                        C.tone(isFrozen ? 1100 : 180, 60, isFrozen ? 'sine' : 'square');
                        C.vibrate(id, 25);
                    }
                }

                // LETHAL LAVA WALL KILL
                if (isLavaActive && now > e.invulnerableUntil) {
                    this.killPlayerWithLava(e, now);
                    return;
                }
            }

            // Scoop Regular Energy Orbs
            for (let i = 0; i < this.regularOrbs.length; i++) {
                const orb = this.regularOrbs[i];
                if (!orb) continue;
                if (Math.hypot(e.x - orb.x, e.y - orb.y) < e.r + orb.r + 3) {
                    this.scores[id] = (this.scores[id] || 0) + 10;
                    C.tone(920, 110, 'sine');
                    C.vibrate(id, 35);
                    C.toController(id, { type: 'score_update', score: this.scores[id] });
                    const pt = this.arena.getRandomSafeSpawn(36);
                    this.regularOrbs[i] = { x: pt.x, y: pt.y, r: 14, phase: Math.random() * Math.PI * 2 };
                }
            }

            // Scoop Special Coins
            for (let i = this.specialCoins.length - 1; i >= 0; i--) {
                const coin = this.specialCoins[i];
                if (Math.hypot(e.x - coin.x, e.y - coin.y) < e.r + coin.r + 4) {
                    this.collectSpecialCoin(e, coin, now);
                    this.specialCoins.splice(i, 1);
                }
            }
        });

        // Player-vs-Player collisions & Power Triggers
        for (let i = 0; i < eKeys.length; i++) {
            for (let j = i + 1; j < eKeys.length; j++) {
                const a = this.entities[eKeys[i]];
                const b = this.entities[eKeys[j]];
                if (!a || !b || a.dead || b.dead) continue;

                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy) || 0.001;
                const min = a.r + b.r;

                if (dist < min) {
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const overlap = min - dist;

                    a.x -= nx * overlap * 0.5;
                    a.y -= ny * overlap * 0.5;
                    b.x += nx * overlap * 0.5;
                    b.y += ny * overlap * 0.5;

                    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;

                    // Power 1: Freeze power hit check
                    const aHasFreeze = a.freezePowerUntil > now;
                    const bHasFreeze = b.freezePowerUntil > now;

                    if (aHasFreeze && b.invulnerableUntil <= now && b.frozenUntil <= now) {
                        this.freezeVictim(a, b, now);
                    }
                    if (bHasFreeze && a.invulnerableUntil <= now && a.frozenUntil <= now) {
                        this.freezeVictim(b, a, now);
                    }

                    // Power 2: Mega Knock power hit check
                    const aHasKnock = a.knockPowerUntil > now;
                    const bHasKnock = b.knockPowerUntil > now;

                    let baseImpulse = Math.max(6, Math.abs(rel) * 1.15);
                    if (aHasKnock || bHasKnock) {
                        baseImpulse = 48 + Math.abs(rel) * 1.4;
                        this.screenShake = 16;
                        C.sound.tone(68, 260, 'sawtooth');
                        this.spawnShockwave((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, '#f43f5e');

                        if (aHasKnock && !bHasKnock) {
                            b.vx += nx * baseImpulse;
                            b.vy += ny * baseImpulse;
                            a.vx -= nx * (baseImpulse * 0.22);
                            a.vy -= ny * (baseImpulse * 0.22);
                            this.scores[a.id] = (this.scores[a.id] || 0) + 12;
                            this.addToast(`${a.player.name} MEGA-KNOCKED ${b.player.name}! ⚡`, '#f43f5e', 2200);
                        } else if (bHasKnock && !aHasKnock) {
                            a.vx -= nx * baseImpulse;
                            a.vy -= ny * baseImpulse;
                            b.vx += nx * (baseImpulse * 0.22);
                            b.vy += ny * (baseImpulse * 0.22);
                            this.scores[b.id] = (this.scores[b.id] || 0) + 12;
                            this.addToast(`${b.player.name} MEGA-KNOCKED ${a.player.name}! ⚡`, '#f43f5e', 2200);
                        } else {
                            a.vx -= nx * baseImpulse * 0.7;
                            a.vy -= ny * baseImpulse * 0.7;
                            b.vx += nx * baseImpulse * 0.7;
                            b.vy += ny * baseImpulse * 0.7;
                        }
                    } else {
                        a.vx -= nx * baseImpulse;
                        a.vy -= ny * baseImpulse;
                        b.vx += nx * baseImpulse;
                        b.vy += ny * baseImpulse;
                        if (Math.abs(rel) > 3) {
                            C.tone(150, 70, 'square');
                            C.vibrate('all', 30);
                        }
                    }

                    a.hit = b.hit = 1;
                    a.lastHitBy = b.id;
                    a.lastHitAt = now;
                    b.lastHitBy = a.id;
                    b.lastHitAt = now;
                }
            }
        }
    }

    /* ---------- Special Coin Actions -------------------------------------- */

    collectSpecialCoin(player, coin, now) {
        const id = player.id;
        if (coin.type === 'freeze') {
            player.freezePowerUntil = now + FREEZE_DURATION_MS;
            this.scores[id] = (this.scores[id] || 0) + 15;
            C.chord([987, 1318, 1760], 180, 'triangle');
            C.vibrate(id, 70);
            C.setLayout('dpad', { title: 'Bumper Brawl', subtitle: '❄️ FREEZE TOUCH ACTIVE! Ram rivals!' }, id);
            this.addToast(`❄️ ${player.player.name} GOT FREEZE TOUCH!`, '#38bdf8', 2800);
            this.spawnShockwave(player.x, player.y, '#38bdf8');
        } else if (coin.type === 'knock') {
            player.knockPowerUntil = now + KNOCK_DURATION_MS;
            this.scores[id] = (this.scores[id] || 0) + 15;
            C.tone(90, 200, 'sawtooth');
            C.vibrate(id, 90);
            C.setLayout('dpad', { title: 'Bumper Brawl', subtitle: '⚡ MEGA KNOCK ACTIVE! Ram rivals with insane force!' }, id);
            this.addToast(`⚡ ${player.player.name} GOT MEGA KNOCK!`, '#f43f5e', 2800);
            this.spawnShockwave(player.x, player.y, '#f43f5e');
        } else if (coin.type === 'lava') {
            this.lavaWallsEndsAt = now + LAVA_DURATION_MS;
            this.lavaActivator = id;
            this.scores[id] = (this.scores[id] || 0) + 20;
            this.screenShake = 18;
            C.chord([220, 277, 330, 440], 380, 'sawtooth');
            C.vibrate('all', 120);
            this.addToast(`🔥 ${player.player.name} ACTIVATED LAVA WALLS!`, '#ff4500', 3200);
            this.spawnShockwave(player.x, player.y, '#ff4500');
        }
    }

    freezeVictim(attacker, victim, now) {
        victim.frozenUntil = now + FREEZE_HIT_DURATION_MS;
        victim.frozenBy = attacker.id;
        this.scores[attacker.id] = (this.scores[attacker.id] || 0) + 15;

        C.chord([1400, 1050, 700], 180, 'sawtooth');
        C.vibrate(victim.id, 350);
        C.setLayout('dpad', { title: 'Bumper Brawl', subtitle: '❄️ YOU ARE FROZEN! Thawing in 3s...' }, victim.id);
        this.addToast(`❄️ ${attacker.player.name} FROZE ${victim.player.name}!`, '#38bdf8', 2400);

        setTimeout(() => {
            if (this.running && !this.ended) {
                C.setLayout('dpad', { title: 'Bumper Brawl', subtitle: 'Joystick moves · A boosts · Grab special coins!' }, victim.id);
            }
        }, FREEZE_HIT_DURATION_MS);

        for (let i = 0; i < 16; i++) {
            const ang = (i / 16) * Math.PI * 2;
            const spd = 2 + Math.random() * 4;
            this.particles.push({
                type: 'frost',
                x: victim.x,
                y: victim.y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                r: 3 + Math.random() * 3,
                life: 600 + Math.random() * 400,
                maxLife: 1000,
                color: Math.random() < 0.6 ? '#38bdf8' : '#ffffff'
            });
        }
    }

    killPlayerWithLava(player, now) {
        player.dead = true;
        player.respawnAt = now + 2400;
        player.vx = 0;
        player.vy = 0;

        C.chord([160, 110, 80], 350, 'sawtooth');
        C.vibrate(player.id, 450);
        this.screenShake = 14;

        if (player.lastHitBy && (now - player.lastHitAt < 4000) && player.lastHitBy !== player.id) {
            const killer = this.entities[player.lastHitBy];
            if (killer) {
                this.scores[killer.id] = (this.scores[killer.id] || 0) + 30;
                this.addToast(`🔥 ${killer.player.name} PUSHED ${player.player.name} INTO LAVA!`, '#ff3700', 3000);
            }
        } else if (this.lavaActivator && this.lavaActivator !== player.id) {
            const activator = this.entities[this.lavaActivator];
            if (activator) {
                this.scores[this.lavaActivator] = (this.scores[this.lavaActivator] || 0) + 25;
                this.addToast(`🔥 ${player.player.name} INCINERATED BY ${activator.player.name}'S LAVA!`, '#ff3700', 3000);
            }
        } else {
            this.scores[player.id] = Math.max(0, (this.scores[player.id] || 0) - 10);
            this.addToast(`🔥 ${player.player.name} TOUCHED THE LAVA!`, '#ff3700', 2500);
        }

        for (let i = 0; i < 28; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 2 + Math.random() * 6;
            this.particles.push({
                type: 'fire',
                x: player.x,
                y: player.y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                r: 4 + Math.random() * 5,
                life: 650 + Math.random() * 500,
                maxLife: 1150,
                color: Math.random() < 0.4 ? '#ff2200' : Math.random() < 0.7 ? '#ff7700' : '#ffea00'
            });
        }
    }

    spawnShockwave(x, y, color) {
        this.particles.push({
            type: 'shockwave',
            x: x,
            y: y,
            vx: 0,
            vy: 0,
            r: 10,
            maxR: 90,
            life: 400,
            maxLife: 400,
            color: color || '#ffffff'
        });
    }

    finish() {
        if (this.ended) return;
        this.ended = true;
        this.phase = 'done';
        C.chord([523, 659, 784], 180, 'triangle');

        C.setLayout('dpad', {
            title: 'Bumper Brawl',
            subtitle: 'Leader: press A to pick the next game'
        });

        const players = (this.ctx && this.ctx.players) || C.players || {};
        const rows = T.sorted(players, this.scores);
        const resultsHtml = T.results({
            title: 'Bumper Brawl',
            kicker: 'Brawl complete',
            rows: rows,
            footer: 'Leader: press A to pick the next game'
        });
        if (this.ctx && this.ctx.setOverlay) {
            this.ctx.setOverlay(resultsHtml);
        } else if (C.hud) {
            C.hud(resultsHtml);
        }
    }

    /* ---------- Render Pipeline ------------------------------------------- */

    render(g, view, now) {
        g.save();
        if (this.screenShake > 0.5) {
            g.translate((Math.random() - 0.5) * this.screenShake, (Math.random() - 0.5) * this.screenShake);
        }

        T.arenaBackdrop(view);

        const isLava = this.lavaWallsEndsAt > now;

        // 1. Render Walkable Arena Floor
        g.save();
        const cx = view.w * 0.5;
        const cy = view.h * 0.5;
        const floorGrad = g.createRadialGradient(cx, cy, 60, cx, cy, Math.max(view.w, view.h) * 0.65);
        if (isLava) {
            floorGrad.addColorStop(0, 'rgba(45, 15, 12, 0.55)');
            floorGrad.addColorStop(0.7, 'rgba(25, 8, 8, 0.9)');
            floorGrad.addColorStop(1, 'rgba(10, 3, 3, 0.98)');
        } else {
            floorGrad.addColorStop(0, 'rgba(22, 54, 120, 0.28)');
            floorGrad.addColorStop(0.7, 'rgba(8, 16, 40, 0.88)');
            floorGrad.addColorStop(1, 'rgba(4, 7, 20, 0.98)');
        }
        g.fillStyle = floorGrad;
        g.fill(this.arena.arenaPath, 'evenodd');

        // Floor Grid Lines
        g.save();
        g.clip(this.arena.arenaPath, 'evenodd');
        g.globalAlpha = isLava ? 0.12 : 0.08;
        g.strokeStyle = isLava ? '#ff4500' : '#60a5fa';
        g.lineWidth = 1;
        const gridStep = 48;
        for (let x = 0; x < view.w; x += gridStep) {
            g.beginPath(); g.moveTo(x, 0); g.lineTo(x, view.h); g.stroke();
        }
        for (let y = 0; y < view.h; y += gridStep) {
            g.beginPath(); g.moveTo(0, y); g.lineTo(view.w, y); g.stroke();
        }
        g.restore();
        g.restore();

        // 2. Render Dead Islands Interior Styling
        for (const isl of this.arena.islandLoops) {
            if (isl.length > 2) {
                g.save();
                const islPath = new Path2D();
                islPath.moveTo(isl[0].x, isl[0].y);
                for (let i = 1; i < isl.length; i++) islPath.lineTo(isl[i].x, isl[i].y);
                islPath.closePath();

                g.fillStyle = 'rgba(6, 9, 18, 0.96)';
                g.fill(islPath);

                g.lineWidth = 2.5;
                g.strokeStyle = isLava ? 'rgba(255, 69, 0, 0.65)' : 'rgba(56, 189, 248, 0.35)';
                g.stroke(islPath);
                g.restore();
            }
        }

        // 3. Render Arena Walls (Outer + Dead Islands)
        g.save();
        if (isLava) {
            const lavaPulse = Math.sin(now / 95) * 0.5 + 0.5;
            g.lineWidth = 7 + lavaPulse * 4;
            g.strokeStyle = '#ff2200';
            g.shadowColor = '#ff3300';
            g.shadowBlur = 34 + lavaPulse * 16;
            g.stroke(this.arena.arenaPath);

            g.lineWidth = 3 + lavaPulse * 2;
            g.strokeStyle = '#ffea00';
            g.shadowColor = '#ff9900';
            g.shadowBlur = 12;
            g.stroke(this.arena.arenaPath);
        } else {
            g.lineWidth = 4.5;
            const isSudden = this.phase === 'sudden';
            g.strokeStyle = isSudden ? 'rgba(244,63,94,0.95)' : 'rgba(56,189,248,0.9)';
            g.shadowColor = isSudden ? '#f43f5e' : '#38bdf8';
            g.shadowBlur = 20;
            g.stroke(this.arena.arenaPath);
        }
        g.restore();

        // 4. Regular Energy Orbs
        this.regularOrbs.forEach(orb => {
            const pulse = 1 + Math.sin(now / 300 + orb.phase) * 0.14;
            g.save();
            T.circle(g, orb.x, orb.y, orb.r * pulse);
            g.fillStyle = '#fbbf24';
            g.shadowColor = '#f59e0b';
            g.shadowBlur = 20;
            g.fill();
            g.restore();
        });

        // 5. Special Power Coins
        this.specialCoins.forEach(coin => {
            const pulse = 1 + Math.sin(now / 220 + coin.phase) * 0.16;
            const r = coin.r * pulse;
            g.save();

            if (coin.type === 'freeze') {
                g.shadowColor = '#06b6d4';
                g.shadowBlur = 26;
                T.circle(g, coin.x, coin.y, r);
                g.fillStyle = '#0284c7';
                g.fill();

                g.strokeStyle = '#e0f2fe';
                g.lineWidth = 2.5;
                g.stroke();

                const rot = now / 400;
                for (let k = 0; k < 4; k++) {
                    const ang = rot + (k * Math.PI) / 2;
                    const sx = coin.x + Math.cos(ang) * (r + 4);
                    const sy = coin.y + Math.sin(ang) * (r + 4);
                    T.circle(g, sx, sy, 3.5);
                    g.fillStyle = '#bae6fd';
                    g.fill();
                }

                T.label('❄️', coin.x, coin.y + 1, { size: 16 });
                T.label('FREEZE', coin.x, coin.y - r - 12, { size: 11, weight: 800, color: '#38bdf8' });
            } else if (coin.type === 'knock') {
                g.shadowColor = '#f43f5e';
                g.shadowBlur = 28;
                T.circle(g, coin.x, coin.y, r);
                g.fillStyle = '#be123c';
                g.fill();

                g.strokeStyle = '#fda4af';
                g.lineWidth = 2.5;
                g.stroke();

                T.label('⚡', coin.x, coin.y + 1, { size: 17 });
                T.label('MEGA KNOCK', coin.x, coin.y - r - 12, { size: 11, weight: 800, color: '#fb7185' });
            } else if (coin.type === 'lava') {
                g.shadowColor = '#ff4500';
                g.shadowBlur = 32;
                T.circle(g, coin.x, coin.y, r);
                g.fillStyle = '#c2410c';
                g.fill();

                g.strokeStyle = '#fed7aa';
                g.lineWidth = 2.5;
                g.stroke();

                T.label('🔥', coin.x, coin.y + 1, { size: 17 });
                T.label('LAVA WALLS', coin.x, coin.y - r - 12, { size: 11, weight: 800, color: '#ff6b35' });
            }
            g.restore();
        });

        // 6. Particles
        this.particles.forEach(p => {
            const alpha = Math.max(0, p.life / p.maxLife);
            g.save();
            g.globalAlpha = alpha;
            if (p.type === 'shockwave') {
                const prog = 1 - alpha;
                const cr = p.r + (p.maxR - p.r) * prog;
                g.beginPath();
                g.arc(p.x, p.y, cr, 0, Math.PI * 2);
                g.strokeStyle = p.color;
                g.lineWidth = 4 * (1 - prog);
                g.stroke();
            } else {
                T.circle(g, p.x, p.y, p.r * alpha);
                g.fillStyle = p.color;
                g.fill();
            }
            g.restore();
        });

        // 7. Players
        Object.keys(this.entities).forEach(id => {
            const e = this.entities[id];
            const p = e.player;
            if (!p || e.dead) return;

            const isFrozen = e.frozenUntil > now;
            const hasFreeze = e.freezePowerUntil > now;
            const hasKnock = e.knockPowerUntil > now;
            const isInvuln = e.invulnerableUntil > now;

            // Hit ripple ring
            if (e.hit > 0.02) {
                g.save();
                T.circle(g, e.x, e.y, e.r + 20 * e.hit);
                g.strokeStyle = 'rgba(255,255,255,' + (0.55 * e.hit) + ')';
                g.lineWidth = 3;
                g.stroke();
                g.restore();
                e.hit *= 0.88;
            }

            const wobble = Math.sin(now / 260 + e.bob) * 2;
            const r = e.r + (e.boost > 0 ? e.boost * 0.5 : 0) + wobble * 0.3;

            // Player Aura (Freeze / Knock Power)
            if (hasFreeze) {
                g.save();
                T.circle(g, e.x, e.y, r + 8 + Math.sin(now / 150) * 3);
                g.strokeStyle = 'rgba(56, 189, 248, 0.75)';
                g.lineWidth = 3;
                g.shadowColor = '#38bdf8';
                g.shadowBlur = 18;
                g.stroke();
                g.restore();
            }
            if (hasKnock) {
                g.save();
                T.circle(g, e.x, e.y, r + 8 + Math.sin(now / 110) * 3);
                g.strokeStyle = 'rgba(244, 63, 94, 0.85)';
                g.lineWidth = 3;
                g.shadowColor = '#f43f5e';
                g.shadowBlur = 22;
                g.stroke();
                g.restore();
            }

            // Invulnerability shield bubble
            if (isInvuln) {
                g.save();
                const shPulse = Math.sin(now / 120) * 2;
                T.circle(g, e.x, e.y, r + 10 + shPulse);
                g.strokeStyle = 'rgba(251, 191, 36, 0.85)';
                g.lineWidth = 3;
                g.shadowColor = '#fbbf24';
                g.shadowBlur = 16;
                g.stroke();
                g.restore();
            }

            // Player Body
            g.save();
            g.shadowColor = p.color;
            g.shadowBlur = e.boost > 0 ? 32 : 16;
            T.circle(g, e.x, e.y, r);
            g.fillStyle = p.color;
            g.fill();
            g.shadowBlur = 0;
            g.lineWidth = 3.5;
            g.strokeStyle = 'rgba(255,255,255,0.92)';
            g.stroke();
            g.restore();

            // Player Avatar
            const isImg = p.avatar && typeof p.avatar === 'string' &&
                (p.avatar.startsWith('data:image/') || p.avatar.startsWith('http://') || p.avatar.startsWith('https://') || p.avatar.startsWith('/'));

            if (isImg) {
                const img = getAvatarImg(p.avatar);
                if (img && img.complete && img.naturalWidth > 0) {
                    g.save();
                    g.beginPath();
                    g.arc(e.x, e.y, r - 3, 0, Math.PI * 2);
                    g.clip();
                    g.drawImage(img, e.x - r + 3, e.y - r + 3, (r - 3) * 2, (r - 3) * 2);
                    g.restore();
                } else {
                    g.font = '24px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
                    g.textAlign = 'center';
                    g.textBaseline = 'middle';
                    g.fillText('👤', e.x, e.y + 1);
                }
            } else {
                g.font = '26px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.fillText(p.avatar || '🎮', e.x, e.y + 1);
            }

            // FROZEN ICE BLOCK OVERLAY
            if (isFrozen) {
                g.save();
                const iceR = r + 6;
                T.roundRect(g, e.x - iceR, e.y - iceR, iceR * 2, iceR * 2, 8);
                g.fillStyle = 'rgba(186, 230, 253, 0.45)';
                g.fill();
                g.lineWidth = 3;
                g.strokeStyle = '#bae6fd';
                g.shadowColor = '#38bdf8';
                g.shadowBlur = 18;
                g.stroke();

                // Cracking frost lines
                g.beginPath();
                g.moveTo(e.x - iceR * 0.6, e.y - iceR * 0.4);
                g.lineTo(e.x - 2, e.y + 3);
                g.lineTo(e.x + iceR * 0.7, e.y - iceR * 0.2);
                g.strokeStyle = '#ffffff';
                g.lineWidth = 2;
                g.stroke();

                const secLeft = ((e.frozenUntil - now) / 1000).toFixed(1);
                T.label(`❄️ ${secLeft}s`, e.x, e.y - r - 48, { size: 14, weight: 800, color: '#38bdf8' });
                g.restore();
            }

            // Power labels
            if (hasFreeze) {
                T.label('❄️ FREEZE', e.x, e.y + r + 16, { size: 11, weight: 800, color: '#38bdf8' });
            } else if (hasKnock) {
                T.label('⚡ MEGA KNOCK', e.x, e.y + r + 16, { size: 11, weight: 800, color: '#fb7185' });
            }

            // Name & Score labels
            T.label(p.name.toUpperCase(), e.x, e.y - r - 16, {
                size: 12, weight: 600, color: 'rgba(255,255,255,0.85)'
            });
            T.label(String(Math.round(this.scores[id] || 0)), e.x, e.y - r - 32, {
                size: 18, color: '#fbbf24'
            });
        });

        // Respawning indicators for dead players
        Object.keys(this.entities).forEach(id => {
            const e = this.entities[id];
            if (e.dead) {
                const sec = Math.max(0, ((e.respawnAt - now) / 1000)).toFixed(1);
                T.label(`💀 ${e.player.name} RESPAWNING IN ${sec}s...`, view.w * 0.5, view.h * 0.5 + 40, {
                    size: 14, weight: 700, color: '#ff4500'
                });
            }
        });

        g.restore(); // restore screenShake translate

        if (!this.ended) this.renderHud(g, view, now);
    }

    renderHud(g, view, now) {
        const left = Math.max(0, Math.ceil((this.matchEndsAt - now) / 1000));
        const mm = String(Math.floor(left / 60)).padStart(2, '0');
        const ss = String(left % 60).padStart(2, '0');

        const isLava = this.lavaWallsEndsAt > now;

        T.label(mm + ':' + ss, view.w * 0.5, 36, {
            size: 40, color: (left <= 15 || isLava) ? '#f43f5e' : 'rgba(255,255,255,0.92)'
        });

        // Global Banner: Lava Walls Active or Sudden Death
        if (isLava) {
            const lavaSec = Math.max(0, ((this.lavaWallsEndsAt - now) / 1000)).toFixed(1);
            g.save();
            const bw = 340;
            const bh = 32;
            const bx = view.w * 0.5 - bw * 0.5;
            const by = 58;
            T.roundRect(g, bx, by, bw, bh, 6);
            g.fillStyle = 'rgba(220, 38, 38, 0.85)';
            g.shadowColor = '#ff2200';
            g.shadowBlur = 18;
            g.fill();
            g.lineWidth = 2;
            g.strokeStyle = '#ffea00';
            g.stroke();
            g.restore();

            T.label(`🔥 LAVA WALLS ACTIVE! ${lavaSec}s 🔥`, view.w * 0.5, 74, {
                size: 14, weight: 800, color: '#ffffff'
            });
        } else if (this.phase === 'sudden') {
            T.label('SUDDEN DEATH', view.w * 0.5, 70, { size: 14, weight: 800, color: '#f43f5e' });
        }

        // Active Toasts / Killfeed (top-left)
        const activeToasts = this.toasts.filter(t => t.expiresAt > now);
        activeToasts.forEach((t, i) => {
            const y = 28 + i * 26;
            g.save();
            g.globalAlpha = Math.min(1, (t.expiresAt - now) / 400);
            T.roundRect(g, 28, y - 10, 290, 22, 6);
            g.fillStyle = 'rgba(6, 12, 28, 0.72)';
            g.fill();
            T.label(t.text, 36, y + 1, {
                size: 11, weight: 700, align: 'left', color: t.color
            });
            g.restore();
        });

        // Top Leaderboard (top-right)
        const rows = T.sorted((this.ctx && this.ctx.players) || C.players || {}, this.scores);
        const top = rows.slice(0, 5);

        top.forEach((r, i) => {
            const y = 28 + i * 28;
            g.save();
            g.globalAlpha = 0.9;
            T.roundRect(g, view.w - 210, y - 12, 182, 24, 6);
            g.fillStyle = 'rgba(6, 10, 24, 0.65)';
            g.fill();
            g.fillStyle = r.color;
            g.fillRect(view.w - 210, y - 12, 3, 24);
            g.restore();

            const rAvatar = (r.avatar && typeof r.avatar === 'string' && r.avatar.startsWith('data:image/')) ? '👤' : (r.avatar || '🎮');
            T.label(rAvatar + ' ' + r.name, view.w - 200, y, {
                size: 12, weight: 600, align: 'left', color: 'rgba(255,255,255,0.92)'
            });
            T.label(String(r.score), view.w - 40, y, {
                size: 14, align: 'right', color: '#fbbf24'
            });
        });
    }

    destroy() {
        this.running = false;
    }
}

C.registerGame({
    id: 'brawl',
    title: 'Bumper Brawl',
    tagline: 'Hot',
    players: '2–8 players',
    control: 'Joystick + boost',
    description: 'Procedural arena with islands and channels. Snag Freeze, Mega-Knock, and Lava Wall coins!',
    accent: '#f43f5e',
    icon: 'flame',
    create: (ctx) => new BumperBrawl(ctx)
});

})(window);

