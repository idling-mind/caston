/* ==========================================================================
   CastOn — Game: Hangman (Word Duel: 1 vs Rest of the Group)
   - One player is the "Executioner / Word Master" each round.
   - The Word Master chooses from 3 themed words or types their own custom secret word.
   - The Rest of the Group (The Mob / Survivors) take turns guessing letters on their
     phones or attempting a sudden full-word solve.
   - Every wrong letter builds the gallows and gives +150 pts to the Word Master.
   - If 6 strikes occur: The Executioner hangs the mob and gets a +500 pts clean sweep!
   - If the Mob solves the word: The solver earns big bonus points and saves the day!
   - 1–8 players (supports AI rival bot when playing solo).
   ========================================================================== */
(function (w) {
'use strict';

const CastOn = w.CastOn;
const T = CastOn.tools || {};

const PICK_TIME_SEC = 25;
const GUESS_TIME_SEC = 15;
const MAX_STRIKES = 6;

const BOT_EXECUTIONER = {
    id: '__bot_hangman',
    name: 'Robo-Gallows',
    color: '#f43f5e',
    avatar: '🤖',
    is_vip: false,
    __bot: true
};

const DEFAULT_WORDS = [
    { word: 'STAR WARS', difficulty: 'easy', category: 'Movies & TV', hint: 'A galaxy far, far away' },
    { word: 'PIZZA MARGHERITA', difficulty: 'easy', category: 'Food & Culinary', hint: 'Basil, mozzarella and tomato' },
    { word: 'ELECTRIC GUITAR', difficulty: 'easy', category: 'Music & Gaming', hint: 'Plugged in to rock the stadium' },
    { word: 'JURASSIC PARK', difficulty: 'easy', category: 'Movies & TV', hint: 'Dinosaurs running wild' },
    { word: 'CHAMELEON', difficulty: 'medium', category: 'Animals & Nature', hint: 'Color-changing reptile' },
    { word: 'STRANGER THINGS', difficulty: 'medium', category: 'Movies & TV', hint: 'The Upside Down in Hawkins' },
    { word: 'GUACAMOLE', difficulty: 'medium', category: 'Food & Culinary', hint: 'Mashed avocado with lime' },
    { word: 'TIME MACHINE', difficulty: 'medium', category: 'Sci-Fi & Tech', hint: 'Dialing back to the past' },
    { word: 'BACK TO THE FUTURE', difficulty: 'hard', category: 'Movies & TV', hint: '88 miles per hour DeLorean' },
    { word: 'QUANTUM COMPUTER', difficulty: 'hard', category: 'Sci-Fi & Tech', hint: 'Qubits calculating superpositions' },
    { word: 'DUNGEONS AND DRAGONS', difficulty: 'hard', category: 'Music & Gaming', hint: 'Tabletop RPG with 20-sided dice' }
];

function getWordList() {
    return (CastOn.HANGMAN_WORDS && CastOn.HANGMAN_WORDS.length >= 10)
        ? CastOn.HANGMAN_WORDS
        : DEFAULT_WORDS;
}

function normalizeAlpha(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z]/g, '');
}

class HangmanGame extends CastOn.Game {
    constructor(ctx) {
        super(ctx);
        this.ctx = ctx || CastOn;
        this.running = true;
        this.scores = {};
        this.round = -1;
        this.order = [];
        this.phase = 'idle'; // 'idle' | 'picking' | 'playing' | 'round_over' | 'finished'

        this.word = '';
        this.category = 'General';
        this.hint = '';
        this.difficulty = 'medium';

        this.masterId = null;
        this.activeGuesserId = null;
        this.guesserOrder = [];
        this.guesserTurnIdx = 0;

        this.guessedLetters = new Set();
        this.wrongLetters = [];
        this.correctLetters = new Set();
        this.strikes = 0;
        this.maxStrikes = MAX_STRIKES;

        this.roundWinner = null; // 'guessers' | 'master'
        this.roundSolver = null; // player obj

        this.clockRemaining = 0;
        this.clockInterval = null;
        this.celebrationTimeout = null;
        this.botTimeout = null;

        this.rafId = null;
        this.animTime = 0;
        this.shakeTimer = 0;

        // Initialize players & scores
        this.initPlayers();
        this.totalRounds = this.calculateTotalRounds();

        // Start animation loop
        this.loop = this.loop.bind(this);
        this.rafId = requestAnimationFrame(this.loop);

        // Show How to Play screen first; start Round 1 when player presses A
        this.enterHowToPhase();
    }

    enterHowToPhase() {
        this.phase = 'howto';
        this.clearTimers();

        this.ctx.controller.setLayout('dpad', {
            title: 'Hangman: Word Duel',
            subtitle: 'Press A to Start Game!'
        }, 'all');

        this.ctx.setOverlay(T.howToPlay({
            title: 'How to Play Hangman: Word Duel',
            subtitle: `${this.totalRounds} Rounds · Asymmetric Executioner vs. The Mob`,
            steps: [
                { icon: '🪓', title: '1. The Executioner Picks', text: 'Each round, one player is the Executioner and chooses a secret word from the vault (or types a custom word).' },
                { icon: '🔤', title: '2. Take Turns Guessing', text: 'Everyone else takes turns guessing letters (+100 pts per hit). Correct hits keep your turn alive!' },
                { icon: '⚡', title: '3. Sudden Solve Bonus', text: 'Think you know the word? Tap Solve Full Word on your phone for a +500 pt sudden-solve bonus!' },
                { icon: '💀', title: '4. 6 Strikes & You Hang', text: 'Every wrong guess adds a body part and gives the Executioner +150 pts (+500 bonus for a full 6-strike sweep).' }
            ],
            controls: [
                { key: 'A–Z Keypad', label: 'Guess Letter on Phone' },
                { key: 'Solve', label: 'Guess Full Word' },
                { key: 'A', label: 'Start Game' }
            ],
            footerText: 'Press A on your phone controller to start Round 1!'
        }));
    }

    initPlayers() {
        const liveIds = Object.keys(this.ctx.players);
        this.scores = {};

        // If only 1 player, add the AI bot
        if (liveIds.length <= 1) {
            this.includeBot = true;
            this.botPlayer = Object.assign({}, BOT_EXECUTIONER);
        } else {
            this.includeBot = false;
            this.botPlayer = null;
        }

        const all = this.getAllPlayersList();
        all.forEach(p => { this.scores[p.id] = 0; });
        this.order = all.map(p => p.id);
    }

    getAllPlayersList() {
        const list = Object.values(this.ctx.players).map(p => Object.assign({}, p));
        if (this.includeBot && this.botPlayer) {
            list.push(this.botPlayer);
        }
        return list;
    }

    getPlayer(id) {
        if (!id) return null;
        if (this.ctx.players[id]) return this.ctx.players[id];
        if (this.includeBot && this.botPlayer && this.botPlayer.id === id) return this.botPlayer;
        return null;
    }

    calculateTotalRounds() {
        const all = this.getAllPlayersList();
        const count = all.length;
        if (count <= 1) return 3;
        if (count <= 3) return count * 2;
        return count;
    }

    /* ---------- Game Lifecycle & Turns ----------------------------------- */

    beginRound() {
        this.clearTimers();
        this.round++;

        const all = this.getAllPlayersList();
        if (this.round >= this.totalRounds || all.length === 0) {
            this.finishGame();
            return;
        }

        // Determine Word Master for this round
        const masterIdx = this.round % this.order.length;
        this.masterId = this.order[masterIdx];

        // Ensure master is still present
        if (!this.getPlayer(this.masterId)) {
            this.initPlayers();
            this.masterId = this.order[0];
        }

        // Build list of guessers (all players except word master)
        this.guesserOrder = this.order.filter(id => id !== this.masterId);
        if (!this.guesserOrder.length) {
            // Solo fallback
            this.guesserOrder = [this.order[0]];
        }
        this.guesserTurnIdx = 0;
        this.activeGuesserId = this.guesserOrder[0];

        // Reset round state
        this.phase = 'picking';
        this.word = '';
        this.category = 'General';
        this.hint = '';
        this.difficulty = 'medium';
        this.guessedLetters.clear();
        this.wrongLetters = [];
        this.correctLetters.clear();
        this.strikes = 0;
        this.roundWinner = null;
        this.roundSolver = null;
        this.shakeTimer = 0;

        // Pick 3 candidate words for the Word Master to choose from
        const bank = getWordList();
        const choices = this.generateWordChoices(bank);
        this.currentWordChoices = choices;

        const master = this.getPlayer(this.masterId);
        const masterName = master ? master.name : 'The Executioner';

        // Notify controllers
        this.syncLayoutsForPicking(choices);

        // Play suspense tone
        if (this.ctx.sound) this.ctx.sound.pop();

        // 25 second timer for word master to pick
        this.clockRemaining = PICK_TIME_SEC;
        this.startClock(() => {
            // Auto pick word on timeout
            const fallback = this.currentWordChoices[1] || this.currentWordChoices[0];
            this.setSecretWord(fallback.word, fallback.category, fallback.difficulty, fallback.hint);
        });

        // If the Word Master is the bot, pick automatically after 2s
        if (this.masterId === BOT_EXECUTIONER.id) {
            this.botTimeout = setTimeout(() => {
                const pick = this.currentWordChoices[Math.floor(Math.random() * this.currentWordChoices.length)];
                this.setSecretWord(pick.word, pick.category, pick.difficulty, pick.hint);
            }, 2000);
        }
    }

    generateWordChoices(bank) {
        const easyList = bank.filter(b => (b.difficulty || 'medium').toLowerCase() === 'easy');
        const medList = bank.filter(b => (b.difficulty || 'medium').toLowerCase() === 'medium');
        const hardList = bank.filter(b => (b.difficulty || 'medium').toLowerCase() === 'hard');

        const pickRandom = (arr, fallback) => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : fallback);

        return [
            pickRandom(easyList, DEFAULT_WORDS[0]),
            pickRandom(medList, DEFAULT_WORDS[4]),
            pickRandom(hardList, DEFAULT_WORDS[8])
        ];
    }

    setSecretWord(rawWord, category, difficulty, hint) {
        if (this.phase !== 'picking') return;
        this.clearTimers();

        const cleaned = String(rawWord || '').trim().toUpperCase().replace(/[^A-Z\s\-']/g, '');
        if (!cleaned.replace(/[^A-Z]/g, '').length) {
            // If empty, fallback
            this.word = 'STAR WARS';
        } else {
            this.word = cleaned;
        }

        this.category = category || 'General';
        this.difficulty = difficulty || 'medium';
        this.hint = hint || '';
        this.phase = 'playing';

        // Play launch sound
        if (this.ctx.sound) this.ctx.sound.blip();

        // Start first guesser's turn
        this.startGuesserTurn();
    }

    startGuesserTurn() {
        this.clearTimers();
        if (this.phase !== 'playing') return;

        // Ensure active guesser is valid
        if (!this.getPlayer(this.activeGuesserId)) {
            this.advanceGuesserTurn(false);
            return;
        }

        this.syncLayoutsForPlaying();

        // 15 second turn timer
        this.clockRemaining = GUESS_TIME_SEC;
        this.startClock(() => {
            // Guesser timed out! Auto-guess a common remaining letter or pass turn
            this.handleTurnTimeout();
        });

        // If the active guesser is the bot, guess automatically after 2s
        if (this.activeGuesserId === BOT_EXECUTIONER.id) {
            this.botTimeout = setTimeout(() => {
                this.makeBotGuess();
            }, 2000);
        }
    }

    makeBotGuess() {
        const alphaInWord = new Set(this.word.replace(/[^A-Z]/g, '').split(''));
        const freqOrder = ['E', 'T', 'A', 'O', 'I', 'N', 'S', 'H', 'R', 'D', 'L', 'C', 'U', 'M', 'W', 'F', 'G', 'Y', 'P', 'B', 'V', 'K', 'J', 'X', 'Q', 'Z'];
        
        // 60% chance bot picks a correct letter, 40% random
        let candidate = null;
        if (Math.random() < 0.65) {
            for (const ch of alphaInWord) {
                if (!this.guessedLetters.has(ch)) {
                    candidate = ch;
                    break;
                }
            }
        }
        if (!candidate) {
            for (const ch of freqOrder) {
                if (!this.guessedLetters.has(ch)) {
                    candidate = ch;
                    break;
                }
            }
        }
        if (candidate) {
            this.submitLetterGuess(this.activeGuesserId, candidate);
        } else {
            this.advanceGuesserTurn(true);
        }
    }

    handleTurnTimeout() {
        // Find first untried common letter
        const freq = ['E', 'A', 'R', 'I', 'O', 'T', 'N', 'S', 'L', 'C', 'U', 'D', 'P', 'M', 'H', 'G', 'B', 'F', 'Y', 'W', 'K', 'V', 'X', 'Z', 'J', 'Q'];
        let picked = null;
        for (const ch of freq) {
            if (!this.guessedLetters.has(ch)) {
                picked = ch;
                break;
            }
        }
        if (picked) {
            this.submitLetterGuess(this.activeGuesserId, picked);
        } else {
            this.advanceGuesserTurn(true);
        }
    }

    advanceGuesserTurn(playChime) {
        if (this.phase !== 'playing') return;
        this.guesserTurnIdx = (this.guesserTurnIdx + 1) % this.guesserOrder.length;
        this.activeGuesserId = this.guesserOrder[this.guesserTurnIdx];
        if (playChime && this.ctx.sound) this.ctx.sound.pop();
        this.startGuesserTurn();
    }

    /* ---------- Input Handling & Scoring --------------------------------- */

    onInput(playerId, data) {
        if (!data) return;
        const action = data.action;

        if (this.phase === 'howto') {
            if (action === 'btn' && data.state === 'down' && (data.button === 'A' || data.button === 'B')) {
                this.ctx.setOverlay('');
                this.beginRound();
            }
            return;
        }

        // Phase 1: Word Master picking word
        if (this.phase === 'picking' && playerId === this.masterId) {
            if (action === 'hm_pick_word') {
                this.setSecretWord(data.word, data.category, data.difficulty, data.hint);
                return;
            }
            if (action === 'hm_custom_word') {
                this.setSecretWord(data.word, data.category || 'Custom', 'medium', 'Player custom creation');
                return;
            }
        }

        // Phase 2: Guessers playing
        if (this.phase === 'playing' && playerId === this.activeGuesserId) {
            if (action === 'hm_guess_letter') {
                const ch = String(data.letter || '').toUpperCase().trim();
                if (ch.length === 1 && ch >= 'A' && ch <= 'Z') {
                    this.submitLetterGuess(playerId, ch);
                }
                return;
            }
            if (action === 'hm_solve_word') {
                this.submitSolveGuess(playerId, data.word);
                return;
            }
        }
    }

    submitLetterGuess(playerId, letter) {
        if (this.phase !== 'playing') return;
        if (this.guessedLetters.has(letter)) return; // Already picked

        this.guessedLetters.add(letter);

        if (this.word.includes(letter)) {
            // --- CORRECT GUESS! ---
            this.correctLetters.add(letter);
            let count = 0;
            for (let i = 0; i < this.word.length; i++) {
                if (this.word[i] === letter) count++;
            }

            // Award points: +100 pts per occurrence
            const pts = 100 * count;
            this.scores[playerId] = (this.scores[playerId] || 0) + pts;

            if (this.ctx.sound) this.ctx.sound.success();
            if (this.ctx.controller && this.ctx.controller.vibrate) {
                this.ctx.controller.vibrate(60, playerId);
            }

            // Check if full word is now uncovered
            if (this.isWordFullyRevealed()) {
                // Bonus for completing the word
                this.scores[playerId] += 250;
                this.endRound('guessers', this.getPlayer(playerId));
            } else {
                // Keep turn as reward! (Bonus turn streak)
                this.startGuesserTurn();
            }
        } else {
            // --- WRONG GUESS! ---
            this.wrongLetters.push(letter);
            this.strikes++;
            this.shakeTimer = 18; // Trigger canvas screen shake

            // Executioner / Word Master earns +150 pts per strike!
            this.scores[this.masterId] = (this.scores[this.masterId] || 0) + 150;

            if (this.ctx.sound) this.ctx.sound.fail();
            if (this.ctx.controller && this.ctx.controller.vibrate) {
                this.ctx.controller.vibrate(120, playerId);
                this.ctx.controller.vibrate(50, this.masterId);
            }

            // Check if gallows completed (Hanged!)
            if (this.strikes >= this.maxStrikes) {
                // Executioner Clean Sweep: +500 pts!
                this.scores[this.masterId] += 500;
                if (this.ctx.sound) this.ctx.sound.chord([220, 165, 110], 400, 'sawtooth');
                this.endRound('master', this.getPlayer(this.masterId));
            } else {
                // Pass turn to next guesser
                this.advanceGuesserTurn(false);
            }
        }
    }

    submitSolveGuess(playerId, rawAttempt) {
        if (this.phase !== 'playing') return;
        const attempt = normalizeAlpha(rawAttempt);
        const target = normalizeAlpha(this.word);

        if (!attempt) return;

        if (attempt === target) {
            // --- SUDDEN SOLVE SUCCESS! ---
            // Calculate unrevealed letters bonus
            let unrevealed = 0;
            for (let i = 0; i < this.word.length; i++) {
                const ch = this.word[i];
                if (ch >= 'A' && ch <= 'Z' && !this.correctLetters.has(ch)) {
                    unrevealed++;
                }
            }

            const solvePts = 500 + (unrevealed * 50);
            this.scores[playerId] = (this.scores[playerId] || 0) + solvePts;

            // Mark all letters revealed
            for (let i = 0; i < this.word.length; i++) {
                const ch = this.word[i];
                if (ch >= 'A' && ch <= 'Z') {
                    this.guessedLetters.add(ch);
                    this.correctLetters.add(ch);
                }
            }

            if (this.ctx.sound) this.ctx.sound.fanfare();
            if (this.ctx.controller && this.ctx.controller.vibrate) {
                this.ctx.controller.vibrate(200, playerId);
            }

            this.endRound('guessers', this.getPlayer(playerId));
        } else {
            // --- SOLVE FAILED! ---
            this.strikes++;
            this.shakeTimer = 22;
            this.scores[this.masterId] = (this.scores[this.masterId] || 0) + 150;

            if (this.ctx.sound) this.ctx.sound.fail();
            if (this.ctx.controller && this.ctx.controller.vibrate) {
                this.ctx.controller.vibrate(180, playerId);
            }

            if (this.strikes >= this.maxStrikes) {
                this.scores[this.masterId] += 500;
                if (this.ctx.sound) this.ctx.sound.chord([220, 165, 110], 400, 'sawtooth');
                this.endRound('master', this.getPlayer(this.masterId));
            } else {
                this.advanceGuesserTurn(false);
            }
        }
    }

    isWordFullyRevealed() {
        for (let i = 0; i < this.word.length; i++) {
            const ch = this.word[i];
            if (ch >= 'A' && ch <= 'Z' && !this.correctLetters.has(ch)) {
                return false;
            }
        }
        return true;
    }

    endRound(winner, solver) {
        this.clearTimers();
        this.phase = 'round_over';
        this.roundWinner = winner;
        this.roundSolver = solver;

        // Reveal full word
        for (let i = 0; i < this.word.length; i++) {
            const ch = this.word[i];
            if (ch >= 'A' && ch <= 'Z') {
                this.guessedLetters.add(ch);
                this.correctLetters.add(ch);
            }
        }

        // Notify controllers of round finish
        const master = this.getPlayer(this.masterId);
        Object.keys(this.ctx.players).forEach(pid => {
            this.ctx.controller.setLayout('hangman', {
                role: 'guesser',
                isMyTurn: false,
                title: winner === 'master' ? 'Executioner Wins!' : 'The Mob Solved It!',
                subtitle: `The secret word was ${this.word}`,
                category: this.category
            }, pid);
        });

        // 6 second celebration then next round
        this.celebrationTimeout = setTimeout(() => {
            this.beginRound();
        }, 6000);
    }

    finishGame() {
        this.clearTimers();
        this.phase = 'finished';

        const ranked = this.ctx.getRankedPlayers
            ? this.ctx.getRankedPlayers(this.scores)
            : T.sorted(this.getAllPlayersList(), this.scores);

        const html = T.results({
            title: ranked[0] ? ranked[0].name : 'Winner',
            kicker: 'Match Over · Final Podium',
            rows: ranked,
            playerCount: ranked.length,
            footer: 'Leader: Press A to return to lobby or pick next game'
        });

        this.ctx.setOverlay(html);

        // Put VIP into D-Pad layout to navigate or exit
        Object.keys(this.ctx.players).forEach(pid => {
            this.ctx.controller.setLayout('dpad', {
                title: 'Game Complete',
                subtitle: 'Press A to return to lobby'
            }, pid);
        });
    }

    /* ---------- Phone Layout Syncing ------------------------------------- */

    syncLayoutsForPicking(choices) {
        const master = this.getPlayer(this.masterId);
        const masterName = master ? master.name : 'Word Master';

        Object.keys(this.ctx.players).forEach(pid => {
            if (pid === this.masterId) {
                this.ctx.controller.setLayout('hangman', {
                    role: 'master_pick',
                    wordChoices: choices,
                    title: 'Pick a Secret Word',
                    subtitle: 'Choose a word to stump the room, or type your own!'
                }, pid);
            } else {
                this.ctx.controller.setLayout('hangman', {
                    role: 'guesser',
                    isMyTurn: false,
                    turnPlayer: master,
                    title: `${masterName} is picking...`,
                    subtitle: 'Watch the TV! Get ready to guess.',
                    category: 'Secret...'
                }, pid);
            }
        });
    }

    syncLayoutsForPlaying() {
        const pickedMap = {};
        this.correctLetters.forEach(ch => { pickedMap[ch] = 'correct'; });
        this.wrongLetters.forEach(ch => { pickedMap[ch] = 'wrong'; });

        const activeGuesser = this.getPlayer(this.activeGuesserId);
        const master = this.getPlayer(this.masterId);

        Object.keys(this.ctx.players).forEach(pid => {
            if (pid === this.masterId) {
                // Word Master live dashboard
                this.ctx.controller.setLayout('hangman', {
                    role: 'master_view',
                    word: this.word,
                    category: this.category,
                    strikes: this.strikes,
                    maxStrikes: this.maxStrikes,
                    wrongLetters: this.wrongLetters,
                    title: 'You are the Word Master',
                    subtitle: 'Cheer for wrong letters! +150 pts per strike.'
                }, pid);
            } else {
                // Guesser layout
                const isMyTurn = (pid === this.activeGuesserId);
                this.ctx.controller.setLayout('hangman', {
                    role: 'guesser',
                    isMyTurn: isMyTurn,
                    turnPlayer: activeGuesser,
                    pickedLetters: pickedMap,
                    category: this.category,
                    title: isMyTurn ? '⭐ YOUR TURN TO GUESS!' : `${activeGuesser ? activeGuesser.name : 'Player'} is guessing...`,
                    subtitle: isMyTurn ? 'Tap a letter or attempt a sudden solve!' : 'Watch the TV screen.'
                }, pid);
            }
        });
    }

    startClock(onExpired) {
        if (this.clockInterval) clearInterval(this.clockInterval);
        this.clockInterval = setInterval(() => {
            this.clockRemaining--;
            if (this.clockRemaining <= 0) {
                clearInterval(this.clockInterval);
                this.clockInterval = null;
                if (onExpired) onExpired();
            }
        }, 1000);
    }

    clearTimers() {
        if (this.clockInterval) { clearInterval(this.clockInterval); this.clockInterval = null; }
        if (this.celebrationTimeout) { clearTimeout(this.celebrationTimeout); this.celebrationTimeout = null; }
        if (this.botTimeout) { clearTimeout(this.botTimeout); this.botTimeout = null; }
    }

    onPlayersSync() {
        const currentList = this.getAllPlayersList();
        currentList.forEach(p => {
            if (this.scores[p.id] === undefined) this.scores[p.id] = 0;
            if (!this.order.includes(p.id)) this.order.push(p.id);
        });

        if (this.phase === 'howto') {
            this.totalRounds = this.calculateTotalRounds();
            return;
        }

        // If the word master disconnected during their turn, begin new round
        if (!this.getPlayer(this.masterId) && this.phase !== 'finished') {
            this.beginRound();
            return;
        }

        // If active guesser disconnected, advance turn
        if (!this.getPlayer(this.activeGuesserId) && this.phase === 'playing') {
            this.advanceGuesserTurn(false);
            return;
        }

        // Re-sync layouts so refreshed/reconnected phones immediately show their UI
        if (this.phase === 'picking') {
            this.syncLayoutsForPicking(this.currentWordChoices);
        } else if (this.phase === 'playing') {
            this.syncLayoutsForPlaying();
        }
    }

    /* ---------- Canvas Rendering & TV Visuals ---------------------------- */

    loop(timestamp) {
        if (!this.running) return;

        this.animTime = timestamp * 0.001;
        if (this.shakeTimer > 0) this.shakeTimer--;

        const view = this.ctx.view;
        const g = this.ctx.ctx;

        g.save();
        this.ctx.clearCanvas();

        // 1. Background Arena Backdrop
        this.ctx.graphics.arenaBackdrop(view);

        if (this.phase === 'howto') {
            g.restore();
            this.rafId = requestAnimationFrame(this.loop);
            return;
        }

        // Apply screen shake on wrong guess
        if (this.shakeTimer > 0) {
            const mag = (this.shakeTimer / 20) * 8 * view.scale;
            const ox = (Math.random() - 0.5) * mag;
            const oy = (Math.random() - 0.5) * mag;
            g.translate(ox, oy);
        }

        // 2. Top Header HUD Bar
        this.drawTopHud(g, view);

        // 3. Left Side: Animated Gallows & Puppet
        this.drawGallows(g, view);

        // 4. Right Side: Word Tiles, Graveyard, Turn Banner
        this.drawWordBoard(g, view);

        // 5. Overlay Round Over Summary
        if (this.phase === 'round_over') {
            this.drawRoundOverBanner(g, view);
        }

        g.restore();

        this.rafId = requestAnimationFrame(this.loop);
    }

    drawTopHud(g, view) {
        const s = view.scale;
        const padX = 36 * s;
        const topY = 28 * s;

        // Round & Game title
        g.font = `700 ${Math.round(13 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = 'rgba(255, 255, 255, 0.45)';
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillText(`ROUND ${this.round + 1} OF ${this.totalRounds}`, padX, topY);

        g.font = `800 ${Math.round(20 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = '#ffffff';
        g.fillText('HANGMAN: WORD DUEL', padX, topY + 16 * s);

        // Word Master Badge in Center
        const master = this.getPlayer(this.masterId);
        if (master) {
            const centerX = view.w * 0.5;
            const badgeW = 260 * s;
            const badgeH = 34 * s;
            const badgeX = centerX - badgeW / 2;
            const badgeY = topY + 2 * s;

            g.fillStyle = 'rgba(244, 63, 94, 0.15)';
            g.strokeStyle = 'rgba(244, 63, 94, 0.45)';
            g.lineWidth = 1.5 * s;
            T.roundRect(g, badgeX, badgeY, badgeW, badgeH, 8 * s);
            g.fill();
            g.stroke();

            g.font = `700 ${Math.round(12 * s)}px "Space Grotesk", sans-serif`;
            g.fillStyle = '#fda4af';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(`🪓 EXECUTIONER: ${master.name.toUpperCase()}`, centerX, badgeY + badgeH / 2);
        }

        // Score Rail at Top Right
        const ranked = this.ctx.getRankedPlayers
            ? this.ctx.getRankedPlayers(this.scores)
            : T.sorted(this.getAllPlayersList(), this.scores);

        let rx = view.w - padX;
        const ry = topY + 16 * s;
        for (let i = ranked.length - 1; i >= 0; i--) {
            const p = ranked[i];
            const chipText = `${p.name}: ${p.score}`;
            g.font = `700 ${Math.round(12 * s)}px "Space Grotesk", sans-serif`;
            const textW = g.measureText(chipText).width;
            const chipW = textW + 28 * s;
            const chipH = 26 * s;
            rx -= chipW;

            g.fillStyle = 'rgba(255, 255, 255, 0.08)';
            g.strokeStyle = p.color || 'rgba(255, 255, 255, 0.2)';
            g.lineWidth = 1.5 * s;
            T.roundRect(g, rx, ry, chipW, chipH, 6 * s);
            g.fill();
            g.stroke();

            // Avatar dot
            g.fillStyle = p.color || '#3b82f6';
            T.circle(g, rx + 12 * s, ry + chipH / 2, 4 * s);
            g.fill();

            // Label
            g.fillStyle = '#ffffff';
            g.textAlign = 'left';
            g.textBaseline = 'middle';
            g.fillText(chipText, rx + 20 * s, ry + chipH / 2);

            rx -= 8 * s;
        }
    }

    drawGallows(g, view) {
        const s = view.scale;
        const gx = view.w * 0.22;
        const gy = view.h * 0.68;

        g.save();

        // 1. Ground Grass / Base Mound
        const moundW = 240 * s;
        const moundH = 24 * s;
        g.fillStyle = 'rgba(0, 0, 0, 0.4)';
        g.beginPath();
        g.ellipse(gx, gy + 12 * s, moundW * 0.5, moundH * 0.5, 0, 0, Math.PI * 2);
        g.fill();

        // 2. Wooden Gallows Scaffold
        const woodDark = '#3e2723';
        const woodMid = '#5d4037';
        const woodLight = '#8d6e63';

        // Base timber
        g.fillStyle = woodMid;
        g.strokeStyle = woodDark;
        g.lineWidth = 2 * s;
        T.roundRect(g, gx - 90 * s, gy, 180 * s, 14 * s, 4 * s);
        g.fill();
        g.stroke();

        // Upright vertical mast
        const mastX = gx - 60 * s;
        const mastTopY = gy - 260 * s;
        const mastW = 18 * s;
        const mastH = 260 * s;
        T.roundRect(g, mastX, mastTopY, mastW, mastH, 3 * s);
        g.fill();
        g.stroke();

        // Horizontal crossbeam
        const beamX = mastX;
        const beamY = mastTopY;
        const beamW = 140 * s;
        const beamH = 16 * s;
        T.roundRect(g, beamX, beamY, beamW, beamH, 3 * s);
        g.fill();
        g.stroke();

        // Angle support strut
        g.beginPath();
        g.moveTo(mastX, mastTopY + 50 * s);
        g.lineTo(mastX + 50 * s, mastTopY);
        g.lineTo(mastX + 64 * s, mastTopY);
        g.lineTo(mastX, mastTopY + 64 * s);
        g.closePath();
        g.fillStyle = woodDark;
        g.fill();

        // Rope Drop & Noose
        const nooseX = mastX + 115 * s;
        const ropeLen = 45 * s;
        const nooseTopY = mastTopY + beamH;
        const nooseBottomY = nooseTopY + ropeLen;

        g.strokeStyle = '#d7ccc8';
        g.lineWidth = 3 * s;
        g.beginPath();
        g.moveTo(nooseX, nooseTopY);
        g.lineTo(nooseX, nooseBottomY);
        g.stroke();

        // Noose knot
        g.fillStyle = '#bcaaa4';
        T.circle(g, nooseX, nooseBottomY, 4 * s);
        g.fill();

        // 3. The Hangman Ragdoll (CastOn Buddy)
        // Gentle physics sway based on sine wave
        const swayAngle = Math.sin(this.animTime * 2.2) * 0.05;

        g.translate(nooseX, nooseBottomY);
        g.rotate(swayAngle);

        const bodyColor = '#38bdf8';
        const outlineColor = '#0369a1';
        const headRadius = 18 * s;
        const torsoLen = 42 * s;

        // Strike 1: Head
        if (this.strikes >= 1) {
            g.fillStyle = '#fde047';
            g.strokeStyle = '#ca8a04';
            g.lineWidth = 2.5 * s;
            T.circle(g, 0, headRadius + 2 * s, headRadius);
            g.fill();
            g.stroke();

            // Face expression based on strike level
            g.fillStyle = '#1e293b';
            if (this.strikes >= 6) {
                // X X dead eyes
                g.lineWidth = 2 * s;
                g.strokeStyle = '#1e293b';
                const eyeOff = 6 * s;
                const eyeY = headRadius;
                // Left X
                g.beginPath();
                g.moveTo(-eyeOff - 3 * s, eyeY - 3 * s); g.lineTo(-eyeOff + 3 * s, eyeY + 3 * s);
                g.moveTo(-eyeOff + 3 * s, eyeY - 3 * s); g.lineTo(-eyeOff - 3 * s, eyeY + 3 * s);
                // Right X
                g.moveTo(eyeOff - 3 * s, eyeY - 3 * s); g.lineTo(eyeOff + 3 * s, eyeY + 3 * s);
                g.moveTo(eyeOff + 3 * s, eyeY - 3 * s); g.lineTo(eyeOff - 3 * s, eyeY + 3 * s);
                g.stroke();

                // Frown / tongue
                g.beginPath();
                g.arc(0, headRadius + 10 * s, 4 * s, Math.PI, 0, true);
                g.stroke();
            } else {
                // Worried / round eyes
                const eyeY = headRadius;
                T.circle(g, -6 * s, eyeY, 2.5 * s); g.fill();
                T.circle(g, 6 * s, eyeY, 2.5 * s); g.fill();

                // Wobbly mouth
                g.beginPath();
                if (this.strikes <= 2) {
                    g.arc(0, headRadius + 5 * s, 5 * s, 0, Math.PI); // smile
                } else if (this.strikes <= 4) {
                    g.moveTo(-5 * s, headRadius + 8 * s); g.lineTo(5 * s, headRadius + 8 * s); // flat
                } else {
                    g.arc(0, headRadius + 11 * s, 6 * s, Math.PI, 0); // sad frown
                }
                g.lineWidth = 2 * s;
                g.strokeStyle = '#1e293b';
                g.stroke();
            }
        }

        const torsoTopY = headRadius * 2 + 2 * s;
        const torsoBottomY = torsoTopY + torsoLen;

        // Strike 2: Torso
        if (this.strikes >= 2) {
            g.fillStyle = bodyColor;
            g.strokeStyle = outlineColor;
            g.lineWidth = 2.5 * s;
            T.roundRect(g, -11 * s, torsoTopY, 22 * s, torsoLen, 7 * s);
            g.fill();
            g.stroke();
        }

        // Strike 3: Left Arm
        if (this.strikes >= 3) {
            g.strokeStyle = bodyColor;
            g.lineWidth = 5 * s;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(-10 * s, torsoTopY + 8 * s);
            g.lineTo(-28 * s, torsoTopY + 30 * s);
            g.stroke();
        }

        // Strike 4: Right Arm
        if (this.strikes >= 4) {
            g.strokeStyle = bodyColor;
            g.lineWidth = 5 * s;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(10 * s, torsoTopY + 8 * s);
            g.lineTo(28 * s, torsoTopY + 30 * s);
            g.stroke();
        }

        // Strike 5: Left Leg
        if (this.strikes >= 5) {
            g.strokeStyle = '#64748b';
            g.lineWidth = 6 * s;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(-6 * s, torsoBottomY);
            g.lineTo(-18 * s, torsoBottomY + 38 * s);
            g.stroke();
        }

        // Strike 6: Right Leg
        if (this.strikes >= 6) {
            g.strokeStyle = '#64748b';
            g.lineWidth = 6 * s;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(6 * s, torsoBottomY);
            g.lineTo(18 * s, torsoBottomY + 38 * s);
            g.stroke();
        }

        g.restore();

        // 4. Strike Counter Pips under the gallows
        const pipsY = gy + 32 * s;
        const pipsW = 190 * s;
        const pipStartX = gx - pipsW / 2;

        g.font = `700 ${Math.round(11 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = 'rgba(255, 255, 255, 0.4)';
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.fillText(`GALLOWS STRIKES (${this.strikes} / ${this.maxStrikes})`, gx, pipsY - 6 * s);

        for (let i = 0; i < this.maxStrikes; i++) {
            const px = pipStartX + (i * 32 + 16) * s;
            const isStruck = i < this.strikes;

            if (isStruck) {
                // Red skull / strike pip
                g.fillStyle = '#ef4444';
                g.strokeStyle = '#b91c1c';
                g.lineWidth = 1.5 * s;
                T.circle(g, px, pipsY + 10 * s, 10 * s);
                g.fill();
                g.stroke();

                g.font = `800 ${Math.round(11 * s)}px "Space Grotesk", sans-serif`;
                g.fillStyle = '#ffffff';
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.fillText('✕', px, pipsY + 10 * s);
            } else {
                // Empty slot
                g.fillStyle = 'rgba(255, 255, 255, 0.06)';
                g.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                g.lineWidth = 1.5 * s;
                T.circle(g, px, pipsY + 10 * s, 10 * s);
                g.fill();
                g.stroke();
            }
        }
    }

    drawWordBoard(g, view) {
        const s = view.scale;
        const th = T.theme();
        const startX = view.w * 0.44;
        const boardW = view.w * 0.52;
        const topY = 90 * s;

        // 1. Category & Difficulty Bar
        g.fillStyle = th.panel || 'rgba(255, 255, 255, 0.08)';
        g.strokeStyle = th.boardBorder || 'rgba(255, 255, 255, 0.18)';
        g.lineWidth = 1.5 * s;
        const barH = 36 * s;
        T.roundRect(g, startX, topY, boardW, barH, 8 * s);
        g.fill();
        g.stroke();

        g.font = `700 ${Math.round(12 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = th.accent || '#38bdf8';
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(`📂 CATEGORY: ${this.category.toUpperCase()}`, startX + 16 * s, topY + barH / 2);

        g.font = `700 ${Math.round(11 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = this.difficulty === 'hard' ? '#f43f5e' : (this.difficulty === 'medium' ? '#f59e0b' : '#10b981');
        g.textAlign = 'right';
        g.fillText(`⚡ ${this.difficulty.toUpperCase()}`, startX + boardW - 16 * s, topY + barH / 2);

        // 2. The Word Tiles Area
        if (this.phase === 'picking') {
            this.drawPickingSuspense(g, view, startX, topY + 54 * s, boardW);
        } else {
            this.drawWordTiles(g, view, startX, topY + 54 * s, boardW);
            this.drawGraveyard(g, view, startX, topY + 290 * s, boardW);
            this.drawTurnActionBanner(g, view, startX, topY + 390 * s, boardW);
        }
    }

    drawPickingSuspense(g, view, bx, by, bw) {
        const s = view.scale;
        const th = T.theme();
        const master = this.getPlayer(this.masterId);
        const masterName = master ? master.name : 'The Executioner';

        const cardH = 280 * s;
        g.fillStyle = th.panel || 'rgba(255, 255, 255, 0.04)';
        g.strokeStyle = th.boardBorder || 'rgba(255, 255, 255, 0.12)';
        g.lineWidth = 1.5 * s;
        T.roundRect(g, bx, by, bw, cardH, 14 * s);
        g.fill();
        g.stroke();

        const pulseScale = 1 + Math.sin(this.animTime * 3) * 0.05;
        g.save();
        g.translate(bx + bw / 2, by + 70 * s);
        g.scale(pulseScale, pulseScale);
        g.font = `${Math.round(44 * s)}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('🪓', 0, 0);
        g.restore();

        g.font = `800 ${Math.round(22 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(`${masterName} is Choosing a Secret Word!`, bx + bw / 2, by + 130 * s);

        g.font = `500 ${Math.round(13 * s)}px "Inter", sans-serif`;
        g.fillStyle = 'rgba(255, 255, 255, 0.55)';
        g.fillText('Picking from the vault or crafting a custom phrase on their phone...', bx + bw / 2, by + 160 * s);

        // Tabular Countdown Clock
        const clockStr = `${this.clockRemaining}s`;
        g.font = `800 ${Math.round(32 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = '#f59e0b';
        g.fillText(clockStr, bx + bw / 2, by + 215 * s);
    }

    drawWordTiles(g, view, bx, by, bw) {
        const s = view.scale;
        const th = T.theme();
        const words = this.word.split(' ');

        // Compute layout grid for words & letters
        const cardH = 200 * s;
        const cardY = by;

        g.fillStyle = th.panel || 'rgba(255, 255, 255, 0.03)';
        g.strokeStyle = th.boardBorder || 'rgba(255, 255, 255, 0.08)';
        g.lineWidth = 1.5 * s;
        T.roundRect(g, bx, cardY, bw, cardH, 14 * s);
        g.fill();
        g.stroke();

        // Calculate tile sizes dynamically based on longest word and total length
        const maxLettersInWord = Math.max(...words.map(w => w.length), 6);
        const tileW = Math.max(26 * s, Math.min(54 * s, (bw - 40 * s) / maxLettersInWord - 8 * s));
        const tileH = tileW * 1.35;
        const tileGap = 8 * s;
        const wordGap = tileW * 0.8;

        // Render words centered
        const lineH = tileH + 16 * s;
        const startY = cardY + (cardH - (words.length > 2 ? 2 * lineH : lineH)) / 2;

        let curY = startY;
        let lineWords = [[]];
        let curLineWidth = 0;

        // Simple line wrapping
        words.forEach(w => {
            const wLen = w.length * (tileW + tileGap) - tileGap;
            if (curLineWidth + wLen + wordGap > bw - 40 * s && curLineWidth > 0) {
                lineWords.push([w]);
                curLineWidth = wLen;
            } else {
                lineWords[lineWords.length - 1].push(w);
                curLineWidth += wLen + wordGap;
            }
        });

        lineWords.forEach((lWords, lineIdx) => {
            // Measure total width of line
            let totalW = 0;
            lWords.forEach((w, wi) => {
                totalW += w.length * (tileW + tileGap) - tileGap;
                if (wi < lWords.length - 1) totalW += wordGap;
            });

            let tx = bx + (bw - totalW) / 2;
            const ty = startY + lineIdx * lineH;

            lWords.forEach(wordStr => {
                for (let i = 0; i < wordStr.length; i++) {
                    const ch = wordStr[i];
                    const isLetter = (ch >= 'A' && ch <= 'Z');
                    const isRevealed = !isLetter || this.correctLetters.has(ch) || this.phase === 'round_over';

                    if (isLetter) {
                        if (isRevealed) {
                            // Revealed Letter Tile
                            g.fillStyle = '#ffffff';
                            g.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                            g.lineWidth = 2 * s;
                            T.roundRect(g, tx, ty, tileW, tileH, 8 * s);
                            g.fill();
                            g.stroke();

                            g.font = `800 ${Math.round(tileH * 0.58)}px "Space Grotesk", sans-serif`;
                            g.fillStyle = '#0f172a';
                            g.textAlign = 'center';
                            g.textBaseline = 'middle';
                            g.fillText(ch, tx + tileW / 2, ty + tileH / 2);
                        } else {
                            // Hidden Blank Tile
                            g.fillStyle = 'rgba(255, 255, 255, 0.08)';
                            g.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                            g.lineWidth = 1.8 * s;
                            T.roundRect(g, tx, ty, tileW, tileH, 8 * s);
                            g.fill();
                            g.stroke();

                            // Bottom underline glow
                            g.fillStyle = th.accent || '#38bdf8';
                            T.roundRect(g, tx + 6 * s, ty + tileH - 6 * s, tileW - 12 * s, 3 * s, 1.5 * s);
                            g.fill();
                        }
                    } else {
                        // Punctuation (hyphen, apostrophe)
                        g.font = `800 ${Math.round(tileH * 0.55)}px "Space Grotesk", sans-serif`;
                        g.fillStyle = '#ffffff';
                        g.textAlign = 'center';
                        g.textBaseline = 'middle';
                        g.fillText(ch, tx + tileW / 2, ty + tileH / 2);
                    }

                    tx += tileW + tileGap;
                }
                tx += wordGap - tileGap;
            });
        });
    }

    drawGraveyard(g, view, bx, by, bw) {
        const s = view.scale;
        const boxH = 75 * s;

        g.fillStyle = 'rgba(0, 0, 0, 0.25)';
        g.strokeStyle = 'rgba(239, 68, 68, 0.25)';
        g.lineWidth = 1.5 * s;
        T.roundRect(g, bx, by, bw, boxH, 10 * s);
        g.fill();
        g.stroke();

        g.font = `700 ${Math.round(11 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = 'rgba(239, 68, 68, 0.7)';
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillText('MISSED LETTERS GRAVEYARD:', bx + 16 * s, by + 12 * s);

        if (!this.wrongLetters.length) {
            g.font = `500 ${Math.round(13 * s)}px "Inter", sans-serif`;
            g.fillStyle = 'rgba(255, 255, 255, 0.3)';
            g.fillText('No misses yet — clean sheet!', bx + 16 * s, by + 36 * s);
        } else {
            let cx = bx + 16 * s;
            const cy = by + 32 * s;
            const chipSize = 30 * s;

            this.wrongLetters.forEach(ch => {
                g.fillStyle = 'rgba(239, 68, 68, 0.18)';
                g.strokeStyle = 'rgba(239, 68, 68, 0.6)';
                g.lineWidth = 1.5 * s;
                T.roundRect(g, cx, cy, chipSize, chipSize, 6 * s);
                g.fill();
                g.stroke();

                g.font = `800 ${Math.round(15 * s)}px "Space Grotesk", sans-serif`;
                g.fillStyle = '#ef4444';
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.fillText(ch, cx + chipSize / 2, cy + chipSize / 2);

                // Strike-through line
                g.strokeStyle = '#ef4444';
                g.lineWidth = 2 * s;
                g.beginPath();
                g.moveTo(cx + 4 * s, cy + 4 * s);
                g.lineTo(cx + chipSize - 4 * s, cy + chipSize - 4 * s);
                g.stroke();

                cx += chipSize + 8 * s;
            });
        }
    }

    drawTurnActionBanner(g, view, bx, by, bw) {
        const s = view.scale;
        const th = T.theme();
        const bannerH = 70 * s;
        const activeGuesser = this.getPlayer(this.activeGuesserId);
        const guesserName = activeGuesser ? activeGuesser.name : 'Someone';

        g.fillStyle = th.panel || 'rgba(15, 23, 42, 0.78)';
        g.strokeStyle = th.boardBorder || 'rgba(56, 189, 248, 0.45)';
        g.lineWidth = 2 * s;
        T.roundRect(g, bx, by, bw, bannerH, 12 * s);
        g.fill();
        g.stroke();

        // Pulsing indicator dot
        const dotX = bx + 32 * s;
        const dotY = by + bannerH / 2;
        const dotPulse = 8 * s + Math.sin(this.animTime * 4) * 2 * s;
        g.fillStyle = activeGuesser ? (activeGuesser.color || '#38bdf8') : '#38bdf8';
        T.circle(g, dotX, dotY, dotPulse);
        g.fill();

        // Label
        g.font = `800 ${Math.round(18 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = '#ffffff';
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(`${guesserName.toUpperCase()}'S TURN TO GUESS`, bx + 52 * s, by + bannerH / 2 - 8 * s);

        g.font = `500 ${Math.round(12 * s)}px "Inter", sans-serif`;
        g.fillStyle = 'rgba(255, 255, 255, 0.65)';
        g.fillText('Pick a letter on your phone keypad, or tap Solve Full Word!', bx + 52 * s, by + bannerH / 2 + 12 * s);

        // Turn Countdown Clock
        const clockX = bx + bw - 45 * s;
        const clockY = by + bannerH / 2;
        const isHot = this.clockRemaining <= 5;

        g.font = `800 ${Math.round(24 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = isHot ? '#ef4444' : '#ffffff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(`${this.clockRemaining}s`, clockX, clockY);
    }

    drawRoundOverBanner(g, view) {
        const s = view.scale;
        const bw = 640 * s;
        const bh = 220 * s;
        const bx = (view.w - bw) / 2;
        const by = (view.h - bh) / 2 + 20 * s;

        // Shadow backdrop
        const th = T.theme();
        g.fillStyle = th.panelSolid || 'rgba(10, 15, 30, 0.92)';
        g.strokeStyle = this.roundWinner === 'master' ? '#ef4444' : '#10b981';
        g.lineWidth = 3 * s;
        T.roundRect(g, bx, by, bw, bh, 18 * s);
        g.fill();
        g.stroke();

        const iconStr = this.roundWinner === 'master' ? '💀' : '🎉';
        const titleStr = this.roundWinner === 'master' ? 'THE EXECUTIONER TRIUMPHS!' : 'THE SURVIVORS DEFEATED THE GALLOWS!';
        const master = this.getPlayer(this.masterId);

        g.font = `${Math.round(38 * s)}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(iconStr, view.w / 2, by + 46 * s);

        g.font = `800 ${Math.round(22 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = this.roundWinner === 'master' ? '#fda4af' : '#6ee7b7';
        g.fillText(titleStr, view.w / 2, by + 95 * s);

        g.font = `700 ${Math.round(15 * s)}px "Space Grotesk", sans-serif`;
        g.fillStyle = '#ffffff';
        if (this.roundWinner === 'master') {
            g.fillText(`${master ? master.name : 'The Executioner'} completed the gallows (+500 pts clean sweep)!`, view.w / 2, by + 130 * s);
        } else {
            const solverName = this.roundSolver ? this.roundSolver.name : 'The Mob';
            g.fillText(`${solverName} cracked the secret word!`, view.w / 2, by + 130 * s);
        }

        g.font = `500 ${Math.round(13 * s)}px "Inter", sans-serif`;
        g.fillStyle = 'rgba(255, 255, 255, 0.6)';
        g.fillText(`The word was: ${this.word}`, view.w / 2, by + 165 * s);
    }

    destroy() {
        this.running = false;
        this.clearTimers();
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
}

CastOn.registerGame({
    id: 'hangman',
    title: 'Hangman: Word Duel',
    tagline: 'Asymmetric · 1 vs The Room',
    players: '1–8 players',
    control: 'Keypad + Solve',
    description: 'One player becomes the ruthless Executioner, challenging the room with a deadly word. Guess letters or crack the puzzle before the gallows claims its victim!',
    accent: '#f43f5e',
    icon: 'skull',
    create: (ctx) => new HangmanGame(ctx)
});

})(window);

