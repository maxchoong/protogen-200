# Progress – Granular Task List

## Overall Status

- [x] Phase 1 complete: frontend/backend skeleton and API wiring
- [x] Phase 2 complete: OMDb catalog integration and safety filters
- [x] Phase 3 complete: GitHub Models integration with fallback
- [x] Phase 4 complete: availability, trailers, loading/error states, accessibility work
- [x] Phase 5 complete: Intent classification, conversational UI, multi-turn clarification
- [x] Phase 6 complete: End-to-end testing, API integration validation
- [x] Recommendation-quality refinement complete: dynamic clarification, anchor suppression, and reference-flow ranking improvements
- [x] Follow-up reliability improvements shipped: deterministic blockbuster paging + TV-drift fix for "show me more"
- [x] Genre intent parsing generalized (aliases/plurals/hyphenated forms)
- [x] Meta-steering prompt removed from UX
- [x] Refinement suggestion chips removed from UX
- [x] Transparency policy implemented for critics-style requests (proxy explanation + unsupported-source guardrail)
- [x] Editorial details panel redesign iteration complete (hero narrative, metadata rail, motion, and typography pass)
- [x] Shared button/link style utility pass complete across primary frontend interaction surfaces
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

### Verification
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

---

## Open Follow-Ups

- [ ] Refresh setup and summary docs that still mention legacy provider assumptions
- [ ] Add automated regression tests for critics-intent transparency and unsupported-source guardrail
- [ ] Add automated regression tests for `GET /highlights/:type/:id` and highlight details caching/fallback behavior
- [ ] Add targeted UI regression coverage for shared `buttonStyles` variants across light/dark themes and key interactive states
- [ ] Rotate exposed development secrets
- [ ] Consider backend pipeline optimization or refactoring if performance becomes an issue
- [ ] Test full multi-turn flow end-to-end with live API and browser snapshots
- [ ] Run accessibility audit on new conversational UI
- [ ] Run live smoke tests focused on conversational naturalness and dynamic follow-up heuristics
- [ ] Plan v2 features if any (spoiler handling, user accounts, advanced filtering, etc.)