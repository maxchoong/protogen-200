# Active Context – Current Work & Decisions

## Project Status

**Date:** February 10, 2026  
**Phase:** Phase 2: Catalog Integration (Starting next)
**Phase 1 Status:** ✅ COMPLETE – Skeleton MVP with mock data running

### Phase 1 Completion Summary
- ✅ Frontend: React + TypeScript + Vite + Tailwind running on localhost:5173
- ✅ Backend: Node.js + TypeScript + Express running on localhost:5000
- ✅ Home page with free-text input and preference panel
- ✅ Results page with mock recommendation cards
- ✅ POST /recommendations endpoint with mock data
- ✅ Frontend-backend wiring complete

---

## Completed Deliverables

✅ **Product Requirements Document (PRD)**
- Six user stories with acceptance criteria
- Key user personas defined
- Content safety requirements mandated

✅ **Design Document**
- System architecture (5 components)
- Data model definition
- UX/interaction design for home, preferences, results, and trailer pages
- API endpoint specifications
- LLM integration strategy (parsing, explanations, synopsis generation)
- Performance, security, and compliance considerations

✅ **Granular Task List**
- 100+ tasks mapped to user stories
- Frontend and backend tasks separated
- Cross-cutting tasks (content safety, LLM guardrails, caching, UI polish, infrastructure)

✅ **Memory Bank Files Created**
- `projectbrief.md` – Executive summary
- `productContext.md` – PRD and user stories
- `techContext.md` – Architecture and implementation details
- `systemPatterns.md` – Design patterns and module organization
- `progress.md` – Granular task checklist
- `activeContext.md` – This file

---

## Next Steps (Ready for Implementation)

### Phase 1: Skeleton MVP (Frontend + Backend Stub)
1. Initialize React frontend project (TypeScript + shadcn/ui)
2. Initialize Node.js backend (TypeScript + Express/Fastify)
3. Create home page layout with input + preferences panel
4. Create results page component (placeholder)
5. Implement basic `POST /recommendations` endpoint (returns mock data)
6. Wire up frontend submission to backend

### Phase 2: Catalog Integration
1. Set up TMDB API key and client
2. Implement `CatalogClient` module
3. Build query builder for genre, type, rating filters
4. Implement content safety filters (adult, unrated, X)
5. Connect to recommendation engine
6. Test with real TMDB data

### Phase 3: LLM Integration
1. Choose LLM provider (OpenAI, Anthropic, or open-source)
2. Set up LLM client with error handling + fallbacks
3. Implement preference parsing from user input
4. Implement "Why this?" generation
5. Implement spoiler-free synopsis generation
6. Add caching for LLM outputs

### Phase 4: Availability & Polish
1. Evaluate JustWatch API or implement fallback
2. Integrate availability fetching
3. Add trailer modal and playback
4. UI polish, accessibility, error handling
5. Performance tuning
6. Testing and deployment setup

---

## Key Architectural Decisions

✅ **No user accounts** – Stateless backend, on-demand API calls, simple caching  
✅ **TMDB as catalog** – Rich API, freely accessible, good coverage  
✅ **Free-tier LLM** – Balance cost with quality; fallback patterns for reliability  
✅ **Responsive web app** – Single SPA for desktop + mobile support  
✅ **Content safety critical** – Filter at three levels: query, filtering, and unit tests  
✅ **Parallelization for performance** – Batch LLM calls, parallel external API calls  

---

## Known Constraints & Trade-offs

### Content Safety
- Must filter adult/unrated/X content → this is **non-negotiable**
- May miss some edge cases → unit tests required for verification

### Availability Data
- JustWatch free tier may have limitations
- Fallback: generic search links or omit availability info
- Trade-off: convenience vs data accuracy

### LLM Cost
- Each recommendation batch may call LLM 11+ times (parse + 10 explanations + synopsis)
- Counter: cache LLM outputs aggressively
- Alternative: batch multiple explanation generations in single call

### Spoiler Prevention
- LLM-generated synopses may occasionally miss spoilers
- Counter: heuristic scan for spoiler phrases + manual review of test results

---

## Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | React, TypeScript, shadcn/ui, Tailwind CSS |
| Backend | Node.js, TypeScript, Express/Fastify |
| Catalog | TMDB API |
| LLM | Free-tier provider (TBD) |
| Availability | JustWatch (ideal) or fallback |
| Caching | In-memory or Redis |
| Hosting | Vercel (frontend) + simple backend host (Render, Fly, etc.) |
| Testing | Jest, React Testing Library |

---

## Communication & Documentation

- **Primary source:** This memory bank (markdown files)
- **Code organization:** Clear module boundaries (engine, clients, components)
- **Commits:** Descriptive messages mapping to task list
- **Code comments:** Explain "why" for complex logic (LLM prompts, filter reasoning)

---

## Success Criteria for v1

- ✅ Users can describe what they want in natural language
- ✅ System returns 5–10 relevant recommendations with explanations
- ✅ Each recommendation shows where to watch + trailer link
- ✅ Content safety filters work reliably (no adult/unrated/X content)
- ✅ UX is intuitive and accessible (mobile-first, responsive)
- ✅ Response time < 2–3 seconds typical
- ✅ No persistent user data storage (privacy-first)