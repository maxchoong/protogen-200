# PRD: Conversational Recommendation Engine (v2)

**Status:** Approved direction, October 15, 2026. Implementation is phased (see `tasks-conversational-engine.md`).

**Implementation checkpoint (October 16):** evaluation harness and structured-request round-trip are implemented locally; initial results-first policy is implemented, not deployment-certified. Catalogue-built options, general recorded loosening, ranking simplification, fact-grounded replies and streaming remain planned. These requirements are acceptance goals, not all current guarantees. Detailed certification enforcement, semantic-invalid-spec fallback and per-field validation-rejection logging are outstanding. See [design](design-conversational-engine.md), [tasks](tasks-conversational-engine.md) and [measured progress](progress.md).

## Original problem (before v2)

Lumera understands requests mainly through hand-written rules (about 70 regular expressions and 130 rule branches in `preferenceParser.ts`). The LLM only extracts a few hints. Each quality bug fixed in October 2026 was a missing rule:

- "heartwarming" was not recognised as a mood.
- "released this month" was not recognised as a date window.
- "What about Indonesian films too?" was not recognised as adding a country.

There are endless ways to phrase a request, so this approach will not generalise. Three other gaps:

- **Clarification options** are written ahead of time, so picking one can return nothing or ignore an earlier constraint (Malaysian → "Heartwarming comedies" returned non-Malaysian titles).
- **Conversation state** is rebuilt each turn by re-parsing all past turns joined into one string.
- **Ranking** layers about 14 separate boosts and penalties after the core scorer, and they interact unpredictably ("Funny horror movies" ranks Pulp Fiction first).

## Goals

1. **Understand broadly.** Any phrasing of genre, tone, country, language, era, format, people, reference titles and exclusions becomes a structured request without new rules.
2. **Be conversational.** Each follow-up is understood as a change to the current request (add, remove, replace, narrow or pivot), not a new query.
3. **Be guided.** Ask a question only when the answer would meaningfully change the results. Every offered option must return results that respect the constraints already given.
4. **Be transparent (prose).** The reply says in plain English what was understood and anything that had to be loosened, and why. No new UI chips or per-title breakdowns.
5. **Be measurable.** Quality is tracked by an automated evaluation set. Changes must not lower its score.

## Non-goals

- New UI controls for constraints (chips, toggles, sliders).
- User accounts, history or personalisation across sessions.
- Replacing TMDB as the catalogue source.

## Requirements

### R1 — Structured request
- The LLM turns each user message plus the current request into a validated structured request:
  - **Hard constraints:** countries, languages, release window, format, exclusions, age rating.
  - **Soft preferences:** genres, tone, themes, reference titles, people.
  - **Change type** for the turn.
- Values are checked against the known lists (countries, languages, genres). Anything unrecognised is dropped and logged.
- If the LLM is unavailable or returns invalid output, the existing rule parser is used as the fallback.
- Reliability refinement approved October 16: a follow-up with a saved request
  must not run a different search while returning stale saved state. When an
  update cannot be understood reliably, keep the saved request and ask the user
  to restate the change. First requests may still use the rule fallback.
- Missing fields must not silently erase saved constraints. Explicit removal,
  replacement and pivots remain supported; preserving state must not make
  constraints impossible to change.

### R2 — Conversation state
- The server receives the previous structured request with each turn and returns the updated one. The client stores it and sends it back.
- Follow-ups such as "too", "instead", "less dark", "only series" and "something else entirely" become explicit changes to that request.

### R3 — Check the catalogue before asking
- Before asking a question, the engine checks how many titles match.
- It asks only if:
  - there are too many strong candidates and choosing would meaningfully change the top results, or
  - the request is genuinely ambiguous.
- Options are built from the genres and tones present in the matching titles. Each option is checked to return at least N results with all current hard constraints.

### R4 — Loosen visibly
- When there are too few matches, the engine loosens soft preferences before hard constraints, and never a constraint the user stated in the latest turn.
- Every loosening is recorded and must be mentioned in the reply.

### R5 — Ranking
- Hard constraints filter titles out. Soft preferences contribute to one weighted score.
- Format and exact release-window checks must apply to candidates from every
  source, including reused results. Missing date evidence must not be described
  as a confirmed date match. Certification enforcement remains separate work.
- An optional LLM pass may re-order the top ~30 titles for tone and premise fit.
- The separate post-scoring boosts and penalties are retired over time, each removal checked against the evaluation set.

### R6 — Reply copy
- One short reply covering:
  - what was understood;
  - what was loosened, if anything;
  - 1–2 follow-up suggestions the catalogue can actually support.
- Built from the engine's real record of what matched, not from guesses after ranking. No stock phrases repeated across turns.

### R7 — Latency
- Up to ~5 s per turn. The reply text should appear before the titles finish loading (streaming is a later phase).

### R8 — Evaluation
- About 50 single and multi-turn cases, run against the live API.
- Scored automatically on:
  - whether hard constraints are met;
  - how often a request returns no results;
  - whether follow-ups are understood correctly;
  - tone conflicts in the top 5;
  - whether a clarifying question was asked when appropriate.
- Reports are saved so runs can be compared.

## Success metrics (against the October 15, 2026 baseline)

- Hard-constraint pass rate ≥ 95%.
- Requests returning no results ≤ 2% (excluding cases that are designed to return nothing).
- Follow-ups understood correctly ≥ 90%.
- Tone-conflict titles in the top 5 ≤ 5%.
- p50 latency ≤ 5 s.
