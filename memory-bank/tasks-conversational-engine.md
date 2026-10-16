# Tasks: Conversational Recommendation Engine (v2)

Each phase ends with an evaluation run compared against the baseline report.

**Status:** partial implementation, October 16, 2026. Implementation completion is separate from quality
acceptance. See [progress](progress.md) for the current verification and run
table; [design](design-conversational-engine.md) distinguishes built and planned
behaviour. This documentation refresh made no application changes or live calls.

## Phase 1 — Evaluation baseline
- [x] Return `originCountries` on recommendations (needed for country checks).
- [x] `backend/eval/cases.json`: about 50 single and multi-turn cases.
- [x] `backend/eval/run.ts`: runner, scoring and saved JSON report; `npm run eval`.
- [x] Baseline report recorded (see `progress.md`).

## Phase 2 — Structured request and conversation state
- [x] `requestSpec.ts`: types, validation, `diffSpecs`, `summariseOrigins`, `releaseWindow` (full request instead of a change set; see design).
- [x] `llmClient.parseRequestSpec` (JSON mode, cached, 8 s timeout) and a rate-limit cooldown across all LLM calls.
- [x] Spec overlay in `PreferenceParser` (`applySpec`, `turnOperationFromSpec`); the engine skips `parsePreferences` when a spec is present.
- [x] API accepts and returns `spec`; frontend and eval harness send it back.
- [x] Unit/route/retrieval tests added; exact verification belongs to [progress](progress.md).
- [x] Sequential evaluation resumed October 16 after a successful Gemini probe (`phase2b`, `phase2c`; 52 cases each).
- [x] Fix narrowed structured searches reusing an unfiltered prior pool instead of fresh retrieval; retain reuse for tone-only/unchanged scope. Targeted 90s follow-up passes live.
- [ ] Quality/latency acceptance and healthy-provider verification; see [evaluation evidence](progress.md#evaluation-record) for scores and provider caveats. No full live evaluation covers the final retrieval fix.
- [x] Protect saved-spec follow-ups on failed/unusable understanding: preserve
  state, explain that the change was not applied and ask without retrieving.
  First-request/legacy fallback remains available.
- [x] Add usable-spec acceptance checks for malformed/empty updates, omitted
  saved fields and implicit hard-constraint loss. Explicit remove/replace/pivot
  remain supported. This is not a general semantic-intent proof.
- [x] Recheck exact release dates and format across all candidate sources,
  including reused, reference, talent and critics-year pools; add regressions
  beyond the existing fresh-retrieval/year test. Unknown dates are surfaced,
  not assumed to match.
- [ ] Assess first-request/legacy fallback metadata parity and whether any
  deterministic offline follow-up updates can be applied safely; current saved
  state failure policy deliberately asks rather than interpreting the change.
- [ ] Keep active constraint tags consistent on remove/replace; do not expose a
  union of historical tags as a current enforcement record.
- [ ] Bound total retry/stage latency and capture provider failure evidence; the current 60 s cooldown starts only after SDK retries finish.
- [ ] Complete per-field validation-rejection logging required by R1. Certification parsing exists; detailed enforcement remains a separately tracked safety gap.

## Phase 3 — Catalogue check, catalogue-built questions and visible loosening
- [x] Initial policy: concrete structured directions try results first; vague and origin/format-only requests still clarify. Empty retrieval still offers widening.
- [ ] `probeCatalog(spec)` with cached counts.
- [ ] Decide whether to ask; options built from the matching titles and each checked to return results.
- [ ] Loosening steps recorded and returned to the reply.
- [ ] Track explicit unsupported-source proxy acceptance/denial and inspect the
  latest follow-up, preventing repeated consent questions or missed guardrails.
- [ ] Pass assistant question/option context into understanding so short
  selections are not interpreted from wording and user history alone.
- [ ] Fix thin critics-path option viability (Malaysian festival dramas yielded only two); use active spec constraints and the real specialised retrieval/ranking path.
- [ ] Fix Portuguese retrieval/coverage when widening Spanish-language crime series.
- [ ] Assess origin balance when widening (earlier MY+ID results were 9 ID to 1 MY); retain hard-origin correctness.
- [ ] Evaluation run.

## Phase 4 — Simpler ranking
- [ ] Tone and theme fit become scorer inputs.
- [ ] Optional LLM re-order of the top 30 (feature flag).
- [ ] Retire post-scoring adjustments one at a time, checking the evaluation set each time.
- [ ] Address horror-comedy joint fit (earlier "funny horror" put Pulp Fiction first), sad requests ranking F1, cosy-show crime conflicts and animated-family pivots ranking Coraline.
- [ ] Revisit gritty-crime candidate coverage (Hunger Games / The Imitation Game in earlier output) and talent-credit coverage under provider fallback.
- [ ] Ensure explicit genre replacement is distinguished from compatible addition; do not retain superseded first-turn genres or erase them on a mere short answer.

## Phase 5 — Reply and streaming
- [ ] `buildReplyFacts` and an intro prompt grounded in those facts.
- [ ] Stream the reply before the titles (Server-Sent Events).
- [ ] Return consistent backend reply facts on weak-result/fallback paths; frontend generic text currently masks missing API intros.
- [ ] Add prior-reply context and cross-turn repetition checks; the current
  stock-phrase filter is not a general repetition guard.
