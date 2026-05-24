# Active Context – Current Work & Decisions

## Project Status

**Date:** May 24, 2026  
**Phase:** Post-Phase-6 quality hardening and transparency updates
**Overall Progress:** Conversational recommendation engine is operational end-to-end with stronger follow-up behavior, TMDB enrichment, explicit transparency messaging, and simplified UX (freeform-only next turns).

---

## Current Reality

- **Frontend & Backend:** Both build successfully with no TypeScript errors.
- **Frontend:** Conversational flow is primary, meta-steering prompt removed, suggestion chips removed.
- **Backend:** Intent-aware ranking + clarification + transparency safeguards in single endpoint (`POST /recommendations`).
- **Data sources in practice:** TMDB + OMDb + IMDb-derived fields (via OMDb/FMDb and TMDB mappings), Streaming Availability API, optional LLM explanation generation.
- **Transparency behavior:** Explicitly states proxy interpretation when user asks for critics-oriented results and explicitly clarifies unsupported external critic sources.

---

## Recently Shipped Changes

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

---

## Current Architecture Snapshot

### Backend
- **Parser (`preferenceParser`)**: intent, genre aliases, year handling, critics-proxy detection, blockbuster paging state.
- **Engine (`recommendationEngine`)**: mode-aware search, TMDB enrichment, strict year filters, mainstream and critics proxy retrieval/ranking paths.
- **API (`index.ts`)**: clarification gating, weak-result handling, applied constraints, interpretation notes, unsupported-source clarification flow.

### Frontend
- **Conversation:** freeform multi-turn interaction, clarification questions only when backend requests them.
- **Results:** round navigation + active constraints + interpretation note + richer metadata display.
- **State:** recommendation passes store constraints, turn operation, diagnostics, and interpretation note.

---

## Important Decisions

- **Honesty-first policy:** Never imply unavailable critic-source data; explicitly disclose proxy interpretation.
- **Freeform over control chips:** Removed meta-steering and refinement chips to reduce confusion and keep interaction natural.
- **Single endpoint strategy:** Continue using one endpoint with optional `clarificationContext` and richer response metadata.
- **Conservative fallback policy:** If explicit unavailable source is requested, ask user to confirm proxy mode before returning guessed results.

---

## Validation Snapshot

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

---

## Remaining Gaps

- [ ] Run full browser smoke pass for all major conversational journeys after latest transparency changes.
- [ ] Refresh older long-form memory docs where legacy assumptions still appear.
- [ ] Add targeted automated tests for critics-intent guardrails and interpretation-note behavior.
- [ ] Add automated coverage for `GET /highlights/:type/:id` and frontend highlight-details caching/fallback behavior.
- [ ] Add frontend visual regression coverage for details-panel layout variants and motion states.
- [ ] Revisit metadata rail density once real title data breadth is tested across wider genres/languages.
- [ ] Evaluate whether to extract a typed `Button` React component wrapper on top of `buttonClass` for stricter usage consistency and reduced className drift.

---

## Next Steps

1. Add regression tests for critics proxy and unsupported source clarification.
2. Add regression tests for enriched highlight details route and panel parity behavior.
3. Validate production/deployed behavior matches local changes.
4. Continue documentation convergence (README/phase docs and memory-bank consolidated docs).