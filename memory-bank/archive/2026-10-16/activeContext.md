# Active Context – Current Work & Decisions

## Project Status

**Date:** October 16, 2026
**Phase:** Conversational engine v2: phases 1–2 implemented; evaluation resumed, with initial results-first policy work from phase 3. Quality/latency gates remain open.
**Overall Progress:** Plain language queries (cultural/prestige awards, seasonal blockbusters), TMDB date-range discovery, catalog search seed hydration, Results-First gating, and conversational LLM disambiguation are implemented. Media-aware series genre coverage shipped (see below). Backend build and lint pass; backend Jest passes 375/375 tests. Frontend build and lint previously passed; no frontend changes in this evaluation follow-up.

---

## Conversational Engine v2 (October 15, 2026)

- **Evaluation resumed October 16:**
  - Gemini responded to a structured-request probe in 3.1 s. Ran all 52 cases sequentially on an isolated backend with captured logs; the user's backend was left running untouched.
  - `2026-10-16T09-32-52-596Z-phase2b.json`: 65% case pass, hard constraints 96%, genre 84%, tone 77%, clarification 62%, follow-ups 77%, p50 12.8 s / p90 26.8 s. No 429s, but two understanding timeouts.
  - Specific requests were still over-clarified. Selecting an option sometimes dropped the prior country or genre (Indonesian horror became unrestricted thrillers).
  - Changes: a validated spec with a concrete genre, tone, theme, reference, person or date direction now tries results before first-turn clarification. Origin/format-only and vague requests still clarify; empty retrieval still offers widening. The understanding prompt explicitly preserves unrelated fields and genres on short refinements.
  - `2026-10-16T10-07-37-543Z-phase2c.json`: **79% case pass**, hard constraints 93%, genre 97%, tone 85%, clarification 90%, first-turn clarification 13%, follow-ups 69%, no empty result lists, p50 24.9 s / p90 41.3 s. Baseline: 69% case pass, clarification 62%, first-turn clarification 40%, follow-ups 85%, p50 4.8 s.
  - **Provider caveat:** the second full run had 22 understanding failures across 73 turns. Logs recorded 20 LLM timeout errors and 8 HTTP 503 errors across stages, with no 429s. These are operational results, not a clean LLM-only quality comparison.
  - A further confirmed bug: narrowed date requests reused the previous ten candidates without broad retrieval. Structured-request field changes now trigger fresh retrieval; unchanged scope and tone-only changes retain reuse.
  - Targeted `2026-10-16T10-12-17-864Z-phase2d-followups.json`: the 90s sci-fi follow-up passes live (Terminator 2, Jurassic Park). French-more-recent remains unverified with the new retrieval fix: understanding returned 503, another LLM stage returned 429, then the cooldown used rules. Stopped further provider calls and the temporary backend.
  - Final validation: 375 backend tests pass; lint/build pass. A worktree diff check also reported existing trailing whitespace in the engine's genre-filter section, outside this follow-up's changes; left untouched. No full-suite live score is claimed after the final retrieval fix.
  - Remaining priorities: catalogue-backed option viability (Malaysian festival dramas still yields 2); Portuguese retrieval; tone/ranking conflicts; preserving structured constraints and fresh retrieval during rule fallback; provider resilience and the 5 s latency budget. The automatic eval's first-option fallback can explicitly widen origins, so inspect transcripts rather than assuming every failed final-country check is a spontaneous loss of state.
- **Documentation reconciliation October 16:**
  - Architecture/setup docs now describe the flat full-spec implementation, not the abandoned delta design. Planned catalogue/ranking/reply stages are explicitly labelled.
  - Cooldown starts after SDK retries complete; it is not a first-attempt fail-fast mechanism or a total-turn latency budget. The response spec can remain stale during rule fallback.
  - Empty API intro text does not mean an empty visible chat bubble: the frontend supplies generic fallback text. Consistent backend reply facts remain a phase 5 goal.
  - Provider health has not been rechecked since the final 503/429. No live calls, application changes or fresh build/test runs were made for this documentation-only refresh.
  - Current changes include uncommitted recommendation work and unrelated frontend edits. Only baseline eval reports are eligible for version control; newer run files are local/ignored. Do not assume deployment or commit status from a local pass.
- **Direction (agreed with the user):**
  - LLM-first understanding: the LLM produces a structured request, including follow-up changes; rules only check and clean it up, and act as the fallback.
  - Transparency is in the prose reply only.
  - Ask a clarifying question only when it would meaningfully change the results, with options built from the matching catalogue.
  - About a 5 s latency budget, streaming the reply first.
  - Changes are measured against the evaluation harness.
- **Docs:** `prd-conversational-engine.md`, `design-conversational-engine.md`, `tasks-conversational-engine.md`.
- **Harness:** `backend/eval/` (`cases.json` with 52 cases; `run.ts`; run with `npm run eval -- [--only ids] [--label name] [--concurrency n]`; reports in `eval/reports/`, with only `baseline-*` reports tracked).
- **Data fixes:** the API now returns `originCountries`. TMDB title details keep `origin_country` (falling back to `production_countries`); previously they were dropped, so details-hydrated titles failed country filters.
- **Baseline (2026-10-15, concurrency 2), 69% of cases pass:**
  - hard constraints 91%;
  - genre fit 89%;
  - tone 92%;
  - clarify appropriateness 62% (40% of first turns ask a question);
  - no empty results;
  - follow-ups 85%;
  - latency p50 4.8 s, p90 11.2 s (single turns reach 25–53 s).
- **Historical baseline gaps (October 15, not the current open-work list):**
  1. Over-clarifying requests that are already specific (Japanese anime, Spanish crime, Bollywood, Nordic noir, Indonesian horror, Thai comedies, German WW2, animated kids, Nolan, Keanu).
  2. "Nordic noir" isn't mapped to Nordic countries.
  3. A pivot typed in reply to a question ("Actually, make it Korean instead") drops "horror".
  4. Format is lost after clarification (Spanish crime shows, cosy show return 40% TV).
  5. Spanish + Portuguese never returns Portuguese titles.
  6. Bollywood musicals become action blockbusters.
  7. Funny horror has only 40% horror-comedies.
  8. Christopher Nolan: only 57% of results are directed by him.
- **Phase 2 (structured request) implemented:**
  - Each turn: the LLM returns a full `RequestSpec` and an operation, validated by `requestSpec.ts` and overlaid on the rule parser; the spec is round-tripped through the client.
  - Live wins: "Nordic noir series" gives 10/10 Nordic crime TV. "Malaysian movies" → "What about Indonesian films too?" widens to MY+ID with the note "Added Indonesian…".
  - The first eval run (`eval/reports/*-phase2.json`: 60% pass, hard constraints 95%, genre 95%, tone 69%, follow-ups 62%, p50 9.4 s) is **unreliable**: the Gemini provider (`gemini-3.5-flash-lite`) returned 429 for most calls, so turns fell back to rules after slow retries.
  - Fixes since then:
    - a 60 s rate-limit cooldown (uncached calls fail fast after the triggering call's SDK retries);
    - "Indie" is no longer a hard genre filter;
    - spec popularity requires supporting wording (stops "something good" skipping clarification).
  - Still open:
    - origin balance in widened lists (9 ID : 1 MY);
    - Portuguese retrieval;
    - critics-path option viability (Phase 3);
    - absent API intro text (~55% of result turns in the initial comparison, same as baseline); the frontend supplies generic text. Consistent backend reply facts remain phase 5 work.
- **Known harness limit:** genre checks are loose. "Films like Parasite" passes even though The Imitation Game and Reptile are weak matches. An LLM judge for relevance could be added later.

---

## Country of Origin (October 13, 2026)

- Root cause: "Malaysian movies" lost its constraint because the parser only knew 19 hard-coded language adjectives, and nationality was conflated with language.
- `backend/src/engine/regionTaxonomy.ts` resolves `{originalLanguage, originCountry}` separately: ~75 languages (ISO 639-1), ~85 demonyms (ISO 3166-1), and every country name via `Intl.DisplayNames` (only after "from/made in/produced in/out of"). Ambiguous adjectives (Korean, Spanish, French, Chinese, Thai...) stay language-first; "movies like American Beauty" and "Latin American" add nothing.
- The parser emits `country:XX` constraints and `ParsedPreferences.originCountry/originCountryName`, which carry through clarification follow-ups.
- TMDB discovery sends `with_origin_country`; country requests add a `vote_count.desc` page so established titles beat brand-new zero-vote releases. Movie results are tagged with the requested country.
- Vote-confidence ranking (`rankingScorer.ts`): a known count of 0 votes scores popularity 0 (unknown stays 0.5). Ratings use a Bayesian average (prior 6.0, 25 votes). Small-catalogue pools (median under ~1,000 votes) blend in pool-percentile popularity. The recency boost scales with votes up to 20, except for release-window or recent-year requests. The hidden-gem signal is weighted by vote evidence. `convertTmdbResult` keeps a missing `vote_count` undefined.
- Release windows: "this month", "this week" and plural "new … movies/films/shows/series" now set a release window ("a new movie" deliberately does not).
- Tone: heartwarming, heartfelt, wholesome, lighthearted and touching map to the Happy mood. `RankingScorer.toneGenreConflictMultiplier` damps Horror (0.55), War/Thriller (0.8), Crime (0.85) and Action (0.9) for light-mood requests, unless the genre was requested or a darker mood is present.
- Selection: diversity in `selectFinalResults` ignores the user's explicit genres, so repeating a requested genre is no longer penalised in favour of off-request picks. Country/language-filtered retrieval reserves 20 of the 60 candidate slots for the most-voted titles.
- The New chat button works: it's a two-step "New chat → Confirm reset". Integrated-browser automation clicks miss because of a ~0.6× pointer-coordinate scaling, not an app bug.
- The engine's country filter is strict (titles without country evidence are excluded), unlike the lenient language filter. Empty results offer "Show me ... from any country instead".
- Multi-turn origins (October 15): `resolveConversationOrigins` merges origins turn by turn. Additive cues ("What about Indonesian films too?", "as well", "also add Thailand") widen to MY|ID; a bare "What about Indonesian films?" switches; a new kind narrows ("Tamil films" + "from Malaysia"). Mixed-kind additions are normalised ("Malaysian" + "Korean ones too" -> MY|KR). Codes are "|"-joined in `originCountry`/`originalLanguage`; TMDB fans out one query per origin (max 4) and interleaves, so large catalogues do not crowd out small ones. An origin widen sets turn operation `widen` (no pool-reuse shortcut); a switch sets `replace`.
- Results intro: the LLM now sees the latest message plus a deterministic change note ("Added Indonesian alongside Malaysian."). The prompt no longer says "verified filters", bans stock filler, and `stripStockPhrases` drops clichéd sentences ("grab some popcorn").
- Known gaps: tone conflicts (horror comedies for "heartwarming"); when a selected option conflicts with a first-turn genre ("Nigerian dramas" -> rom-coms), the first-turn genre still dominates; TMDB origin data quirks.

## Series Genre Coverage (October 13, 2026)

- **Problem:** Selecting a clarification option such as "Gritty crime thrillers and mysteries" after "Spanish series" returned no results. A live matrix (5 languages × 10 genres) showed series requests for thriller/horror/fantasy/crime/mystery returned 0–1 titles in every language; films were unaffected.
- **Causes:** the parser collapsed crime/mystery/detective into Thriller; TMDB TV has no Thriller/Horror/History/Music genre, so TV discovery was skipped; the hard core-genre filter then removed every series.
- **Fix:**
  - New `engine/genreTaxonomy.ts`: series equivalents (Thriller ⇐ Crime/Mystery), TV keyword fallbacks (Thriller, Horror, History, Romance, Music), `matchableGenres`/`titleMatchesAnyGenre`.
  - `tmdb.ts`: full TV genre map (Crime, Mystery, Sci-Fi/Fantasy 10765, War 10768, Western 37…), `tvGenreIdsFor`, combined TV IDs map back to all names.
  - Engine: TV keyword discovery for unsupported genres; hard genre filter is media-aware, runs after language/year filters, and relaxes instead of returning nothing.
  - Parser: Crime/Mystery/Thriller separate; added Adventure, History, War, Western; English as a language; removed over-broad triggers (dark→Thriller, intense→Drama, true story→Documentary).
  - Relaxation is recorded per request (`RequestRankingDiagnostics` via `AsyncLocalStorage`) and surfaced as an honest `interpretationNote` (e.g. "I couldn't find Korean series tagged as western…"). Engine-level `getLastRetrievalDiagnostics()` is shared state and unsafe under concurrency.
- **Verification:** `genreCoverage.test.ts` (parser, mapping, filter, concurrency, 35-case mocked language × genre series matrix) and a route test. Live matrix: every language × genre series cell returns results.
- **Follow-ups (done):**
  - Qualified dramas ("historical/period/costume", crime, war, romantic, sci-fi, fantasy, family drama) require qualifier + Drama (genre or TMDB keyword evidence); if none match, fall back to Drama and record the relaxation for the note.
  - `recommendationEngine.estimateAvailableTitles(prefs)` cheaply probes TMDB discovery (language + core-genre consistent count; `undefined` when unknown).
  - `index.ts`: clarification options (LLM or deterministic) are probed with the rule-based parser on `[...userTurns, option]`; options probing to 0 are dropped (2.5s timeout ⇒ treated as viable). If no direction survives, clarification is skipped and results are returned.
  - Empty result sets now return `requiresClarification` ("I couldn't find any Korean western series in the catalog.") with validated "…instead" widening options (any language / any genre / films and series / any year), or a text question if none are viable.
  - Frontend fallback empty-state copy is specific and actionable (rarely reached now).
- **Limits:** probes use rule-based parsing (live flow may use LLM parsing); each probe costs several TMDB calls. Keyword-based genre evidence (`genreKeywordMatches`) is not exposed in API `genres`.

## Earlier Implementation Snapshot (before the October 16 evaluation)

This section records previously shipped surfaces; it is not a new verification
of the current dirty frontend worktree or an assertion that v2 goals are met.

- **Frontend & Backend:** Both build and lint cleanly with zero errors.
- **Frontend:** Conversational flow is primary with dynamic advisor clarification rendering.
- **Backend:** Intent-aware ranking + conversational disambiguation + transparency safeguards in `POST /recommendations`.
- **Plain language handling:** 
  - Expanded lexicon in `preferenceParser.ts` for award queries (`oscar`, `academy award`, `bafta`, `palme d'or`).
  - Added relative seasonal date-window resolution (`this summer`, `last summer`) producing concrete release bounds (e.g. `2026-05-01` to `2026-08-31`).
  - Broad category and temporal terms (`oscar`, `winning`, `summer`, `blockbuster`, `hits`) are removed from literal TMDB search term queries to prevent matching accidental literal titles.
  - LLM system prompt in `llm.ts` now suggests canonical award-winning catalog seeds in `referenceSuggestions` for prestige queries, which `recommendationEngine.ts` validates and ingests into candidate pools.
  - TMDB discover methods in `tmdb.ts` support `releaseDateGte` and `releaseDateLte` for accurate seasonal discover paging.
  - Queries with clear cultural/thematic intent (e.g. Oscar winners, blockbusters) now receive sufficient intent confidence (0.82) to trigger Results-First delivery directly, bypassing unnecessary disambiguation delays.
- **Conversational disambiguation:**
  - Implemented `llmClient.generateConversationalClarification()`, transforming rigid developer menus into engaging, film-advisor dialogue with context-tailored options.
  - Updated deterministic fallback templates in `preferenceParser.ts` and `index.ts` to replace internal system jargon ("Go mood-first", "Go title-similarity first") with natural user-centric choices ("Focus on the mood or vibe", "Match the tone of a specific movie", "Focus on a favorite actor or director").

---

## Recently Shipped Changes

### Plain Language Discovery & Conversational Disambiguation (October 13, 2026)
- Plain language queries without explicit schema fields (awards/prestige, seasonal releases) now resolve through catalog-validated seeds and TMDB temporal release-window filtering.
- Conversational clarification replaces mechanical developer options with natural advisor questions and options.
- All 201 Jest tests pass. Frontend and backend build and lint cleanly.

### Retrieval and Enrichment
- Added TMDB enrichment for runtime, genres, language, cast, and directors.
- Added TMDB IMDb-ID mapping and credits retrieval for better metadata completeness.
- Added deterministic blockbuster paging (`blockbuster_page`) for "show me more" flows.

### Parsing and Follow-up Quality
- Added generalized genre alias parsing (`romcom`, `scifi`, plurals, hyphenated variants).
- Fixed false TV pivot from "show me more" by removing generic `show/shows` TV hint terms.
- Added critics-intent parsing and proxy constraint tagging (`ranking:critic_proxy`).
- Added movie-default behavior for critics-intent when user does not explicitly ask for TV.

### Ranking and Critics Proxy
- Added dedicated critics-year proxy retrieval path for exact-year critic-style prompts.
- Added critics-proxy quality floor on rating + vote count.
- Added critics-proxy deterministic sort by rating then vote count.

### Honesty and UX Transparency
- Added unsupported-source guardrail for explicit Rotten Tomatoes / Metacritic / Letterboxd requests.
- Added response-level `interpretationNote` to explain proxy assumptions.
- Surfaced `interpretationNote` in both chat response text and results panel.
- Removed meta-steering choice and associated trace UI.
- Removed refinement suggestion chips; users now refine entirely via freeform typing.

### Robustness Fixes
- Prevented literal `"null"` explanation strings from leaking to UI by forcing fallback template explanations.

### Editorial Results UX Refinements (May 24, 2026)
- Recommendation cards and default highlight poster tiles now use clearer hover/focus affordances while maintaining a lower-chrome editorial baseline.
- More-details interaction is unified: both recommendation cards and default highlight tiles open the same right-side panel format.
- Panel navigation moved to the top row and restyled to lightweight link-style Previous/Next controls with a subtle `x of y` counter.
- Removed redundant panel metadata line that duplicated runtime/rating/votes beneath the poster area.
- Trailer modal fallback UX improved for failed embeds (explicit fallback message + source link).

### Highlights Data Enrichment (May 24, 2026)
- Root cause identified: default highlights were backed by lightweight `/highlights` payload and lacked full recommendation metadata.
- Backend now exposes `GET /highlights/:type/:id` for enriched highlight details (synopsis, cast, directors, genres, language, runtime, trailer).
- Frontend details panel now fetches highlight details on demand and caches per-highlight to avoid repeated requests.
- Highlight details now render richer metadata parity with recommendation details (subject to TMDB data availability per title).

### Editorial Panel Art Direction Iteration (May 24, 2026)
- Updated "Why this" treatment to a cleaner editorial label (`Lumera note`) with Migra italic body and reduced structural chrome.
- Removed default highlight "why this" filler text so highlight details only show rationale when meaningful data exists.
- Refined explanation tone toward concise knowledgeable-friend phrasing with British-English leaning prompt guidance and fallback wording updates.
- Reworked details composition into a stronger editorial structure: hero with poster + note/actions and explicit narrative/metadata separation.
- Landed asymmetrical narrative + side rail layout as the preferred panel variant after testing multiple synopsis/metadata permutations.
- Added lighter-weight metadata presentation (smaller, quieter labels) and list-style cast/director blocks.
- Added right-aligned panel open/close motion: fade backdrop + slide-in/out panel at 300ms ease-out with reduced-motion support.
- Added responsive panel-width behavior preserving 50:50 feel at large sizes while allowing modest extra room on mid-sized desktops.

### UI Consistency and Component Reuse Pass (May 24, 2026)
- Added shared button style utility in `frontend/src/buttonStyles.ts` with standard variants (`primary`, `secondary`, `subtle`, `ghost`, `chip`, `link`) and sizes (`xs`, `sm`, `md`, `lg`, `icon`, `icon-sm`).
- Migrated header controls in `frontend/src/App.tsx` to shared styles, including subtler reset action hierarchy and icon-only theme toggle parity.
- Migrated core action buttons in `frontend/src/pages/ConversationalHome.tsx`, `frontend/src/pages/ResultsPage.tsx`, and `frontend/src/pages/HomePage.tsx` to shared class generation for consistent spacing, typography, focus, hover, and disabled states.
- Added shared `inlineLinkClass` utility and applied it to interactive links in `ResultsPage` (streaming links + trailer source link) to align anchor focus/hover treatment with button system tokens.

### Layout and Interaction Follow-ups (May 24, 2026)
- Reworked two-column divider implementation: removed right-panel `border-left` and moved divider to a centered `editorial-main::after` separator so the split reads as visually balanced.
- Added shared `inlineActionClass` and applied it to recommendation-card "More details" / "View trailer" controls to remove inherited `h-7 px-3` padding and restore true inline action rhythm.
- Applied the same inline-action treatment to details-panel `Previous` / `Next` navigation while keeping semantic button behavior for keyboard/accessibility.
- Fixed subtle/ghost hover-state reliability by replacing unsupported slash-opacity token classes on CSS-variable colors with valid Tailwind token classes.
- Restored restrained hover styling after debugging (kept subtle style language consistent with the rest of the app).
- Fixed highlight poster-tile hover-lift regression by moving shadow/lift to a non-clipping wrapper and tuning hover lift to avoid side clipping while preserving visible elevation.

### Caching and Panel Rhythm Follow-ups (May 24, 2026)
- Added backend in-memory TTL caching for Streaming Availability lookups (including short-lived negative cache entries for rate-limit/error statuses).
- Added backend in-memory TTL caching across TMDB hot paths (details, credits, videos, external IDs, IMDb mapping, person lookup/credits, trailer-by-IMDb).
- Added backend in-memory TTL caching for OMDb/FMDb search and detail endpoints to reduce repeated fan-out fetches.
- Persisted `highlightDetailsCache` in frontend sessionStorage to avoid repeated highlight detail fetches on reload within the same session.
- Reworked details-panel media actions into a single wrapping row (trailer + providers) without a separate heading to reduce visual clutter.
- Standardized details-panel vertical rhythm to 8/16/24 spacing decisions and normalized uppercase micro-label typography via shared class constants.

---

## Current Architecture Snapshot

### Backend
- **Understanding (`llmClient.parseRequestSpec`, `requestSpec`)**: full updated spec and operation, JSON-object mode, local validation.
- **Parser (`preferenceParser`)**: authoritative spec overlay on rules; rules take over on understanding failure, with continuity gaps still open.
- **Engine (`recommendationEngine`)**: mode-aware search, scope-aware candidate reuse, TMDB enrichment, hard filters and existing scoring adjustments.
- **API (`index.ts`)**: spec round-trip, concrete-request results-first policy, clarification/weak-result handling, constraints, notes and unsupported-source guardrails.

### Frontend
- **Conversation:** freeform multi-turn interaction, clarification questions only when backend requests them.
- **Results:** round navigation + active constraints + interpretation note + richer metadata display.
- **State:** recommendation passes store constraints, turn operation, diagnostics and interpretation note; conversation state stores the spec for follow-ups.

---

## Important Decisions

- **Honesty-first policy:** Never imply unavailable critic-source data; explicitly disclose proxy interpretation.
- **Freeform over control chips:** Removed meta-steering and refinement chips to reduce confusion and keep interaction natural.
- **Single endpoint strategy:** Continue using one endpoint with optional `clarificationContext` and richer response metadata.
- **Conservative fallback policy:** If explicit unavailable source is requested, ask user to confirm proxy mode before returning guessed results.

---

## Validation Snapshot

Items below record previously validated behavior; the current build and Jest status is recorded above.

- [x] Backend build passes.
- [x] Frontend build passes.
- [x] `Critics favourites from 2020` now returns movie-only 2020 set with interpretation note and proxy constraint.
- [x] Explicit unsupported source query (e.g., Rotten Tomatoes) returns clarification prompt instead of pretending source support.
- [x] `Show me more` remains in blockbuster/year frame without TV drift.
- [x] Unified details panel opens from both recommendation cards and default highlight poster tiles.
- [x] Top-row panel navigation (`Previous / x of y / Next + close`) validated in browser.
- [x] Highlight details now include cast/director/language/trailer data after backend endpoint activation.
- [x] Details panel motion now includes both enter and exit animation with reduced-motion fallback.
- [x] Preferred details layout variant validated: asymmetrical narrative/synopsis column with metadata side rail.
- [x] "Lumera note" style and trailer action polish validated in browser iteration.
- [x] Shared button/link style utility integrated across app header, conversational actions, results actions, and home preference controls.
- [x] Frontend production build passes after style-system migration and anchor parity updates.
- [x] Divider now renders in the inter-panel gap center (`.editorial-main::after`) with symmetric spacing on both columns.
- [x] Recommendation and details-panel navigation actions now use inline action styling without padded pill geometry.
- [x] Highlight tile hover lift restored with wrapper-based elevation and clipping-safe hover tuning.
- [x] Backend build passes after streaming/TMDB/OMDb cache-layer additions.
- [x] Frontend build passes after details-panel action-row and spacing/typography rhythm refinements.

---

## Remaining Gaps

- [ ] Implement and test detailed content-rating enforcement if unrated/NC-17 blocking remains a product requirement; current TMDB filter only checks `adult`.
- [ ] Run full browser smoke pass for all major conversational journeys after latest transparency changes.
- [x] Review memory-bank and current setup/architecture docs; align facts and label historical/planned sections (October 16, 2026).
- [ ] Add targeted automated tests for critics-intent guardrails and interpretation-note behavior.
- [ ] Add automated coverage for `GET /highlights/:type/:id` and frontend highlight-details caching/fallback behavior.
- [ ] Add frontend visual regression coverage for details-panel layout variants and motion states.
- [ ] Revisit metadata rail density once real title data breadth is tested across wider genres/languages.
- [ ] Evaluate whether to extract a typed `Button` React component wrapper on top of `buttonClass` for stricter usage consistency and reduced className drift.

---

## Next Steps

1. Preserve active structured constraints and fresh retrieval during rule fallback; bound retry latency and observe provider failures.
2. Implement catalogue-built, spec-aware clarification options and general recorded loosening (phase 3); fix thin critics options and Portuguese coverage.
3. Address tone/ranking conflicts and widened-origin balance; then fact-grounded replies and streaming (phases 4–5).
4. Re-run targeted and full evaluation when provider health permits; inspect transcripts, and do not treat proxy checks as semantic quality certification.
5. Keep separate backlog items (critic guardrail tests, highlight route/cache coverage, deployed/browser parity) open without confusing them with current recommendation-engine priorities.