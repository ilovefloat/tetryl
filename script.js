const COLS = 10, ROWS = 40, VISIBLE_ROWS = 20, BLOCK_SIZE = 30;
const canvas = document.getElementById('tetrylCanvas');
const ctx = canvas.getContext('2d');

let board = [], currentPiece, nextQueue = [], holdPiece, canHold;
let score = 0, lines = 0, level = 1, combo = -1, b2bActive = false, b2bCount = 0;
let gameMode = 'zen', timeRemaining = 0, sessionActive = false, isPaused = false;
let sessionStartTime = 0, piecesPlaced = 0;
let lastTime = 0, dropCounter = 0, lockTimer = 0;
let particles = [], floatingTexts = [];
let countdownTimeouts = [];
let isToppingOut = false; 

// Survival/Spike/Sort State
let survivalTime = 0, cheeseTimer = 0, spikeRollTimer = 0;
let pendingSpikeLines = 0, spikeInjectTimer = 0;
let sortTimer = 0;

// Visual Sorting State
let isSorting = false;
let sortGenerator = null;
let sortStepTimer = 0;
let lastSwap = {a: -1, b: -1};

// Zen Mode History
let zenHistoryUndo = [];
let zenHistoryRedo = [];

const config = { das: 167, arr: 33, dcd: 33, lockDelay: 400 };
let dasTimer = 0, arrTimer = 0, dcdTimer = 0, keysDown = {}, lastMoveKey = null;
let hardDropLocked = false, lockResetCount = 0;

const COLORS = { I: '#22d3ee', J: '#2563eb', L: '#f97316', O: '#facc15', S: '#22c55e', T: '#a855f7', Z: '#ef4444' };
const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
    O: [[1,1],[1,1]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]]
};

const KICK_DATA = {
    standard: {
        '0-1': [[0,0], [-1,0], [-1,1], [0,-2], [-1,-2]], '1-0': [[0,0], [1,0], [1,-1], [0,2], [1,2]],
        '1-2': [[0,0], [1,0], [1,-1], [0,2], [1,2]], '2-1': [[0,0], [-1,0], [-1,1], [0,-2], [-1,-2]],
        '2-3': [[0,0], [1,0], [1,1], [0,-2], [1,-2]], '3-2': [[0,0], [-1,0], [-1,-1], [0,2], [-1,2]],
        '3-0': [[0,0], [-1,0], [-1,-1], [0,2], [-1,2]], '0-3': [[0,0], [1,0], [1,1], [0,-2], [1,-2]],
        '0-2': [[0,0], [0,1], [1,1], [-1,1], [1,0], [-1,0], [0,-1]], '2-0': [[0,0], [0,-1], [-1,-1], [1,-1], [-1,0], [1,0], [0,1]],
        '1-3': [[0,0], [1,0], [1,2], [1,1], [0,2], [0,1], [1,0]], '3-1': [[0,0], [-1,0], [-1,2], [-1,1], [0,2], [0,1], [-1,0]]
    },
    I: {
        '0-1': [[0,0], [-2,0], [1,0], [-2,-1], [1,2]], '1-0': [[0,0], [2,0], [-1,0], [2,1], [-1,-2]],
        '1-2': [[0,0], [-1,0], [2,0], [-1,2], [2,-1]], '2-1': [[0,0], [1,0], [-2,0], [1,-2], [-2,1]],
        '2-3': [[0,0], [2,0], [-1,0], [2,1], [-1,-2]], '3-2': [[0,0], [-2,0], [1,0], [-2,-1], [1,2]],
        '3-0': [[0,0], [1,0], [-2,0], [1,-2], [-2,1]], '0-3': [[0,0], [-1,0], [2,0], [-1,2], [2,-1]],
        '0-2': [[0,0], [-1,0], [-2,0], [1,0], [2,0]], '2-0': [[0,0], [1,0], [2,0], [-1,0], [-2,0]],
        '1-3': [[0,0], [0,1], [0,2], [0,-1], [0,-2]], '3-1': [[0,0], [0,1], [0,2], [0,-1], [0,-2]]
    }
};

const sound = {
    lastScheduledTime: 0,
    initialized: false,
    init() {
        if (this.initialized) return;
        this.synth = new Tone.PolySynth(Tone.Synth).toDestination();
        this.synth.set({ oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.05, release: 0.1 } });
        this.synth.volume.value = -12;

        this.fm = new Tone.FMSynth().toDestination();
        this.fm.volume.value = -16; 

        this.noise = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 } }).toDestination();
        this.noise.volume.value = -18; 
        
        this.bass = new Tone.MonoSynth({ 
            oscillator: { type: "square" }, 
            envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 }
        }).toDestination();
        this.bass.volume.value = -4; 

        this.initialized = true;
    },
    getSafeTime() {
        const now = Tone.now();
        if (now <= this.lastScheduledTime) {
            this.lastScheduledTime += 0.02;
        } else {
            this.lastScheduledTime = now;
        }
        return this.lastScheduledTime;
    },
    playMove() { return; },
    playSpinTick() { 
        const t = this.getSafeTime();
        this.synth.triggerAttackRelease("E5", "128n", t, 0.15);
        this.noise.triggerAttackRelease("128n", t, 0.05);
    },
    playDropTick() { this.noise.triggerAttackRelease("128n", this.getSafeTime(), 0.05); },
    playLock() { 
        const t = this.getSafeTime();
        this.bass.triggerAttackRelease("C2", "16n", t, 0.8);
        this.noise.triggerAttackRelease("32n", t, 0.2); 
    }, 
    playTechnicalSpin() {
        const t = this.getSafeTime();
        this.fm.triggerAttackRelease("C5", "16n", t, 0.2);
        this.synth.triggerAttackRelease(["E5", "G5", "B5", "D6"], "8n", t + 0.01, 0.1);
    },
    playClear(lines, isTechnical) {
        const t = this.getSafeTime();
        if (lines === 4) {
            this.synth.triggerAttackRelease(["C4", "G4", "C5", "E5"], "4n", t, 0.25);
        } else if (isTechnical) {
            this.playTechnicalSpin();
        } else {
            const notes = ["C4", "E4", "G4", "B4"];
            this.synth.triggerAttackRelease(notes[Math.min(lines-1, 3)], "16n", t, 0.3);
        }
    },
    playCombo(c) {
        const t = this.getSafeTime();
        const notes = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"];
        const note = notes[Math.min(c, notes.length - 1)];
        this.synth.triggerAttackRelease(note, "32n", t, 0.4);
    },
    playAllClear() {
        this.synth.triggerAttackRelease(["C5", "E5", "G5", "C6"], "8n", this.getSafeTime(), 0.25);
    },
    playB2B() {
        this.synth.triggerAttackRelease("F5", "16n", this.getSafeTime(), 0.3);
    },
    playReady() {
        if (!this.initialized) return;
        this.synth.triggerAttackRelease("C5", "8n", Tone.now(), 0.15);
    },
    playGo() {
        if (!this.initialized) return;
        this.synth.triggerAttackRelease("C6", "4n", Tone.now(), 0.2);
    }
};

class Piece {
    constructor(type) {
        this.type = type;
        this.matrix = JSON.parse(JSON.stringify(SHAPES[type]));
        this.color = COLORS[type];
        this.x = (type === 'O') ? 4 : 3;
        this.y = (type === 'I') ? 19 : 20; 
        this.rotation = 0;
        this.spinPulse = 0;
        this.isTechnicalSpin = false;
        this.spinType = ""; 
        this.lastKickIndex = 0;
        
        // Physics for top out animation
        this.animX = 0;
        this.animY = 0;
        this.vx = 0;
        this.vy = 0;
        this.vRot = 0;
        this.rotAngle = 0;
    }
    collision(ox, oy, matrix = this.matrix) {
        for (let y = 0; y < matrix.length; y++) {
            for (let x = 0; x < matrix[y].length; x++) {
                if (matrix[y][x]) {
                    let nx = this.x + x + ox;
                    let ny = this.y + y + oy;
                    if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
                    if (ny >= 0 && board[ny][nx]) {
                        // Phantom Mode Overlap Logic
                        if (gameMode === 'phantom' && board[ny][nx] === this.color) {
                            continue; // allow same color overlap
                        }
                        return true;
                    }
                }
            }
        }
        return false;
    }
    rotate(dir) {
        if (this.type === 'O') return;
        const size = this.matrix.length;
        let newM = Array.from({length: size}, () => Array(size).fill(0));
        for(let y=0; y<size; y++) {
            for(let x=0; x<size; x++) {
                if (dir === 1) newM[x][size - 1 - y] = this.matrix[y][x];
                else if (dir === -1) newM[size - 1 - x][y] = this.matrix[y][x];
                else newM[size-1-y][size-1-x] = this.matrix[y][x];
            }
        }
        const prevRot = this.rotation;
        const nextRot = (prevRot + (dir === 1 ? 1 : dir === -1 ? 3 : 2)) % 4;
        const lookup = `${prevRot}-${nextRot}`;
        const kicks = (this.type === 'I') ? KICK_DATA.I[lookup] : KICK_DATA.standard[lookup];
        
        if (kicks) {
            for (let i = 0; i < kicks.length; i++) {
                const [kx, ky] = kicks[i];
                if (!this.collision(kx, -ky, newM)) {
                    this.x += kx; this.y -= ky; this.matrix = newM; this.rotation = nextRot;
                    this.lastKickIndex = i;
                    
                    const isImmobile = this.collision(-1, 0) && this.collision(1, 0) && this.collision(0, -1);
                    
                    if (this.type === 'T') {
                        const corners = [[0,0], [2,0], [0,2], [2,2]];
                        let count = 0;
                        let frontCount = 0;
                        const frontOffsets = this.rotation === 0 ? [[0,0], [2,0]] : 
                                             this.rotation === 1 ? [[2,0], [2,2]] : 
                                             this.rotation === 2 ? [[0,2], [2,2]] : 
                                             [[0,0], [0,2]];

                        corners.forEach(([cx, cy]) => {
                            const bx = this.x + cx, by = this.y + cy;
                            if (bx < 0 || bx >= COLS || by >= ROWS || (by >= 0 && board[by][bx])) {
                                // Ignore ethereal Phantom blocks for T-Spin corners
                                if (gameMode === 'phantom' && by >= 0 && board[by][bx] === this.color) {
                                    return;
                                }
                                count++;
                                if (frontOffsets.some(f => f[0] === cx && f[1] === cy)) frontCount++;
                            }
                        });
                        
                        if (count >= 3) {
                            this.isTechnicalSpin = true;
                            if (frontCount < 2 && this.lastKickIndex !== 4) this.spinType = "MINI";
                            else this.spinType = "NORMAL";
                            this.spinPulse = 1.0; 
                            createSpinParticles(this.x, this.y - VISIBLE_ROWS, this.color);
                            triggerShake();
                            sound.playSpinTick(); 
                        } else {
                            this.isTechnicalSpin = false;
                        }
                    } else if (isImmobile) {
                        this.isTechnicalSpin = true;
                        this.spinType = this.type; 
                        this.spinPulse = 1.0;
                        createSpinParticles(this.x, this.y - VISIBLE_ROWS, this.color);
                        triggerShake();
                        sound.playSpinTick(); 
                    } else {
                        this.isTechnicalSpin = false;
                        this.spinPulse = 0;
                    }
                    
                    if (this.collision(0, 1) && lockResetCount < 15) {
                        lockTimer = 0;
                        lockResetCount++;
                    }
                    return true;
                }
            }
        }
        return false;
    }
}

// Formats ms into MM:SS or MM:SS.ms
function formatTime(ms, showMs = false) {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const secStr = seconds.toString().padStart(2, '0');
    if (showMs) {
        const milliseconds = Math.floor((totalSeconds % 1) * 1000);
        const msStr = milliseconds.toString().padStart(3, '0');
        return `${minutes}:${secStr}.${msStr}`;
    }
    return `${minutes}:${secStr}`;
}

function startGame(mode) {
    sound.init(); Tone.start();
    gameMode = mode;
    isToppingOut = false; 
    
    isSorting = false;
    sortGenerator = null;
    sortStepTimer = 0;
    lastSwap = {a: -1, b: -1};
    
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('resultMenu').classList.add('hidden');
    document.getElementById('pauseMenu').classList.add('hidden');
    document.getElementById('boardContainer').classList.remove('blur-sm');
    
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    score = 0; lines = 0; level = 1; combo = -1; b2bActive = false; b2bCount = 0;
    piecesPlaced = 0; survivalTime = 0; cheeseTimer = 0; spikeRollTimer = 0; 
    pendingSpikeLines = 0; spikeInjectTimer = 0; sortTimer = 0;
    particles = []; floatingTexts = [];
    nextQueue = []; holdPiece = null; canHold = true;
    zenHistoryUndo = []; zenHistoryRedo = [];
    
    document.getElementById('scoreLabel').innerText = "0";
    document.getElementById('ppsLabel').innerText = "0.00";
    document.getElementById('comboContainer').style.opacity = '0';
    document.getElementById('b2bContainer').style.opacity = '0';
    
    const timerCont = document.getElementById('timerContainer');
    const timerTitle = document.getElementById('timerTitle');
    
    if (mode === 'zen') {
        timerCont.classList.add('hidden');
        document.getElementById('controlsHint').innerHTML = "<p>P: Pause | R: Restart<br>Ctrl+Z: Undo | Ctrl+Y: Redo</p>";
    } else if (mode === 'cheese') {
        timerCont.classList.remove('hidden');
        timerTitle.innerText = "Survival";
        document.getElementById('timerLabel').innerText = "0:00";
        document.getElementById('controlsHint').innerHTML = "<p>P: Pause | R: Restart<br>Attack to Defend Spikes!</p>";
    } else if (mode === 'spike') {
        timerCont.classList.remove('hidden');
        timerTitle.innerText = "Spike!";
        document.getElementById('timerLabel').innerText = "0:00";
        document.getElementById('controlsHint').innerHTML = "<p>P: Pause | R: Restart<br>Survive the 20-Line Spikes!</p>";
        pendingSpikeLines = 20;
        spikeInjectTimer = 30000;
    } else if (mode === 'quicksort') {
        timerCont.classList.remove('hidden');
        timerTitle.innerText = "Timer";
        timeRemaining = 120; // 2 Minutes
        updateTimerDisplay();
        document.getElementById('controlsHint').innerHTML = "<p>P: Pause | R: Restart<br>Sorts every 10s!</p>";
    } else if (mode === 'livesort') {
        timerCont.classList.remove('hidden');
        timerTitle.innerText = "Timer";
        timeRemaining = 120; // 2 Minutes
        updateTimerDisplay();
        document.getElementById('controlsHint').innerHTML = "<p>P: Pause | R: Restart<br>Live sorting!</p>";
    } else if (mode === 'phantom') {
        timerCont.classList.remove('hidden');
        timerTitle.innerText = "Timer";
        timeRemaining = 120; // 2 Minutes
        updateTimerDisplay();
        document.getElementById('controlsHint').innerHTML = "<p>P: Pause | R: Restart<br>Same colors overlap!</p>";
    } else {
        timerCont.classList.remove('hidden');
        timerTitle.innerText = "Timer";
        timeRemaining = mode;
        updateTimerDisplay();
        document.getElementById('controlsHint').innerHTML = "<p>P: Pause | R: Restart</p>";
    }
    
    while (nextQueue.length < 14) {
        const bag = Object.keys(SHAPES).sort(() => Math.random() - 0.5);
        nextQueue.push(...bag);
    }
    
    currentPiece = null;
    drawSideCanvases(); 
    draw(0); 

    startCountdown();
}

function startCountdown() {
    countdownTimeouts.forEach(clearTimeout);
    countdownTimeouts = [];

    const cd = document.getElementById('countdownOverlay');
    const ct = document.getElementById('countdownText');
    cd.classList.remove('hidden');
    
    document.getElementById('leftPanel').classList.remove('opacity-0');
    document.getElementById('rightPanel').classList.remove('opacity-0');
    document.getElementById('boardContainer').classList.remove('opacity-0');
    
    const bc = document.getElementById('boardContainer');
    bc.classList.remove('board-flip'); void bc.offsetWidth; bc.classList.add('board-flip');
    
    ct.innerText = "READY";
    ct.style.opacity = '1';
    ct.style.transform = 'scale(1)';
    sound.playReady();
    
    countdownTimeouts.push(setTimeout(() => {
        ct.style.opacity = '0';
        ct.style.transform = 'scale(1.5)';
        
        countdownTimeouts.push(setTimeout(() => {
            ct.innerText = "GO!";
            ct.style.opacity = '1';
            ct.style.transform = 'scale(1)';
            sound.playGo();
            
            countdownTimeouts.push(setTimeout(() => {
                ct.style.opacity = '0';
                countdownTimeouts.push(setTimeout(() => cd.classList.add('hidden'), 300));
                
                sessionActive = true;
                isPaused = false;
                sessionStartTime = performance.now();
                lastTime = performance.now();
                spawnPiece();
                requestAnimationFrame(loop);
                
            }, 400));
        }, 300));
    }, 600));
}

function triggerRestart() {
    if (!sessionActive && document.getElementById('resultMenu').classList.contains('hidden') && document.getElementById('pauseMenu').classList.contains('hidden')) return;
    sessionActive = false;
    startGame(gameMode);
}

function goToMainMenu() {
    sessionActive = false;
    document.getElementById('leftPanel').classList.add('opacity-0');
    document.getElementById('rightPanel').classList.add('opacity-0');
    document.getElementById('boardContainer').classList.add('opacity-0');
    
    document.getElementById('pauseMenu').classList.add('hidden');
    document.getElementById('resultMenu').classList.add('hidden');
    document.getElementById('mainMenu').classList.remove('hidden');
}

function updateTimerDisplay() {
    if (gameMode === 'cheese' || gameMode === 'spike') {
        document.getElementById('timerLabel').innerText = formatTime(survivalTime, false);
    } else if (gameMode !== 'zen') {
        document.getElementById('timerLabel').innerText = formatTime(timeRemaining * 1000, false);
    }
}

function endGame() {
    sessionActive = false;
    document.getElementById('leftPanel').classList.add('opacity-0');
    document.getElementById('rightPanel').classList.add('opacity-0');
    document.getElementById('boardContainer').classList.add('opacity-0');
    
    const timeElapsed = (performance.now() - sessionStartTime) / 1000;
    const finalPps = piecesPlaced / timeElapsed;
    document.getElementById('resPps').innerText = finalPps.toFixed(2);
    document.getElementById('resLines').innerText = lines;
    
    const hsAlert = document.getElementById('hsAlert');
    const pbCont = document.getElementById('prevBestContainer');
    const resScoreTitle = document.getElementById('resScoreTitle');
    const resSecondaryScoreContainer = document.getElementById('resSecondaryScoreContainer');
    
    if (gameMode !== 'zen') {
        const isSurvival = (gameMode === 'cheese' || gameMode === 'spike');
        const hsKey = `tetryl_hs_${gameMode}`;
        const finalMetric = isSurvival ? survivalTime : score;
        const prevBest = parseFloat(localStorage.getItem(hsKey) || '0');
        
        if (finalMetric > prevBest) {
            localStorage.setItem(hsKey, finalMetric);
            hsAlert.classList.remove('hidden');
            pbCont.classList.add('hidden');
        } else {
            hsAlert.classList.add('hidden');
            pbCont.classList.remove('hidden');
            if (isSurvival) {
                document.getElementById('prevBestScore').innerText = formatTime(prevBest, true);
            } else {
                document.getElementById('prevBestScore').innerText = prevBest;
            }
        }
        
        if (isSurvival) {
             resScoreTitle.innerText = "Survival Time";
             document.getElementById('resScore').innerText = formatTime(survivalTime, true);
             resSecondaryScoreContainer.classList.remove('hidden');
             document.getElementById('resSecondaryScore').innerText = score;
        } else {
             resScoreTitle.innerText = "Final Score";
             document.getElementById('resScore').innerText = score;
             resSecondaryScoreContainer.classList.add('hidden');
        }
    } else {
        hsAlert.classList.add('hidden');
        pbCont.classList.add('hidden');
        resScoreTitle.innerText = "Zen Mode";
        document.getElementById('resScore').innerText = score;
        resSecondaryScoreContainer.classList.add('hidden');
    }
    
    setTimeout(() => {
        document.getElementById('resultMenu').classList.remove('hidden');
    }, 400);
}

// ---- ROBUST ZEN MODE LOGIC ----
function saveZenState() {
    if (gameMode !== 'zen') return;
    const state = {
        board: board.map(row => [...row]),
        currentType: currentPiece ? currentPiece.type : null,
        holdPiece: holdPiece, canHold: canHold,
        nextQueue: [...nextQueue], score: score,
        combo: combo, b2bActive: b2bActive, b2bCount: b2bCount
    };
    zenHistoryUndo.push(state);
    if (zenHistoryUndo.length > 100) zenHistoryUndo.shift();
    zenHistoryRedo = [];
}

function undoZen() {
    if (gameMode !== 'zen' || zenHistoryUndo.length === 0) return;
    const currentState = {
        board: board.map(row => [...row]),
        currentType: currentPiece ? currentPiece.type : null,
        holdPiece: holdPiece, canHold: canHold,
        nextQueue: [...nextQueue], score: score, combo: combo,
        b2bActive: b2bActive, b2bCount: b2bCount
    };
    zenHistoryRedo.push(currentState);
    applyZenState(zenHistoryUndo.pop());
}

function redoZen() {
    if (gameMode !== 'zen' || zenHistoryRedo.length === 0) return;
    const currentState = {
        board: board.map(row => [...row]),
        currentType: currentPiece ? currentPiece.type : null,
        holdPiece: holdPiece, canHold: canHold,
        nextQueue: [...nextQueue], score: score, combo: combo,
        b2bActive: b2bActive, b2bCount: b2bCount
    };
    zenHistoryUndo.push(currentState);
    applyZenState(zenHistoryRedo.pop());
}

function applyZenState(state) {
    board = state.board.map(row => [...row]);
    holdPiece = state.holdPiece; canHold = state.canHold;
    nextQueue = [...state.nextQueue]; score = state.score;
    combo = state.combo; b2bActive = state.b2bActive; b2bCount = state.b2bCount;
    
    if (state.currentType) {
        currentPiece = new Piece(state.currentType);
        if (currentPiece.collision(0, 0)) currentPiece.y--;
    } else {
        currentPiece = null;
    }
    
    dcdTimer = config.dcd; lockResetCount = 0; lockTimer = 0; dropCounter = 0;
}

function triggerTopOut() {
    if (isToppingOut) return;
    isToppingOut = true;
    
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (board[y][x]) board[y][x] = '#475569'; // Turn board gray
        }
    }
    
    if (currentPiece) {
        currentPiece.animX = currentPiece.x;
        currentPiece.animY = currentPiece.y;
        currentPiece.vx = (Math.random() - 0.5) * 12; 
        currentPiece.vy = -18; 
        currentPiece.vRot = (Math.random() - 0.5) * 15; 
        currentPiece.rotAngle = 0;
    }
    
    sound.playLock();
    triggerShake();
}

function spawnPiece(recordState = true) {
    if (nextQueue.length < 14) {
        const bag = Object.keys(SHAPES).sort(() => Math.random() - 0.5);
        nextQueue.push(...bag);
    }
    
    currentPiece = new Piece(nextQueue.shift());
    // Spawn kick: Try pushing piece up into vanish zone if obstructed
    if (currentPiece.collision(0, 0)) {
        currentPiece.y--;
    }
    canHold = true; dcdTimer = config.dcd; lockResetCount = 0; lockTimer = 0; dropCounter = 0;
    
    if (recordState) saveZenState();
    
    if (currentPiece.collision(0, 0)) {
        if (gameMode === 'zen') { 
            board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
            const bc = document.getElementById('boardContainer');
            bc.classList.remove('board-flip'); void bc.offsetWidth; bc.classList.add('board-flip');
            currentPiece = new Piece(nextQueue.shift());
            if (recordState) saveZenState();
        } else { 
            triggerTopOut();
        }
    }
}
// -------------------------------

// ---- UNIFIED SCORING & CLEAR LOGIC ----
function evaluateLineClears(phantomColorOverride, isFromHold) {
    let phantomColor = null;
    if (gameMode === 'phantom') {
        phantomColor = phantomColorOverride;
    }

    let linesCleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) { 
        let isRowFull = true;
        for (let x = 0; x < COLS; x++) {
            let c = board[y][x];
            if (c === 0) { isRowFull = false; break; } // Empty space
            if (gameMode === 'phantom' && c === phantomColor) { isRowFull = false; break; } // Phantom blocks act as holes
        }
        
        if (isRowFull) { 
            board.splice(y, 1); 
            board.unshift(Array(COLS).fill(0)); 
            linesCleared++; 
            y++; 
        } 
    }

    if (linesCleared > 0) {
        lines += linesCleared;
        combo++;
        let b2bMultiplier = 1.0;
        let isDifficult = (linesCleared >= 4) || (currentPiece && currentPiece.isTechnicalSpin && !isFromHold);
        
        if (isDifficult) {
            if (b2bActive) { b2bCount++; b2bMultiplier = 1.5; } else { b2bActive = true; b2bCount = 1; }
        } else {
            b2bActive = false; b2bCount = 0;
        }

        score += Math.floor(linesCleared * 100 * level * (combo + 1) * b2bMultiplier);
        sound.playClear(linesCleared, currentPiece && currentPiece.isTechnicalSpin && !isFromHold); 
        if (combo >= 0) sound.playCombo(combo);
        
        if (linesCleared >= 4) { 
            createFloatingText("TETRYL", COLORS.I); 
        } else if (currentPiece && currentPiece.isTechnicalSpin && !isFromHold) {
            if (currentPiece.type === 'T') {
                let spinText = "";
                if (linesCleared === 1) {
                    spinText = currentPiece.spinType === "MINI" ? "T-SPIN MINI" : "T-SPIN SINGLE";
                } else if (linesCleared === 2) {
                    spinText = currentPiece.spinType === "MINI" ? "T-SPIN MINI" : "T-SPIN DOUBLE";
                } else if (linesCleared === 3) {
                    spinText = "T-SPIN TRIPLE";
                }
                createFloatingText(spinText, COLORS.T);
            } else {
                createFloatingText(`${currentPiece.spinType}-SPIN`, COLORS[currentPiece.type]);
            }
        }
        
        const isAllClear = board.every(row => row.every(cell => cell === 0));
        if (isAllClear) { createFloatingText("PERFECT CLEAR", "#fbbf24"); score += 3000; sound.playAllClear(); }

        // --- Cheese & Spike Defense Logic ---
        if ((gameMode === 'cheese' || gameMode === 'spike') && pendingSpikeLines > 0) {
            let attack = 0;
            if (linesCleared === 1) attack = (currentPiece && currentPiece.isTechnicalSpin && !isFromHold) ? 2 : 0;
            else if (linesCleared === 2) attack = (currentPiece && currentPiece.isTechnicalSpin && !isFromHold) ? 4 : 1;
            else if (linesCleared === 3) attack = (currentPiece && currentPiece.isTechnicalSpin && !isFromHold) ? 6 : 2;
            else if (linesCleared === 4) attack = 4;
            
            if (currentPiece && currentPiece.isTechnicalSpin && currentPiece.spinType === 'MINI' && linesCleared === 1 && !isFromHold) attack = 0; 
            
            if (b2bActive && b2bCount > 1 && attack > 0) attack += 1;
            if (combo > 0) {
                if (combo >= 1 && combo <= 2) attack += 1;
                else if (combo >= 3 && combo <= 4) attack += 2;
                else if (combo >= 5 && combo <= 6) attack += 3;
                else if (combo >= 7) attack += 4;
            }
            if (isAllClear) attack += 10;

            if (attack > 0) {
                pendingSpikeLines -= attack;
                if (pendingSpikeLines <= 0) {
                    pendingSpikeLines = 0;
                    createFloatingText("DEFENDED", "#22c55e");
                } else {
                    createFloatingText(`DEFENSE -${attack}`, "#38bdf8");
                }
            }
        }
        triggerShake();
    } else if (!isFromHold) { 
        combo = -1; 
        if (currentPiece && currentPiece.isTechnicalSpin) {
            if (currentPiece.type === 'T') {
                let spinText = currentPiece.spinType === "MINI" ? "T-SPIN MINI" : "T-SPIN";
                createFloatingText(spinText, COLORS.T);
            } else {
                createFloatingText(`${currentPiece.spinType}-SPIN`, COLORS[currentPiece.type]);
            }
        }
    }
    
    return linesCleared;
}

// ---- VISUAL QUICKSORT ALGORITHM ----
function* quicksortAlgo(arr, low, high) {
    if (low < high) {
        let pi = yield* partition(arr, low, high);
        yield* quicksortAlgo(arr, low, pi - 1);
        yield* quicksortAlgo(arr, pi + 1, high);
    }
}

function* partition(arr, low, high) {
    let pivot = arr[high];
    let i = low - 1;
    for (let j = low; j <= high - 1; j++) {
        if (arr[j] < pivot) {
            i++;
            if (i !== j) {
                yield {a: i, b: j};
                let temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
            }
        }
    }
    if (i + 1 !== high) {
        yield {a: i + 1, b: high};
        let temp = arr[i + 1]; arr[i + 1] = arr[high]; arr[high] = temp;
    }
    return i + 1;
}

function startVisualSort() {
    let heights = [];
    for (let x = 0; x < COLS; x++) {
        let highestY = ROWS;
        for (let y = 0; y < ROWS; y++) {
            if (board[y][x] !== 0 && highestY === ROWS) highestY = y;
        }
        heights.push(ROWS - highestY);
    }
    sortGenerator = quicksortAlgo(heights, 0, COLS - 1);
    isSorting = true;
    sortStepTimer = 0;
    lastSwap = {a: -1, b: -1};
}

function finishVisualSort() {
    isSorting = false;
    lastSwap = {a: -1, b: -1};
    
    let linesCleared = evaluateLineClears(currentPiece ? currentPiece.color : null, false);
    
    if (linesCleared === 0) {
        sound.playTechnicalSpin(); 
    }

    if (currentPiece) {
        while (currentPiece.collision(0, 0) && currentPiece.y > 0) {
            currentPiece.y--;
        }
        if (currentPiece.collision(0, 0)) {
            triggerTopOut();
        }
    }
    
    createFloatingText("QUICKSORTED!", gameMode === 'livesort' ? "#d946ef" : "#a855f7");
}
// ------------------------------------

function addGarbageLines(count, isClean = false) {
    if (count <= 0 || !sessionActive || isToppingOut) return;
    
    for (let i = 0; i < count; i++) {
        if (board[i].some(c => c !== 0)) {
            triggerTopOut();
            return;
        }
    }
    
    let cleanHole = Math.floor(Math.random() * COLS);
    for (let i = 0; i < count; i++) {
        let hole = isClean ? cleanHole : Math.floor(Math.random() * COLS);
        let newRow = Array(COLS).fill('#475569'); // Gray Cheese
        newRow[hole] = 0;
        board.shift();
        board.push(newRow);
    }
    
    if (currentPiece) {
        while (currentPiece.collision(0, 0) && currentPiece.y > 0) {
            currentPiece.y--;
        }
    }
    triggerShake();
}

function hardDrop() {
    if (!currentPiece) return;
    let d = 0; while(!currentPiece.collision(0, 1)) { currentPiece.y++; d++; }
    score += d * 2; sound.playLock(); triggerShake(); createImpactParticles(currentPiece.x, currentPiece.y - VISIBLE_ROWS, currentPiece.color); lockPiece();
}

function lockPiece() {
    piecesPlaced++;
    let isCompletelyHidden = true;

    currentPiece.matrix.forEach((row, y) => { 
        row.forEach((v, x) => { 
            if (v) { 
                const py = currentPiece.y + y; 
                if (py >= VISIBLE_ROWS) isCompletelyHidden = false; // Reached visible zone
                if (py >= 0 && py < ROWS) board[py][currentPiece.x + x] = currentPiece.color; 
            } 
        }); 
    });

    // Lock Out rule: If the piece locked entirely inside the vanish zone, it's a game over
    if (isCompletelyHidden) {
        if (gameMode === 'zen') {
            board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
            const bc = document.getElementById('boardContainer');
            bc.classList.remove('board-flip'); void bc.offsetWidth; bc.classList.add('board-flip');
            spawnPiece();
        } else {
            triggerTopOut();
        }
        return;
    }

    // Evaluate based on the UPCOMING piece to accurately predict the phantom color
    let nextColor = COLORS[nextQueue[0]];
    let linesCleared = evaluateLineClears(nextColor, false);

    // --- Spike/Cheese Garbage Injection on Piece Lock ---
    if ((gameMode === 'cheese' || gameMode === 'spike') && spikeInjectTimer <= 0 && linesCleared === 0) {
        if (pendingSpikeLines > 0) {
            let isClean = (gameMode === 'cheese'); 
            addGarbageLines(pendingSpikeLines, isClean);
            if (!isToppingOut) sound.playLock();
        }
        
        if (gameMode === 'spike') {
            pendingSpikeLines = 20;
            const intensity = Math.min(1.0, survivalTime / 180000);
            spikeInjectTimer = 30000 - (intensity * 26000); 
        } else {
            pendingSpikeLines = 0;
        }
    }

    spawnPiece();
}

function handleHold() {
    if (!canHold) return;
    
    // Evaluate line clears BEFORE generating the new piece so it cleanly clears lines matching the new color
    let nextColor = holdPiece ? COLORS[holdPiece] : COLORS[nextQueue[0]];
    evaluateLineClears(nextColor, true);
    
    if (holdPiece) { 
        let t = currentPiece.type; 
        currentPiece = new Piece(holdPiece); 
        holdPiece = t; 
    } else { 
        holdPiece = currentPiece.type; 
        spawnPiece(false); 
    }
    canHold = false; lockTimer = 0; dropCounter = 0; lockResetCount = 0;
    if (gameMode === 'zen') saveZenState();
}

function getBoundingBox(matrix) {
    let minX = matrix.length, maxX = 0, minY = matrix.length, maxY = 0;
    matrix.forEach((row, y) => row.forEach((v, x) => {
        if (v) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }));
    return { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function createImpactParticles(x, y, color) {
    for (let i = 0; i < 10; i++) {
        particles.push({ x: (x + Math.random()) * BLOCK_SIZE, y: (y + 1) * BLOCK_SIZE, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 1) * 4, life: 1.0, color: color });
    }
}

function createSpinParticles(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push({ x: (x + 1.5) * BLOCK_SIZE, y: (y + 1.5) * BLOCK_SIZE, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 1.0, color: 'white' });
    }
}

function createFloatingText(text, color) {
    floatingTexts.forEach(t => t.y -= 35);
    floatingTexts.push({ text, color, x: canvas.width / 2, y: canvas.height / 2, life: 1.5 });
}

function triggerShake() {
    const el = document.getElementById('shakeContainer');
    el.classList.remove('shake-effect'); void el.offsetWidth; el.classList.add('shake-effect');
}

function drawBlock(ctx, x, y, color, isGhost = false, pulse = 0) {
    const px = x * BLOCK_SIZE, py = y * BLOCK_SIZE;
    if (isGhost) {
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.4; 
        ctx.strokeRect(px + 2, py + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
        ctx.fillStyle = color; ctx.globalAlpha = 0.1;
        ctx.fillRect(px + 3, py + 3, BLOCK_SIZE - 6, BLOCK_SIZE - 6);
        ctx.globalAlpha = 1.0; return;
    }
    ctx.fillStyle = color; ctx.beginPath();
    ctx.roundRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(px + 4, py + 4, BLOCK_SIZE - 20, 3);
    
    if (pulse > 0) {
        ctx.strokeStyle = 'white'; ctx.lineWidth = 4 * pulse;
        ctx.globalAlpha = pulse; ctx.strokeRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
        ctx.globalAlpha = 1;
    }
}

function drawSideCanvases() {
    const hCtx = document.getElementById('holdCanvas').getContext('2d');
    hCtx.clearRect(0,0,80,80);
    const s = 18;
    if (holdPiece) {
        const matrix = SHAPES[holdPiece];
        const box = getBoundingBox(matrix);
        const offsetX = (80 - (box.w * s)) / 2 - (box.minX * s);
        const offsetY = (80 - (box.h * s)) / 2 - (box.minY * s);
        matrix.forEach((row, y) => row.forEach((v, x) => { 
            if(v) { hCtx.fillStyle = COLORS[holdPiece]; hCtx.beginPath(); hCtx.roundRect(offsetX + x * s, offsetY + y * s, s-2, s-2, 4); hCtx.fill(); } 
        }));
    }
    const nCtx = document.getElementById('nextCanvas').getContext('2d');
    nCtx.clearRect(0,0,80,420);
    nextQueue.slice(0, 6).forEach((type, i) => {
        const matrix = SHAPES[type];
        const box = getBoundingBox(matrix);
        const slotY = 10 + i * 65;
        const offsetX = (80 - (box.w * s)) / 2 - (box.minX * s);
        const offsetY = slotY + (60 - (box.h * s)) / 2 - (box.minY * s);
        matrix.forEach((row, y) => row.forEach((v, x) => { 
            if(v) { nCtx.fillStyle = COLORS[type]; nCtx.beginPath(); nCtx.roundRect(offsetX + x * s, offsetY + y * s, s-2, s-2, 4); nCtx.fill(); } 
        }));
    });
}

function draw(dt) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    
    // Draw visual sorting highlight behind grid
    if (isSorting && lastSwap.a !== -1) {
        ctx.fillStyle = gameMode === 'livesort' ? 'rgba(217, 70, 239, 0.2)' : 'rgba(168, 85, 247, 0.2)'; 
        ctx.fillRect(lastSwap.a * BLOCK_SIZE, 0, BLOCK_SIZE, canvas.height);
        ctx.fillRect(lastSwap.b * BLOCK_SIZE, 0, BLOCK_SIZE, canvas.height);
    }
    
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for(let i=1; i<COLS; i++) { ctx.beginPath(); ctx.moveTo(i*BLOCK_SIZE, 0); ctx.lineTo(i*BLOCK_SIZE, canvas.height); ctx.stroke(); }
    for(let i=1; i<VISIBLE_ROWS; i++) { ctx.beginPath(); ctx.moveTo(0, i*BLOCK_SIZE); ctx.lineTo(canvas.width, i*BLOCK_SIZE); ctx.stroke(); }
    
    board.forEach((row, y) => row.forEach((c, x) => { 
        if (c && y >= VISIBLE_ROWS) {
            // Phantom Mode Overlap Render (Ghostly transparency for same-colored blocks)
            if (gameMode === 'phantom' && currentPiece && c === currentPiece.color && !isToppingOut) {
                ctx.globalAlpha = 0.15;
                drawBlock(ctx, x, y - VISIBLE_ROWS, c, false);
                ctx.globalAlpha = 1.0;
            } else {
                drawBlock(ctx, x, y - VISIBLE_ROWS, c, false); 
            }
        }
    }));
    
    if (currentPiece) {
        let gy = currentPiece.y; 
        if (!isToppingOut && (!isSorting || gameMode === 'livesort')) {
            while(!currentPiece.collision(0, gy - currentPiece.y + 1)) gy++;
        }
        
        if (isToppingOut) {
            ctx.save();
            const box = getBoundingBox(currentPiece.matrix);
            const cx = currentPiece.animX + box.minX + box.w / 2;
            const cy = currentPiece.animY + box.minY + box.h / 2;
            
            ctx.translate(cx * BLOCK_SIZE, (cy - VISIBLE_ROWS) * BLOCK_SIZE);
            ctx.rotate(currentPiece.rotAngle);
            ctx.translate(-cx * BLOCK_SIZE, -(cy - VISIBLE_ROWS) * BLOCK_SIZE);
            
            currentPiece.matrix.forEach((row, y) => row.forEach((v, x) => { 
                if(v) { 
                    drawBlock(ctx, currentPiece.animX+x, currentPiece.animY+y - VISIBLE_ROWS, currentPiece.color, false, 0); 
                } 
            }));
            ctx.restore();
        } else {
            currentPiece.matrix.forEach((row, y) => row.forEach((v, x) => { 
                if(v) { 
                    if ((!isSorting || gameMode === 'livesort') && gy + y >= VISIBLE_ROWS) {
                        drawBlock(ctx, currentPiece.x+x, gy+y - VISIBLE_ROWS, currentPiece.color, true); 
                    }
                    if (currentPiece.y + y >= VISIBLE_ROWS) {
                        drawBlock(ctx, currentPiece.x+x, currentPiece.y+y - VISIBLE_ROWS, currentPiece.color, false, currentPiece.spinPulse); 
                    }
                } 
            }));
        }
    }
    
    const sec = dt / 1000; 
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life -= sec;
        if (p.life <= 0) particles.splice(i, 1);
        else {
            ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life); ctx.beginPath(); 
            ctx.arc(p.x, p.y, Math.max(0, 4 * p.life), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; 
        }
    }
    
    // Draw Spike Alert Warning (For Cheese and Spike Modes)
    if ((gameMode === 'cheese' || gameMode === 'spike') && pendingSpikeLines > 0) {
        if (gameMode === 'cheese') {
            ctx.fillStyle = 'rgba(225, 29, 72, 0.15)'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        ctx.fillStyle = '#f43f5e';
        ctx.font = `bold 24px 'JetBrains Mono'`;
        ctx.textAlign = "center";
        ctx.shadowBlur = 10; ctx.shadowColor = '#f43f5e';
        ctx.fillText(`⚠️ SPIKE: ${pendingSpikeLines}`, canvas.width / 2, 80);
        ctx.shadowBlur = 0;
        
        let intensity = Math.min(1.0, survivalTime / 180000);
        let maxTime = gameMode === 'spike' ? (30000 - (intensity * 26000)) : (5000 - (intensity * 3500)); 
        let pct = Math.max(0, spikeInjectTimer / maxTime);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(30, 100, canvas.width - 60, 8);
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(30, 100, (canvas.width - 60) * pct, 8);
    }
    
    // Draw Quicksort progress bar
    if (gameMode === 'quicksort') {
        let pct = Math.max(0, sortTimer / 10000);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(30, 100, canvas.width - 60, 8);
        ctx.fillStyle = '#a855f7'; 
        ctx.fillRect(30, 100, (canvas.width - 60) * pct, 8);
        
        if (sortTimer > 7000 && !isToppingOut && !isSorting) { 
            ctx.fillStyle = '#a855f7';
            ctx.font = `bold 24px 'JetBrains Mono'`;
            ctx.textAlign = "center";
            ctx.shadowBlur = 10; ctx.shadowColor = '#a855f7';
            let timeLeft = Math.ceil((10000 - sortTimer) / 1000);
            ctx.fillText(`SORT IN: ${timeLeft}`, canvas.width / 2, 80);
            ctx.shadowBlur = 0;
        }
    }
    // Draw Live Sort progress bar
    if (gameMode === 'livesort') {
        let pct = Math.max(0, sortTimer / 1000);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(30, 100, canvas.width - 60, 8);
        ctx.fillStyle = '#d946ef'; // Fuchsia
        ctx.fillRect(30, 100, (canvas.width - 60) * pct, 8);
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let t = floatingTexts[i];
        t.y -= 25 * sec; 
        t.life -= sec;   
        if (t.life <= 0) floatingTexts.splice(i, 1);
        else {
            ctx.fillStyle = t.color; ctx.font = `bold 28px 'JetBrains Mono'`; 
            ctx.textAlign = "center"; 
            ctx.globalAlpha = Math.max(0, t.life / 1.5); 
            ctx.shadowBlur = 10; ctx.shadowColor = t.color; 
            ctx.fillText(t.text, t.x, t.y); ctx.shadowBlur = 0; ctx.globalAlpha = 1; 
        }
    }
    
    document.getElementById('scoreLabel').innerText = score;
    const comboEl = document.getElementById('comboContainer');
    if (combo >= 0) { comboEl.style.opacity = '1'; document.getElementById('comboLabel').innerText = (combo + 1) + 'x'; }
    else comboEl.style.opacity = '0';
    
    const b2bEl = document.getElementById('b2bContainer');
    if (b2bActive && b2bCount > 1) { 
        b2bEl.style.opacity = '1'; document.getElementById('b2bLabel').innerText = 'x' + b2bCount; 
    } else { 
        b2bEl.style.opacity = '0'; 
    }
    
    if (piecesPlaced > 0 && sessionStartTime > 0) {
        const elapsed = (performance.now() - sessionStartTime) / 1000;
        document.getElementById('ppsLabel').innerText = (piecesPlaced / elapsed).toFixed(2);
    }
    
    drawSideCanvases();
}

function handleInput(dt) {
    if (dcdTimer > 0) { dcdTimer -= dt; return; }
    if (lastMoveKey) {
        dasTimer += dt;
        if (dasTimer >= config.das) {
            arrTimer += dt;
            const dir = lastMoveKey === 'ArrowLeft' ? -1 : 1;
            if (config.arr === 0) { 
                let moved = false;
                while(!currentPiece.collision(dir, 0)) { currentPiece.x += dir; moved = true; } 
                if (moved && currentPiece.collision(0, 1) && lockResetCount < 15) { lockTimer = 0; lockResetCount++; }
            }
            else if (arrTimer >= config.arr) { 
                if (!currentPiece.collision(dir, 0)) { 
                    currentPiece.x += dir; 
                    if (currentPiece.collision(0, 1) && lockResetCount < 15) { lockTimer = 0; lockResetCount++; }
                } 
                arrTimer = 0; 
            }
        }
    }
    if (keysDown['ArrowDown']) {
        let moved = false; while(!currentPiece.collision(0, 1)) { currentPiece.y++; score += 1; moved = true; }
        if (moved) { sound.playDropTick(); lockTimer = 0; } 
    }
}

window.onkeydown = (e) => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].indexOf(e.code) > -1) { e.preventDefault(); }
    if (e.key === 'p' && sessionActive && (gameMode === 'livesort' || !isSorting)) togglePause();
    if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); undoZen(); return; }
    if (e.ctrlKey && e.code === 'KeyY') { e.preventDefault(); redoZen(); return; }
    if (e.code === 'KeyR' && !isPaused && (!document.getElementById('resultMenu').classList.contains('hidden') || sessionActive)) {
        triggerRestart(); return;
    }
    
    if (!sessionActive || isPaused || isToppingOut || (isSorting && gameMode === 'quicksort')) return;

    if (!keysDown[e.code]) {
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { 
            lastMoveKey = e.code; dasTimer = 0; arrTimer = 0; 
            const dir = e.code === 'ArrowLeft' ? -1 : 1; 
            if (!currentPiece.collision(dir, 0)) { 
                currentPiece.x += dir; 
                if (currentPiece.collision(0, 1) && lockResetCount < 15) { lockTimer = 0; lockResetCount++; }
            } 
        }
        if (e.code === 'Space' && !hardDropLocked) { e.preventDefault(); hardDropLocked = true; hardDrop(); }
    }
    keysDown[e.code] = true;
    
    if (e.code === 'ArrowUp' || e.code === 'KeyX') currentPiece.rotate(1);
    if (e.code === 'KeyZ') currentPiece.rotate(-1);
    if (e.code === 'KeyA') currentPiece.rotate(0); 
    if (e.code === 'KeyC') handleHold();
};

window.onkeyup = (e) => {
    keysDown[e.code] = false;
    if (e.code === lastMoveKey) lastMoveKey = null;
    if (e.code === 'Space') hardDropLocked = false;
};

function loop(time = 0) {
    if (!sessionActive || isPaused) return;
    let dt = time - lastTime; 
    if (dt > 100) dt = 16; 
    lastTime = time;
    
    // VISUAL SORTING ANIMATION LOOP (Concurrent)
    if (isSorting) {
        sortStepTimer += dt;
        let stepSpeed = gameMode === 'livesort' ? 50 : 100; // Live sort steps faster so it finishes within 1s
        if (sortStepTimer >= stepSpeed) { 
            sortStepTimer -= stepSpeed;
            let result = sortGenerator.next();
            if (!result.done) {
                let {a, b} = result.value;
                lastSwap = {a, b};
                for(let y = 0; y < ROWS; y++) {
                    let temp = board[y][a];
                    board[y][a] = board[y][b];
                    board[y][b] = temp;
                }
                sound.playDropTick(); 
                
                // Safety kick for live sorting overlaps
                if (currentPiece && gameMode === 'livesort') {
                    while(currentPiece.collision(0,0) && currentPiece.y > 0) {
                        currentPiece.y--;
                    }
                    if (currentPiece.collision(0,0)) triggerTopOut();
                }
            } else {
                finishVisualSort();
            }
        }
        
        // Quicksort mode completely freezes gravity and input
        if (gameMode === 'quicksort') {
            draw(dt);
            requestAnimationFrame(loop);
            return; 
        }
    }

    // TOP OUT KINETIC ANIMATION LOOP
    if (isToppingOut) {
        if (currentPiece) {
            currentPiece.vy += (dt / 1000) * 45; // Gravity
            currentPiece.animX += currentPiece.vx * (dt / 1000);
            currentPiece.animY += currentPiece.vy * (dt / 1000);
            currentPiece.rotAngle += currentPiece.vRot * (dt / 1000);
            
            // Once the piece falls completely off the screen
            if (currentPiece.animY > ROWS + 5) {
                isToppingOut = false;
                endGame();
                return;
            }
        } else {
            isToppingOut = false;
            endGame();
            return;
        }
        draw(dt);
        requestAnimationFrame(loop);
        return;
    }
    
    if (currentPiece && currentPiece.spinPulse > 0) currentPiece.spinPulse -= dt/180;
    
    handleInput(dt);
    
    dropCounter += dt;
    const gravity = 1000 * Math.pow(0.85, level-1);
    if (dropCounter > gravity) { 
        if (!currentPiece.collision(0, 1)) { currentPiece.y++; } 
        else { lockTimer += dt; if (lockTimer > config.lockDelay) { lockPiece(); } } 
        dropCounter = 0; 
    }
    else if (currentPiece && currentPiece.collision(0, 1)) { 
        lockTimer += dt; if (lockTimer > config.lockDelay) { lockPiece(); } 
    }

    // --- Standard Sprint / Sorting Timer Logic ---
    if (gameMode !== 'zen' && gameMode !== 'cheese' && gameMode !== 'spike') {
        timeRemaining -= dt / 1000;
        if (timeRemaining <= 0) {
            timeRemaining = 0;
            updateTimerDisplay();
            endGame();
            return;
        }
    }
    
    // --- Cheese Timer Logic ---
    if (gameMode === 'cheese') {
        survivalTime += dt;
        cheeseTimer += dt;
        spikeRollTimer += dt;
        
        const intensity = Math.min(1.0, survivalTime / 180000); // Scales linearly up to 3 minutes
        
        const currentCheeseInterval = 3000 - (intensity * 1500); // 3s -> 1.5s
        const currentSpikeInterval = 5000 - (intensity * 2000);  // 5s -> 3.0s
        const currentCheeseProb = 0.30 + (intensity * 0.50);     // 30% -> 80%
        const currentSpikeProb = 0.40 + (intensity * 0.10);      // 40% -> 50%

        if (cheeseTimer >= currentCheeseInterval) {
            cheeseTimer -= currentCheeseInterval;
            if (Math.random() < currentCheeseProb && combo === -1) addGarbageLines(1, false);
        }
        
        if (spikeRollTimer >= currentSpikeInterval) {
            spikeRollTimer -= currentSpikeInterval;
            if (pendingSpikeLines === 0 && Math.random() < currentSpikeProb) {
                pendingSpikeLines = Math.floor(Math.random() * 3) + 4; 
                spikeInjectTimer = 5000 - (intensity * 3500); 
                sound.playB2B(); 
            }
        }
        
        if (pendingSpikeLines > 0 && spikeInjectTimer > 0) {
            spikeInjectTimer -= dt;
            if (spikeInjectTimer <= 0) spikeInjectTimer = 0; 
        }
        
        updateTimerDisplay();
    }
    // --- Spike Mode Logic ---
    else if (gameMode === 'spike') {
        survivalTime += dt;
        
        if (spikeInjectTimer > 0) {
            spikeInjectTimer -= dt;
            if (spikeInjectTimer <= 0) spikeInjectTimer = 0; 
        }
        
        updateTimerDisplay();
    }
    // --- Quicksort Mode Logic ---
    else if (gameMode === 'quicksort') {
        if (!isSorting) {
            sortTimer += dt;
            if (sortTimer >= 10000 && !isToppingOut) {
                sortTimer -= 10000;
                startVisualSort();
            }
        }
        updateTimerDisplay();
    }
    // --- Live Sort Mode Logic ---
    else if (gameMode === 'livesort') {
        if (!isSorting) {
            sortTimer += dt;
            if (sortTimer >= 1000 && !isToppingOut) {
                sortTimer -= 1000;
                startVisualSort();
            }
        }
        updateTimerDisplay();
    }
    // Updates timer for Sprint/Phantom
    else if (gameMode !== 'zen') {
        updateTimerDisplay();
    }
    
    draw(dt); 
    requestAnimationFrame(loop);
}

function togglePause() {
    if (!sessionActive && document.getElementById('pauseMenu').classList.contains('hidden')) return;
    isPaused = !isPaused; 
    const pm = document.getElementById('pauseMenu');
    if (!isPaused) { 
        pm.classList.add('hidden'); 
        document.getElementById('boardContainer').classList.remove('blur-sm');
        lastTime = performance.now(); 
        requestAnimationFrame(loop); 
    } else { 
        pm.classList.remove('hidden'); 
        document.getElementById('boardContainer').classList.add('blur-sm');
    }
}

function saveSettings() {
    config.das = parseInt(document.getElementById('dasInput').value) || 167;
    config.arr = parseInt(document.getElementById('arrInput').value) || 33;
    config.dcd = parseInt(document.getElementById('dcdInput').value) || 33;
    document.getElementById('settingsModal').classList.add('hidden');
}
