# MindGuard — Executive Brief

> **A culturally grounded, privacy-first multimodal wellness companion that runs
> its neural voice and emotion sensing entirely on the user's own device.**

Every claim in this document is backed by code in this repository. Where
something is not yet built or not yet measured, it says so. Nothing here should
surprise a reviewer who opens the source.

---

## 1. The problem

**Clinical coldness.** Most mental health apps present as diagnostic forms.
They ask you to rate your mood 1–10 and return a chart.

**Linguistic distance.** Commercial assistants speak in a register that has no
relationship to how an Indian user actually talks to someone they trust. The
gap between *"I understand your concern"* and *"Arre yaar, main hoon na"* is
the gap between a form and a friend.

**Cost and privacy of cloud voice.** Studio-grade TTS (ElevenLabs, Google Cloud)
bills per character and ships every spoken word of a mental health conversation
to a third party. For this use case that is the wrong trade on both axes.

**Text-only blindness.** An app that only reads typed words cannot notice that
the user has been holding their jaw tight for ten minutes.

---

## 2. What was actually built

### 2.1 On-device neural voice — no cloud, no per-word cost

`web/src/services/kokoroEngine.js`

- **Kokoro 82M ONNX** via `kokoro-js`, executing in the browser on **WebGPU**
  with automatic **WebAssembly** fallback. Device detection probes for a real
  GPU adapter and degrades on failure.
- **Zero audio leaves the device.** There is no TTS server in this architecture.
- **Lazy-loaded.** The model is behind a dynamic `import()`, so it code-splits
  into its own chunk and the app shell stays small (see §5).
- **Gapless playback.** Replies are split at clause boundaries and each
  generated buffer is scheduled back-to-back on the Web Audio clock, so speech
  begins before the full reply is synthesised and no seam opens between
  segments. A 12 ms edge fade removes the DC click at buffer boundaries.

### 2.2 Prosody and breath conditioning

`web/src/services/prosody.js`

- Phonetic normalisation (`AUM → Ohm`, `432Hz → four thirty two hertz`,
  `%` → `percent`), markdown stripping, and link-target removal so formatting
  residue is never voiced.
- Breath pauses inserted before connectives; em-dashes converted to comma
  pauses so the contour never breaks mid-clause.
- Base cadence **0.93× rate / 1.02× pitch**, shifted per emotion, per dialect,
  and per urgency — a crisis reply is delivered slowest.

### 2.3 Indian language warmth with a 0–100 familiarity slider

`web/src/services/vernacular.js`

Seven language registers: **Indian English, Hindi, Kannada, Telugu, Tamil,
Malayalam, Marathi** — written in Latin-script code-switching, which is how
these are actually typed.

Three tiers driven by one slider:

| Level | Tier | Hindi example |
|---|---|---|
| 0–33 | Formal | *"Main samajh raha hoon. Ek ek karke dekhte hain."* |
| 34–66 | Friendly | *"Haan, sun raha hoon. Apna time lo, koi jaldi nahi."* |
| 67–100 | Home comfort | *"Arre yaar, main hoon na. Tension mat le, sab theek ho jayega."* |

**Safety interlock.** `injectVernacular()` returns the message **verbatim** when
`urgency === 'high'` or the self-harm flag is set. Casual register never
touches a crisis response, and de-escalation wording is never machine-mixed
into another language. This is covered by an explicit test.

### 2.4 Throttled optical emotion sensing

`web/src/services/faceEmotionDetector.js`

- A hand-written optical heuristic over downscaled frame luminance and edge
  energy: brow shadow → tension, mouth-region brightness → affect, overall
  luminance and edge density → fatigue.
- **Sampled at 500 ms (2 fps)** via one shared `ANALYSIS_INTERVAL_MS` constant
  used by both camera surfaces. The pixel loop is synchronous, so running it
  per animation frame pegs a core and stalls paint — this was a real bug that
  was found and fixed.
- **Frames never leave the browser.** Only the derived numbers
  (`tension`, `fatigue`, `valence`) are sent to the API.

> **Be precise about this in a viva:** it is a deterministic computer-vision
> heuristic, not a trained model. It is fast, explainable, and has no weights to
> ship. Calling it "ML" would be wrong and a panel will catch it.

### 2.5 Personal comfort layer

`web/src/services/comfortProfile.js`, `web/src/services/sanctuaryTheme.js`

Captured at onboarding, stored **only in `localStorage`** — never uploaded,
not part of the account:

- A comfort soundscape (rain / ocean / 432 Hz Tibetan bowl / forest / 528 Hz pad
  — all synthesised procedurally in Web Audio, no audio files shipped).
- An optional comfort track (direct audio-file URL, validated; streaming page
  links are rejected rather than silently failing to play).
- A person and a memory that steady them.

On detected distress the app **dims to a warm amber palette**, fades the
soundscape in, ducks the comfort track underneath the voice, and offers the
user's own anchor back to them. Recovery releases the dim automatically — but
never overrides a manual choice.

### 2.6 Adaptive companion tone

`web/src/services/archetypes.js`

Four onboarding archetypes (high-functioning worrier, piece gatherer,
disconnected seeker, silent struggler) shape how much a reply reassures before
it advises, and what it asks for next. Same safety interlock as §2.3.

### 2.7 Authenticated backend with real inference

`django_backend/`

- Django REST Framework, **18 endpoints**, signed-token auth with separate
  access/refresh kinds, email verification, and password reset.
- **Text** analysis is heuristic-scored and then refined by an **LLM** when
  `OPENAI_API_KEY` is configured, with the heuristic as the fallback baseline.
- **Voice** routes the transcript through that same text pipeline; acoustic
  features can adjust confidence but never override the emotion label, because
  words carry meaning and tone only tells you how hard it is landing.
- **Video** scores the facial measurements the client already computed.
- **A payload with no real signal returns an explicit `unscored` result at 0.3
  confidence.** An earlier version derived emotion from a CRC32 checksum of the
  base64 blob — numbers that looked like inference but were not, and that
  polluted the burnout average. That was removed.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    BROWSER — everything below is local           │
│                                                                  │
│  🎤 Web Speech API        📹 getUserMedia       💬 Text input     │
│         │                       │                     │          │
│         ▼                       ▼                     ▼          │
│  ┌─────────────┐   ┌───────────────────────┐   ┌──────────────┐  │
│  │ transcript  │   │ Optical heuristic     │   │  raw text    │  │
│  │             │   │ @ 2fps (500ms)        │   │              │  │
│  └──────┬──────┘   └───────────┬───────────┘   └──────┬───────┘  │
│         └──────────────┬───────┴──────────────────────┘          │
│                        ▼                                         │
│         ┌──────────────────────────────┐                         │
│         │  Reply composition            │                        │
│         │  archetype → region →         │                        │
│         │  vernacular → prosody         │                        │
│         │  (crisis bypasses all four)   │                        │
│         └──────────────┬───────────────┘                         │
│                        ▼                                         │
│  ┌──────────────────────────────┐   ┌─────────────────────────┐  │
│  │ Kokoro 82M ONNX              │   │ Comfort layer           │  │
│  │ WebGPU → WASM fallback       │   │ procedural soundscapes  │  │
│  │ → Web Speech API fallback    │   │ + amber dim + anchor    │  │
│  └──────────────────────────────┘   └─────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────┘
                             │  HTTPS/JSON — derived signals only,
                             │  never audio, never video frames
                             ▼
              ┌────────────────────────────────────┐
              │  Django REST API (18 endpoints)    │
              │  auth · mood log · burnout trend   │
              │  text inference (heuristic + LLM)  │
              │  SQLite dev / PostgreSQL prod      │
              └────────────────────────────────────┘
```

| Layer | Technology | Why |
|---|---|---|
| UI | React 19 + Vite | Fast HMR, small shell, straightforward code-splitting |
| Neural TTS | Kokoro 82M ONNX (`kokoro-js`) | Runs in-browser; no GPU server, no per-word billing, no audio egress |
| Audio | Web Audio API | Sample-accurate scheduling for gapless synthesis + ambience mixing |
| TTS fallback | Web Speech API | Zero-downtime path while weights compile, and the only route to non-English locales |
| Vision | Canvas 2D optical heuristic | Explainable, no weights to download, cheap enough to throttle to 2 fps |
| API | Django REST Framework | Batteries-included auth, ORM, admin, and a real test runner |
| DB | SQLite dev / PostgreSQL prod | `DATABASE_URL` via `dj-database-url`, no code change between environments |

---

## 4. The user journey

1. **Onboarding (5 steps).** Archetype → English register → voice → language and
   warmth slider → comfort profile. Voices and soundscapes are auditionable
   inline; the warmth slider shows a live sample sentence in the chosen language.
2. **Dashboard.** Burnout score, recent pattern, next helpful step.
3. **Check-in.** *"Aaj din bohot heavy tha... I feel completely exhausted."*
4. **Response.** Transcript → text inference → archetype shaping → vernacular
   injection → prosody conditioning → Kokoro synthesis. In parallel, the amber
   palette engages, the soundscape fades in, and the user's anchor is offered back.
5. **Trend.** The entry is logged and the burnout trendline updates — weighted
   by recency, per-mode reliability, and confidence.

---

## 5. Measured facts

| Metric | Value | Source |
|---|---|---|
| App shell (JS) | 329 KB / **103 KB gzip** | `npm run build` |
| App shell (CSS) | 43 KB / **8.8 KB gzip** | `npm run build` |
| Kokoro chunk (lazy) | 2.19 MB / 905 KB gzip | `npm run build` |
| ONNX WASM runtime (lazy) | 21.6 MB / 5.2 MB gzip | `npm run build` |
| Kokoro voices available | 28 (`en-us`, `en-gb`) | `kokoro-js@1.2.1` |
| Language registers (text) | 7 | `vernacular.js` |
| CV sampling rate | 2 fps (500 ms) | `ANALYSIS_INTERVAL_MS` |
| API endpoints | 18 | `wellness/urls.py` |
| Backend tests | **43 passing** | `manage.py test wellness` |
| First-party source | ~12,800 lines | excl. dependencies |

### Not yet measured — say so if asked

**End-to-end voice latency has not been benchmarked.** Do not quote a number.
The honest answer: *"First use pays a one-time model download; after that
synthesis is local, but I haven't instrumented it yet. I'd measure it with
`performance.now()` around `tts.generate()`, split by WebGPU and WASM, across
clause lengths."* That answer is stronger than a number you cannot reproduce on
the panel's laptop.

---

## 6. Deliberate trade-offs

A reviewer will ask why you did not do the obvious thing. These are the answers.

**Why Kokoro in-browser rather than Piper on a server?**
Piper is genuinely fast on CPU and does ship Indic voices — but it requires a
Python service, a deploy target, and sending user audio text to it. Kokoro
in-browser gives zero audio egress, zero inference cost, and zero server
ops. The cost of that choice is honest and stated: **no Indic speech** and a
one-time model download. If Indic *voice* becomes the priority, the migration
path is a FastAPI + Piper service — and that is a deliberate future step, not
an oversight.

**Why is the vision a heuristic and not a CNN?**
A trained model means shipping weights, a warm-up cost, and a second inference
runtime, to classify into the same seven buckets. The heuristic is explainable
line by line, costs nothing to download, and is cheap enough to throttle to
2 fps. Its limits are real and acknowledged: it is sensitive to lighting and
was tuned by hand.

**Why does the crisis path bypass every personalisation layer?**
Archetype shaping, regional idiom, vernacular warmth, and prosody re-pacing all
check urgency first and return the message untouched. Safety wording should be
reviewable as a fixed string, not assembled at runtime from four independent
transformations. This is enforced in code and covered by tests.

**Why is the comfort profile not on the server?**
"A memory you return to" is the most sensitive field in the product. It stays
in `localStorage`. The trade-off is that it does not sync across devices, which
is the correct trade for this data.

---

## 7. Honest backlog

- **Indic TTS** — blocked on the Piper/FastAPI migration described above.
- **Voice latency benchmarking** — not instrumented.
- **`@tensorflow/tfjs` and `@tensorflow-models/face-landmarks-detection`** are
  declared in `web/package.json` but **never imported**. They should be removed
  or actually used; right now they are dead weight in the dependency tree.
- **Mobile session persistence** — the Expo app re-authenticates on every launch
  (needs AsyncStorage or SecureStore).
- **Acoustic feature extraction** — the API accepts `voiceFeatures` and the
  server scores them, but the web client does not yet compute them.
- **Frontend test suite** — backend has 43 tests; the React layer has none.

---

## 8. What to lead with in a viva

1. **Privacy as an architecture, not a policy.** No audio, no video frame, and
   no comfort profile ever leaves the device. That is a property of where the
   code runs, not a promise in a privacy policy — and you can prove it by
   opening the network tab.
2. **Cultural specificity as an engineering problem.** Seven language registers
   with a continuous familiarity control, and a safety interlock that provably
   disables all of it during a crisis. The interesting work is the interlock.
3. **Knowing what your numbers mean.** The CRC32 placeholder was removed because
   inventing a confidence score is worse than admitting you do not have one. The
   `unscored` path exists specifically so a meaningless input cannot move a
   mental-health trendline.
