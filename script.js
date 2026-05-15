const COLS = 10, ROWS = 40, VISIBLE_ROWS = 20, BLOCK_SIZE = 30;
const canvas = document.getElementById('tetrylCanvas');
const ctx = canvas.getContext('2d');

let board = [], currentPiece, nextQueue = [], holdPiece, canHold;
let score = 0, lines = 0, level = 1, combo = -1, b2bActive = false, b2bCount = 0;
let gameMode = 'zen', timeRemaining = 0, sessionActive = false, isPaused = false;
let sessionStartTime = 0, piecesPlaced = 0, lastTime = 0, dropCounter = 0, lockTimer = 0;
let particles = [], floatingTexts = [], countdownTimeouts = [], isToppingOut = false; 

// Competitive Logic Variables
let pendingGarbage = 0; 
let lastGarbageHole = Math.floor(Math.random() * COLS);
let survivalTime = 0, cheeseTimer = 0, spikeRollTimer = 0, spikeInjectTimer = 0;

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

// --- Config & Sound Initialization ---
const config = { das: 167, arr: 33, dcd: 33, sds: 0, lockDelay: 400 };
const sound = {
    initialized: false,
    init() {
        if (this.initialized) return;
        this.synth = new Tone.PolySynth(Tone.Synth).toDestination();
        this.synth.set({ oscillator: { type: "triangle" }, envelope: { attack: 0.005, release: 0.1 } });
        this.noise = new Tone.NoiseSynth({ envelope: { decay: 0.05 } }).toDestination();
        this.initialized = true;
    },
    playClear(l, isSpin) { if(this.initialized) this.synth.triggerAttackRelease(isSpin ? "C5" : "G4", "16n"); },
    playLock() { if(this.initialized) this.noise.triggerAttackRelease("32n"); }
};

// --- Competitive Logic Functions ---

function updateGarbageMeter() {
    const meter = document.getElementById('garbageMeter');
    if (meter) {
        meter.style.height = `${pendingGarbage * BLOCK_SIZE}px`;
        meter.style.opacity = pendingGarbage > 0 ? "1" : "0";
    }
}

function calculateAttack(l, isSpin, combo, b2b) {
    let attack = 0;
    if (isSpin) attack = l * 2;
    else if (l === 2) attack = 1;
    else if (l === 3) attack = 2;
    else if (l === 4) attack = 4;
    
    if (b2b && attack > 0) attack += 1;
    if (combo > 0) attack += Math.floor((combo + 1) / 2);
    return attack;
}

function evaluateLineClears() {
    let linesCleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
        if (board[y].every(cell => cell !== 0)) {
            board.splice(y, 1);
            board.unshift(Array(COLS).fill(0));
            linesCleared++; y++;
        }
    }

    if (linesCleared > 0) {
        lines += linesCleared;
        combo++;
        const isSpin = currentPiece?.isTechnicalSpin;
        let attack = calculateAttack(linesCleared, isSpin, combo, b2bActive);
        
        // CANCELING (Deleting the red bar)
        if (pendingGarbage > 0) {
            let cancel = Math.min(attack, pendingGarbage);
            pendingGarbage -= cancel;
            attack -= cancel;
            if (cancel > 0) createFloatingText(`-${cancel} CANCEL`, "#38bdf8");
        }
        
        b2bActive = (linesCleared === 4 || isSpin);
        score += (attack + linesCleared) * 100;
        sound.playClear(linesCleared, isSpin);
        updateGarbageMeter();
        return attack;
    }
    combo = -1;
    return 0;
}

function addGarbageLines(count, isClean) {
    for (let i = 0; i < count; i++) {
        if (Math.random() < 0.1 || !isClean) lastGarbageHole = Math.floor(Math.random() * COLS);
        let newRow = Array(COLS).fill('#475569');
        newRow[lastGarbageHole] = 0;
        if (board[0].some(c => c !== 0)) { triggerTopOut(); return; }
        board.shift(); board.push(newRow);
    }
    sound.playLock();
    updateGarbageMeter();
}

function lockPiece() {
    currentPiece.matrix.forEach((row, y) => {
        row.forEach((v, x) => {
            if (v) {
                const py = currentPiece.y + y;
                if (py >= 0 && py < ROWS) board[py][currentPiece.x + x] = currentPiece.color;
            }
        });
    });

    let attack = evaluateLineClears();

    // BLOCKING RULE: Garbage only enters if you didn't clear a line
    if (attack === 0 && pendingGarbage > 0) {
        addGarbageLines(pendingGarbage, gameMode === 'cheese');
        pendingGarbage = 0;
        updateGarbageMeter();
    }
    spawnPiece();
}

// --- Standard Loop & Draw ---

function loop(time = 0) {
    if (!sessionActive || isPaused) return;
    let dt = time - lastTime;
    lastTime = time;

    dropCounter += dt;
    if (dropCounter > 1000) {
        if (!currentPiece.collision(0, 1)) currentPiece.y++;
        else lockPiece();
        dropCounter = 0;
    }

    if (gameMode === 'cheese' || gameMode === 'spike') {
        survivalTime += dt;
        cheeseTimer += dt;
        if (cheeseTimer > 3500) {
            pendingGarbage += (Math.random() < 0.2) ? 3 : 1;
            updateGarbageMeter();
            cheeseTimer = 0;
        }
    }

    draw();
    requestAnimationFrame(loop);
}

function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    
    // Draw Board Blocks
    board.forEach((row, y) => {
        row.forEach((c, x) => {
            if (c && y >= VISIBLE_ROWS) {
                ctx.fillStyle = c;
                ctx.fillRect(x*BLOCK_SIZE + 1, (y-VISIBLE_ROWS)*BLOCK_SIZE + 1, BLOCK_SIZE-2, BLOCK_SIZE-2);
            }
        });
    });

    // Draw Incoming Warning Repurposed
    if (pendingGarbage > 0) {
        ctx.fillStyle = '#f43f5e';
        ctx.font = `bold 20px 'JetBrains Mono'`;
        ctx.textAlign = "center";
        ctx.fillText(`⚠️ QUEUE: ${pendingGarbage}`, canvas.width / 2, 40);
    }

    if (currentPiece) {
        ctx.fillStyle = currentPiece.color;
        currentPiece.matrix.forEach((row, y) => {
            row.forEach((v, x) => {
                if (v && currentPiece.y + y >= VISIBLE_ROWS) {
                    ctx.fillRect((currentPiece.x+x)*BLOCK_SIZE + 1, (currentPiece.y+y-VISIBLE_ROWS)*BLOCK_SIZE + 1, BLOCK_SIZE-2, BLOCK_SIZE-2);
                }
            });
        });
    }
}

// Global exposure for console access
window.updateGarbageMeter = updateGarbageMeter;
window.startGame = startGame;
