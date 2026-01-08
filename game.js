
const state = {
    scores: {
        skeptic: 0,
        empath: 0,
        avoider: 0
    },
    currentGang: 1,
    // Queues
    queues: {
        L: [],
        R: []
    },
    completedActions: 0,
    totalActions: 0,

    currentPhase: 'START',

    currentAction: null // { side, id, keyword, isChain, chainDepth (string) }
};

// Konfiguration der Gänge
const gangConfig = {
    1: {
        keywords: { L: 'Call', R: 'Call' }, // Default keywords
        actionsL: ['1'],     // Gang1CallL1
        actionsR: ['1', '2'] // Gang1CallR1...
    },
    2: {
        keywords: { L: 'Call', R: 'Door' },
        actionsL: ['1', '2'], // Gang2CallL1, Gang2CallL2
        actionsR: [
            // id: '1', type: 'chain', next: 'A1' ... 
            { id: '1', type: 'chain' }
        ],
        // Prerequisite: Right side needs Left side to be empty
        prereqs: {
            R: { waitFor: 'L', failVideo: 'DoorRno' } // Gang2DoorRno
        }
    }
};

const VIDEO_PATH = 'videos/';

const ALL_VIDEOS = [
    'Gang1.mp4', 'Gang1CallL1.mp4', 'Gang1CallL1A1.mp4', 'Gang1CallL1A2.mp4', 'Gang1CallLno.mp4',
    'Gang1CallR1.mp4', 'Gang1CallR1A1.mp4', 'Gang1CallR1A2.mp4', 'Gang1CallR2.mp4', 'Gang1CallR2A1.mp4', 'Gang1CallR2A2.mp4', 'Gang1CallRno.mp4',
    'Gang1Finale.mp4', 'Gang1Walk.mp4',
    'Gang2.mp4', 'Gang2CallL1.mp4', 'Gang2CallL1A1.mp4', 'Gang2CallL1A2.mp4', 'Gang2CallL2.mp4', 'Gang2CallL2A1.mp4', 'Gang2CallL2A2.mp4', 'Gang2CallLno.mp4',
    'Gang2DoorR1.mp4', 'Gang2DoorR1A1.mp4', 'Gang2DoorR1A1A1.mp4', 'Gang2DoorRno.mp4', 'Gang2Finale.mp4', 'Gang2Walk.mp4'
];

let videoCache = {}; // Stores Blob URLs: { 'Gang1.mp4': 'blob:...' }

// 
// DOM ELEMENTS
// 

const videoPlayer = document.getElementById('video-player');
const uiOverlay = document.getElementById('ui-overlay');
const choicesContainer = document.getElementById('choices-container');
const mainMenu = document.getElementById('main-menu');
const startButton = document.getElementById('start-button');

// Loading Screen Elements
const loadingScreen = document.getElementById('loading-screen');
const loadingBarFill = document.getElementById('loading-bar-fill');
const loadingText = document.getElementById('loading-text');

// Invisible Triggers
let walkTrigger = null;
let choiceLeft = null;
let choiceRight = null;

// 
// GAME LOOP & LOGIC
// 

async function startGame() {
    console.log("startGame() called");
    try {
        // 1. Clean up Video Player (remove <source> tags)
        // This ensures setting .src works correctly
        videoPlayer.innerHTML = '';
        videoPlayer.removeAttribute('src'); // Clear current src if any
        videoPlayer.load(); // Reset player

        mainMenu.classList.add('hidden');

        // loading happens before UI overlay is shown
        loadingScreen.classList.remove('hidden');

        state.currentGang = 1;
        state.scores = { skeptic: 0, empath: 0, avoider: 0 };

        // Setup Audio
        videoPlayer.muted = false;
        videoPlayer.loop = true;

        // PRELOAD VIDEOS FOR GANG 1
        console.log("Starting Preload...");
        await preloadGang(state.currentGang);
        console.log("Preload finished.");

        uiOverlay.classList.remove('hidden');
        console.log("Initializing Gang 1...");
        initGang(state.currentGang);

    } catch (error) {
        console.error("CRITICAL ERROR in startGame:", error);
        alert("Ein Fehler ist aufgetreten: " + error.message);
    }

    // Stop Menu Music
    const menuAudio = document.getElementById('menu-audio');
    if (menuAudio) {
        menuAudio.pause();
        menuAudio.currentTime = 0;
    }
}

function initGang(gangNr) {
    if (!gangConfig[gangNr]) {
        console.error("Gang " + gangNr + " nicht konfiguriert!");
        return;
    }

    const config = gangConfig[gangNr];
    // Queues kopieren
    state.queues.L = [...config.actionsL];
    state.queues.R = [...config.actionsR];
    state.totalActions = config.actionsL.length + config.actionsR.length;
    state.completedActions = 0;

    enterGangIdle();
}

// 1. GANG IDLE (Warteraum)
function enterGangIdle() {
    state.currentPhase = 'IDLE';
    videoPlayer.loop = true;
    playVideo(`Gang${state.currentGang}.mp4`);

    showTriggersForIdle(true);
}

// 2. INTERACTION HANDLER (IDLE)
function handleIdleInteraction(type) {
    if (state.currentPhase !== 'IDLE') return;

    showTriggersForIdle(false);
    videoPlayer.loop = false;

    if (type === 'WALK') {
        state.currentPhase = 'WALK_IDLE_TRANSITION';
        playVideo(`Gang${state.currentGang}Walk.mp4`);
        videoPlayer.onended = () => {
            enterGangIdle();
        };
        return;
    }

    if (type === 'L' || type === 'R') {
        const config = gangConfig[state.currentGang];

        // Check Prereqs
        if (config.prereqs && config.prereqs[type]) {
            const prereq = config.prereqs[type];
            // waitFor: 'L' -> Check ob Queue L leer ist
            if (state.queues[prereq.waitFor].length > 0) {
                // Prereq nicht erfüllt!
                state.currentPhase = 'NO_ACTION';
                playVideo(`Gang${state.currentGang}${prereq.failVideo}.mp4`);
                videoPlayer.onended = () => {
                    enterGangIdle();
                };
                return;
            }
        }

        const queue = state.queues[type];

        if (queue.length > 0) {
            // Get Queue Item
            const item = queue[0];
            queue.shift(); // Remove from queue

            // Determine keyword
            let keyword = 'Call'; // default
            if (config.keywords && config.keywords[type]) keyword = config.keywords[type];

            let actionId = item;
            let isChain = false;

            // Falls Item ein Objekt ist (Chain definition)
            if (typeof item === 'object') {
                actionId = item.id;
                isChain = item.type === 'chain';
            }

            state.currentAction = {
                side: type,
                id: actionId,
                keyword: keyword,
                isChain: isChain,
                chainStack: [], // Speichert chain progress suffixe (z.B. "A1")
                originalItem: item // Zum Wiederherstellen bei Fail
            };

            enterAction(state.currentAction);
        } else {
            // Queue empty -> Play "No" video
            let keyword = 'Call';
            if (config.keywords && config.keywords[type]) keyword = config.keywords[type];

            const filename = `Gang${state.currentGang}${keyword}${type}no.mp4`;
            state.currentPhase = 'NO_ACTION';
            playVideo(filename);

            videoPlayer.onended = () => {
                enterGangIdle();
            };
        }
    }
}

// 3. ACTION PHASE
function enterAction(action) {
    state.currentPhase = 'ACTION';

    // Filename construction
    let suffix = '';
    if (action.isChain && action.chainStack.length > 0) {
        suffix = action.chainStack.join(''); // z.B. "A1" + "A1" ...
    }

    const filename = `Gang${state.currentGang}${action.keyword}${action.side}${action.id}${suffix}.mp4`;
    playVideo(filename);

    // UI Logic
    if (action.isChain) {
        showChainTrigger(true);
    } else {
        // Normal A/B
        showTriggersForAction(true);
    }

    // Timeout Handler
    videoPlayer.onended = () => {
        handleTimeout();
    };
}

// 4. CHOICE HANDLING (ACTION)
function handleChoice(selection) { // selection: '1' (A) or '2' (B)
    if (state.currentPhase !== 'ACTION') return;

    videoPlayer.onended = null; // Timeout clear

    const action = state.currentAction;

    if (action.isChain) {
        // Chain Logic
        action.chainStack.push('A1');

        // Quick Fix: Wenn Stack Länge 2 ist ('A1', 'A1'), dann FINALISIEREN.
        if (action.chainStack.length >= 2) {
            // Letztes Video spielen: Gang2DoorR1A1A1
            playVideo(`Gang${state.currentGang}${action.keyword}${action.side}${action.id}${action.chainStack.join('')}.mp4`);
            state.currentPhase = 'CHAIN_END'; // Warte auf Ende
            showChainTrigger(false); // Button verstecken nach Finalisierung
            videoPlayer.onended = () => {
                // Chain erfolgreich
                playWalkBack();
                // Action als Done markieren
                state.completedActions++;
            };
        } else {
            // Nächster Schritt in der Chain
            // Hier NICHT showChainTrigger(false) aufrufen, da enterAction den Button anzeigt
            enterAction(action);
        }

        return;
    }

    // Standard Normal Logic
    showTriggersForAction(false);
    state.currentPhase = 'REACTION';

    // Scoring
    if (selection === '1') { // A
        state.scores.skeptic++;
        console.log("Skeptic +1 (Choice A)");
    } else { // B
        state.scores.empath++;
        console.log("Empath +1 (Choice B)");
    }

    playReaction(selection);

    // Action als komplett zählen
    state.completedActions++;
}

function handleTimeout() {
    if (state.currentPhase !== 'ACTION') return;

    const action = state.currentAction;

    if (action.isChain) {
        // Chain Timeout -> Valid End (User decided to stop/wait)
        showChainTrigger(false);
        console.log("Chain Timeout -> Action Complete");

        // Don't unshift. The action is considered done.
        state.completedActions++;
        playWalkBack(true); // Check progression (might trigger Finale)
        return;
    }

    // Normal Timeout
    showTriggersForAction(false);
    state.currentPhase = 'REACTION';
    state.scores.avoider++;
    console.log("Avoider +1 (Timeout)");

    playWalkBack();
    state.completedActions++;
}

function playReaction(choiceId) {
    const a = state.currentAction;
    const filename = `Gang${state.currentGang}${a.keyword}${a.side}${a.id}A${choiceId}.mp4`;
    playVideo(filename);

    videoPlayer.onended = () => {
        playWalkBack();
    };
}

function playWalkBack(check = true) {
    playVideo(`Gang${state.currentGang}Walk.mp4`);

    videoPlayer.onended = () => {
        if (check) checkProgression();
        else enterGangIdle();
    };
}

// 5. CHECK PROGRESSION
function checkProgression() {
    // Check if ALL actions are done
    const allDone = state.queues.L.length === 0 && state.queues.R.length === 0;

    if (allDone) {
        // FINALE
        playVideo(`Gang${state.currentGang}Finale.mp4`);
        videoPlayer.onended = () => {
            nextGang();
        };
    } else {
        enterGangIdle();
    }
}

async function nextGang() {
    state.currentGang++;
    if (gangConfig[state.currentGang]) {
        // PRELOAD VIDEOS FOR NEXT GANG
        await preloadGang(state.currentGang);
        initGang(state.currentGang);
    } else {
        console.log("Spielende! Keine Config für Gang " + state.currentGang);
        // Start new End Sequence
        startEndSequence(state.scores);
    }
}


function playVideo(filename) {
    console.log("playVideo called for:", filename);

    // Reset player behavior
    videoPlayer.loop = (state.currentPhase === 'IDLE');

    if (videoCache[filename]) {
        console.log("Playing from Cache:", filename);
        videoPlayer.src = videoCache[filename];
    } else {
        console.warn("Video not in cache, playing directly:", filename);
        videoPlayer.src = VIDEO_PATH + filename;
    }

    // Force load to ensure source switch
    // videoPlayer.load(); // Usually not needed with .src, but harmless if src changed. 
    // Actually, .play() is enough. But if previous source was <source>, .load() helps? 
    // We cleared innerHTML in startGame, so it should be fine.

    videoPlayer.play().catch(e => {
        console.error("Play error for " + filename + ":", e);
    });
}

// 
// PRELOADING LOGIC
// 

async function preloadGang(gangNr) {
    // 1. Filter videos for this gang
    const videosToLoad = ALL_VIDEOS.filter(v => v.startsWith(`Gang${gangNr}`));

    if (videosToLoad.length === 0) {
        console.warn(`No videos found for Gang${gangNr}`);
        return;
    }

    // 2. Show Loading Screen (failsafe)
    loadingScreen.classList.remove('hidden');
    loadingBarFill.style.width = '0%';
    loadingText.innerText = '0%';

    let loadedCount = 0;
    const total = videosToLoad.length;

    // 3. Load videos
    // We assume sequential loading is safer for bandwidth/performance, 
    // but parallel is faster. Let's do parallel with Promise.all but track progress.

    const promises = videosToLoad.map(async (filename) => {
        // Check cache first
        if (videoCache[filename]) {
            loadedCount++;
            updateLoadingUI(loadedCount, total);
            return;
        }

        try {
            const response = await fetch(VIDEO_PATH + filename);
            if (!response.ok) throw new Error('Network error');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            videoCache[filename] = url;
        } catch (err) {
            console.error(`Failed to load ${filename}:`, err);
        } finally {
            loadedCount++;
            updateLoadingUI(loadedCount, total);
        }
    });

    await Promise.all(promises);

    // 4. Hide Loading Screen
    // Small delay to let user see 100%
    await new Promise(r => setTimeout(r, 500));
    loadingScreen.classList.add('hidden');
}

function updateLoadingUI(current, total) {
    const percent = Math.floor((current / total) * 100);
    loadingBarFill.style.width = `${percent}%`;
    loadingText.innerText = `${percent}%`;
}

function createTriggers() {
    choicesContainer.innerHTML = '';

    walkTrigger = createDiv('walk-trigger');
    choiceLeft = createDiv('choice-area-left');
    choiceRight = createDiv('choice-area-right');

    choicesContainer.appendChild(walkTrigger);
    choicesContainer.appendChild(choiceLeft);
    choicesContainer.appendChild(choiceRight);
}

function createDiv(cls) {
    const d = document.createElement('div');
    d.className = 'invisible-trigger ' + cls + ' hidden';
    return d;
}

// Helper for switching Layouts
function setTriggerLayout(layout) {
    if (!choiceLeft || !choiceRight) return;

    // Remove positional classes
    choiceLeft.classList.remove('choice-area-left', 'choice-area-right', 'btn-top', 'btn-bottom');
    choiceRight.classList.remove('choice-area-left', 'choice-area-right', 'btn-top', 'btn-bottom');

    if (layout === 'IDLE') {
        choiceLeft.classList.add('choice-area-left');
        choiceRight.classList.add('choice-area-right');
    } else if (layout === 'ACTION') {
        // choiceLeft becomes Top Button
        choiceLeft.classList.add('btn-top');
        // choiceRight becomes Bottom Button
        choiceRight.classList.add('btn-bottom');
    }
}

// MAPPING FÜR IDLE
function showTriggersForIdle(show) {
    if (!walkTrigger) createTriggers();

    // Ensure Layout is IDLE
    setTriggerLayout('IDLE');

    walkTrigger.onclick = () => handleIdleInteraction('WALK');
    choiceLeft.onclick = () => handleIdleInteraction('L');
    choiceRight.onclick = () => handleIdleInteraction('R');
    toggleVisibility(show);
}

// MAPPING FÜR ACTION (Normal A/B)
function showTriggersForAction(show) {
    if (!walkTrigger) createTriggers();

    // Ensure Layout is ACTION (Top/Bottom)
    setTriggerLayout('ACTION');

    walkTrigger.onclick = null;
    choiceLeft.onclick = () => handleChoice('1');  // Top Button (A)
    choiceRight.onclick = () => handleChoice('2'); // Bottom Button (B)

    if (show) {
        choiceLeft.classList.remove('hidden');
        choiceRight.classList.remove('hidden');
        walkTrigger.classList.add('hidden');
    } else {
        toggleVisibility(false);
    }
}

// MAPPING FÜR CHAIN (Nur EINEN Button)
function showChainTrigger(show) {
    if (!walkTrigger) createTriggers();

    // Use Action Layout (Top Button only)
    setTriggerLayout('ACTION');

    // Use Left/Top as interaction
    choiceLeft.onclick = () => handleChoice('CHAIN_NEXT');
    choiceRight.onclick = null;

    if (show) {
        choiceLeft.classList.remove('hidden');
        choiceRight.classList.add('hidden');
        walkTrigger.classList.add('hidden');
    } else {
        toggleVisibility(false);
    }
}

function toggleVisibility(show) {
    if (show) {
        walkTrigger.classList.remove('hidden');
        choiceLeft.classList.remove('hidden');
        choiceRight.classList.remove('hidden');
    } else {
        walkTrigger.classList.add('hidden');
        choiceLeft.classList.add('hidden');
        choiceRight.classList.add('hidden');
    }
}

// 
// STARTUP
// 

startButton.addEventListener('click', startGame);

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    // Keyboard Support
    if (state.currentPhase === 'IDLE') {
        // IDLE: W/Up=Walk, A/Left=L, D/Right=R
        if (key === 'w' || e.key === 'ArrowUp') handleIdleInteraction('WALK');
        if (key === 'a' || e.key === 'ArrowLeft') handleIdleInteraction('L');
        if (key === 'd' || e.key === 'ArrowRight') handleIdleInteraction('R');
    } else if (state.currentPhase === 'ACTION') {
        const action = state.currentAction;
        if (action && action.isChain) {
            // Chain: Only W/Up/Space/Enter
            if (key === 'w' || e.key === 'ArrowUp' || key === ' ' || key === 'enter') {
                handleChoice('CHAIN_NEXT');
            }
        } else {
            // Normal Action: W/Up (Top), S/Down (Bottom)
            if (key === 'w' || e.key === 'ArrowUp') handleChoice('1');
            if (key === 's' || e.key === 'ArrowDown') handleChoice('2');
        }
    }
});



// Init Triggers
createTriggers();

// --- AUDIO HANDLING ---
const menuAudio = document.getElementById('menu-audio');

function tryPlayMenuAudio() {
    if (!menuAudio) return;

    // Attempt play
    menuAudio.play().catch(error => {
        console.log("Autoplay blocked. Waiting for interaction.", error);

        // Add interaction listener
        const enableAudio = () => {
            // If menu is still visible (game hasn't started), play music
            // We check 'hidden' class on mainMenu
            if (mainMenu && !mainMenu.classList.contains('hidden')) {
                menuAudio.play().catch(e => console.error("Audio still blocked:", e));
            }
            // Remove listener after first interaction attempt
            document.removeEventListener('click', enableAudio);
        };

        document.addEventListener('click', enableAudio);
    });
}

// Try immediately on load
tryPlayMenuAudio();