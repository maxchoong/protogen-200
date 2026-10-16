# Tech Context – Architecture & Implementation

Status: current integration reference; setup commands belong to the READMEs.

**As built:** October 16, 2026. Validation dates and evaluation caveats are recorded in [progress](progress.md).

## Stack

### Frontend
- React 18
- TypeScript
- Vite 5
- Tailwind CSS

### Backend
- Node.js 20
- Express 4
- TypeScript 5

### External Services
- TMDB for discovery, details enrichment, credits, trailers, and IMDb mapping
- OMDb/FMDb path for search/details fallback and metadata compatibility
- OpenAI-compatible Chat Completions API for optional full-request understanding, legacy preference parsing, clarification, explanations and intros (default model: `gpt-4o-mini`)
- Streaming Availability API via RapidAPI for watch-platform availability

---

## Runtime Architecture

### Frontend Responsibilities
- Collect user description and optional preferences
- Allow submission with description, preferences, or both
- Infer `region` from `navigator.language`
- Region can be overridden with `VITE_STREAMING_REGION`; the previous request `spec` is stored and sent on follow-ups.
- Recommendation calls use `VITE_BACKEND_URL`, otherwise `http://localhost:3000` in development or the configured Render URL in production. The separate Vite `/api` proxy currently targets Render, not local port 5000.
- Send `POST /recommendations` to backend
- Render recommendation cards, availability links, and trailer modal

### Backend Responsibilities
- Check basic non-empty/minimum-length input rules; full runtime shape validation remains open
- Understand each turn with an optional LLM full-request spec, validate it and overlay it on rule-derived preferences; use rules on failure
- Retrieve candidate titles using TMDB and/or OMDb strategies
- Apply content-safety filtering
- Rank and shape recommendations
- Enrich recommendation results with trailers; serve availability separately on details-panel open
- Attach applied constraints and interpretation notes for transparent conversational responses

---

## API Design

### `POST /recommendations`

**Request**
```json
{
  "description": "Inception-like sci-fi thriller",
  "preferences": {
    "genres": ["Sci-Fi", "Thriller"],
    "mood": ["Intense"],
    "type": "movie",
    "maxRating": "PG-13"
  },
  "region": "US"
}
```

**Validation Rules**
- Request is invalid if description is empty and no preferences are selected.
- If description is present, it must be at least 3 characters.
- Preferences-only flow is valid.

**Response and other endpoints:** see the [backend API guide](../backend/README.md#api-endpoints)
and route types in [index.ts](../backend/src/index.ts). This avoids a second
contract example drifting from structured state and lazy availability.

---

## Recommendation Pipeline

1. Apply basic request input checks (not complete runtime schema validation).
2. Attempt full-request understanding, gate usable updates and overlay successful output. Failed saved-spec follow-ups preserve state and ask without retrieval; first/legacy requests can use rules. Explicit controls retain precedence.
3. Detect refinement modes (e.g., mainstream paging, critics proxy, genre aliases).
4. Retrieve candidates from TMDB and/or OMDb depending on intent and provider availability; changed structured scope requires fresh retrieval rather than only re-ranking previous results.
5. Normalize and enrich candidates (runtime, genres, language, cast/director where available).
6. Apply metadata-dependent safety filters; see [safety boundaries](systemPatterns.md#validation-and-safety-pattern).
7. Rank with mode-aware scoring, common date/format/year/origin/language/exclusion gates and relaxable genre matching; missing-language and rating limitations are in the [engine design](design-conversational-engine.md).
8. Generate "Why this?" explanations using LLM batch mode or fallback templates.
9. Leave availability unfetched in the recommendation response; the frontend requests it by IMDb ID and region when details open.
10. Fetch trailers using TMDB when possible.
11. Return recommendations or clarification with the request `spec`, constraints, intent metadata, diagnostics and optional reply/interpretation text. Some result paths omit the intro; the frontend supplies generic text.

---

## Service Integration Notes

### TMDB
- Used for year-based discovery, popularity retrieval, enrichment details, credits, and trailers.
- Also used for IMDb-to-TMDB mapping and richer metadata hydration.

### OMDb / FMDb path
- Provides additional search/detail fallback and compatibility fields.
- Supports recommendation continuity where TMDB is unavailable or sparse.
- Despite the legacy "no key required" client comments, this is an OMDb endpoint
  using a fixed testing credential, not a keyless independent catalogue. It has
  no environment-configured OMDb key path. Treat this fallback as an external
  dependency with uncertain production reliability, not guaranteed continuity.

### Optional LLM Provider
- The current client does not support the legacy GitHub Models hosts or GitHub-token credentials. Use the project's [provider setup guide](../backend/GITHUB_MODELS_SETUP.md).
- Default base URL: `https://api.openai.com/v1`, default model: `gpt-4o-mini`.
- Configure `OPENAI_API_KEY`, or provider-specific `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`. GitHub tokens are not used as provider credentials.
- `npm --prefix backend run check:llm` checks the older preference parser and batch explanations, not `parseRequestSpec` or a full conversation. It makes up to two provider calls; a configured key or this smoke check alone does not establish full-path health.
- Gemini is now configured locally via `LLM_API_KEY`, `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`, and `LLM_MODEL=gemini-3.5-flash-lite`. Both live smoke-check paths passed October 2, 2026; the 2.5 Flash-Lite model returned 404 despite catalog presence. Keys stay in the ignored local environment file. Restart backend processes after environment changes.
- Used for:
  - full updated structured request and turn operation
  - older enhanced preference parsing when no successful spec is available
  - batch recommendation explanations
  - clarification wording and results intros
- Understanding: JSON-object mode, 700 output tokens, 8 s per-attempt timeout, one retry. Other stages default to 15 s per attempt/two retries. A process-local 60 s cooldown follows a completed 429 failure; retries happen before the cooldown starts.
- Multiple LLM stages can run per turn. Do not assume two provider requests per query or a fixed daily capacity. Dated provider failures and latency results belong to [progress](progress.md), not a continuing health guarantee.
- Fallback mode keeps the app usable without a token

### Streaming Availability
- Host: `streaming-availability.p.rapidapi.com`
- Verified endpoint: `GET /shows/{imdbId}`
- Query params include `country`, `output_language`, and `series_granularity`
- Response is read from `streamingOptions[country]`
- Called by the separate availability route, not recommendation generation.
  Backend caches are process-local and status-aware; browser cache behaviour
  and retry limitations are documented in the [frontend README](../frontend/README.md).

### TMDB
- Core retrieval and enrichment path for multiple recommendation modes
- Missing key or failures should degrade gracefully to other available signals

## Transparency and Honesty Policy (Implemented)

- Critics-style prompts are treated as proxy intent using available rating/vote signals.
- Explicit external critic-source requests in the original description trigger
  clarification; follow-up detection and consent are incomplete (see engine design).
- Responses can include `interpretationNote` to explain proxy assumptions to the user.

---

## Constraints and Trade-Offs

- No persistent user storage in v1.
- Availability and trailer data are optional enrichments, not hard dependencies.
- Spoiler-safe synopsis generation exists in code but is not part of the active v1 response contract.
- Frontend and backend ESLint checks are configured in their respective packages.
  Dated pass evidence belongs to [progress](progress.md), not this reference.
- GitHub Actions configures frontend lint/build, backend lint/build/test and a
  separate documentation test/audit job on pushes and pull requests.
- Content safety relies on metadata filtering and may still need broader test coverage.
- Failed saved-spec follow-ups preserve state and ask rather than pretending
  to apply a change. Offline interpretation equivalence is not claimed; the
  first-request/legacy rule path still differs from successful understanding.
- Evaluation reports other than `baseline-*` are ignored local files. See [progress](progress.md) for persistent summaries and exact report names.