# Progress – Granular Task List

## Overall Status

- [x] Phase 1 complete: frontend/backend skeleton and API wiring
- [x] Phase 2 complete: OMDb catalog integration and safety filters
- [x] Phase 3 complete: GitHub Models integration with fallback
- [x] Phase 4 complete: availability, trailers, loading/error states, accessibility work
- [ ] Documentation fully aligned with current implementation
- [x] Frontend lint configuration added
- [ ] TMDB configured locally for trailer verification

---

## Phase 1 – Skeleton MVP

- [x] React + TypeScript + Vite frontend initialized
- [x] Node.js + TypeScript + Express backend initialized
- [x] Home page with free-text input and optional preferences panel
- [x] Results page shell implemented
- [x] `POST /recommendations` endpoint wired to frontend
- [x] Frontend proxy configured for local development

---

## Phase 2 – Catalog Integration

### Catalog
- [x] Evaluate catalog options and move from FM-DB plan to OMDb implementation
- [x] Implement OMDb client in `backend/src/clients/fmdb.ts`
- [x] Search titles by query and type
- [x] Fetch title details by IMDb ID
- [x] Convert OMDb payloads into internal recommendation format
- [x] Handle timeouts and upstream failures gracefully

### Recommendation Engine
- [x] Implement rule-based preference parser
- [x] Extract search terms from user description
- [x] Search OMDb across multiple candidate terms
- [x] Deduplicate by IMDb ID
- [x] Rank results by genre fit and IMDb rating
- [x] Return dynamic recommendations instead of mock-only data

### Content Safety
- [x] Filter adult and unsafe content
- [x] Block unrated / X / NC-17 / TV-MA style results in backend filtering
- [x] Log filtering behavior for debugging

---

## Phase 3 – LLM Integration

### GitHub Models
- [x] Add GitHub Models client using `gpt-4o-mini`
- [x] Parse natural-language preferences with LLM enhancement
- [x] Add batch explanation generation
- [x] Add in-memory caching for LLM outputs
- [x] Fall back to rule-based parsing and template explanations when LLM is unavailable

### Notes
- [x] Use GitHub Models instead of OpenAI as the active integration
- [x] Keep spoiler-safe synopsis generation implemented but not required for v1

---

## Phase 4 – Availability & Polish

### Availability
- [x] Evaluate availability providers
- [x] Select Streaming Availability API via RapidAPI
- [x] Implement streaming client in `backend/src/clients/streaming.ts`
- [x] Fix integration to use `GET /shows/{imdbId}`
- [x] Parse `streamingOptions.<country>[]` into platform/type/link objects
- [x] Pass region from request into availability lookup
- [x] Verify live availability data returned from backend

### Trailer Support
- [x] Extend TMDB client to fetch trailers by IMDb ID
- [x] Add trailer URLs to recommendation responses when available
- [x] Implement frontend trailer modal
- [ ] Configure `TMDB_API_KEY` locally and verify trailer flow end-to-end

### UX and Validation
- [x] Support description-only flow
- [x] Support preferences-only flow
- [x] Reject empty requests with no description and no preferences
- [x] Reject descriptions shorter than 3 characters when provided
- [x] Infer region from browser locale in frontend
- [x] Render availability deep-links in new tabs
- [x] Show explicit "Availability info not available." fallback text
- [x] Add loading and error states on home page

### Accessibility and UI
- [x] Improve ARIA labeling across interactive controls
- [x] Add keyboard support for trailer modal
- [x] Add focus styling and semantic structure on results page
- [x] Keep responsive layout working on desktop and mobile

---

## Current Verification

- [x] Backend build passes
- [x] Frontend build passes
- [x] Backend returns localized availability data for supported titles
- [x] Frontend can render availability links and fallback messaging
- [x] Frontend lint runs with current config (non-blocking TypeScript support warning only)

---

## Open Follow-Ups

- [ ] Refresh setup and summary docs that still mention OpenAI or JustWatch-era assumptions
- [ ] Refresh `Film_Advisor_App_AllDocs.md` narrative sections to match implemented architecture and status
- [ ] Rotate exposed development secrets
- [ ] Consider backend pipeline optimization or refactoring if performance becomes an issue
- [ ] Plan v2 features if any (spoiler handling, user accounts, advanced filtering, etc.)