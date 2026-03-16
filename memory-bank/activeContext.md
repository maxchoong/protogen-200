# Active Context – Current Work & Decisions

## Project Status

**Date:** March 13, 2026  
**Phase:** v1 implementation complete; documentation and final polish in progress  
**Overall Progress:** Core recommendation flow, availability integration, and UI polish are implemented and working.

---

## Current Reality

- Frontend and backend are implemented and build successfully.
- Backend runs on port 3000; frontend runs on port 5173.
- OMDb is the active catalog source.
- GitHub Models `gpt-4o-mini` is the active LLM integration with rule-based fallback.
- Streaming Availability via RapidAPI is integrated and verified against the current `/shows/{imdbId}` endpoint.
- TMDB trailer lookup code exists, but trailer data depends on a valid `TMDB_API_KEY` being configured.

---

## Recently Verified

- Questions-only flow works: requests may include preferences without a description.
- Description validation works: if provided, description must be at least 3 characters.
- Region is inferred from browser locale in the frontend and passed through to backend availability lookup.
- Availability links open in a new tab and include an explicit fallback message when unavailable.
- RapidAPI availability lookups return live data for supported titles and regions.

---

## Current Architecture Snapshot

### Backend
- Node.js 20 + Express + TypeScript
- Main endpoint: `POST /recommendations`
- Recommendation engine pipeline:
  1. Validate request
  2. Parse preferences with rule-based logic
  3. Optionally enhance parsing and explanations with GitHub Models
  4. Search OMDb and enrich title details
  5. Apply content-safety filtering
  6. Rank results
  7. Fetch streaming availability by IMDb ID and region
  8. Fetch trailers by IMDb ID when TMDB is configured

### Frontend
- React 18 + TypeScript + Vite 5 + Tailwind CSS
- Home page supports free-text and optional preference questions
- Results page shows recommendations, availability links, and trailer modal support
- Browser locale is used to infer `region`

---

## Important Decisions

- No user accounts or persistent user storage in v1.
- Content safety remains non-negotiable: adult, unrated, X, and similar unsafe results are filtered.
- Region selection is inferred from browser locale instead of asking the user directly.
- Spoiler-control is deferred for v1 even though synopsis-generation helpers exist in the LLM client.
- Graceful degradation is required: the app must still work if GitHub Models, RapidAPI, or TMDB are not configured.

---

## Remaining Gaps

- Trailer support is not active locally until `TMDB_API_KEY` is configured.
- `Film_Advisor_App_AllDocs.md` still contains older plan-era sections and should be refreshed when full narrative alignment is needed.
- Frontend lint now runs with a TypeScript support warning from `@typescript-eslint` (TS 5.9.x vs recommended range), but no lint-rule violations.
- Exposed local secrets referenced during development should be rotated.

---

## Current Session Focus

- Workspace structure verified and project state analyzed
- Memory bank review in progress
- Ready to proceed with next implementation or documentation tasks

## Next Steps

1. Update memory-bank and setup documentation to match v1 implementation
2. Decide whether to configure TMDB locally for trailer verification
3. Rotate any exposed development secrets
4. Refresh `Film_Advisor_App_AllDocs.md` and setup docs (PHASE_3_SUMMARY.md, PHASE_4_SETUP.md, etc.)