/* ==========================================================================
   CastOn — mobile controller client
   One websocket, four switchable layouts, and reliable multi-touch arcs.
   ========================================================================== */
(function (w) {
'use strict';

const doc = document;

/* ---------- element handles ---------------------------------------------- */

const el = {
    joinScreen: doc.getElementById('join-screen'),
    shell: doc.getElementById('controller-shell'),
    code: doc.getElementById('room-code'),
    name: doc.getElementById('player-name'),
    joinBtn: doc.getElementById('join-btn'),
    error: doc.getElementById('join-error'),

    joinAvatarPreview: doc.getElementById('join-avatar-preview'),
    joinAvatarCamera: doc.getElementById('join-avatar-camera'),
    joinAvatarFile: doc.getElementById('join-avatar-file'),
    joinAvatarPresets: doc.getElementById('join-avatar-presets'),

    avatar: doc.getElementById('player-avatar-box'),
    avatarFace: doc.getElementById('player-avatar-box'),
    label: doc.getElementById('player-label'),
    vipBadge: doc.getElementById('vip-badge'),
    homeBtn: doc.getElementById('home-btn'),
    status: doc.getElementById('game-status-label'),

    profileTriggerBtn: doc.getElementById('player-profile-btn'),
    profileModal: doc.getElementById('profile-modal'),
    profileModalClose: doc.getElementById('profile-modal-close'),
    editAvatarPreview: doc.getElementById('edit-avatar-preview'),
    editAvatarCamera: doc.getElementById('edit-avatar-camera'),
    editAvatarFile: doc.getElementById('edit-avatar-file'),
    editAvatarPresets: doc.getElementById('edit-avatar-presets'),
    editPlayerName: doc.getElementById('edit-player-name'),
    cancelProfileBtn: doc.getElementById('cancel-profile-btn'),
    saveProfileBtn: doc.getElementById('save-profile-btn'),

    statRoom: doc.getElementById('stat-room-code'),
    statRole: doc.getElementById('stat-role'),
    statScore: doc.getElementById('stat-score'),

    hint: doc.getElementById('dpad-hint-text'),
    extras: doc.getElementById('dpad-extras'),
    secretWord: doc.getElementById('secret-word-label'),
    clearPad: doc.getElementById('clear-pad'),
    guessInput: doc.getElementById('guess-input'),
    guessSubmit: doc.getElementById('guess-submit'),

    drawAcceptBtn: doc.getElementById('draw-accept-btn'),
    verbalModal: doc.getElementById('verbal-modal'),
    verbalModalClose: doc.getElementById('verbal-modal-close'),
    cancelVerbalBtn: doc.getElementById('cancel-verbal-btn'),
    verbalPlayersList: doc.getElementById('verbal-players-list')
};

let currentGuessers = [];

const PRESET_AVATARS = [
    '🦊', '🐼', '🦁', '🐸', '🐙', '🦄', '🦖', '🤖',
    '🐯', '🐨', '🐱', '🐶', '🐺', '🐵', '🚀', '⚡',
    '👑', '👾', '👻', '🍕', '🔥', '🎮', '💎', '⭐'
];

let selectedAvatar = localStorage.getItem('caston_avatar') || PRESET_AVATARS[0];
let modalAvatar = selectedAvatar;
let playerColor = '#2563EB';

function renderAvatarToElement(target, face) {
    if (!target) return;
    target.innerHTML = '';
    const val = face || '🎮';
    if (typeof val === 'string' && (val.startsWith('data:image/') || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/'))) {
        const img = doc.createElement('img');
        img.src = val;
        img.alt = 'Avatar';
        img.className = 'avatar__img';
        target.appendChild(img);
    } else {
        target.textContent = val;
    }
}

function setAvatar(face) {
    renderAvatarToElement(el.avatar, face);
}

function processImageFile(file, cb) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            try {
                const size = 128;
                const canvas = doc.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                const minDim = Math.min(img.naturalWidth, img.naturalHeight);
                const sx = (img.naturalWidth - minDim) / 2;
                const sy = (img.naturalHeight - minDim) / 2;
                ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
                cb(dataUrl);
            } catch (err) {
                console.error('Error processing image avatar:', err);
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function renderPresetAvatars(container, currentAvatar, onSelect) {
    if (!container) return;
    container.innerHTML = '';
    PRESET_AVATARS.forEach((face) => {
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'avatar-preset-btn' + (face === currentAvatar ? ' is-selected' : '');
        btn.textContent = face;
        btn.setAttribute('aria-label', 'Select avatar ' + face);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            buzz(16);
            container.querySelectorAll('.avatar-preset-btn').forEach(b => b.classList.remove('is-selected'));
            btn.classList.add('is-selected');
            onSelect(face);
        });
        container.appendChild(btn);
    });
}

/* ---------- connection state --------------------------------------------- */

let ws = null;
let roomCode = '';
let storedPid = localStorage.getItem('caston_pid') || '';
let isDeliberatelyClosed = false;
let isReconnecting = false;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 45;

/* ---------- wake lock (prevent phone screen sleep) ----------------------- */

let wakeLockSentinel = null;

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (doc.visibilityState !== 'visible') return;
    if (wakeLockSentinel !== null && !wakeLockSentinel.released) return;

    try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
            wakeLockSentinel = null;
        });
    } catch (err) {
        wakeLockSentinel = null;
    }
}

/* ---------- heartbeat ping ----------------------------------------------- */

let pingTimer = null;

function startHeartbeat() {
    stopHeartbeat();
    pingTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            send({ action: 'ping' });
        }
    }, 15000);
}

function stopHeartbeat() {
    if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
    }
}

/* ---------- haptics ------------------------------------------------------- */

function buzz(ms) {
    if (navigator.vibrate) {
        try { navigator.vibrate(ms || 22); } catch (e) { /* unsupported */ }
    }
}

/* ---------- outbound ------------------------------------------------------ */

function send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

/* ==========================================================================
   Join
   ========================================================================== */

const params = new URLSearchParams(location.search);
if (params.get('code')) {
    roomCode = params.get('code').toUpperCase().slice(0, 4);
    if (el.code) el.code.value = roomCode;
}
if (localStorage.getItem('caston_name') && el.name) {
    el.name.value = localStorage.getItem('caston_name');
}

function showError(message) {
    if (!el.error) return;
    el.error.textContent = message;
    el.error.classList.remove('hidden');
}

function hideError() {
    if (el.error) el.error.classList.add('hidden');
}

function showReconnectingBanner() {
    if (el.status) {
        if (!el.status.dataset.origText) {
            el.status.dataset.origText = el.status.textContent;
        }
        el.status.textContent = '⚡ Reconnecting to console...';
        el.status.style.color = '#f59e0b';
        el.status.style.fontWeight = '600';
    }
}

function hideReconnectingBanner() {
    if (el.status) {
        el.status.style.color = '';
        el.status.style.fontWeight = '';
        if (el.status.dataset.origText) {
            el.status.textContent = el.status.dataset.origText;
            delete el.status.dataset.origText;
        }
    }
}

function scheduleReconnect() {
    if (isDeliberatelyClosed) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);

    reconnectAttempts++;
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        hideReconnectingBanner();
        if (el.shell) el.shell.classList.add('hidden');
        if (el.joinScreen) el.joinScreen.classList.remove('hidden');
        showError('Connection lost. Please rejoin the room.');
        return;
    }

    const delay = reconnectAttempts <= 2 ? 350 : (reconnectAttempts <= 5 ? 1000 : 2000);
    reconnectTimer = setTimeout(() => {
        attemptReconnect();
    }, delay);
}

function attemptReconnect() {
    if (isDeliberatelyClosed || !roomCode) return;
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

    isReconnecting = true;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const currentName = (el.name ? el.name.value : '').trim() || localStorage.getItem('caston_name') || 'Player';
    const currentPid = storedPid || localStorage.getItem('caston_pid') || '';
    const currentAvatar = selectedAvatar || localStorage.getItem('caston_avatar') || '';
    const avatarParam = (currentAvatar && currentAvatar.length <= 16) ? ('&avatar=' + encodeURIComponent(currentAvatar)) : '';
    const url = proto + '//' + location.host + '/ws/controller/' + encodeURIComponent(roomCode) +
        '?name=' + encodeURIComponent(currentName) + '&pid=' + encodeURIComponent(currentPid) + avatarParam;

    try {
        ws = new WebSocket(url);
        attachWebSocketHandlers();
    } catch (e) {
        isReconnecting = false;
        scheduleReconnect();
    }
}

function attachWebSocketHandlers() {
    if (!ws) return;

    ws.onopen = () => {
        isReconnecting = false;
        reconnectAttempts = 0;
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (el.joinBtn) el.joinBtn.disabled = false;
        startHeartbeat();
        requestWakeLock();
        hideReconnectingBanner();
    };

    ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }
        handleMessage(msg);
    };

    ws.onerror = () => {
        if (el.joinBtn) el.joinBtn.disabled = false;
        if (el.shell && el.shell.classList.contains('hidden')) {
            showError('Connection problem — is the console still running?');
        }
    };

    ws.onclose = () => {
        stopHeartbeat();
        if (el.joinBtn) el.joinBtn.disabled = false;

        if (isDeliberatelyClosed) {
            return;
        }

        // If we were already playing, keep the shell visible and auto-reconnect
        if (el.shell && !el.shell.classList.contains('hidden') && roomCode) {
            showReconnectingBanner();
            scheduleReconnect();
        } else {
            if (el.shell) el.shell.classList.add('hidden');
            if (el.joinScreen) el.joinScreen.classList.remove('hidden');
            showError('Lost the connection to the console.');
        }
    };
}

function joinRoom() {
    const code = (el.code ? el.code.value : '').trim().toUpperCase();
    const name = (el.name ? el.name.value : '').trim() || 'Player';

    if (code.length !== 4) {
        showError('Enter the 4-letter code shown on the TV.');
        if (el.code) el.code.focus();
        return;
    }

    hideError();
    roomCode = code;
    isDeliberatelyClosed = false;
    reconnectAttempts = 0;
    localStorage.setItem('caston_name', name);
    if (selectedAvatar) localStorage.setItem('caston_avatar', selectedAvatar);

    if (el.joinBtn) el.joinBtn.disabled = true;

    attemptReconnect();
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'pong':
            // Heartbeat response
            break;

        case 'reload':
            location.reload();
            break;

        case 'error':
            if (el.joinBtn) el.joinBtn.disabled = false;
            showError(msg.message || 'Could not join that room.');
            break;

        case 'joined':
            onJoined(msg);
            break;

        case 'vip_update':
            setVip(!!msg.is_vip);
            break;

        case 'profile_sync':
            if (msg.player) {
                if (msg.player.name) {
                    localStorage.setItem('caston_name', msg.player.name);
                    if (el.label) el.label.textContent = msg.player.name;
                    if (el.name) el.name.value = msg.player.name;
                }
                if (msg.player.avatar) {
                    selectedAvatar = msg.player.avatar;
                    localStorage.setItem('caston_avatar', msg.player.avatar);
                    renderAvatarToElement(el.avatar, msg.player.avatar);
                    renderAvatarToElement(el.joinAvatarPreview, msg.player.avatar);
                }
                if (msg.player.color) {
                    playerColor = msg.player.color;
                    if (el.avatar) el.avatar.style.setProperty('--ring-color', playerColor);
                }
            }
            break;

        case 'layout_update':
            switchLayout(msg.layout, msg.state || {});
            buzz(30);
            break;

        case 'vibrate':
            buzz(msg.ms || 45);
            break;

        case 'reset_input':
            resetControls();
            break;

        case 'score_update':
            if (el.statScore) el.statScore.textContent = (msg.score || 0).toLocaleString();
            break;

        case 'update_guessers':
            currentGuessers = msg.guessers || [];
            if (el.verbalModal && !el.verbalModal.classList.contains('hidden')) {
                renderVerbalPlayers();
            }
            break;

        case 'trivia_locked':
            if (el.status && msg.elapsedSec) {
                el.status.textContent = '✓ Guess locked in (' + msg.elapsedSec + 's)';
            }
            break;

        case 'trivia_result':
            if (msg.correct) {
                buzz(90);
                if (el.status) {
                    el.status.textContent = '🎉 Correct! +' + (msg.points || 0).toLocaleString() + ' pts (⚡ ' + (msg.elapsedSec || '?') + 's' + (msg.fastest ? ' · Fastest!' : '') + ')';
                }
            } else if (msg.timedOut) {
                buzz(40);
                if (el.status) el.status.textContent = '⏰ Time is up (+0 pts)';
            } else {
                buzz(50);
                if (el.status) el.status.textContent = '❌ Incorrect (+0 pts)';
            }
            if (el.statScore && typeof msg.totalScore === 'number') {
                el.statScore.textContent = msg.totalScore.toLocaleString();
            }
            break;

        case 'room_closed':
            // Do not use a blocking alert(): it freezes the page and the user
            // cannot dismiss it without losing the tab. Show an inline notice
            // and drop the player back onto the join screen instead.
            onRoomClosed();
            break;
    }
}

function onRoomClosed() {
    isDeliberatelyClosed = true;
    stopHeartbeat();
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (ws) {
        try { ws.close(); } catch (e) { /* already closing */ }
        ws = null;
    }
    closeVerbalModal();
    if (el.shell) el.shell.classList.add('hidden');
    if (el.joinScreen) el.joinScreen.classList.remove('hidden');
    showError('The console closed this room. Ask for a new code, or reload the TV.');
    buzz(120);
}

function onJoined(msg) {
    const player = msg.player || {};
    storedPid = player.id || '';
    localStorage.setItem('caston_pid', storedPid);
    localStorage.setItem('caston_name', player.name || '');

    isDeliberatelyClosed = false;
    hideReconnectingBanner();
    requestWakeLock();

    if (el.joinScreen) el.joinScreen.classList.add('hidden');
    if (el.shell) el.shell.classList.remove('hidden');

    playerColor = player.color || '#2563EB';

    const savedAvatar = localStorage.getItem('caston_avatar');
    if (savedAvatar) {
        selectedAvatar = savedAvatar;
        if (savedAvatar !== player.avatar) {
            send({
                action: 'update_profile',
                name: player.name || localStorage.getItem('caston_name') || 'Player',
                avatar: savedAvatar
            });
        }
    } else if (player.avatar) {
        selectedAvatar = player.avatar;
        localStorage.setItem('caston_avatar', player.avatar);
    }

    renderAvatarToElement(el.avatar, selectedAvatar);
    if (el.avatar) el.avatar.style.setProperty('--ring-color', playerColor);
    if (el.label) el.label.textContent = player.name || 'Player';
    if (el.statRoom) el.statRoom.textContent = msg.room_code || roomCode;
    if (el.statScore) el.statScore.textContent = (player.score || 0).toLocaleString();

    setVip(!!player.is_vip);
    switchLayout(msg.layout || 'dpad', msg.state || {});
    buzz(45);
}

/* ==========================================================================
   Layout switching
   ========================================================================== */

const LAYOUT_IDS = ['dpad', 'joystick', 'trivia', 'draw', 'guess', 'dice', 'hangman'];
let currentActiveLayout = null;

function switchLayout(layout, state) {
    if (LAYOUT_IDS.indexOf(layout) === -1) layout = 'dpad';

    if (currentActiveLayout && currentActiveLayout !== layout) {
        resetControls();
    }
    currentActiveLayout = layout;

    LAYOUT_IDS.forEach(id => {
        const node = doc.getElementById('layout-' + id);
        if (node) node.classList.toggle('hidden', id !== layout);
    });

    if (state.title && el.status) el.status.textContent = state.title;

    // Secondary gamepad buttons are declared by the TV in `state.extras`, so a
    // game can add or drop its own without a client change.
    renderExtras((layout === 'dpad' || layout === 'joystick') ? state.extras : null);

    const actionText = state.actionLabel || state.action || 'Action';
    const hintDpad = doc.getElementById('dpad-hint-text');
    const hintJoy = doc.getElementById('joystick-hint-text');
    if (hintDpad) hintDpad.textContent = actionText;
    if (hintJoy) hintJoy.textContent = actionText;

    // Subtitle explains the current game; the footer is the only place with room
    // for a full sentence. The draw pad already shows the word in its own bar, so
    // echoing the subtitle there would just duplicate it.
    if (state.subtitle && layout !== 'draw') {
        const foot = doc.getElementById('pad-foot');
        if (foot) foot.textContent = state.subtitle;
    }

    if (layout === 'dice') {
        const isMyTurn = !state.waiting;
        const grid = doc.getElementById('dice-grid');
        const waitBox = doc.getElementById('dice-waiting-box');
        const eyebrow = doc.getElementById('dice-pad-eyebrow');
        const title = doc.getElementById('dice-pad-title');
        const subtitle = doc.getElementById('dice-pad-subtitle');
        if (eyebrow) eyebrow.textContent = isMyTurn ? 'YOUR TURN' : 'WAITING';
        if (title) title.textContent = state.title || (isMyTurn ? 'Pick a Mystery Die' : 'Wait for your turn');
        if (subtitle) subtitle.textContent = state.subtitle || (isMyTurn ? 'Choose 1 of the 6 hidden faces to reveal your roll!' : 'Watching the board...');

        if (grid) grid.classList.toggle('is-disabled', !isMyTurn);
        if (waitBox) {
            waitBox.classList.toggle('hidden', isMyTurn);
            const nameEl = doc.getElementById('dice-turn-name');
            const statusEl = doc.getElementById('dice-turn-status');
            const avatarEl = doc.getElementById('dice-turn-avatar');
            if (nameEl) nameEl.textContent = state.currentTurnName || "Player's Turn";
            if (statusEl) statusEl.textContent = state.currentTurnStatus || "Choosing a mystery die...";
            if (avatarEl && state.currentTurnAvatar) {
                renderAvatarToElement(avatarEl, state.currentTurnAvatar);
            }
        }
        doc.querySelectorAll('.dice-btn').forEach(btn => {
            btn.classList.remove('is-selected', 'is-dimmed');
            btn.disabled = !isMyTurn;
        });
    }

    if (layout === 'trivia') {
        triviaLocked = false;
        doc.querySelectorAll('.buzzer[data-choice]').forEach(b => {
            b.classList.remove('is-selected', 'is-dimmed', 'is-correct-reveal', 'is-wrong-reveal');
        });
        if (state.options) {
            state.options.forEach((opt, i) => {
                const node = doc.getElementById('trivia-opt-' + i);
                if (node) node.textContent = opt;
            });
        }
    }

    if (layout === 'draw') {
        padStrokes = [];
        currentGuessers = state.guessers || [];
        if (el.secretWord) el.secretWord.textContent = state.word || 'DRAW';
        const eyebrow = doc.querySelector('.draw-secret__eyebrow');
        if (eyebrow) {
            if (state.difficulty) {
                const diffLabel = state.difficulty.toUpperCase();
                const catLabel = state.category ? ` · ${state.category}` : '';
                eyebrow.textContent = `Draw this word (${diffLabel}${catLabel})`;
            } else {
                eyebrow.textContent = 'Draw this word';
            }
        }
        requestAnimationFrame(setupPad);
    } else {
        closeVerbalModal();
    }

    if (layout === 'guess' && el.guessInput) {
        // `prefill` is used at the end of a Sketch round, when the artist is the
        // only player who still needs to send anything.
        el.guessInput.value = state.prefill || '';
        setTimeout(() => {
            try {
                el.guessInput.focus();
                el.guessInput.select();
            } catch (e) { /* focus is best-effort */ }
        }, 120);
    }

    if (layout === 'hangman') {
        const role = state.role || 'guesser';
        const pickerBox = doc.getElementById('hm-picker');
        const masterBox = doc.getElementById('hm-master-view');
        const guesserBox = doc.getElementById('hm-guesser-view');

        if (pickerBox) pickerBox.classList.toggle('hidden', role !== 'master_pick');
        if (masterBox) masterBox.classList.toggle('hidden', role !== 'master_view');
        if (guesserBox) guesserBox.classList.toggle('hidden', role !== 'guesser');

        if (role === 'master_pick') {
            const choicesContainer = doc.getElementById('hm-word-choices');
            if (choicesContainer && state.wordChoices) {
                choicesContainer.innerHTML = state.wordChoices.map((c, i) => `
                    <button class="hm-choice-btn" data-choice-idx="${i}" type="button">
                        <div>
                            <div class="hm-choice-word">${c.word}</div>
                            <div class="hm-choice-meta">${c.category || 'General'}${c.hint ? ' · ' + c.hint : ''}</div>
                        </div>
                        <span class="hm-choice-diff">${c.difficulty || 'medium'}</span>
                    </button>
                `).join('');

                choicesContainer.querySelectorAll('.hm-choice-btn').forEach(btn => {
                    btn.onclick = () => {
                        const idx = Number(btn.getAttribute('data-choice-idx'));
                        const chosen = state.wordChoices[idx];
                        if (chosen) {
                            buzz(40);
                            send({ action: 'hm_pick_word', word: chosen.word, category: chosen.category, difficulty: chosen.difficulty, hint: chosen.hint });
                        }
                    };
                });
            }
        } else if (role === 'master_view') {
            const wordDisplay = doc.getElementById('hm-master-word-display');
            const catDisplay = doc.getElementById('hm-master-cat-display');
            const strikesLabel = doc.getElementById('hm-master-strikes-label');
            const graveContainer = doc.getElementById('hm-master-graveyard');

            if (wordDisplay) wordDisplay.textContent = state.word || '----';
            if (catDisplay) catDisplay.textContent = 'Category: ' + (state.category || 'General');
            if (strikesLabel) {
                const strikesNum = doc.getElementById('hm-master-strikes-num');
                if (strikesNum) {
                    strikesNum.textContent = `${state.strikes || 0} / ${state.maxStrikes || 6}`;
                } else {
                    strikesLabel.textContent = `${state.strikes || 0} / ${state.maxStrikes || 6}`;
                }
            }

            if (graveContainer) {
                const wrong = state.wrongLetters || [];
                if (!wrong.length) {
                    graveContainer.innerHTML = '<span class="dim t-xs">None yet</span>';
                } else {
                    graveContainer.innerHTML = wrong.map(ch => `<span class="hm-grave-chip">${ch}</span>`).join('');
                }
            }
        } else if (role === 'guesser') {
            const isMyTurn = !!state.isMyTurn;
            const turnName = doc.getElementById('hm-turn-name');
            const turnAvatar = doc.getElementById('hm-turn-avatar');
            const turnBadge = doc.getElementById('hm-turn-badge');
            const titleEl = doc.getElementById('hm-guesser-title');
            const catEl = doc.getElementById('hm-guesser-cat');
            const keyboard = doc.getElementById('hm-keyboard');

            if (turnName) turnName.textContent = isMyTurn ? 'Your Turn to Guess!' : ((state.turnPlayer && state.turnPlayer.name) ? `${state.turnPlayer.name}'s Turn` : 'Waiting...');
            if (turnAvatar && state.turnPlayer && state.turnPlayer.avatar) {
                renderAvatarToElement(turnAvatar, state.turnPlayer.avatar);
            }
            if (turnBadge) {
                turnBadge.style.borderColor = isMyTurn ? 'var(--accent)' : 'transparent';
                turnBadge.style.background = isMyTurn ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'color-mix(in srgb, var(--card-ink) 6%, transparent)';
            }
            if (titleEl) titleEl.textContent = isMyTurn ? 'Tap a Letter or Solve' : 'Watching the board...';
            if (catEl) catEl.textContent = 'Category: ' + (state.category || 'General');

            if (keyboard) {
                keyboard.classList.toggle('is-disabled', !isMyTurn);
            }

            const pickedMap = state.pickedLetters || {};
            doc.querySelectorAll('.hm-key[data-letter]').forEach(btn => {
                const ch = btn.getAttribute('data-letter');
                const status = pickedMap[ch];
                btn.classList.remove('is-picked', 'is-correct', 'is-wrong');
                if (status === 'correct') {
                    btn.classList.add('is-picked', 'is-correct');
                } else if (status === 'wrong') {
                    btn.classList.add('is-picked', 'is-wrong');
                }
                btn.disabled = !isMyTurn || !!status;
            });

            const solveForm = doc.getElementById('hm-solve-form');
            if (solveForm) solveForm.classList.add('hidden');
        }
    }
}

function setVip(isVip) {
    isLeader = !!isVip;
    if (el.vipBadge) el.vipBadge.classList.toggle('hidden', !isVip);
    if (el.homeBtn) el.homeBtn.classList.toggle('hidden', !isVip);
    if (el.statRole) {
        el.statRole.textContent = isVip ? 'Leader' : 'Player';
        el.statRole.style.color = isVip ? 'var(--accent)' : '';
    }
    // Only the leader's buttons reach the TV, so non-leaders must not be
    // shown controls that would silently do nothing.
    renderExtras(lastExtras);
}

let isLeader = false;
let lastExtras = null;

/* Secondary buttons the TV asks for at runtime (the lobby's theme cycle). */
function renderExtras(extras) {
    const containers = doc.querySelectorAll('.arcade__shoulders');
    if (!containers.length) return;
    lastExtras = extras || null;
    const list = isLeader ? (extras || []) : [];
    const signature = list.map(e => e.button + ':' + (e.label || '')).join('|');

    containers.forEach(container => {
        if (container.dataset.signature === signature) return;
        container.dataset.signature = signature;
        container.innerHTML = '';

        if (!list.length) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');

        list.forEach((e, i) => {
            const btn = doc.createElement('button');
            btn.type = 'button';
            btn.className = 'arcade__btn arcade__btn--aux';
            btn.setAttribute('data-btn', e.button);
            btn.style.animationDelay = (i * 45) + 'ms';
            btn.innerHTML = '<span>' + e.button + '</span><span class="arcade__aux-cap">' +
                (e.label || '') + '</span>';
            container.appendChild(btn);
            bindHoldButton(btn, e.button);
        });
    });
}

/* ==========================================================================
   Tactile Cross D-Pad & arcade buttons
   Multi-touch support with pointer capture: slide thumb across directions or
   tap individual wings with fluid 90-degree quadrant tracking and hysteresis.
   ========================================================================== */

let resetDpad = null;

function setupDpad() {
    const zone = doc.getElementById('dpad-zone');
    const base = doc.getElementById('dpad-base');
    const cross = doc.getElementById('dpad-cross');
    if (!zone || !base || !cross) return;

    const notchUp = zone.querySelector('.dpad-notch--up');
    const notchDown = zone.querySelector('.dpad-notch--down');
    const notchLeft = zone.querySelector('.dpad-notch--left');
    const notchRight = zone.querySelector('.dpad-notch--right');

    const keyUp = cross.querySelector('.dpad__key--up');
    const keyDown = cross.querySelector('.dpad__key--down');
    const keyLeft = cross.querySelector('.dpad__key--left');
    const keyRight = cross.querySelector('.dpad__key--right');

    let activePointerId = null;
    let baseRect = null;
    let currentDir = null;

    function updateVisuals(dir) {
        if (notchUp) notchUp.classList.toggle('is-active', dir === 'UP');
        if (notchDown) notchDown.classList.toggle('is-active', dir === 'DOWN');
        if (notchLeft) notchLeft.classList.toggle('is-active', dir === 'LEFT');
        if (notchRight) notchRight.classList.toggle('is-active', dir === 'RIGHT');

        if (keyUp) keyUp.classList.toggle('is-pressed', dir === 'UP');
        if (keyDown) keyDown.classList.toggle('is-pressed', dir === 'DOWN');
        if (keyLeft) keyLeft.classList.toggle('is-pressed', dir === 'LEFT');
        if (keyRight) keyRight.classList.toggle('is-pressed', dir === 'RIGHT');

        base.classList.toggle('is-active', !!dir);
        cross.classList.toggle('is-active', !!dir);
    }

    function setDirection(newDir) {
        if (newDir === currentDir) return;

        if (currentDir) {
            send({ action: 'btn', button: currentDir, state: 'up' });
        }

        currentDir = newDir;

        if (currentDir) {
            buzz(14);
            send({ action: 'btn', button: currentDir, state: 'down' });
        }

        updateVisuals(currentDir);
    }

    function getDirectionFromVector(dx, dy, radius) {
        const mag = Math.hypot(dx, dy) / (radius || 1);
        if (mag < 0.16) {
            // In the center hub deadzone
            return null;
        }

        const angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180 to 180

        // 8 degree hysteresis to avoid jitter at boundary lines
        const H = currentDir ? 8 : 0;

        const upMin = -135 - (currentDir === 'UP' ? H : -H);
        const upMax = -45 + (currentDir === 'UP' ? H : -H);
        if (angle >= upMin && angle <= upMax) return 'UP';

        const rightMin = -45 - (currentDir === 'RIGHT' ? H : -H);
        const rightMax = 45 + (currentDir === 'RIGHT' ? H : -H);
        if (angle >= rightMin && angle <= rightMax) return 'RIGHT';

        const downMin = 45 - (currentDir === 'DOWN' ? H : -H);
        const downMax = 135 + (currentDir === 'DOWN' ? H : -H);
        if (angle >= downMin && angle <= downMax) return 'DOWN';

        return 'LEFT';
    }

    function processPointer(clientX, clientY) {
        if (!baseRect) baseRect = base.getBoundingClientRect();
        const centerX = baseRect.left + baseRect.width / 2;
        const centerY = baseRect.top + baseRect.height / 2;
        const radius = Math.max(10, baseRect.width / 2);

        const dx = clientX - centerX;
        const dy = clientY - centerY;

        const dir = getDirectionFromVector(dx, dy, radius);
        setDirection(dir);
    }

    function onPointerDown(e) {
        if (activePointerId !== null) return;
        e.preventDefault();

        activePointerId = e.pointerId;
        try { base.setPointerCapture(e.pointerId); } catch (err) {}

        baseRect = base.getBoundingClientRect();
        processPointer(e.clientX, e.clientY);
    }

    function onPointerMove(e) {
        if (e.pointerId !== activePointerId) return;
        e.preventDefault();
        processPointer(e.clientX, e.clientY);
    }

    function onPointerUp(e) {
        if (e && e.pointerId !== activePointerId) return;
        if (e) e.preventDefault();

        if (activePointerId !== null) {
            try { base.releasePointerCapture(activePointerId); } catch (err) {}
        }
        activePointerId = null;
        setDirection(null);
    }

    base.addEventListener('pointerdown', onPointerDown);
    base.addEventListener('pointermove', onPointerMove);
    base.addEventListener('pointerup', onPointerUp);
    base.addEventListener('pointercancel', onPointerUp);
    base.addEventListener('lostpointercapture', onPointerUp);

    zone.addEventListener('keydown', (e) => {
        let dir = null;
        if (e.key === 'ArrowUp') dir = 'UP';
        else if (e.key === 'ArrowDown') dir = 'DOWN';
        else if (e.key === 'ArrowLeft') dir = 'LEFT';
        else if (e.key === 'ArrowRight') dir = 'RIGHT';
        if (!dir) return;

        e.preventDefault();
        setDirection(dir);
    });

    zone.addEventListener('keyup', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            setDirection(null);
        }
    });

    w.addEventListener('resize', () => {
        baseRect = null;
    });

    resetDpad = () => {
        onPointerUp(null);
    };
}

/* ==========================================================================
   Virtual Joystick & arcade buttons
   Multi-touch support with pointer capture: hold or drag joystick with one
   thumb while tapping A/B arcade buttons with the other thumb.
   ========================================================================== */

let resetJoystick = null;

function setupJoystick() {
    const zone = doc.getElementById('joystick-zone');
    const base = doc.getElementById('joystick-base');
    const thumb = doc.getElementById('joystick-thumb');
    if (!zone || !base || !thumb) return;

    const notchUp = zone.querySelector('.joystick-notch--up');
    const notchDown = zone.querySelector('.joystick-notch--down');
    const notchLeft = zone.querySelector('.joystick-notch--left');
    const notchRight = zone.querySelector('.joystick-notch--right');

    let activePointerId = null;
    let baseRect = null;
    let maxDistance = 50;

    let joyX = 0; // -1.0 to 1.0
    let joyY = 0; // -1.0 to 1.0
    let isHeld = false;

    // Active directional states for synthesized button events
    const activeDirs = { UP: false, DOWN: false, LEFT: false, RIGHT: false };

    // Throttled network transmission
    let rafId = null;
    let lastSentX = 0;
    let lastSentY = 0;
    let lastSentTime = 0;

    const DIR_DOWN = 0.40;
    const DIR_UP = 0.18;

    function updateNotches() {
        if (notchUp) notchUp.classList.toggle('is-active', activeDirs.UP);
        if (notchDown) notchDown.classList.toggle('is-active', activeDirs.DOWN);
        if (notchLeft) notchLeft.classList.toggle('is-active', activeDirs.LEFT);
        if (notchRight) notchRight.classList.toggle('is-active', activeDirs.RIGHT);
    }

    function syncDirectionButtons(nx, ny) {
        // UP / DOWN
        if (ny < -DIR_DOWN && !activeDirs.UP) {
            activeDirs.UP = true;
            buzz(12);
            send({ action: 'btn', button: 'UP', state: 'down' });
        } else if (ny > -DIR_UP && activeDirs.UP) {
            activeDirs.UP = false;
            send({ action: 'btn', button: 'UP', state: 'up' });
        }

        if (ny > DIR_DOWN && !activeDirs.DOWN) {
            activeDirs.DOWN = true;
            buzz(12);
            send({ action: 'btn', button: 'DOWN', state: 'down' });
        } else if (ny < DIR_UP && activeDirs.DOWN) {
            activeDirs.DOWN = false;
            send({ action: 'btn', button: 'DOWN', state: 'up' });
        }

        // LEFT / RIGHT
        if (nx < -DIR_DOWN && !activeDirs.LEFT) {
            activeDirs.LEFT = true;
            buzz(12);
            send({ action: 'btn', button: 'LEFT', state: 'down' });
        } else if (nx > -DIR_UP && activeDirs.LEFT) {
            activeDirs.LEFT = false;
            send({ action: 'btn', button: 'LEFT', state: 'up' });
        }

        if (nx > DIR_DOWN && !activeDirs.RIGHT) {
            activeDirs.RIGHT = true;
            buzz(12);
            send({ action: 'btn', button: 'RIGHT', state: 'down' });
        } else if (nx < DIR_UP && activeDirs.RIGHT) {
            activeDirs.RIGHT = false;
            send({ action: 'btn', button: 'RIGHT', state: 'up' });
        }

        updateNotches();
    }

    function flushJoystick(force) {
        const now = performance.now();
        if (force || (now - lastSentTime >= 20 && (lastSentX !== joyX || lastSentY !== joyY))) {
            lastSentX = joyX;
            lastSentY = joyY;
            lastSentTime = now;
            send({
                action: 'joystick',
                x: joyX,
                y: joyY,
                active: isHeld
            });
        }
    }

    function processPointer(clientX, clientY) {
        if (!baseRect) baseRect = base.getBoundingClientRect();
        const centerX = baseRect.left + baseRect.width / 2;
        const centerY = baseRect.top + baseRect.height / 2;

        const dx = clientX - centerX;
        const dy = clientY - centerY;
        const dist = Math.hypot(dx, dy);

        let clampedX = dx;
        let clampedY = dy;
        if (dist > maxDistance && dist > 0) {
            clampedX = (dx / dist) * maxDistance;
            clampedY = (dy / dist) * maxDistance;
        }

        thumb.style.transform = 'translate3d(' + clampedX + 'px, ' + clampedY + 'px, 0)';

        let normX = maxDistance > 0 ? clampedX / maxDistance : 0;
        let normY = maxDistance > 0 ? clampedY / maxDistance : 0;
        const mag = Math.hypot(normX, normY);

        const DEADZONE = 0.08;
        if (mag < DEADZONE) {
            normX = 0;
            normY = 0;
        } else {
            const scaled = (mag - DEADZONE) / (1 - DEADZONE);
            normX = (normX / mag) * Math.min(1, scaled);
            normY = (normY / mag) * Math.min(1, scaled);
        }

        joyX = Math.round(normX * 1000) / 1000;
        joyY = Math.round(normY * 1000) / 1000;

        syncDirectionButtons(joyX, joyY);

        if (!rafId) {
            rafId = requestAnimationFrame(() => {
                rafId = null;
                flushJoystick(false);
            });
        }
    }

    function onPointerDown(e) {
        if (activePointerId !== null) return;
        e.preventDefault();

        activePointerId = e.pointerId;
        try { base.setPointerCapture(e.pointerId); } catch (err) {}

        baseRect = base.getBoundingClientRect();
        const thumbRect = thumb.getBoundingClientRect();
        maxDistance = Math.max(10, (baseRect.width - thumbRect.width) / 2);

        isHeld = true;
        base.classList.add('is-active');
        thumb.classList.add('is-active');
        thumb.style.transition = 'none';

        buzz(16);
        processPointer(e.clientX, e.clientY);
        flushJoystick(true);
    }

    function onPointerMove(e) {
        if (e.pointerId !== activePointerId) return;
        e.preventDefault();
        processPointer(e.clientX, e.clientY);
    }

    function onPointerUp(e) {
        if (e && e.pointerId !== activePointerId) return;
        if (e) e.preventDefault();

        if (activePointerId !== null) {
            try { base.releasePointerCapture(activePointerId); } catch (err) {}
        }
        activePointerId = null;
        isHeld = false;

        base.classList.remove('is-active');
        thumb.classList.remove('is-active');

        thumb.style.transition = 'transform 0.16s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
        thumb.style.transform = 'translate3d(0, 0, 0)';

        joyX = 0;
        joyY = 0;
        syncDirectionButtons(0, 0);

        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        flushJoystick(true);
    }

    base.addEventListener('pointerdown', onPointerDown);
    base.addEventListener('pointermove', onPointerMove);
    base.addEventListener('pointerup', onPointerUp);
    base.addEventListener('pointercancel', onPointerUp);
    base.addEventListener('lostpointercapture', onPointerUp);

    thumb.addEventListener('keydown', (e) => {
        let dx = 0, dy = 0;
        if (e.key === 'ArrowUp') dy = -1;
        else if (e.key === 'ArrowDown') dy = 1;
        else if (e.key === 'ArrowLeft') dx = -1;
        else if (e.key === 'ArrowRight') dx = 1;
        else return;

        e.preventDefault();
        baseRect = base.getBoundingClientRect();
        maxDistance = Math.max(10, (baseRect.width - thumb.getBoundingClientRect().width) / 2);
        joyX = dx;
        joyY = dy;
        isHeld = true;
        thumb.style.transition = 'none';
        thumb.style.transform = 'translate3d(' + (dx * maxDistance * 0.75) + 'px, ' + (dy * maxDistance * 0.75) + 'px, 0)';
        syncDirectionButtons(joyX, joyY);
        flushJoystick(true);
    });

    thumb.addEventListener('keyup', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            onPointerUp(null);
        }
    });

    w.addEventListener('resize', () => {
        baseRect = null;
        const drawLayout = doc.getElementById('layout-draw');
        if (drawLayout && !drawLayout.classList.contains('hidden')) {
            setupPad();
        }
    });

    resetJoystick = () => onPointerUp(null);
}

function bindHoldButton(btn, button) {
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        btn.classList.add('is-pressed');
        buzz(18);
        send({ action: 'btn', button: button, state: 'down' });
    });

    const release = (e) => {
        if (e) e.preventDefault();
        btn.classList.remove('is-pressed');
        send({ action: 'btn', button: button, state: 'up' });
    };

    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', () => btn.classList.remove('is-pressed'));
}

setupDpad();
setupJoystick();

doc.querySelectorAll('.arcade__btn[data-btn]').forEach(btn => {
    bindHoldButton(btn, btn.getAttribute('data-btn'));
});

function resetControls() {
    doc.querySelectorAll('.dice-btn[data-dice]').forEach(b => {
        b.classList.remove('is-selected', 'is-dimmed');
    });
    if (typeof resetDpad === 'function') {
        resetDpad();
    }
    if (typeof resetJoystick === 'function') {
        resetJoystick();
    }
    doc.querySelectorAll('.arcade__btn[data-btn]').forEach(btn => {
        if (btn.classList.contains('is-pressed')) {
            btn.classList.remove('is-pressed');
            const button = btn.getAttribute('data-btn');
            if (button) {
                send({ action: 'btn', button: button, state: 'up' });
            }
        }
    });
}

/* ==========================================================================
   Mystery Dice pad
   ========================================================================== */

doc.querySelectorAll('.dice-btn[data-dice]').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (btn.disabled || btn.classList.contains('is-selected')) return;
        buzz(35);
        const idx = Number(btn.getAttribute('data-dice'));
        send({ action: 'pick_dice', index: idx });

        doc.querySelectorAll('.dice-btn[data-dice]').forEach(b => {
            if (b === btn) {
                b.classList.add('is-selected');
                b.classList.remove('is-dimmed');
            } else {
                b.classList.add('is-dimmed');
                b.classList.remove('is-selected');
            }
        });
    });
});

/* ==========================================================================
   Trivia buzzers
   ========================================================================== */

let triviaLocked = false;

doc.querySelectorAll('.buzzer[data-choice]').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (triviaLocked) return;
        triviaLocked = true;
        buzz(35);
        const choice = Number(btn.getAttribute('data-choice'));
        send({ action: 'trivia_answer', choice: choice });

        doc.querySelectorAll('.buzzer[data-choice]').forEach(b => {
            if (b === btn) {
                b.classList.add('is-selected');
                b.classList.remove('is-dimmed');
            } else {
                b.classList.add('is-dimmed');
                b.classList.remove('is-selected');
            }
        });
        if (el.status) el.status.textContent = '✓ Guess locked in!';
        const foot = doc.getElementById('pad-foot');
        if (foot) foot.textContent = 'Waiting for all players to guess...';
    });
});

/* ==========================================================================
   Guess input
   ========================================================================== */

function submitGuess() {
    if (!el.guessInput) return;
    const text = el.guessInput.value.trim();
    if (!text) return;
    buzz(25);
    send({ action: 'submit_guess', text: text });
    el.guessInput.value = '';
    el.guessInput.focus();
}

if (el.guessSubmit) el.guessSubmit.addEventListener('click', submitGuess);
if (el.guessInput) {
    el.guessInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submitGuess(); }
    });
}

/* ==========================================================================
   Sketch pad
   Coordinates are normalised to 0..1 so any phone resolution maps cleanly.
   ========================================================================== */

let padBound = false;
let drawing = false;
let last = null;
let padCtx = null;
let padStrokes = [];
let activeDrawColor = '#1d4ed8';

function initDrawColors() {
    doc.querySelectorAll('.color-swatch[data-color]').forEach(swatch => {
        swatch.addEventListener('click', (e) => {
            e.preventDefault();
            buzz(14);
            activeDrawColor = swatch.getAttribute('data-color') || '#1d4ed8';
            doc.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('is-selected'));
            swatch.classList.add('is-selected');
            if (padCtx) padCtx.strokeStyle = activeDrawColor;
        });
    });
}
initDrawColors();

function setupPad() {
    const pad = doc.getElementById('draw-pad');
    if (!pad) return;

    const rect = pad.getBoundingClientRect();
    const dpr = Math.min(w.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));

    pad.width = Math.round(cssW * dpr);
    pad.height = Math.round(cssH * dpr);
    padCtx = pad.getContext('2d');
    padCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    padCtx.lineCap = 'round';
    padCtx.lineJoin = 'round';
    padCtx.strokeStyle = activeDrawColor;
    padCtx.lineWidth = Math.max(3, cssH * 0.012);

    padCtx.fillStyle = '#ffffff';
    padCtx.fillRect(0, 0, cssW, cssH);

    const padAspect = cssW / cssH;
    send({
        action: 'draw_pad_init',
        aspect: padAspect
    });

    if (padStrokes.length > 0) {
        padCtx.save();
        padCtx.lineWidth = Math.max(3, cssH * 0.012);
        padCtx.lineCap = 'round';
        padCtx.lineJoin = 'round';
        for (let i = 0; i < padStrokes.length; i++) {
            const s = padStrokes[i];
            padCtx.strokeStyle = s[4] || activeDrawColor;
            padCtx.beginPath();
            padCtx.moveTo(s[0] * cssW, s[1] * cssH);
            padCtx.lineTo(s[2] * cssW, s[3] * cssH);
            padCtx.stroke();
        }
        padCtx.restore();
        padCtx.strokeStyle = activeDrawColor;
    }

    if (padBound) return;
    padBound = true;

    const pos = (e) => {
        const r = pad.getBoundingClientRect();
        return {
            x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
            y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
        };
    };

    pad.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        drawing = true;
        last = pos(e);
        try { pad.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        buzz(12);

        const r = pad.getBoundingClientRect();
        const ctx = pad.getContext('2d');
        ctx.strokeStyle = activeDrawColor;
        ctx.beginPath();
        ctx.moveTo(last.x * r.width, last.y * r.height);
        ctx.lineTo(last.x * r.width, last.y * r.height);
        ctx.stroke();

        padStrokes.push([last.x, last.y, last.x, last.y, activeDrawColor]);
        send({
            action: 'draw_stroke',
            x0: last.x, y0: last.y,
            x1: last.x, y1: last.y,
            color: activeDrawColor,
            aspect: r.width / r.height
        });
    });

    pad.addEventListener('pointermove', (e) => {
        if (!drawing || !last) return;
        e.preventDefault();

        const next = pos(e);
        const r = pad.getBoundingClientRect();
        const ctx = pad.getContext('2d');

        ctx.strokeStyle = activeDrawColor;
        ctx.beginPath();
        ctx.moveTo(last.x * r.width, last.y * r.height);
        ctx.lineTo(next.x * r.width, next.y * r.height);
        ctx.stroke();

        padStrokes.push([last.x, last.y, next.x, next.y, activeDrawColor]);
        send({
            action: 'draw_stroke',
            x0: last.x, y0: last.y,
            x1: next.x, y1: next.y,
            color: activeDrawColor,
            aspect: r.width / r.height
        });
        last = next;
    });

    const stop = (e) => {
        if (!drawing) return;
        if (e) e.preventDefault();
        drawing = false;
        last = null;
    };

    pad.addEventListener('pointerup', stop);
    pad.addEventListener('pointercancel', stop);
    pad.addEventListener('pointerleave', stop);
}

if (el.clearPad) {
    el.clearPad.addEventListener('click', () => {
        padStrokes = [];
        const pad = doc.getElementById('draw-pad');
        if (pad && padCtx) {
            const r = pad.getBoundingClientRect();
            const dpr = Math.min(w.devicePixelRatio || 1, 2);
            padCtx.save();
            padCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            padCtx.fillStyle = '#ffffff';
            padCtx.fillRect(0, 0, r.width, r.height);
            padCtx.restore();
            buzz(20);
            send({ action: 'draw_stroke', clear: true, aspect: r.width / r.height });
        } else {
            buzz(20);
            send({ action: 'draw_stroke', clear: true });
        }
    });
}

/* ==========================================================================
   Header actions & Profile modal
   ========================================================================== */

if (el.homeBtn) {
    el.homeBtn.addEventListener('click', () => {
        buzz(40);
        send({ action: 'home' });
    });
}

function openProfileModal() {
    modalAvatar = selectedAvatar;
    if (el.editPlayerName) {
        el.editPlayerName.value = localStorage.getItem('caston_name') || (el.label ? el.label.textContent : '') || '';
    }
    renderAvatarToElement(el.editAvatarPreview, modalAvatar);
    if (el.editAvatarPreview) {
        el.editAvatarPreview.style.setProperty('--ring-color', playerColor);
    }
    renderPresetAvatars(el.editAvatarPresets, modalAvatar, (face) => {
        modalAvatar = face;
        renderAvatarToElement(el.editAvatarPreview, face);
    });
    if (el.profileModal) el.profileModal.classList.remove('hidden');
    buzz(20);
    setTimeout(() => {
        if (el.editPlayerName) {
            try { el.editPlayerName.focus(); } catch (e) {}
        }
    }, 100);
}

function closeProfileModal() {
    if (el.profileModal) el.profileModal.classList.add('hidden');
}

function saveProfile() {
    const rawName = (el.editPlayerName ? el.editPlayerName.value : '').trim();
    const newName = (rawName || localStorage.getItem('caston_name') || 'Player').slice(0, 12);
    selectedAvatar = modalAvatar;

    localStorage.setItem('caston_name', newName);
    localStorage.setItem('caston_avatar', selectedAvatar);

    if (el.label) el.label.textContent = newName;
    if (el.name) el.name.value = newName;
    renderAvatarToElement(el.avatar, selectedAvatar);
    renderAvatarToElement(el.joinAvatarPreview, selectedAvatar);

    send({
        action: 'update_profile',
        name: newName,
        avatar: selectedAvatar
    });

    closeProfileModal();
    buzz(45);
}

function initProfileModal() {
    if (el.profileTriggerBtn) {
        el.profileTriggerBtn.addEventListener('click', openProfileModal);
    }
    if (el.avatar) {
        el.avatar.addEventListener('click', (e) => {
            e.stopPropagation();
            openProfileModal();
        });
    }
    if (el.label) {
        el.label.addEventListener('click', (e) => {
            e.stopPropagation();
            openProfileModal();
        });
    }
    if (el.profileModalClose) {
        el.profileModalClose.addEventListener('click', closeProfileModal);
    }
    if (el.cancelProfileBtn) {
        el.cancelProfileBtn.addEventListener('click', closeProfileModal);
    }
    if (el.saveProfileBtn) {
        el.saveProfileBtn.addEventListener('click', saveProfile);
    }
    if (el.profileModal) {
        el.profileModal.addEventListener('click', (e) => {
            if (e.target === el.profileModal) closeProfileModal();
        });
    }

    const handleEditFile = (file) => {
        processImageFile(file, (dataUrl) => {
            modalAvatar = dataUrl;
            renderAvatarToElement(el.editAvatarPreview, dataUrl);
            if (el.editAvatarPresets) {
                el.editAvatarPresets.querySelectorAll('.avatar-preset-btn').forEach(b => b.classList.remove('is-selected'));
            }
            buzz(25);
        });
    };

    if (el.editAvatarCamera) {
        el.editAvatarCamera.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleEditFile(e.target.files[0]);
                e.target.value = '';
            }
        });
    }
    if (el.editAvatarFile) {
        el.editAvatarFile.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleEditFile(e.target.files[0]);
                e.target.value = '';
            }
        });
    }
    if (el.editPlayerName) {
        el.editPlayerName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveProfile();
            }
        });
    }
}

function initJoinAvatar() {
    renderAvatarToElement(el.joinAvatarPreview, selectedAvatar);
    renderPresetAvatars(el.joinAvatarPresets, selectedAvatar, (face) => {
        selectedAvatar = face;
        localStorage.setItem('caston_avatar', face);
        renderAvatarToElement(el.joinAvatarPreview, face);
    });

    const handleJoinFile = (file) => {
        processImageFile(file, (dataUrl) => {
            selectedAvatar = dataUrl;
            localStorage.setItem('caston_avatar', dataUrl);
            renderAvatarToElement(el.joinAvatarPreview, dataUrl);
            if (el.joinAvatarPresets) {
                el.joinAvatarPresets.querySelectorAll('.avatar-preset-btn').forEach(b => b.classList.remove('is-selected'));
            }
            buzz(25);
        });
    };

    if (el.joinAvatarCamera) {
        el.joinAvatarCamera.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleJoinFile(e.target.files[0]);
                e.target.value = '';
            }
        });
    }
    if (el.joinAvatarFile) {
        el.joinAvatarFile.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleJoinFile(e.target.files[0]);
                e.target.value = '';
            }
        });
    }
}

/* ==========================================================================
   Verbal Guess Modal
   ========================================================================== */

function renderVerbalPlayers() {
    if (!el.verbalPlayersList) return;
    el.verbalPlayersList.innerHTML = '';

    if (!currentGuessers || !currentGuessers.length) {
        el.verbalPlayersList.innerHTML = '<p class="dim t-sm" style="text-align:center;padding:16px 0;">No other players connected.</p>';
        return;
    }

    currentGuessers.forEach(p => {
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'verbal-player-card';
        btn.style.setProperty('--player-accent', p.color || 'var(--accent)');

        const av = doc.createElement('span');
        av.className = 'avatar avatar--sm';
        av.style.setProperty('--ring-color', p.color || 'var(--accent)');
        renderAvatarToElement(av, p.avatar);

        const name = doc.createElement('span');
        name.className = 'verbal-player-card__name';
        name.textContent = p.name || 'Player';

        const tag = doc.createElement('span');
        tag.className = 'verbal-player-card__tag';
        tag.textContent = 'Award Win ✓';

        btn.appendChild(av);
        btn.appendChild(name);
        btn.appendChild(tag);

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            buzz(45);
            send({ action: 'accept_guess', guesserId: p.id });
            closeVerbalModal();
        });

        el.verbalPlayersList.appendChild(btn);
    });
}

function openVerbalModal() {
    renderVerbalPlayers();
    if (el.verbalModal) el.verbalModal.classList.remove('hidden');
    buzz(20);
}

function closeVerbalModal() {
    if (el.verbalModal) el.verbalModal.classList.add('hidden');
}

function initVerbalModal() {
    if (el.drawAcceptBtn) {
        el.drawAcceptBtn.addEventListener('click', openVerbalModal);
    }
    if (el.verbalModalClose) {
        el.verbalModalClose.addEventListener('click', closeVerbalModal);
    }
    if (el.cancelVerbalBtn) {
        el.cancelVerbalBtn.addEventListener('click', closeVerbalModal);
    }
    if (el.verbalModal) {
        el.verbalModal.addEventListener('click', (e) => {
            if (e.target === el.verbalModal) closeVerbalModal();
        });
    }
}

/* ==========================================================================
   Wiring
   ========================================================================== */

if (el.joinBtn) el.joinBtn.addEventListener('click', joinRoom);

if (el.code) {
    el.code.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); el.name && el.name.focus(); }
    });
    el.code.addEventListener('input', () => {
        el.code.value = el.code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
        hideError();
    });
}

if (el.name) {
    el.name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); joinRoom(); }
    });
}

initJoinAvatar();
initProfileModal();
initVerbalModal();

// Auto-connect when a room code arrived via the QR link.
if (roomCode.length === 4) {
    const savedName = localStorage.getItem('caston_name');
    if (savedName) {
        joinRoom();
    } else if (el.name) {
        el.name.focus();
    }
}

// Keep screen awake & auto-reconnect when phone unlocks or returns to tab
doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') {
        requestWakeLock();
        if (!isDeliberatelyClosed && roomCode && storedPid) {
            if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
                attemptReconnect();
            }
        }
    }
});

w.addEventListener('pageshow', () => {
    requestWakeLock();
    if (!isDeliberatelyClosed && roomCode && storedPid) {
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            attemptReconnect();
        }
    }
});

w.addEventListener('focus', () => {
    requestWakeLock();
});

// Re-request wake lock on any user interaction with the controller
['touchstart', 'mousedown', 'pointerdown'].forEach((evtType) => {
    doc.addEventListener(evtType, () => {
        requestWakeLock();
    }, { passive: true });
});

/* ==========================================================================
   Hangman (1 vs Rest) Controller Event Handlers
   ========================================================================== */

doc.querySelectorAll('.hm-key[data-letter]').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (btn.disabled || btn.classList.contains('is-picked')) return;
        buzz(35);
        const letter = btn.getAttribute('data-letter');
        send({ action: 'hm_guess_letter', letter: letter });
    });
});

const hmSolveToggleBtn = doc.getElementById('hm-solve-toggle-btn');
const hmSolveForm = doc.getElementById('hm-solve-form');
const hmSolveInput = doc.getElementById('hm-solve-input');
const hmSolveSubmitBtn = doc.getElementById('hm-solve-submit-btn');

if (hmSolveToggleBtn && hmSolveForm) {
    hmSolveToggleBtn.addEventListener('click', () => {
        hmSolveForm.classList.toggle('hidden');
        if (!hmSolveForm.classList.contains('hidden') && hmSolveInput) {
            setTimeout(() => {
                hmSolveInput.focus();
                hmSolveInput.select();
            }, 60);
        }
    });
}

function submitHmSolve() {
    if (!hmSolveInput) return;
    const text = hmSolveInput.value.trim();
    if (!text) return;
    buzz(40);
    send({ action: 'hm_solve_word', word: text });
    hmSolveInput.value = '';
    if (hmSolveForm) hmSolveForm.classList.add('hidden');
}

if (hmSolveSubmitBtn) hmSolveSubmitBtn.addEventListener('click', submitHmSolve);
if (hmSolveInput) {
    hmSolveInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitHmSolve();
        }
    });
}

const hmCustomToggleBtn = doc.getElementById('hm-custom-toggle-btn');
const hmCustomForm = doc.getElementById('hm-custom-form');
const hmCustomWordInput = doc.getElementById('hm-custom-word-input');
const hmCustomCatInput = doc.getElementById('hm-custom-cat-input');
const hmCustomSubmitBtn = doc.getElementById('hm-custom-submit-btn');

if (hmCustomToggleBtn && hmCustomForm) {
    hmCustomToggleBtn.addEventListener('click', () => {
        hmCustomForm.classList.toggle('hidden');
        if (!hmCustomForm.classList.contains('hidden') && hmCustomWordInput) {
            setTimeout(() => {
                hmCustomWordInput.focus();
            }, 60);
        }
    });
}

if (hmCustomSubmitBtn) {
    hmCustomSubmitBtn.addEventListener('click', () => {
        if (!hmCustomWordInput) return;
        const w = hmCustomWordInput.value.trim();
        const cat = hmCustomCatInput ? hmCustomCatInput.value.trim() : '';
        if (!w) return;
        buzz(40);
        send({ action: 'hm_custom_word', word: w, category: cat || 'Custom' });
        hmCustomWordInput.value = '';
    });
}

// The controller is a one-shot page; closing the tab should free the slot.
w.addEventListener('beforeunload', () => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
});

})(window);
