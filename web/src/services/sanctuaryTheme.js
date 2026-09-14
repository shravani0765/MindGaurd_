// web/src/services/sanctuaryTheme.js
// Warm amber "night sanctuary" mode.
//
// Applied by setting data-sanctuary="amber" on <html>; the palette override
// lives in App.css next to the tokens it replaces, so there is one place to
// look when a colour is wrong.

const ATTRIBUTE = 'data-sanctuary';
const STORAGE_KEY = 'mindguard.sanctuary.mode';

class SanctuaryTheme {
  constructor() {
    this.mode = 'default';
    // Set when the theme was engaged automatically, so a later auto-release
    // does not undo a choice the user made by hand.
    this.engagedAutomatically = false;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emit() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.mode);
      } catch (error) {
        console.error('Sanctuary theme listener error:', error);
      }
    });
  }

  restore() {
    if (typeof document === 'undefined') return 'default';
    const stored = window.localStorage.getItem(STORAGE_KEY);
    this.apply(stored === 'amber' ? 'amber' : 'default', { persist: false });
    return this.mode;
  }

  apply(mode, { persist = true, automatic = false } = {}) {
    if (typeof document === 'undefined') return;

    this.mode = mode === 'amber' ? 'amber' : 'default';
    this.engagedAutomatically = automatic;

    if (this.mode === 'amber') {
      document.documentElement.setAttribute(ATTRIBUTE, 'amber');
    } else {
      document.documentElement.removeAttribute(ATTRIBUTE);
    }

    if (persist) window.localStorage.setItem(STORAGE_KEY, this.mode);
    this._emit();
  }

  toggle() {
    this.apply(this.mode === 'amber' ? 'default' : 'amber');
  }

  /** Dim the room on detected distress, without overwriting a manual choice. */
  engageForDistress() {
    if (this.mode === 'amber') return false;
    this.apply('amber', { persist: false, automatic: true });
    return true;
  }

  /** Undo only an automatic engagement. */
  releaseAutomatic() {
    if (this.mode === 'amber' && this.engagedAutomatically) {
      this.apply('default', { persist: false });
      return true;
    }
    return false;
  }
}

export const sanctuaryTheme = new SanctuaryTheme();
