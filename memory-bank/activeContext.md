# Active Context – Current Work & Decisions

## Project Status

**Date:** May 23, 2026  
**Phase:** Post-Phase-6 quality hardening and transparency updates
**Overall Progress:** Conversational recommendation engine is operational end-to-end with stronger follow-up behavior, TMDB enrichment, explicit transparency messaging, and simplified UX (freeform-only next turns).

---

## Current Reality

- **Frontend & Backend:** Both build successfully with no TypeScript errors.
- **Frontend:** Conversational flow is primary, meta-steering prompt removed, suggestion chips removed.
- **Backend:** Intent-aware ranking + clarification + transparency safeguards in single endpoint (`POST /recommendations`).
- **Data sources in practice:** TMDB + OMDb + IMDb-derived fields (via OMDb/FMDb and TMDB mappings), Streaming Availability API, optional LLM explanation generation.
- **Transparency behavior:** Explicitly states proxy interpretation when user asks for critics-oriented results and explicitly clarifies unsupported external critic sources.

---

## Recently Shipped Changes

### Retrieval and Enrichment
- Added TMDB enrichment for runtime, genres, language, cast, and directors.
- Added TMDB IMDb-ID mapping and credits retrieval for better metadata completeness.
- Added deterministic blockbuster paging (`blockbuster_page`) for "show me more" flows.

### Parsing and Follow-up Quality
- Added generalized genre alias parsing (`romcom`, `scifi`, plurals, hyphenated variants).
- Fixed false TV pivot from "show me more" by removing generic `show/shows` TV hint terms.
- Added critics-intent parsing and proxy constraint tagging (`ranking:critic_proxy`).
- Added movie-default behavior for critics-intent when user does not explicitly ask for TV.

### Ranking and Critics Proxy
- Added dedicated critics-year proxy retrieval path for exact-year critic-style prompts.
- Added critics-proxy quality floor on rating + vote count.
- Added critics-proxy deterministic sort by rating then vote count.

### Honesty and UX Transparency
- Added unsupported-source guardrail for explicit Rotten Tomatoes / Metacritic / Letterboxd requests.
- Added response-level `interpretationNote` to explain proxy assumptions.
- Surfaced `interpretationNote` in both chat response text and results panel.
- Removed meta-steering choice and associated trace UI.
- Removed refinement suggestion chips; users now refine entirely via freeform typing.

### Robustness Fixes
- Prevented literal `"null"` explanation strings from leaking to UI by forcing fallback template explanations.

---

## Current Architecture Snapshot

### Backend
- **Parser (`preferenceParser`)**: intent, genre aliases, year handling, critics-proxy detection, blockbuster paging state.
- **Engine (`recommendationEngine`)**: mode-aware search, TMDB enrichment, strict year filters, mainstream and critics proxy retrieval/ranking paths.
- **API (`index.ts`)**: clarification gating, weak-result handling, applied constraints, interpretation notes, unsupported-source clarification flow.

### Frontend
- **Conversation:** freeform multi-turn interaction, clarification questions only when backend requests them.
- **Results:** round navigation + active constraints + interpretation note + richer metadata display.
- **State:** recommendation passes store constraints, turn operation, diagnostics, and interpretation note.

---

## Important Decisions

- **Honesty-first policy:** Never imply unavailable critic-source data; explicitly disclose proxy interpretation.
- **Freeform over control chips:** Removed meta-steering and refinement chips to reduce confusion and keep interaction natural.
- **Single endpoint strategy:** Continue using one endpoint with optional `clarificationContext` and richer response metadata.
- **Conservative fallback policy:** If explicit unavailable source is requested, ask user to confirm proxy mode before returning guessed results.

---

## Validation Snapshot

- [x] Backend build passes.
- [x] Frontend build passes.
- [x] `Critics favourites from 2020` now returns movie-only 2020 set with interpretation note and proxy constraint.
- [x] Explicit unsupported source query (e.g., Rotten Tomatoes) returns clarification prompt instead of pretending source support.
- [x] `Show me more` remains in blockbuster/year frame without TV drift.

---

## Remaining Gaps

- [ ] Run full browser smoke pass for all major conversational journeys after latest transparency changes.
- [ ] Refresh older long-form memory docs where legacy assumptions still appear.
- [ ] Add targeted automated tests for critics-intent guardrails and interpretation-note behavior.

---

## Next Steps

1. Add regression tests for critics proxy and unsupported source clarification.
2. Validate production/deployed behavior matches local changes.
3. Continue documentation convergence (README/phase docs and memory-bank consolidated docs).