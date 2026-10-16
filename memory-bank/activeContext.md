# Active context

Status: current handoff. Updated: October 16, 2026.

## Current focus

Improve Lumera's conversational recommendation quality without adding a growing
collection of intent-specific rules. The user approved LLM-first structured
understanding, prose-only transparency, useful catalogue-backed clarification,
an approximately five-second response target and evaluation before further
architecture changes. These decisions and targets belong to the
[engine PRD](prd-conversational-engine.md).

Documentation structure and selective context loading were completed first.
Original worktree documents were preserved byte-for-byte with hashes and a
[recovery map](archive/2026-10-16/README.md). Application code and provider
configuration were not changed by this migration.

A subsequent [code/documentation cross-check](progress.md#codedocumentation-cross-check)
corrected current guidance and surfaced enforcement, validation, proxy-consent
and cache gaps. A subsequent local reliability slice implements usable-spec
checks, conservative failure handling and common candidate constraint gates;
proxy-consent and cache work remain open.

## Resume recommendation work here

Read the [engine design](design-conversational-engine.md) and
[feature tasks](tasks-conversational-engine.md) before implementation. Phases
1-2 are implemented; phase 3 has an initial results-first policy, not the full
catalogue-built option strategy. Implementation is not quality acceptance.

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

The other immediate blocker is **provider reliability and latency**. Gemini
started responding after the earlier rate limit, then returned timeouts/503s
and later another 429. A configured key or an earlier successful probe does not
establish current availability. The cooldown starts after SDK retries finish,
not at the first failed attempt, and is not a total-turn time budget.

## Next actions, in order

1. Continue phase 3: build options from matching catalogue data, validate them
   against the active request and specialised retrieval paths, and record
   loosening visibly. Keep explicit origin constraints unless the user agrees
   to widening.
2. Bound retry/stage latency and retain provider failure evidence. Assess
   whether any offline follow-up changes can be safely understood; the current
   conservative policy asks instead of guessing.
3. Re-evaluate targeted paths and then the full suite when provider health
   permits. Check transcripts: the harness can select the first clarification
   or widening option, so final constraint failures are not always spontaneous
   state loss.

Other engine gaps (thin Malaysian critics options, Portuguese coverage, widened
origin balance, horror-comedy and tone conflicts) are owned by feature tasks.
Safety, frontend/deployed parity and general coverage remain in the
[general backlog](progress.md#general-backlog), not silently completed.
Ranking simplification, fact-grounded replies and streaming remain later phases.

## Verification and worktree cautions

The [verification ledger](progress.md) owns exact test counts, evaluation scores,
report names and caveats. The reliability slice uses mocked/local verification
only, with no Gemini calls. No live run covers it or the final candidate-reuse fix.
The targeted 90s refinement succeeded; French-more-recent remains unverified
under healthy LLM conditions. Provider health has not been rechecked since the
last recorded failure.

Recommendation work is uncommitted, mixed with unrelated frontend edits. Do not
revert or commit them indiscriminately, or assume local changes are deployed.
Frontend build/lint evidence predates the latest backend-only follow-up and
does not certify the current dirty frontend worktree. Evaluation JSON files
other than baseline reports are ignored/local; the persistent ledger retains
their summaries and caveats.

Some API result paths omit the assistant intro, but the frontend supplies
generic chat text. That is a reply-quality gap, not necessarily a blank visible
bubble. Detailed content-certification enforcement is still outstanding.
