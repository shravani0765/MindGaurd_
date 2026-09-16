# MindGuard — Research Findings and Prioritised Roadmap

Researched September 2026, in response to the feedback that the project "looks
simple." That feedback was about **missing measurement**, not missing features.
Everything below is ordered by how much it changes that.

---

## Summary of findings

| # | Finding | Why it matters |
|---|---|---|
| 1 | A **labelled Hinglish emotion dataset** exists, with a published F1 baseline | Converts the project from "built" to "evaluated" — and it is code-mixed, so it matches the cultural thesis exactly |
| 2 | **2026 chatbot safety laws** now mandate crisis protocols | The safety interlock is not just a feature; it is regulatory alignment ahead of requirement |
| 3 | The burnout score has **no clinical grounding** | PHQ-9 / GAD-7 are the validated instruments, and correlating against them is a second evaluation |
| 4 | **Indic TTS is solved** by Piper / AI4Bharat / IndicF5 | The project's headline limitation is closable |

---

## 1. Evaluation: the SentiMix Hinglish emotion dataset

**This is the single highest-value finding.**

SemEval-2020 Task 9 released a Hinglish (Hindi–English) corpus of **20,000
code-mixed instances** with word-level language identification and
sentence-level sentiment labels. Critically, a later work **re-annotated those
same 20,000 instances with emotion labels** using Ekman's basic emotions.

**Why this is close to ideal for this project:**

- It is **code-mixed Hinglish**, not translated English. The project's central
  claim is that Indian users communicate in code-mixed language; this dataset is
  drawn from exactly that distribution.
- It has a **published competitive baseline**: 61 teams submitted systems, and
  the best Hinglish result was **75.0% F1**. That is a citable number to
  benchmark against, which is far stronger than reporting an isolated accuracy.
- Emotion labels map onto the existing seven-class scheme with modest
  reconciliation work.

**What to produce from it**

1. Per-class precision, recall, and F1 for the current weighted-lexicon classifier.
2. A 7×7 confusion matrix — this is the single most convincing artefact to put in
   a results chapter.
3. A three-way comparison table: **lexicon baseline vs. a trained classifier
   (TF-IDF + logistic regression, or fine-tuned multilingual BERT) vs. Gemini
   zero-shot**, all on the same held-out split.
4. A stated position relative to the 75.0% SemEval result.

This alone answers *"where is your machine learning?"* and *"what is your
accuracy?"* — the two questions currently unanswerable.

> **Caveat to verify before relying on it:** confirm the licence and redistribution
> terms of both the original SentiMix release and the emotion-annotated
> derivative before including any of it in a submission.

---

## 2. Regulatory alignment — the project is accidentally ahead

The regulatory landscape changed in 2026, and it changed in the project's favour.

**California SB 243** took effect **1 January 2026** and requires operators of
companion chatbots to:
- disclose non-human status,
- implement mental-health crisis protocols,
- provide specific protections for minors.

**Nebraska's Conversational AI Safety Act** was enacted 14 April 2026 (effective
July 2027), and **Georgia SB 540** is among the most detailed on crisis
handling: when a user expresses suicidal ideation, a covered system must
**interrupt the conversation and refer the user to crisis resources**. Some
statutes additionally require **annual reporting of the number of safety
protocol activations**.

**Why this is a research contribution, not just compliance**

A 2026 systematic scoping review of safety mechanisms in generative-AI mental
health chatbots found crisis-response performance to be **inconsistent** across
systems: variable recognition of suicide risk, inconsistent escalation, limited
referral quality, and instability across model updates.

MindGuard's interlock is **deterministic rather than model-dependent**. The
crisis path returns reviewed text before any model call, is enforced in both
client and server, and is covered by tests asserting that no network request
occurs. That is precisely the property the review found missing — and it is a
defensible claim to make in a report, because the tests demonstrate it.

### Compliance gaps to close (all small)

I audited the codebase against SB 243:

| Requirement | Status | Fix |
|---|---|---|
| Crisis detection and referral | ✅ Implemented and test-verified | — |
| Region-appropriate crisis resources | ✅ Implemented | — |
| **Disclose non-human status** | ⚠️ Only inside the model prompt and the signup disclaimer — never stated in the conversation UI | Add a persistent "AI companion, not a human" affordance in the chat and voice panels |
| **Protections for minors** | ❌ No age collection at all | Add an age field at signup; route under-18 accounts to a stricter mode |
| **Periodic break reminders** | ❌ None | Remind the user after a long continuous session |
| **Safety activation audit log** | ❌ Activations are not counted or stored | Persist a counter of crisis-path activations |

Closing these takes little effort and gives the report a **Regulatory Compliance**
section, which very few student projects have.

---

## 3. Clinical validity of the burnout score

The current 0–100 score is internally coherent — recency-weighted,
confidence-weighted, modality-weighted — but it is **not a clinically validated
instrument**, and a panel is entitled to ask what it means.

The established instruments are:

| Instrument | Measures | Cutoff | Reported performance |
|---|---|---|---|
| **PHQ-9** | Depression severity | ≥ 10 | ~88% sensitivity and specificity |
| **GAD-7** | Anxiety severity | ≥ 7 to ≥ 10 | ~92% sensitivity, ~76% specificity |
| **Maslach Burnout Inventory** | Burnout specifically | subscale-based | The reference instrument for burnout |

**The opportunity is not just credibility — it is a second evaluation.**

Administer PHQ-9 or GAD-7 periodically (they are short), then measure the
**correlation between the passive burnout score and the validated instrument**.
That produces a genuine research question with a real answer:

> *Does a passively computed multimodal burnout score track a validated
> depression or anxiety score?*

Either outcome is publishable in a report. A positive correlation validates the
passive approach; a weak one is an honest negative result, which panels respect
more than an unexamined claim.

> **Important caution:** PHQ-9 item 9 asks directly about suicidal ideation. If
> that instrument is added, a non-zero response on item 9 **must** route
> immediately into the existing crisis path. Do not add the questionnaire
> without wiring that.
>
> Also note the validity of these instruments has **not** been established for
> many low- and middle-income contexts, so present them as screening references
> rather than diagnoses.

---

## 4. Indic speech synthesis — the headline limitation is closable

The report currently states that no Indic voice exists in the browser. That is
true of Kokoro, but not of the wider field:

| Option | Coverage | Notes |
|---|---|---|
| **Piper (Rhasspy)** | 30+ languages including Hindi | Built explicitly for **edge devices with no GPU**; needs a small server process |
| **AI4Bharat Indic-TTS** | **13 Indian languages** — incl. Kannada, Telugu, Tamil, Malayalam, Marathi | Open-sourced; covers every language already in the text layer |
| **IndicF5** | 11 Indian languages | Trained on 1,417 hours; described as near-human polyglot |

**Recommended path:** a small FastAPI service running Piper ONNX, called by the
existing `/companion/reply` flow. This is also the only credible route to the
sub-100 ms synthesis figure, since Piper was designed for CPU-only real-time use.

**Known hard problem to mention in the report:** Hindi is written in Devanagari,
an abugida where each consonant carries an inherent vowel unless modified.
Knowing when that vowel is silent — the **schwa-deletion problem**, as in
नमस्ते read *namaste* not *namasté* — is the defining difficulty in natural
Hindi synthesis. Naming this demonstrates real understanding of the domain.

---

## Prioritised roadmap

### Tier 1 — converts "simple" into "rigorous"

| # | Item | Effort | Payoff |
|---|---|---|---|
| 1 | **Benchmark on SentiMix Hinglish** — confusion matrix, per-class F1, vs. 75.0% SOTA | Medium | Highest. Creates the missing Results chapter |
| 2 | **Train a comparison classifier** — TF-IDF + logistic regression, or fine-tuned multilingual BERT | Medium | Answers "where is your ML?" |
| 3 | **Fusion ablation study** — text-only vs. text+voice vs. full fusion | Low | Tests the core architectural claim; either result is a finding |

### Tier 2 — cheap, and unusually strong in a report

| # | Item | Effort | Payoff |
|---|---|---|---|
| 4 | **AI disclosure in the conversation UI** | Very low | SB 243 requirement |
| 5 | **Age gate + minor mode + break reminders** | Low | SB 243 requirement |
| 6 | **Crisis activation audit counter** | Low | Matches statutory reporting duties |
| 7 | **PHQ-9 / GAD-7 with item-9 crisis routing** | Medium | Clinical grounding **and** a correlation study |

### Tier 3 — genuine capability gains

| # | Item | Effort | Payoff |
|---|---|---|---|
| 8 | **Indic TTS via Piper or AI4Bharat** | High | Closes the headline limitation |
| 9 | **Latency benchmarking harness** | Low | Converts the edge-first claim into evidence |
| 10 | **Learned facial model vs. heuristic comparison** | High | Another measured comparison |
| 11 | **Frontend test suite** | Medium | Closes the 65-vs-0 test asymmetry |

---

## Suggested feature additions, ranked by user value

1. **Weekly reflection digest** — a short summary of the week's pattern, which is
   where a trend actually becomes useful to a person.
2. **Trigger correlation** — surface that stress consistently peaks on particular
   days or after particular topic flags. The data to do this is already stored.
3. **Guided breathing with real pacing** — the meditation engine exists; drive a
   visual pacer from it.
4. **Crisis contact card** — let the user pre-nominate one trusted person, shown
   alongside helplines during distress.
5. **Offline-first check-ins** — queue entries in IndexedDB when the network is
   unavailable and sync later. The service worker already exists.
6. **Consent-gated data sharing** — export a clinician-readable summary, which
   makes the tool useful *alongside* professional care rather than instead of it.

---

## What I would do first, if only one thing

**Item 1 — the SentiMix benchmark.**

Everything else is incremental. That one produces a confusion matrix, a
comparison table, and a defensible answer to *"what is your accuracy?"* — and
because the dataset is code-mixed Hinglish, it simultaneously validates the
cultural claim that the whole project rests on.

---

## Sources

- SemEval-2020 Task 9 overview: https://arxiv.org/pdf/2008.04277
- NITS-Hinglish-SentiMix (SemEval-2020 Task 9): https://aclanthology.org/2020.semeval-1.175/
- Emotion annotation of the SentiMix Hinglish corpus: https://www.sciencedirect.com/science/article/abs/pii/S0950705122012783
- 2026 state chatbot laws overview: https://www.orrick.com/en/Insights/2026/04/2026-State-Chatbot-Laws-Key-Provisions-and-Regulatory-Trends
- State AI mental health law compliance guide: https://acuity.news/regulation/state-ai-mental-health-laws-compliance-2026/
- Safety mechanisms in generative-AI mental health chatbots (scoping review): https://pmc.ncbi.nlm.nih.gov/articles/PMC13205439/
- APA health advisory on AI chatbots and wellness apps: https://www.apa.org/topics/artificial-intelligence-machine-learning/health-advisory-chatbots-wellness-apps
- PHQ-9 / GAD-7 in digital platforms: https://www.gethealthie.com/blog/phq-9-gad-7-forms
- PHQ-9 / GAD-7 validation study: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8794093/
- AI4Bharat Indic-TTS: https://github.com/AI4Bharat/Indic-TTS
- Piper voices: https://huggingface.co/rhasspy/piper-voices
- IndicF5: https://huggingface.co/ShriAishu/hindiSpeech
