# ICIDA 2026 submission — checklist

**Venue:** 5th International Conference on Innovations in Data Analytics
**Site:** https://icida.ikrf.in/  ·  **Contact:** icida.conference@gmail.com / +91-9903149600
**Proceedings:** Springer LNNS (ISSN 2367-3370), indexed in Scopus, Ei Compendex, WoS, INSPEC

## Dates

| Milestone | Date |
|---|---|
| Paper submission | **10 October 2026** |
| Acceptance notification | 10 November 2026 |
| Registration | 20 November 2026 |
| Camera-ready | 25 November 2026 |
| Conference | 15 December (Westin Kolkata Rajarhat) / 16 December (hybrid) |

Day 2 is hybrid, so presenting remotely is possible — confirm by email that a
remote presentation counts as presenting before you rely on it.

## File to submit

`mindguard_springer.tex` — Springer `llncs` class, converted from the IEEE
version. Build it on Overleaf from `~/Desktop/mindguard-ICIDA-springer.zip`
(New Project -> Upload Project), compile with pdfLaTeX, submit the PDF.

ICIDA requires a **minimum of 10 pages**; there is no stated maximum. The
single-column llncs layout runs longer than the IEEE two-column version, so
this should clear the minimum comfortably. Check the compiled page count.

## Before you submit

- [ ] Compile on Overleaf and read the PDF end to end
- [ ] Confirm the institute line is right for all three authors
- [ ] **Verify all 14 references** against the real publications (vol/no/pages/DOI)
- [ ] Confirm page count is at least 10
- [ ] Run a similarity check if your department provides one
- [ ] Keep the submission acknowledgement email — that is your proof of
      "submitted" for the 28 September marks deadline

## Plagiarism and AI disclosure

Text-overlap risk was measured, not assumed. Using 8-gram shingle comparison
against every project document and the submitted Phase I report:

| Compared against | Overlap |
|---|---|
| REPORT.md | 0.10% |
| RESEARCH.md, METHODS.md, README.md | 0.00% |
| Phase I report (.docx) | 0.90% |

Every overlapping passage is a citation title appearing in both bibliographies
(the Woebot and Wysa papers). Turnitin excludes bibliographies by default, so
the effective overlap is zero. The prose is original.

**AI use is disclosed in the manuscript.** Springer Nature requires that LLM
use be declared with the tool name, how it was used, and which sections; only
copy-editing is exempt. A "Use of Generative AI" statement appears before the
Disclosure of Interests. Do not remove it -- undisclosed AI use is a retraction
risk, and the declaration does not disqualify the paper.

Tell your project guide before submitting. Some institutions have their own
rules about AI assistance in student work, and that conversation is much better
had beforehand.

## Do not

- Submit this paper anywhere else while it is under review at ICIDA.
  Simultaneous submission to two venues is misconduct and can get it rejected
  from both.
- Add accuracy, precision, recall or F1 numbers. None have been measured. The
  paper's explicit non-evaluation statement is deliberate and is what makes it
  defensible under review.
