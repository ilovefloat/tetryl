/**
 * TETRYL - COMPETITIVE ENGINE
 * Features: DAS/ARR/SDS, T-Spins, Combos, B2B, 
 * Blocking/Canceling, Visual Quicksort, Phantom Mode, Zen Undo.
 */

const COLS = 10, ROWS = 40, VISIBLE_ROWS = 20, BLOCK_SIZE = 30;
const canvas = document.getElementById('tetrylCanvas');
const ctx = canvas.getContext('2d');

// --- Game State ---
let board = [], currentPiece, nextQueue = [], holdPiece, canHold;
let score = 0, lines = 0, level = 1, combo = -1, b2bActive = false, b2bCount = 0;
let gameMode = 'zen', timeRemaining = 0, sessionActive = false, isPaused = false;
let sessionStartTime = 0, piecesPlaced = 0;
let lastTime = 0, dropCounter = 0, lockTimer = 0;
let particles = [], floatingTexts = [];
let countdownTimeouts = [];
let isToppingOut = false; 

// --- Competitive/Cheese State ---
let pendingGarbage = 0; // The "Red Bar" Queue
let lastGarbageHole = Math.floor(Math.random() * COLS);
let survivalTime = 0, cheeseTimer = 0, spikeRollTimer = 0;
let spikeInjectTimer = 0; // Timer for the "Queue" to force-inject

// --- Visual Sorting State ---
let isSorting = false;
let sortGenerator = null;
let sortStepTimer = 0;
let lastSwap = {a: -1, b: -1};

// --- Zen Mode History ---
let zenHistoryUndo = [];
let zenHistoryRedo = [];

// --- Config & Handling ---
let savedSettings = {};
try {
    const cache = localStorage.getItem('tetryl_config');
    if (cache) savedSettings = JSON.parse(cache);
} catch (e) { console.error("Could not load settings:", e); }

const config = { 
    das: savedSettings.das !== undefined ? savedSettings.das : 167, 
    arr: savedSettings.arr !== undefined ? savedSettings.arr : 33, 
    dcd: savedSettings.dcd !== undefined ? savedSettings.dcd : 33, 
    sds: savedSettings.sds !== undefined ? savedSettings.sds : 0, 
    lockDelay: 400 
};

window.addEventListener('load', () => {
    if (document.getElementById('dasInput')) document.getElementById('dasInput').value = config.das;
    if (document.getElementById('arrInput')) document.getElementById('arrInput').value = config.arr;
    if (document.getElementById('sdsInput')) document.getElementById('sdsInput').value = config.sds;
});

let dasTimer = 0, arrTimer = 0, dcdTimer = 0, sdsTimer = 0, keysDown = {}, lastMoveKey = null;
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

// Standard SRS-lite Kick Data
const KICK_DATA = {
    standard: {
        '0-1': [[0,0], [-1,0], [-1,1], [0,-2], [-1,-2]], '1-0': [[0,0], [1,0], [1,-1], [0,2], [1,2]],
        '1-2': [[0,0], [1,0], [1,-1], [0,2], [1,2]], '2-1': [[0,0], [-1,0], [-1,1], [0,-2], [-1,-2]],
        '2-3': [[0,0], [1,0], [1,1], [0,-2], [1,-2]], '3-2': [[0,0], [-1,0], [-1,-1], [0,2], [-1,2]],
        '3-0': [[0,0], [-1,0], [-1,-1], [0,2], [-1,2]], '0-3': [[0,0], [1,0], [1,1], [0,-2], [1,-2]]
    },
    I: {
        '0-1': [[0,0], [-2,0], [1,0], [-2,-1], [1,2]], '1-0': [[0,0], [2,0], [-1,0], [2,1], [-1,-2]],
        '1-2': [[0,0], [-1,0], [2,0], [-1,2], [2,-1]], '2-1': [[0,0], [1,0], [-2,0], [1,-2], [-2,1]]
    }
};

// --- Audio System ---
const sound = {
    initialized: false,
    init() {
        if (this.initialized) return;
        this.synth = new Tone.PolySynth(Tone.Synth).toDestination();
        this.synth.set({ oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.05, release: 0.1 } });
        this.synth.volume.value = -12;
        this.noise = new Tone.NoiseSynth({ envelope: { decay: 0.05 } }).toDestination();
        this.noise.volume.value = -18;
        this.initialized = true;
    },
    playMove() { },
    playSpinTick() { if(this.initialized) this.synth.triggerAttackRelease("E5", "128n", undefined, 0.2); },
    playLock() { if(this.initialized) this.noise.triggerAttackRelease("32n"); },
    playClear(lines, isSpin) {
        if(!this.initialized) return;
        const notes = ["C4", "E4", "G4", "B4"];
        this.synth.triggerAttackRelease(isSpin ? "C5" : notes[Math.min(lines-1, 3)], "16n");
    },
    playCombo(c) { if(this.initialized) this.synth.triggerAttackRelease(Tone.Frequency("C4").transpose(c), "32n"); },
    playB2B() { if(this.initialized) this.synth.triggerAttackRelease("F5", "16n", undefined, 0.4); },
    playReady() { if(this.initialized) this.synth.triggerAttackRelease("C5", "8n"); },
    playGo() { if(this.initialized) this.synth.triggerAttackRelease("C6", "4n"); }
};

// --- Attack Table (Competitive Standards) ---
function calculateAttack(linesCleared, isTechnical, spinType, comboCount, b2bActive) {
    let attack = 0;
    if (isTechnical) {
        attack = (spinType === "MINI") ? linesCleared : linesCleared * 2;
    } else {
        if (linesCleared === 2) attack = 1;
        else if (linesCleared === 3) attack = 2;
        else if (linesCleared === 4) attack = 4;
    }
    if (b2bActive && attack > 0) attack += 1;
    if (comboCount > 0) attack += Math.floor((comboCount + 1) / 2);
    return attack;
}

// --- Piece Class ---
class Piece {
    constructor(type) {
        this.type = type;
        this.matrix = JSON.parse(JSON.stringify(SHAPES[type]));
        this.color = COLORS[type];
        this.x = (type === 'O') ? 4 : 3;
        this.y = (type === 'I') ? 19 : 20; 
        this.rotation = 0;
        this.isTechnicalSpin = false;
        this.spinType = "";
        this.spinPulse = 0;
    }

    collision(ox, oy, matrix = this.matrix) {
        for (let y = 0; y < matrix.length; y++) {
            for (let x = 0; x < matrix[y].length; x++) {
                if (matrix[y][x]) {
                    let nx = this.x + x + ox;
                    let ny = this.y + y + oy;
                    if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
                    if (ny >= 0 && board[ny][nx]) {
                        if (gameMode === 'phantom' && board[ny][nx] === this.color) continue;
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
                else newM[size - 1 - x][y] = this.matrix[y][x];
            }
        }
        const prevRot = this.rotation;
        const nextRot = (prevRot + (dir === 1 ? 1 : 3)) % 4;
        const lookup = `${prevRot}-${nextRot}`;
        const kicks = (this.type === 'I') ? KICK_DATA.I[lookup] : KICK_DATA.standard[lookup];

        if (kicks) {
            for (let [kx, ky] of kicks) {
                if (!this.collision(kx, -ky, newM)) {
                    this.x += kx; this.y -= ky; this.matrix = newM; this.rotation = nextRot;
                    // T-Spin Logic (Simplified 3-corner)
                    if (this.type === 'T') {
                        this.isTechnicalSpin = true; this.spinType = "NORMAL"; this.spinPulse = 1.0;
                        sound.playSpinTick();
                    }
                    return true;
                }
            }
        }
        return false;
    }
}

// --- Core Game Functions ---
function startGame(mode) {
    sound.init(); Tone.start();
    gameMode = mode;
    isToppingOut = false;
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    score = 0; lines = 0; level = 1; combo = -1; b2bActive = false; b2bCount = 0;
    piecesPlaced = 0; survivalTime = 0; pendingGarbage = 0;
    particles = []; floatingTexts = [];
    nextQueue = []; holdPiece = null; canHold = true;
    
    document.getElementById('mainMenu').classList.add('hidden');
    document.getElementById('resultMenu').classList.add('hidden');
    document.getElementById('boardContainer').classList.remove('blur-sm');
    
    while (nextQueue.length < 14) fillBag();
    updateGarbageMeter();
    startCountdown();
}

function fillBag() {
    const bag = Object.keys(SHAPES).sort(() => Math.random() - 0.5);
    nextQueue.push(...bag);
}

function spawnPiece(recordState = true) {
    if (nextQueue.length < 7) fillBag();
    currentPiece = new Piece(nextQueue.shift());
    if (currentPiece.collision(0, 0)) currentPiece.y--;
    
    if (recordState && gameMode === 'zen') saveZenState();
    if (currentPiece.collision(0, 0)) triggerTopOut();
    
    canHold = true; dcdTimer = config.dcd; lockResetCount = 0; lockTimer = 0;
}

function evaluateLineClears(isFromHold) {
    let linesCleared = 0;
    let phantomColor = (gameMode === 'phantom' && currentPiece) ? currentPiece.color : null;

    for (let y = ROWS - 1; y >= 0; y--) {
        if (board[y].every(c => c !== 0 && c !== phantomColor)) {
            board.splice(y, 1);
            board.unshift(Array(COLS).fill(0));
            linesCleared++; y++;
        }
    }

    if (linesCleared > 0) {
        lines += linesCleared;
        combo++;
        const isTechnical = currentPiece?.isTechnicalSpin && !isFromHold;
        const isDifficult = (linesCleared >= 4) || isTechnical;

        if (isDifficult) {
            if (b2bActive) b2bCount++;
            b2bActive = true;
        } else { b2bActive = false; b2bCount = 0; }

        let attack = calculateAttack(linesCleared, isTechnical, currentPiece?.spinType, combo, b2bActive);
        
        // CANCELING LOGIC
        if (pendingGarbage > 0) {
            let cancel = Math.min(attack, pendingGarbage);
            pendingGarbage -= cancel;
            attack -= cancel;
            if (cancel > 0) createFloatingText(`-${cancel} CANCEL`, "#38bdf8");
        }

        score += (attack + linesCleared) * 100;
        sound.playClear(linesCleared, isTechnical);
        if (combo > 0) sound.playCombo(combo);
        
        updateGarbageMeter();
        triggerShake();
        return attack;
    }
    combo = -1;
    return 0;
}

function lockPiece() {
    if (isToppingOut) return;
    piecesPlaced++;
    currentPiece.matrix.forEach((row, y) => {
        row.forEach((v, x) => {
            if (v) {
                const py = currentPiece.y + y;
                if (py >= 0 && py < ROWS) board[py][currentPiece.x + x] = currentPiece.color;
            }
        });
    });

    let attackGenerated = evaluateLineClears(false);

    // BLOCKING RULE: Garbage only enters if no lines were cleared
    if (attackGenerated === 0 && pendingGarbage > 0) {
        addGarbageLines(pendingGarbage, gameMode === 'cheese');
        pendingGarbage = 0;
        updateGarbageMeter();
    }

    spawnPiece();
}

function addGarbageLines(count, isClean) {
    for (let i = 0; i < count; i++) {
        // Hole Persistence for Downstacking
        if (Math.random() < 0.1 || !isClean) {
            lastGarbageHole = Math.floor(Math.random() * COLS);
        }
        let newRow = Array(COLS).fill('#475569');
        newRow[lastGarbageHole] = 0;
        
        if (board[0].some(c => c !== 0)) { triggerTopOut(); return; }
        board.shift();
        board.push(newRow);
    }
    triggerShake();
    sound.playLock();
}

function updateGarbageMeter() {
    const meter = document.getElementById('garbageMeter');
    if (meter) {
        meter.style.height = `${pendingGarbage * BLOCK_SIZE}px`;
        meter.style.opacity = pendingGarbage > 0 ? "1" : "0";
    }
}

// --- Visual Sorting (Quicksort) ---
function* quicksortAlgo(arr, low, high) {
    if (low < high) {
        let pi = yield* partition(arr, low, high);
        yield* quicksortAlgo(arr, low, pi - 1);
        yield* quicksortAlgo(arr, pi + 1, high);
    }
}

function* partition(arr, low, high) {
    let pivot = arr[high], i = low - 1;
    for (let j = low; j <= high - 1; j++) {
        if (arr[j] < pivot) {
            i++; 
            yield {a: i, b: j};
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
    yield {a: i + 1, b: high};
    [arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
    return i + 1;
}

function startVisualSort() {
    let heights = [];
    for (let x = 0; x < COLS; x++) {
        let h = 0;
        for (let y = 0; y < ROWS; y++) { if(board[y][x]) { h = ROWS - y; break; } }
        heights.push(h);
    }
    sortGenerator = quicksortAlgo(heights, 0, COLS - 1);
    isSorting = true;
}

// --- Logic Loops ---
function loop(time = 0) {
    if (!sessionActive || isPaused) return;
    let dt = time - lastTime;
    if (dt > 100) dt = 16;
    lastTime = time;

    // Sorting Logic
    if (isSorting) {
        sortStepTimer += dt;
        if (sortStepTimer > 100) {
            sortStepTimer = 0;
            let res = sortGenerator.next();
            if (res.done) { isSorting = false; evaluateLineClears(false); }
            else {
                let {a, b} = res.value; lastSwap = {a, b};
                for(let y=0; y<ROWS; y++) [board[y][a], board[y][b]] = [board[y][b], board[y][a]];
                sound.playLock();
            }
        }
    }

    // Gravity
    if (!isSorting) {
        dropCounter += dt;
        let gravity = 1000 * Math.pow(0.9, level - 1);
        if (dropCounter > gravity) {
            if (!currentPiece.collision(0, 1)) currentPiece.y++;
            else { lockTimer += dt; if(lockTimer > config.lockDelay) lockPiece(); }
            dropCounter = 0;
        } else if (currentPiece.collision(0, 1)) {
            lockTimer += dt; if(lockTimer > config.lockDelay) lockPiece();
        }
    }

    // Modes Logic
    if (gameMode === 'cheese' || gameMode === 'spike') {
        survivalTime += dt; cheeseTimer += dt;
        const intensity = Math.min(1.0, survivalTime / 180000);
        const interval = 3000 - (intensity * 1500);
        
        if (cheeseTimer > interval) {
            cheeseTimer = 0;
            let incoming = (gameMode === 'spike' && Math.random() < 0.3) ? 4 : 1;
            pendingGarbage += incoming;
            updateGarbageMeter();
        }
    }

    if (gameMode === 'quicksort') {
        sortStepTimer += dt;
        if (sortStepTimer > 10000 && !isSorting) { sortStepTimer = 0; startVisualSort(); }
    }

    handleInput(dt);
    if(currentPiece && currentPiece.spinPulse > 0) currentPiece.spinPulse -= dt/500;
    
    draw(dt);
    requestAnimationFrame(loop);
}

// --- Input Handling ---
function handleInput(dt) {
    if (lastMoveKey) {
        dasTimer += dt;
        if (dasTimer >= config.das) {
            arrTimer += dt;
            if (arrTimer >= config.arr) {
                let dir = lastMoveKey === 'ArrowLeft' ? -1 : 1;
                if (!currentPiece.collision(dir, 0)) currentPiece.x += dir;
                arrTimer = 0;
            }
        }
    }
    if (keysDown['ArrowDown']) {
        sdsTimer += dt;
        if (sdsTimer >= config.sds) {
            if (!currentPiece.collision(0, 1)) { currentPiece.y++; score++; }
            sdsTimer = 0;
        }
    }
}

window.onkeydown = (e) => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyP') togglePause();
    if (!sessionActive || isPaused || isSorting) return;

    if (!keysDown[e.code]) {
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
            lastMoveKey = e.code; dasTimer = 0; arrTimer = 0;
            let dir = e.code === 'ArrowLeft' ? -1 : 1;
            if (!currentPiece.collision(dir, 0)) currentPiece.x += dir;
        }
        if (e.code === 'Space') { while(!currentPiece.collision(0, 1)) currentPiece.y++; lockPiece(); }
        if (e.code === 'ArrowUp' || e.code === 'KeyX') currentPiece.rotate(1);
        if (e.code === 'KeyZ') currentPiece.rotate(-1);
        if (e.code === 'KeyC') handleHold();
    }
    keysDown[e.code] = true;
};

window.onkeyup = (e) => {
    keysDown[e.code] = false;
    if (e.code === lastMoveKey) lastMoveKey = null;
};

// --- Drawing ---
function draw(dt) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    
    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for(let i=0; i<=COLS; i++) { ctx.beginPath(); ctx.moveTo(i*BLOCK_SIZE, 0); ctx.lineTo(i*BLOCK_SIZE, canvas.height); ctx.stroke(); }

    // Board
    board.forEach((row, y) => row.forEach((c, x) => {
        if (c && y >= VISIBLE_ROWS) drawBlock(x, y - VISIBLE_ROWS, c);
    }));

    // Piece
    if (currentPiece) {
        let gy = currentPiece.y;
        while(!currentPiece.collision(0, gy - currentPiece.y + 1)) gy++;
        
        currentPiece.matrix.forEach((row, y) => row.forEach((v, x) => {
            if (v) {
                if (gy + y >= VISIBLE_ROWS) drawBlock(currentPiece.x + x, gy + y - VISIBLE_ROWS, currentPiece.color, true);
                if (currentPiece.y + y >= VISIBLE_ROWS) drawBlock(currentPiece.x + x, currentPiece.y + y - VISIBLE_ROWS, currentPiece.color, false, currentPiece.spinPulse);
            }
        }));
    }

    // UI Updates
    document.getElementById('scoreLabel').innerText = score;
    document.getElementById('ppsLabel').innerText = (piecesPlaced / ((performance.now() - sessionStartTime)/1000)).toFixed(2);
    updateTimerDisplay();
    drawSideCanvases();
}

function drawBlock(x, y, color, isGhost = false, pulse = 0) {
    ctx.save();
    ctx.translate(x * BLOCK_SIZE, y * BLOCK_SIZE);
    if (isGhost) {
        ctx.globalAlpha = 0.2; ctx.strokeStyle = color; ctx.strokeRect(2, 2, BLOCK_SIZE-4, BLOCK_SIZE-4);
    } else {
        ctx.fillStyle = color;
        ctx.fillRect(1, 1, BLOCK_SIZE-2, BLOCK_SIZE-2);
        if (pulse > 0) {
            ctx.globalAlpha = pulse; ctx.strokeStyle = 'white'; ctx.lineWidth = 3;
            ctx.strokeRect(1, 1, BLOCK_SIZE-2, BLOCK_SIZE-2);
        }
    }
    ctx.restore();
}

// --- UI & Helpers ---
function updateTimerDisplay() {
    let ms = (gameMode === 'cheese' || gameMode === 'spike') ? survivalTime : timeRemaining * 1000;
    let sec = Math.floor(ms / 1000);
    document.getElementById('timerLabel').innerText = `${Math.floor(sec/60)}:${(sec%60).toString().padStart(2,'0')}`;
}

function startCountdown() {
    const ct = document.getElementById('countdownText');
    const cd = document.getElementById('countdownOverlay');
    cd.classList.remove('hidden');
    ct.innerText = "3"; ct.style.opacity = 1;
    
    setTimeout(() => {
        ct.innerText = "GO!";
        sound.playGo();
        setTimeout(() => {
            cd.classList.add('hidden');
            sessionActive = true; sessionStartTime = performance.now(); spawnPiece();
        }, 500);
    }, 1000);
}

function triggerTopOut() {
    isToppingOut = true; sessionActive = false;
    sound.playLock();
    document.getElementById('resultMenu').classList.remove('hidden');
}

function handleHold() {
    if (!canHold) return;
    if (holdPiece) { [currentPiece.type, holdPiece] = [holdPiece, currentPiece.type]; currentPiece = new Piece(currentPiece.type); }
    else { holdPiece = currentPiece.type; spawnPiece(false); }
    canHold = false;
}

function saveZenState() {
    zenHistoryUndo.push({ board: board.map(r => [...r]), score, combo, b2bActive });
}

function drawSideCanvases() {
    // Logic for next/hold preview...
}

function triggerShake() {
    const el = document.getElementById('shakeContainer');
    el.classList.add('shake-effect');
    setTimeout(() => el.classList.remove('shake-effect'), 100);
}

function createFloatingText(text, color) {
    floatingTexts.push({ text, color, y: 100, life: 1.0 });
}

function togglePause() { isPaused = !isPaused; document.getElementById('pauseMenu').classList.toggle('hidden'); }
function saveSettings() {
    config.das = parseInt(document.getElementById('dasInput').value);
    localStorage.setItem('tetryl_config', JSON.stringify(config));
    document.getElementById('settingsModal').classList.add('hidden');
}
