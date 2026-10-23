# Tasks: Conversational Recommendation Engine (v2)

Each phase ends with an evaluation run compared against the baseline report.

**Status:** partial implementation, October 16, 2026. Implementation completion is separate from quality
acceptance. See [progress](progress.md) for the current verification and run
table; [design](design-conversational-engine.md) distinguishes built and planned
behaviour. Latest implementation checks use local/mocked verification; the
separate failed targeted live check is recorded in the ledger.

## Phase 1 — Evaluation baseline
- [x] Return `originCountries` on recommendations (needed for country checks).
- [x] `backend/eval/cases.json`: about 50 single and multi-turn cases.
- [x] `backend/eval/run.ts`: runner, scoring and saved JSON report; `npm run eval`.
- [x] Baseline report recorded (see `progress.md`).

## Phase 2 — Structured request and conversation state
- [x] `requestSpec.ts`: types, validation, `diffSpecs`, `summariseOrigins`, `releaseWindow` (full request instead of a change set; see design).
- [x] `llmClient.parseRequestSpec` (JSON mode, cached) and a rate-limit cooldown
  across LLM calls. Current timeout/retry boundaries belong to the [design](design-conversational-engine.md).
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
- [x] Bound uncached LLM work with one request-local elapsed window, abort
  in-flight completions, disable SDK retries and start cooldown on the first 429.
  Return typed failure evidence and persist it in evaluation transcripts.
- [x] Bound admission of additional catalogue previews by elapsed time; never
  offer unchecked choices or describe incomplete checks as catalogue absence.
- [x] Bound in-flight catalogue I/O and recommendation server-work time with a
  request-local deadline, shared provider abort, disconnect cleanup
  and explicit incomplete-search replies preserving prior state. Frontend
  Cancel/reset/unmount abort fetch; cancelled/late results are not cached.
- [ ] Measure successful-turn quality, timeout rate and actual client latency
  under healthy providers; a timely timeout reply is not successful recommendation acceptance.
- [ ] Complete per-field validation-rejection logging required by R1. Certification parsing exists; detailed enforcement remains a separately tracked safety gap.

## Phase 3 — Catalogue check, catalogue-built questions and visible loosening
- [x] Initial policy: concrete structured directions try results first. Undirected
  structured requests now ask only when multiple checked catalogue directions exist.
- [x] Cached catalogue preview using the real final retrieval/ranking gates,
  without LLM parsing/recovery/explanations or trailer enrichment; broad
  country/language/format browsing does not invent genres.
- [x] Genre choices derived from final title evidence; require three distinct
  matching titles, distinct matching pools and two useful directions before asking.
- [x] Explicit single-dimension widening is checked before offering, applied only
  on selection and explained in prose. No supported widening yields a text question.
- [x] Signed scoped choice tokens round-trip through backend, frontend/retry and
  eval replay, bypassing repeat understanding. Invalid/stale selections retain state.
- [ ] Calibrate when asking improves the top results; add tone/theme-built options.
- [ ] General loosening steps recorded and returned to the reply; automatic soft
  loosening/latest-turn protection remain separate from opt-in widening.
- [ ] Track explicit unsupported-source proxy acceptance/denial and inspect the
  latest follow-up, preventing repeated consent questions or missed guardrails.
- [x] Structured catalogue selections apply the issued spec change rather than
  interpreting the label alone. General assistant context for freeform/legacy
  questions still remains to be designed.
- [x] Fix structured thin critics-path option viability using active spec and
  the real specialised retrieval/ranking path; fewer than three final genre
  matches is not offered. Live Malaysian coverage remains unverified.
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
- [x] Delivery refinement: remove optional work from the critical
  path, lazy-load trailers, avoid repeat route understanding, add stage timings,
  stream real progress over POST with JSON compatibility, and use the approved
  provisional 15-second search ceiling with a five-second soft target.
- [ ] `buildReplyFacts` and an intro prompt grounded in those facts.
- [x] Stream real progress before checked titles over POST SSE, retaining JSON
  compatibility, cancellation and terminal-only saved-state updates.
- [ ] Stream fact-grounded conversational prose; progress transport does not
  implement the full reply-facts strategy.
- [ ] Return consistent backend reply facts on weak-result/fallback paths; frontend generic text currently masks missing API intros.
- [ ] Add prior-reply context and cross-turn repetition checks; the current
  stock-phrase filter is not a general repetition guard.
