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
rule parser and is returned to the client for the next turn. A successful spec
replaces the older LLM preference-parsing call.

Concrete structured requests try results before first-turn clarification.
Broad origin-only or vague requests can still clarify. Options are currently
written by templates/the LLM and probed with the rule parser; catalogue-built,
spec-aware options are not implemented.

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
The October 15 baseline file exists in the current uncommitted worktree; do not
assume it has been committed. Dated summaries persist in the memory bank.

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
    "stages": ["request understanding", "recommendation explanations"]
  }
}
```

Send the returned `spec` unchanged on the next request alongside the original
`description` and `clarificationContext` containing the latest `userClarification`,
`userTurns`, and a positive `clarificationRound`. New chats omit the previous spec.
Responses may instead include `requiresClarification`, or result metadata such as
`assistantMessage`, `interpretationNote`, `turnOperation` and retrieval diagnostics.

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
Cached LLM output is reported when it is used; provider configuration alone does
not count as usage.

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
