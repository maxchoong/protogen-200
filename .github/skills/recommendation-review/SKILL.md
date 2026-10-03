---
name: recommendation-review
description: 'Review movie or TV recommendations and recommendation ranking quality. Use for recommendation review, match-explanation audits, weak results, missing candidates, composite prompts, reference-plus-contrast requests, and multi-turn chat refinements or pivots.'
---

# Recommendation Review

Assess whether a recommendation list satisfies the user's active request. Review the titles and available evidence, not just the generated explanations or broad genre overlap.

## When to Use

- The user asks to assess, review, compare, or critique recommendation results.
- The request combines dimensions such as reference title, genre, tone, actor, era, format, or exclusions.
- The request has multiple chat turns that add, narrow, contradict, or replace prior preferences.
- The user asks which results are weak, what is missing, or why the ordering feels wrong.

A named example such as "Like Inception but more relaxing" illustrates the method; it is not a fixed policy or the only supported prompt.

## Review Procedure

1. **Find the results being reviewed.** Prefer the user's supplied list or the active shared browser results. If neither is available and the user asks about current app output, make a fresh request using the existing app/API when possible. State clearly if assessing an old snapshot instead.
2. **Reconstruct the active request from user turns only.** Track which constraints were added, narrowed, or explicitly replaced. A hard pivot clears superseded preferences; a compatible refinement retains them. Do not treat assistant suggestions or generated explanations as user intent. If turn semantics are genuinely ambiguous, state the assumption or ask one concise question.
3. **Separate request dimensions.** Identify reference/concept appeal, tone or mood, requested genres, actors/creators, era/year, format, and hard exclusions. Keep explicit constraints distinct from inferred soft preferences. Do not collapse a composite prompt to its broadest genre.
4. **Evaluate every listed title on separate dimensions:**
   - Concept/reference fit, grounded in relevant premise or catalog facts.
   - Fit for every other active explicit request dimension.
   - Tone fit, including positive cues and conflicts such as violence, urgency, stakes, pacing, or emotional weight where the synopsis supports that inference.
   - Evidence confidence, distinguishing synopsis/metadata evidence from popularity or vote-count confidence.
5. **Audit the explanation.** Treat "why this" copy as a claim to verify, never as evidence that the title fits. Note when it overstates the synopsis or conflicts with the user's request.
6. **Assess rank order and coverage.** Identify contradictions ranked above stronger fits, weak tail entries, and useful cross-genre or wildcard picks. Do not impose blanket genre bans. Popularity alone does not establish thematic fit.
7. **Discuss omissions conservatively.** Name a missing title only when supported by user-provided candidates or checked catalog evidence. If the candidate pool or diagnostics are unavailable, say that it is unknown whether a title was not retrieved, filtered, or merely ranked below the displayed list.
8. **Diagnose the likely failure stage only when evidence supports it:** interpretation, retrieval, filtering, scoring/order, or explanation quality. Otherwise label the cause unconfirmed and suggest the smallest useful next check.
9. **Keep review separate from implementation.** Do not edit ranking, parsing, retrieval, or UI code during a review unless the user also authorizes changes.

## Evidence Rules

- Prefer the actual visible/API results and supplied synopsis, genres, scores, and retrieval diagnostics.
- Use general film knowledge cautiously; verify relevant details against the catalog when possible.
- A genre match is not a premise match. A high rating or vote count is catalog-confidence evidence, not proof of relevance.
- Infer tone from synopsis cues, and qualify uncertainty. Do not claim exact pacing or emotional effect from genre labels alone.
- Preserve nuance: a title may fit the concept but contradict the requested tone, or fit the tone but only weakly resemble the reference.
- Never invent citations, retrieved candidates, filtering reasons, or score contributions.

## Response Format

Lead with a brief overall verdict: good, mixed, or poor fit, and the main reason. For longer lists, use a compact table with rank, title, conceptual fit, fit to other requested dimensions, and assessment. Then summarize:

- Strongest matches and why, separating concept fit from tone/constraint fit.
- Weak or contradictory entries, especially those ranked above stronger matches.
- A few defensible missing candidates, when evidence permits.
- Likely pipeline stage and the next verification step, only when supported.

Be concise and candid. Avoid generic praise, false precision, and unsupported certainty.
