// web/src/services/crisisResources.js
// Region-appropriate crisis helplines.
//
// Showing a US number to a user in India is worse than showing nothing: it
// costs someone in distress the seconds it takes to realise the number does
// not work for them. Resources are therefore picked from the region the user
// selected at onboarding, falling back to a timezone guess before any choice
// has been made.
//
// Numbers verified against each operator's public listing. If you localise to
// a new country, add a block here rather than hard-coding numbers in a view.

export const CRISIS_REGIONS = Object.freeze({
  IN: {
    id: 'IN',
    label: 'India',
    emergency: { label: 'Emergency services', number: '112' },
    lines: [
      {
        name: 'Tele-MANAS',
        number: '14416',
        detail: 'Government of India · 24/7 · 20+ languages',
        href: 'tel:14416',
      },
      {
        name: 'Vandrevala Foundation',
        number: '9999 666 555',
        detail: '24/7 · call or WhatsApp',
        href: 'tel:+919999666555',
      },
      {
        name: 'AASRA',
        number: '098204 66726',
        detail: '24/7 · confidential',
        href: 'tel:+919820466726',
      },
      {
        name: 'iCall (TISS)',
        number: '9152987821',
        detail: 'Mon–Sat, 10am–8pm · counsellor-led',
        href: 'tel:+919152987821',
      },
    ],
  },
  US: {
    id: 'US',
    label: 'United States',
    emergency: { label: 'Emergency services', number: '911' },
    lines: [
      {
        name: 'Suicide & Crisis Lifeline',
        number: '988',
        detail: '24/7 · call or text',
        href: 'tel:988',
      },
      {
        name: 'Crisis Text Line',
        number: 'Text HOME to 741741',
        detail: '24/7 · text only',
        href: 'sms:741741',
      },
      {
        name: 'SAMHSA National Helpline',
        number: '1-800-662-4357',
        detail: '24/7 · treatment referrals',
        href: 'tel:18006624357',
      },
    ],
  },
  GB: {
    id: 'GB',
    label: 'United Kingdom',
    emergency: { label: 'Emergency services', number: '999' },
    lines: [
      {
        name: 'Samaritans',
        number: '116 123',
        detail: '24/7 · free from any phone',
        href: 'tel:116123',
      },
      {
        name: 'Shout',
        number: 'Text SHOUT to 85258',
        detail: '24/7 · text only',
        href: 'sms:85258',
      },
    ],
  },
});

export const INTERNATIONAL_DIRECTORY = Object.freeze({
  name: 'Find a Helpline',
  detail: 'Free, confidential lines in 130+ countries',
  url: 'https://findahelpline.com',
});

export const DEFAULT_CRISIS_REGION = 'IN';

/**
 * Maps an onboarding region/language id onto a crisis region.
 * Every Indian-language register resolves to India.
 */
const LOCALE_TO_CRISIS_REGION = {
  'en-IN': 'IN',
  'en-US': 'US',
  'en-GB': 'GB',
  hi: 'IN',
  kn: 'IN',
  te: 'IN',
  ta: 'IN',
  ml: 'IN',
  mr: 'IN',
};

/**
 * Best guess before the user has chosen anything, from the browser's timezone
 * and then its language. Only ever a default — an explicit choice always wins.
 */
export function detectCrisisRegion() {
  if (typeof window === 'undefined') return DEFAULT_CRISIS_REGION;

  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (timeZone === 'Asia/Kolkata' || timeZone === 'Asia/Calcutta') return 'IN';
    if (timeZone.startsWith('America/')) return 'US';
    if (timeZone === 'Europe/London') return 'GB';
  } catch {
    // Intl unavailable; fall through to language.
  }

  const language = (navigator.language || '').toLowerCase();
  if (language.endsWith('-in') || /^(hi|kn|te|ta|ml|mr)\b/.test(language)) return 'IN';
  if (language.endsWith('-gb')) return 'GB';
  if (language.endsWith('-us')) return 'US';

  return DEFAULT_CRISIS_REGION;
}

/** Resolves a crisis region from an onboarding locale, or detects one. */
export function crisisRegionFor(localeId) {
  return CRISIS_REGIONS[LOCALE_TO_CRISIS_REGION[localeId]]
    ? LOCALE_TO_CRISIS_REGION[localeId]
    : detectCrisisRegion();
}

export function getCrisisResources(regionId) {
  return CRISIS_REGIONS[regionId] || CRISIS_REGIONS[DEFAULT_CRISIS_REGION];
}

/** Flat, speakable summary for the voice layer. */
export function crisisSummaryLine(regionId) {
  const region = getCrisisResources(regionId);
  const primary = region.lines[0];
  return `You can reach ${primary.name} on ${primary.number}, or call ${region.emergency.number} for emergency services.`;
}
