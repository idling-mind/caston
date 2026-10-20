/* ==========================================================================
   CastOn — QR renderer
   A dependency-free QR encoder (versions 1-9, ECC L/M/Q/H) plus a canvas
   renderer that draws rounded modules and shaped "eyes" so the code belongs
   to the CastOn visual language instead of looking like a pasted-on widget.

   Usage:
     CastOn.qr.draw(canvasEl, 'http://10.0.0.5:8000/controller?code=ABCD', {
         size: 300, dark: '#0b1220', light: '#ffffff', ecc: 'M'
     });
   ========================================================================== */
(function (w) {
    'use strict';

    /* ---------- GF(256) arithmetic ------------------------------------- */
    const EXP = new Uint8Array(512);
    const LOG = new Uint8Array(256);
    (function () {
        let x = 1;
        for (let i = 0; i < 255; i++) {
            EXP[i] = x;
            LOG[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11d;
        }
        for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    })();

    const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

    function polyMul(a, b) {
        const out = new Array(a.length + b.length - 1).fill(0);
        for (let i = 0; i < a.length; i++) {
            for (let j = 0; j < b.length; j++) {
                out[i + j] ^= gfMul(a[i], b[j]);
            }
        }
        return out;
    }

    const GEN_CACHE = {};
    function generatorPoly(ecLen) {
        if (GEN_CACHE[ecLen]) return GEN_CACHE[ecLen];
        let g = [1];
        for (let i = 0; i < ecLen; i++) g = polyMul(g, [1, EXP[i]]);
        GEN_CACHE[ecLen] = g;
        return g;
    }

    function rsEncode(data, ecLen) {
        const g = generatorPoly(ecLen);
        const buf = data.concat(new Array(ecLen).fill(0));
        for (let i = 0; i < data.length; i++) {
            const coef = buf[i];
            if (coef === 0) continue;
            for (let j = 0; j < g.length; j++) {
                buf[i + j] ^= gfMul(g[j], coef);
            }
        }
        return buf.slice(data.length);
    }

    /* ---------- Spec tables -------------------------------------------- */
    // [repetitions, totalCodewords, dataCodewords] per block group
    const RS_BLOCKS = {
        L: [
            [[1, 26, 19]], [[1, 44, 34]], [[1, 70, 55]], [[1, 100, 80]],
            [[1, 134, 108]], [[2, 86, 68]], [[2, 98, 78]], [[2, 121, 97]],
            [[2, 146, 116]]
        ],
        M: [
            [[1, 26, 16]], [[1, 44, 28]], [[1, 70, 44]], [[2, 50, 32]],
            [[2, 67, 43]], [[4, 43, 27]], [[4, 49, 31]],
            [[2, 60, 38], [2, 61, 39]], [[3, 58, 36], [2, 59, 37]]
        ],
        Q: [
            [[1, 26, 13]], [[1, 44, 22]], [[2, 35, 17]], [[2, 50, 24]],
            [[2, 33, 15], [2, 34, 16]], [[4, 43, 19]],
            [[2, 32, 14], [4, 33, 15]], [[4, 40, 18], [2, 41, 19]],
            [[4, 36, 16], [4, 37, 17]]
        ],
        H: [
            [[1, 26, 9]], [[1, 44, 16]], [[2, 35, 13]], [[4, 25, 9]],
            [[2, 33, 11], [2, 34, 12]], [[4, 43, 15]],
            [[4, 39, 13], [1, 40, 14]], [[4, 40, 14], [2, 41, 15]],
            [[4, 36, 12], [4, 37, 13]]
        ]
    };

    // Alignment pattern centres, indexed by (version - 1)
    const ALIGN = [
        [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46]
    ];

    const ECC_BITS = { L: 1, M: 0, Q: 3, H: 2 };
    const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

    const countBits = (mode, version) => {
        const small = version <= 9;
        if (mode === 'numeric') return small ? 10 : 12;
        if (mode === 'alnum') return small ? 9 : 11;
        return small ? 8 : 16;
    };

    /* ---------- Bit stream --------------------------------------------- */
    class BitBuffer {
        constructor() { this.bits = []; }
        put(value, length) {
            for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
        }
        get length() { return this.bits.length; }
        toBytes() {
            while (this.bits.length % 8 !== 0) this.bits.push(0);
            const out = [];
            for (let i = 0; i < this.bits.length; i += 8) {
                let b = 0;
                for (let j = 0; j < 8; j++) b = (b << 1) | this.bits[i + j];
                out.push(b);
            }
            return out;
        }
    }

    /* ---------- BCH helpers -------------------------------------------- */
    function bchDigit(d) {
        let n = 0;
        while (d !== 0) { n++; d >>>= 1; }
        return n;
    }

    function bchTypeInfo(data) {
        let d = data << 10;
        while (bchDigit(d) - bchDigit(0x537) >= 0) {
            d ^= (0x537 << (bchDigit(d) - bchDigit(0x537)));
        }
        return ((data << 10) | d) ^ 0x5412;
    }

    function bchVersion(version) {
        let d = version << 12;
        while (bchDigit(d) - bchDigit(0x1f25) >= 0) {
            d ^= (0x1f25 << (bchDigit(d) - bchDigit(0x1f25)));
        }
        return (version << 12) | d;
    }

    /* ---------- Payload encoding --------------------------------------- */
    function pickMode(text) {
        if (/^[0-9]+$/.test(text)) return 'numeric';
        let alnum = true;
        for (const ch of text) {
            if (ALNUM.indexOf(ch) === -1) { alnum = false; break; }
        }
        return alnum ? 'alnum' : 'byte';
    }

    function utf8Bytes(str) {
        const out = [];
        for (let i = 0; i < str.length; i++) {
            let c = str.charCodeAt(i);
            if (c < 0x80) {
                out.push(c);
            } else if (c < 0x800) {
                out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
            } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
                const c2 = str.charCodeAt(++i);
                c = 0x10000 + (((c - 0xd800) << 10) | (c2 - 0xdc00));
                out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f),
                         0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
            } else {
                out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
            }
        }
        return out;
    }

    /**
     * Encode `text` into a QR module matrix.
     * @returns {{modules: boolean[][], version: number, mask: number, size: number}}
     */
    function encode(text, eccLevel) {
        const level = (eccLevel || 'M').toUpperCase();
        const table = RS_BLOCKS[level];
        if (!table) throw new Error('Unsupported ECC level: ' + level);

        const mode = pickMode(text);
        const payload = mode === 'byte' ? utf8Bytes(text) : text;

        // Longest possible byte-mode payload across all supported versions.
        const MAX_BYTES = table.reduce(
            (sum, groups) => sum + groups.reduce((s, g) => s + g[0] * g[2], 0), 0
        ) - 2;
        if (mode === 'byte' && payload.length > MAX_BYTES) {
            throw new Error('QR payload too long (' + payload.length + ' bytes).');
        }

        // Choose the smallest version that fits.
        let version = 0;
        for (let v = 1; v <= 9; v++) {
            const groups = table[v - 1];
            const capacity = groups.reduce((s, g) => s + g[0] * g[2], 0) * 8;
            const needed = 4 + countBits(mode, v) + payloadCost(mode, payload);
            if (needed <= capacity) { version = v; break; }
        }
        if (!version) throw new Error('QR payload too long.');

        const groups = table[version - 1];
        const totalDataBytes = groups.reduce((s, g) => s + g[0] * g[2], 0);

        /* --- build the bit stream --- */
        const buf = new BitBuffer();
        const modeBits = { numeric: 0b0001, alnum: 0b0010, byte: 0b0100 };
        buf.put(modeBits[mode], 4);
        buf.put(payload.length, countBits(mode, version));

        if (mode === 'numeric') {
            for (let i = 0; i < payload.length; i += 3) {
                const chunk = payload.substr(i, 3);
                buf.put(parseInt(chunk, 10), chunk.length * 3 + 1);
            }
        } else if (mode === 'alnum') {
            for (let i = 0; i < payload.length; i += 2) {
                const a = ALNUM.indexOf(payload[i]);
                if (i + 1 < payload.length) {
                    buf.put(a * 45 + ALNUM.indexOf(payload[i + 1]), 11);
                } else {
                    buf.put(a, 6);
                }
            }
        } else {
            payload.forEach(b => buf.put(b, 8));
        }

        // Terminator, byte align, then alternating pad codewords.
        const capacityBits = totalDataBytes * 8;
        buf.put(0, Math.min(4, capacityBits - buf.length));
        while (buf.length % 8 !== 0) buf.put(0, 1);
        const dataBytes = buf.toBytes();
        const PADS = [0xec, 0x11];
        let padIdx = 0;
        while (dataBytes.length < totalDataBytes) {
            dataBytes.push(PADS[padIdx++ % 2]);
        }

        /* --- split into blocks, add Reed-Solomon parity --- */
        const blocks = [];
        let offset = 0;
        groups.forEach(([count, total, dataLen]) => {
            for (let i = 0; i < count; i++) {
                const chunk = dataBytes.slice(offset, offset + dataLen);
                offset += dataLen;
                blocks.push({ data: chunk, ec: rsEncode(chunk, total - dataLen) });
            }
        });

        /* --- interleave --- */
        const finalBytes = [];
        const maxData = Math.max(...blocks.map(b => b.data.length));
        for (let i = 0; i < maxData; i++) {
            blocks.forEach(b => { if (i < b.data.length) finalBytes.push(b.data[i]); });
        }
        const ecLen = blocks[0].ec.length;
        for (let i = 0; i < ecLen; i++) {
            blocks.forEach(b => finalBytes.push(b.ec[i]));
        }

        /* --- layout --- */
        const size = version * 4 + 17;
        const base = blankMatrix(size);
        placeFunctionPatterns(base, version);

        // Try all eight masks and keep the lowest-penalty result.
        let best = null;
        for (let mask = 0; mask < 8; mask++) {
            const candidate = base.map(row => row.slice());
            placeData(candidate, finalBytes, mask, version);
            placeFormat(candidate, level, mask);
            const penalty = computePenalty(candidate);
            if (!best || penalty < best.penalty) {
                best = { matrix: candidate, penalty, mask };
            }
        }

        return { modules: best.matrix, version, mask: best.mask, size };
    }

    function payloadCost(mode, payload) {
        if (mode === 'numeric') {
            const groups = Math.floor(payload.length / 3);
            return groups * 10 + [0, 4, 7][payload.length % 3];
        }
        if (mode === 'alnum') {
            const pairs = Math.floor(payload.length / 2);
            return pairs * 11 + (payload.length % 2) * 6;
        }
        return payload.length * 8;
    }

    /* ---------- Matrix construction ------------------------------------ */
    function blankMatrix(size) {
        return Array.from({ length: size }, () => new Array(size).fill(null));
    }

    function placeFinder(mods, row, col) {
        const size = mods.length;
        for (let r = -1; r <= 7; r++) {
            if (row + r < 0 || row + r >= size) continue;
            for (let c = -1; c <= 7; c++) {
                if (col + c < 0 || col + c >= size) continue;
                const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6));
                const inRingV = (c >= 0 && c <= 6 && (r === 0 || r === 6));
                const inCore = (r >= 2 && r <= 4 && c >= 2 && c <= 4);
                mods[row + r][col + c] = inRing || inRingV || inCore;
            }
        }
    }

    function placeFunctionPatterns(mods, version) {
        const size = mods.length;

        placeFinder(mods, 0, 0);
        placeFinder(mods, size - 7, 0);
        placeFinder(mods, 0, size - 7);

        // Timing patterns
        for (let i = 8; i < size - 8; i++) {
            if (mods[6][i] === null) mods[6][i] = (i % 2 === 0);
            if (mods[i][6] === null) mods[i][6] = (i % 2 === 0);
        }

        // Alignment patterns
        const centres = ALIGN[version - 1];
        centres.forEach(row => {
            centres.forEach(col => {
                if (mods[row][col] !== null) return;
                for (let r = -2; r <= 2; r++) {
                    for (let c = -2; c <= 2; c++) {
                        const edge = (r === -2 || r === 2 || c === -2 || c === 2);
                        const core = (r === 0 && c === 0);
                        mods[row + r][col + c] = edge || core;
                    }
                }
            });
        });

        // Reserve format-information strips
        for (let i = 0; i < 9; i++) {
            if (mods[8][i] === null) mods[8][i] = false;
            if (mods[i][8] === null) mods[i][8] = false;
        }
        for (let i = 0; i < 8; i++) {
            if (mods[8][size - 1 - i] === null) mods[8][size - 1 - i] = false;
            if (mods[size - 1 - i][8] === null) mods[size - 1 - i][8] = false;
        }
        mods[size - 8][8] = true; // fixed dark module

        // Reserve version-information strips
        if (version >= 7) {
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 3; j++) {
                    mods[size - 11 + j][i] = false;
                    mods[i][size - 11 + j] = false;
                }
            }
        }
    }

    const MASKS = [
        (r, c) => (r + c) % 2 === 0,
        (r) => r % 2 === 0,
        (r, c) => c % 3 === 0,
        (r, c) => (r + c) % 3 === 0,
        (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
        (r, c) => ((r * c) % 2 + (r * c) % 3) === 0,
        (r, c) => (((r * c) % 2 + (r * c) % 3) % 2) === 0,
        (r, c) => (((r + c) % 2 + (r * c) % 3) % 2) === 0
    ];

    function placeData(mods, bytes, mask, version) {
        const size = mods.length;
        const fn = MASKS[mask];
        let bitIndex = 7;
        let byteIndex = 0;
        let row = size - 1;
        let inc = -1;

        for (let col = size - 1; col > 0; col -= 2) {
            if (col === 6) col--;
            for (;;) {
                for (let c = 0; c < 2; c++) {
                    const cc = col - c;
                    if (mods[row][cc] !== null) continue;
                    let dark = false;
                    if (byteIndex < bytes.length) {
                        dark = ((bytes[byteIndex] >>> bitIndex) & 1) === 1;
                    }
                    if (fn(row, cc)) dark = !dark;
                    mods[row][cc] = dark;
                    bitIndex--;
                    if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
                }
                row += inc;
                if (row < 0 || row >= size) { row -= inc; inc = -inc; break; }
            }
        }
    }

    function placeFormat(mods, level, mask) {
        const size = mods.length;
        const bits = bchTypeInfo((ECC_BITS[level] << 3) | mask);

        for (let i = 0; i < 15; i++) {
            const bit = ((bits >> i) & 1) === 1;
            if (i < 6) mods[i][8] = bit;
            else if (i < 8) mods[i + 1][8] = bit;
            else mods[size - 15 + i][8] = bit;

            if (i < 8) mods[8][size - i - 1] = bit;
            else if (i < 9) mods[8][15 - i] = bit;
            else mods[8][15 - i - 1] = bit;
        }
        mods[size - 8][8] = true;
    }

    function computePenalty(mods) {
        const size = mods.length;
        let score = 0;

        // Rule 1 — runs of five or more identical modules
        const runScore = (getter) => {
            let local = 0;
            for (let a = 0; a < size; a++) {
                let run = 1;
                for (let b = 1; b < size; b++) {
                    if (getter(a, b) === getter(a, b - 1)) {
                        run++;
                    } else {
                        if (run >= 5) local += 3 + (run - 5);
                        run = 1;
                    }
                }
                if (run >= 5) local += 3 + (run - 5);
            }
            return local;
        };
        score += runScore((a, b) => mods[a][b]);
        score += runScore((a, b) => mods[b][a]);

        // Rule 2 — 2x2 blocks of one colour
        for (let r = 0; r < size - 1; r++) {
            for (let c = 0; c < size - 1; c++) {
                const v = mods[r][c];
                if (v === mods[r][c + 1] && v === mods[r + 1][c] && v === mods[r + 1][c + 1]) {
                    score += 3;
                }
            }
        }

        // Rule 3 — finder-like 1:1:3:1:1 sequences
        const A = [true, false, true, true, true, false, true, false, false, false, false];
        const B = [false, false, false, false, true, false, true, true, true, false, true];
        const matches = (arr, i, pattern) => {
            for (let k = 0; k < pattern.length; k++) {
                if (arr[i + k] !== pattern[k]) return false;
            }
            return true;
        };
        for (let r = 0; r < size; r++) {
            const rowVals = mods[r];
            const colVals = mods.map(row => row[r]);
            for (let c = 0; c <= size - 11; c++) {
                if (matches(rowVals, c, A) || matches(rowVals, c, B)) score += 40;
                if (matches(colVals, c, A) || matches(colVals, c, B)) score += 40;
            }
        }

        // Rule 4 — deviation from a 50% dark ratio
        let dark = 0;
        mods.forEach(row => row.forEach(v => { if (v) dark++; }));
        const pct = (dark * 100) / (size * size);
        score += Math.floor(Math.abs(pct - 50) / 5) * 10;

        return score;
    }

    /* ---------- Canvas rendering --------------------------------------- */
    function roundRectPath(g, x, y, w, h, r) {
        const rr = Math.max(0, Math.min(r, w / 2, h / 2));
        g.beginPath();
        g.moveTo(x + rr, y);
        g.lineTo(x + w - rr, y);
        g.arcTo(x + w, y, x + w, y + rr, rr);
        g.lineTo(x + w, y + h - rr);
        g.arcTo(x + w, y + h, x + w - rr, y + h, rr);
        g.lineTo(x + rr, y + h);
        g.arcTo(x, y + h, x, y + h - rr, rr);
        g.lineTo(x, y + rr);
        g.arcTo(x, y, x + rr, y, rr);
        g.closePath();
    }

    function finderOrigins(size) {
        return [[0, 0], [0, size - 7], [size - 7, 0]];
    }

    function inFinder(size, r, c) {
        return finderOrigins(size).some(([fr, fc]) =>
            r >= fr && r < fr + 8 && c >= fc && c < fc + 8);
    }

    /**
     * Render a QR code to a canvas.
     * @param {HTMLCanvasElement} canvas
     * @param {string} text
     * @param {{size?:number, quiet?:number, dark?:string, light?:string,
     *          radius?:number, ecc?:string, dpr?:number}} [opts]
     */
    function draw(canvas, text, opts) {
        const o = Object.assign({
            size: 300,
            quiet: 3,
            dark: '#0b1220',
            light: '#ffffff',
            radius: 0.26,
            ecc: 'M',
            dpr: w.devicePixelRatio || 1
        }, opts || {});

        const res = encode(text, o.ecc);
        const n = res.size;
        const total = n + o.quiet * 2;
        const css = o.size;
        const scale = css / total;

        canvas.width = Math.round(css * o.dpr);
        canvas.height = Math.round(css * o.dpr);
        canvas.style.width = css + 'px';
        canvas.style.height = css + 'px';

        const g = canvas.getContext('2d');
        g.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
        g.clearRect(0, 0, css, css);

        if (o.light && o.light !== 'transparent') {
            g.fillStyle = o.light;
            g.fillRect(0, 0, css, css);
        }

        const origin = o.quiet * scale;
        const mod = scale;

        // Data + alignment modules as soft rounded dots.
        g.fillStyle = o.dark;
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                if (!res.modules[r][c]) continue;
                if (inFinder(n, r, c)) continue;
                const x = origin + c * mod;
                const y = origin + r * mod;
                const pad = mod * 0.04;
                roundRectPath(
                    g,
                    x + pad, y + pad,
                    mod - pad * 2, mod - pad * 2,
                    mod * o.radius
                );
                g.fill();
            }
        }

        // Finder "eyes": a shaped ring plus a rounded core.
        finderOrigins(n).forEach(([fr, fc]) => {
            const x = origin + fc * mod;
            const y = origin + fr * mod;
            const r7 = mod * 7;
            const r5 = mod * 5;
            const r3 = mod * 3;

            g.fillStyle = o.dark;
            roundRectPath(g, x, y, r7, r7, mod * 1.9);
            g.fill();

            g.fillStyle = o.light && o.light !== 'transparent' ? o.light : '#ffffff';
            roundRectPath(g, x + mod, y + mod, r5, r5, mod * 1.3);
            g.fill();

            g.fillStyle = o.dark;
            roundRectPath(g, x + mod * 2, y + mod * 2, r3, r3, mod * 0.85);
            g.fill();
        });

        return res;
    }

    w.CastOn = w.CastOn || {};
    w.CastOn.qr = { encode, draw, supported: true };
})(window);
