# PRD: Recommendation Review Skill

## Problem

Recommendation lists can look superficially relevant because they share a genre with the prompt while missing the user's requested tone or experience. Generated "why this" copy can also overstate fit. Reviews need to judge the actual titles and catalog evidence consistently, and distinguish what fits the reference from what fits a requested contrast.

## Goal

Create a project-scoped Copilot skill for assessing Lumera recommendation lists against the user's complete active request, whether that request is one prompt, a composite prompt, or a multi-turn conversation. The skill evaluates relevance and ordering using visible titles, synopses, genres, and available scores/metadata; it identifies weak inclusions and credible omissions without mistaking generic genre overlap for a strong match.

## Users

The product developer reviewing local or deployed recommendation results and tuning quality.

## Trigger

Use when the user asks to assess, review, compare, or improve a recommendation list for any prompt type: a single request, multiple combined constraints, or a multi-turn refinement. Examples include reference plus mood, genre plus actor plus era, or a conversation that narrows, adds preferences, changes direction, or explicitly replaces an earlier request.

## Review Rubric

1. Reconstruct the active request from the full conversation. Track which user preferences remain active, which were added or narrowed, and which were contradicted or replaced by a pivot. Do not treat assistant suggestions or generated explanations as user preferences.
2. Decompose the active request into independent signals: reference/concept appeal, genres, tone/mood, people, time period, format, and constraints/exclusions. For composite prompts, preserve each explicit signal rather than collapsing the request to its broadest genre.
3. Assess every displayed title on separate axes:
   - Conceptual/reference fit: mind, memory, identity, perception, puzzle, speculative premise, or other prompt-supported concepts.
   - Requested tone fit: calmness, warmth, playfulness, pace, violence, urgency, stakes, and emotional weight as supported by synopsis/evidence.
   - Catalog confidence: distinguish popularity/vote evidence from thematic evidence; do not treat one as the other.
4. Judge ordering, not just eligibility. A title that is merely acceptable should not outrank a clear match across the active composite request. Penalize explicit contradictions (for example, violent action against a relaxing request) unless the synopsis supports a meaningful counterbalance.
5. Identify worthwhile missing candidates only when supported by catalog evidence or the user's supplied list. Distinguish "not retrieved" from "retrieved but ranked low" when diagnostics are available; do not claim a title was omitted for a specific pipeline reason without evidence.
6. Treat generated explanation text as a claim to verify, not as evidence. Ground conclusions in the title's supplied synopsis/genres/metadata. Mark uncertainty when synopsis evidence cannot establish pace or tone.
7. Preserve useful cross-genre and wildcard picks when their premise genuinely fits; do not impose blanket genre bans.

## Output

Provide a concise, ranked assessment with:
- Overall verdict on whether the list satisfies the request.
- Strongest fits and why, naming concept fit and tone fit separately.
- Weak fits or contradictions, especially titles ranked above stronger matches.
- A short set of defensible missing candidates when relevant.
- A clear diagnosis category if evidence allows: interpretation, retrieval, filtering, scoring/order, or explanation quality.

Use a compact table when the list is long. Avoid fabricated citations, unsupported synopsis details, and generic praise. Keep a user-facing assessment separate from proposed implementation changes; do not edit ranking logic unless asked.

## Non-Goals

- Automatically changing recommendation parsing, retrieval, or ranking code during a review.
- Treating one prior golden prompt or title list as a universal genre policy.
- Requiring an LLM provider; the skill must work from deterministic API output and catalog evidence.
- Claiming exact runtime pacing or emotional effect from genre labels alone.

## Acceptance Criteria

- A "Like Inception but more relaxing" list rates conceptual fit separately from relaxing-tone fit.
- The same rubric works for unrelated request types and composite requests; it reports fit against each active explicit dimension.
- For multi-turn conversations, it uses the active user constraints after refinement/pivot semantics and does not resurrect preferences that the user replaced.
- High-stakes films can be described as conceptually close but weak on the contrast, rather than simply good/bad.
- The skill flags violent/action-heavy contradictions from supplied synopsis evidence and does not infer match from Sci-Fi alone.
- It recognizes a calm conceptual drama as potentially stronger than a broad, high-stakes franchise pick.
- It challenges an LLM-generated rationale when that rationale conflicts with the synopsis.
- It does not invent missing candidates, retrieval diagnostics, or reasons for rank placement.
- It recommends code changes only as a distinct next step and only within the user's authorization.

## Kiro-Lite State

Phase 0 PRD drafted. Await user approval before creating the design document, task breakdown, or skill implementation.
