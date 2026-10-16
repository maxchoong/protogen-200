# Product Context – Film & TV Advisor (As Built)

Status: current product reference.

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

As built October 16, 2026. Intended behaviour is described below; remaining
quality and reliability gaps are tracked in [progress](progress.md).

1. Conversation-first flow
   - Users can start broad and refine in plain language.
   - Concrete validated requests try results first; vague and origin/format-only requests can clarify. Catalogue-built clarification options are planned, not yet implemented.
2. Freeform follow-up refinement
   - No meta-steering choice UI.
   - Follow-up intent is inferred directly from user text.
   - Successful LLM understanding updates a structured request passed between
     client and server. Unusable/failed saved-spec updates ask for clarification
     while preserving the request, rather than silently applying rules.
3. Transparent recommendation rounds
   - Responses can include applied constraints and interpretation notes.
   - Cards include concise "why this" reasoning.

---

## What The Product Currently Delivers

- Intent parsing across mood/genre/reference/talent signals.
- Genre alias handling and follow-up mapping, with known continuity/enforcement gaps in the [engine design](design-conversational-engine.md).
- Mode-aware retrieval and ranking (including critics-style proxy mode).
- Metadata-dependent safety filtering; weak non-empty sets are returned as best
  available results, while empty retrieval offers widening. The weak-set branch
  builds an internal clarification candidate but does not send that question.
- Region-aware streaming availability enrichment.
- Trailer links and richer metadata display (rating, votes, runtime, cast/director, language).

---

## Trust and Transparency Rules

1. No fabricated source support
   - The original description is checked for unsupported critic sources; follow-up detection and proxy-consent handling have gaps tracked in the engine design.
2. Proxy behavior must be explicit
   - When critics-style intent is satisfied via internal proxy signals, the system communicates that interpretation.
3. Explanation fallback must remain clean
   - If LLM explanations fail, deterministic fallback text is shown.
   - Some API result paths omit the assistant intro; the frontend supplies generic text. A consistent fact-grounded reply is still planned.

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
