// web/src/services/devMode.js
// Gate for developer-only diagnostics.
//
// The Gemini key field, model picker and server-setup probe are operator
// plumbing, not product. The server holds the key, so a user should never see
// it, never be asked to supply one, and ideally never learn which model is
// behind the companion at all. Showing that panel made a finished product look
// half-configured.
//
// Enable with ?dev=1 (sticky for the session) and disable with ?dev=0.

const STORAGE_KEY = 'mindguard.devtools';

export function isDevMode() {
  if (typeof window === 'undefined') return false;

  const flag = new URLSearchParams(window.location.search).get('dev');
  if (flag === '1') {
    window.localStorage.setItem(STORAGE_KEY, 'true');
    return true;
  }
  if (flag === '0') {
    window.localStorage.removeItem(STORAGE_KEY);
    return false;
  }

  return window.localStorage.getItem(STORAGE_KEY) === 'true';
}
