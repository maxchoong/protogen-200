# Progress – Granular Task List

**Current verification:** backend 375/375 tests, lint and build passed October 16.
Frontend build/lint were verified before the latest backend-only follow-up; the
dirty frontend worktree has not been revalidated by the documentation refresh.
No application code or provider calls changed during this refresh.

## Evaluation Record

| Run | Cases passing | Hard checks | Genre checks | Tone checks | Clarification | Follow-up cases | p50 / p90 |
|---|---:|---:|---:|---:|---:|---:|---|
| October 15 baseline, 52 cases | 69% | 91% | 89% | 92% | 62% | 85% | 4.8 s / 11.2 s |
| October 16 phase2b, 52 cases | 65% | 96% | 84% | 77% | 62% | 77% | 12.8 s / 26.8 s |
| October 16 phase2c, 52 cases | 79% | 93% | 97% | 85% | 90% | 69% | 24.9 s / 41.3 s |

All three runs ended with non-empty final lists, sometimes after automatically
answering clarification/widening options. This is not proof that original
requests always return results. Tone/genre checks and follow-up case passes
are proxies, not a semantic judge or a pure intent-understanding measurement.
The baseline used concurrency 2; October 16 full runs used concurrency 1.

Reports under `backend/eval/reports/`:
- `baseline-2026-10-15.json`: baseline in the current uncommitted worktree.
- `2026-10-16T09-32-52-596Z-phase2b.json`: two understanding timeouts, no 429s.
- `2026-10-16T10-07-37-543Z-phase2c.json`: 22 understanding failures/73 turns; 20 timeout and 8 HTTP 503 errors across LLM stages, no 429s.
- `2026-10-16T10-12-17-864Z-phase2d-followups.json`: 1/2 cases pass after the candidate-reuse fix; 90s sci-fi passes, French follow-up hit 503/429 and fell back.

Only `baseline-*` reports are eligible for version control; other reports are
ignored local files. The table and caveats above persist independently of them.
No full live evaluation covers the final reuse fix. Provider health has not been
rechecked since the last 503/429; quality and latency acceptance remain open.

## Conversational Engine v2 (October 15, 2026)
- [x] PRD, design and task docs (`prd-`, `design-`, `tasks-conversational-engine.md`).
- [x] Evaluation harness `backend/eval/` (52 cases, `npm run eval`) and baseline report `eval/reports/baseline-2026-10-15.json`.
- [x] The API returns `originCountries`; TMDB details keep `origin_country` / `production_countries`.
- Baseline: 69% of cases pass:
  - hard constraints 91%;
  - genre fit 89%;
  - tone 92%;
  - clarify appropriateness 62%;
  - follow-ups 85%;
  - no empty results;
  - p50 4.8 s / p90 11.2 s.
- [x] Phase 2: structured request (`RequestSpec`), LLM request understanding, spec overlay, conversation state round-trip, rate-limit cooldown.
- [x] October 16: resumed sequential evaluation after a successful Gemini probe; two full 52-case reports (`phase2b`, `phase2c`) plus targeted follow-ups (`phase2d-followups`).
- [x] Concrete structured requests try results before unnecessary first-turn clarification; prompt preserves country/format/genres on short refinements. Broad origin-only and vague requests still clarify.
- [x] Structured search-scope changes retrieve fresh candidates rather than filtering only prior results; tone-only/unchanged scope still reuses candidates. 90s sci-fi follow-up passes live.
- Latest full run (before the final retrieval fix): 79% case pass, hard constraints 93%, genre 97%, tone 85%, clarification 90%, follow-ups 69%, p50 24.9 s / p90 41.3 s. Provider failures: 22 understanding errors across 73 turns (timeouts/503; no 429 in that full run).
- [ ] Phase 2 quality/latency acceptance and healthy-provider verification. Final targeted French follow-up encountered 503/429; stopped additional calls. No full live re-eval after the last retrieval fix.
- Final backend verification October 16: 375/375 tests, lint and build pass. Frontend untouched in this follow-up.
- [ ] Phase 3: catalogue check, questions only when useful, options built from the catalogue, visible loosening.
- [ ] Phase 4: simpler ranking and optional LLM re-ordering.
- [ ] Phase 5: replies built from the engine's match record, and streaming.

## Country of Origin (October 13, 2026)

- [x] `regionTaxonomy.ts` resolver: languages vs countries (demonyms, country names, "from X").
- [x] Parser `country:XX` constraint; TMDB `with_origin_country` plus an established-titles page; strict engine filter; country-aware widening options and notes.
- [x] `regionTaxonomy.test.ts` (25 tests); backend Jest 297/297, build/lint pass; live checks for Malaysian, Indian, Nigerian, Mexican, and Korean (no regression).
- [x] Multi-turn origins: add/switch/narrow semantics, per-origin TMDB fan-out, widen turn operation, change note in intro; non-repetitive intro prompt plus `stripStockPhrases`.
- [x] Thin catalogues: zero-vote new releases no longer rank first. Vote-confidence ranking: Bayesian rating, 0 votes means popularity 0, pool-relative popularity, vote-scaled recency.
- [x] "Released this month" / "new horror movies" now parse as release windows (they were never recognised, rather than lost after clarification).
- [x] Tone conflicts: warm-tone moods plus a genre conflict penalty; diversity no longer promotes off-tone picks.
- [x] Thin catalogues: most-voted candidates are reserved in country/language pools (e.g. A Perfect Fit now leads Malaysian + Indonesian heartfelt).
- [ ] "Funny horror movies" ranks Pulp Fiction first: engine post-scoring adjustments boost it (the base scorer ranks horror-comedies higher).
- [ ] "Gritty crime thrillers and mysteries" (bare query) mixes in Hunger Games / The Imitation Game: candidate pool gap, pre-existing.
- [ ] Tone-conflict demotion (horror for "heartwarming"); let the selected option's genre override a conflicting first-turn genre.

## Series Genre Coverage (October 13, 2026)

- [x] Diagnosed empty results for series genre follow-ups (TV genre map gaps, parser genre collapsing, hard filter removing all series).
- [x] Added `genreTaxonomy.ts`, full TV genre mapping, TV keyword fallbacks, media-aware and relaxable hard genre filter, parser genre/language fixes.
- [x] Per-request relaxation diagnostics with an honest user-facing note; concurrency-safe.
- [x] Tests: `genreCoverage.test.ts` + route test; backend Jest 260/260, build and lint pass. Live 5-language × 7-genre series matrix returns results in every cell.
- [x] Qualified drama filtering ("historical dramas" → History + Drama, honest fallback).
- [x] Clarification options probed for availability (`estimateAvailableTitles`); zero-result options dropped.
- [x] Empty results return validated "widen the search" options; frontend fallback copy improved.
- [x] Backend Jest 272/272, build/lint pass; frontend build/lint pass; live checks for Spanish/Korean historical dramas and Korean westerns.

## Clarification Option UX (October 13, 2026)

- Options sit outside, below the assistant question bubble and reuse the shared pill radius with auto-height multiline labels and a 44px minimum target.
- Message-scoped clarification responses keep answered choices disabled permanently. Selected options receive a quiet outline and accessible selected label; free-text replies resolve the group without marking a choice.
- A synchronous submission guard blocks repeat clicks. Retry does not duplicate the user reply, and cancellation does not reactivate answered choices.
- Verification: frontend build/lint and editor diagnostics pass. Browser checks at 390px/1440px in dark/light themes cover wrapping, selection, free-text replies, new rounds, simulated failure/retry, cancellation, and confirmed conversation reset. Browser request mocks were removed afterward.

## Historical Snapshot – October 13, 2026

The following records earlier work and validation. It does not supersede the
current verification, open v2 work or evaluation caveats above.

- Backend and frontend production builds and lints pass.
- Backend Jest: 335/335 passing; backend build and lint verified October 13, 2026. Frontend build and lint also pass.
- Plain language queries & conversational clarification:
  - Added award and prestige keywords (`oscar`, `academy award`, `bafta`, `palme d'or`) to `CRITICS_KEYWORDS`.
  - Added calendar and seasonal date window resolution (`this summer`, `last summer`) mapping to `releaseDateRange` (e.g. `2026-05-01` to `2026-08-31`) and seasonal constraints.
  - Extended TMDB discover to accept `releaseDateGte` and `releaseDateLte` parameters for seasonal release queries.
  - Filtered broad category/temporal words from literal title keyword queries in `extractSearchTerms` to prevent matching movies titled "Oscar" or "Summer".
  - Extended LLM prompt with awards and prestige catalog search seeds in `referenceSuggestions`, validated against TMDB/OMDb catalog.
  - Added conversational clarification generation via `llmClient.generateConversationalClarification()`, turning rigid system menus into friendly film-advisor prompts with context-tailored options.
  - Updated fallback disambiguation templates to replace internal developer routing phrases ("Go mood-first", "Go title-similarity first") with natural phrasing.
  - Implemented Results-First gating for unambiguous cultural and blockbuster requests, delivering recommendations directly without false disambiguation traps.
- Creator discovery: unqualified "films by NAME" selects verified directing credits first, then other verified creator credits if needed. Explicit roles are exact; creator evidence is kept separate from acting credits and preserved through deduplication/hydration. Compatible refinements retain creators, new creator anchors replace them, and hard pivots clear them.
- Live Cameron query verified four directing matches with separate real cast metadata. Deterministic credit wording prevents producer-only fallbacks being described as directed films. Browser/server-endpoint interaction remains untested for this change.
- Client migrated from the legacy GitHub Models configuration to configurable OpenAI-compatible providers after endpoint failures. The Gemini `gemini-3.5-flash-lite` smoke check passed at that time; this is not a current availability claim. October 16 failures are recorded above.
- Follow-up requests preserve user-turn history, reset accumulated constraints after hard pivots, and place active actor matches before supplemental results across intent modes.
- Contrastive reference retrieval searches a prioritized 16-keyword concept set; whole-word matching, catalog support, and conflict signals prevent related-title and broad-genre bypasses. Concept scoring now recognizes direct time dilation, constructed reality, psychological speculation, and fate/agency evidence.
- Indie-gem discovery treats Indie as a soft pseudo-genre, searches separate quality-filtered keyword groups, prioritizes catalog-validated title seeds, defaults to movies unless TV is explicit, and only rewards low popularity when rating support is credible.
- Relaxing reference scoring now discounts incidental calm phrases when paired with stakes/urgency cues, distinguishes moderate stakes from severe peril/survival/violence, and filters explicit countdown-plus-threat plots.
- The exact relaxing Inception prompt now removes Kill ’em All 2, Chaos Walking, Alive, The Matrix Reloaded, Do I Sound Gay?, Planet of the Apes, and The Saint from the current-source live list while retaining stronger concept matches.
- Latest live audit (one variable upstream run): Pleasantville, The Martian, Arrival, Eternal Sunshine, Project Hail Mary, and Solaris ranked in the top six; Truman Show ranked ninth and Hoppers was excluded. Interstellar and The Man from Earth remain lower when the catalog synopsis lacks specific time/mind evidence.
- Latest `Surprising indie gems` audit returned A Ghost Story, Sorry to Bother You, The One I Love, The Vast of Night, and The Station Agent in its top six; remaining results varied across runs and included some broader catalog fits.
- Latest repository updates include the TMDB `adult`-flag safety filter and a `ts-jest` security update to `29.4.12`.
- Detailed age/certification enforcement is not implemented by the current TMDB safety filter; see the safety checklist below.
- [x] Development tokens referenced in historical notes were rotated (confirmed October 2, 2026).

- [x] Phase 1 complete: frontend/backend skeleton and API wiring
- [x] Phase 2 complete: OMDb catalog integration and safety filters
- [x] Phase 3 complete: GitHub Models integration with fallback
- [x] Phase 4 complete: availability, trailers, loading/error states, accessibility work
- [x] Phase 5 complete: Intent classification, conversational UI, multi-turn clarification
- [x] Phase 6 complete: End-to-end testing, API integration validation
- [x] Recommendation-quality refinement complete: dynamic clarification, anchor suppression, and reference-flow ranking improvements
- [x] Active preference continuity added with hard-pivot reset and actor-first result ordering across intent modes
- [x] Director-first creator queries implemented with role-aware TMDB lookup, explicit-role filtering, verified fallback credits, and parser/client/integration regressions
- [x] Follow-up reliability improvements shipped: deterministic blockbuster paging + TV-drift fix for "show me more"
- [x] Genre intent parsing generalized (aliases/plurals/hyphenated forms)
- [x] Meta-steering prompt removed from UX
- [x] Refinement suggestion chips removed from UX
- [x] Transparency policy implemented for critics-style requests (proxy explanation + unsupported-source guardrail)
- [x] Editorial details panel redesign iteration complete (hero narrative, metadata rail, motion, and typography pass)
- [x] Shared button/link style utility pass complete across primary frontend interaction surfaces
- [x] Memory-bank status and design references aligned with current implementation
- [x] Frontend/backend lint configured and enforced in CI
- [ ] TMDB configured locally for trailer verification

---

## Historical MVP Phases (separate from conversational-engine v2)

The numbered phases below describe the original MVP, not v2 completion.
Provider setup and verification snapshots in these sections are historical;
use the current setup guides and verification at the top of this file.

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
- [x] Filter titles marked adult by TMDB
- [ ] Enforce unrated / X / NC-17 / TV-MA exclusions using detailed certification data
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

## Historical Verification (October 3, 2026)

- [x] Backend `npm run build` passes, including explicit `.js` import checks.
- [x] Frontend `npm run build` passes.
- [x] Frontend and backend `npm run lint` checks pass.
- [x] Backend Jest suite passes cleanly (169/169).
- [x] GitHub Actions runs frontend lint/build and backend lint/build/test on pushes and pull requests.
- [x] Frontend Browserslist data refreshed; frontend build passes without the stale-data warning.

## Previously Verified Behavior

- [x] Backend build passes
- [x] Frontend build passes
- [x] Backend returns localized availability data for supported titles
- [x] Frontend can render availability links and fallback messaging
- [x] Frontend and backend lint scripts pass with compatible TypeScript-ESLint versions.
- [x] Critics-style query now returns explicit interpretation note when using proxy signals
- [x] Explicit Rotten Tomatoes / Metacritic requests now trigger clarification instead of fabricated source coverage

---

## Phase 5 – Conversational UI & Intent Classification

### Backend Intent Classification
- [x] Add IntentSignals and IntentClassification types to preferenceParser
- [x] Implement intent classification with 4 modes: mood | reference | talent | mixed
- [x] Extract actors from "with X", "starring X", "cast: X" patterns
- [x] Implement DiscoveryMode-specific ranking weights in RankingScorer
- [x] Add mood-aware weights (mood: 40%), reference-aware weights (talent: 35%), talent-aware weights (talent: 55%)
- [x] Implement needsClarification() with confidence threshold 0.65
- [x] Generate 3 clarification question patterns for ambiguous queries
- [x] Prevent redundant clarification loops with asked-question tracking and max-turn caps

### Frontend Conversational UI
- [x] Create useConversation hook with message state and round tracking
- [x] Create ConversationalHome component with chat thread and input composer
- [x] Render user/assistant message bubbles with intent metadata display
- [x] Implement clarification question UI with select/text/boolean options
- [x] Update App.tsx to handle clarificationContext in API requests
- [x] Support multi-turn flow: user query → clarification (if needed) → refined results
- [x] Add loading indicators and error handling
- [x] Show examples on empty state

### API Contract Extensions
- [x] Add optional clarificationContext to RecommendationRequest
- [x] Include requiresClarification with questions array in response
- [x] Include detectedIntent (mode + confidence) in all responses
- [x] Maintain backward compatibility with old API format

### Files Created/Modified
- [x] `/backend/src/engine/preferenceParser.ts` - Intent classification and clarification logic
- [x] `/backend/src/engine/rankingScorer.ts` - Mode-specific ranking weights
- [x] `/backend/src/index.ts` - Clarification gating before search
- [x] `/frontend/src/hooks/useConversation.ts` - State management hook
- [x] `/frontend/src/pages/ConversationalHome.tsx` - Chat UI component
- [x] `/frontend/src/pages/ConversationalHome.css` - Styling
- [x] `/frontend/src/App.tsx` - Component integration and API flow

---

## Phase 6 – Testing & Rollout Hardening

### End-to-End Tests
- [x] Create `test-phase5-conversation-e2e.ts` with 10 comprehensive test cases
- [x] Test 1: High-confidence mood queries → immediate results
- [x] Test 2: Talent-focused queries with actor extraction
- [x] Test 3: Reference-focused queries with title matching
- [x] Test 4: Ambiguous queries → clarification questions
- [x] Test 5: Multi-turn flow (ambiguous → clarification → refined results)
- [x] Test 6: Intent metadata always included in response
- [x] Test 7: Recommendations include required fields (imdbId, title, plot, rating)
- [x] Test 8: Talent mode applied for actor-specific queries
- [x] Test 9: Backward compatibility with old API format
- [x] Test 10: Clarification loop prevention behavior covered

### Integration Tests
- [x] Create `src/engine/__tests__/intentClassification.test.ts` with Jest tests
- [x] Test intent classification accuracy for 4 modes
- [x] Test actor extraction from multiple patterns
- [x] Test confidence scoring and thresholds
- [x] Test clarification question generation and types
- [x] Test suite compiles and runs without errors

---

## Recommendation Quality & Clarification Refinement

### Backend Recommendation Quality
- [x] Remove static mock recommendation fallback from production responses
- [x] Suppress explicitly mentioned anchor titles by default for reference-style prompts
- [x] Reuse reference-title genres earlier in recommendation retrieval and ranking
- [x] Reduce broad-genre drift for reference flows like "Like Inception but more relaxing"
- [x] Strengthen pace and mood contrast parsing for calming/slower refinements
- [x] Add weak-result quality gates before finalizing recommendations

### Dynamic Clarification Flow
- [x] Track asked clarification IDs in request/response flow
- [x] Auto-submit clarification options in the conversational UI
- [x] Auto-submit empty-state example prompts for faster flow testing
- [x] Replace stage-based weak-match questioning with unresolved-dimension selection
- [x] Allow one freeform clarification to satisfy multiple latent questions
- [x] Finalize immediately when enough context has been gathered
- [x] Cap clarification turns to avoid procedural loops

### Verification at Phase 6 Completion (Historical)
- [x] Route-level tests updated for dynamic clarification behavior
- [x] Integration regression added for relaxing-reference ranking behavior
- [x] Backend Jest suite passing (87/87)
- [x] Backend `npm run build` passing
- [x] Frontend `npm run build` passing
- [x] Changes committed and pushed to `origin/main` (`c3b590e`)

## Post-Phase Hardening (May 2026)

### Retrieval, Parsing, and Metadata
- [x] TMDB enrichment for runtime, genres, language, cast, and director metadata
- [x] TMDB IMDb-ID mapping and credits retrieval for richer result cards
- [x] Deterministic blockbuster pagination via `blockbuster_page`
- [x] Removed false TV intent trigger from generic "show/show me more" wording
- [x] Added generalized genre alias parsing (`scifi`, `romcom`, plural/hyphenated variants)

### Editorial UI and Explanation Quality
- [x] Removed generic highlight fallback rationale text from details panel.
- [x] Added highlight detail parity behavior so rationale appears only when meaningful detail data exists.
- [x] Tightened LLM explanation prompts for concise knowledgeable-friend style with British-English leaning wording.
- [x] Updated template fallback explanation generation to shorter conversational rationale style.
- [x] Refined details panel to editorial composition with stronger hierarchy and reduced chrome.
- [x] Tested multiple synopsis/metadata layout permutations and selected asymmetrical narrative + metadata side-rail variant.
- [x] Converted metadata block to quieter, lower-contrast, list-friendly presentation.
- [x] Added panel open/close motion (backdrop fade + right slide) with 300ms ease-out timing and reduced-motion fallback.
- [x] Added responsive panel width behavior to preserve 50:50 intent while improving mid-desktop readability.

### UX Simplification
- [x] Removed meta-steering "stay close / broaden" prompt and state tracking
- [x] Removed results-page refinement suggestion chips
- [x] Shifted all follow-up refinement to freeform user input

### Honesty / Transparency
- [x] Added critics-intent detection and explicit `ranking:critic_proxy` constraint
- [x] Added interpretation note for critics-proxy mode (TMDB/IMDb rating + votes)
- [x] Added unsupported-source guardrail for explicit Rotten Tomatoes / Metacritic / Letterboxd requests
- [x] Added frontend display for interpretation note (chat + results panel)

### Quality Safeguards
- [x] Added critics-year retrieval path and quality floor (rating/votes)
- [x] Added critics-mode ordering by rating then vote count
- [x] Fixed literal `"null"` explanation leakage with deterministic fallback

### Build Verification
- [x] Backend `npm run build` passes
- [x] Frontend `npm run build` passes
- [x] No TypeScript errors in test files
- [x] No lint violations

### Editorial Panel and Highlights Enrichment (May 24, 2026)
- [x] Unified details panel interaction for both recommendation cards and default highlight tiles
- [x] Moved details panel navigation to top row with lightweight link-style Previous/Next controls
- [x] Reduced panel metadata redundancy by removing duplicate quality line under poster block
- [x] Added hover/focus affordances for highlight tiles and recommendation cards while preserving editorial baseline chrome
- [x] Added backend route `GET /highlights/:type/:id` for enriched highlight metadata
- [x] Added frontend on-demand fetch + cache for highlight details in panel view
- [x] Highlight panel now supports synopsis, cast/director, genres/language, runtime/rating, and trailer data when available

### UI Consistency and Reuse (May 24, 2026)
- [x] Added `frontend/src/buttonStyles.ts` as shared interaction-style utility module
- [x] Standardized button variants and sizes for header, conversational controls, results actions, and home preference controls
- [x] Converted icon controls and utility actions to consistent focus-visible ring and disabled-state treatment
- [x] Added shared `inlineLinkClass` and applied to interactive result links for anchor/button parity
- [x] Verified frontend `npm run build` passes after migration

### UI Follow-up Fixes (May 24, 2026)
- [x] Replaced right-panel border divider with centered grid-gap divider (`.editorial-main::after`) to remove visual split imbalance
- [x] Converted recommendation-card actions (`More details`, `View trailer`) to inline-action controls with no pill padding/height inheritance
- [x] Converted details-panel `Previous` / `Next` controls to inline-action styling while preserving semantic buttons
- [x] Fixed hover-state class reliability by replacing unsupported slash-opacity token classes on CSS-variable colors
- [x] Restored subtle hover treatment to match app-wide visual language after hover-state bug fix
- [x] Restored highlight poster tile hover lift by moving elevation to an unclipped wrapper
- [x] Tuned tile hover lift/shadow to increase visibility without reintroducing left/right clipping

### Caching and Panel Rhythm Follow-up (May 24, 2026)
- [x] Added streaming availability TTL cache layer in `backend/src/clients/streaming.ts` with status-aware negative caching for `rate_limited` and `error` cases
- [x] Added TMDB TTL caches in `backend/src/clients/tmdb.ts` for detail/credits/videos/external IDs/IMDb mapping/person lookup/person credits/trailer paths
- [x] Added OMDb/FMDb TTL caches in `backend/src/clients/fmdb.ts` for search and detail requests
- [x] Persisted frontend `highlightDetailsCache` to sessionStorage in `frontend/src/pages/ResultsPage.tsx`
- [x] Simplified details-panel media actions to a single wrapping button row without a separate heading label
- [x] Applied 8/16/24 vertical spacing rhythm updates across details panel sections
- [x] Unified details-panel micro-label typography and extracted reusable label class constants to prevent style drift
- [x] Verified backend and frontend builds pass after caching + panel rhythm updates

---

## Open Follow-Ups

- [ ] Refresh setup and summary docs that still mention legacy provider assumptions
- [ ] Add automated regression tests for critics-intent transparency and unsupported-source guardrail
- [ ] Add automated regression tests for `GET /highlights/:type/:id` and highlight details caching/fallback behavior
- [ ] Add targeted UI regression coverage for shared `buttonStyles` variants across light/dark themes and key interactive states
- [ ] Add targeted visual regression coverage for highlight tile hover-lift states (including edge-column clipping checks)
- [x] Development tokens referenced in historical notes were rotated (confirmed October 2, 2026).
- [ ] Consider backend pipeline optimization or refactoring if performance becomes an issue
- [ ] Test full multi-turn flow end-to-end with live API and browser snapshots
- [ ] Run accessibility audit on new conversational UI
- [ ] Run live smoke tests focused on conversational naturalness and dynamic follow-up heuristics
- [ ] Plan v2 features if any (spoiler handling, user accounts, advanced filtering, etc.)