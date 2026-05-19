# Active Context – Current Work & Decisions

## Project Status

**Date:** May 19, 2026  
**Phase:** Phases 1-6 complete; recommendation quality and dynamic clarification refinement shipped
**Overall Progress:** Full recommendation engine with intent-driven ranking, bounded multi-turn clarification, and conversational frontend UI. Core flows are implemented, validated, and pushed.

---

## Current Reality

- **Frontend & Backend:** Both build successfully with no TypeScript errors
- **Frontend:** React 18 + Vite 5 with new ConversationalHome component replacing form-based HomePage
- **Backend:** Node.js 20 + Express + TypeScript with intent classification and multi-turn support
- **LLM:** GitHub Models `gpt-4o-mini` with rule-based fallback
- **Catalog:** OMDb integration with live availability via RapidAPI
- **Intent System:** 4-mode classification (mood | reference | talent | mixed) with confidence scoring
- **Clarification:** Confidence-gated and quality-gated, single-endpoint design, dynamic follow-up selection based on unresolved dimensions from the latest freeform answer, capped to avoid loops

---

## Recent Recommendation Quality Refinements

### Backend Additions
- Removed static fallback recommendations from production API responses
- Suppressed explicitly mentioned anchor titles by default for reference-style prompts unless rewatch intent is detected
- Reused reference-title metadata earlier in ranking to improve similarity matching
- Strengthened contrastive mood and pace handling for prompts like "Like Inception but more relaxing"
- Added weak-result quality gates and dynamic clarification routing based on inferred unresolved dimensions

### Frontend Additions
- Clarification option chips auto-submit instead of filling the composer
- Example prompts auto-submit from the empty state
- Conversation state now tracks asked clarification IDs so the backend can avoid redundant questions

### Validation Snapshot
- Backend tests passing: 87/87
- Backend build passing
- Frontend build passing
- Dynamic clarification flow pushed to `origin/main` in commit `c3b590e`

## Current Architecture Snapshot

### Backend
- **Engine:** preferenceParser extracts intent signals, ranks by mode-specific weights via rankingScorer
- **Intent Modes:** 
  - Mood: keyword-based ("cozy", "dark", "funny"), confidence 0.5-0.9
  - Reference: title mentions ("like X", "similar to X"), confidence 0.6-0.95
  - Talent: actor extraction ("with X", "starring X"), confidence 0.6-0.95
  - Mixed: multiple conflicting signals, confidence 0.4-0.7
- **Clarification:** Initial ambiguity still uses confidence gating, but weak-result follow-ups now remain conversational and can continue for up to a bounded number of turns when the latest answer leaves important dimensions unresolved
- **Ranking:** RankingScorer applies mode-specific weights, anchor-title suppression, reference-genre reuse, and stronger pace/mood contrast handling

### Frontend
- **Home:** ConversationalHome with message thread (user/assistant bubbles, intent chips)
- **Input:** Textarea with Enter/Shift+Enter handling; suggestion buttons on empty state
- **Clarification:** Inline question rendering with auto-submitting option chips and asked-question tracking
- **Results:** ResultsPage receives recommendations and query from conversation state
- **State:** useConversation hook manages messages, clarificationRound, askedQuestionIds, lastQuery, and lastIntent

---

## Important Decisions

- **Conversational Default:** App now starts with ConversationalHome instead of form-based HomePage
- **Single Endpoint:** All flows use `POST /recommendations` with optional clarificationContext
- **Confidence Threshold:** 0.65 gates clarification; < 0.65 asks questions, >= 0.65 returns results
- **Bounded Dynamic Clarification:** weak-result follow-ups are selected from unresolved dimensions inferred from the latest answer rather than a fixed round ladder
- **Loop Prevention:** asked question IDs and a max clarification turn limit prevent redundant or endless follow-ups
- **Intent Transparency:** detectedIntent always in response so frontend can show mode/confidence to user
- **Backward Compatibility:** Old request format (no clarificationContext) still works end-to-end

---

## Build & Test Status

- [x] Backend TypeScript compilation: Clean
- [x] Frontend TypeScript compilation: Clean  
- [x] E2E test file created: test-phase5-conversation-e2e.ts
- [x] Integration test file created: intentClassification.test.ts
- [x] All 10 E2E test cases designed
- [x] Intent classification Jest suite designed
- [x] Route-level dynamic clarification regression tests passing
- [x] Recommendation-quality regression tests passing for the relaxing-reference flow

---

## Remaining Gaps

- [ ] Live E2E test execution (needs backend running)
- [ ] Full multi-turn flow validation in browser
- [ ] Accessibility audit on ConversationalHome (ARIA live regions, keyboard navigation)
- [ ] Documentation refresh for Phases 5-6 and recommendation-quality refinements
- [ ] Tune dynamic clarification heuristics further against live prompts if conversational feel still needs work

---

## Next Steps

1. **Live Validation:** Run browser and API smoke tests against real prompts to tune dynamic follow-up naturalness
2. **Documentation:** Update README, phase summaries, and consolidated docs with the new clarification policy and recommendation-quality behavior
3. **Deployment:** Redeploy if production should pick up commit `c3b590e`
4. **v2 Planning:** User accounts, spoiler control, advanced filtering, personalization

## Session Notes

Dynamic clarification refinement is now shipped: freeform replies can satisfy multiple latent questions, redundant follow-ups are skipped, and weak-result loops are bounded. Backend tests and build are green, frontend build is green, and the changes are pushed to GitHub.