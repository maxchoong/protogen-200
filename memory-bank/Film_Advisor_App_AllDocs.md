# Film & TV Advisor – Product Documents

This file includes:

1. Product Requirements Document (PRD)  
2. Design Document  
3. Granular Task List (mapped to user stories / acceptance criteria)

---

## 1. Product Requirements Document (PRD)

### 1.1 Product Overview

**Product:** Film & TV Advisor  
**Goal:** Help users quickly find what to watch based on their preferences, and easily start watching.

### 1.2 Key User Personas

- **Casual Viewer:** Wants something to watch tonight without spending time browsing.  
- **Picky Enthusiast:** Has specific tastes (genres, tone, actors) and wants tailored suggestions.  
- **Busy User:** Wants to know where to watch and see a trailer without extra searching.

### 1.3 User Stories & Acceptance Criteria

#### User Story 1 – Free‑Text Description

**As a user, I want to describe what I’m in the mood to watch in my own words so that I can get recommendations that match my current interests.**

**Acceptance Criteria**

1.1 The user can enter free-text input (e.g., “funny heist movie”, “slow-burn sci‑fi show with complex characters”).  
1.2 The input field supports at least 200 characters.  
1.3 The system accepts natural language (not just predefined tags).  
1.4 On submit, the system processes the description and generates recommendations (or moves to a clarifying-questions flow).  
1.5 If the input is empty or too short (e.g., less than 3 characters), the system shows a validation message and does not proceed (unless the user uses the question-only flow).

---

#### User Story 2 – Preference Questions

**As a user, I want the app to ask me a few simple questions about my preferences so that it can refine recommendations when my initial description isn’t enough or I’m not sure what to type.**

**Acceptance Criteria**

2.1 After the user submits an initial description (or chooses “I’m not sure, ask me questions”), the system can present 3–7 multiple-choice or quick-tap questions (e.g., genre, mood, length, language, content rating).  
2.2 Questions are optional; the user can skip all questions and still receive recommendations.  
2.3 The system uses the user’s answers to adjust/filter recommendations (e.g., excluding genres the user dislikes).  
2.4 The user can change an answer before final submission without restarting the entire flow.  
2.5 If the user provides no description but answers questions, the system still generates recommendations.

---

#### User Story 3 – Recommendations List & Explanations

**As a user, I want to see a concise list of recommended movies or shows, with a clear explanation of why each was recommended, so I can quickly decide what to watch.**

**Acceptance Criteria**

3.1 The system returns a list of 5–10 recommendations per query.  
3.2 Each recommendation card includes:
- Title  
- Type (movie or series)  
- Year of release  
- Poster/thumbnail (if available)  
- A “Why this?” explanation (e.g., “Similar tone to ‘Inception’ and matches your preference for mind-bending sci‑fi”).

3.3 “Why this?” references at least one of:
- User’s description  
- Answers to preference questions  
- Known attributes (genre, mood, cast, director, etc.).

3.4 If no recommendations are found, the system:
- Shows a friendly “no results” state  
- Suggests broadening preferences or trying a different description.

3.5 Recommendations are sorted by relevance (most likely to match user preferences first).

---

#### User Story 4 – Where to Watch

**As a user, I want to see where each recommended title is available to watch so that I can quickly start watching on my preferred services.**

**Acceptance Criteria**

4.1 Each recommendation card shows available platforms (e.g., Netflix, Hulu, Amazon Prime, Disney+, local services) where the title can be streamed, rented, or purchased, if this data is available.  
4.2 For each platform, the system indicates the availability type (e.g., “Included with subscription”, “Rent”, “Buy”, “Free with ads”) when data is available.  
4.3 Clicking/tapping a platform link opens the corresponding service (in app or browser) to the title’s page, where possible.  
4.4 If availability data is not available for a title, the UI clearly indicates “Availability info not available” or equivalent, rather than leaving it blank.  
4.5 The system can localize availability based on user’s region (if location or region is known).

---

#### User Story 5 – Brief, Spoiler‑Free Description

**As a user, I want a short, spoiler‑free description of each recommended title so that I can understand what it’s about without having the plot spoiled.**

**Acceptance Criteria**

5.1 Each recommendation includes a brief synopsis (e.g., 1–3 sentences, up to ~300 characters).  
5.2 The synopsis avoids major plot twists, endings, and late-season reveals.  
5.3 The system uses a vetted source or spoiler-filtering logic to minimize spoilers.  
5.4 If a synopsis is unavailable, the system displays a fallback message (e.g., “Description not available”) rather than leaving the field empty.  
5.5 The description clearly indicates whether the title is a movie or a series (if not already obvious from other metadata).

---

#### User Story 6 – Watch the Trailer

**As a user, I want to watch a trailer for a recommended title directly from the app so that I can quickly gauge whether I’m interested.**

**Acceptance Criteria**

6.1 If a trailer is available, each recommendation card shows a “Watch Trailer” button or icon.  
6.2 Tapping “Watch Trailer” either:
- Plays the trailer inline in the app, or  
- Opens a video player or external service (e.g., YouTube) with the official trailer.

6.3 If no trailer is available, no trailer button is shown, or a disabled state with “Trailer not available” is displayed.  
6.4 Trailer playback includes basic controls: play/pause, mute/unmute, and close/exit.  
6.5 Trailers are region-appropriate when possible (e.g., no geo-blocked links when an alternative is available).

---

#### Content Safety Requirement

- The system must **not** recommend unrated or X‑rated content.  
- Adult/explicit content must be filtered out based on catalog flags and ratings.

---

### 1.4 Additional Future Stories (Out of Scope for v1)

- Save/bookmark titles to a watchlist.  
- Regenerate or refine recommendations with more advanced controls.  
- View search history and revisit past recommendation sessions.  

---

## 2. Design Document

### 2.1 Overview

**Product:** Film & TV Advisor  
**Platform:** Responsive web app (desktop + mobile web)  
**Goal:** Help users quickly find what to watch via natural language input and lightweight preferences, with clear, spoiler‑free explanations and easy paths to start watching.

**Constraints / Choices (v1)**

- Platform: Responsive web app.  
- Accounts: None (no login, no persistent profiles).  
- Catalog: External provider (e.g., TMDB).  
- Availability: External provider if free/easy; otherwise fallback.  
- LLM: Use a free-tier LLM with guardrails (for parsing, explanations, synopses).  
- Data storage: Prefer on-demand external calls + simple caching.  
- UI: Simple MVP UI using shadcn/ui (preferred) or MUI.  
- Content safety: Do not recommend unrated or X‑rated content; filter out adult content.

---

### 2.2 System Architecture

#### Components

1. **Client (Web App)**
   - React + TypeScript SPA.
   - Responsive layout (mobile-first).
   - Uses shadcn/ui + Tailwind (or MUI) for components.
   - Calls backend `POST /recommendations`.

2. **Backend API**
   - Node/TypeScript (e.g., Express, Fastify, or Next.js API routes).
   - Endpoints:
     - `POST /recommendations`: main endpoint for recommendations.
     - Optional: `GET /title/:id` for future detail views.
   - Orchestrates:
     - LLM calls.
     - External catalog API.
     - Availability API (if used).
   - Applies rating and adult-content filters.

3. **Recommendation Engine (Backend Module)**
   - Parses user description and preferences.
   - Builds queries to external catalog.
   - Filters and ranks candidate titles.
   - Generates “Why this?” and spoiler-free synopses (via LLM).

4. **External Integrations**
   - **Catalog:** TMDB or similar (metadata, posters, trailers, ratings).  
   - **Availability:** JustWatch or similar, if free tier allows; otherwise fallback (generic search links or omit).  
   - **LLM:** Free-tier LLM (OpenAI or open-source inference) for:
     - Parsing user input into structured preferences.
     - Generating “Why this?” explanations.
     - Summarizing synopses with spoiler constraints.

5. **Storage & Caching**
   - No user database (no accounts).  
   - Simple caching layer (in-memory or Redis) for:
     - Title metadata by ID.
     - LLM-generated synopsis per title.
     - Possibly cached recommendation results for common queries.

---

### 2.3 Data & Integrations

#### Conceptual Data Model

**Title**
- `id`  
- `name`  
- `type` (movie | series)  
- `year`  
- `genres` (list)  
- `tags` (mood/themes if available)  
- `runtime` or `episode_count`  
- `rating` (e.g., PG‑13, TV‑MA)  
- `is_adult` or `adult` flag  
- `poster_url`  
- `catalog_synopsis`  
- `popularity_score` / `vote_average`  
- `trailer_url` or `trailer_video_id`

**Availability**
- `title_id`  
- `region` (e.g., US, UK)  
- `platforms`: list of `{ name, availability_type, deeplink_url }`

**RecommendationResult** (API response object)
- `id`  
- `name`  
- `year`  
- `type`  
- `poster_url`  
- `synopsis_short`  
- `why_this`  
- `availability` (list of platforms)  
- `trailer_url`

#### External API Strategy

- Use catalog provider’s search/discover APIs, plus video endpoint for trailers.  
- If availability provider is available on free tier:
  - Use per-title availability lookup.
- If not:
  - Omit detailed availability or use generic search links.  

On-demand calls with caching (no full DB sync for v1).

---

### 2.4 UX / Interaction Design

#### Home / Landing Page

**Elements:**
- Header with product name and tagline: “Tell us what you’re in the mood for.”  
- Free-text input (textarea or large input).  
- Button: “Answer quick questions” to expand preference panel.  
- Primary CTA: “Get recommendations”.

**Behavior:**
- If description is too short and no preferences selected:
  - Show validation message; do not call backend.
- If user chooses questions only (no description):
  - Allow submission as long as at least some preferences are set.

#### Preference Questions Panel

**Controls:**
- Genres: multi-select chips (Comedy, Drama, Thriller, Sci‑Fi, Romance, Action, etc.).  
- Mood: multi-select chips (Light, Dark, Emotional, Suspenseful, Funny, Thought‑provoking).  
- Type: radio or segmented control (Movies, TV shows, Both).  
- Rating: default constraint to exclude unrated/X; optionally allow user to restrict further (e.g., up to PG‑13).

All optional; answers persisted in local state.

#### Results Page

**Layout:**
- Query summary at top:  
  “Top picks for: [user description or summarized preferences].”
- Buttons to edit description and filters.
- List/grid of recommendation cards.

**Recommendation Card:**
- Poster image.  
- Title, year, type.  
- Short synopsis (1–3 sentences).  
- “Why this?” explanation.  
- Availability chips (if available) or “Where to watch: info not available”.  
- “Watch trailer” button (if trailer exists).

**States:**
- Loading: skeleton cards or spinner.  
- Empty: friendly message + buttons to refine input.

#### Trailer Playback

- “Watch trailer” opens a modal with embedded player (YouTube iframe).  
- Modal is full-screen or near full-screen on mobile.  
- Close button + rely on player’s controls for play/pause/mute.

---

### 2.5 Recommendation & NLP Design

#### Parsing User Input (LLM)

**Input:**
- User description string.  
- User preferences object (genres, mood, type, rating).

**LLM Prompt:**
- System: ask for structured JSON with:
  - `preferred_genres`, `excluded_genres`  
  - `mood`  
  - `type`  
  - `content_rating_max`  
  - `reference_titles`  
  - `other_constraints`  

**Output Example:**
```json
{
  "preferred_genres": ["Comedy", "Romance"],
  "excluded_genres": ["Horror"],
  "mood": ["Light", "Feel-good"],
  "type": "either",
  "content_rating_max": "R",
  "reference_titles": ["Parks and Recreation"],
  "other_constraints": ["short episodes preferred"]
}
```

Backend validates and falls back to rule-based parsing if LLM fails.

#### Catalog Query & Filtering

1. Build query from structured preferences:
   - Map genres to catalog genre IDs.
   - Filter by type (movie/series).
   - Filter by rating:
     - Exclude unrated and X.
     - Use `adult` flag to exclude adult content.
2. Fetch candidates using catalog’s discover/search APIs.
3. Filter:
   - Drop adult/unrated/X titles.
4. Rank:
   - Score by:
     - Genre match.
     - Mood/keyword match.
     - Similarity to reference titles (if any).
     - Popularity/ratings.
   - Select top 5–10.

#### “Why this?” Explanation (LLM)

**Input:**
- User preference summary.  
- Title attributes (genres, type, year, similarity reason).

**Prompt:**
- Generate 1–2 sentences explaining why this title matches the user’s preferences.
- No spoilers; reference at least one user preference.

Fallback: template-based explanation using metadata if LLM unavailable.

#### Spoiler-Free Synopsis (LLM)

**Steps:**
1. Retrieve catalog synopsis.  
2. If short and clearly non-spoilery, use as-is.  
3. Else:
   - Ask LLM to summarize in 1–3 sentences, premise only, no twists/endings.  
   - Enforce character limit (300–400 chars).  
4. Optionally scan for obvious spoiler phrases and re-generate if needed.

Cache `synopsis_short` per title to reduce cost/latency.

---

### 2.6 Backend API Design

#### `POST /recommendations`

**Request:**
```json
{
  "description": "a cozy feel-good comedy like Parks and Rec",
  "preferences": {
    "genres": ["Comedy"],
    "mood": ["Light"],
    "type": "either",
    "content_rating_max": "R"
  },
  "region": "US"
}
```

**Response:**
```json
{
  "query_summary": "Light, feel-good comedy similar to Parks and Recreation, up to R rating, region: US.",
  "results": [
    {
      "id": "12345",
      "name": "Brooklyn Nine-Nine",
      "year": 2013,
      "type": "series",
      "poster_url": "https://...",
      "synopsis_short": "A lighthearted comedy about a group of detectives in a Brooklyn police precinct.",
      "why_this": "You asked for a light, feel-good comedy, and this series has a similar ensemble humor and heart to Parks and Recreation.",
      "availability": [
        {
          "platform": "Netflix",
          "availability_type": "subscription",
          "deeplink_url": "https://..."
        }
      ],
      "trailer_url": "https://youtube.com/..."
    }
  ]
}
```

**Errors:**
- 400 for invalid input (no description and no preferences).  
- 500 for upstream failures (catalog/LLM); return friendly message and log details.

---

### 2.7 Performance, Security, and Compliance

#### Performance

- Target recommendation response: < 2–3 seconds typical.  
- Use caching for:
  - Title metadata.  
  - LLM outputs (synopsis, “why this”).  
- Parallelize:
  - Catalog calls.  
  - Availability calls.  
  - LLM calls (within rate limits).

#### Security & Privacy

- No accounts; no persistent PII.  
- Do not log full user descriptions long-term; truncate or anonymize.  
- Keep API keys server-side only.  
- Enforce content filters (no unrated/X/adult content).

---

### 2.8 Implementation Plan (High-Level)

1. Skeleton MVP:
   - Basic frontend pages with mock data.
   - Backend stub for `/recommendations`.  
2. Catalog integration:
   - Real data from TMDB (or similar).  
   - Rating/adult filters.  
3. LLM integration:
   - Parsing input.  
   - “Why this?” and synopsis generation.  
4. Availability + polish:
   - Integrate availability API or fallback strategy.  
   - UI polish, error handling, performance tuning.

---

## 3. Granular Task List (Mapped to User Stories)

### User Story 1 – Free‑Text Description Input

> As a user, I want to describe what I’m in the mood to watch…

#### Frontend Tasks

- [ ] Create home page layout  
  - [ ] Base page structure (header, main content, footer).  
  - [ ] Responsive layout (single column mobile, centered content desktop).

- [ ] Implement free-text input  
  - [ ] Add textarea/input with helpful placeholder.  
  - [ ] Enforce character limit (e.g., 200–500).  
  - [ ] (Optional) Character counter.  
  - [ ] Validation for minimum length (e.g., ≥ 3 chars) unless using questions-only flow.

- [ ] Submission UX  
  - [ ] Add “Get recommendations” button.  
  - [ ] Disable button + show inline error if invalid (too short, no preferences).  
  - [ ] On submit, call `POST /recommendations` with description + preferences.  
  - [ ] Show loading state while waiting.

#### Backend Tasks

- [ ] Implement `POST /recommendations` skeleton  
  - [ ] Validate request body (description or preferences required).  
  - [ ] Return 400 on invalid input.  
  - [ ] Return dummy data initially (for frontend integration).

- [ ] Logging/Telemetry  
  - [ ] Log anonymized/truncated queries for debugging (no PII).

---

### User Story 2 – Preference Questions

> As a user, I want the app to ask me a few simple questions…

#### Frontend Tasks

- [ ] Add “Answer quick questions” panel on home page  
  - [ ] Button to expand/collapse preferences panel.  

- [ ] Implement preference controls  
  - [ ] Genre multi-select chips.  
  - [ ] Mood multi-select chips.  
  - [ ] Type selector (Movies / TV Shows / Both).  
  - [ ] Rating preference control (default excludes unrated/X).

- [ ] Interaction & state  
  - [ ] All questions optional (no required validation).  
  - [ ] Allow user to change answers before submit.  
  - [ ] Persist answers in component state.

- [ ] Integrate with submission  
  - [ ] Include `preferences` object in `POST /recommendations`.  
  - [ ] Support questions-only flow (no description).

#### Backend Tasks

- [ ] Define `preferences` schema  
  - [ ] Genres, mood, type, max rating, etc.  
  - [ ] Validate against allowed values.

- [ ] Map preferences to catalog representation  
  - [ ] Map UI genres to catalog genre IDs.  
  - [ ] Map mood to tags/keywords if used.

---

### User Story 3 – Recommendations List & “Why this?”

> As a user, I want to see a concise list of recommended movies or shows, with a clear explanation of why each was recommended…

#### Backend Tasks

- [ ] LLM integration for input parsing  
  - [ ] Choose LLM provider & SDK.  
  - [ ] Implement `parseUserPreferences(description, preferences)`:
    - [ ] Build system + user prompt.  
    - [ ] Call LLM, parse JSON.  
    - [ ] Validate and handle errors.  
  - [ ] Implement rule-based fallback if LLM fails.

- [ ] Catalog integration  
  - [ ] Get API key, configure env vars.  
  - [ ] Implement catalog client:
    - [ ] Search/discover endpoints.  
    - [ ] Genre/type filters.  
    - [ ] Adult/unrated/X filters.

  - [ ] Implement `fetchCandidateTitles(parsedPreferences, region)`.

- [ ] Filtering & ranking  
  - [ ] Implement filter to exclude:
    - [ ] `adult = true` titles.  
    - [ ] Unrated and X-rated content.
  - [ ] Implement scoring:
    - [ ] Genre match.  
    - [ ] Mood/keyword match.  
    - [ ] Similarity to reference titles.  
    - [ ] Popularity/ratings.  
  - [ ] Implement `rankTitles(candidates)` and return top 5–10.

- [ ] “Why this?” generation  
  - [ ] Define title context object (user prefs + title metadata).  
  - [ ] Implement `generateWhyThis(titleContext)`:
    - [ ] LLM prompt (no spoilers, reference prefs).  
    - [ ] Template fallback if LLM fails.  
  - [ ] Batch LLM calls where possible.

- [ ] Shape API response  
  - [ ] Build `RecommendationResult` objects.  
  - [ ] Handle “no results” with empty list + message.

#### Frontend Tasks

- [ ] Results page layout  
  - [ ] Results view with query summary.  
  - [ ] Buttons: “Edit description”, “Edit filters”.

- [ ] Recommendation card component  
  - [ ] Poster, title, year, type.  
  - [ ] Placeholder for synopsis.  
  - [ ] “Why this?” text.  
  - [ ] Availability chips placeholder.  
  - [ ] “Watch trailer” button.

- [ ] Loading & empty states  
  - [ ] Skeleton cards or spinner while loading.  
  - [ ] Empty state message + actions if no results.

---

### User Story 4 – Where to Watch

> As a user, I want to see where each recommended title is available to watch…

#### Backend Tasks

- [ ] Evaluate availability API options  
  - [ ] Check if JustWatch or similar has usable free tier.  
  - [ ] Decide: real integration vs fallback.

- [ ] Implement availability integration (if feasible)  
  - [ ] Client module to fetch availability per title/region.  
  - [ ] Normalize to `{platform, availability_type, deeplink_url}`.

- [ ] Fallback strategy (if no real availability API)  
  - [ ] Generate generic search URLs (e.g., Google search “<title> watch”).  
  - [ ] Mark availability as unknown when appropriate.

- [ ] Integrate into recommendation pipeline  
  - [ ] Fetch availability for each selected title (parallelized).  
  - [ ] Attach `availability` array to `RecommendationResult`.  
  - [ ] Handle failures gracefully.

#### Frontend Tasks

- [ ] Display availability  
  - [ ] Render platform chips with availability type.  
  - [ ] If none, show “Where to watch: info not available”.

- [ ] Deeplink behavior  
  - [ ] Open `deeplink_url` in new tab.  
  - [ ] Use `rel="noopener noreferrer"` for security.

---

### User Story 5 – Brief, Spoiler‑Free Description

> As a user, I want a short, spoiler‑free description…

#### Backend Tasks

- [ ] Fetch catalog synopsis  
  - [ ] Extend catalog client to include overview/synopsis.  
  - [ ] Add to internal `Title` object.

- [ ] LLM synopsis summarization  
  - [ ] Implement `generateSpoilerFreeSynopsis(catalogSynopsis, titleMetadata)`:
    - [ ] Prompt for 1–3 sentence premise, no twists/endings.  
    - [ ] Enforce character limit (300–400 chars).
  - [ ] Optional heuristic:
    - [ ] Check for spoiler phrases; re-generate if needed.

- [ ] Caching  
  - [ ] Cache `synopsis_short` per title ID.

#### Frontend Tasks

- [ ] Display synopsis  
  - [ ] Show `synopsis_short` on each card.  
  - [ ] If missing, show “Description not available.”

---

### User Story 6 – Watch the Trailer

> As a user, I want to watch a trailer…

#### Backend Tasks

- [ ] Trailer retrieval  
  - [ ] Extend catalog client to fetch videos/trailers.  
  - [ ] Choose best trailer by type, language, region.  
  - [ ] Add `trailer_url` to `RecommendationResult`.

- [ ] Fallback  
  - [ ] If no trailer, set `trailer_url` to null or omit.

#### Frontend Tasks

- [ ] Trailer button  
  - [ ] Show “Watch trailer” only if `trailer_url` present.  
  - [ ] Hide or disable button otherwise (with tooltip).

- [ ] Trailer modal  
  - [ ] Implement modal with embedded video (YouTube iframe).  
  - [ ] Ensure responsive and full-screen on mobile.  
  - [ ] Add close button.

---

### Cross‑Cutting Tasks

#### Content Safety & Rating Filters

- [ ] Identify catalog rating fields & adult flags.  
- [ ] Implement filter to exclude:
  - [ ] `adult = true` titles.  
  - [ ] Unrated and X-rated content.  
- [ ] Add unit tests ensuring adult/unrated/X titles never appear.

#### LLM Guardrails & Fallbacks

- [ ] Centralize LLM calls in a dedicated module.  
- [ ] Implement timeouts and retries.  
- [ ] On failure:
  - [ ] Rule-based parsing for preferences.  
  - [ ] Template “Why this?” explanation.  
  - [ ] Truncated catalog synopsis.

#### Caching & Performance

- [ ] Implement caching layer:
  - [ ] Title metadata by ID.  
  - [ ] LLM synopsis per title.  
- [ ] Parallelize external calls in recommendation pipeline.  
- [ ] Add basic performance metrics/logging.

#### UI/UX Polish

- [ ] Global error banner for API errors.  
- [ ] Apply shadcn/MUI theme for consistent styling.  
- [ ] Accessibility:
  - [ ] Labels for inputs.  
  - [ ] Keyboard navigation for buttons and modals.  
  - [ ] Contrast checks.

#### Infrastructure & Setup

- [ ] Initialize frontend project (React + TS + shadcn/MUI).  
- [ ] Initialize backend (Node + TS).  
- [ ] Configure env vars for API keys (catalog, LLM, availability).  
- [ ] Set up basic deployment (e.g., Vercel/Netlify + simple backend host).  
- [ ] Add linting, formatting, and CI (build + tests).
