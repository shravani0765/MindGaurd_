# MindGuard — A Culturally Grounded, Privacy-First Multimodal Wellbeing Companion

**Project Report**

---

## Abstract

Mental wellness applications in common use suffer from three practical
shortcomings: they present as clinical assessment forms rather than
conversations, they speak in a linguistic register foreign to Indian users, and
they transmit deeply personal disclosures to third-party cloud services.

MindGuard is a web application that addresses all three. It conducts wellbeing
check-ins through text, voice, or camera; infers emotional state by combining
those channels; tracks a burnout trend over time; and replies in the user's own
language at a familiarity level they control, from formal English through to
code-switched Hinglish, Kanglish, Tenglish, Tanglish, Manglish, or Minglish.

Its defining architectural property is that **inference happens on the user's
own device**. An 82-million-parameter neural speech model executes in the
browser via WebGPU, and facial analysis runs on the local canvas. No audio
recording and no video frame is ever transmitted. A second defining property is
a **verified safety interlock**: four independent personalisation layers all
bypass themselves when distress is detected, so crisis wording is delivered as
reviewed text rather than assembled at runtime.

The implementation comprises approximately 14,500 lines of first-party code
across a React frontend, a Django REST backend, and a React Native mobile
client, validated by 65 automated tests.

---

## 1. Introduction

### 1.1 Problem statement

**Clinical coldness.** Most wellness tools ask the user to rate their mood from
1 to 10 and return a chart. This collects data but offers no relationship, and
the interaction feels like paperwork at exactly the moment a person needs the
opposite.

**Western linguistic bias.** Commercial assistants respond in a register with
no relationship to how an Indian user speaks to someone they trust. The
distance between *"I understand your concern"* and *"Arre yaar, main hoon na"*
is the distance between a form and a friend.

**Cost and privacy of cloud inference.** Studio-grade speech synthesis bills per
character and transmits every spoken word of a mental health conversation to a
third party. For this domain, that is the wrong trade on both axes
simultaneously.

**Text-only blindness.** A system that reads only typed words cannot notice that
the user has been holding their jaw tight for ten minutes.

### 1.2 Objectives

1. Conduct wellbeing check-ins across three input modalities — text, voice, and
   camera — within a single coherent interface.
2. Infer emotional state by fusing signals from all available modalities rather
   than relying on typed text alone.
3. Perform speech synthesis and facial analysis entirely on the client device,
   so that no audio or video leaves the browser.
4. Generate replies in the user's chosen Indian language at a user-controlled
   familiarity level.
5. Guarantee, and verify by test, that crisis situations bypass every
   personalisation layer and surface region-appropriate helplines.
6. Track a burnout trend that weights recent, confident, and multimodal
   observations more heavily than stale or uncertain ones.
7. Deploy the system publicly at zero recurring infrastructure cost.

### 1.3 Scope

**In scope.** Authenticated accounts; text, voice, and video check-ins;
on-device neural speech synthesis; client-side facial signal extraction;
burnout trend analysis; seven language registers in the text layer; procedurally
generated soundscapes; guided breathwork; data export and account deletion;
progressive web app installation.

**Out of scope.** Clinical diagnosis; therapist matching or referral; group or
peer features; native iOS and Android store builds; Indic *speech* synthesis
(discussed in §9.1).

---

## 2. Literature survey and existing systems

| System | Approach | Limitation addressed by MindGuard |
|---|---|---|
| Wysa, Woebot | Scripted CBT dialogue trees | Fixed scripts repeat; no vernacular register |
| Headspace, Calm | Pre-recorded audio libraries | One-directional; no emotional sensing |
| Replika | Cloud LLM companion | All conversation transmitted; no safety interlock |
| Siri, Alexa, Google Assistant | Cloud ASR and TTS | Foreign accent; no emotional continuity |
| ElevenLabs, Google Cloud TTS | Studio cloud synthesis | Per-character billing; audio leaves device |
| Bark, XTTS, Tortoise | Local high-fidelity TTS | Require a discrete GPU; unusable in a browser |

**Identified gap.** No reviewed system combines on-device inference, Indian
vernacular register control, and a verifiable crisis-safety guarantee.

### 2.1 Selected technologies and justification

| Requirement | Chosen | Rejected alternative | Reason |
|---|---|---|---|
| Neural TTS | Kokoro 82M ONNX | Bark, XTTS | Only Kokoro runs in-browser without a GPU |
| Inference runtime | ONNX Runtime Web | TensorFlow.js | Native WebGPU provider; smaller footprint |
| Facial analysis | Canvas 2D heuristic | CNN via TF.js | No weights to download; fully explainable |
| Backend | Django + DRF | Flask, FastAPI | Built-in ORM, auth, admin, and test runner |
| Database | PostgreSQL | MongoDB | Relational data with strong integrity needs |
| Reply generation | Google Gemini | Self-hosted LLM | No GPU budget; free tier sufficient |

---

## 3. System analysis

### 3.1 Functional requirements

| ID | Requirement |
|---|---|
| FR-01 | Register with email verification; authenticate; reset password |
| FR-02 | Accept a check-in by text, voice, or camera |
| FR-03 | Classify emotional state into one of seven categories with a confidence value |
| FR-04 | Persist every check-in against the authenticated account |
| FR-05 | Compute and display a burnout score, band, and trend |
| FR-06 | Speak replies aloud using an on-device neural voice |
| FR-07 | Let the user select archetype, region, language, warmth, and voice |
| FR-08 | Detect distress and engage the comfort layer automatically |
| FR-09 | Display region-appropriate crisis helplines |
| FR-10 | Export all stored data; permanently delete the account |

### 3.2 Non-functional requirements

| ID | Requirement | How met |
|---|---|---|
| NFR-01 | No audio or video leaves the device | Synthesis and vision run client-side; only derived scalars are posted |
| NFR-02 | Function without a paid inference service | Heuristic fallback at every generation point |
| NFR-03 | Survive a cold backend start | Extended first-request budget plus a pre-warm ping |
| NFR-04 | Usable on a mobile browser | Responsive layout; installable as a PWA |
| NFR-05 | Accessible | ARIA live regions, label pairing, reduced-motion support |
| NFR-06 | Zero recurring cost | Free tiers throughout; on-device inference |

### 3.3 Feasibility

**Technical.** Confirmed. The 82M model quantised to 8-bit executes in a browser
on commodity hardware; the WASM path covers devices without WebGPU.

**Economic.** Confirmed. Vercel, Render, Render PostgreSQL, and the Gemini free
tier carry no charge at project scale. Speech synthesis has no marginal cost
because it is local.

**Operational.** Two documented constraints on free hosting: the database is
reclaimed 30 days after creation, and the web service idles out after roughly
15 minutes with a cold start near 50 seconds.

---

## 4. System design

### 4.1 Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                  CLIENT — all inference is local                   │
│                                                                    │
│   🎤 Web Speech API      📹 getUserMedia        💬 Text input      │
│          │                      │                     │            │
│          ▼                      ▼                     ▼            │
│   ┌─────────────┐   ┌────────────────────┐   ┌──────────────┐      │
│   │ transcript  │   │ optical heuristic  │   │  raw text    │      │
│   │             │   │ @ 2 fps (500 ms)   │   │              │      │
│   └──────┬──────┘   └─────────┬──────────┘   └──────┬───────┘      │
│          └────────────┬───────┴─────────────────────┘              │
│                       ▼                                            │
│        ┌──────────────────────────────────┐                        │
│        │  Reply composition pipeline      │                        │
│        │  archetype → region →            │                        │
│        │  vernacular → prosody            │                        │
│        │  (crisis bypasses ALL four)      │                        │
│        └──────────────┬───────────────────┘                        │
│                       ▼                                            │
│   ┌────────────────────────────┐   ┌──────────────────────────┐    │
│   │ Kokoro 82M ONNX            │   │ Comfort layer            │    │
│   │ WebGPU → WASM →            │   │ soundscape + amber dim   │    │
│   │ Web Speech API             │   │ + personal anchor        │    │
│   └────────────────────────────┘   └──────────────────────────┘    │
└───────────────────────────┬────────────────────────────────────────┘
                            │ HTTPS / JSON
                            │ derived signals only —
                            │ never audio, never frames
                            ▼
              ┌─────────────────────────────────────┐
              │      Django REST API (21 routes)    │
              │  auth · mood log · burnout trend    │
              │  text inference · reply generation  │
              │  ┌───────────────────────────────┐  │
              │  │ Gemini API (server-side key)  │  │
              │  └───────────────────────────────┘  │
              │      PostgreSQL 16                  │
              └─────────────────────────────────────┘
```

### 4.2 Module decomposition

**Frontend services (4,045 lines)**

| Module | Responsibility |
|---|---|
| `kokoroEngine.js` | Neural TTS: device selection, generation, gapless scheduling |
| `prosody.js` | Text normalisation, breath pacing, cadence resolution |
| `speech.js` | Recognition, synthesis orchestration, background ducking |
| `wellnessIntelligence.js` | Text signal analysis, multimodal fusion, response construction |
| `faceEmotionDetector.js` | Optical facial signal extraction |
| `vernacular.js` | Seven language registers across three warmth tiers |
| `archetypes.js` | Four user archetypes and three regional registers |
| `crisisResources.js` | Region-resolved helpline directory |
| `geminiClient.js` | Reply generation orchestration and fallback chain |
| `audioAmbiance.js` | Five procedurally synthesised soundscapes |
| `meditationEngine.js` | AUM drone and pranayama pacing |
| `comfortProfile.js` | Personal anchors; comfort layer engagement |
| `sanctuaryTheme.js` | Amber night mode state |
| `streaks.js` | Check-in streak and weekly progress |
| `api.js` | HTTP client, cold-start handling |
| `aiConfig.js` | Persisted preferences |
| `authSession.js` | Session token storage |

**Frontend components (3,647 lines)** — `AuthScreen`, `OnboardingScreen`,
`ChatInterface`, `VoiceAssistantOrb`, `VideoInterface`, `ComboInterface`,
`BurnoutRadar`, `InsightsPanel`, `StreakCard`, `CrisisResources`,
`VoiceStudioModal`, `AiBrainPanel`, `PrivacyPanel`, `WarmthSlider`, plus seven
shared UI primitives.

**Backend (3,007 lines)** — `models`, `views`, `serializers`, `services`
(inference), `companion` (Gemini), `urls`, `admin`, `tests`, and a `checkemail`
management command.

### 4.3 Database schema

**MindGuardUser**

| Column | Type | Notes |
|---|---|---|
| `id` | BigAuto | Internal primary key, never exposed |
| `external_id` | UUID | Public identifier; prevents enumeration |
| `email` | Email | Unique |
| `first_name`, `last_name`, `name` | Char | |
| `password_hash` | Char(128) | PBKDF2-SHA256 |
| `is_verified` | Boolean | Login is refused until true |
| `expo_push_token` | Char(255) | Mobile notifications |
| `burnout_score` | PositiveSmallInt | Cached latest score |
| `last_detected_emotion` | Char(32) | |
| `last_login_at`, `created_at`, `updated_at` | DateTime | |

**MoodLog**

| Column | Type | Notes |
|---|---|---|
| `entry_id` | UUID | Public identifier |
| `user` | FK → MindGuardUser | `SET_NULL` on delete |
| `client_user_id` | Char(64), indexed | Denormalised for query performance |
| `timestamp` | DateTime, indexed | |
| `emotion` | Char(32) | One of seven classes |
| `source_mode` | Char(16) | text / voice / video / combo |
| `details` | JSONField | Confidence, topic flags, engine metadata |

**Relationship.** One user to many mood logs. Because `user` is `SET_NULL`,
account deletion explicitly removes the logs; otherwise they would survive as
orphans (verified by test).

---

## 5. Implementation — algorithms

### 5.1 Emotion classification from text

A rule-based classifier over a weighted lexicon. Seven classes each hold a term
list with hand-tuned weights (`burnout` 3.2, `exhausted` 3.1, `tired` 2.5,
`good` 1.5).

**Intensity modulation**

```
multiplier = 1.0 + 0.10·(intensifiers present) − 0.08·(softeners present)
score[emotion] += weight × multiplier
```

**Topic flag boosting.** Eight binary detectors — `workPressure`,
`sleepDepletion`, `grounding`, `celebration`, `loneliness`, `heartbreak`,
`grief`, `selfHarm` — add further bias to correlated classes.

**Classification.** `argmax` over the score vector.

**Margin-based confidence**

```
confidence = clamp(0.58 + (top₁ − top₂) / 6,  0.58, 0.97)
```

Confidence is *derived from the evidence margin*, not asserted. A near-tie
therefore produces low confidence automatically.

### 5.2 Hybrid heuristic–LLM cascade

1. The heuristic produces a baseline.
2. If a key is configured, the baseline is passed to the LLM as context with a
   constrained output schema.
3. Results merge: topic flags are OR-ed, urgency takes the maximum, and the
   emotion label is validated against the permitted set.
4. Any LLM error, timeout, or malformed response falls back to the heuristic.

### 5.3 Multimodal score-level (late) fusion

Modalities contribute additively to one shared vector before a single argmax:

```
score[voiceEmotion]    += 1.10
score[faceEmotion]     += 0.95
score[previousEmotion] += 0.35      ← temporal continuity prior
if tension ≥ 65 → score[stressed]  += 1.60
if fatigue ≥ 60 → score[fatigued]  += 1.60
if valence ≥ 78 → score[happy]     += 0.90
if valence ≤ 38 → score[sad]       += 0.90
```

Modality reliability weights: `text 1.00 · voice 1.05 · video 0.95 · combo 1.15`.

### 5.4 Burnout scoring

```
recencyᵢ    = 1 / (1 + 0.38·i)          i = 0 is newest
confidenceᵢ = max(detail.confidence, 0.45)
modeᵢ       = MODE_WEIGHTS[source_mode]
wᵢ          = recencyᵢ × confidenceᵢ × modeᵢ

burnout     = round(100 × Σ(scoreᵢ·wᵢ) / Σwᵢ)
```

Emotion-to-risk mapping: `calm 0.12 · happy 0.18 · neutral 0.42 · sad 0.58 ·
fatigued 0.66 · anxious 0.78 · stressed 0.90`.

Hyperbolic rather than exponential decay is used so that older entries remain
meaningfully represented instead of collapsing toward zero after a few steps.

**Banding** — ≥70 High, ≥45 Moderate, otherwise Low.

**Trend** — dead-banded comparison against a lagging window (`logs[5:14]`):

```
δ = mean(recent) − mean(prior)
δ >  0.08 → rising
δ < −0.08 → improving
otherwise → steady
```

### 5.5 Facial signal extraction

1. Downsample the frame to 160×120.
2. Isolate the central region (25–75% horizontal, 20–85% vertical).
3. Per-pixel luminance, ITU-R BT.601: `Y = 0.299R + 0.587G + 0.114B`.
4. Edge energy by horizontal first difference: `Σ |Y(x+1) − Y(x)|`.
5. Region contrast ratios against the frame mean — brow zone (28–42% height)
   darkens with furrowing; mouth zone (62–78%) brightens with a smile.

**Decision rules**

```
browRatio < 0.88  or edgeDensity > 18  → stressed
mouthRatio > 1.08 and browRatio ≥ 0.95 → happy
meanLuminance < 75 or edgeDensity < 6  → fatigued
otherwise                              → calm
```

**Sampling at 2 fps.** The loop is synchronous, so per-animation-frame execution
saturates a CPU core and stalls page paint. Continuous measures are smoothed by
an exponential moving average (α = 0.4) so one noisy frame cannot spike the
displayed meters.

### 5.6 Speech synthesis

**Model.** Kokoro 82M, StyleTTS2 architecture, ONNX format. `fp32` precision on
WebGPU; `q8` 8-bit quantisation on WASM. Loaded behind a dynamic import so it
code-splits away from the application shell.

**Gapless streaming.** Text is split at clause boundaries; each generated buffer
is scheduled on the Web Audio sample clock beginning exactly where the previous
ended (`cursor = max(cursor, currentTime + 0.01)`). Playback therefore starts on
the first clause while later clauses are still generating. A 12 ms linear gain
ramp at each edge removes the DC click at buffer boundaries, and a monotonic
playback token invalidates any chunk resolving after the user has moved on.

**Prosody conditioning.** Phonetic substitution (`AUM → Ohm`, `432Hz → four
thirty two hertz`); markdown-link unwrapping that keeps the label and discards
the URL; comma pauses inserted before connectives; base cadence 0.93× rate and
1.02× pitch, offset per emotion, dialect, and urgency, so a crisis reply is the
slowest and most intelligible delivery.

**Background ducking.** Ambience falls to 22% over a 320 ms ramp while speech
plays and returns over 900 ms. An instantaneous cut would itself be startling.

### 5.7 Vernacular register injection

Seven Latin-script registers × three familiarity tiers, selected by a continuous
0–100 control:

| Range | Tier | Hindi example |
|---|---|---|
| 0–33 | Formal | *Main samajh raha hoon. Ek ek karke dekhte hain.* |
| 34–66 | Friendly | *Haan, sun raha hoon. Apna time lo, koi jaldi nahi.* |
| 67–100 | Home comfort | *Arre yaar, main hoon na. Tension mat le, sab theek ho jayega.* |

Latin script is deliberate: the neural model has no Indic speaker, so a
Devanagari string would be unreadable to it, whereas code-switched Latin text is
legible to an `en-IN` voice and degrades gracefully to any English voice.
Phrases rotate by turn index so consecutive replies never repeat.

### 5.8 Safety interlock

Every personalisation layer — `applyPersonaVoice`, `injectVernacular`,
`buildComfortResponse`, and prosody re-pacing — tests urgency first and returns
the message untouched when `urgency === 'high'` or the self-harm flag is set.
Reply generation returns before any network call on those paths, enforced
**independently in both the client and the server**, because the client is not a
trust boundary. Crisis wording is therefore reviewable as a fixed string rather
than assembled at runtime from four transformations.

### 5.9 Streak computation

Timestamps collapse to local calendar day keys, so multiple check-ins in one day
count once and streaks follow the user's midnight rather than UTC. A grace
window of one day is absorbed; two consecutive misses end the streak. A
longest-run scan retains the personal best even after a break. No message
scolds a lapse — a wellness tool that punishes a bad day works against its own
purpose.

---

## 6. API reference

**21 routes.**

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Liveness probe |
| POST | `/api/auth/register` | Create account, send verification |
| POST | `/api/auth/login` | Issue access and refresh tokens |
| POST | `/api/auth/logout` | Client-side session clear |
| GET | `/api/auth/me` | Current user and burnout snapshot |
| GET | `/api/auth/verify` | Confirm email via signed token |
| POST | `/api/auth/password-reset/request` | Email a reset link |
| POST | `/api/auth/password-reset/confirm` | Apply new password |
| POST | `/api/interactions/text` | Analyse a written check-in |
| POST | `/api/interactions/voice` | Analyse transcript and prosody |
| POST | `/api/interactions/video` | Score facial signals |
| POST | `/api/companion/reply` | Generate a conversational reply |
| GET/POST | `/api/mood` | List or create a mood entry |
| GET | `/api/mood/history` | Recent check-ins |
| GET | `/api/mood/burnout-risk` | Current snapshot |
| GET | `/api/account/export` | Full data export |
| DELETE | `/api/account/delete` | Permanent deletion |
| POST | `/api/notifications/register-token` | Store push token |
| POST | `/api/notifications/send-alert` | Queue a notification |

---

## 7. Testing

**65 automated tests across six suites.**

| Suite | Coverage |
|---|---|
| `WellnessApiTests` | Register → verify → login → interact → trend |
| `AuthFailureTests` | Wrong password, tampered token, refresh-as-access, cross-user access |
| `NotificationFlowTests` | Token registration, missing token, cross-user alert |
| `InteractionValidationTests` | Blank input, malformed signal maps, oversized payloads, unscored handling |
| `AccountEmailDeliveryTests` | Auto-verify, failed-send reporting, DEBUG-only error exposure |
| `AccountDataRightsTests` | Export contents, hash exclusion, password-confirmed deletion, orphan cleanup |
| `CompanionReplyTests` | Reply generation, offline degradation, crisis bypass |

### 7.1 Representative test cases

| # | Case | Input | Expected | Result |
|---|---|---|---|---|
| 1 | Valid registration | Complete form | 201; account created | Pass |
| 2 | Password mismatch | Differing confirmation | 400 | Pass |
| 3 | Unverified login | Correct credentials, unverified | 403 | Pass |
| 4 | Wrong password | Bad password | 401, no token | Pass |
| 5 | Unknown email | Absent address | 401, identical message | Pass |
| 6 | Refresh token misuse | Refresh as bearer | 401 | Pass |
| 7 | Tampered token | Mutated signature | 401 | Pass |
| 8 | Cross-user read | Another user's `userId` | 403 | Pass |
| 9 | Cross-user write | Another user's mood entry | 403; nothing stored | Pass |
| 10 | Stress detection | "stressed after deadlines" | emotion = stressed | Pass |
| 11 | Heartbreak detection | "my love failed" | `heartbreak` flag; sad; connection style | Pass |
| 12 | Burnout accumulation | Two stressed entries | score ≥ 70 | Pass |
| 13 | Unscored input | Opaque base64, no transcript | `unscored`, confidence 0.3 | Pass |
| 14 | Unscored isolation | Three unscored entries | Score stays in Low band | Pass |
| 15 | Malformed signals | `{"tension": "very high"}` | 400 | Pass |
| 16 | Oversized signals | 25 keys | 400 | Pass |
| 17 | **Crisis bypass (client)** | High urgency | Returns null, zero network calls | Pass |
| 18 | **Crisis bypass (server)** | Self-harm flag | `crisis-path`; `urlopen` never called | Pass |
| 19 | Email failure reporting | SMTP raises | 201 with `emailDelivered: false` | Pass |
| 20 | Export excludes secrets | Authenticated export | No password hash present | Pass |
| 21 | Deletion requires password | Wrong password | 403; account intact | Pass |
| 22 | Deletion cascades | Correct password | User and logs both removed | Pass |
| 23 | Vernacular safety | Crisis text, warmth 100 | Message returned verbatim | Pass |
| 24 | Helpline regionalisation | Any Indian language | India set; no 911 present | Pass |
| 25 | Invite rotation | Three consecutive turns | Three distinct questions | Pass |

---

## 8. Results

### 8.1 Build and deployment metrics

| Metric | Value |
|---|---|
| Application shell (JS) | 353 KB → **111 KB gzipped** |
| Application shell (CSS) | 48 KB → **9.6 KB gzipped** |
| TTS chunk (lazy-loaded) | 2.19 MB → 905 KB gzipped |
| ONNX runtime (lazy-loaded) | 21.6 MB → 5.2 MB gzipped |
| Production build time | ≈0.75 s |
| Runtime dependencies | 4 |

### 8.2 System metrics

| Metric | Value |
|---|---|
| First-party source | ≈14,500 lines |
| API routes | 21 |
| Automated tests | 65, all passing |
| Emotion classes | 7 |
| Topic detectors | 8 |
| Language registers (text) | 7 |
| Neural voices available | 28 (`en-us`, `en-gb`) |
| Facial sampling rate | 2 fps (500 ms) |
| Procedural soundscapes | 5 |

### 8.3 Functional outcomes

- All ten functional requirements implemented and exercised by tests.
- Zero audio or video bytes transmitted; verifiable in the browser network panel.
- Speech synthesis carries no marginal cost, being entirely local.
- Crisis bypass verified independently on client and server.
- Deployed publicly at zero recurring cost.

### 8.4 Defects found and corrected during development

Recording these is part of the result, since each was a real fault in an earlier
iteration.

| Defect | Impact | Resolution |
|---|---|---|
| Emotion derived from a **CRC32 checksum** of the uploaded payload | Fabricated scores polluted the burnout average | Replaced with transcript- and signal-based inference; explicit `unscored` state |
| Facial meters driven by `Math.random()` | Displayed values unrelated to the camera | Wired to the real frame analyser |
| Vision loop inside `requestAnimationFrame` | Synchronous pixel loop at ~60 fps saturated a core | Throttled to a shared 500 ms interval |
| Crisis helplines US-only (988, 911) | Indian users directed to unreachable numbers | Region-resolved directory |
| 7 s request timeout against a ~50 s cold start | First visit appeared broken | Extended first-request budget plus pre-warm |
| `fail_silently=True` on verification email | Accounts permanently unverifiable, no log | Errors logged and reported to the client |
| One closing question per language tier | Every reply ended identically | Three per tier, rotated by turn |
| Punctuation cleanup consumed the ellipsis pause | Breath pause lost before synthesis | Dot-run exclusion in the tidy rule |
| `atRisk` never triggered for the commonest case | Streak warning never shown | Condition corrected to any gap ≥ 1 day |

---

## 9. Limitations

1. **No Indic speech synthesis.** Kokoro v1.0 publishes `en-us` and `en-gb`
   speakers only. The text layer covers seven languages; the voice layer depends
   on a device voice for the target locale and otherwise falls back to Indian
   English. True Indic TTS requires a server-side engine such as Piper.
2. **Facial analysis is a heuristic, not a learned model.** It is sensitive to
   lighting and its thresholds were tuned by hand.
3. **Voice latency is unmeasured.** No benchmark figure is claimed.
4. **No frontend test suite.** The backend has 65 tests; the React layer has none.
5. **Acoustic features unused client-side.** The API accepts and scores
   `voiceFeatures`, but the browser does not yet compute them.
6. **No accuracy evaluation.** The classifier has not been measured against a
   labelled dataset, so no precision or recall figures exist.
7. **Free-tier operational limits.** Database reclaimed after 30 days; service
   idles out with a ~50 s cold start.

---

## 10. Future scope

1. **Accuracy evaluation.** Benchmark the classifier against a labelled corpus
   and report per-class precision, recall, F1, and a confusion matrix.
2. **Fusion ablation study.** Measure text-only against text-plus-voice against
   full fusion, to establish empirically whether fusion earns its complexity.
3. **Indic speech via Piper.** A FastAPI service hosting Piper ONNX with `hi_IN`
   voices, which is also the route to genuine sub-100 ms synthesis.
4. **Latency instrumentation.** Wrap generation in `performance.now()` and report
   distributions by execution provider and clause length.
5. **Learned facial model.** Replace the heuristic with a compact CNN and
   compare accuracy against the current rules.
6. **Client-side acoustic features.** Compute pitch variance and energy from the
   analyser node to activate the existing server-side prosody scoring.
7. **Clinician-reviewed content.** Have the crisis and grounding text reviewed by
   a qualified mental health professional.

---

## 11. Conclusion

MindGuard demonstrates that a multimodal conversational wellbeing system can run
its inference on ordinary consumer hardware, without a cloud GPU and without
transmitting a user's voice or face anywhere. The architecture makes privacy a
structural property rather than a policy claim: it holds because of where the
code executes, and it can be demonstrated by inspecting the network panel.

Two contributions are worth isolating. First, **register control as an
engineering concern** — seven Indian language registers on a continuous
familiarity scale, rather than a single translated string set. Second, and more
important, a **verified safety interlock**: four personalisation layers that
provably disable themselves under distress, enforced independently on both
client and server and covered by tests asserting that no network call occurs.

The project's principal weakness is the absence of quantitative evaluation. The
system is built and tested for correctness, but its classification accuracy has
not been measured against labelled data. That is the first item of future work,
and the honest reading is that until it is done, claims about detection quality
remain unproven.

---

## 12. References

1. Hexgrad. *Kokoro-82M*. Hugging Face. `huggingface.co/hexgrad/Kokoro-82M`
2. ONNX Runtime Web documentation. `onnxruntime.ai/docs/tutorials/web/`
3. Li, Y. et al. *StyleTTS 2: Towards Human-Level Text-to-Speech*. NeurIPS 2023.
4. Django Software Foundation. *Django 4.2 Documentation*.
5. Django REST Framework documentation. `django-rest-framework.org`
6. W3C. *Web Audio API Specification*.
7. W3C. *Web Speech API Specification*.
8. W3C. *WebGPU Specification*.
9. ITU-R Recommendation BT.601: *Studio encoding parameters of digital television*.
10. Google. *Gemini API Documentation*. `ai.google.dev`
11. Ministry of Health and Family Welfare, Government of India. *Tele-MANAS*. `telemanas.mohfw.gov.in`
12. React documentation. `react.dev`

---

## Appendix A — Repository layout

```
MindGuard/
├── web/                        React + Vite frontend
│   ├── src/services/           17 service modules (4,045 lines)
│   ├── src/components/         14 components + 7 UI primitives (3,647 lines)
│   └── public/                 PWA manifest, service worker, icons
├── django_backend/             Django REST API (3,007 lines)
│   ├── wellness/               models, views, serializers, services,
│   │                           companion, tests (65 cases)
│   └── config/                 settings, urls, wsgi/asgi
├── mobile/                     React Native + Expo client (702 lines)
├── render.yaml                 Backend blueprint (self-wiring)
├── vercel.json                 Frontend config with /api proxy
├── METHODS.md                  Algorithms and techniques reference
├── DEPLOYMENT.md               Deployment and troubleshooting guide
├── CHEATSHEET.md               One-page viva reference
└── REPORT.md                   This document
```

## Appendix B — Deployment configuration

| Variable | Location | Purpose |
|---|---|---|
| `DJANGO_SECRET_KEY` | Render | Token signing (auto-generated) |
| `DATABASE_URL` | Render | PostgreSQL connection (blueprint-linked) |
| `ALLOWED_HOSTS` | Render | Accepted Host header |
| `FRONTEND_URL` | Render | Verification link construction |
| `CORS_ALLOWED_ORIGINS` | Render | Permitted browser origins |
| `GEMINI_API_KEY` | Render | Reply generation — **server-side only** |
| `EMAIL_HOST_USER` / `_PASSWORD` | Render | Brevo SMTP credentials |
| `DEMO_AUTO_VERIFY` | Render | Bypass email verification (demo only) |

**Design note.** The Gemini key is held server-side deliberately. A Vite
environment variable is inlined into the JavaScript bundle at build time and is
therefore readable by anyone with developer tools, which for a metered API means
any visitor could consume the quota.
