# arXiv submission checklist — MindGuard

Upload `mindguard-paper.zip` (mindguard.tex + the two PNGs). arXiv compiles with
pdfLaTeX; no BibTeX pass is needed because references are embedded in
`thebibliography`.

## Before you upload

- [ ] Fill in the author block in `mindguard.tex` (currently placeholders)
- [ ] Verify all 14 references against the real publications
- [ ] Compile once on Overleaf and read the PDF end to end

## Endorsement — check this FIRST

arXiv requires an endorsement for your first submission to a given category.
Since January 2026, automatic endorsement requires **both** an institutional
email address **and** previous authorship on an accepted arXiv paper. A first-
time author with neither will need a human endorser.

An endorser must be an established author in the same category. Your project
guide or any faculty member in the department who has posted to cs.HC or cs.LG
can do it in a few clicks. **Ask before you need it** — this is the step most
likely to cost you days.

## Metadata to paste into the submission form

**Primary category:** cs.HC (Human-Computer Interaction)
**Cross-list:** cs.SE (Software Engineering), cs.CY (Computers and Society)

**Title:**
MindGuard: A Privacy-Preserving Multimodal Mental Wellness Companion with Fully
On-Device Neural Speech Synthesis

**Comments field:**
15 pages, 2 figures. Systems and architecture paper. No accuracy evaluation is
reported; a pre-specified evaluation protocol is included.

**ACM class:** H.5.2; J.3; I.2.1

**Abstract (plain text, no LaTeX markup):**

Conversational mental-wellness applications typically transmit the user's text,
voice, and facial imagery to third-party cloud inference services, creating a
privacy exposure that is difficult to reconcile with the sensitivity of the
domain. This paper presents MindGuard, a multimodal wellness companion
engineered around an inversion of that default: all speech synthesis and all
visual affect estimation execute entirely within the user's browser, and no
audio or video frame is transmitted at any point. We describe four design
decisions and their trade-offs. First, an 82M-parameter neural text-to-speech
model is executed client-side through ONNX Runtime Web with a WebGPU-to-
WebAssembly fallback, eliminating both per-character cloud cost and off-device
audio transmission. Second, emotion inference uses deliberately non-learned
estimators -- a weighted lexicon classifier for text and a hand-crafted optical
heuristic for video -- trading measured accuracy for full decision traceability
and a zero-byte model download. Third, a triple-weighted moving average
aggregates per-entry emotion into a burnout index, propagating recency,
per-reading confidence, and modality reliability as multiplicative weights so
that low-trust evidence is attenuated rather than discarded. Fourth, a
crisis-safety path is architecturally exempted from every personalisation layer
and this exemption is enforced by regression tests. We additionally report a
negative result: an earlier revision derived voice and video "emotion" from a
CRC32 checksum of the uploaded media, producing deterministic but semantically
meaningless labels that silently contaminated the burnout index. We describe
its detection and its replacement by an explicit unscored outcome carrying low
confidence. We state explicitly that this work reports no accuracy evaluation:
the estimators have not been benchmarked against any labelled corpus, and no
precision, recall, or F1 figure is claimed. We therefore frame the contribution
as an architecture and a set of engineering trade-offs, validated by 65 passing
backend regression tests, and we specify the evaluation protocol and corpus
intended for subsequent work.

## What arXiv does and does not give you

Gives you: a permanent citable URL and DOI-like identifier, a public timestamp
establishing priority, and a link you can put on a CV or in an application.
Usually live within one to two business days of acceptance by moderators.

Does not give you: peer review, or a conference acceptance letter. If your
department specifically requires a conference acceptance, arXiv does not
substitute for it.
