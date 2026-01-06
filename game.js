// ===================================================================================
// CONFIGURATION & STATE
// ===================================================================================

const state = {
    scores: {
        skeptic: 0,
        empath: 0,
        avoider: 0
    },
    currentGang: 1,
    // Verfolgt welche Actions wir schon erledigt haben
    // Struktur: { L: ["L1"], R: ["R1", "R2"] } -> wenn erledigt, aus Array entfernen oder Index hochzählen.
    // Einfacher: Wir nutzen Queues.
    queues: {
        L: [], // Wird beim Start von Gang initiiert
        R: []
    },
    completedActions: 0, // Zählt hoch bis totalActions erreicht
    totalActions: 0,

    currentPhase: 'START', // START, IDLE, WALK, ACTION, REACTION, FINAL

    // Für die aktuelle Action merken wir uns Metadaten
    currentAction: null // { side: 'L', id: '1', keyword: 'Call' }
};

// Konfiguration der Gänge
const gangConfig = {
    1: {
        keyword: 'Call',
        actionsL: ['1'],     // Gang1CallL1
        actionsR: ['1', '2'] // Gang1CallR1, Gang1CallR2
    }
    // Weitere Gänge können hier ergänzt werden
};

const VIDEO_PATH = 'videos/';

// ===================================================================================
// DOM ELEMENTS
// ===================================================================================

const videoPlayer = document.getElementById('video-player');
const uiOverlay = document.getElementById('ui-overlay');
const choicesContainer = document.getElementById('choices-container');
const mainMenu = document.getElementById('main-menu');
const startButton = document.getElementById('start-button');
const creditsButton = document.getElementById('credits-button');
const creditsModal = document.getElementById('credits-modal');
const closeCreditsButton = document.getElementById('close-credits');
const creditsVideo = document.getElementById('credits-video');

// Invisible Triggers
let walkTrigger = null;
let choiceLeft = null;
let choiceRight = null;

// ===================================================================================
// GAME LOOP & LOGIC
// ===================================================================================

function startGame() {
    mainMenu.classList.add('hidden');
    uiOverlay.classList.remove('hidden');
    state.currentGang = 1;
    state.scores = { skeptic: 0, empath: 0, avoider: 0 };

    // Setup Audio
    videoPlayer.muted = false;
    videoPlayer.loop = true;

    initGang(state.currentGang);
}

function initGang(gangNr) {
    if (!gangConfig[gangNr]) {
        console.error("Gang " + gangNr + " nicht konfiguriert!");
        return;
    }

    const config = gangConfig[gangNr];
    // Queues kopieren (damit wir sie manipulieren können ohne Config zu ändern)
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

    // Im Idle zeigen wir:
    // - Walk Check (Mitte)
    // - Left Action Check (Links)
    // - Right Action Check (Rechts)
    // Wir nutzen dieselben Trigger-DIVs, mappen sie aber anders
    showTriggersForIdle(true);
}

// 2. INTERACTION HANDLER (IDLE)
function handleIdleInteraction(type) {
    if (state.currentPhase !== 'IDLE') return;

    showTriggersForIdle(false);
    videoPlayer.loop = false;

    if (type === 'WALK') {
        // Warteanimation / Geradeaus -> Walk Video loopback
        playVideo(`Gang${state.currentGang}Walk.mp4`);
        state.currentPhase = 'WALK_IDLE_TRANSITION';
        videoPlayer.onended = () => {
            enterGangIdle();
        };
        return;
    }

    if (type === 'L' || type === 'R') {
        const queue = state.queues[type];

        // Check if queue has actions left
        if (queue.length > 0) {
            // Start next action
            const actionId = queue[0]; // Nimm das nächste, aber entferne es erst wenn fertig? 
            // Nein, wir entfernen es erst wenn die Action abgeschlossen ist (in Reaction end),
            // oder jetzt. Ich entferne es hier aus der Queue, damit es "in progress" ist.
            // Falls man abbricht, müsste man es theoretisch wieder rein tun, aber es gibt kein Abbrechen.
            queue.shift();

            const keyword = gangConfig[state.currentGang].keyword;
            state.currentAction = { side: type, id: actionId, keyword: keyword };

            enterAction(state.currentAction);
        } else {
            // Queue empty -> Play "No" video
            // Bsp: Gang1CallLno.mp4
            const keyword = gangConfig[state.currentGang].keyword;
            const filename = `Gang${state.currentGang}${keyword}${type}no.mp4`;
            playVideo(filename);

            state.currentPhase = 'NO_ACTION';
            videoPlayer.onended = () => {
                enterGangIdle();
            };
        }
    }
}

// 3. ACTION PHASE
function enterAction(action) {
    state.currentPhase = 'ACTION';

    // Filename: Gang1CallL1.mp4
    const filename = `Gang${state.currentGang}${action.keyword}${action.side}${action.id}.mp4`;
    playVideo(filename);

    // Zeige A/B Auswahl
    showTriggersForAction(true);

    // Timeout Handler
    videoPlayer.onended = () => {
        handleTimeout();
    };
}

// 4. CHOICE HANDLING (ACTION)
function handleChoice(selection) { // selection: '1' (A) or '2' (B)
    if (state.currentPhase !== 'ACTION') return;

    showTriggersForAction(false);
    videoPlayer.onended = null; // Timeout clear
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

    showTriggersForAction(false);
    state.currentPhase = 'REACTION';

    state.scores.avoider++;
    console.log("Avoider +1 (Timeout)");

    // Fallback: Wenn Timeout, was passiert? 
    // "Hofft dass das Problem von selbst verschwindet".
    // Wir spielen einfach die Walk Animation und gehen zurück zum Idle (als ob man weitergeht).
    // Oder gibt es ein Timeout Video? 
    // User Request sagt nichts dazu. Ich sende ihn zum Walk.
    playWalkBack();

    state.completedActions++;
}

function playReaction(choiceId) {
    // Filename: Gang1CallL1A1.mp4 (oder A2)
    // action: { side, id, keyword }
    const a = state.currentAction;
    const filename = `Gang${state.currentGang}${a.keyword}${a.side}${a.id}A${choiceId}.mp4`;
    playVideo(filename);

    videoPlayer.onended = () => {
        playWalkBack();
    };
}

function playWalkBack() {
    // "Danach automatisch in den Jeweiligen Gang#Walk und danach automatisch in Gang#"
    playVideo(`Gang${state.currentGang}Walk.mp4`);

    videoPlayer.onended = () => {
        checkProgression();
    };
}

// 5. CHECK PROGRESSION
function checkProgression() {
    // Check if ALL actions are done
    // L und R Queues müssen leer sein UND wir müssen alles einmal gespielt haben.
    // Da wir shiften, sind Queues leer wenn alles durch ist.

    const allDone = state.queues.L.length === 0 && state.queues.R.length === 0;

    if (allDone) {
        // FINALE
        playVideo(`Gang${state.currentGang}Finale.mp4`); // Oder 'Final'? User sagte Gang1Final (oben) und Gang1Finale (unten). Ich nehme Final.
        // User text: "Gang#Final" und "Gang1Finale". Ich probiere 'Finale'.
        // Korrektur: Im Prompt "Gang#Final". Ich nehme `Gang${G}Final.mp4`.
        // WARTE: Er schrieb "Nach Gang1Finale -> Gang2".
        // Ich nehme `Gang${G}Final.mp4` basierend auf dem ersten Prompt-Teil.

        videoPlayer.onended = () => {
            nextGang();
        };
    } else {
        // Zurück zum Idle
        enterGangIdle();
    }
}

function nextGang() {
    state.currentGang++;
    // Prüfen ob Config existiert
    if (gangConfig[state.currentGang]) {
        initGang(state.currentGang);
    } else {
        console.log("Spielende! Keine Config für Gang " + state.currentGang);
        // Spielende Logik (z.B. Score anzeigen oder Credits)
        alert("Ende des Demos. Scores:\nSkeptic: " + state.scores.skeptic + "\nEmpath: " + state.scores.empath + "\nAvoider: " + state.scores.avoider);
        mainMenu.classList.remove('hidden');
        uiOverlay.classList.add('hidden');
    }
}

// ===================================================================================
// HELPER & TRIGGERS
// ===================================================================================

function playVideo(filename) {
    // Falls Video nicht existiert, wird der Browser error werfen (404).
    videoPlayer.src = VIDEO_PATH + filename;
    videoPlayer.play().catch(e => console.error("Play error:", e));
    console.log("Playing:", filename);
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

// MAPPING FÜR IDLE (Links = Left Action, Rechts = Right Action, Mitte = Walk)
function showTriggersForIdle(show) {
    if (!walkTrigger) createTriggers();

    // Clear old listeners by cloning (quick & dirty reset) or re-assigning?
    // Besser: Wir setzen onclick

    walkTrigger.onclick = () => handleIdleInteraction('WALK');
    choiceLeft.onclick = () => handleIdleInteraction('L');
    choiceRight.onclick = () => handleIdleInteraction('R');

    toggleVisibility(show);
}

// MAPPING FÜR ACTION (Links = Antwort A(1), Rechts = Antwort B(2))
function showTriggersForAction(show) {
    if (!walkTrigger) createTriggers();

    // Mitte in Action deaktivieren? User sagte nicht explizit. Normal nur L/R antworten.
    walkTrigger.onclick = null;

    choiceLeft.onclick = () => handleChoice('1');  // A
    choiceRight.onclick = () => handleChoice('2'); // B

    if (show) {
        choiceLeft.classList.remove('hidden');
        choiceRight.classList.remove('hidden');
        walkTrigger.classList.add('hidden'); // Walk trigger weg bei Choice
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

// ===================================================================================
// STARTUP
// ===================================================================================

startButton.addEventListener('click', startGame);

document.addEventListener('keydown', (e) => {
    // Keyboard Support für Walk im Idle
    if (state.currentPhase === 'IDLE' && (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp')) {
        handleIdleInteraction('WALK');
    }
});

creditsButton.addEventListener('click', () => { /* ... wie gehabt ... */ });
closeCreditsButton.addEventListener('click', () => { /* ... wie gehabt ... */ });

// Init Triggers
createTriggers();