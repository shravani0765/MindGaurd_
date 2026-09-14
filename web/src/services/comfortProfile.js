// web/src/services/comfortProfile.js
// The user's personal anchors, captured at onboarding and replayed when the
// companion detects distress.
//
// Everything here is stored in localStorage and never sent to the server — a
// cherished memory is exactly the kind of thing that should not leave the device.

import { ambianceEngine } from './audioAmbiance';

const STORAGE_KEY = 'mindguard.comfort.profile.v1';

/** Soundscapes are the procedurally generated beds in audioAmbiance.js. */
export const COMFORT_SOUNDSCAPES = Object.freeze([
  { id: 'rain', glyph: '🌧️', label: 'Rain on the window', blurb: 'Soft brown-noise raindrops with a warm low filter.' },
  { id: 'ocean', glyph: '🌊', label: 'Ocean waves', blurb: 'Eight-second swells paced to slow your breathing.' },
  { id: 'bowl', glyph: '🎶', label: 'Tibetan bowl, 432 Hz', blurb: 'Harmonic theta resonance for settling.' },
  { id: 'forest', glyph: '🌲', label: 'Forest breeze', blurb: 'Canopy movement and distant chimes.' },
  { id: 'celestial', glyph: '✨', label: 'Celestial drift', blurb: '528 Hz pad for deep alpha rest.' },
]);

const EMPTY_PROFILE = Object.freeze({
  soundscape: 'rain',
  comfortTrackUrl: '',
  comfortTrackLabel: '',
  anchorMemory: '',
  anchorPerson: '',
});

export function loadComfortProfile() {
  if (typeof window === 'undefined') return { ...EMPTY_PROFILE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY_PROFILE, ...JSON.parse(raw) } : { ...EMPTY_PROFILE };
  } catch (error) {
    console.warn('Unable to read comfort profile:', error);
    return { ...EMPTY_PROFILE };
  }
}

export function saveComfortProfile(profile) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...EMPTY_PROFILE, ...profile }));
}

/**
 * A direct audio file URL the browser can actually play.
 *
 * Streaming-service page links (YouTube, Spotify) are rejected on purpose:
 * they cannot be played through an <audio> element, and accepting them would
 * silently produce a comfort track that never sounds.
 */
export function validateComfortTrackUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return { valid: true, url: '' };

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'That does not look like a full URL.' };
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    return { valid: false, error: 'Use an http or https link.' };
  }
  if (/youtube\.com|youtu\.be|spotify\.com|apple\.com\/music/i.test(parsed.hostname + parsed.pathname)) {
    return {
      valid: false,
      error: 'Streaming page links cannot be played here. Use a direct .mp3, .m4a, .ogg or .wav file link.',
    };
  }
  if (!/\.(mp3|m4a|aac|ogg|oga|wav|flac)(\?|$)/i.test(parsed.pathname + parsed.search)) {
    return { valid: false, error: 'Link should point directly at an audio file (.mp3, .m4a, .ogg, .wav).' };
  }

  return { valid: true, url: trimmed };
}

/**
 * Plays the user's own comfort track underneath the conversation.
 *
 * Kept well below the speaking voice so it never competes with a reply, and
 * looped so it does not end abruptly mid-session.
 */
class ComfortTrackPlayer {
  constructor() {
    this.element = null;
  }

  play(url, { volume = 0.18 } = {}) {
    if (typeof window === 'undefined' || !url) return false;

    if (!this.element) {
      this.element = new Audio();
      this.element.loop = true;
      this.element.crossOrigin = 'anonymous';
    }

    if (this.element.src !== url) this.element.src = url;
    this.element.volume = volume;

    // Autoplay can still be refused if no gesture has happened yet; the
    // soundscape bed is the fallback comfort layer in that case.
    const attempt = this.element.play();
    if (attempt?.catch) {
      attempt.catch((error) => console.warn('Comfort track could not autoplay:', error));
    }
    return true;
  }

  /** Fades out rather than cutting, which would itself be jarring. */
  stop({ fadeMs = 900 } = {}) {
    const element = this.element;
    if (!element || element.paused) return;

    const startVolume = element.volume;
    const startedAt = performance.now();

    const step = () => {
      const progress = Math.min((performance.now() - startedAt) / fadeMs, 1);
      element.volume = startVolume * (1 - progress);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        element.pause();
        element.currentTime = 0;
        element.volume = startVolume;
      }
    };
    requestAnimationFrame(step);
  }
}

export const comfortTrackPlayer = new ComfortTrackPlayer();

/**
 * Engages the full comfort layer: soundscape bed plus the user's own track.
 * Returns what was actually started so the caller can describe it accurately.
 */
export function engageComfortLayer(profile = loadComfortProfile()) {
  const started = { soundscape: null, track: null };

  if (profile.soundscape) {
    ambianceEngine.playTrack(profile.soundscape);
    started.soundscape = profile.soundscape;
  }
  if (profile.comfortTrackUrl && comfortTrackPlayer.play(profile.comfortTrackUrl)) {
    started.track = profile.comfortTrackLabel || 'your comfort track';
  }

  return started;
}

export function releaseComfortLayer() {
  ambianceEngine.stop();
  comfortTrackPlayer.stop();
}

/**
 * A short line naming the user's own anchor, for the companion to include.
 * Returns '' when nothing was configured, so callers can skip it cleanly.
 */
export function anchorReminder(profile = loadComfortProfile()) {
  if (profile.anchorPerson && profile.anchorMemory) {
    return `If it helps, bring ${profile.anchorPerson} to mind, and that time ${profile.anchorMemory}.`;
  }
  if (profile.anchorPerson) return `If it helps, bring ${profile.anchorPerson} to mind for a moment.`;
  if (profile.anchorMemory) return `If it helps, return to that time ${profile.anchorMemory}.`;
  return '';
}
