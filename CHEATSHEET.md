# MindGuard — Viva Cheat Sheet

## Open with this

> "Ma'am, it's a **React + Django** project. Frontend **JavaScript**, backend
> **Python**, database **PostgreSQL**. The core algorithms are
> **weighted-lexicon sentiment classification** for emotion detection, a
> **triple-weighted moving average** for the burnout score, **score-level late
> fusion** to combine voice/face/text, and a **neural TTS model running on ONNX
> inside the browser**."

---

## Languages

| Python 3.11 | JavaScript ES2022 | SQL | HTML5 / CSS3 |
|---|---|---|---|
| Backend API | Frontend + mobile | Database | UI / theming |

## Frameworks

**Frontend** React 19 · Vite 8 · kokoro-js · ONNX Runtime Web
**Backend** Django 4.2 · Django REST Framework 3.16 · Gunicorn · psycopg 3
**Database** PostgreSQL 16 (prod) · SQLite (dev)
**Mobile** React Native 0.86 · Expo SDK 57
**Hosting** Vercel (frontend) · Render (backend)

---

## Backend algorithms — Python

| # | Algorithm | What it does |
|---|---|---|
| 1 | **Weighted Lexicon Classification** | 7 emotions, weighted terms (`burnout`=3.2), argmax |
| 2 | **Intensity Modulation** | `1.0 + 0.10×intensifiers − 0.08×softeners` |
| 3 | **Margin-Based Confidence** | `clamp(0.58 + (top₁−top₂)/6, 0.58, 0.97)` |
| 4 | **Hybrid Rule + LLM Cascade** | Heuristic → LLM refines → merged; heuristic is fallback |
| 5 | **Triple-Weighted Moving Average** | `wᵢ = recencyᵢ × confidenceᵢ × modeᵢ`, `recencyᵢ = 1/(1+0.38i)` |
| 6 | **Dead-Band Window Comparison** | Trend; ignores drift under ±0.08 |
| 7 | **PBKDF2-SHA256** | Password hashing, 600,000 iterations |
| 8 | **HMAC-SHA256 Signed Tokens** | Auth, per-purpose salts, TTL enforced |

## Frontend algorithms — JavaScript

| # | Algorithm | What it does |
|---|---|---|
| 1 | **Score-Level Late Fusion** | Voice +1.10, face +0.95, prior +0.35 into one vector → argmax |
| 2 | **BT.601 Luminance + Edge Energy** | `Y = 0.299R+0.587G+0.114B`; brow=tension, mouth=smile |
| 3 | **Exponential Moving Average** | `0.6×old + 0.4×new` (α=0.4) smooths meters |
| 4 | **Neural TTS Inference** | Kokoro 82M ONNX, q8 quantised, WebGPU→WASM |
| 5 | **Sample-Accurate Scheduling** | Clause-split, audio-clock queued, 12ms anti-click ramp |
| 6 | **Rule-Based Text Normalization** | `AUM→Ohm`, `432Hz→four thirty two hertz`, breath pauses |
| 7 | **Procedural Audio Synthesis** | Subtractive, additive, brown-noise integration, LFO |
| 8 | **Grace-Window Streaks** | Day bucketing, longest-run scan, 1 miss forgiven |

---

## Three things that make it novel

1. **The AI voice runs entirely in the browser.** 82M-parameter neural model on
   ONNX — no cloud GPU, no per-word cost, and no audio ever leaves the device.
2. **Safety bypasses every personalisation layer.** Four layers reshape normal
   replies; a crisis message is returned untouched. Enforced in code, covered
   by tests.
3. **Fake inference was found and removed.** Voice and video emotion came from a
   CRC32 checksum of the upload — meaningless numbers polluting the burnout
   average. Replaced with an explicit `unscored` result at 0.3 confidence.

---

## Numbers

**56** tests passing · **20** API endpoints · **~10,200** lines of own code ·
**106 KB** gzipped app shell · **4** runtime dependencies ·
**2 fps** vision sampling · **7** language registers · **28** neural voices

> ⚠️ Do **not** quote a voice-latency figure — never benchmarked. Correct answer:
> *"I'd wrap `tts.generate()` in `performance.now()`, split by execution provider
> and clause length."*

---

## Likely questions

**"Is the vision part machine learning?"**
No — a deterministic optical heuristic. No trained weights, nothing to
download, and every decision is traceable. Its limits are lighting sensitivity
and hand-tuned thresholds.

**"Why not use ElevenLabs or Google TTS?"**
Both bill per character and send every spoken word of a mental-health
conversation to a third party. Running Kokoro locally costs nothing per word
and keeps audio on the device.

**"Why no Hindi voice, if you support Hindi text?"**
Kokoro v1.0 ships `en-us` and `en-gb` speakers only — no Indic speaker exists in
the model. The text layer covers seven languages; speech falls back to the
device voice for that locale, or Indian English. Real Indic TTS would need a
server-side engine such as Piper.

**"How do you know the emotion detection is right?"**
I don't claim certainty — that's why confidence is derived from the margin
between the top two candidates, and why an input with no real signal is stored
as `unscored` rather than guessed.

Full detail: **`METHODS.md`**
