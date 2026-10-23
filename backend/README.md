# Film & TV Advisor Backend

## Optional LLM Setup

The current client does not use GitHub-token credentials or legacy GitHub
Models endpoints. Configure `OPENAI_API_KEY` and
optionally `LLM_MODEL`, or `LLM_API_KEY` + `LLM_BASE_URL` + `LLM_MODEL` for a
compatible provider. See [migration and setup instructions](GITHUB_MODELS_SETUP.md).
Run `npm run check:llm` to verify the older preference parser and batch
explanation generation after configuring credentials locally. This does not
exercise structured request understanding or the full conversation. The app
uses rule-based fallbacks when the provider is unavailable.

## Current Architecture

As of October 16, 2026, each recommendation turn first attempts LLM understanding
into a validated full `RequestSpec` plus a turn operation. The spec overlays the
rule parser and is returned to the client for the next turn. Route understanding
is attempted once; its failure does not start another legacy LLM parsing call.

Concrete structured requests try results before first-turn clarification.
Broad origin-only or vague requests can still clarify. Structured choices come
from final catalogue genre evidence and are checked against the current spec;
the no-spec legacy path uses rule/template options and cheaper availability probes.

On understanding failure, first requests and legacy clients without a saved
spec can use the rule fallback. A follow-up with a saved spec instead keeps it
unchanged and asks for clarification, explicitly saying the change was not
applied; it does not retrieve a different list or call legacy parsing.
Detailed certification
enforcement is also not implemented; parsing `maxRating` is not a safety guarantee.

See the [design](../memory-bank/design-conversational-engine.md),
[tasks](../memory-bank/tasks-conversational-engine.md) and
[dated verification status](../memory-bank/progress.md).

## Development

Install dependencies:
```bash
npm install
```

Run in development mode:
```bash
npm run dev
```

Build:
```bash
npm run build
```

Start production server:
```bash
npm start
```

Run the recommendation quality evaluation against a running server (defaults to `http://localhost:3000`):
```bash
npm run eval -- --label my-change --concurrency 1
npm run eval -- --only nordic-noir,nolan --concurrency 1
```
The 52-case harness replays conversations and writes reports to `eval/reports/`.
Only `baseline-*` reports are eligible for version control; other runs stay local.
The October 15 baseline file is tracked in the repository. Dated summaries
persist in the memory bank.

Evaluations make real provider requests and consume quota. Inspect backend logs
for 429s, 503s and timeouts before interpreting scores. The runner may choose
the first offered option when a requested substring is absent, or when answering
an unexpected question; inspect transcripts for intentional widening.

Exact run scores, validation counts, provider caveats and the scope of the last
verification live in the [verification ledger](../memory-bank/progress.md).
Do not copy them into setup docs as an undated health claim.

Check documentation without starting a server or calling a provider:
```bash
npm run check:docs
npm run test:docs
```
These dependency-free checks cover local inline links, fence balance, indexed
memory-document coverage, status metadata, snapshot integrity and the default
context word budget. They do not establish semantic correctness or validate
external URLs, heading anchors, all Markdown/YAML syntax or application health.

## API Endpoints

### POST /recommendations
Request body:
```json
{
  "description": "I want a cozy romance on a rainy day",
  "preferences": {
    "genres": ["Romance", "Drama"],
    "mood": ["Relaxing", "Romantic"],
    "type": "movie",
    "maxRating": "PG-13"
  }
}
```

Illustrative response (fields abbreviated):
```json
{
  "success": true,
  "recommendations": [],
  "spec": {
    "countries": [],
    "languages": [],
    "format": "movie",
    "excludeGenres": [],
    "genres": ["Romance", "Drama"],
    "tones": ["Relaxing", "Romantic"],
    "themes": [],
    "references": [],
    "referenceSuggestions": [],
    "actors": [],
    "creators": []
  },
  "llmDiagnostics": {
    "used": true,
    "stages": ["request understanding"]
  }
}
```

Send the returned `spec` unchanged on the next request alongside the original
`description` and `clarificationContext` containing the latest `userClarification`,
`userTurns`, and a positive `clarificationRound`. New chats omit the previous spec.
Responses may instead include `requiresClarification`, or result metadata such as
`assistantMessage`, `interpretationNote`, `turnOperation` and retrieval diagnostics.

Structured catalogue questions can include `optionTokens`, a map from exact
option label to opaque signed token. On selection send that value as top-level
`selectedOptionToken`, keep the returned `spec`, original `description`, region
and explicit preferences unchanged, and append the label to `userTurns` as well
as `userClarification`. The frontend and eval replayer do this automatically;
transport retries reuse the same token and turns. Other freeform answers omit it.

These choices are built from matching genres and checked with the actual final
retrieval/ranking/metadata gates, including specialised critics searches. Each
needs three distinct final matches at the requested result limit; unknown or
genre-relaxed matches are not counted. Multiple useful directions are required
to ask; otherwise the route tries results. Empty structured searches offer
checked single-dimension widening, never silently remove a constraint. Preview
checks skip every LLM call and trailer enrichment, but use catalogue-provider
requests and can add latency. Normal results use deterministic explanations and
reply copy; optional generated wording and trailers do not block delivery.

Preview evidence is bounded and cached briefly; it is not an ongoing guarantee
that providers or catalogues remain unchanged. Tokens expire after one hour and
are bound to the issuing process, saved spec, query, controls, region and user-turn
history. Restarts or another worker invalidate them; invalid/stale selections
ask again with saved state unchanged and do not call understanding or retrieval.
This is not a multi-worker-safe signing scheme. The no-spec legacy path retains
its cheaper rule-based checks, now rejecting unknown availability.

This endpoint checks non-empty input and minimum description length, but does
not apply a complete runtime schema to every client request field. Provider
understanding now has an acceptance gate before field sanitisation, protecting
saved state from incomplete/invalid updates and implicit constraint loss.
Client-supplied saved specs are still normalised permissively. See the
[current enforcement boundaries](../memory-bank/design-conversational-engine.md#enforcement-and-turn-boundary-gaps-source-cross-check-october-16).

Recommendations optionally expose `releaseDate` (movie release or TV first-air
date, ISO day). Date-bound searches exclude candidates lacking verifiable dates;
`retrievalDiagnostics.missingReleaseDates` reports that omission and replies
explain missing evidence. Format/date/year/origin/exclusion checks apply before
ranking and after final metadata enrichment; language without metadata remains
permissive and certification ceilings are not yet enforced.

`score` currently mirrors the title rating, not ranking relevance. Ranking
components are in `scoringFactors`. `appliedConstraints` can include historical
tags; it is not a canonical active request or proof of enforcement.

Streaming availability is **not** fetched by this request. Its diagnostics
normally say `not_requested`; opening a details panel triggers a separate call.

`llmDiagnostics.used` is true only when LLM output contributed to the response.
The `stages` list identifies request understanding, older preference parsing, actor-title recovery,
recommendation explanations, clarification wording, or the results introduction.
These are supported client/historical diagnostic values, not a list of calls
made by every route turn. Recommendations now skip legacy LLM preference parsing
after route understanding and omit generated explanations/wording/intros.
Actor-title recovery can still use the shared LLM window when needed.
Cached LLM output is reported when it is used; provider configuration alone does
not count as usage.

`llmDiagnostics.failures` optionally records `{ stage, reason, status?, elapsedMs }`
for failed or skipped completions. Reasons are `deadline`, `rate_limit`,
`cooldown`, `timeout` or `provider_error`; HTTP status is included when available,
not provider error bodies. `budgetExhausted: true` indicates a stage reached the
request's LLM deadline. The eval runner saves these fields with each transcript
entry; older reports may omit them.

All uncached LLM stages in this route share one four-second elapsed window
starting at route entry, including time spent retrieving between calls.
Completions abort at the remaining deadline, with no automatic SDK retries.
Cached output remains usable; later optional stages use their existing
deterministic fallbacks when the window is exhausted. Failed saved-spec
understanding still asks without changing the request. A first 429 starts the
60-second process-local cooldown immediately.

Catalogue-choice builders stop starting additional previews after a 1.5-second
scheduling window. Only completed checks support options; incomplete widening
checks are described explicitly. This does not interrupt the current catalogue
lookup by itself; the separate whole-turn deadline below cancels in-flight work.

The recommendation route has a **provisional 15-second server-work deadline**,
approved after a five-second hard cutoff prevented useful completion. Five
seconds remains a soft useful-response target, not a promise or hard stop. TMDB,
OMDb and LLM requests share its abort signal, including response-body reads.
Closing the HTTP response connection also cancels the work. Other endpoints
retain their own provider timeouts. Cancellation is rethrown instead of treated
as empty catalogue data, and aborted/late results are not cached.

At expiry the API sends one `search_timeout` text clarification with
`requestDiagnostics: { "outcome": "timed_out", "deadlineMs": 15000, "elapsedMs": 15000, "stages": [...] }`, no partial
recommendations and the original saved `spec` (or no spec on a first request).
An understood follow-up is not committed if the response cannot finish; retry
that change. The reply explicitly distinguishes an incomplete search from no
matches. Completed responses also carry diagnostics with `outcome: "completed"`.
Stages record `{ stage, durationMs }` for successive understanding, retrieval,
ranking, verification and catalogue-choice work; repeated stages are possible.
Durations are elapsed wall time, not per-provider CPU time. Frontend messages/
passes and eval transcripts retain them. Eval reports separate timed-out turns
from completed-result latency; cases cannot pass using stale prior results after
an unfinished final turn.

This bounds event-loop/server work, not network transit or CPU stalls. It is
not proof that useful recommendations complete in five seconds: live success
quality, timeout rate and end-to-end latency acceptance remain unverified.

#### Progressive POST responses

Send `Accept: text/event-stream` to opt in; other clients keep the existing JSON
contract. The browser uses fetch (not EventSource) so POST payloads, option tokens
and AbortSignal cancellation remain unchanged.

```text
event: progress
data: {"stage":"understanding","elapsedMs":0}

event: progress
data: {"stage":"retrieval","elapsedMs":420}

event: response
data: {"success":true,"recommendations":[],"spec":{},"requestDiagnostics":{"outcome":"completed","deadlineMs":15000,"elapsedMs":1800,"stages":[]}}

```

The terminal data above is illustrative: actual results/clarifications and the
full validated spec have the same shape as JSON replies. Progress reports an
actual stage transition, not a completed interpretation, title list or state
commit. One `response` event terminates success/clarification, including a timeout;
one `error` event terminates failure with `{ success: false, message }`. After
headers are flushed, errors use the event rather than changing HTTP status.
EOF without a terminal event is a transport failure; the browser preserves its
saved request and offers retry. Proxy buffering must be disabled for immediate
progress (`Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no` are sent).
Deployment/proxy behaviour still needs verification.

### GET /health

Returns `{ "status": "OK" }` for the running HTTP service. It does not probe any
provider, credentials, quota or catalogue.

### GET /highlights

Returns quality-filtered, deduplicated TMDB daily/weekly trending tiles. With
TMDB disabled it returns success with an empty list. Thresholds and limits belong
to [the route implementation](src/index.ts), not a second copied configuration.

### GET /highlights/:type/:id

Loads metadata, credits, external IMDb ID and trailer for a TMDB `movie` or `tv`
identifier. Returns `highlightDetails`; disabled TMDB yields 503, invalid
identifiers 400 and missing titles 404. It does not fetch streaming availability.

### GET /availability/:imdbId?region=GB

Loads availability by IMDb ID and region, normalising UK to GB. Returns
`availability` plus `diagnostics` with provider status; an empty successful HTTP
response can mean disabled, rate-limited or failed enrichment, not necessarily
"not available to watch". Supply region explicitly to keep clients consistent.
Backend caches are keyed by IMDb ID and country, with status-specific TTLs in
[streaming.ts](src/clients/streaming.ts). Browser caching/retry caveats belong to
the [frontend guide](../frontend/README.md#state-and-lazy-enrichment).

### GET /trailers/:type/:id

Loads a trailer only when details open. Type is `movie` or `tv`; ID is a positive
TMDB integer or an IMDb `tt...` identifier. Returns `{ success: true, trailerUrl }`,
with `null` when no trailer is returned. Invalid identifiers get 400; thrown
lookup errors get 500 and a retry message. Existing TMDB client fallbacks may log
provider errors and return no videos, so `null` is not proof of catalogue absence.
The frontend keeps successful lookups in component memory, aborts on details
change/close and shows retry for explicit failures; failures are not cached.
