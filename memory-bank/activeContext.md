# Active context

Status: current handoff. Updated: October 16, 2026.

## Current focus

Improve Lumera's conversational recommendation quality without adding a growing
collection of intent-specific rules. The user approved LLM-first structured
understanding, prose-only transparency, useful catalogue-backed clarification,
an approximately five-second response target and evaluation before further
architecture changes. These decisions and targets belong to the
[engine PRD](prd-conversational-engine.md).

Documentation was reorganised with byte-preserved snapshots and a
[recovery map](archive/2026-10-16/README.md).
The [code/documentation cross-check](progress.md#codedocumentation-cross-check)
records corrected guidance and remaining gaps. Subsequent local slices cover
saved-state protection, candidate gates, catalogue choices and deadlines.
Proxy-consent and browser-cache work remain open.

## Resume recommendation work here

Read the [engine design](design-conversational-engine.md) and
[feature tasks](tasks-conversational-engine.md) before implementation. Phases
1-2 and a bounded phase-3 catalogue-choice slice are implemented locally, not the
full tone/theme and general relaxation strategy. Implementation is not quality acceptance.

The API attempts a full updated request plus operation each turn, validates it,
overlays it on rule-derived preferences and returns it to the client. Concrete
directions try results first. Search-scope changes fetch fresh candidates;
unchanged scope and tone-only refinements can reuse prior results.

**Saved-state protection is now implemented locally:** unusable/failed
understanding on a follow-up keeps the saved spec and asks for clarification,
without retrieval or legacy LLM parsing. The reply says the change was not
applied. Valid remove/replace/pivot operations still work. First-request/legacy
fallback remains rule-based; equivalent offline understanding is not claimed.

Date-bound candidates retain exact dates or attempt TMDB detail hydration.
Common format/date/year/origin/exclusion gates run before ranking and after
final enrichment; missing dates are excluded with explicit uncertainty copy.
Missing language remains permissive, and certification enforcement is incomplete.

Structured clarification choices now come from final matching title genres, with
multiple distinct checked directions required before asking. Each option is
verified through the real retrieval/ranking gates, including specialised paths.
Selecting one replays a signed scope-bound change instead of asking the LLM to
interpret its label again. Empty structured searches offer checked, explicit
one-dimension widening or a text question; no constraint is silently dropped.
Stale choices keep the saved request. Token lifetime, process/restart limitations,
cache bounds and latency caveats belong to the [design](design-conversational-engine.md).

The failed live crime check showed the five-second hard cutoff could prevent
useful completion after understanding took four seconds. The user approved
progressive delivery and a **provisional 15-second search ceiling**; five seconds
is now a soft target. Browser POST SSE reports actual stages, then one terminal
response/error. JSON callers remain compatible. Required constraint checks stay
before delivery; initial copy is deterministic and trailers load on details open.
Route understanding is not followed by legacy LLM parsing. The shared four-second
LLM window/no retries/cooldown and preview scheduling limits remain. Progress
never commits state; timeout preserves the original spec. Cancel/reset/unmount
abort fetch/provider work. Live quality and quota recovery remain unproven;
see the [delivery design](design-conversational-engine.md#progressive-delivery-refinement-october-16-locally-implemented).

## Next actions, in order

1. When authorised, run a small quota-capped check of direct requests, option
   selection and follow-ups. Measure completed results and timeouts separately,
   inspect stage timings and verify deployment/proxy flushing before accepting
   latency. No further live recommendation calls were made during delivery work.
2. Complete remaining phase 3 deliberately: calibrate when asking is useful,
   tone/theme choices, proxy consent and general relaxation records.
3. Re-evaluate targeted paths and then the full suite when provider health
   permits. Check transcripts: the harness can select the first clarification
   or widening option, so final constraint failures are not always spontaneous
   state loss.

Other engine gaps (thin Malaysian critics options, Portuguese coverage, widened
origin balance, horror-comedy and tone conflicts) are owned by feature tasks.
Safety, frontend/deployed parity and general coverage remain in the
[general backlog](progress.md#general-backlog), not silently completed.
Ranking simplification and full fact-grounded prose remain later phases.

## Verification and worktree cautions

The [verification ledger](progress.md) owns exact test counts, evaluation scores,
report names and caveats. Reliability implementation tests use mocked/local
verification. The subsequent user-authorised live check failed on its first
case and was stopped; no broad evaluation or semantic quality acceptance followed.
Further provider use must remain bounded. The earlier 90s refinement succeeded;
French-more-recent remains unverified under healthy LLM conditions.

The worktree was clean at the start of the catalogue-choice slice; current
uncommitted edits include that slice and subsequent deadline/cancellation work. Never assume later worktree state or
deployment parity. Frontend build/lint and eval type-check pass locally. A mocked
browser check now covers actual progress, terminal-only results, lazy trailers,
cancel/retry and reset state retention; live/deployed behaviour remains unverified.
Evaluation JSON files
other than baseline reports are ignored/local; the persistent ledger retains
their summaries and caveats.

Some API result paths omit the assistant intro, but the frontend supplies
generic chat text. That is a reply-quality gap, not necessarily a blank visible
bubble. Detailed content-certification enforcement is still outstanding.
