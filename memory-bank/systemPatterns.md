# System Patterns – Architecture & Design Patterns

## High-Level Architecture

```
Frontend (React + TypeScript)
  -> POST /recommendations
Backend API (Express + TypeScript)
  -> Preference parsing
  -> OMDb search and enrichment
  -> Content-safety filtering
  -> Ranking
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

### `src/engine/preferenceParser.ts`
- Rule-based extraction of genres, moods, content type, and rating limits
- Merges free-text clarification replies into the active preference analysis
- Serves as the baseline parser even when LLM features are unavailable

### `src/engine/recommendationEngine.ts`
- Central orchestration module
- Combines parsing, search, filtering, ranking, explanations, availability, and trailers
- Reuses reference-title metadata and suppresses anchor-title repeats for non-rewatch reference flows
- Preserves graceful degradation when optional providers fail

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
- Trailer lookup by IMDb ID
- Optional enrichment layer only

---

## Frontend Pattern

### `frontend/src/App.tsx`
- Top-level request orchestration
- Infers region from browser locale
- Manages loading, error, results, and page state

### `frontend/src/pages/HomePage.tsx`
- Collects description and optional preference controls
- Enforces the current validation contract:
  - description optional if preferences selected
  - minimum length only when description is provided

### `frontend/src/pages/ResultsPage.tsx`
- Renders result cards
- Shows availability links or explicit fallback text
- Opens trailers inside a modal when trailer URLs exist

---

## Data Flow Pattern

1. User submits description, preferences, or both.
2. Frontend infers region from browser locale and includes it in request payload.
3. Backend validates the request.
4. Parser extracts preferences from the initial prompt and any clarification reply.
5. Intent/confidence gating and weak-result quality checks decide whether to clarify or finalize.
6. LLM optionally enriches parsing and explanations.
7. OMDb returns title candidates and details.
8. Engine filters unsafe content and ranks candidates with mode-specific and reference-aware heuristics.
9. Engine enriches results with availability and trailers in batch-like workflows.
10. Frontend renders cards with graceful fallback for missing enrichments.

---

## Reliability Pattern

- OMDb is the only required external data source for meaningful recommendations.
- GitHub Models, RapidAPI, and TMDB are optional layers.
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

---

## Known Structural Debt

- `fmdb.ts` is a legacy filename for the OMDb client and may be worth renaming later.
- Spoiler-safe synopsis generation exists in the LLM client but is not wired into the current response flow.
- Dynamic clarification heuristics are rule-based and may still need tuning against more live prompts.