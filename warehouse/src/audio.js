// Playback and analysis. One element, one source node, swapped src.
// Nothing is stored and nothing leaves the page.

const BASS_HZ = 200;
const TREBLE_HZ = 4000;

export function createAudio(tracks, onChange){
  const el = document.createElement('audio');
  el.preload = 'metadata';
  el.crossOrigin = 'anonymous';
  // Detached elements play in most browsers but not all, and nothing can
  // inspect them. It is hidden, not absent.
  el.style.display = 'none';
  document.body.appendChild(el);

  let ctx = null;
  let analyser = null;
  let bins = null;
  let bassEnd = 0;
  let trebleStart = 0;

  // `hit` is onset, not loudness: it spikes on a transient and falls away
  // fast. Loudness alone cannot drive a flash, because a loud sustained
  // passage would just hold the lights up.
  const state = { level: 0, bass: 0, treble: 0, hit: 0, index: -1,
                  playing: false, refused: false };
  let previous = null;
  let fluxAverage = 0;
  // Per-band running range. Normalising against the peak alone is not
  // enough: this material's low end sits at 96 to 100 per cent of its peak
  // for whole tracks, so the band came out pinned at 1.0 and the light it
  // drove never moved. Tracking the floor as well and mapping the span to
  // 0..1 is what actually puts the range to use.
  const peaks = {
    bass:   { lo: 0.5, hi: 0.5 },
    treble: { lo: 0.2, hi: 0.2 },
    level:  { lo: 0.3, hi: 0.3 },
  };
  const SPANS = { bass: 0.06, treble: 0.03, level: 0.04 };

  function follow(current, target, attack, release){
    return current + (target - current) * (target > current ? attack : release);
  }

  function normalise(raw, store, key){
    const st = store[key];
    // Both ends chase the signal instantly in the direction that widens the
    // range, and recover only slowly, so a sudden loud or quiet passage is
    // tracked at once without the range pumping on every bar.
    st.hi = Math.max(raw, st.hi - (st.hi - st.lo) * 0.0012);
    st.lo = Math.min(raw, st.lo + (st.hi - st.lo) * 0.0012);
    const span = Math.max(st.hi - st.lo, SPANS[key]);
    return Math.min(1, Math.max(0, (raw - st.lo) / span));
  }

  // The graph can only be built inside a user gesture, and a media element
  // source can only be created once per element.
  function ensureGraph(){
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    bins = new Uint8Array(analyser.frequencyBinCount);

    const nyquist = ctx.sampleRate / 2;
    const perBin = nyquist / analyser.frequencyBinCount;
    bassEnd = Math.max(2, Math.round(BASS_HZ / perBin));
    trebleStart = Math.min(analyser.frequencyBinCount - 2, Math.round(TREBLE_HZ / perBin));

    ctx.createMediaElementSource(el).connect(analyser);
    analyser.connect(ctx.destination);
  }

  function select(index, { autoplay = true } = {}){
    const track = tracks[(index + tracks.length) % tracks.length];
    state.index = (index + tracks.length) % tracks.length;
    el.src = track.src;
    el.load();
    if (!autoplay) return;
    ensureGraph();

    // play() has to be called in the same turn as the gesture that caused
    // it. On iOS the user activation does not survive an await, so resuming
    // the context first, as this did, gets the play promise rejected and
    // the very first tap reports itself as paused.
    const started = el.play();
    if (ctx.state === 'suspended') ctx.resume();

    if (started && started.then){
      started.then(() => { state.playing = true; state.refused = false; })
             .catch(() => { state.playing = false; state.refused = true; })
             .then(() => { if (onChange) onChange(); });
    } else {
      state.playing = true;
      state.refused = false;
    }
  }

  function toggle(){
    if (!ctx) { select(Math.max(state.index, 0)); return; }
    if (el.paused) { el.play(); ctx.resume(); state.playing = true; state.refused = false; }
    else { el.pause(); state.playing = false; }
  }

  function band(from, to){
    let sum = 0;
    for (let i = from; i < to; i++) sum += bins[i];
    return sum / Math.max(1, (to - from) * 255);
  }

  // Called once per frame. Values are smoothed here, not in the shaders.
  function update(){
    if (!analyser || el.paused) {
      state.level *= 0.94;
      state.bass *= 0.94;
      state.treble *= 0.94;
      state.hit *= 0.86;
      return state;
    }
    analyser.getByteFrequencyData(bins);

    // Spectral flux: how much energy appeared since the last frame, counting
    // only what rose. A kick lights this up where a pad does not.
    if (previous === null) previous = new Uint8Array(bins.length);
    let flux = 0;
    for (let i = 1; i < bins.length; i++){
      const d = bins[i] - previous[i];
      if (d > 0) flux += d;
      previous[i] = bins[i];
    }
    flux /= bins.length * 255;
    fluxAverage += (flux - fluxAverage) * 0.06;
    // Only the part that beats the running average counts as an onset.
    const onset = Math.min(1, Math.max(0, flux - fluxAverage * 1.35) * 9);
    // Short. A slow release turns every transient into a swell, and the
    // room ends up sustained rather than flashing.
    state.hit = Math.max(onset, state.hit * 0.58);
    const lo = band(1, bassEnd);
    const hi = band(trebleStart, bins.length - 1);
    const all = band(1, bins.length - 1);

    // Fixed multipliers do not survive contact with this material: the low
    // end pinned at 1.0 for whole tracks, so the bass light sat at its
    // ceiling and stopped responding to bass entirely. Each band is scaled
    // against its own slowly decaying peak instead, which keeps the full
    // range in use whatever a given track is doing.
    // Asymmetric: fast on the way up, slower on the way down. Smoothing
    // both directions equally rounds the attacks off and the room ends up
    // breathing rather than reacting.
    state.bass = follow(state.bass, normalise(lo, peaks, 'bass'), 0.55, 0.13);
    state.treble = follow(state.treble, normalise(hi, peaks, 'treble'), 0.7, 0.18);
    state.level = follow(state.level, normalise(all, peaks, 'level'), 0.5, 0.11);
    return state;
  }

  return { element: el, state, select, toggle, update, ensureGraph,
           get started(){ return ctx !== null; },
           get refused(){ return state.refused; } };
}
