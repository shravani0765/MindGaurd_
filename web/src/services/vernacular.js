// web/src/services/vernacular.js
// Code-switched Indian-language warmth for the companion's replies.
//
// SCOPE — read this before extending:
// Phrases are written in *Latin script* (Hinglish/Kanglish/Tanglish as people
// actually type them), not Devanagari/Kannada/Tamil script. That is deliberate:
// the text layer supports seven languages, but the *speech* layer cannot. The
// on-device Kokoro model ships en-US and en-GB voices only, so a Devanagari
// string would be unreadable to it. Latin-script code-switching is legible to
// an en-IN voice and degrades gracefully on any English voice.
//
// See `speechLocale` on each language for what the voice layer will actually
// attempt, and `VERNACULAR_SPEECH_NOTE` for the caveat surfaced in the UI.

export const WARMTH_TIERS = Object.freeze({
  formal: { id: 'formal', label: 'Formal', range: [0, 33] },
  friendly: { id: 'friendly', label: 'Friendly', range: [34, 66] },
  home: { id: 'home', label: 'Home comfort', range: [67, 100] },
});

/**
 * Phrase banks per language.
 *
 * `acknowledge` opens a reply, `reassure` carries the comfort, `invite` closes
 * with the ask. Each tier escalates familiarity, never clinical content.
 */
export const LANGUAGES = Object.freeze({
  'en-IN': {
    id: 'en-IN',
    label: 'Indian English',
    glyph: '🇮🇳',
    speechLocale: 'en-IN',
    nativeToVoice: true,
    phrases: {
      formal: {
        acknowledge: ['I understand your concern.', 'Thank you for sharing that.'],
        reassure: ['Let us take this one step at a time.', 'This is manageable, and you are not behind.'],
        invite: ['What would help most right now?', 'Where would you like to start?', 'What is taking up the most space today?'],
      },
      friendly: {
        acknowledge: ['I hear you.', 'That sounds like a lot.'],
        reassure: ['Take your own time, no hurry.', 'It is completely okay to feel this.'],
        invite: ['What feels heaviest at the moment?', 'What is sitting on your mind most?', 'Which bit of it is hardest right now?'],
      },
      home: {
        acknowledge: ['Arre, I am right here.', 'Come, tell me properly.'],
        reassure: ['Do not take tension, I am here na.', 'Slowly slowly it will settle, you will see.'],
        invite: ['Just tell me one thing that is sitting on your chest?', 'Arre, what is the main thing bothering you?', 'Tell me na, what is the heaviest part?'],
      },
    },
  },
  hi: {
    id: 'hi',
    label: 'Hindi / Hinglish',
    glyph: '🪔',
    speechLocale: 'hi-IN',
    nativeToVoice: false,
    phrases: {
      formal: {
        acknowledge: ['Main samajh raha hoon.', 'Aapne bataya, achha kiya.'],
        reassure: ['Ek ek karke dekhte hain.', 'Yeh sambhal jayega.'],
        invite: ['Abhi sabse zyada kya pareshan kar raha hai?', 'Kahan se shuru karna chahenge?', 'Aaj kya sabse zyada bhaari lag raha hai?'],
      },
      friendly: {
        acknowledge: ['Haan, sun raha hoon.', 'Samajh raha hoon yaar.'],
        reassure: ['Apna time lo, koi jaldi nahi.', 'Aisa lagna bilkul normal hai.'],
        invite: ['Kya cheez sabse bhaari lag rahi hai abhi?', 'Dimaag mein sabse zyada kya chal raha hai?', 'Konsa part sabse mushkil lag raha hai?'],
      },
      home: {
        acknowledge: ['Arre yaar, main hoon na.', 'Bas, aaram se batao.'],
        reassure: ['Tension mat le, sab theek ho jayega.', 'Dheere dheere sab set ho jayega.'],
        invite: ['Ek baat batao, dil pe kya rakha hai?', 'Arre bolo na, sabse zyada kya khaa raha hai?', 'Sach batao, kya sabse bhaari lag raha hai?'],
      },
    },
  },
  kn: {
    id: 'kn',
    label: 'Kannada / Kanglish',
    glyph: '🌺',
    speechLocale: 'kn-IN',
    nativeToVoice: false,
    phrases: {
      formal: {
        acknowledge: ['Naanu artha maadikolluttene.', 'Helididdakke dhanyavada.'],
        reassure: ['Ondondagi nodona.', 'Idu sariyaguttade.'],
        invite: ['Eega yaavudu heccu tondare kodtaide?', 'Elli inda shuru maadona?', 'Indu yaavudu heccu bhaara anisutte?'],
      },
      friendly: {
        acknowledge: ['Haudu, kelthidini.', 'Artha aagtaide kano.'],
        reassure: ['Nidhanavagi tagoli, aatura illa.', 'Hige anisodu sahaja.'],
        invite: ['Yaavudu jaasti bhaara anisutte eega?', 'Manasalli yaavudu jaasti odaaduttide?', 'Yaava bhaaga tumba kashta anisutte?'],
      },
      home: {
        acknowledge: ['Ayyo, naanu idini kano.', 'Baa, sariyagi helu.'],
        reassure: ['Tension beda kano, naanu idini.', 'Nidhana nidhanavagi sari hogutte.'],
        invite: ['Ondu vishaya helu, manasalli enidhe?', 'Helu kano, yaavudu jaasti tinnutta ide?', 'Nija helu, yaavudu tumba bhaara?'],
      },
    },
  },
  te: {
    id: 'te',
    label: 'Telugu / Tenglish',
    glyph: '🌼',
    speechLocale: 'te-IN',
    nativeToVoice: false,
    phrases: {
      formal: {
        acknowledge: ['Nenu artham chesukuntunnanu.', 'Cheppinanduku dhanyavadalu.'],
        reassure: ['Okkoti chuddam.', 'Idi saripotundi.'],
        invite: ['Ippudu edi ekkuva ibbandi pedutondi?', 'Ekkada nunchi modalu peddam?', 'Ivvala edi ekkuva baruvuga undi?'],
      },
      friendly: {
        acknowledge: ['Avunu, vintunnanu.', 'Ardham avutondi ra.'],
        reassure: ['Nidanamga teesko, tondara ledu.', 'Ila anipinchadam sahajam.'],
        invite: ['Edi ekkuva baruvuga anipistondi?', 'Manasulo edi ekkuva tirugutondi?', 'Ee vishayam lo edi ekkuva kastam?'],
      },
      home: {
        acknowledge: ['Arey, nenu unnanu kada.', 'Ra, sariggaa cheppu.'],
        reassure: ['Tension padaku, nenu unnanu.', 'Nidanamga anni set aipotayi.'],
        invite: ['Oka maata cheppu, manasulo emundi?', 'Cheppu ra, edi ekkuva tintondi?', 'Nijam cheppu, edi ekkuva baruvu?'],
      },
    },
  },
  ta: {
    id: 'ta',
    label: 'Tamil / Tanglish',
    glyph: '🪷',
    speechLocale: 'ta-IN',
    nativeToVoice: false,
    phrases: {
      formal: {
        acknowledge: ['Naan purinjikiren.', 'Sonnadhukku nandri.'],
        reassure: ['Onnonna paakalam.', 'Idhu sari aagidum.'],
        invite: ['Ippo edhu adhigama kastama irukku?', 'Engeyirundhu aarambikkalaam?', 'Indha naal edhu romba bharama irukku?'],
      },
      friendly: {
        acknowledge: ['Aamaa, kekkuren.', 'Purinjudhu da.'],
        reassure: ['Nidhaanama edu, avasaram illa.', 'Ippadi thonradhu romba sagajam.'],
        invite: ['Edhu romba bharama irukku ippo?', 'Manasula edhu adhigama suzhalludhu?', 'Endha pathi romba kastama irukku?'],
      },
      home: {
        acknowledge: ['Adada, naan irukken da.', 'Vaa, sariyaa sollu.'],
        reassure: ['Tension pannadha, naan irukken.', 'Meduvaa ellam sari aagidum.'],
        invite: ['Oru vishayam sollu, manasula enna irukku?', 'Sollu da, edhu romba saapdudhu?', 'Unmaiyaa sollu, edhu romba bharam?'],
      },
    },
  },
  ml: {
    id: 'ml',
    label: 'Malayalam / Manglish',
    glyph: '🌴',
    speechLocale: 'ml-IN',
    nativeToVoice: false,
    phrases: {
      formal: {
        acknowledge: ['Enikku manassilaakunnu.', 'Paranjathinu nandi.'],
        reassure: ['Onnonnayi nokkaam.', 'Ithu sheriyaakum.'],
        invite: ['Ippol ethaanu kooduthal buddhimuttu?', 'Evide ninnu thudangam?', 'Innu ethaanu ettavum bharam?'],
      },
      friendly: {
        acknowledge: ['Athe, njan kelkkunnund.', 'Manassilaakunnu da.'],
        reassure: ['Sammayedukkoo, thirakku illa.', 'Ingane thonnunnathu swabhavikam.'],
        invite: ['Ethaanu ippo ettavum bharam?', 'Manassil ethaanu kooduthal kathunnu?', 'Ee karyathil ethaanu ettavum prayasam?'],
      },
      home: {
        acknowledge: ['Ayyo, njan ivide undallo.', 'Vaa, nannayi parayu.'],
        reassure: ['Tension venda, njan undu.', 'Pathiye ellam sheriyakum.'],
        invite: ['Oru karyam parayu, manassil entha?', 'Parayu da, ethaanu kooduthal thinnunnu?', 'Sathyam parayu, ethaanu ettavum bharam?'],
      },
    },
  },
  mr: {
    id: 'mr',
    label: 'Marathi / Minglish',
    glyph: '🧡',
    speechLocale: 'mr-IN',
    nativeToVoice: false,
    phrases: {
      formal: {
        acknowledge: ['Mala samajtay.', 'Sangitlyabaddal dhanyavaad.'],
        reassure: ['Ek ek karun baghuya.', 'He nit hoil.'],
        invite: ['Atta kashacha sarvat jast tras hotoy?', 'Kuthun suruvat karayachi?', 'Aaj kay sarvat jad vatatay?'],
      },
      friendly: {
        acknowledge: ['Ho, mi aikto aahe.', 'Samajtay re.'],
        reassure: ['Shantpane ghe, gadbad nahi.', 'Asa vatna agdi sahajik aahe.'],
        invite: ['Kay sarvat jad vatatay atta?', 'Manat kay sarvat jast firtay?', 'Konta bhag sarvat kathin vatato?'],
      },
      home: {
        acknowledge: ['Are, mi aahe na.', 'Ye, nit sang.'],
        reassure: ['Tension nako gheu, mi aahe.', 'Hallu hallu sagla nit hoil.'],
        invite: ['Ek sang, manat kay aahe?', 'Sang na, kay sarvat jast khatay?', 'Khare sang, kay sarvat jad?'],
      },
    },
  },
});

export const DEFAULT_LANGUAGE_ID = 'en-IN';
export const DEFAULT_SLANG_LEVEL = 45;

/** Shown wherever a non-English language is selected. */
export const VERNACULAR_SPEECH_NOTE =
  'Replies are written in Latin-script code-switching. The on-device neural voice speaks English only, ' +
  'so non-English lines are spoken by your device voice when it has that language installed, and by an ' +
  'Indian English voice otherwise.';

export function getLanguage(languageId) {
  return LANGUAGES[languageId] || LANGUAGES[DEFAULT_LANGUAGE_ID];
}

/** Maps a 0–100 slider position onto a phrase tier. */
export function tierForLevel(level) {
  const value = clamp(Number(level) || 0, 0, 100);
  if (value <= WARMTH_TIERS.formal.range[1]) return 'formal';
  if (value <= WARMTH_TIERS.friendly.range[1]) return 'friendly';
  return 'home';
}

/**
 * Wraps a reply in vernacular warmth.
 *
 * SAFETY: when `urgency` is 'high' — or the text flags self-harm — this returns
 * the message untouched. Casual register must never soften a crisis response,
 * and de-escalation wording stays in the language it was authored and reviewed
 * in rather than being machine-mixed.
 */
export function injectVernacular(
  message,
  { languageId = DEFAULT_LANGUAGE_ID, slangLevel = DEFAULT_SLANG_LEVEL, urgency = 'normal', topicFlags = {}, turn = 0 } = {}
) {
  if (urgency === 'high' || topicFlags.selfHarm) return message;

  const language = getLanguage(languageId);
  const tier = tierForLevel(slangLevel);
  const bank = language.phrases[tier];
  if (!bank) return message;

  const acknowledge = rotate(bank.acknowledge, turn);
  const reassure = rotate(bank.reassure, turn);

  return [acknowledge, reassure, message].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** The vernacular closing question, when one is available for this tier. */
export function vernacularInvite(languageId, slangLevel, turn = 0) {
  const bank = getLanguage(languageId).phrases[tierForLevel(slangLevel)];
  return bank ? rotate(bank.invite, turn) : '';
}

/**
 * The locale the speech layer should attempt for this language, plus whether
 * the neural engine can actually voice it natively.
 */
export function speechTargetFor(languageId) {
  const language = getLanguage(languageId);
  return {
    locale: language.speechLocale,
    // Only Indian English is covered end-to-end; everything else depends on a
    // device voice being installed for that locale.
    neuralCapable: language.nativeToVoice,
    fallbackLocale: 'en-IN',
  };
}

function rotate(list, seed) {
  if (!list?.length) return '';
  return list[Math.abs(Math.trunc(seed)) % list.length];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
