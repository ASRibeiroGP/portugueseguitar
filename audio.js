/* =====================================================
   audio.js - Som da Guitarra Portuguesa (Afinação Lisboa)
   Calibrado para CORDAS ROUXINOL R-10L:
     • Cordas lisas: aço INOXIDÁVEL (muito brilhantes, harmónicos agudos)
     • Bordões: BRONZE PRATEADO sobre núcleo hexagonal aço carbono estanhado
       (brilhantes, com sustain longo e definição cristalina)

   Calibres reais (.0095 a .031) e estrutura física:
     Ordem 1 (Si4):  .0095 + .0095 — par UNÍSSONO de finas aço inox
     Ordem 2 (Lá4):  .010 + .010   — par UNÍSSONO de finas aço inox
     Ordem 3 (Mi4):  .0126 + .0126 — par UNÍSSONO de finas (mais grossa = corpo)
     Ordem 4 (Si3):  .0095 fina + .020 bordão  — par OITAVA
     Ordem 5 (Lá3):  .010 fina + .025 bordão   — par OITAVA
     Ordem 6 (Ré3):  .0175 + .031  — par UNÍSSONO de bordões (calibres DIFERENTES)
   ===================================================== */

(function() {
  'use strict';

  const Audio = {
    enabled: true,
    initialized: false,
    // 3 pools: finas (cordas lisas aço inox), bordões brilhantes (4ª/5ª e o .0175 da 6ª),
    // bordões grossos (.020-.031, com mais corpo)
    finasPool: [],
    bordoesPool: [],
    bordoesGrossosPool: [],
    poolIdxFinas: 0,
    poolIdxBordoes: 0,
    poolIdxGrossos: 0,
    reverb: null,
    eq: null,
    compressor: null,
    volumeNode: null,
  };

  const POOL_SIZE = 14;

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function detune(freq, cents) {
    return freq * Math.pow(2, cents / 1200);
  }

  async function initAudio() {
    if (Audio.initialized) return;
    if (typeof Tone === 'undefined') {
      console.warn('Tone.js não carregou');
      return;
    }
    try {
      await Tone.start();
    } catch (e) {
      console.warn('Tone.start() falhou:', e);
      return;
    }

    try {
      // Cadeia de processamento master: volume -> compressor -> EQ -> reverb -> dest
      Audio.volumeNode = new Tone.Volume(-5).toDestination();

      // Reverb curto e brilhante (caixa de pinho pequena, não catedral)
      Audio.reverb = new Tone.Reverb({ decay: 1.1, wet: 0.16 }).connect(Audio.volumeNode);

      // EQ para imitar a resposta da guitarra portuguesa:
      //   - Corte severo abaixo de 100 Hz (caixa pequena não os produz)
      //   - Realce em ~4-6 kHz (brilho metálico característico)
      //   - Ligeiro corte em ~250 Hz para clareza (evitar "boomy")
      Audio.eq = new Tone.EQ3({
        low: -3,       // -3 dB nos graves abaixo de 250 Hz
        mid: 0,
        high: +4,      // +4 dB nos agudos (brilho cristalino)
        lowFrequency: 250,
        highFrequency: 3500,
      }).connect(Audio.reverb);

      // Compressor leve para "presença" e ataque definido
      Audio.compressor = new Tone.Compressor({
        threshold: -18,
        ratio: 2.5,
        attack: 0.003,
        release: 0.1,
      }).connect(Audio.eq);

      // === POOL DE CORDAS FINAS (aço inox, brilhantes e cristalinas) ===
      // attackNoise alto = mais "tilintar" no ataque
      // dampening MUITO alto (8000+) = pouca absorção dos agudos = brilho prolongado
      // resonance alto = sustain longo
      for (let i = 0; i < POOL_SIZE; i++) {
        const synth = new Tone.PluckSynth({
          attackNoise: 1.0,      // ataque mais ruidoso/metálico
          dampening: 8500,       // cordas inox: pouco abafamento dos agudos
          resonance: 0.985,      // sustain longo (núcleo hexagonal estanhado)
          release: 1.8,
        }).connect(Audio.compressor);
        synth.volume.value = -2;
        Audio.finasPool.push(synth);
      }

      // === POOL DE BORDÕES BRILHANTES (bronze prateado fino) ===
      // Para a 4ª e 5ª ordens e o .0175 da 6ª
      // Bronze prateado = mais brilhante que bronze comum
      for (let i = 0; i < POOL_SIZE; i++) {
        const synth = new Tone.PluckSynth({
          attackNoise: 0.6,
          dampening: 4500,       // mais brilho que bordões standard
          resonance: 0.99,       // sustain muito longo
          release: 2.5,
        }).connect(Audio.compressor);
        synth.volume.value = -1;
        Audio.bordoesPool.push(synth);
      }

      // === POOL DE BORDÕES GROSSOS (.031 da 6ª ordem) ===
      // O bordão mais grosso da 6ª, mais corpo nos graves mas ainda brilhante
      for (let i = 0; i < POOL_SIZE; i++) {
        const synth = new Tone.PluckSynth({
          attackNoise: 0.45,
          dampening: 3200,
          resonance: 0.992,
          release: 3.0,          // sustain muito longo
        }).connect(Audio.compressor);
        synth.volume.value = 0;
        Audio.bordoesGrossosPool.push(synth);
      }

      Audio.initialized = true;
    } catch (e) {
      console.warn('Erro a criar sintetizadores:', e);
    }
  }

  function nextFina() {
    const s = Audio.finasPool[Audio.poolIdxFinas];
    Audio.poolIdxFinas = (Audio.poolIdxFinas + 1) % POOL_SIZE;
    return s;
  }
  function nextBordao() {
    const s = Audio.bordoesPool[Audio.poolIdxBordoes];
    Audio.poolIdxBordoes = (Audio.poolIdxBordoes + 1) % POOL_SIZE;
    return s;
  }
  function nextBordaoGrosso() {
    const s = Audio.bordoesGrossosPool[Audio.poolIdxGrossos];
    Audio.poolIdxGrossos = (Audio.poolIdxGrossos + 1) % POOL_SIZE;
    return s;
  }

  /**
   * Toca uma corda DUPLA da guitarra portuguesa.
   * Replica fielmente a estrutura física das Rouxinol R-10L.
   */
  function playString(stringIdx, fret, when) {
    if (!Audio.enabled) return;
    if (!Audio.initialized) return;
    if (fret === null || fret === undefined) return;

    const TUNING_MIDI = [71, 69, 64, 59, 57, 50];
    const baseMidi = TUNING_MIDI[stringIdx] + fret;
    const baseFreq = midiToFreq(baseMidi);

    let pairs;
    if (stringIdx === 0) {
      // 1ª ordem Si4: par UNÍSSONO de finas .0095 (as mais agudas e brilhantes)
      pairs = [
        { synth: nextFina(), freq: detune(baseFreq, -4), delay: 0,     vol: 0 },
        { synth: nextFina(), freq: detune(baseFreq, +4), delay: 0.004, vol: 0 },
      ];
    } else if (stringIdx === 1) {
      // 2ª ordem Lá4: par UNÍSSONO de finas .010
      pairs = [
        { synth: nextFina(), freq: detune(baseFreq, -4), delay: 0,     vol: 0 },
        { synth: nextFina(), freq: detune(baseFreq, +4), delay: 0.004, vol: 0 },
      ];
    } else if (stringIdx === 2) {
      // 3ª ordem Mi4: par UNÍSSONO de finas .0126 (mais grossas, ligeiramente menos brilhantes)
      pairs = [
        { synth: nextFina(), freq: detune(baseFreq, -3), delay: 0,     vol: -1 },
        { synth: nextFina(), freq: detune(baseFreq, +3), delay: 0.005, vol: -1 },
      ];
    } else if (stringIdx === 3) {
      // 4ª ordem Si3: par OITAVA
      // - fina .0095 (TOCA NA OITAVA AGUDA, baseFreq normal)
      // - bordão .020 bronze prateado (TOCA UMA OITAVA ABAIXO)
      // Resultado: ouvem-se as duas em simultâneo, oitava separa-as
      pairs = [
        { synth: nextBordao(), freq: detune(baseFreq / 2, -3), delay: 0,     vol: 0 },
        { synth: nextFina(),   freq: detune(baseFreq, +4),     delay: 0.007, vol: -1 },
      ];
    } else if (stringIdx === 4) {
      // 5ª ordem Lá3: par OITAVA
      // - fina .010 + bordão .025 bronze prateado uma oitava abaixo
      pairs = [
        { synth: nextBordao(), freq: detune(baseFreq / 2, -3), delay: 0,     vol: 0 },
        { synth: nextFina(),   freq: detune(baseFreq, +4),     delay: 0.007, vol: -1 },
      ];
    } else {
      // 6ª ordem Ré3: par UNÍSSONO de BORDÕES com CALIBRES DIFERENTES
      // - .0175 (mais brilhante) + .031 (mais corpo)
      // Os dois afinados na mesma nota mas com timbres complementares
      pairs = [
        { synth: nextBordao(),        freq: detune(baseFreq, -3), delay: 0,     vol: -1 },
        { synth: nextBordaoGrosso(),  freq: detune(baseFreq, +3), delay: 0.006, vol: 0 },
      ];
    }

    pairs.forEach(function(p) {
      try {
        p.synth.triggerAttack(p.freq, when + p.delay);
      } catch (e) {
        console.warn('Erro a tocar nota:', e);
      }
    });
  }

  function playArpeggio(frets, direction, spread) {
    direction = direction || 'down-up';
    spread = spread || 0.075;
    if (!Audio.enabled) return;
    initAudio().then(function() {
      if (!Audio.initialized) return;
      const now = Tone.now() + 0.05;
      const order = direction === 'down-up' ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5];
      let step = 0;
      order.forEach(function(stringIdx) {
        const fret = frets[stringIdx];
        if (fret !== null && fret !== undefined) {
          playString(stringIdx, fret, now + step * spread);
          highlightString(stringIdx, step * spread * 1000);
          step++;
        }
      });
    });
  }

  function playStrum(frets, spread) {
    spread = spread || 0.012;
    if (!Audio.enabled) return;
    initAudio().then(function() {
      if (!Audio.initialized) return;
      const now = Tone.now() + 0.05;
      const order = [5, 4, 3, 2, 1, 0];
      let step = 0;
      order.forEach(function(stringIdx) {
        const fret = frets[stringIdx];
        if (fret !== null && fret !== undefined) {
          playString(stringIdx, fret, now + step * spread);
          highlightString(stringIdx, step * spread * 1000);
          step++;
        }
      });
    });
  }

  function playSingleString(stringIdx, fret) {
    if (!Audio.enabled) return;
    initAudio().then(function() {
      if (!Audio.initialized) return;
      const now = Tone.now() + 0.05;
      playString(stringIdx, fret, now);
      highlightString(stringIdx, 0);
    });
  }

  function playTuning() {
    if (!Audio.enabled) return;
    initAudio().then(function() {
      if (!Audio.initialized) return;
      const now = Tone.now() + 0.05;
      const order = [5, 4, 3, 2, 1, 0];
      order.forEach(function(stringIdx, i) {
        playString(stringIdx, 0, now + i * 0.55);
        setTimeout(function() { highlightTuningString(stringIdx); }, i * 550);
      });
    });
  }

  function highlightString(stringIdx, delayMs) {
    setTimeout(function() {
      document.querySelectorAll('.diagram-container svg').forEach(function(svg) {
        const stringEl = svg.querySelector('.string-line[data-string="' + stringIdx + '"]');
        if (stringEl) {
          stringEl.classList.add('playing');
          setTimeout(function() { stringEl.classList.remove('playing'); }, 500);
        }
      });
    }, delayMs);
  }

  function highlightTuningString(stringIdx) {
    const el = document.querySelector('.tuning-string[data-string="' + stringIdx + '"]');
    if (el) {
      el.style.background = 'var(--burgundy)';
      el.style.color = 'var(--paper)';
      setTimeout(function() {
        el.style.background = '';
        el.style.color = '';
      }, 600);
    }
  }

  function setMuted(muted) {
    Audio.enabled = !muted;
    const btn = document.getElementById('audio-toggle');
    if (btn) {
      btn.classList.toggle('muted', muted);
      btn.textContent = muted ? '🔇' : '🔊';
      btn.setAttribute('aria-label', muted ? 'Som desligado' : 'Som ligado');
    }
  }

  window.GPAudio = {
    init: initAudio,
    playArpeggio: playArpeggio,
    playStrum: playStrum,
    playSingleString: playSingleString,
    playTuning: playTuning,
    setMuted: setMuted,
    isEnabled: function() { return Audio.enabled; },
  };
})();
