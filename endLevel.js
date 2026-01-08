
const ORACLE_TEXTS = {
    // High Skeptic
    SKEPTIC: `Du bist der Zweifler.

Die Zeit war für dich nie ein Fluss, sondern ein Rätsel, das es zu lösen galt. Du hast hinter jede Tür geschaut, nicht aus Hoffnung, sondern aus Misstrauen.
Du hast den Verfall gesehen, bevor er begann. 

Aber wer immer nur die Risse in der Wand anstarrt, vergisst das Haus, das sie halten.
Du bist nicht gefangen in der Schleife. Du hast sie nur zu genau analysiert, bis sie dich verschluckt hat.

Dein Herz schlägt im Takt einer Uhr, die rückwärts läuft.`,

    // High Empath
    EMPATH: `Du bist der Fühlende.

In den Echos der Hallen hast du nicht nur Lärm gehört, sondern Stimmen. Du hast versucht zu verstehen, zu verbinden, wo andere nur Wände sahen.
Der Stress war dein Begleiter, weil du ihn für andere getragen hast.

Doch Mitgefühl in einer Zeitschleife ist eine schwere Last. Du hast gewartet, zugehört, gehofft.
Du hast dich selbst vergessen, während du versucht hast, die Geister der Vergangenheit zu retten.

Dein Rhythmus ist ein Herzschlag, der gegen die Stille ankämpft.`,

    // High Avoider (Default or Avoidant)
    AVOIDER: `Du bist der Schatten.

Du bist nicht gegangen, du bist geschwebt. Immer am Rand, niemals im Zentrum. Du hast gewartet, bis die Zeit sich von selbst löst.
Aber die Warteschleife ist geduldig.

Du dachtest, wenn du dich nicht bewegst, kann dich der Verfall nicht finden. Aber Stillstand ist der schnellste Tod.
Du bist ein Geist in deiner eigenen Geschichte. 

Du wartest auf ein Zeichen, aber die Schreibmaschine hat kein Farbband mehr.`,

    // Balanced / Mixed
    LOST_SOUL: `Du bist der Verlorene.

Ein Schritt vor, zwei zurück. Du hast mal gezweifelt, mal gefühlt, mal geschwiegen. 
Die Zeit hat dich nicht definiert, sie hat dich zerrissen.

Du bist das Rauschen zwischen den Sendern. Ein Fragment im Loop. 
Du hast keinen Rhythmus gefunden, nur Lärm.

Versuche es erneut. Vielleicht findest du beim nächsten Mal eine Melodie.`
};

function startEndSequence(scores) {
    // 1. Hide Game UI
    const uiOverlay = document.getElementById('ui-overlay');
    const videoPlayer = document.getElementById('video-player');

    if (uiOverlay) uiOverlay.classList.add('hidden');

    // Fade out video audio
    let vol = 1.0;
    const fadeOut = setInterval(() => {
        if (vol > 0.05) {
            vol -= 0.05;
            videoPlayer.volume = vol;
        } else {
            clearInterval(fadeOut);
            videoPlayer.pause();
            videoPlayer.volume = 1.0; // Reset for next game
        }
    }, 100);

    // 2. Prepare End Screen Container
    let endScreen = document.getElementById('end-screen');
    if (!endScreen) {
        console.error("End screen container not found!");
        return;
    }

    // Reset content
    endScreen.innerHTML = `
        <div id="score-container"></div>
        <div id="oracle-container">
            <div id="oracle-text"></div>
            <button id="restart-btn" onclick="location.reload()">Zyklus neu starten</button>
        </div>
    `;

    endScreen.classList.remove('hidden');

    // Force reflow
    void endScreen.offsetWidth;

    endScreen.classList.add('visible');

    // 3. Generate Floating Scores
    const scoreContainer = document.getElementById('score-container');
    generateFloatingScores(scoreContainer, scores);

    // 4. Determine Role
    const role = determineRole(scores);
    const text = ORACLE_TEXTS[role];

    // 5. Start Typewriter
    const textContainer = document.getElementById('oracle-text');

    setTimeout(() => {
        typeWriter(textContainer, text, 0);
    }, 2000); // 2s delay for white fade in
}

function determineRole(scores) {
    const { skeptic, empath, avoider } = scores;

    // Simple logic: Highest score wins. If tie, specific precedence or "Lost Soul"
    if (skeptic > empath && skeptic > avoider) return 'SKEPTIC';
    if (empath > skeptic && empath > avoider) return 'EMPATH';
    if (avoider > skeptic && avoider > empath) return 'AVOIDER';

    // Handle Ties
    if (skeptic === empath && skeptic > 2) return 'LOST_SOUL'; // High activity but torn
    if (avoider > 0 && avoider === skeptic) return 'AVOIDER'; // Avoiding wins ties

    return 'LOST_SOUL';
}

function generateFloatingScores(container, scores) {
    // Create visual noise based on scores
    // Create elements like "Skepticism", "Empathy", "Avoidance" or symbols

    const words = [];
    for (let i = 0; i < scores.skeptic; i++) words.push("Zweifel");
    for (let i = 0; i < scores.empath; i++) words.push("Gefühl");
    for (let i = 0; i < scores.avoider; i++) words.push("Stille");

    // Add some random theme words
    const themeWords = ["ZEIT", "LOOP", "VERFALL", "00:00"];

    // Total particles
    const totalParticles = 30 + words.length * 2;

    for (let i = 0; i < totalParticles; i++) {
        const span = document.createElement('span');
        span.classList.add('floating-score');

        // Pick random word
        let text;
        if (i < words.length) text = words[i];
        else text = themeWords[Math.floor(Math.random() * themeWords.length)];

        span.innerText = text;

        // Random Position
        const left = Math.random() * 100;
        const top = Math.random() * 100;

        // Random Animation Duration & Delay
        const dur = 10 + Math.random() * 20; // 10-30s
        const delay = Math.random() * -20; // negative delay to start immediately mid-anim

        // Random Size
        const size = 0.8 + Math.random() * 1.5;

        span.style.left = left + '%';
        span.style.top = top + '%';
        span.style.animationDuration = dur + 's';
        span.style.animationDelay = delay + 's';
        span.style.fontSize = size + 'rem';

        // Skeptic = Cold/Blueish, Empath = Warm/Reddish, Avoider = Grey
        // We actally use endLevel.css opacity/color defaults, but could vary here.
        // Let's keep it simple black/grey for the "Typewriter on paper" feel defined in CSS.

        container.appendChild(span);
    }
}

function typeWriter(element, text, i) {
    if (i < text.length) {
        element.innerHTML = text.substring(0, i + 1) + '<span class="cursor-blink">|</span>';

        // Random typing speed for realism
        const speed = 30 + Math.random() * 50;

        setTimeout(() => {
            typeWriter(element, text, i + 1);
        }, speed);
    } else {
        // Done
        element.innerHTML = text; // Remove cursor or keep it

        // Show Restart Button
        const btn = document.getElementById('restart-btn');
        if (btn) btn.classList.add('visible');
    }
}
