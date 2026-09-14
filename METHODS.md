# MindGuard — Methods & Techniques Report

A complete record of every method, algorithm and technique used in this
codebase, with the file and formula behind each one. Written so that any claim
here can be checked against the source.

---

## 1. Technology stack

| Layer | Technology | Version |
|---|---|---|
| Frontend framework | React | 19.2 |
| Build tool | Vite (Rolldown) | 8.2 |
| Neural TTS | Kokoro 82M ONNX via `kokoro-js` | 1.2.1 |
| Inference runtime | ONNX Runtime Web (WebGPU / WASM) | via `@huggingface/transformers` |
| Audio | Web Audio API | native |
| Speech input | Web Speech API (`SpeechRecognition`) | native |
| Computer vision | Canvas 2D `getImageData` | native |
| Icons | lucide-react | 1.31 |
| Backend | Django + Django REST Framework | 4.2.30 / 3.16.1 |
| Database | PostgreSQL 16 (prod) / SQLite (dev) | via `dj-database-url` |
| DB driver | psycopg | 3.2.9 |
| WSGI server | Gunicorn | 23.0 |
| LLM (optional) | OpenAI Responses API | `openai` 1.102 |
| Mobile | React Native + Expo | 0.86 / SDK 57 |
| Hosting | Vercel (static) + Render (API) | — |

**Total first-party source:** ~10,200 lines (3,637 services + 3,433 components
+ 3,134 backend).

---

## 2. Natural language processing

### 2.1 Lexicon-based weighted sentiment scoring
`django_backend/wellness/services.py` · `web/src/services/wellnessIntelligence.js`

A **rule-based classifier over a weighted lexicon**, not a bag-of-words count.
Seven emotion classes (`happy, calm, neutral, sad, fatigued, anxious, stressed`)
each own a term list with hand-tuned weights:

```
"burnout" → 3.2    "exhausted" → 3.1    "overwhelmed" → 3.0
"tired"   → 2.5    "good"      → 1.5
```

**Intensity modulation.** Each matched weight is scaled by surrounding modifiers:

```
multiplier = 1.0 + 0.10·(intensifiers present) − 0.08·(softeners present)
score[emotion] += weight × multiplier
```

Intensifiers: *very, really, extremely, deeply, so, totally, completely.*
Softeners: *a bit, a little, kind of, slightly, somewhat.*

**Topic flag boosting.** Six binary topic detectors (`workPressure`,
`sleepDepletion`, `grounding`, `celebration`, `loneliness`, `selfHarm`) add a
further bias to correlated emotions.

**Classification.** `argmax` over the score vector.

**Margin-based confidence.** Confidence is derived from the separation between
the top two candidates, not asserted:

```
confidence = clamp(0.58 + (top₁ − top₂) / 6,  0.58, 0.97)
```

A near-tie therefore yields low confidence automatically.

### 2.2 Hybrid heuristic + LLM refinement
`services.py` → `analyze_text()`

A **two-stage cascade**:

1. The heuristic runs first and produces a baseline.
2. If `OPENAI_API_KEY` is set, that baseline is passed to the LLM *as context*
   with a constrained JSON schema.
3. Results are merged by `_merge_heuristic_and_llm()`:
   - topic flags are **OR-ed** (either source may raise a flag),
   - urgency takes the **maximum** of the two (`_higher_urgency`),
   - emotion is normalised against the valid set before being accepted.

The heuristic is the fallback on any LLM error, timeout, or malformed JSON, so
the system degrades rather than fails.

---

## 3. Multimodal fusion

### 3.1 Score-level (late) fusion
`wellnessIntelligence.js` → `fuseWellnessSignals()`

Rather than voting on three independent classifications, each modality
contributes **additively to a shared score vector** before a single argmax:

```
score[voiceEmotion]    += 1.10
score[faceEmotion]     += 0.95
score[previousEmotion] += 0.35      ← temporal continuity prior
if tension ≥ 65 → score[stressed]  += 1.60
if fatigue ≥ 60 → score[fatigued]  += 1.60
if valence ≥ 78 → score[happy]     += 0.90
if valence ≤ 38 → score[sad]       += 0.90
```

The `previousEmotion` term is a **temporal smoothing prior** — emotional state
is autocorrelated, so the previous reading is weak evidence for the current one.

### 3.2 Modality reliability weighting
`services.py` → `MODE_WEIGHTS`

```
text 1.00 · voice 1.05 · video 0.95 · combo 1.15
```

Multimodal input is trusted most; vision alone least.

### 3.3 Transcript primacy
`services.py` → `_apply_acoustic_adjustment()`

Prosody may adjust **confidence** (±0.04–0.05) but can **never override the
emotion label** chosen from the transcript. Words carry the meaning; tone only
indicates intensity.

---

## 4. Burnout scoring

### 4.1 Triple-weighted moving average
`services.py` → `format_burnout_snapshot()`

Each of the 10 most recent logs is weighted by three independent factors:

```
recencyᵢ    = 1 / (1 + 0.38·i)        ← hyperbolic decay, i = 0 is newest
confidenceᵢ = max(detail.confidence, 0.45)
modeᵢ       = MODE_WEIGHTS[source_mode]

wᵢ          = recencyᵢ × confidenceᵢ × modeᵢ

burnout     = round(100 × Σ(scoreᵢ·wᵢ) / Σwᵢ)
```

Hyperbolic (rather than exponential) decay keeps older entries meaningfully
present instead of collapsing to near-zero after a few steps.

Emotion → risk mapping:
`calm 0.12 · happy 0.18 · neutral 0.42 · sad 0.58 · fatigued 0.66 · anxious 0.78 · stressed 0.90`

### 4.2 Banding

```
≥ 70 → High      "Sustained strain detected"
≥ 45 → Moderate  "Recovery pacing recommended"
<  45 → Low      "Healthy equilibrium"
```

### 4.3 Trend detection by window comparison

Compares the recent window against a lagging window (`logs[5:14]`) with a
dead-band to suppress noise:

```
δ = mean(recent) − mean(prior)
δ >  0.08 → "rising"
δ < −0.08 → "improving"
otherwise → "steady"
```

### 4.4 Weighted mode for dominant emotion

The dominant emotion is the `argmax` of a **weight-accumulating `Counter`**, not
a raw frequency count — so one high-confidence recent entry can outweigh several
stale low-confidence ones.

---

## 5. Computer vision

`web/src/services/faceEmotionDetector.js`

A **deterministic optical heuristic**, not a trained model. No weights are
shipped and every decision is traceable.

**Pipeline**

1. **Downsample** the frame to 160×120 via `drawImage` (≈98% pixel reduction).
2. **Extract** the central region (25–75% x, 20–85% y) to exclude background.
3. **Luminance** per pixel, ITU-R BT.601: `Y = 0.299R + 0.587G + 0.114B`.
4. **Edge energy** by horizontal first-difference: `Σ|Y(x+1) − Y(x)|`.
5. **Region contrast ratios** against the frame mean:
   - brow zone (28–42% height) → furrowing casts shadow, lowering the ratio
   - mouth zone (62–78% height) → a smile raises it

**Decision rules**

```
browRatio < 0.88 or edgeDensity > 18   → stressed
mouthRatio > 1.08 and browRatio ≥ 0.95 → happy
meanLuminance < 75 or edgeDensity < 6  → fatigued
otherwise                              → calm
```

**Sampling: 2 fps (500 ms).** The loop is synchronous, so running it per
animation frame saturates a core and stalls paint. One shared constant
(`ANALYSIS_INTERVAL_MS`) governs both camera surfaces.

**Exponential moving average** smooths the continuous measures so a single noisy
frame cannot spike the meters:

```
value ← 0.6·previous + 0.4·current      (α = 0.4)
```

**Privacy:** frames never leave the browser. Only the derived scalars
(`tension`, `fatigue`, `valence`) are transmitted.

---

## 6. Speech synthesis

### 6.1 Neural TTS
`web/src/services/kokoroEngine.js`

- **Model:** Kokoro 82M, StyleTTS2 architecture, ONNX format.
- **Execution provider:** WebGPU where a real adapter is obtainable, otherwise
  WebAssembly. Detection probes `navigator.gpu.requestAdapter()`.
- **Quantisation:** `fp32` on WebGPU, **`q8`** (8-bit) on WASM — ~4× smaller and
  fast enough for real-time on CPU.
- **Code splitting:** loaded through a dynamic `import()`, so the 2.19 MB model
  wrapper is a separate chunk and the app shell stays at 339 KB.

### 6.2 Gapless streaming playback

The technique that prevents audible seams:

1. Text is split at **clause boundaries**, not fixed character counts.
2. Each clause is synthesised into a `Float32Array`.
3. Buffers are scheduled on the **Web Audio sample clock**, each starting
   exactly where the previous ends:
   `cursor = max(cursor, currentTime + 0.01); source.start(cursor)`
4. Playback begins on chunk 1 while chunk 2 is still generating.
5. A **12 ms linear gain ramp** at the head and tail removes the DC click at
   buffer boundaries.
6. A monotonic `playbackToken` invalidates any chunk that resolves after the
   user has moved on.

### 6.3 Prosody conditioning
`web/src/services/prosody.js`

**Text normalisation** — phonetic substitution (`AUM → Ohm`, `432Hz → four
thirty two hertz`, `% → percent`), markdown-link unwrapping (label kept, URL
discarded), and formatting-character removal.

**Breath shaping** — a comma pause is inserted *before* connectives
(`and then`, `because`, `which means`), em-dashes become commas, and `...`
becomes a voiced pause rather than a hard stop.

**Cadence model** — a base rate/pitch adjusted by three independent offsets:

```
base        = 0.93× rate, 1.02× pitch
emotion     = stressed −0.05 · anxious −0.06 · happy +0.03 …
dialect     = en-GB −0.01 · en-IN +0.02
urgency     = high −0.07 · elevated −0.03
```

A crisis reply is therefore the slowest and most intelligible delivery.

### 6.4 Three-tier graceful degradation

```
Kokoro WebGPU  →  Kokoro WASM  →  Web Speech API (device voice)
```

Voice selection never crosses language boundaries — an `en-US` voice reading
Tamil is worse than no audio, so a missing locale falls back to Indian English
rather than to whatever is installed.

---

## 7. Procedural audio synthesis

`audioAmbiance.js` (5 soundscapes) · `meditationEngine.js`

No audio files ship. Everything is generated at runtime — 11 oscillators, 8 gain
stages and 5 biquad filters across the two engines.

| Technique | Where |
|---|---|
| **Subtractive synthesis** — noise through a lowpass filter | Rain |
| **Brown noise by integration** — running sum of white noise (−6 dB/octave) | Rain texture |
| **Additive synthesis** — stacked sine partials | Tibetan bowl, celestial pad |
| **LFO amplitude modulation** — 8 s swell period | Ocean waves |
| **Biquad filtering** — `lowpass`, `bandpass`, `peaking` | All beds |
| **Binaural//isochronic tones** — 432 Hz, 528 Hz, 136.1 Hz (Om) | Bowl, pad, AUM drone |
| **Breath-rate modulation** — 12 s pranayama cycle | AUM drone |

---

## 8. Personalisation

### 8.1 Archetype tone shaping
`archetypes.js` — four onboarding archetypes, each with an opener, a closing
invitation, and a pacing descriptor. Composition order:

```
clinical content → archetype opener → regional filler → vernacular warmth
```

### 8.2 Vernacular register injection
`vernacular.js` — seven Latin-script code-switched registers (Indian English,
Hindi, Kannada, Telugu, Tamil, Malayalam, Marathi) × three familiarity tiers,
selected by a continuous 0–100 slider:

```
0–33 formal · 34–66 friendly · 67–100 home comfort
```

Phrase rotation is index-based (`list[turn mod length]`) so consecutive replies
never repeat a filler.

### 8.3 Safety interlock

**Every** personalisation layer checks urgency first and returns the message
untouched when `urgency === 'high'` or the self-harm flag is set. Crisis wording
is reviewable as a fixed string rather than assembled at runtime from four
independent transformations. Enforced in `injectVernacular`, `applyPersonaVoice`
and `buildComfortResponse`, and covered by tests.

### 8.4 Region-aware crisis resources
`crisisResources.js` — helplines resolve from the onboarding language (all seven
Indian registers → India), with a timezone/locale guess before any choice
exists. Numbers are `tel:`/`sms:` URIs for one-tap dialling.

---

## 9. Streaks

`streaks.js`

1. **Day bucketing** — timestamps collapse to local calendar day keys, so
   multiple check-ins in one day count once and streaks follow the user's
   midnight rather than UTC.
2. **Grace window** — `GRACE_DAYS = 1`. A single missed day is absorbed; two
   consecutive misses end the streak.
3. **Longest-run scan** for the personal best, retained even after a break.
4. **Weekly progress** — days checked in within a rolling 7-day window.

Design constraint: no message scolds a lapse. A wellness tool that punishes a
bad day works against its own purpose.

---

## 10. Backend API

**20 routes** across 6 groups.

| Group | Endpoints |
|---|---|
| Health | `GET /health` |
| Auth | `register`, `login`, `logout`, `me`, `verify`, `password-reset/request`, `password-reset/confirm` |
| Account | `GET /account/export`, `DELETE /account/delete` |
| Interactions | `POST /interactions/{text,voice,video}` |
| Mood | `GET/POST /mood`, `GET /mood/history`, `GET /mood/burnout-risk` |
| Notifications | `register-token`, `send-alert` |

### 10.1 Data model

`MindGuardUser` — UUID `external_id` exposed publicly while the integer PK stays
internal, preventing enumeration. `MoodLog` — FK to user plus a denormalised
`client_user_id` (indexed) and a `JSONField` for analysis detail.

### 10.2 Unscored inputs

A payload with no transcript and no measured signals returns an explicit
`unscored` result at confidence 0.3 rather than an invented emotion. An earlier
implementation derived emotion from a **CRC32 checksum of the base64 blob** —
numbers that looked like inference but were not, and that polluted the burnout
average. Removed.

---

## 11. Security

| Method | Implementation |
|---|---|
| Password hashing | **PBKDF2-SHA256, 600,000 iterations** (Django default) |
| Session tokens | **HMAC-signed** via `django.core.signing`, salted per purpose (`auth`/`refresh`/`verify`/`reset`) |
| Token type confinement | Access tokens carry `kind: "access"`; a refresh token presented as a bearer is rejected |
| TTL enforcement | `max_age` on `signing.loads` — 12 h access, 14 d refresh, 2 h reset |
| Authorisation | `_resolve_actor()` returns **403** if the requested `userId` is not the caller's |
| Account enumeration | Login and password reset return identical responses for known and unknown addresses |
| Input validation | DRF serializers; signal maps must be flat numeric dicts, ≤20 keys |
| Deletion confirmation | Requires current password re-entry |
| Transport | CORS allow-list; Vercel rewrite keeps normal traffic same-origin |
| Secrets | Environment only; `.env` gitignored, `.env.example` holds placeholders |

---

## 12. Frontend engineering

| Technique | Detail |
|---|---|
| **Code splitting** | Dynamic `import()` isolates the 2.19 MB TTS chunk |
| **Design tokens** | CSS custom properties; amber night mode overrides only the token layer, so every component follows without its own dark rules |
| **Component primitives** | `Button`, `Field`, `Callout`, `Badge`, `Panel`, `OptionCard`, `StatusBanner` |
| **Cold-start mitigation** | Extended request budget until first response, `/health` pre-warm on load, explicit "waking up" banner |
| **Observer pattern** | `subscribe()` on `aiConfig`, `kokoroEngine`, `sanctuaryTheme`, server-wake |
| **PWA** | Manifest + service worker; **network-first** for navigations, **cache-first** for hashed assets, **never cached** for `/api` |
| **Accessibility** | `aria-live` regions, `role="alert"` on errors, real `<label for>` pairing, radio-based option cards, `prefers-reduced-motion` honoured |

---

## 13. Testing

**56 automated tests**, 6 suites:

| Suite | Focus |
|---|---|
| `WellnessApiTests` | Core flows: register → verify → login → interact |
| `AuthFailureTests` | Wrong passwords, tampered tokens, refresh-as-access, cross-user access |
| `NotificationFlowTests` | Token registration, missing tokens, cross-user alerts |
| `InteractionValidationTests` | Blank input, malformed signal maps, oversized payloads, unscored handling |
| `AccountEmailDeliveryTests` | Auto-verify, failed-send reporting, DEBUG-only error exposure |
| `AccountDataRightsTests` | Export contents, hash exclusion, password-confirmed deletion, orphan cleanup |

Plus Node smoke suites asserting prosody conditioning, the crisis-path bypass in
every language, and that no US number can appear in the India helpline set.

---

## 14. Measured metrics

| Metric | Value |
|---|---|
| App shell JS | 339 KB (**106 KB gzip**) |
| App shell CSS | 47 KB (**9.4 KB gzip**) |
| TTS chunk (lazy) | 2.19 MB (905 KB gzip) |
| ONNX WASM runtime (lazy) | 21.6 MB (5.2 MB gzip) |
| Production build time | ~0.75 s |
| Backend tests | 56 passing |
| API routes | 20 |
| CV sampling | 2 fps / 500 ms |
| Kokoro voices | 28 (`en-us`, `en-gb`) |
| Language registers (text) | 7 |
| Runtime dependencies | 4 |

**Not measured:** end-to-end voice latency has not been benchmarked. Do not
quote a figure. The correct answer is how you would measure it —
`performance.now()` around `tts.generate()`, split by execution provider and
clause length.

---

## 15. Known limitations

1. **No Indic speech.** Kokoro ships `en-us` and `en-gb` only. The text layer
   covers seven languages; the voice layer depends on a device voice for that
   locale, falling back to Indian English. Genuine Indic TTS requires a
   server-side engine such as Piper.
2. **Vision is a heuristic, not a model.** Sensitive to lighting, tuned by hand.
3. **Voice latency unmeasured.**
4. **No frontend test suite.** Backend has 56 tests; React has none.
5. **Acoustic features unused client-side.** The API accepts and scores
   `voiceFeatures`, but the browser does not yet compute them.
6. **Free-tier constraints.** Render's database expires after 30 days and the
   web service sleeps after ~15 minutes idle.
