// web/src/services/audioAmbiance.js
// Procedural Web Audio API Ambient Calming Soundscapes (No external network MP3 dependencies)

class CalmingAudioEngine {
  constructor() {
    this.ctx = null;
    this.currentTrack = null; // 'rain' | 'ocean' | 'bowl' | 'forest' | 'celestial'
    this.isPlaying = false;
    this.nodes = [];
    this.gainNode = null;
    this.masterVolume = 0.25;
    this.onTrackChange = null;

    // Ducking state. `duckDepth` is the fraction of master volume kept while
    // something more important (the companion's voice) is playing.
    this.isDucked = false;
    this.duckDepth = 0.22;
  }

  initContext() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(this._targetGain(), this.ctx.currentTime);
      this.gainNode.connect(this.ctx.destination);
    }
  }

  setVolume(volume) {
    this.masterVolume = volume;
    if (this.gainNode && this.ctx) {
      // Respect an active duck so changing volume mid-speech does not shout.
      const target = this.isDucked ? volume * this.duckDepth : volume;
      this.gainNode.gain.setValueAtTime(target, this.ctx.currentTime);
    }
  }

  /** Current gain target, accounting for ducking. */
  _targetGain() {
    return this.isDucked ? this.masterVolume * this.duckDepth : this.masterVolume;
  }

  /**
   * Smoothly drops the bed so speech sits on top of it.
   *
   * Without this the soundscape and the voice play at full level together,
   * which is what made a caring reply sound like it was competing with the
   * music. Ramped rather than stepped, because an instant cut is itself
   * startling.
   */
  duck({ fadeMs = 320 } = {}) {
    this.isDucked = true;
    if (!this.gainNode || !this.ctx) return;

    const now = this.ctx.currentTime;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.linearRampToValueAtTime(this._targetGain(), now + fadeMs / 1000);
  }

  /** Brings the bed back up once speech has finished. Slower than the duck. */
  restore({ fadeMs = 900 } = {}) {
    this.isDucked = false;
    if (!this.gainNode || !this.ctx) return;

    const now = this.ctx.currentTime;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.linearRampToValueAtTime(this._targetGain(), now + fadeMs / 1000);
  }

  // 1. 🌧️ Gentle Soothing Rain & Soft Breeze (Filtered Pink/Brown Noise)
  playRain() {
    this.initContext();
    this.stop();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    // Create 5-second noise buffer for continuous rain texture
    const bufferSize = this.ctx.sampleRate * 5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Brown noise integration for rich soft raindrops
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    // Filter to give deep warm rain sound
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);

    // Subtle resonant peak for rain drops
    const peakFilter = this.ctx.createBiquadFilter();
    peakFilter.type = 'peaking';
    peakFilter.frequency.setValueAtTime(1200, this.ctx.currentTime);
    peakFilter.gain.setValueAtTime(4, this.ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(peakFilter);
    peakFilter.connect(this.gainNode);

    noiseSource.start();
    this.nodes = [noiseSource, filter, peakFilter];
    this.currentTrack = 'rain';
    this.isPlaying = true;
    if (this.onTrackChange) this.onTrackChange(this.currentTrack);
  }

  // 2. 🌊 Ocean Waves (Rhythmic Breathing Surf Swells)
  playOcean() {
    this.initContext();
    this.stop();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const bufferSize = this.ctx.sampleRate * 6;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    // Swell filter with slow LFO for wave cycles (8s breathing in and out)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.2, this.ctx.currentTime);

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime); // ~8 sec wave swell

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(300, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    // Second low ocean rumble tone
    const rumble = this.ctx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(65, this.ctx.currentTime);
    const rumbleGain = this.ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    rumble.connect(rumbleGain);
    rumbleGain.connect(this.gainNode);

    noiseSource.connect(filter);
    filter.connect(this.gainNode);

    noiseSource.start();
    lfo.start();
    rumble.start();

    this.nodes = [noiseSource, filter, lfo, lfoGain, rumble, rumbleGain];
    this.currentTrack = 'ocean';
    this.isPlaying = true;
    if (this.onTrackChange) this.onTrackChange(this.currentTrack);
  }

  // 3. 🧘 Tibetan Singing Bowl & 432Hz Harmonic Resonance
  playBowl432() {
    this.initContext();
    this.stop();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    // 432Hz fundamental, 864Hz octave, 216Hz grounding sub
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(432, this.ctx.currentTime);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(216, this.ctx.currentTime);

    const osc3 = this.ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(648, this.ctx.currentTime); // Perfect fifth

    // Warm shimmery chorus LFO
    const chorusLFO = this.ctx.createOscillator();
    chorusLFO.type = 'sine';
    chorusLFO.frequency.setValueAtTime(0.08, this.ctx.currentTime);

    const chorusGain = this.ctx.createGain();
    chorusGain.gain.setValueAtTime(1.8, this.ctx.currentTime);
    chorusLFO.connect(chorusGain);
    chorusGain.connect(osc1.frequency);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    osc2.connect(subGain);

    const fifthGain = this.ctx.createGain();
    fifthGain.gain.setValueAtTime(0.06, this.ctx.currentTime);
    osc3.connect(fifthGain);

    osc1.connect(this.gainNode);
    subGain.connect(this.gainNode);
    fifthGain.connect(this.gainNode);

    osc1.start();
    osc2.start();
    osc3.start();
    chorusLFO.start();

    this.nodes = [osc1, osc2, osc3, chorusLFO, chorusGain, subGain, fifthGain];
    this.currentTrack = 'bowl';
    this.isPlaying = true;
    if (this.onTrackChange) this.onTrackChange(this.currentTrack);
  }

  // 4. 🌲 Forest Breeze & Gentle Chimes
  playForest() {
    this.initContext();
    this.stop();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    // Soft canopy wind
    const bufferSize = this.ctx.sampleRate * 4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }

    const windSource = this.ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.setValueAtTime(500, this.ctx.currentTime);

    // Warm serene chord (D Major 7 peaceful notes)
    const chordNotes = [293.66, 369.99, 440.0, 554.37];
    const oscNodes = chordNotes.map((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.035, this.ctx.currentTime);
      osc.connect(g);
      g.connect(this.gainNode);
      osc.start();
      return osc;
    });

    windSource.connect(windFilter);
    windFilter.connect(this.gainNode);
    windSource.start();

    this.nodes = [windSource, windFilter, ...oscNodes];
    this.currentTrack = 'forest';
    this.isPlaying = true;
    if (this.onTrackChange) this.onTrackChange(this.currentTrack);
  }

  // 5. 🌌 Celestial Alpha Drift (Deep Restorative Dream Pad)
  playCelestial() {
    this.initContext();
    this.stop();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    // Healing frequencies 528Hz (Love/Transformation) & 396Hz
    const freqs = [198, 396, 528, 792];
    const oscNodes = freqs.map((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.045 / (i + 1), this.ctx.currentTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.gainNode);
      osc.start();
      return osc;
    });

    this.nodes = oscNodes;
    this.currentTrack = 'celestial';
    this.isPlaying = true;
    if (this.onTrackChange) this.onTrackChange(this.currentTrack);
  }

  playTrack(trackName) {
    switch (trackName) {
      case 'rain':
        this.playRain();
        break;
      case 'ocean':
        this.playOcean();
        break;
      case 'bowl':
        this.playBowl432();
        break;
      case 'forest':
        this.playForest();
        break;
      case 'celestial':
        this.playCelestial();
        break;
      default:
        this.stop();
        break;
    }
  }

  // Auto-Intervention when stress/burnout is detected
  triggerBurnoutIntervention() {
    if (!this.isPlaying) {
      // Pick soothing rain or 432Hz bowl
      this.playRain();
      return true;
    }
    return false;
  }

  stop() {
    this.nodes.forEach((n) => {
      try {
        if (n.stop) n.stop();
        if (n.disconnect) n.disconnect();
      } catch (e) {}
    });
    this.nodes = [];
    this.isPlaying = false;
    this.currentTrack = null;
    if (this.onTrackChange) this.onTrackChange(null);
  }

  toggle(trackName = 'rain') {
    if (this.isPlaying && this.currentTrack === trackName) {
      this.stop();
      return false;
    } else {
      this.playTrack(trackName);
      return true;
    }
  }
}

export const ambianceEngine = new CalmingAudioEngine();
