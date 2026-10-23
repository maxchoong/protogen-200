# System Patterns – Architecture & Design Patterns

Status: current architecture overview; details live in feature designs and code.

**As built:** October 16, 2026. See [the conversational-engine design](design-conversational-engine.md) for implementation boundaries and planned phases.

## High-Level Architecture

```
Frontend (React + TypeScript)
  -> POST /recommendations
Backend API (Express + TypeScript)
  -> LLM full-request understanding + validation (rule fallback)
  -> Structured-request overlay on preference parsing
  -> Clarification/results-first decision
  -> TMDB/OMDb retrieval strategy
  -> Content-safety filtering
  -> Ranking
  -> Transparency guardrails + interpretation notes
  -> Final metadata/constraint verification + deterministic copy
  -> JSON response, or progress + terminal response over POST SSE
Details panel opened
  -> GET /highlights/:type/:id when a highlight needs metadata
  -> GET /availability/:imdbId?region=... when an IMDb ID is available
  -> GET /trailers/:type/:id when no trailer is already supplied
```

---

## Backend Module Pattern

### `src/index.ts`
- Checks non-empty input and minimum description length; it is not a complete runtime request-schema validator
- Accepts previous `spec`, resolves signed catalogue choices or calls
  `parseRequestSpec`, gates usable updates and returns the new request. Failed
  saved-spec follow-ups/stale choices return unchanged state plus clarification,
  without retrieval; first/legacy requests can still fall back.
- Supports description-only and preferences-only flows
- Normalizes region and request data before calling the engine
- Applies confidence gating and weak-result clarification decisions
- Applies unsupported critic-source guardrails to the original description; follow-up consent/denial is not a completed state machine (see engine design)
- Attaches interpretation notes when responses use proxy assumptions

### `src/engine/preferenceParser.ts`
- Rule-based extraction of genres, moods, content type, and rating limits, with a successful LLM spec overlaid as the authority for fields it models
- Merges free-text clarification replies into the active preference analysis
- Serves as the first-request/legacy fallback; failed understanding with saved follow-up state now asks rather than reinterpreting it with rules
- Includes generalized genre alias parsing and critics-intent detection
- Tracks pagination state for deterministic "show me more" behavior

### `src/engine/recommendationEngine.ts`
- Central orchestration module
- Combines parsing, search, filtering, ranking, final metadata verification and
  deterministic explanations; trailers and availability load on details open
- Reuses reference-title metadata and suppresses anchor-title repeats for non-rewatch reference flows
- Preserves graceful degradation when optional providers fail
- Supports intent-specific retrieval paths (e.g., blockbuster paging and critics-year proxy)
- Applies quality floors for critics-proxy mode to avoid low-signal/noisy results
- Fetches fresh candidates when structured search fields change; tone-only/unchanged scope can reuse previous recommendations

### `src/clients/fmdb.ts`
- OMDb client despite legacy filename
- Handles search, detail fetch, normalization, and timeout behavior

### `src/clients/llm.ts`
- Configurable OpenAI-compatible client (local evaluation used Gemini `gemini-3.5-flash-lite`; OpenAI default is `gpt-4o-mini`)
- Provides:
  - full structured request plus turn operation
  - older preference parsing and generated copy for standalone/legacy callers;
    these are no longer repeated/awaited in recommendation-route delivery
  - cached LLM output
- Uses fallback behavior rather than hard failure
- No automatic SDK retries; the first 429 starts a process-local 60 s cooldown.
  Timeouts/503s are not covered by that cooldown.

### `src/clients/streaming.ts`
- Streaming Availability client
- Uses IMDb ID directly via `/shows/{imdbId}`
- Maps `streamingOptions[country]` into frontend-friendly availability objects

### `src/clients/tmdb.ts`
- Year/popularity retrieval, details enrichment, credits, external-ID mapping, and trailers
- Primary enrichment layer with graceful degradation behavior

---

## Frontend Pattern

### `frontend/src/App.tsx`
- Top-level request orchestration
- Infers region from browser locale
- Owns submission and region inference; the shared `useConversation` hook owns messages, request spec, recommendation rounds, loading and errors in React memory

### `frontend/src/pages/ConversationalHome.tsx`
- Primary interaction surface for freeform multi-turn conversation
- Clarification options submit directly when backend asks follow-up questions
- No meta-steering controls; next-turn refinement is freeform user text
- Stores the returned request spec and sends it back on follow-ups; chat reset clears it

### `frontend/src/pages/ResultsPage.tsx`
- Renders result cards
- Shows availability links or explicit fallback text
- Displays active constraints and interpretation note when provided
- Opens trailers inside a modal when trailer URLs exist
- Loads highlight details and streaming availability lazily; session-cache behaviour and limitations belong to the [frontend README](../frontend/README.md)

---

## Data Flow Pattern

1. User submits description, preferences, or both.
2. Frontend infers region from browser locale and includes it in request payload.
3. Backend validates the request.
4. A signed catalogue choice supplies its checked change without repeat
   understanding; otherwise LLM understanding returns the full updated request
   and operation. Acceptance checks and the parser overlay produce engine
   preferences. Failed saved-spec follow-ups/stale choices ask without searching;
   first/legacy requests can use rules.
5. Transparency guardrail checks explicit unsupported critic sources.
6. Concrete validated directions try results first. Broad structured requests
   can ask catalogue-built genre questions, verified through final matching
   results. Empty structured searches offer checked opt-in widening; the legacy
   no-spec path retains cheaper rule probes. See [choice design](design-conversational-engine.md#catalogue-choice-slice-october-16-locally-implemented).
7. The route marks understanding attempted, preventing a second legacy parsing
   call even on fallback. Copy is deterministic, not an optional blocking LLM call.
8. TMDB/OMDb retrieval returns title candidates and details.
9. Engine applies metadata-dependent safety and common format/date/year/origin/exclusion gates, then ranks with mode-specific/reference/critics heuristics. Final enriched candidates pass the common gates again.
10. Engine enriches final recommendations with required metadata and rechecks
    constraints. Trailers and availability remain unfetched until details open.
11. Backend returns applied constraints and interpretation note metadata for UI transparency.
12. The response includes the spec; frontend renders recommendations with fallback text for missing enrichments or an absent assistant intro.

Recommendation work shares a provisional 15-second deadline and disconnect signal across
catalogue and LLM transport. Expiry sends an explicit incomplete-search question
with the prior saved spec, never unchecked partial results or empty-catalogue
claims. Five seconds is a soft target; real stages stream to browser POST callers
without committing state. Other callers retain JSON. Cancel/reset/unmount abort
fetch. Details belong to the [delivery design](design-conversational-engine.md#progressive-delivery-refinement-october-16-locally-implemented).

---

## Reliability Pattern

- TMDB and OMDb are both used in retrieval/enrichment strategy with fallback behavior.
- LLM-provider and RapidAPI enrichments remain optional layers.
- If optional integrations fail:
  - rules/template paths can still produce recommendations when retrieval succeeds
  - explanations fall back to templates
  - availability becomes empty
  - trailer buttons disappear

This is graceful degradation, not guaranteed non-empty or equivalent results.
If retrieval is empty, the API offers widening rather than static mock titles.
Client TTL caches are process-local, not persistent shared infrastructure;
LLM output/reference metadata also use in-memory caches. Current browser
storage and retry limitations are owned by the frontend README.

---

## Validation and Safety Pattern

- Reject completely empty recommendation requests; a previous spec alone is not a valid request.
- Reject descriptions under 3 characters when present.
- Safety is metadata-dependent, not a full age guarantee. TMDB search/discovery
  requests exclude adult results and their client filters check the adult flag.
  The engine's `filterContent` instead blocks known `rated` labels (NC-17, X,
  XXX, TV-MA, Unrated, Not Rated) and requires title/plot. TMDB candidates are
  converted with no `rated` field, so that blocklist cannot protect them.
  Missing ratings are allowed; neither `maxRating` nor `maxCertification` is
  enforced as a per-user ceiling. There is no universal final adult/certification
  recheck across recommendation, reference, highlight and details paths.
- Keep adult-content blocking as a backend concern, not a frontend-only rule.
- Empty retrieval offers widening; non-empty weak sets can still be returned. Do not treat the current quality gate as a guarantee of strong matches.
- Never fabricate unavailable data-source support; disclose proxy behavior explicitly.

---

## Known Structural Debt

- `fmdb.ts` is a legacy filename for the OMDb client and may be worth renaming later.
- Spoiler-safe synopsis generation exists in the LLM client but is not wired into the current response flow.
- When to ask still needs live calibration; tone/theme-built choices are not
  implemented. Structured genre choices and explicit widening are locally built.
- General recorded loosening, unified ranking and full fact-grounded replies
  remain planned. Progressive delivery is implemented locally, not deployment-certified.
- Saved-spec failure handling now protects state via clarification; offline
  interpretation parity and live successful-response quality/latency acceptance
  remain open. See [active context](activeContext.md) and [progress](progress.md);
  provider availability is not proven by configuration or an old smoke check.