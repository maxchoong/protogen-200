# Product Context – Film & TV Advisor (As Built)

## Product Vision

Help users decide what to watch in a few conversational turns, then move directly to action with clear rationale, trailer access, and platform availability.

---

## Core User Problems

1. Decision fatigue
   - Users can describe preferences but still struggle to pick quickly.
2. Disconnected workflow
   - Discovery, validation, and watch-start actions are usually split across multiple apps.
3. Trust and clarity gaps
   - Users need to understand why recommendations were chosen and what data assumptions were used.

---

## Current Experience Shape

1. Conversation-first flow
   - Users can start broad and refine in plain language.
   - Clarification is used only when confidence/quality signals require it.
2. Freeform follow-up refinement
   - No meta-steering choice UI.
   - Follow-up intent is inferred directly from user text.
3. Transparent recommendation rounds
   - Responses can include applied constraints and interpretation notes.
   - Cards include concise "why this" reasoning.

---

## What The Product Currently Delivers

- Intent parsing across mood/genre/reference/talent signals.
- Robust genre alias handling and follow-up mapping.
- Mode-aware retrieval and ranking (including critics-style proxy mode).
- Safety filtering and weak-result clarifications.
- Region-aware streaming availability enrichment.
- Trailer links and richer metadata display (rating, votes, runtime, cast/director, language).

---

## Trust and Transparency Rules

1. No fabricated source support
   - If a user explicitly requests unsupported external critic sources, the system asks for clarification.
2. Proxy behavior must be explicit
   - When critics-style intent is satisfied via internal proxy signals, the system communicates that interpretation.
3. Explanation fallback must remain clean
   - If LLM explanations fail, deterministic fallback text is shown.

---

## Product Constraints

- No user accounts or persistent profile personalization.
- Third-party API quality varies by region/title; partial enrichment is expected.
- Optional providers (LLM, availability, trailer paths) must never break core recommendation delivery.

---

## Non-Goals (Current)

- Social graph and collaborative recommendations.
- Long-term watch history and account-based memory.
- Native mobile applications.
- Editorial CMS workflows.

---

## Next Product Opportunities

- Better explanatory UI for edge-case interpretations.
- More deterministic handling for niche subgenre prompts.
- Expanded regression test coverage for multi-turn conversation quality.
