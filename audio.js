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
   ===================================================== */

(function() {
  'use strict';

  const Audio = {
    enabled: true,
    initialized: false,
    finasPool: [],
    bordoesPool: [],
    poolIdxFinas: 0,
    poolIdxBordoes: 0,
    reverb: null,
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
      Audio.volumeNode = new Tone.Volume(-6).toDestination();
      Audio.reverb = new Tone.Reverb({ decay: 1.4, wet: 0.18 }).connect(Audio.volumeNode);

      // Pool de cordas finas
      for (let i = 0; i < POOL_SIZE; i++) {
        const synth = new Tone.PluckSynth({
          attackNoise: 0.7,
          dampening: 5200,
          resonance: 0.96,
          release: 1.4,
        }).connect(Audio.reverb);
        synth.volume.value = -3;
        Audio.finasPool.push(synth);
      }

      // Pool de bordões
      for (let i = 0; i < POOL_SIZE; i++) {
        const synth = new Tone.PluckSynth({
          attackNoise: 0.35,
          dampening: 2400,
          resonance: 0.985,
          release: 2.2,
        }).connect(Audio.reverb);
        synth.volume.value = -2;
        Audio.bordoesPool.push(synth);
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

  function playString(stringIdx, fret, when) {
    if (!Audio.enabled) return;
    if (!Audio.initialized) return;
    if (fret === null || fret === undefined) return;

    const TUNING_MIDI = [71, 69, 64, 59, 57, 50];
    const baseMidi = TUNING_MIDI[stringIdx] + fret;
    const baseFreq = midiToFreq(baseMidi);

    let pairs;
    if (stringIdx <= 2) {
      // Ordens 1, 2, 3: par UNÍSSONO (2 finas iguais)
      pairs = [
        { synth: nextFina(), freq: detune(baseFreq, -3), delay: 0 },
        { synth: nextFina(), freq: detune(baseFreq, +3), delay: 0.005 },
      ];
    } else if (stringIdx === 5) {
      // Ordem 6: par UNÍSSONO de BORDÕES
      pairs = [
        { synth: nextBordao(), freq: detune(baseFreq, -2), delay: 0 },
        { synth: nextBordao(), freq: detune(baseFreq, +2), delay: 0.005 },
      ];
    } else {
      // Ordens 4, 5: par OITAVA (bordão grave + fina aguda)
      pairs = [
        { synth: nextBordao(), freq: detune(baseFreq / 2, -3), delay: 0 },
        { synth: nextFina(),   freq: detune(baseFreq, +3),     delay: 0.008 },
      ];
    }

    pairs.forEach(p => {
      try {
        // PluckSynth: triggerAttack só (decai naturalmente)
        p.synth.triggerAttack(p.freq, when + p.delay);
      } catch (e) {
        console.warn('Erro a tocar nota:', e);
      }
    });
  }

  function playArpeggio(frets, direction, spread) {
    direction = direction || 'down-up';
    spread = spread || 0.07;
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
