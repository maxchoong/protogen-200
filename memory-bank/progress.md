# Progress – Granular Task List

## Phase 1: Skeleton MVP ✅ COMPLETE

### Phase 1 Deliverables
- ✅ Frontend: React + TypeScript + Vite + Tailwind CSS initialized
- ✅ Backend: Node.js + TypeScript + Express initialized
- ✅ Home page with free-text input and preference panel
- ✅ Results page with mock recommendation card layout
- ✅ Basic POST /recommendations endpoint returning mock data
- ✅ Frontend-backend wiring with API proxy
- ✅ Both servers running successfully

**Status:** Both applications running on localhost. Ready for Phase 2 integration.

---

## User Story 1 – Free‑Text Description Input

### Frontend Tasks
- [x] Create home page layout
  - [x] Base page structure (header, main content, footer)
  - [x] Responsive layout (single column mobile, centered content desktop)
- [x] Implement free-text input
  - [x] Add textarea/input with helpful placeholder
  - [x] Enforce character limit (200–500)
  - [x] Optional character counter
  - [x] Validation for minimum length (≥ 3 chars) unless questions-only flow
- [x] Submission UX
  - [x] Add "Get recommendations" button
  - [x] Disable button + show inline error if invalid
  - [x] On submit, call `POST /recommendations` with description + preferences
  - [x] Show loading state while waiting

### Backend Tasks
- [x] Implement `POST /recommendations` skeleton
  - [x] Validate request body (description or preferences required)
  - [x] Return 400 on invalid input
  - [x] Return dummy data initially (for frontend integration)
- [x] Logging/Telemetry
  - [x] Log anonymized/truncated queries for debugging (no PII)

---

## User Story 2 – Preference Questions

### Frontend Tasks
- [x] Add "Answer quick questions" panel on home page
  - [x] Button to expand/collapse preferences panel
- [x] Implement preference controls
  - [x] Genre multi-select chips
  - [x] Mood multi-select chips
  - [x] Type selector (Movies / TV Shows / Both)
  - [x] Rating preference control (default excludes unrated/X)
- [x] Interaction & state
  - [x] All questions optional (no required validation)
  - [x] Allow user to change answers before submit
  - [x] Persist answers in component state
- [x] Integrate with submission
  - [x] Include `preferences` object in `POST /recommendations`
  - [x] Support questions-only flow (no description)

### Backend Tasks
- [x] Define `preferences` schema
  - [x] Genres, mood, type, max rating, etc.
  - [x] Validate against allowed values
- [ ] Map preferences to catalog representation
  - [ ] Map UI genres to catalog genre IDs
  - [ ] Map mood to tags/keywords if used

---

## User Story 3 – Recommendations List & "Why this?"

### Backend Tasks
- [ ] LLM integration for input parsing
  - [ ] Choose LLM provider & SDK
  - [ ] Implement `parseUserPreferences(description, preferences)`
    - [ ] Build system + user prompt
    - [ ] Call LLM, parse JSON
    - [ ] Validate and handle errors
  - [ ] Implement rule-based fallback if LLM fails
- [ ] Catalog integration
  - [ ] Get API key, configure env vars
  - [ ] Implement catalog client: search/discover endpoints, genre/type filters, adult/unrated/X filters
  - [ ] Implement `fetchCandidateTitles(parsedPreferences, region)`
- [ ] Filtering & ranking
  - [ ] Implement filter to exclude: `adult = true` titles, unrated and X-rated content
  - [ ] Implement scoring: genre match, mood/keyword match, similarity to reference titles, popularity/ratings
  - [ ] Implement `rankTitles(candidates)` and return top 5–10
- [ ] "Why this?" generation
  - [ ] Define title context object (user prefs + title metadata)
  - [ ] Implement `generateWhyThis(titleContext)`: LLM prompt, template fallback
  - [ ] Batch LLM calls where possible
- [ ] Shape API response
  - [ ] Build `RecommendationResult` objects
  - [ ] Handle "no results" with empty list + message

### Frontend Tasks
- [ ] Results page layout
  - [ ] Results view with query summary
  - [ ] Buttons: "Edit description", "Edit filters"
- [ ] Recommendation card component
  - [ ] Poster, title, year, type
  - [ ] Synopsis text
  - [ ] "Why this?" text
  - [ ] Availability chips placeholder
  - [ ] "Watch trailer" button
- [ ] Loading & empty states
  - [ ] Skeleton cards or spinner while loading
  - [ ] Empty state message + actions if no results

---

## User Story 4 – Where to Watch

### Backend Tasks
- [ ] Evaluate availability API options
  - [ ] Check if JustWatch or similar has usable free tier
  - [ ] Decide: real integration vs fallback
- [ ] Implement availability integration (if feasible)
  - [ ] Client module to fetch availability per title/region
  - [ ] Normalize to `{platform, availability_type, deeplink_url}`
- [ ] Fallback strategy (if no real availability API)
  - [ ] Generate generic search URLs (e.g., Google search "<title> watch")
  - [ ] Mark availability as unknown when appropriate
- [ ] Integrate into recommendation pipeline
  - [ ] Fetch availability for each selected title (parallelized)
  - [ ] Attach `availability` array to `RecommendationResult`
  - [ ] Handle failures gracefully

### Frontend Tasks
- [ ] Display availability
  - [ ] Render platform chips with availability type
  - [ ] If none, show "Where to watch: info not available"
- [ ] Deeplink behavior
  - [ ] Open `deeplink_url` in new tab
  - [ ] Use `rel="noopener noreferrer"` for security

---

## User Story 5 – Brief, Spoiler‑Free Description

### Backend Tasks
- [ ] Fetch catalog synopsis
  - [ ] Extend catalog client to include overview/synopsis
  - [ ] Add to internal `Title` object
- [ ] LLM synopsis summarization
  - [ ] Implement `generateSpoilerFreeSynopsis(catalogSynopsis, titleMetadata)`
    - [ ] Prompt for 1–3 sentence premise, no twists/endings
    - [ ] Enforce character limit (300–400 chars)
  - [ ] Optional heuristic: check for spoiler phrases; re-generate if needed
- [ ] Caching
  - [ ] Cache `synopsis_short` per title ID

### Frontend Tasks
- [ ] Display synopsis
  - [ ] Show `synopsis_short` on each card
  - [ ] If missing, show "Description not available"

---

## User Story 6 – Watch the Trailer

### Backend Tasks
- [ ] Trailer retrieval
  - [ ] Extend catalog client to fetch videos/trailers
  - [ ] Choose best trailer by type, language, region
  - [ ] Add `trailer_url` to `RecommendationResult`
- [ ] Fallback
  - [ ] If no trailer, set `trailer_url` to null or omit

### Frontend Tasks
- [ ] Trailer button
  - [ ] Show "Watch trailer" only if `trailer_url` present
  - [ ] Hide or disable button otherwise (with tooltip)
- [ ] Trailer modal
  - [ ] Implement modal with embedded video (YouTube iframe)
  - [ ] Ensure responsive and full-screen on mobile
  - [ ] Add close button

---

## Cross‑Cutting Tasks

### Content Safety & Rating Filters ⚠️ CRITICAL
- [ ] Identify catalog rating fields & adult flags
- [ ] Implement filter to exclude: `adult = true` titles, unrated and X-rated content
- [ ] Add unit tests ensuring adult/unrated/X titles never appear

### LLM Guardrails & Fallbacks
- [ ] Centralize LLM calls in a dedicated module
- [ ] Implement timeouts and retries
- [ ] On failure: rule-based parsing for preferences, template "Why this?" explanation, truncated catalog synopsis

### Caching & Performance
- [ ] Implement caching layer: title metadata by ID, LLM synopsis per title
- [ ] Parallelize external calls in recommendation pipeline
- [ ] Add basic performance metrics/logging

### UI/UX Polish
- [ ] Global error banner for API errors
- [ ] Apply shadcn/ui theme for consistent styling
- [ ] Accessibility: labels for inputs, keyboard navigation for buttons and modals, contrast checks

### Infrastructure & Setup
- [ ] Initialize frontend project (React + TS + shadcn/ui)
- [ ] Initialize backend (Node + TS)
- [ ] Configure env vars for API keys (catalog, LLM, availability)
- [ ] Set up basic deployment (Vercel/Netlify + simple backend host)
- [ ] Add linting, formatting, and CI (build + tests)