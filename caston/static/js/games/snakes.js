/* ==========================================================================
   Game — Snakes & Ladders (Realistic Serpents & Mystery Dice Edition)
   - Realistic top-view snakes with biological anatomy, sinuous S-curves,
     exotic species palettes, 3D cylindrical lighting, and dorsal patterns.
   - 6 Hidden Mystery Dice Faces: player chooses one, all 6 reveal, coin hops!
   - Full animated events: swallowed inside the snake (peristaltic bulge)
     and step-by-step ladder climbing with cheerful sound bites.
   - Race to 100: game ends when only ONE player remains!
   - 1–8 players (automatic AI rival bot when playing solo).
   ========================================================================== */
(function (w) {
'use strict';

const CastOn = w.CastOn;
const T = CastOn.tools || {};

const avatarImgCache = new Map();
function getAvatarImg(src) {
    if (!src) return null;
    let img = avatarImgCache.get(src);
    if (!img) {
        img = new Image();
        img.src = src;
        avatarImgCache.set(src, img);
    }
    return img;
}

const BOT_FALLBACK = {
    id: '__bot_slither',
    name: 'Robo-Cobra',
    color: '#f43f5e',
    avatar: '🤖',
    is_vip: false,
    __bot: true
};

/* ---------- Board Layout Constants --------------------------------------- */

const BOARD_ROWS = 10;
const BOARD_COLS = 10;
const TOTAL_TILES = 100;

// Board positions & ladder connections
const LADDERS = [
    { from: 4, to: 14, label: 'Breeze Ladder' },
    { from: 9, to: 31, label: 'Sky Ladder' },
    { from: 20, to: 38, label: 'Highland Stairs' },
    { from: 28, to: 84, label: 'Grand Ascension' }, // Epic giant ladder!
    { from: 40, to: 59, label: 'Timber Rung' },
    { from: 51, to: 67, label: 'Golden Stairway' },
    { from: 63, to: 81, label: 'Cloud Ladder' },
    { from: 71, to: 91, label: 'Summit Ladder' }
];

// Base snake geometry and dorsal species patterns
const SNAKE_SPECIES_BASE = [
    { from: 17, to: 7,  waves: 1.2, flipWave: false, patternType: 'stripes' },
    { from: 54, to: 34, waves: 1.4, flipWave: true,  patternType: 'reticulated' },
    { from: 62, to: 19, waves: 1.6, flipWave: false, patternType: 'rings' },
    { from: 64, to: 60, waves: 1.0, flipWave: true,  patternType: 'diamonds' },
    { from: 87, to: 24, waves: 2.2, flipWave: false, patternType: 'chevrons' },
    { from: 93, to: 73, waves: 1.3, flipWave: true,  patternType: 'blotches' },
    { from: 95, to: 75, waves: 1.3, flipWave: false, patternType: 'hourglass' },
    { from: 98, to: 78, waves: 1.4, flipWave: true,  patternType: 'hexagons' }
];

// Theme-matched snake color palettes for all 5 console themes
const THEME_SNAKE_PALETTES = {
    broadcast: [
        { name: 'Amber Gold Viper', accent: '#f59e0b', bodyDark: '#081226', bodyMid: '#b45309', bodyLight: '#fbbf24', patternColor: '#fef08a', eyeColor: '#f59e0b' },
        { name: 'Royal Cobalt Python', accent: '#3b82f6', bodyDark: '#060b1d', bodyMid: '#1d4ed8', bodyLight: '#60a5fa', patternColor: '#93c5fd', eyeColor: '#38bdf8' },
        { name: 'Crimson Keelback', accent: '#e11d48', bodyDark: '#120a16', bodyMid: '#be123c', bodyLight: '#fb7185', patternColor: '#fecdd3', eyeColor: '#f43f5e' },
        { name: 'Cyan Sea Krait', accent: '#06b6d4', bodyDark: '#041624', bodyMid: '#0891b2', bodyLight: '#67e8f9', patternColor: '#cffafe', eyeColor: '#22d3ee' },
        { name: 'Imperial Violet Boa', accent: '#8b5cf6', bodyDark: '#120d2a', bodyMid: '#6d28d9', bodyLight: '#a78bfa', patternColor: '#f59e0b', eyeColor: '#fbbf24' },
        { name: 'Rose Albino Viper', accent: '#f43f5e', bodyDark: '#1a0b1c', bodyMid: '#e11d48', bodyLight: '#fda4af', patternColor: '#ffffff', eyeColor: '#f43f5e' },
        { name: 'Deep Navy Copperhead', accent: '#3b82f6', bodyDark: '#050a1e', bodyMid: '#1e40af', bodyLight: '#93c5fd', patternColor: '#f59e0b', eyeColor: '#facc15' },
        { name: 'Midnight Electric Cobra', accent: '#0ea5e9', bodyDark: '#060b1d', bodyMid: '#0284c7', bodyLight: '#38bdf8', patternColor: '#e11d48', eyeColor: '#fbbf24' }
    ],
    arcade: [
        { name: 'Raspberry Neon Viper', accent: '#ff2e63', bodyDark: '#15030c', bodyMid: '#e11d48', bodyLight: '#ff2e63', patternColor: '#ffb020', eyeColor: '#ffb020' },
        { name: 'Electric Blue Python', accent: '#2f6bff', bodyDark: '#050a20', bodyMid: '#1d4ed8', bodyLight: '#60a5fa', patternColor: '#ff2e63', eyeColor: '#2fd0e8' },
        { name: 'Cyber Turquoise Krait', accent: '#2fd0e8', bodyDark: '#03141f', bodyMid: '#0891b2', bodyLight: '#2fd0e8', patternColor: '#ff2e63', eyeColor: '#ffb020' },
        { name: 'Marigold Arcade Adder', accent: '#ffb020', bodyDark: '#1c1002', bodyMid: '#d97706', bodyLight: '#ffb020', patternColor: '#ff2e63', eyeColor: '#ffffff' },
        { name: 'Neon Violet Cobra', accent: '#6d28d9', bodyDark: '#0d041e', bodyMid: '#7c3aed', bodyLight: '#a78bfa', patternColor: '#2fd0e8', eyeColor: '#ff2e63' },
        { name: 'Laser Pink Albino', accent: '#f43f5e', bodyDark: '#1a0413', bodyMid: '#be123c', bodyLight: '#fda4af', patternColor: '#ffb020', eyeColor: '#ff2e63' },
        { name: 'Cyber Gold Boa', accent: '#ffb020', bodyDark: '#1a0f02', bodyMid: '#b45309', bodyLight: '#fde047', patternColor: '#2f6bff', eyeColor: '#2fd0e8' },
        { name: 'Pixel Cyan Viper', accent: '#06b6d4', bodyDark: '#050a20', bodyMid: '#0284c7', bodyLight: '#67e8f9', patternColor: '#ff2e63', eyeColor: '#ffb020' }
    ],
    void: [
        { name: 'Phantom Violet Python', accent: '#7c3aed', bodyDark: '#04040a', bodyMid: '#6d28d9', bodyLight: '#a78bfa', patternColor: '#06b6d4', eyeColor: '#22d3ee' },
        { name: 'Neon Cyan Viper', accent: '#06b6d4', bodyDark: '#020b14', bodyMid: '#0891b2', bodyLight: '#22d3ee', patternColor: '#7c3aed', eyeColor: '#a78bfa' },
        { name: 'Hot Magenta Krait', accent: '#e11d48', bodyDark: '#0a0208', bodyMid: '#be123c', bodyLight: '#f43f5e', patternColor: '#22d3ee', eyeColor: '#7c3aed' },
        { name: 'Abyssal Indigo Boa', accent: '#4f46e5', bodyDark: '#02020a', bodyMid: '#3730a3', bodyLight: '#818cf8', patternColor: '#e11d48', eyeColor: '#22d3ee' },
        { name: 'Laser Cyan Cobra', accent: '#22d3ee', bodyDark: '#04040a', bodyMid: '#06b6d4', bodyLight: '#a5f3fc', patternColor: '#7c3aed', eyeColor: '#e11d48' },
        { name: 'Spectral Lavender Albino', accent: '#a78bfa', bodyDark: '#0a0618', bodyMid: '#7c3aed', bodyLight: '#ddd6fe', patternColor: '#06b6d4', eyeColor: '#22d3ee' },
        { name: 'Dark Matter Viper', accent: '#9333ea', bodyDark: '#020005', bodyMid: '#581c87', bodyLight: '#c084fc', patternColor: '#22d3ee', eyeColor: '#a855f7' },
        { name: 'Plasma Rose Viper', accent: '#f43f5e', bodyDark: '#080105', bodyMid: '#9f1239', bodyLight: '#fb7185', patternColor: '#7c3aed', eyeColor: '#06b6d4' }
    ],
    sunset: [
        { name: 'Flame Orange Viper', accent: '#f0592b', bodyDark: '#20050e', bodyMid: '#c2410c', bodyLight: '#fb923c', patternColor: '#ffd166', eyeColor: '#ffd166' },
        { name: 'Crimson Rose Boa', accent: '#b3123f', bodyDark: '#1f0510', bodyMid: '#9f1239', bodyLight: '#fb7185', patternColor: '#ffb020', eyeColor: '#ffd166' },
        { name: 'Golden Amber Python', accent: '#ffb020', bodyDark: '#200806', bodyMid: '#d97706', bodyLight: '#fde047', patternColor: '#b3123f', eyeColor: '#f0592b' },
        { name: 'Deep Plum Krait', accent: '#7c2d8f', bodyDark: '#18031e', bodyMid: '#581c87', bodyLight: '#c084fc', patternColor: '#f0592b', eyeColor: '#ffd166' },
        { name: 'Sunburst Copperhead', accent: '#ff8a3d', bodyDark: '#24070a', bodyMid: '#ea580c', bodyLight: '#fed7aa', patternColor: '#b3123f', eyeColor: '#ffd166' },
        { name: 'Rose Sunset Viper', accent: '#ff2e63', bodyDark: '#260616', bodyMid: '#e11d48', bodyLight: '#fda4af', patternColor: '#ffd166', eyeColor: '#ffb020' },
        { name: 'Dusk Amethyst Viper', accent: '#a855f7', bodyDark: '#15031b', bodyMid: '#7e22ce', bodyLight: '#d8b4fe', patternColor: '#ff8a3d', eyeColor: '#ffd166' },
        { name: 'Molten Gold Cobra', accent: '#ffd166', bodyDark: '#1f0904', bodyMid: '#b45309', bodyLight: '#fef08a', patternColor: '#b3123f', eyeColor: '#f0592b' }
    ],
    candy: [
        { name: 'Mint Emerald Boa', accent: '#34d399', bodyDark: '#04171d', bodyMid: '#059669', bodyLight: '#6ee7b7', patternColor: '#f472b6', eyeColor: '#5eead4' },
        { name: 'Periwinkle Python', accent: '#6366f1', bodyDark: '#070e24', bodyMid: '#4f46e5', bodyLight: '#a5b4fc', patternColor: '#34d399', eyeColor: '#38bdf8' },
        { name: 'Cotton Candy Viper', accent: '#f472b6', bodyDark: '#180814', bodyMid: '#db2777', bodyLight: '#fbcfe8', patternColor: '#5eead4', eyeColor: '#38bdf8' },
        { name: 'Sky Cyan Krait', accent: '#38bdf8', bodyDark: '#051822', bodyMid: '#0284c7', bodyLight: '#7dd3fc', patternColor: '#f472b6', eyeColor: '#a78bfa' },
        { name: 'Lavender Mist Cobra', accent: '#a78bfa', bodyDark: '#0d0c24', bodyMid: '#7c3aed', bodyLight: '#c4b5fd', patternColor: '#34d399', eyeColor: '#f472b6' },
        { name: 'Aqua Sea Viper', accent: '#5eead4', bodyDark: '#031917', bodyMid: '#0d9488', bodyLight: '#99f6e4', patternColor: '#6366f1', eyeColor: '#f472b6' },
        { name: 'Pastel Berry Albino', accent: '#ec4899', bodyDark: '#160512', bodyMid: '#be185d', bodyLight: '#f472b6', patternColor: '#a78bfa', eyeColor: '#5eead4' },
        { name: 'Celestial Indigo Boa', accent: '#818cf8', bodyDark: '#051026', bodyMid: '#4338ca', bodyLight: '#c7d2fe', patternColor: '#5eead4', eyeColor: '#38bdf8' }
    ]
};

// Theme-matched styles for the board frame and alternating tiles
const THEME_BOARD_STYLES = {
    broadcast: { frame: '#060b1d', tileA: '#0f172a', tileB: '#1e293b', border: 'rgba(59, 130, 246, 0.22)' },
    arcade:    { frame: '#050a20', tileA: '#090f2b', tileB: '#141e4a', border: 'rgba(255, 46, 99, 0.24)' },
    void:      { frame: '#04040a', tileA: '#090915', tileB: '#15142a', border: 'rgba(124, 58, 237, 0.28)' },
    sunset:    { frame: '#1f0510', tileA: '#240816', tileB: '#3a0d20', border: 'rgba(240, 89, 43, 0.24)' },
    candy:     { frame: '#051820', tileA: '#09222c', tileB: '#113340', border: 'rgba(52, 211, 153, 0.24)' }
};

const SNAKES = SNAKE_SPECIES_BASE;

/* ---------- Audio Synthesizer -------------------------------------------- */

class SnakesAudioEngine {
    constructor() {
        this.ctx = null;
    }

    getAudioContext() {
        try {
            if (!this.ctx) {
                const AC = w.AudioContext || w.webkitAudioContext;
                if (AC) this.ctx = new AC();
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            return this.ctx;
        } catch (e) {
            return null;
        }
    }

    /** Coin hop step sound (playful rising blip) */
    playHop(stepIdx) {
        const ac = this.getAudioContext();
        if (!ac) return;
        try {
            const baseFreq = 420 + (stepIdx % 6) * 55;
            const t = ac.currentTime;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(baseFreq, t);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, t + 0.08);

            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

            osc.connect(gain);
            gain.connect(ac.destination);
            osc.start(t);
            osc.stop(t + 0.1);
        } catch (e) {}
    }

    /** Cheerful ascending arpeggio for climbing stairs / ladder */
    playLadderClimb() {
        const ac = this.getAudioContext();
        if (!ac) return;
        try {
            // Bright, cheerful bell chime arpeggio: C5, E5, G5, B5, C6, E6
            const notes = [523.25, 659.25, 783.99, 987.77, 1046.50, 1318.51];
            notes.forEach((freq, idx) => {
                setTimeout(() => {
                    if (!this.ctx) return;
                    const t = this.ctx.currentTime;
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, t);

                    gain.gain.setValueAtTime(0.0001, t);
                    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.015);
                    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(t);
                    osc.stop(t + 0.3);
                }, idx * 75);
            });
        } catch (e) {}
    }

    /** Comical & dramatic swallowed by snake event */
    playSnakeSwallow() {
        const ac = this.getAudioContext();
        if (!ac) return;
        try {
            const t = ac.currentTime;

            // 1. Snake hiss / dramatic wobble tone
            const osc1 = ac.createOscillator();
            const gain1 = ac.createGain();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(420, t);
            osc1.frequency.exponentialRampToValueAtTime(140, t + 0.38);

            gain1.gain.setValueAtTime(0.0001, t);
            gain1.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
            gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);

            osc1.connect(gain1);
            gain1.connect(ac.destination);
            osc1.start(t);
            osc1.stop(t + 0.42);

            // 2. Playful cartoon "GULP / wobble" tones during slide
            const gulps = [280, 240, 200, 160];
            gulps.forEach((f, i) => {
                setTimeout(() => {
                    if (!this.ctx) return;
                    const gt = this.ctx.currentTime;
                    const gOsc = this.ctx.createOscillator();
                    const gGain = this.ctx.createGain();
                    gOsc.type = 'sine';
                    gOsc.frequency.setValueAtTime(f, gt);
                    gOsc.frequency.exponentialRampToValueAtTime(f * 0.8, gt + 0.1);

                    gGain.gain.setValueAtTime(0.001, gt);
                    gGain.gain.exponentialRampToValueAtTime(0.14, gt + 0.02);
                    gGain.gain.exponentialRampToValueAtTime(0.001, gt + 0.12);

                    gOsc.connect(gGain);
                    gGain.connect(this.ctx.destination);
                    gOsc.start(gt);
                    gOsc.stop(gt + 0.14);
                }, 160 + i * 110);
            });

            // 3. Comical "POP!" at the tail exit
            setTimeout(() => {
                if (!this.ctx) return;
                const pt = this.ctx.currentTime;
                const pOsc = this.ctx.createOscillator();
                const pGain = this.ctx.createGain();
                pOsc.type = 'triangle';
                pOsc.frequency.setValueAtTime(160, pt);
                pOsc.frequency.exponentialRampToValueAtTime(480, pt + 0.07);

                pGain.gain.setValueAtTime(0.001, pt);
                pGain.gain.exponentialRampToValueAtTime(0.22, pt + 0.015);
                pGain.gain.exponentialRampToValueAtTime(0.001, pt + 0.09);

                pOsc.connect(pGain);
                pGain.connect(this.ctx.destination);
                pOsc.start(pt);
                pOsc.stop(pt + 0.11);
            }, 640);

        } catch (e) {}
    }

    /** Tactile click when picking a card */
    playCardPick() {
        const ac = this.getAudioContext();
        if (!ac) return;
        try {
            const t = ac.currentTime;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(680, t);
            osc.frequency.exponentialRampToValueAtTime(320, t + 0.06);

            gain.gain.setValueAtTime(0.001, t);
            gain.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

            osc.connect(gain);
            gain.connect(ac.destination);
            osc.start(t);
            osc.stop(t + 0.08);
        } catch (e) {}
    }

    /** Dramatic reveal chord when all 6 faces flip */
    playRevealChord() {
        const ac = this.getAudioContext();
        if (!ac) return;
        try {
            const freqs = [392, 493.88, 587.33, 783.99]; // G Major
            freqs.forEach((f, i) => {
                setTimeout(() => {
                    if (!this.ctx) return;
                    const t = this.ctx.currentTime;
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(f, t);

                    gain.gain.setValueAtTime(0.001, t);
                    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(t);
                    osc.stop(t + 0.38);
                }, i * 40);
            });
        } catch (e) {}
    }

    /** Cheerful ascending chime when entering arena */
    playEnterArena() {
        const ac = this.getAudioContext();
        if (!ac) return;
        try {
            const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5 to C6 arpeggio
            freqs.forEach((f, i) => {
                setTimeout(() => {
                    if (!this.ctx) return;
                    const t = this.ctx.currentTime;
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(f, t);
                    gain.gain.setValueAtTime(0.001, t);
                    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(t);
                    osc.stop(t + 0.32);
                }, i * 70);
            });
        } catch (e) {}
    }

    /** Triumphant celebration fanfare when player finishes the race */
    playCelebrationFanfare() {
        const ac = this.getAudioContext();
        if (!ac) return;
        try {
            const freqs = [392.00, 523.25, 659.25, 783.99, 1046.50, 1318.51];
            freqs.forEach((f, i) => {
                setTimeout(() => {
                    if (!this.ctx) return;
                    const t = this.ctx.currentTime;
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(f, t);
                    gain.gain.setValueAtTime(0.001, t);
                    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start(t);
                    osc.stop(t + 0.5);
                }, i * 85);
            });
        } catch (e) {}
    }

    /** Soft locked tone when trying to move out of gate without a 1 */
    playLockedGate() {
        const ac = this.getAudioContext();
        if (!ac) return;
        try {
            const t = ac.currentTime;
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, t);
            osc.frequency.setValueAtTime(160, t + 0.08);
            gain.gain.setValueAtTime(0.001, t);
            gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            osc.connect(gain);
            gain.connect(ac.destination);
            osc.start(t);
            osc.stop(t + 0.2);
        } catch (e) {}
    }
}

/* ==========================================================================
   Main Game Class — SnakesAndLaddersGame
   ========================================================================== */

class SnakesAndLaddersGame extends CastOn.Game {
    constructor(ctx) {
        super(ctx);
        this.ctx = ctx;
        this.running = true;
        this.rafId = null;

        this.sound = new SnakesAudioEngine();

        // Game State
        this.playerState = {}; // playerId -> { pos: 1..100, finished: false, finishRank: null, score: 0 }
        this.turnOrder = [];
        this.turnIndex = 0;
        this.activePlayerId = null;
        this.escapedRankCounter = 1;
        this.gameOver = false;
        this.winnerPodium = []; // Array of ranked player records

        // Turn & Dice State
        // Phases: 'pick_die' -> 'flipping' -> 'revealed' -> 'moving' -> 'special_event' -> 'turn_done'
        this.phase = 'pick_die';
        this.hoverCardIndex = 0; // 0..5
        this.chosenCardIndex = null;
        this.hiddenDiceFaces = [1, 2, 3, 4, 5, 6]; // shuffled per turn
        this.flipProgress = 0; // 0.0 -> 1.0
        this.revealedAt = 0;
        this.rolledNumber = 0;

        // Animated movement
        this.hopSteps = []; // Queue of square numbers to hop through
        this.currentHopStart = 0;
        this.currentHopTarget = 0;
        this.hopProgress = 1.0;
        this.activeSpecialEvent = null; // { type: 'snake'|'ladder', item, progress: 0..1, banner: '' }

        // Visual effects & particles
        this.particles = [];
        this.screenShake = 0;
        this.bannerMessage = '';
        this.bannerUntil = 0;

        // Precalculated Snake curves & geometry cache
        this.snakeSplines = new Map();

        this.lastFrame = performance.now();

        this.syncPlayers();
        this.setupNewTurn(true);
        this.updateControllerLayouts();

        this.ctx.sound.fanfare();

        this.loop = this.loop.bind(this);
        this.rafId = requestAnimationFrame(this.loop);
    }

    getThemeId() {
        return document.documentElement.dataset.theme || localStorage.getItem('caston_theme') || 'broadcast';
    }

    getThemedSnake(snakeBase, idx) {
        const theme = this.getThemeId();
        const palettes = THEME_SNAKE_PALETTES[theme] || THEME_SNAKE_PALETTES.broadcast;
        const colorSet = palettes[idx % palettes.length];
        return Object.assign({}, snakeBase, colorSet);
    }

    getScale() {
        const v = this.ctx.view || { w: 1280, h: 720, scale: 1 };
        return (typeof v.scale === 'number' && v.scale > 0)
            ? v.scale
            : Math.min(v.w / 1280, v.h / 720) || 1;
    }

    getAllParticipants() {
        const real = Object.assign({}, this.ctx.players || {});
        const keys = Object.keys(real);
        if (keys.length === 1) {
            const p0 = real[keys[0]];
            const botColor = (p0 && p0.color && p0.color.toLowerCase() === '#f43f5e') ? '#10b981' : '#f43f5e';
            real[BOT_FALLBACK.id] = Object.assign({}, BOT_FALLBACK, { color: botColor });
        }
        return real;
    }

    syncPlayers() {
        const participants = this.getAllParticipants();
        const ids = Object.keys(participants);

        ids.forEach(id => {
            if (!this.playerState[id]) {
                this.playerState[id] = {
                    pos: 0, // Starts at 0: inside the Start Gate until rolling a 1
                    finished: false,
                    finishRank: null,
                    score: 0,
                    botThinkUntil: 0
                };
            }
        });

        // Retain playerState records permanently during the game session!
        // Deleting playerState was the root cause of scores and board positions being wiped
        // or inherited by other players when a phone locked/disconnected.
        Object.keys(this.playerState).forEach(id => {
            const p = participants[id];
            this.playerState[id].disconnected = (!p || p.connected === false);
        });

        this.turnOrder = ids;
        if (this.activePlayerId && this.turnOrder.includes(this.activePlayerId)) {
            this.turnIndex = this.turnOrder.indexOf(this.activePlayerId);
        } else if (this.turnIndex >= this.turnOrder.length) {
            this.turnIndex = 0;
        }
    }

    onPlayersSync() {
        this.syncPlayers();
        this.checkGameEnd();
        this.updateControllerLayouts();
    }

    onResize(view) {
        // Layout recalculates dynamically in computeLayout()
        this.snakeSplines.clear(); // invalidate cached canvas coordinates
    }

    /* ---------- Coordinates & Board Geometry --------------------------------- */

    computeLayout() {
        const v = this.ctx.view || { w: 1280, h: 656 };
        const s = this.getScale();

        // 10x10 Board occupies the RIGHT side
        const boardPadding = 24 * s;
        const availH = Math.max(300, v.h - 48 * s);
        const boardSize = Math.floor(Math.min(availH, v.w * 0.52));
        const cellSize = boardSize / BOARD_COLS;
        const boardX = Math.floor(v.w - boardPadding - boardSize);
        const boardY = Math.floor((v.h - boardSize) / 2);

        // Start Gate Dock (adjacent to Tile 1 at bottom-left of board)
        const gateW = 96 * s;
        const gateGap = 16 * s;
        const gateX = boardX - gateW - gateGap;
        const gateY = boardY + (BOARD_ROWS - 1) * cellSize;
        const gateH = cellSize;

        // Sidebar on the LEFT side
        const sideX = boardPadding;
        const sideW = Math.max(280, gateX - sideX - 20 * s);

        return {
            v, s,
            board: {
                x: boardX,
                y: boardY,
                size: boardSize,
                cellSize: cellSize,
                w: boardSize,
                h: boardSize
            },
            gate: {
                x: gateX,
                y: gateY,
                w: gateW,
                h: gateH,
                gap: gateGap
            },
            sidebar: {
                x: sideX,
                y: boardY,
                w: sideW,
                h: boardSize
            }
        };
    }

    /**
     * Converts tile number 1..100 into board grid row and column.
     * Row 0 is at the bottom, Row 9 at the top.
     * Alternates direction: row 0 left-to-right, row 1 right-to-left, etc.
     */
    getTileRowCol(tileNum) {
        const n = Math.max(1, Math.min(100, Math.floor(tileNum)));
        const row = Math.floor((n - 1) / BOARD_COLS);
        const colInRow = (n - 1) % BOARD_COLS;
        const col = (row % 2 === 0) ? colInRow : (BOARD_COLS - 1 - colInRow);
        return { row, col };
    }

    /** Returns pixel center coordinates (cx, cy) for any square 1..100 or Start Gate (0) */
    getTileCenter(tileNum, board, gate) {
        if (!tileNum || tileNum <= 0) {
            const g = gate || (this.computeLayout().gate);
            return {
                x: g.x + g.w * 0.45,
                y: g.y + g.h * 0.5
            };
        }
        const { row, col } = this.getTileRowCol(tileNum);
        const cx = board.x + (col + 0.5) * board.cellSize;
        // row 0 is at the bottom of the board
        const cy = board.y + (BOARD_ROWS - 1 - row + 0.5) * board.cellSize;
        return { x: cx, y: cy };
    }

    /* ---------- Turn Lifecycle & Mystery Dice -------------------------------- */

    setupNewTurn(keepCurrentPlayer = false) {
        if (this.gameOver) return;

        const activeIds = this.turnOrder.filter(id => this.playerState[id] && !this.playerState[id].finished);
        if (activeIds.length <= 1) {
            this.checkGameEnd();
            return;
        }

        // Advance to next active (non-finished) player unless keepCurrentPlayer is true
        if (!keepCurrentPlayer) {
            let tries = 0;
            this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
            while (tries < this.turnOrder.length) {
                const candidateId = this.turnOrder[this.turnIndex];
                if (this.playerState[candidateId] && !this.playerState[candidateId].finished) {
                    break;
                }
                this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
                tries++;
            }
        }

        // Lock in the active player ID for the entire lifecycle of this turn
        this.activePlayerId = this.turnOrder[this.turnIndex] || this.turnOrder[0];
        const currentId = this.activePlayerId;
        const player = this.getAllParticipants()[currentId];

        // Shuffle all 6 dice faces for fair mystery pick
        this.hiddenDiceFaces = [1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
        this.phase = 'pick_die';
        this.hoverCardIndex = 0;
        this.chosenCardIndex = null;
        this.flipProgress = 0;
        this.hopSteps = [];
        this.activeSpecialEvent = null;

        // If bot or temporarily disconnected player's turn, schedule automated pick
        if (player && (player.__bot || player.connected === false)) {
            const delay = player.__bot ? (1100 + Math.random() * 500) : 4000;
            if (this.playerState[currentId]) {
                this.playerState[currentId].botThinkUntil = performance.now() + delay;
            }
        }

        this.updateControllerLayouts();
    }

    getCurrentPlayerId() {
        return this.activePlayerId || this.turnOrder[this.turnIndex] || this.turnOrder[0];
    }

    getCurrentPlayer() {
        const id = this.getCurrentPlayerId();
        return this.getAllParticipants()[id] || null;
    }

    updateControllerLayouts() {
        const participants = this.getAllParticipants();
        const activeId = this.getCurrentPlayerId();
        const activePlayer = participants[activeId];
        const activeName = activePlayer ? activePlayer.name : 'Player';

        Object.keys(participants).forEach(id => {
            const p = participants[id];
            if (p.__bot) return;

            const isMyTurn = (id === activeId) && !this.gameOver;
            const pState = this.playerState[id];

            if (this.gameOver) {
                this.ctx.controller.setLayout('dpad', {
                    title: '🏁 Game Over!',
                    subtitle: 'Press A on VIP phone to return to console lobby.',
                    actionLabel: 'Lobby'
                }, id);
                return;
            }

            if (pState && pState.finished) {
                this.ctx.controller.setLayout('dpad', {
                    title: `🏆 #${pState.finishRank} Place!`,
                    subtitle: `Spectating: ${activeName}'s turn`,
                    actionLabel: 'Spectate'
                }, id);
                return;
            }

            if (isMyTurn) {
                const isPicking = (this.phase === 'pick_die');
                const atGate = (pState && pState.pos === 0);
                let title = isPicking
                    ? (atGate ? '🎲 Roll 1 to Enter Arena!' : '🎲 Your Turn · Select Die')
                    : `🎲 Rolled a ${this.rolledNumber}!`;
                let subtitle = isPicking
                    ? (atGate ? 'D-Pad selects · A rolls · Must get 1 to enter! (6 gives extra turn)' : 'D-Pad selects · A rolls! (Roll 6 for extra turn)')
                    : (atGate && this.rolledNumber !== 1
                        ? (this.rolledNumber === 6 ? 'Needs 1 to enter, but rolls again!' : 'Need a 1 to enter the arena!')
                        : `Moving on tile ${pState ? pState.pos : 1}...`);
                let actionLabel = isPicking ? 'Roll' : 'Rolling...';

                this.ctx.controller.setLayout('dpad', {
                    title,
                    subtitle,
                    actionLabel
                }, id);
            } else {
                this.ctx.controller.setLayout('dpad', {
                    title: `Waiting for ${activeName}`,
                    subtitle: `${activeName} is choosing a mystery die...`,
                    actionLabel: 'Wait'
                }, id);
            }
        });
    }

    chooseCard(cardIndex) {
        if (this.phase !== 'pick_die' || this.gameOver) return;
        const idx = Math.max(0, Math.min(5, Math.floor(cardIndex)));

        this.chosenCardIndex = idx;
        this.rolledNumber = this.hiddenDiceFaces[idx];
        this.phase = 'flipping';
        this.flipProgress = 0;
        this.sound.playCardPick();

        this.ctx.controller.vibrate(40);
        this.updateControllerLayouts();
    }

    /* ---------- Input Handling ----------------------------------------------- */

    onInput(playerId, data) {
        if (this.gameOver) {
            if (data.action === 'btn' && (data.button === 'A' || data.button === 'B') && data.state === 'down') {
                if (playerId === this.ctx.vipId) {
                    this.ctx.backToLobby();
                }
            }
            return;
        }

        const activeId = this.getCurrentPlayerId();

        // Direct tap on mystery dice buttons from mobile phone (if available)
        if (data.action === 'pick_dice') {
            if (playerId === activeId && this.phase === 'pick_die') {
                this.chooseCard(data.index);
            }
            return;
        }

        // Gamepad navigation (D-pad Left/Right/Up/Down + A to confirm)
        if (data.action === 'btn' && data.state === 'down') {
            if (playerId === activeId && this.phase === 'pick_die') {
                let moved = false;
                const col = this.hoverCardIndex % 3;
                const row = Math.floor(this.hoverCardIndex / 3);

                if (data.button === 'LEFT') {
                    const nextCol = (col - 1 + 3) % 3;
                    this.hoverCardIndex = row * 3 + nextCol;
                    moved = true;
                } else if (data.button === 'RIGHT') {
                    const nextCol = (col + 1) % 3;
                    this.hoverCardIndex = row * 3 + nextCol;
                    moved = true;
                } else if (data.button === 'UP' || data.button === 'DOWN') {
                    const nextRow = (row === 0) ? 1 : 0;
                    this.hoverCardIndex = nextRow * 3 + col;
                    moved = true;
                } else if (data.button === 'A') {
                    this.chooseCard(this.hoverCardIndex);
                }

                if (moved) {
                    this.sound.playCardPick();
                    this.ctx.controller.vibrate(25, playerId);
                }
            }
        }
    }

    /* ---------- Animation & Movement Mechanics ------------------------------ */

    startCoinMovement() {
        const currentId = this.getCurrentPlayerId();
        const pState = this.playerState[currentId];
        const startPos = pState ? pState.pos : 0;
        const roll = this.rolledNumber;

        // Rule: A player can enter the arena only if they get 1 on the dice.
        if (startPos === 0) {
            if (roll === 1) {
                // Enter arena!
                this.hopSteps = [1];
                this.currentHopStart = 0;
                this.currentHopTarget = 1;
                this.hopProgress = 0;
                this.phase = 'moving';
                this.bannerMessage = `🎉 ${this.getCurrentPlayer().name} rolled 1 and entered the arena!`;
                this.bannerUntil = performance.now() + 2500;
                this.sound.playEnterArena();
            } else {
                // Cannot enter without 1: stay at gate with a small bounce
                this.hopSteps = [0];
                this.currentHopStart = 0;
                this.currentHopTarget = 0;
                this.hopProgress = 0;
                this.phase = 'moving';
                this.sound.playLockedGate();
                if (roll === 6) {
                    this.bannerMessage = `🔒 Needs a 1 to enter! Rolled a 6 · Rolls again! 🎲`;
                } else {
                    this.bannerMessage = `🔒 Needs a 1 to enter the arena! Rolled a ${roll}.`;
                }
                this.bannerUntil = performance.now() + 2500;
            }
            return;
        }

        // Build step-by-step path along board
        this.hopSteps = [];
        let curr = startPos;
        for (let i = 1; i <= roll; i++) {
            curr++;
            if (curr > TOTAL_TILES) {
                // Classic bounce back if overshooting 100
                curr = TOTAL_TILES - (curr - TOTAL_TILES);
            }
            this.hopSteps.push(curr);
        }

        this.currentHopStart = startPos;
        this.currentHopTarget = this.hopSteps.length > 0 ? this.hopSteps[0] : startPos;
        this.hopProgress = 0;
        this.phase = 'moving';
    }

    finishMovementAndCheckEvents() {
        const currentId = this.getCurrentPlayerId();
        const pState = this.playerState[currentId];
        const landingSquare = pState ? pState.pos : 0;

        // 0. Stayed at Gate (could not enter)
        if (landingSquare === 0) {
            this.phase = 'turn_done';
            setTimeout(() => {
                this.completeTurn();
            }, 800);
            return;
        }

        // 1. Check if reached Goal 100!
        if (landingSquare === TOTAL_TILES) {
            pState.finished = true;
            pState.finishRank = this.escapedRankCounter++;
            pState.score = Math.max(100, 1000 - (pState.finishRank - 1) * 200);

            const rankWord = (pState.finishRank === 1) ? '1st Place Champion!' : (pState.finishRank === 2 ? '2nd Place Runner-Up!' : `${pState.finishRank}th Place!`);
            this.triggerPlayerCelebration(currentId, pState.finishRank, rankWord);
            return;
        }

        // 2. Check if landed on a Ladder base
        const ladder = LADDERS.find(l => l.from === landingSquare);
        if (ladder) {
            this.activeSpecialEvent = {
                type: 'ladder',
                item: ladder,
                from: ladder.from,
                to: ladder.to,
                progress: 0,
                duration: 1500
            };
            this.phase = 'special_event';
            this.bannerMessage = `🪜 LADDER! Climbing up to square ${ladder.to}!`;
            this.bannerUntil = performance.now() + 2200;

            this.sound.playLadderClimb();
            this.spawnLadderSparkles(ladder);
            return;
        }

        // 3. Check if landed on a Snake head
        const snakeBase = SNAKES.find(s => s.from === landingSquare);
        if (snakeBase) {
            const sIdx = SNAKES.indexOf(snakeBase);
            const snake = this.getThemedSnake(snakeBase, sIdx);
            this.activeSpecialEvent = {
                type: 'snake',
                item: snake,
                from: snake.from,
                to: snake.to,
                progress: 0,
                duration: 2100
            };
            this.phase = 'special_event';
            this.bannerMessage = `🐍 GULP! Swallowed by the ${snake.name}!`;
            this.bannerUntil = performance.now() + 2600;

            this.sound.playSnakeSwallow();
            this.screenShake = 12;
            return;
        }

        // 4. Normal tile landing: turn concludes smoothly (6 grants extra turn)
        this.phase = 'turn_done';
        setTimeout(() => {
            this.completeTurn();
        }, 750);
    }

    completeTurn() {
        const currentId = this.getCurrentPlayerId();
        const pState = this.playerState[currentId];
        const player = this.getCurrentPlayer();

        // If player rolled 6 and hasn't finished, allow another turn!
        if (this.rolledNumber === 6 && (!pState || !pState.finished)) {
            const atGate = (pState && pState.pos === 0);
            const extraNote = atGate ? 'Needs 1 to enter, but rolls again!' : 'Roll again!';
            this.bannerMessage = `🎲 ROLLED A 6! Extra Turn for ${player ? player.name : 'Player'}! (${extraNote}) 🎉`;
            this.bannerUntil = performance.now() + 2600;
            this.ctx.sound.success();
            this.setupNewTurn(true);
        } else {
            this.setupNewTurn(false);
        }
    }

    triggerPlayerCelebration(playerId, rank, rankWord) {
        const p = this.getAllParticipants()[playerId] || {};
        this.phase = 'celebration';
        this.spawnCelebrationConfetti();
        setTimeout(() => this.spawnCelebrationConfetti(), 450);
        setTimeout(() => this.spawnCelebrationConfetti(), 1100);

        this.sound.playCelebrationFanfare();
        this.ctx.sound.fanfare();
        this.ctx.controller.vibrate(120, playerId);

        const html = `
            <div class="snakes-celebration-scrim">
                <div class="celebration-card" style="--ring-color:${p.color || '#f59e0b'}">
                    <div class="celebration-card__crown">👑</div>
                    <div class="avatar avatar--xl pulse-avatar" style="--ring-color:${p.color || '#f59e0b'}">
                        ${T.avatar(p.avatar)}
                    </div>
                    <h2 class="display t-xl celebration-name">${CastOn.escapeHtml(p.name)} Ascended!</h2>
                    <div class="celebration-badge">${rankWord}</div>
                    <p class="muted t-sm" style="margin-top:10px">Conquered tile 100 and escaped the serpents!</p>
                </div>
            </div>
        `;
        this.ctx.setOverlay(html);

        setTimeout(() => {
            this.ctx.setOverlay('');
            const gameOver = this.checkGameEnd();
            if (!gameOver) {
                this.bannerMessage = `🏁 ${p.name} finished #${rank}! Race continues...`;
                this.bannerUntil = performance.now() + 2500;
                this.setupNewTurn(false);
            }
        }, 3400);
    }

    /** Game ends when only ONE player remains on the board! */
    checkGameEnd() {
        const activeRacers = this.turnOrder.filter(id => this.playerState[id] && !this.playerState[id].finished);

        // If only 1 player remains, the game finishes!
        if (activeRacers.length <= 1 && this.turnOrder.length >= 2) {
            this.gameOver = true;

            // The remaining player gets the final rank
            if (activeRacers.length === 1) {
                const lastId = activeRacers[0];
                const lastState = this.playerState[lastId];
                if (lastState && !lastState.finished) {
                    lastState.finished = true;
                    lastState.finishRank = this.escapedRankCounter++;
                    lastState.score = Math.max(10, 1000 - (lastState.finishRank - 1) * 200);
                }
            }

            // Build podium rows sorted by rank (including any players retained in playerState)
            const participants = this.getAllParticipants();
            const allKnownIds = Array.from(new Set([...this.turnOrder, ...Object.keys(this.playerState)]));
            this.winnerPodium = allKnownIds.map(id => {
                const p = participants[id] || {};
                const st = this.playerState[id] || {};
                return {
                    id: id,
                    name: p.name || 'Player',
                    color: p.color || '#2563EB',
                    avatar: p.avatar || '🎮',
                    score: st.score || 0,
                    rank: st.finishRank || (100 - (st.pos || 0)),
                    is_vip: p.is_vip
                };
            }).sort((a, b) => {
                if (a.rank !== b.rank) return a.rank - b.rank;
                return b.score - a.score;
            });

            this.phase = 'game_over';
            this.spawnCelebrationConfetti();
            this.ctx.sound.fanfare();
            this.updateControllerLayouts();
            this.renderGameOverOverlay();
            return true;
        }
        return false;
    }

    renderGameOverOverlay() {
        const top = this.winnerPodium[0];
        const rows = this.winnerPodium.map(p => ({
            name: p.name,
            color: p.color,
            avatar: p.avatar,
            score: `Rank #${p.rank}`
        }));

        const html = `
            <div class="snakes-results-scrim">
                <div class="scoreboard" style="animation: popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);">
                    <div class="scoreboard__head">
                        <p class="eyebrow is-accent">Race Concluded · Only 1 Remained!</p>
                        <h2 class="display t-xl">${CastOn.escapeHtml(top ? top.name : 'Winner')} Ascends! 👑</h2>
                        <p class="muted t-sm" style="margin-top:6px">First to reach the 100th tile and conquer the serpents.</p>
                    </div>

                    <div class="podium">
                        ${this.winnerPodium.slice(0, 3).map((r, i) => `
                            <div class="podium__slot podium__slot--${i + 1}" style="--ring-color:${r.color}">
                                <span class="podium__place">${i === 0 ? '🏆' : (i + 1)}</span>
                                <span class="avatar avatar--lg" style="--ring-color:${r.color}">${T.avatar(r.avatar)}</span>
                                <span class="podium__name">${CastOn.escapeHtml(r.name)}</span>
                                <span class="podium__score">Rank #${r.rank}</span>
                            </div>
                        `).join('')}
                    </div>

                    ${this.winnerPodium.length > 3 ? `
                        <div class="scoreboard__rest">
                            <div class="lb lb--tight">
                                ${this.winnerPodium.slice(3).map(r => `
                                    <div class="lb__row" style="--ring-color:${r.color}">
                                        <span class="lb__rank">#${r.rank}</span>
                                        <span class="row" style="gap:10px;min-width:0">
                                            <span class="avatar avatar--sm" style="--ring-color:${r.color}">${T.avatar(r.avatar)}</span>
                                            <span class="lb__name">${CastOn.escapeHtml(r.name)}</span>
                                        </span>
                                        <span class="lb__score">Tile ${this.playerState[r.id] ? this.playerState[r.id].pos : 1}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <p class="scoreboard__foot">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
                            <path d="M2.5 4.5 6 16h12l3.5-11.5-5.75 6.25L12 4l-3.75 6.75z"/>
                        </svg>
                        <span>Leader: Press A on controller to return to Console Lobby</span>
                    </p>
                </div>
            </div>
        `;
        this.ctx.setOverlay(html);
    }

    /* ---------- Particle Systems --------------------------------------------- */

    spawnCelebrationConfetti() {
        const layout = this.computeLayout();
        const cx = layout.board.x + layout.board.w / 2;
        const cy = layout.board.y + layout.board.h / 2;
        const colors = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#facc15'];

        for (let i = 0; i < 90; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 8;
            this.particles.push({
                x: cx + (Math.random() - 0.5) * 80,
                y: cy + (Math.random() - 0.5) * 80,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2.5,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: 4 + Math.random() * 5,
                rot: Math.random() * Math.PI,
                rotV: (Math.random() - 0.5) * 0.2,
                alpha: 1.0,
                life: 1.0,
                decay: 0.007 + Math.random() * 0.012
            });
        }
    }

    spawnLadderSparkles(ladder) {
        const layout = this.computeLayout();
        const fromPos = this.getTileCenter(ladder.from, layout.board);
        const toPos = this.getTileCenter(ladder.to, layout.board);

        for (let i = 0; i < 35; i++) {
            const t = Math.random();
            const px = fromPos.x + (toPos.x - fromPos.x) * t + (Math.random() - 0.5) * 20;
            const py = fromPos.y + (toPos.y - fromPos.y) * t + (Math.random() - 0.5) * 20;
            this.particles.push({
                x: px,
                y: py,
                vx: (Math.random() - 0.5) * 1.5,
                vy: -1.2 - Math.random() * 2,
                color: '#facc15',
                size: 3 + Math.random() * 3,
                rot: 0,
                rotV: 0,
                alpha: 1.0,
                life: 1.0,
                decay: 0.018 + Math.random() * 0.02
            });
        }
    }

    /* ---------- Realistic Top-View Snake Geometry & Splines ----------------- */

    /**
     * Generates a realistic sinuous spine spline for a snake from head to tail.
     * Caches sample points along with perpendicular normals, width profiles,
     * and dorsal pattern coordinates.
     */
    getSnakeSpline(snake, board) {
        const cacheKey = `${snake.from}_${snake.to}_${board.x}_${board.y}_${board.size}`;
        let entry = this.snakeSplines.get(cacheKey);
        if (entry) return entry;

        const headPos = this.getTileCenter(snake.from, board);
        const tailPos = this.getTileCenter(snake.to, board);

        const dx = tailPos.x - headPos.x;
        const dy = tailPos.y - headPos.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const normalX = -Math.sin(angle);
        const normalY = Math.cos(angle);

        // Compute sinuous lateral wave amplitudes
        const numSamples = Math.max(48, Math.min(100, Math.round(dist / 4)));
        const samples = [];
        const waveCount = snake.waves || 1.4;
        const waveSign = snake.flipWave ? -1 : 1;
        const maxAmp = Math.min(board.cellSize * 0.85, dist * 0.22);

        for (let i = 0; i <= numSamples; i++) {
            const t = i / numSamples; // 0 = head, 1 = tail

            // Sinuous curve: zero at head and tail, undulating through torso
            const envelope = Math.sin(Math.PI * t);
            const lateralOffset = Math.sin(Math.PI * 2 * waveCount * t) * maxAmp * envelope * waveSign;

            const px = headPos.x + dx * t + normalX * lateralOffset;
            const py = headPos.y + dy * t + normalY * lateralOffset;

            // Anatomical width profile (viper triangular head -> narrow neck -> muscular body -> tapering tail)
            let radius;
            if (t < 0.05) {
                // Snout tapering to nose tip
                radius = board.cellSize * (0.16 + (t / 0.05) * 0.12);
            } else if (t < 0.09) {
                // Venom jaw bulge
                radius = board.cellSize * 0.28;
            } else if (t < 0.16) {
                // Slender neck constriction
                radius = board.cellSize * (0.28 - ((t - 0.09) / 0.07) * 0.12);
            } else if (t < 0.65) {
                // Muscular torso body girth
                radius = board.cellSize * (0.16 + Math.sin((t - 0.16) / 0.49 * Math.PI) * 0.08);
            } else {
                // Graceful tapering tail
                const tailT = (t - 0.65) / 0.35;
                radius = Math.max(1.8, board.cellSize * 0.18 * (1 - tailT * 0.88));
            }

            samples.push({
                t,
                x: px,
                y: py,
                radius: Math.max(2, radius),
                nx: normalX,
                ny: normalY
            });
        }

        // Compute local tangent angles & refined normal vectors for each sample
        for (let i = 0; i <= numSamples; i++) {
            const prev = samples[Math.max(0, i - 1)];
            const next = samples[Math.min(numSamples, i + 1)];
            const tx = next.x - prev.x;
            const ty = next.y - prev.y;
            const tangAngle = Math.atan2(ty, tx);
            samples[i].tangent = tangAngle;
            samples[i].nx = -Math.sin(tangAngle);
            samples[i].ny = Math.cos(tangAngle);
        }

        entry = {
            head: headPos,
            tail: tailPos,
            samples: samples,
            length: dist
        };
        this.snakeSplines.set(cacheKey, entry);
        return entry;
    }

    /* ---------- Main Render Routine ------------------------------------------ */

    draw(now) {
        const g = this.ctx.ctx;
        const layout = this.computeLayout();
        const { v, s, board, sidebar, gate } = layout;

        // Clean Canvas buffer
        this.ctx.clearCanvas();

        // Screen Shake
        g.save();
        if (this.screenShake > 0) {
            const sx = (Math.random() - 0.5) * this.screenShake;
            const sy = (Math.random() - 0.5) * this.screenShake;
            g.translate(sx, sy);
            this.screenShake *= 0.88;
            if (this.screenShake < 0.2) this.screenShake = 0;
        }

        // 1. Draw Backdrop & Board Tiles & Start Gate
        this.drawBoardTiles(g, board, gate, s);

        // 2. Draw Ladders / Stairs
        this.drawLadders(g, board, s);

        // 3. Draw Realistic Snakes
        this.drawSnakes(g, board, s, now);

        // 4. Draw Player Tokens (Coins)
        this.drawCoins(g, board, gate, s, now);

        // 5. Draw Left Sidebar (Turn spotlight & 6 Mystery Dice Cards)
        this.drawSidebar(g, sidebar, s, now);

        // 6. Draw Banner & Particle effects
        this.drawParticles(g);
        this.drawBanner(g, v, s, now);

        g.restore();
    }

    /* ---------- Board Tiles Rendering ---------------------------------------- */

    drawBoardTiles(g, board, gate, s) {
        const theme = this.getThemeId();
        const bStyle = THEME_BOARD_STYLES[theme] || THEME_BOARD_STYLES.broadcast;

        // Drop shadow for the board slab
        g.save();
        g.shadowColor = 'rgba(0, 0, 0, 0.45)';
        g.shadowBlur = 24 * s;
        g.shadowOffsetX = 0;
        g.shadowOffsetY = 12 * s;

        // Board outer frame
        T.roundRect(g, board.x - 6 * s, board.y - 6 * s, board.w + 12 * s, board.h + 12 * s, 14 * s);
        g.fillStyle = bStyle.frame;
        g.fill();
        g.restore();

        // Board border hairline
        g.save();
        T.roundRect(g, board.x - 6 * s, board.y - 6 * s, board.w + 12 * s, board.h + 12 * s, 14 * s);
        g.strokeStyle = bStyle.border;
        g.lineWidth = 1.5 * s;
        g.stroke();

        // Draw 100 tiles
        for (let num = 1; num <= TOTAL_TILES; num++) {
            const { row, col } = this.getTileRowCol(num);
            const tx = board.x + col * board.cellSize;
            const ty = board.y + (BOARD_ROWS - 1 - row) * board.cellSize;
            const isAlt = (row + col) % 2 === 1;

            // Tile background
            if (num === TOTAL_TILES) {
                // Goal 100 Tile — Golden radiance
                const grad = g.createRadialGradient(
                    tx + board.cellSize / 2, ty + board.cellSize / 2, 2,
                    tx + board.cellSize / 2, ty + board.cellSize / 2, board.cellSize * 0.7
                );
                grad.addColorStop(0, '#fef08a');
                grad.addColorStop(0.5, '#f59e0b');
                grad.addColorStop(1, '#b45309');
                g.fillStyle = grad;
            } else if (num === 1) {
                // Start Tile
                g.fillStyle = '#1e3a5f';
            } else {
                g.fillStyle = isAlt ? bStyle.tileB : bStyle.tileA;
            }

            // Inset tile rounded box
            const pad = 1.2 * s;
            T.roundRect(g, tx + pad, ty + pad, board.cellSize - pad * 2, board.cellSize - pad * 2, 4 * s);
            g.fill();

            // Tile corner number (tabular numeral)
            g.font = `700 ${Math.max(9, Math.round(board.cellSize * 0.22))}px "Space Grotesk", sans-serif`;
            if (num === TOTAL_TILES) {
                g.fillStyle = '#1e1b4b';
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.fillText('👑 100', tx + board.cellSize / 2, ty + board.cellSize / 2);
            } else {
                g.fillStyle = (num === 1) ? '#60a5fa' : 'rgba(255, 255, 255, 0.38)';
                g.textAlign = 'left';
                g.textBaseline = 'top';
                g.fillText(String(num), tx + 4 * s, ty + 3 * s);

                // Start badge on tile 1
                if (num === 1) {
                    g.font = `800 ${Math.round(board.cellSize * 0.16)}px "Space Grotesk", sans-serif`;
                    g.fillStyle = '#93c5fd';
                    g.textAlign = 'center';
                    g.fillText('START', tx + board.cellSize / 2, ty + board.cellSize * 0.62);
                }
            }
        }
        g.restore();

        // Draw Start Gate Dock (for players waiting to roll a 1)
        if (gate) {
            g.save();
            g.shadowColor = 'rgba(0, 0, 0, 0.45)';
            g.shadowBlur = 16 * s;
            g.shadowOffsetX = 0;
            g.shadowOffsetY = 8 * s;

            T.roundRect(g, gate.x, gate.y, gate.w, gate.h, 10 * s);
            g.fillStyle = bStyle.frame;
            g.fill();
            g.restore();

            g.save();
            T.roundRect(g, gate.x, gate.y, gate.w, gate.h, 10 * s);
            g.strokeStyle = bStyle.border;
            g.lineWidth = 1.5 * s;
            g.stroke();

            // Recessed gate pad
            T.roundRect(g, gate.x + 3 * s, gate.y + 3 * s, gate.w - 6 * s, gate.h - 6 * s, 8 * s);
            g.fillStyle = bStyle.tileA;
            g.fill();

            // Gate text
            g.font = `800 ${Math.round(8 * s)}px "Space Grotesk", sans-serif`;
            g.fillStyle = 'rgba(255, 255, 255, 0.5)';
            g.textAlign = 'center';
            g.textBaseline = 'top';
            g.fillText('START GATE', gate.x + gate.w / 2, gate.y + 5 * s);

            g.font = `800 ${Math.round(10 * s)}px "Space Grotesk", sans-serif`;
            g.fillStyle = '#f59e0b';
            g.fillText('ROLL 1 🔒', gate.x + gate.w / 2, gate.y + 16 * s);

            // Arrow pointing from Gate to Tile 1
            g.font = `900 ${Math.round(15 * s)}px "Space Grotesk", sans-serif`;
            g.fillStyle = '#f59e0b';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('➔', gate.x + gate.w + (gate.gap || 16 * s) / 2, gate.y + gate.h / 2);
            g.restore();
        }
    }

    /* ---------- Ladders / Stairs Rendering ------------------------------------ */

    drawLadders(g, board, s) {
        LADDERS.forEach(ladder => {
            const fromPos = this.getTileCenter(ladder.from, board);
            const toPos = this.getTileCenter(ladder.to, board);

            const dx = toPos.x - fromPos.x;
            const dy = toPos.y - fromPos.y;
            const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            const nx = -Math.sin(angle);
            const ny = Math.cos(angle);

            const railWidth = Math.max(14 * s, board.cellSize * 0.3);
            const halfRail = railWidth / 2;

            g.save();

            // 1. Drop shadow beneath ladder
            g.shadowColor = 'rgba(0, 0, 0, 0.45)';
            g.shadowBlur = 10 * s;
            g.shadowOffsetX = 3 * s;
            g.shadowOffsetY = 6 * s;

            // 2. Ladder Rails
            g.lineCap = 'round';
            g.lineWidth = 4 * s;

            // Left rail
            const rx1 = fromPos.x - nx * halfRail;
            const ry1 = fromPos.y - ny * halfRail;
            const rx2 = toPos.x - nx * halfRail;
            const ry2 = toPos.y - ny * halfRail;

            // Right rail
            const lx1 = fromPos.x + nx * halfRail;
            const ly1 = fromPos.y + ny * halfRail;
            const lx2 = toPos.x + nx * halfRail;
            const ly2 = toPos.y + ny * halfRail;

            // Golden / polished brass gradient for rails
            const railGrad = g.createLinearGradient(fromPos.x, fromPos.y, toPos.x, toPos.y);
            railGrad.addColorStop(0, '#fef08a');
            railGrad.addColorStop(0.5, '#f59e0b');
            railGrad.addColorStop(1, '#d97706');
            g.strokeStyle = railGrad;

            g.beginPath();
            g.moveTo(rx1, ry1);
            g.lineTo(rx2, ry2);
            g.moveTo(lx1, ly1);
            g.lineTo(lx2, ly2);
            g.stroke();

            // 3. Ladder Rungs (spaced evenly along length)
            const rungStep = Math.max(14 * s, board.cellSize * 0.32);
            const rungCount = Math.floor(dist / rungStep);
            g.lineWidth = 3 * s;

            for (let r = 1; r < rungCount; r++) {
                const rt = r / rungCount;
                const p1x = rx1 + (rx2 - rx1) * rt;
                const p1y = ry1 + (ry2 - ry1) * rt;
                const p2x = lx1 + (lx2 - lx1) * rt;
                const p2y = ly1 + (ly2 - ly1) * rt;

                g.beginPath();
                g.moveTo(p1x, p1y);
                g.lineTo(p2x, p2y);
                g.stroke();

                // Metallic joint rivets
                g.fillStyle = '#ffffff';
                T.circle(g, p1x, p1y, 1.2 * s);
                g.fill();
                T.circle(g, p2x, p2y, 1.2 * s);
                g.fill();
            }

            g.restore();
        });
    }

    /* ---------- Realistic Top-View Snakes Rendering --------------------------- */

    drawSnakes(g, board, s, now) {
        SNAKES.forEach((snakeBase, idx) => {
            const snake = this.getThemedSnake(snakeBase, idx);
            const spline = this.getSnakeSpline(snake, board);
            const samples = spline.samples;
            const count = samples.length;

            g.save();

            // Layer 1: Ambient Drop Shadow on board tiles
            g.save();
            g.shadowColor = 'rgba(0, 0, 0, 0.55)';
            g.shadowBlur = 12 * s;
            g.shadowOffsetX = 5 * s;
            g.shadowOffsetY = 8 * s;

            g.beginPath();
            // Trace left hull from head to tail
            for (let i = 0; i < count; i++) {
                const sp = samples[i];
                const r = this.getBulgeAdjustedRadius(snake, sp.t, sp.radius, s);
                const px = sp.x + sp.nx * r;
                const py = sp.y + sp.ny * r;
                if (i === 0) g.moveTo(px, py);
                else g.lineTo(px, py);
            }
            // Trace right hull from tail back to head
            for (let i = count - 1; i >= 0; i--) {
                const sp = samples[i];
                const r = this.getBulgeAdjustedRadius(snake, sp.t, sp.radius, s);
                const px = sp.x - sp.nx * r;
                const py = sp.y - sp.ny * r;
                g.lineTo(px, py);
            }
            g.closePath();
            g.fillStyle = '#000000';
            g.fill();
            g.restore();

            // Layer 2: 3D Tubular Cylindrical Body Shading
            // Draw overlapping rounded scale discs from tail to head
            for (let i = count - 1; i >= 0; i--) {
                const sp = samples[i];
                const r = this.getBulgeAdjustedRadius(snake, sp.t, sp.radius, s);

                // Body color gradient across circular cross-section
                const bodyGrad = g.createRadialGradient(
                    sp.x - sp.nx * r * 0.35, sp.y - sp.ny * r * 0.35, 1,
                    sp.x, sp.y, r
                );
                bodyGrad.addColorStop(0, snake.bodyLight);
                bodyGrad.addColorStop(0.5, snake.bodyMid);
                bodyGrad.addColorStop(1, snake.bodyDark);

                g.beginPath();
                g.arc(sp.x, sp.y, r, 0, Math.PI * 2);
                g.fillStyle = bodyGrad;
                g.fill();
            }

            // Layer 3: Dorsal Species Patterns (Diamonds, Rings, Saddles, Stripes)
            this.drawSnakeDorsalPatterns(g, snake, samples, s);

            // Layer 4: Realistic Viper/Python Head & Eyes
            this.drawSnakeHead(g, snake, samples, s, now);

            g.restore();
        });
    }

    /** Dynamically expands the snake body where a swallowed coin is traveling */
    getBulgeAdjustedRadius(snake, t, baseRadius, s) {
        if (!this.activeSpecialEvent || this.activeSpecialEvent.type !== 'snake') {
            return baseRadius;
        }
        if (this.activeSpecialEvent.item.from !== snake.from || this.activeSpecialEvent.item.to !== snake.to) {
            return baseRadius;
        }

        // Swallow progress travels from 0 (head) to 1 (tail)
        const progress = this.activeSpecialEvent.progress;
        const dist = Math.abs(t - progress);
        if (dist < 0.12) {
            const swell = Math.cos((dist / 0.12) * (Math.PI / 2));
            return baseRadius + (swell * swell) * 11 * s;
        }
        return baseRadius;
    }

    /** Draws the species-specific skin patterns along the snake's spine */
    drawSnakeDorsalPatterns(g, snake, samples, s) {
        const count = samples.length;

        if (snake.patternType === 'rings') {
            // Alternating theme bands
            for (let i = 4; i < count - 4; i += 3) {
                const sp = samples[i];
                const r = sp.radius * 0.92;
                const bandIdx = Math.floor(i / 3) % 4;
                const bandColor = (bandIdx === 0) ? snake.accent : ((bandIdx === 2) ? snake.bodyDark : snake.patternColor);

                g.save();
                g.translate(sp.x, sp.y);
                g.rotate(sp.tangent);
                g.fillStyle = bandColor;
                T.roundRect(g, -3 * s, -r, 6 * s, r * 2, 2 * s);
                g.fill();
                g.restore();
            }
        } else if (snake.patternType === 'chevrons') {
            // Theme diamond chevrons with dark border
            for (let i = 6; i < count - 6; i += 5) {
                const sp = samples[i];
                const r = sp.radius * 0.72;

                g.save();
                g.translate(sp.x, sp.y);
                g.rotate(sp.tangent);

                // Dark outline
                g.beginPath();
                g.moveTo(-r * 0.9, 0);
                g.lineTo(0, -r);
                g.lineTo(r * 0.9, 0);
                g.lineTo(0, r);
                g.closePath();
                g.fillStyle = snake.bodyDark;
                g.fill();

                // Luminous chevron center
                g.beginPath();
                g.moveTo(-r * 0.65, 0);
                g.lineTo(0, -r * 0.72);
                g.lineTo(r * 0.65, 0);
                g.lineTo(0, r * 0.72);
                g.closePath();
                g.fillStyle = (i % 10 === 0) ? snake.bodyLight : snake.patternColor;
                g.fill();

                g.restore();
            }
        } else if (snake.patternType === 'hourglass') {
            // Pinched hourglass saddles across spine
            for (let i = 5; i < count - 5; i += 4) {
                const sp = samples[i];
                const r = sp.radius * 0.85;

                g.save();
                g.translate(sp.x, sp.y);
                g.rotate(sp.tangent);

                g.beginPath();
                g.moveTo(-4 * s, -r);
                g.lineTo(4 * s, -r);
                g.lineTo(1.5 * s, 0);
                g.lineTo(4 * s, r);
                g.lineTo(-4 * s, r);
                g.lineTo(-1.5 * s, 0);
                g.closePath();
                g.fillStyle = snake.patternColor;
                g.fill();

                g.restore();
            }
        } else if (snake.patternType === 'reticulated') {
            // Diamond net mesh with theme flecks
            for (let i = 5; i < count - 5; i += 4) {
                const sp = samples[i];
                const r = sp.radius * 0.7;

                g.save();
                g.translate(sp.x, sp.y);
                g.rotate(sp.tangent + Math.PI / 4);

                g.strokeStyle = snake.patternColor;
                g.lineWidth = 1.6 * s;
                g.strokeRect(-r * 0.5, -r * 0.5, r, r);

                g.fillStyle = snake.accent;
                T.circle(g, 0, 0, 1.4 * s);
                g.fill();

                g.restore();
            }
        } else {
            // Default dorsal diamonds / oval blotches
            for (let i = 5; i < count - 5; i += 4) {
                const sp = samples[i];
                const r = sp.radius * 0.65;

                g.save();
                g.translate(sp.x, sp.y);
                g.rotate(sp.tangent);

                g.beginPath();
                g.ellipse(0, 0, r * 0.85, r * 0.55, 0, 0, Math.PI * 2);
                g.fillStyle = snake.patternColor;
                g.fill();

                g.restore();
            }
        }

        // Specular highlight line along dorsal spine ridge
        g.save();
        g.beginPath();
        for (let i = 3; i < count - 3; i++) {
            const sp = samples[i];
            const px = sp.x - sp.nx * sp.radius * 0.3;
            const py = sp.y - sp.ny * sp.radius * 0.3;
            if (i === 3) g.moveTo(px, py);
            else g.lineTo(px, py);
        }
        g.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        g.lineWidth = 1.8 * s;
        g.stroke();
        g.restore();
    }

    /** Draws realistic contoured viper head, nostrils, and eyes (no animated tongue) */
    drawSnakeHead(g, snake, samples, s, now) {
        const headSp = samples[0];
        const neckSp = samples[3] || samples[1];

        // Head tangent pointing in direction of gaze (reverse of spine flow from head)
        const headAngle = Math.atan2(headSp.y - neckSp.y, headSp.x - neckSp.x);
        const headR = headSp.radius * 1.35;

        g.save();
        g.translate(headSp.x, headSp.y);
        g.rotate(headAngle);

        // Head Viper Geometry (Triangular venom jaw contour)
        g.beginPath();
        g.moveTo(headR * 1.1, 0); // Snout tip
        g.lineTo(headR * 0.3, -headR * 0.95); // Left jaw flare
        g.lineTo(-headR * 0.5, -headR * 0.7); // Left crown base
        g.lineTo(-headR * 0.7, 0); // Neck nape
        g.lineTo(-headR * 0.5, headR * 0.7); // Right crown base
        g.lineTo(headR * 0.3, headR * 0.95); // Right jaw flare
        g.closePath();

        const headGrad = g.createRadialGradient(0, 0, 2, 0, 0, headR * 1.1);
        headGrad.addColorStop(0, snake.bodyLight);
        headGrad.addColorStop(0.5, snake.bodyMid);
        headGrad.addColorStop(1, snake.bodyDark);
        g.fillStyle = headGrad;
        g.fill();
        g.strokeStyle = snake.bodyDark;
        g.lineWidth = 1.5 * s;
        g.stroke();

        // Nostrils
        g.fillStyle = 'rgba(0, 0, 0, 0.75)';
        T.circle(g, headR * 0.8, -headR * 0.25, 1.2 * s);
        g.fill();
        T.circle(g, headR * 0.8, headR * 0.25, 1.2 * s);
        g.fill();

        // Realistic Eyes with Vertical Slit Pupils
        const eyeOffset = headR * 0.65;
        const eyeFwd = headR * 0.3;

        [-eyeOffset, eyeOffset].forEach(eyeY => {
            // Supraocular brow scale ridge
            g.fillStyle = snake.bodyDark;
            g.beginPath();
            g.ellipse(eyeFwd, eyeY, 4 * s, 2.5 * s, 0, 0, Math.PI * 2);
            g.fill();

            // Iris matching themed eye color
            g.fillStyle = snake.eyeColor;
            T.circle(g, eyeFwd, eyeY, 3.2 * s);
            g.fill();

            // Vertical Slit Pupil
            g.fillStyle = '#000000';
            g.beginPath();
            g.ellipse(eyeFwd, eyeY, 1.1 * s, 2.6 * s, 0, 0, Math.PI * 2);
            g.fill();

            // Specular reflection glint
            g.fillStyle = '#ffffff';
            T.circle(g, eyeFwd - 0.8 * s, eyeY - 0.9 * s, 0.9 * s);
            g.fill();
        });

        g.restore();
    }

    /* ---------- Player Tokens (Coins) Rendering ------------------------------ */

    drawCoins(g, board, gate, s, now) {
        const participants = this.getAllParticipants();
        const activeId = this.getCurrentPlayerId();

        // Group coins by tile so overlapping coins fan out neatly
        const tileGroups = {};
        this.turnOrder.forEach(id => {
            const pState = this.playerState[id];
            if (!pState) return;
            if (!tileGroups[pState.pos]) tileGroups[pState.pos] = [];
            tileGroups[pState.pos].push(id);
        });

        this.turnOrder.forEach(id => {
            const pState = this.playerState[id];
            if (!pState) return;
            const pInfo = participants[id] || {};
            const isTurn = (id === activeId);
            const isOffline = (pInfo.connected === false || pState.disconnected);

            // Compute current animated position
            let coinX, coinY;
            let coinScale = 1.0;
            let coinAlpha = isOffline ? 0.6 : 1.0;

            if (isTurn && this.phase === 'moving') {
                // Hop interpolation
                const startPos = this.getTileCenter(this.currentHopStart, board, gate);
                const targetPos = this.getTileCenter(this.currentHopTarget, board, gate);
                const t = this.hopProgress;

                coinX = startPos.x + (targetPos.x - startPos.x) * t;
                coinY = startPos.y + (targetPos.y - startPos.y) * t;

                // Parabolic hop bounce height
                const hopHeight = Math.sin(t * Math.PI) * (24 * s);
                coinY -= hopHeight;

                // Squish & stretch
                coinScale = 1.0 + Math.sin(t * Math.PI) * 0.15;
            } else if (isTurn && this.phase === 'special_event') {
                const evt = this.activeSpecialEvent;
                if (evt.type === 'ladder') {
                    // Ladder rung-by-rung climb
                    const fromPos = this.getTileCenter(evt.from, board, gate);
                    const toPos = this.getTileCenter(evt.to, board, gate);
                    const t = evt.progress;
                    coinX = fromPos.x + (toPos.x - fromPos.x) * t;
                    coinY = fromPos.y + (toPos.y - fromPos.y) * t - Math.abs(Math.sin(t * Math.PI * 6)) * (8 * s);
                } else if (evt.type === 'snake') {
                    // Swallowed inside snake: follow the snake's spine spline!
                    const spline = this.getSnakeSpline(evt.item, board);
                    const t = evt.progress;
                    const sampleIdx = Math.min(spline.samples.length - 1, Math.floor(t * (spline.samples.length - 1)));
                    const sp = spline.samples[sampleIdx];
                    coinX = sp.x;
                    coinY = sp.y;

                    // Coin is swallowed inside the body (dimmed and scaled inside the bulge)
                    coinScale = 0.72 + Math.sin(t * Math.PI) * 0.2;
                    coinAlpha = 0.65;
                }
            } else {
                // Static placed on tile or gate
                const center = this.getTileCenter(pState.pos, board, gate);
                const group = tileGroups[pState.pos] || [id];
                const groupIdx = group.indexOf(id);
                const totalInTile = group.length;

                // Fan out if multiple players on same tile / gate
                if (totalInTile > 1) {
                    const fanAngle = (groupIdx / totalInTile) * Math.PI * 2;
                    const isGate = (pState.pos === 0);
                    const fanRadius = isGate ? (gate ? gate.h * 0.28 : 14 * s) : board.cellSize * 0.22;
                    coinX = center.x + Math.cos(fanAngle) * fanRadius;
                    coinY = center.y + Math.sin(fanAngle) * fanRadius;
                } else {
                    coinX = center.x;
                    coinY = center.y;
                }
            }

            // Draw Coin / Token
            const coinRadius = Math.max(12 * s, board.cellSize * 0.28) * coinScale;

            g.save();
            g.globalAlpha = coinAlpha;

            // Active player pulsing selection halo
            if (isTurn && !pState.finished) {
                const haloRadius = coinRadius * (1.25 + Math.sin(now * 0.008) * 0.12);
                g.beginPath();
                g.arc(coinX, coinY, haloRadius, 0, Math.PI * 2);
                g.fillStyle = colorMix(pInfo.color || '#2563EB', 0.25);
                g.fill();
            }

            // Drop shadow
            g.shadowColor = 'rgba(0, 0, 0, 0.55)';
            g.shadowBlur = 8 * s;
            g.shadowOffsetX = 2 * s;
            g.shadowOffsetY = 4 * s;

            // Outer metallic coin rim
            g.beginPath();
            g.arc(coinX, coinY, coinRadius, 0, Math.PI * 2);
            g.fillStyle = '#ffffff';
            g.fill();

            // Inner player colored disc
            g.beginPath();
            g.arc(coinX, coinY, coinRadius - 2.5 * s, 0, Math.PI * 2);
            g.fillStyle = pInfo.color || '#2563EB';
            g.fill();

            // Avatar face or image
            g.shadowColor = 'transparent';
            if (pInfo.avatar && typeof pInfo.avatar === 'string' && pInfo.avatar.startsWith('data:image/')) {
                const img = getAvatarImg(pInfo.avatar);
                if (img && img.complete) {
                    g.save();
                    g.beginPath();
                    g.arc(coinX, coinY, coinRadius - 3.5 * s, 0, Math.PI * 2);
                    g.clip();
                    g.drawImage(img, coinX - coinRadius, coinY - coinRadius, coinRadius * 2, coinRadius * 2);
                    g.restore();
                }
            } else {
                g.font = `${Math.round(coinRadius * 1.15)}px sans-serif`;
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.fillText(pInfo.avatar || '🦊', coinX, coinY + 1 * s);
            }

            // Finished Trophy Badge
            if (pState.finished) {
                g.font = `700 ${Math.round(14 * s)}px "Space Grotesk", sans-serif`;
                g.fillStyle = '#fef08a';
                g.fillText(`🏆#${pState.finishRank}`, coinX, coinY - coinRadius - 6 * s);
            }

            g.restore();
        });
    }

    /* ---------- Right Sidebar (Mystery Dice & Turn Spotlight) ---------------- */

    drawSidebar(g, sidebar, s, now) {
        const participants = this.getAllParticipants();
        const activeId = this.getCurrentPlayerId();
        const activePlayer = participants[activeId] || {};
        const activeState = this.playerState[activeId] || { pos: 0 };

        // 1. Turn Spotlight Panel
        const spotH = Math.max(120 * s, sidebar.h * 0.22);
        T.roundRect(g, sidebar.x, sidebar.y, sidebar.w, spotH, 12 * s);
        g.fillStyle = 'rgba(15, 23, 42, 0.85)';
        g.fill();
        g.strokeStyle = colorMix(activePlayer.color || '#2563EB', 0.4);
        g.lineWidth = 1.5 * s;
        g.stroke();

        // Turn header label
        g.font = `700 ${Math.round(11 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = colorMix(activePlayer.color || '#2563EB', 1.0);
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillText('ACTIVE TURN', sidebar.x + 18 * s, sidebar.y + 14 * s);

        // Player Name & Avatar in Spotlight
        g.font = `800 ${Math.round(22 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = '#ffffff';
        g.fillText(`${activePlayer.avatar || '🎮'} ${activePlayer.name || 'Player'}`, sidebar.x + 18 * s, sidebar.y + 32 * s);

        // Position & Status Readout
        g.font = `600 ${Math.round(13 * s)}px "Inter", sans-serif`;
        g.fillStyle = 'rgba(255, 255, 255, 0.65)';
        const atGate = (activeState.pos === 0);
        let statusText;
        if (this.phase === 'pick_die') {
            statusText = atGate
                ? 'In Start Gate · Must roll 1 to enter! (6 gives extra roll)'
                : `Standing on Tile #${activeState.pos} · Choose a mystery die below!`;
        } else if (this.phase === 'flipping' || this.phase === 'revealed') {
            if (atGate) {
                statusText = (this.rolledNumber === 1)
                    ? 'Rolled a 1! Entering arena onto Tile 1!'
                    : (this.rolledNumber === 6
                        ? 'Rolled a 6! Cannot enter, but rolls again!'
                        : `Rolled a ${this.rolledNumber}. Must roll 1 to enter!`);
            } else {
                statusText = `Revealed a ${this.rolledNumber}! Moving on board...`;
            }
        } else {
            statusText = 'Hopping through tiles...';
        }
        g.fillText(statusText, sidebar.x + 18 * s, sidebar.y + 64 * s);

        // Score / Rank Mini-Chips Rail
        const chipW = Math.max(48 * s, (sidebar.w - 36 * s) / Math.max(1, this.turnOrder.length));
        this.turnOrder.forEach((id, idx) => {
            const p = participants[id] || {};
            const st = this.playerState[id] || { pos: 0 };
            const isCur = (id === activeId);
            const cx = sidebar.x + 18 * s + idx * (chipW + 6 * s);
            const cy = sidebar.y + spotH - 24 * s;

            T.roundRect(g, cx, cy, chipW, 16 * s, 4 * s);
            g.fillStyle = isCur ? (p.color || '#2563EB') : 'rgba(255, 255, 255, 0.08)';
            g.fill();

            g.font = `700 ${Math.round(9 * s)}px "Space Grotesk", sans-serif`;
            g.fillStyle = isCur ? '#ffffff' : 'rgba(255, 255, 255, 0.7)';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            const locLabel = (st.pos === 0) ? 'GATE' : `T${st.pos}`;
            g.fillText(`${p.avatar || '🎮'} ${locLabel}`, cx + chipW / 2, cy + 8 * s);
        });

        // 2. The 6 Hidden Mystery Dice Faces Area (Square Dice)
        const diceAreaY = sidebar.y + spotH + 18 * s;
        const diceAreaH = sidebar.h - spotH - 18 * s;

        // Header for dice
        g.font = `700 ${Math.round(12 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = '#94a3b8';
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillText('6 HIDDEN DICE (Pick One)', sidebar.x + 4 * s, diceAreaY);

        // Grid of 6 Square Mystery Dice: 3 columns x 2 rows
        const cardGap = 16 * s;
        const availW = sidebar.w - 16 * s;
        const availH = diceAreaH - 46 * s;

        const dieSize = Math.floor(Math.min((availW - cardGap * 2) / 3, (availH - cardGap) / 2));
        const totalGridW = dieSize * 3 + cardGap * 2;
        const totalGridH = dieSize * 2 + cardGap;
        const startX = sidebar.x + (sidebar.w - totalGridW) / 2;
        const startY = diceAreaY + 22 * s + Math.max(0, (availH - totalGridH) / 2);

        for (let idx = 0; idx < 6; idx++) {
            const col = idx % 3;
            const row = Math.floor(idx / 3);
            const cx = startX + col * (dieSize + cardGap);
            const cy = startY + row * (dieSize + cardGap);

            this.drawMysteryCard(g, idx, cx, cy, dieSize, s, now, activePlayer);
        }

        // Legend at bottom of sidebar
        const legendY = startY + totalGridH + 16 * s;
        g.font = `600 ${Math.round(11 * s)}px "Inter", sans-serif`;
        g.fillStyle = 'rgba(255, 255, 255, 0.45)';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('D-Pad selects · A rolls · Roll 1 to Enter · Roll 6 for Extra Turn!', sidebar.x + sidebar.w / 2, legendY);
    }

    /**
     * Renders an individual Mystery Die with square die shape, 3D flip animation,
     * glowing borders, ornate die-backs, and dice pips when revealed.
     */
    drawMysteryCard(g, cardIndex, x, y, size, s, now, activePlayer) {
        const isHovered = (this.hoverCardIndex === cardIndex && this.phase === 'pick_die');
        const isChosen = (this.chosenCardIndex === cardIndex);
        const isFlipping = (this.phase === 'flipping');
        const isRevealed = (this.phase !== 'pick_die');
        const faceValue = this.hiddenDiceFaces[cardIndex];

        g.save();

        // 3D Flip Scale calculation: cosine scale goes from 1.0 (back) to 0.0 (edge) to 1.0 (front)
        let scaleX = 1.0;
        let showFront = false;

        if (isRevealed) {
            if (isFlipping) {
                // Animate flip from 0 to 1
                const p = this.flipProgress;
                scaleX = Math.abs(Math.cos(p * Math.PI));
                showFront = (p >= 0.5);
            } else {
                scaleX = 1.0;
                showFront = true;
            }
        }

        // Card transform for 3D flip centered on the square die
        g.translate(x + size / 2, y + size / 2);
        g.scale(scaleX, 1.0);

        // Hover floating offset
        if (isHovered && !isRevealed) {
            const floatOffset = Math.sin(now * 0.008 + cardIndex) * (3 * s);
            g.translate(0, floatOffset);
        }

        const hs = size / 2;
        const cornerR = size * 0.16;

        if (!showFront) {
            // === DIE BACK (HIDDEN SQUARE FACE) ===
            // Drop shadow
            g.shadowColor = isHovered ? colorMix(activePlayer.color || '#2563EB', 0.65) : 'rgba(0,0,0,0.45)';
            g.shadowBlur = isHovered ? 16 * s : 8 * s;
            g.shadowOffsetX = 0;
            g.shadowOffsetY = isHovered ? 6 * s : 4 * s;

            // Die Base Square
            T.roundRect(g, -hs, -hs, size, size, cornerR);
            const cardGrad = g.createLinearGradient(-hs, -hs, hs, hs);
            cardGrad.addColorStop(0, '#1e293b');
            cardGrad.addColorStop(1, '#0f172a');
            g.fillStyle = cardGrad;
            g.fill();

            // Die Border
            g.lineWidth = isHovered ? 2.8 * s : 1.4 * s;
            g.strokeStyle = isHovered ? (activePlayer.color || '#38bdf8') : 'rgba(255, 255, 255, 0.16)';
            g.stroke();

            // Inner square inset frame
            const innerPad = size * 0.09;
            T.roundRect(g, -hs + innerPad, -hs + innerPad, size - innerPad * 2, size - innerPad * 2, cornerR * 0.7);
            g.strokeStyle = isHovered ? colorMix(activePlayer.color || '#38bdf8', 0.4) : 'rgba(255, 255, 255, 0.08)';
            g.lineWidth = 1 * s;
            g.stroke();

            // Big Question Mark in Center
            g.font = `800 ${Math.round(size * 0.38)}px "Space Grotesk", sans-serif`;
            g.fillStyle = isHovered ? (activePlayer.color || '#38bdf8') : 'rgba(255, 255, 255, 0.45)';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('?', 0, -size * 0.05);

            // Die Number label
            g.font = `700 ${Math.round(size * 0.12)}px "Space Grotesk", sans-serif`;
            g.fillStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.35)';
            g.fillText(`DIE #${cardIndex + 1}`, 0, hs - size * 0.16);

        } else {
            // === DIE FRONT (REVEALED SQUARE FACE) ===
            if (isChosen) {
                g.shadowColor = '#facc15';
                g.shadowBlur = 20 * s;
            } else {
                g.shadowColor = 'rgba(0,0,0,0.35)';
                g.shadowBlur = 8 * s;
            }

            // White / Ivory Square Die Face
            T.roundRect(g, -hs, -hs, size, size, cornerR);
            g.fillStyle = isChosen ? '#ffffff' : '#f1f5f9';
            g.fill();

            g.lineWidth = isChosen ? 3.5 * s : 1.5 * s;
            g.strokeStyle = isChosen ? '#f59e0b' : '#cbd5e1';
            g.stroke();

            // Draw Real Dice Pips (Square area)
            const pipArea = size * 0.72;
            this.drawDicePips(g, faceValue, 0, 0, pipArea, pipArea, s, isChosen);

            // Top tags
            if (isChosen) {
                g.font = `800 ${Math.round(size * 0.11)}px "Space Grotesk", sans-serif`;
                g.fillStyle = '#b45309';
                g.textAlign = 'center';
                g.textBaseline = 'top';
                g.fillText('★ CHOSEN ★', 0, -hs + size * 0.1);
            } else {
                g.font = `800 ${Math.round(size * 0.12)}px "Space Grotesk", sans-serif`;
                g.fillStyle = '#94a3b8';
                g.textAlign = 'left';
                g.textBaseline = 'top';
                g.fillText(String(faceValue), -hs + size * 0.1, -hs + size * 0.08);
            }
        }

        g.restore();
    }

    /** Draws standard dice pips (1 to 6) on the square die face */
    drawDicePips(g, val, cx, cy, boxW, boxH, s, isChosen) {
        const pipR = Math.max(3.5 * s, boxW * 0.1);
        const color = isChosen ? '#ef4444' : '#1e293b';
        g.fillStyle = color;

        const d = boxW * 0.3;
        const left = cx - d;
        const right = cx + d;
        const top = cy - d;
        const bottom = cy + d;

        const pip = (px, py) => {
            T.circle(g, px, py, pipR);
            g.fill();
        };

        switch (val) {
            case 1:
                pip(cx, cy);
                break;
            case 2:
                pip(left, top);
                pip(right, bottom);
                break;
            case 3:
                pip(left, top);
                pip(cx, cy);
                pip(right, bottom);
                break;
            case 4:
                pip(left, top);
                pip(right, top);
                pip(left, bottom);
                pip(right, bottom);
                break;
            case 5:
                pip(left, top);
                pip(right, top);
                pip(cx, cy);
                pip(left, bottom);
                pip(right, bottom);
                break;
            case 6:
                pip(left, top);
                pip(right, top);
                pip(left, cy);
                pip(right, cy);
                pip(left, bottom);
                pip(right, bottom);
                break;
        }
    }

    /* ---------- Notification Banners & Particles ------------------------------ */

    drawBanner(g, v, s, now) {
        if (now > this.bannerUntil || !this.bannerMessage) return;

        const alpha = Math.min(1.0, (this.bannerUntil - now) / 300);
        g.save();
        g.globalAlpha = alpha;

        const bannerW = Math.min(v.w * 0.8, 620 * s);
        const bannerH = 46 * s;
        const bx = (v.w - bannerW) / 2;
        const by = 24 * s;

        // Backdrop pill
        T.roundRect(g, bx, by, bannerW, bannerH, 23 * s);
        g.fillStyle = 'rgba(15, 23, 42, 0.94)';
        g.fill();
        g.strokeStyle = '#f59e0b';
        g.lineWidth = 1.8 * s;
        g.stroke();

        g.font = `800 ${Math.round(15 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(this.bannerMessage, v.w / 2, by + bannerH / 2);

        g.restore();
    }

    drawParticles(g) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.rotV;
            p.alpha -= p.decay;

            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            g.save();
            g.globalAlpha = p.alpha;
            g.translate(p.x, p.y);
            g.rotate(p.rot);
            g.fillStyle = p.color;
            g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            g.restore();
        }
    }

    /* ---------- Game Loop ---------------------------------------------------- */

    loop(timestamp) {
        if (!this.running) return;

        const dt = Math.min(64, timestamp - this.lastFrame);
        this.lastFrame = timestamp;

        // 1. Bot or Disconnected Player Automated Thinking
        const currentId = this.getCurrentPlayerId();
        const currentPlayer = this.getAllParticipants()[currentId];
        if (currentPlayer && (currentPlayer.__bot || currentPlayer.connected === false) && this.phase === 'pick_die') {
            const autoWait = this.playerState[currentId] ? this.playerState[currentId].botThinkUntil : 0;
            if (autoWait > 0 && timestamp >= autoWait) {
                if (this.playerState[currentId]) {
                    this.playerState[currentId].botThinkUntil = 0;
                }
                // Auto-pick a card so party game continues without stalling
                this.chooseCard(Math.floor(Math.random() * 6));
            }
        }

        // 2. Card 3D Flip Progression
        if (this.phase === 'flipping') {
            this.flipProgress += dt * 0.0022; // ~450ms flip
            if (this.flipProgress >= 1.0) {
                this.flipProgress = 1.0;
                this.phase = 'revealed';
                this.revealedAt = timestamp;
                this.sound.playRevealChord();
            }
        } else if (this.phase === 'revealed') {
            // Pause 800ms after reveal before coins start moving
            if (timestamp - this.revealedAt > 800) {
                this.startCoinMovement();
            }
        }

        // 3. Coin Movement Progression
        if (this.phase === 'moving') {
            const hopSpeed = 0.0055; // ~180ms per hop step
            this.hopProgress += dt * hopSpeed;

            if (this.hopProgress >= 1.0) {
                this.hopProgress = 1.0;
                // Step completed: update player's board position
                this.playerState[currentId].pos = this.currentHopTarget;
                this.sound.playHop(this.hopSteps.length);

                // Pull next step in queue
                this.hopSteps.shift();
                if (this.hopSteps.length > 0) {
                    this.currentHopStart = this.currentHopTarget;
                    this.currentHopTarget = this.hopSteps[0];
                    this.hopProgress = 0;
                } else {
                    // All hops completed! Check landing square for Snakes or Ladders
                    this.finishMovementAndCheckEvents();
                }
            }
        }

        // 4. Special Events (Snake Swallow or Ladder Climb) Progression
        if (this.phase === 'special_event') {
            const evt = this.activeSpecialEvent;
            evt.progress += dt / evt.duration;

            if (evt.progress >= 1.0) {
                evt.progress = 1.0;
                // Move player to destination square
                this.playerState[currentId].pos = evt.to;
                this.phase = 'turn_done';

                setTimeout(() => {
                    this.completeTurn();
                }, 850);
            }
        }

        // Render Canvas
        this.draw(timestamp);

        this.rafId = requestAnimationFrame(this.loop);
    }

    destroy() {
        this.running = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.ctx.setOverlay('');
    }
}

/* ---------- Utility Helpers ---------------------------------------------- */

function colorMix(hex, alpha) {
    if (!hex || !hex.startsWith('#')) return `rgba(37, 99, 235, ${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ==========================================================================
   Register Game Cartridge
   ========================================================================== */

CastOn.registerGame({
    id: 'snakes',
    title: 'Snakes & Ladders',
    tagline: 'Realistic Serpents',
    players: '1–8 players',
    control: 'D-Pad + Roll',
    description: 'Slither past realistic serpents, climb golden ladders, and race to 100 before only one player remains!',
    accent: '#10b981',
    icon: 'snake',
    css: `
        .snakes-results-scrim {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(5, 8, 15, 0.78);
            backdrop-filter: blur(8px);
            z-index: 20;
        }
        .snakes-celebration-scrim {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(5, 8, 15, 0.82);
            backdrop-filter: blur(10px);
            z-index: 25;
            animation: popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .celebration-card {
            background: rgba(15, 23, 42, 0.95);
            border: 2px solid var(--ring-color, #f59e0b);
            border-radius: 20px;
            padding: 36px 48px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px var(--ring-color, #f59e0b);
            position: relative;
            max-width: 480px;
        }
        .celebration-card__crown {
            font-size: 42px;
            margin-bottom: -10px;
            animation: bounceCrown 1.2s ease-in-out infinite;
        }
        @keyframes bounceCrown {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-8px) scale(1.15); }
        }
        .pulse-avatar {
            box-shadow: 0 0 25px var(--ring-color, #f59e0b);
            margin-bottom: 16px;
        }
        .celebration-name {
            color: #ffffff;
            margin: 8px 0 6px 0;
        }
        .celebration-badge {
            display: inline-block;
            background: #f59e0b;
            color: #0f172a;
            font-weight: 800;
            font-family: 'Space Grotesk', sans-serif;
            font-size: 14px;
            padding: 4px 14px;
            border-radius: 999px;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }
        @keyframes popIn {
            0% { transform: scale(0.85); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
        }
    `,
    create: (ctx) => new SnakesAndLaddersGame(ctx)
});

})(window);

