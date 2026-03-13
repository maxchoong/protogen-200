# Film & TV Advisor – Product Documents (As-Built)

This file includes:

1. Product Requirements Document (PRD)
2. Design Document
3. Granular Task List (implementation status)

---

## Current Status

- Last updated: March 13, 2026
- v1 implementation status: Core flow is complete and operational.
- End-to-end working path: Home input -> backend recommendations -> results cards -> availability links -> optional trailer modal.

### What Works Now

- Description-only and preferences-only recommendation flows.
- Validation contract:
  - Empty description plus empty preferences is rejected.
  - Description is optional but must be at least 3 characters if provided.
- Region is inferred in frontend from browser locale and sent to backend.
- OMDb-backed recommendation search and metadata enrichment.
- Content safety filtering for adult and blocked ratings.
- GitHub Models (`gpt-4o-mini`) enhancement with fallback behavior.
- RapidAPI Streaming Availability integration via `GET /shows/{imdbId}`.
- Availability deep links and explicit fallback text when unavailable.
- Frontend and backend builds pass.
- Frontend lint script is configured and runs.

### Known Gaps / Follow-Ups

- Trailer coverage depends on `TMDB_API_KEY`; trailer enrichment is optional.
- Consolidated docs in older files may still contain legacy terms and should be refreshed over time.
- Development secrets referenced in local history should be rotated.

---

## 1. Product Requirements Document (PRD)

### 1.1 Product Overview

- Product: Film & TV Advisor
- Goal: Help users quickly find what to watch based on mood and preferences, then start watching with minimal friction.

### 1.2 Key User Personas

- Casual Viewer: Wants quick suggestions with little effort.
- Picky Enthusiast: Wants preference-aware and explainable picks.
- Busy User: Wants direct watch links and trailers without extra searching.

### 1.3 User Stories and Acceptance Status

#### User Story 1 – Free-Text Description

As a user, I want to describe what I am in the mood to watch in my own words so that I can get recommendations matching current interests.

Acceptance status:

- 1.1 Free-text input supported: Implemented.
- 1.2 Input supports at least 200 characters: Implemented (UI supports up to 500).
- 1.3 Natural language accepted: Implemented.
- 1.4 Submit processes request and returns recommendations: Implemented.
- 1.5 Validation for empty/too-short input unless question-only flow is used: Implemented.

#### User Story 2 – Preference Questions

As a user, I want a few simple preference questions so recommendations improve when my text is vague or I do not want to type much.

Acceptance status:

- 2.1 Optional preference controls available: Implemented.
- 2.2 Questions are optional and skippable: Implemented.
- 2.3 Answers influence filtering/ranking: Implemented.
- 2.4 Answers can be changed before submit: Implemented.
- 2.5 Questions-only flow works with no description: Implemented.

#### User Story 3 – Recommendations and Explanations

As a user, I want a concise list of recommended titles with a clear explanation for each recommendation.

Acceptance status:

- 3.1 Returns a recommendation list per query: Implemented.
- 3.2 Card fields (title, type, year, poster, why-this): Implemented.
- 3.3 Why-this references preferences or title attributes: Implemented (LLM + fallback template).
- 3.4 Friendly empty state when no results: Implemented.
- 3.5 Results sorted by relevance: Implemented (genre fit + rating heuristics).

Note: Typical results target remains 5-10, but exact count can vary by upstream data and filtering.

#### User Story 4 – Where to Watch

As a user, I want availability information so I can quickly start watching.

Acceptance status:

- 4.1 Platforms shown when availability exists: Implemented.
- 4.2 Availability type shown when provided: Implemented.
- 4.3 Platform links open provider pages when links exist: Implemented.
- 4.4 Explicit fallback when unavailable: Implemented (`Availability info not available.`).
- 4.5 Region-aware availability behavior: Implemented.

#### User Story 5 – Brief, Spoiler-Free Description

As a user, I want a short, spoiler-safe description for each title.

Acceptance status:

- 5.1 Brief synopsis shown on cards: Implemented.
- 5.2 Spoiler avoidance policy: Partially implemented.
- 5.3 Vetted source or spoiler filtering logic: Partially implemented.
- 5.4 Fallback text if synopsis missing: Implemented.
- 5.5 Movie/series label visible: Implemented.

Note: Spoiler-safe summary generation helpers exist but are not fully wired as a strict v1 guarantee.

#### User Story 6 – Watch the Trailer

As a user, I want to watch a trailer from the app to evaluate interest quickly.

Acceptance status:

- 6.1 Trailer CTA shown when trailer exists: Implemented.
- 6.2 Trailer opens playable experience (modal with embed): Implemented.
- 6.3 No-trailer behavior handled by hiding CTA: Implemented.
- 6.4 Basic controls and close behavior: Implemented.
- 6.5 Region-aware trailer alternatives: Not implemented.

### Content Safety Requirement

Required behavior: no adult, unrated, X/NC-17 style unsafe recommendations.

Current status: Implemented in backend filtering logic; additional automated coverage is still a good follow-up.

### Out of Scope for v1

- Accounts and persistent profiles.
- Watchlist/bookmarks.
- Persistent recommendation history.
- Advanced refinement workflows beyond current preferences panel.

---

## 2. Design Document

### 2.1 Architecture Overview (As Implemented)

Platform: Responsive web app (desktop + mobile).

Frontend:

- React 18 + TypeScript + Vite 5 + Tailwind CSS.
- Single-page flow: Home page for input, Results page for output.
- Region inferred from `navigator.language`.

Backend:

- Node.js 20 + Express + TypeScript.
- Main API endpoint: `POST /recommendations`.
- Orchestrates parsing, search, filtering, ranking, and optional enrichments.

External Integrations:

- Catalog: OMDb API.
- LLM: GitHub Models (`gpt-4o-mini`) via a compatible SDK client interface.
- Availability: Streaming Availability API via RapidAPI (`GET /shows/{imdbId}`).
- Trailers: TMDB lookup by IMDb ID (optional and key-gated).

Data and storage:

- No user DB.
- In-memory caching for selected LLM outputs.
- On-demand upstream calls with graceful fallback.

### 2.2 Request and Response Contract

Endpoint: `POST /recommendations`

Request shape:

```json
{
  "description": "inception-like sci-fi thriller",
  "preferences": {
    "genres": ["Sci-Fi", "Thriller"],
    "mood": ["Intense"],
    "type": "movie",
    "maxRating": "PG-13"
  },
  "region": "US"
}
```

Validation behavior:

- Reject if no description and no selected preferences.
- If description exists, enforce minimum length of 3.
- Accept preferences-only requests.

Response shape (simplified):

```json
{
  "success": true,
  "recommendations": [
    {
      "id": "tt1375666",
      "title": "Inception",
      "year": "2010",
      "type": "movie",
      "synopsis": "...",
      "whyThis": "...",
      "posterUrl": "https://...",
      "availability": [
        {
          "platform": "Apple TV",
          "type": "rent",
          "link": "https://..."
        }
      ],
      "trailerUrl": "https://...",
      "score": 8.8
    }
  ]
}
```

### 2.3 Recommendation Pipeline (Current)

1. Validate request body and normalize description/region.
2. Parse preferences with rule-based parser.
3. Optionally merge LLM-derived preference signals.
4. Build search terms and query OMDb.
5. Normalize and deduplicate candidates by IMDb ID.
6. Apply content safety filtering.
7. Rank by relevance heuristics.
8. Generate why-this explanations (LLM batch when available, fallback otherwise).
9. Enrich with streaming availability using IMDb IDs and region.
10. Enrich with trailers when TMDB key is available.

### 2.4 UX and Interaction Design (Current)

Home page:

- Free-text input with character count.
- Expandable preferences panel.
- Submit with validation-aware disabled state.
- Loading and error states.

Results page:

- Query context header.
- Recommendation cards with poster/title/type/year/synopsis/why-this.
- Availability chips/links.
- Explicit availability fallback text.
- Trailer button when trailer URL exists.
- Modal trailer player with keyboard close support.

### 2.5 Reliability and Degradation Strategy

- OMDb is effectively required for meaningful dynamic recommendations.
- LLM, availability, and trailers are optional enrichments.
- If optional integrations fail or are unconfigured:
  - Recommendations still return.
  - Why-this falls back to template logic.
  - Availability may be empty.
  - Trailer CTA may be absent.

### 2.6 Security and Privacy

- API keys are server-side only.
- No persistent user account data.
- Input validation is server-enforced.
- Content safety filtering runs in backend pipeline.

Operational note: Rotate any leaked development credentials.

---

## 3. Granular Task List (Mapped to Stories)

Status legend:

- Done: implemented and verified in current app flow.
- Remaining: in scope but not fully complete.
- Deferred: intentionally left out of v1.

### User Story 1 – Free-Text Input

Done:

- Home input UI with natural-language text area.
- Validation rules for minimum description length and empty payload protection.
- Submit wiring to `POST /recommendations`.
- Loading and error state handling.

Remaining:

- None required for current v1 behavior.

Deferred:

- None.

### User Story 2 – Preference Questions

Done:

- Optional preference panel with genres/mood/type/rating controls.
- Questions-only submission path.
- Preference edits before submit.
- Backend preference handling and validation.

Remaining:

- Expand preference taxonomy beyond current option set.

Deferred:

- Complex multi-step questionnaire logic.

### User Story 3 – Recommendations and Why-This

Done:

- Dynamic recommendation generation from OMDb candidates.
- Deduplication, safety filtering, ranking.
- Why-this generation via LLM + fallback template.
- Results rendering and empty state.

Remaining:

- Deeper ranking features (reference-title similarity beyond current heuristic).

Deferred:

- Personalized profiles/history-based ranking.

### User Story 4 – Where to Watch

Done:

- RapidAPI streaming integration with current endpoint.
- Region propagation and lookup.
- Platform/type/link rendering.
- Explicit unavailability fallback text.

Remaining:

- Broader monitoring around regional availability variance.

Deferred:

- Multi-provider aggregation beyond current service.

### User Story 5 – Brief, Spoiler-Free Description

Done:

- Synopsis shown on recommendation cards.
- Fallback behavior when synopsis data is absent.

Remaining:

- Fully enforce spoiler-safe summary guarantees for all titles.
- Expand automated checks/tests for spoiler policy behavior.

Deferred:

- Human moderation pipeline for synopsis quality.

### User Story 6 – Trailer Playback

Done:

- Trailer URL enrichment pipeline exists.
- Trailer CTA and modal playback UI.
- Keyboard and close handling in modal.

Remaining:

- Configure `TMDB_API_KEY` in local/target environments and verify coverage.
- Improve region-specific trailer fallback behavior.

Deferred:

- In-app trailer source selection and fallback cascade.

### Cross-Cutting Work

Done:

- Frontend and backend builds passing.
- Frontend lint config added and lint script running.
- Core accessibility improvements for key interactive controls.

Remaining:

- Refresh older legacy docs incrementally to remove outdated provider assumptions.
- Add/expand automated tests for content safety and critical validation paths.
- Rotate exposed development secrets and validate secret hygiene.

Deferred:

- Account system and persistent personalization.
- Watchlist and history features.

---

## Appendix – Canonical Truth Sources

When this file drifts, use these as primary reference:

- `memory-bank/activeContext.md`
- `memory-bank/progress.md`
- `memory-bank/techContext.md`
- `memory-bank/systemPatterns.md`
- `backend/src/index.ts`
- `backend/src/engine/recommendationEngine.ts`
- `backend/src/clients/streaming.ts`
- `frontend/src/App.tsx`
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/pages/ResultsPage.tsx`
