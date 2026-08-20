# Film & TV Advisor – Project Brief (As Built)

## Executive Summary

**Product:** Film & TV Advisor  
**Goal:** Deliver fast, conversational movie/TV recommendations with clear rationale, platform availability, and transparent handling of data limitations.

---

## Product Principles

1. **Speed to decision:** Reduce time-to-watch with concise recommendation rounds.
2. **Conversational refinement:** Let users refine naturally in freeform text.
3. **Honesty and transparency:** Never imply support for unavailable sources; explain proxy logic when used.
4. **Graceful degradation:** Core recommendations should still work when optional providers fail.

---

## Target User Types

1. **Quick chooser**
   - Wants useful options fast.

2. **Taste-driven user**
   - Uses nuanced prompts (genre, mood, actors, era, constraints).

3. **Action-oriented user**
   - Wants direct next steps: where to watch and trailer access.

---

## Current Core Capabilities

1. **Conversational input**
   - Freeform query + freeform follow-ups.
   - Clarification appears only when needed.

2. **Intent-aware recommendation engine**
   - Supports mood/reference/talent/mixed intent modes.
   - Uses parsed constraints, year handling, genre aliases, and ranking heuristics.

3. **Richer metadata**
   - Rating + vote count.
   - Runtime, language, genres.
   - Main cast and director when available.

4. **Availability + trailer enrichment**
   - Streaming availability by region.
   - Trailer links where available.

5. **Transparent uncertainty handling**
   - Critics-style prompts can run in proxy mode using available rating/vote signals.
   - Explicit unsupported critic-source requests trigger clarification instead of fabricated support.

---

## Current Stack (Implemented)

- **Platform:** Responsive web app.
- **Frontend:** React 18 + TypeScript + Vite + Tailwind.
- **Backend:** Node.js + Express + TypeScript.
- **Retrieval/enrichment:** TMDB + OMDb/FMDb pathway.
- **LLM (optional):** GitHub Models `gpt-4o-mini` for parsing/explanations.
- **Availability:** Streaming Availability API (RapidAPI).
- **Storage:** No user accounts/persistent profile storage.

---

## Operating Constraints

- No persistent user identity layer in current version.
- Content safety filtering is required in backend pipeline.
- Upstream APIs can be partial/unavailable; system must degrade gracefully.
- Explanations and source assumptions must remain explicit and non-misleading.

---

## Success Criteria (Current)

- Users can complete recommendation + refinement in natural language.
- Follow-up turns behave consistently (no unintended modality drift).
- Results include clear context: constraints, interpretation note (when needed), and rationale.
- Unsupported external-source requests are handled with explicit clarification.
- Build and runtime flows remain stable across backend/frontend.