# System Patterns – Architecture & Design Patterns

## High-Level Architecture

```
Frontend (React + TypeScript)
  -> POST /recommendations
Backend API (Express + TypeScript)
  -> Preference parsing
  -> TMDB/OMDb retrieval strategy
  -> Content-safety filtering
  -> Ranking
  -> Transparency guardrails + interpretation notes
  -> GitHub Models explanation generation
  -> Streaming Availability lookup
  -> TMDB trailer lookup
```

---

## Backend Module Pattern

### `src/index.ts`
- Accepts and validates the API request
- Supports description-only and preferences-only flows
- Normalizes region and request data before calling the engine
- Applies confidence gating and weak-result clarification decisions
- Applies honesty guardrails for unsupported explicit critic-source requests
- Attaches interpretation notes when responses use proxy assumptions

### `src/engine/preferenceParser.ts`
- Rule-based extraction of genres, moods, content type, and rating limits
- Merges free-text clarification replies into the active preference analysis
- Serves as the baseline parser even when LLM features are unavailable
- Includes generalized genre alias parsing and critics-intent detection
- Tracks pagination state for deterministic "show me more" behavior

### `src/engine/recommendationEngine.ts`
- Central orchestration module
- Combines parsing, search, filtering, ranking, explanations, availability, and trailers
- Reuses reference-title metadata and suppresses anchor-title repeats for non-rewatch reference flows
- Preserves graceful degradation when optional providers fail
- Supports intent-specific retrieval paths (e.g., blockbuster paging and critics-year proxy)
- Applies quality floors for critics-proxy mode to avoid low-signal/noisy results

### `src/clients/fmdb.ts`
- OMDb client despite legacy filename
- Handles search, detail fetch, normalization, and timeout behavior

### `src/clients/llm.ts`
- GitHub Models client
- Provides:
  - enhanced preference parsing
  - batch "Why this?" explanations
  - cached LLM output
- Uses fallback behavior rather than hard failure

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
- Manages loading, error, results, and page state

### `frontend/src/pages/ConversationalHome.tsx`
- Primary interaction surface for freeform multi-turn conversation
- Clarification options submit directly when backend asks follow-up questions
- No meta-steering controls; next-turn refinement is freeform user text

### `frontend/src/pages/ResultsPage.tsx`
- Renders result cards
- Shows availability links or explicit fallback text
- Displays active constraints and interpretation note when provided
- Opens trailers inside a modal when trailer URLs exist

---

## Data Flow Pattern

1. User submits description, preferences, or both.
2. Frontend infers region from browser locale and includes it in request payload.
3. Backend validates the request.
4. Parser extracts preferences from the initial prompt and any clarification reply.
5. Transparency guardrail checks explicit unsupported critic sources.
6. Intent/confidence gating and weak-result quality checks decide whether to clarify or finalize.
7. LLM optionally enriches parsing and explanations.
8. TMDB/OMDb retrieval returns title candidates and details.
9. Engine filters unsafe content and ranks candidates with mode-specific, reference-aware, and critics-proxy heuristics.
10. Engine enriches results with availability and trailers in batch-like workflows.
11. Backend returns applied constraints and interpretation note metadata for UI transparency.
10. Frontend renders cards with graceful fallback for missing enrichments.

---

## Reliability Pattern

- TMDB and OMDb are both used in retrieval/enrichment strategy with fallback behavior.
- GitHub Models and RapidAPI enrichments remain optional layers.
- If optional integrations fail:
  - recommendations still return
  - explanations fall back to templates
  - availability becomes empty
  - trailer buttons disappear

This pattern keeps the app functional under missing config, rate limits, or upstream failures.

---

## Validation and Safety Pattern

- Reject completely empty recommendation requests.
- Reject descriptions under 3 characters when present.
- Filter unsafe titles after OMDb normalization.
- Keep adult-content blocking as a backend concern, not a frontend-only rule.
- Prefer clarification over returning weak recommendation sets.
- Never fabricate unavailable data-source support; disclose proxy behavior explicitly.

---

## Known Structural Debt

- `fmdb.ts` is a legacy filename for the OMDb client and may be worth renaming later.
- Spoiler-safe synopsis generation exists in the LLM client but is not wired into the current response flow.
- Dynamic clarification heuristics are rule-based and may still need tuning against more live prompts.