/* =====================================================
audio.js - Sistema de som para Guitarra Portuguesa
Afinação de Lisboa, 6 ordens (12 cordas)

Estrutura física das cordas:
Ordem 1 (Si):  par UNÍSSONO  — 2 cordas finas iguais
Ordem 2 (Lá):  par UNÍSSONO  — 2 cordas finas iguais
Ordem 3 (Mi):  par UNÍSSONO  — 2 cordas finas iguais
Ordem 4 (Si):  par OITAVA    — 1 fina + 1 bordão (oitava abaixo)
Ordem 5 (Lá):  par OITAVA    — 1 fina + 1 bordão (oitava abaixo)
Ordem 6 (Ré):  par UNÍSSONO  — 2 bordões grossos iguais

Cada par toca com:
- Detune subtil (~5 cents) entre as 2 cordas → chorus natural
- Pequeno atraso (~5ms) entre cordas do mesmo par
- Timbres distintos para “fina” vs “bordão”
===================================================== */

(function() {
‘use strict’;

// Estado global do áudio
const Audio = {
enabled: true,
initialized: false,
finasSynth: null,   // sintetizador para cordas finas (brilhantes)
bordoesSynth: null, // sintetizador para bordões (mais escuros, mais sustain)
reverb: null,
volumeNode: null,
};

// MIDI para frequência
function midiToFreq(midi) {
return 440 * Math.pow(2, (midi - 69) / 12);
}

// Aplica detune em cents para retornar frequência ligeiramente desafinada
function detune(freq, cents) {
return freq * Math.pow(2, cents / 1200);
}

// Inicializa Tone.js (lazy: só na primeira interação do utilizador)
async function initAudio() {
if (Audio.initialized) return;
if (typeof Tone === ‘undefined’) {
console.warn(‘Tone.js não está carregado’);
return;
}
await Tone.start();

```
// Volume master e reverb subtil
Audio.volumeNode = new Tone.Volume(-6).toDestination();
Audio.reverb = new Tone.Reverb({ decay: 1.4, wet: 0.18 }).connect(Audio.volumeNode);

// Sintetizador para CORDAS FINAS — brilhante, com ataque metálico
// PluckSynth simula corda dedilhada (Karplus-Strong)
Audio.finasSynth = new Tone.PolySynth(Tone.PluckSynth, {
  attackNoise: 0.7,
  dampening: 5200,
  resonance: 0.96,
  release: 1.4,
}).connect(Audio.reverb);
Audio.finasSynth.volume.value = -3;

// Sintetizador para BORDÕES — mais escuro, mais sustain, mais corpo
Audio.bordoesSynth = new Tone.PolySynth(Tone.PluckSynth, {
  attackNoise: 0.35,
  dampening: 2400,
  resonance: 0.985,
  release: 2.2,
}).connect(Audio.reverb);
Audio.bordoesSynth.volume.value = -2;

Audio.initialized = true;
```

}

/**

- Toca uma corda DUPLA da guitarra portuguesa.
- @param {number} stringIdx 0..5 (0 = corda 1 mais aguda, 5 = corda 6 mais grave)
- @param {number} fret      casa premida (0 = solta, null = mutada)
- @param {number} when      tempo em segundos (Tone.now() + offset) para tocar
- @param {number} duration  duração da nota
  */
  function playString(stringIdx, fret, when, duration) {
  if (!Audio.enabled || !Audio.initialized) return;
  if (fret === null || fret === undefined) return;

```
// Afinação (MIDI de cada corda solta)
const TUNING_MIDI = [71, 69, 64, 59, 57, 50]; // corda 1..6
const baseMidi = TUNING_MIDI[stringIdx] + fret;
const baseFreq = midiToFreq(baseMidi);

// Configura o par consoante a corda
let pairs;
if (stringIdx <= 2) {
  // Ordens 1, 2, 3: par UNÍSSONO (2 finas iguais)
  pairs = [
    { synth: Audio.finasSynth, freq: detune(baseFreq, -3), delay: 0 },
    { synth: Audio.finasSynth, freq: detune(baseFreq, +3), delay: 0.005 },
  ];
} else if (stringIdx === 5) {
  // Ordem 6: par UNÍSSONO de BORDÕES (2 graves iguais)
  pairs = [
    { synth: Audio.bordoesSynth, freq: detune(baseFreq, -2), delay: 0 },
    { synth: Audio.bordoesSynth, freq: detune(baseFreq, +2), delay: 0.005 },
  ];
} else {
  // Ordens 4, 5: par OITAVA (1 fina aguda + 1 bordão uma oitava abaixo)
  // O bordão soa uma oitava ABAIXO da fina; a "nota nominal" é a fina (aguda).
  const finaFreq = baseFreq;             // a fina toca a nota
  const bordaoFreq = baseFreq / 2;       // o bordão toca uma oitava abaixo
  pairs = [
    { synth: Audio.bordoesSynth, freq: detune(bordaoFreq, -3), delay: 0 },
    { synth: Audio.finasSynth,   freq: detune(finaFreq, +3),   delay: 0.008 },
  ];
}

// Toca cada nota do par
pairs.forEach(p => {
  try {
    p.synth.triggerAttackRelease(p.freq, duration || 1.8, when + p.delay);
  } catch (e) {
    console.warn('Erro a tocar nota:', e);
  }
});
```

}

/**

- Toca um acorde em ARPEJO (corda 6 → corda 1, ou vice-versa).
  */
  function playArpeggio(frets, direction = ‘down-up’, spread = 0.05) {
  if (!Audio.enabled) return;
  initAudio().then(() => {
  const now = Tone.now();
  // ‘down-up’: começa na corda mais grave (idx 5) e sobe para a 1 (idx 0)
  const order = direction === ‘down-up’ ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5];
  let step = 0;
  order.forEach(stringIdx => {
  const fret = frets[stringIdx];
  if (fret !== null && fret !== undefined) {
  playString(stringIdx, fret, now + step * spread, 2.0);
  highlightString(stringIdx, step * spread * 1000);
  step++;
  }
  });
  });
  }

/**

- Toca todas as cordas em SIMULTÂNEO (rasgueado rápido).
  */
  function playStrum(frets, spread = 0.012) {
  if (!Audio.enabled) return;
  initAudio().then(() => {
  const now = Tone.now();
  // Direção down-up: do grave para o agudo, mas muito rápido
  const order = [5, 4, 3, 2, 1, 0];
  let step = 0;
  order.forEach(stringIdx => {
  const fret = frets[stringIdx];
  if (fret !== null && fret !== undefined) {
  playString(stringIdx, fret, now + step * spread, 2.2);
  highlightString(stringIdx, step * spread * 1000);
  step++;
  }
  });
  });
  }

/**

- Toca apenas uma corda (quando o utilizador clica nela no diagrama).
  */
  function playSingleString(stringIdx, fret) {
  if (!Audio.enabled) return;
  initAudio().then(() => {
  const now = Tone.now();
  playString(stringIdx, fret, now, 2.0);
  highlightString(stringIdx, 0);
  });
  }

/**

- Toca a afinação das 6 cordas soltas, do grave para o agudo.
  */
  function playTuning() {
  if (!Audio.enabled) return;
  initAudio().then(() => {
  const now = Tone.now();
  // Toca da 6 para a 1, espaçadas
  const order = [5, 4, 3, 2, 1, 0];
  order.forEach((stringIdx, i) => {
  playString(stringIdx, 0, now + i * 0.55, 1.5);
  setTimeout(() => highlightTuningString(stringIdx), i * 550);
  });
  });
  }

/**

- Realça visualmente a corda quando toca.
  */
  function highlightString(stringIdx, delayMs) {
  setTimeout(() => {
  // Encontra a corda ativa no diagrama do card atual
  document.querySelectorAll(’.diagram-container svg’).forEach(svg => {
  const stringEl = svg.querySelector(’.string-line[data-string=”’ + stringIdx + ‘”]’);
  if (stringEl) {
  stringEl.classList.add(‘playing’);
  setTimeout(() => stringEl.classList.remove(‘playing’), 500);
  }
  });
  }, delayMs);
  }

/**

- Realça a corda no painel de afinação.
  */
  function highlightTuningString(stringIdx) {
  const el = document.querySelector(’.tuning-string[data-string=”’ + stringIdx + ‘”]’);
  if (el) {
  el.style.background = ‘var(–burgundy)’;
  el.style.color = ‘var(–paper)’;
  setTimeout(() => {
  el.style.background = ‘’;
  el.style.color = ‘’;
  }, 600);
  }
  }

/**

- Toggle mute global.
  */
  function setMuted(muted) {
  Audio.enabled = !muted;
  const btn = document.getElementById(‘audio-toggle’);
  if (btn) {
  btn.classList.toggle(‘muted’, muted);
  btn.textContent = muted ? ‘🔇’ : ‘🔊’;
  btn.setAttribute(‘aria-label’, muted ? ‘Som desligado’ : ‘Som ligado’);
  }
  }

// Expor API global
window.GPAudio = {
init: initAudio,
playArpeggio: playArpeggio,
playStrum: playStrum,
playSingleString: playSingleString,
playTuning: playTuning,
setMuted: setMuted,
isEnabled: () => Audio.enabled,
};
})();
