# Film & TV Advisor – Project Brief

## Executive Summary

**Product:** Film & TV Advisor  
**Goal:** Help users quickly find what to watch based on their preferences, and easily start watching.

---

## Key User Personas

1. **Casual Viewer**
   - Wants something to watch tonight without spending time browsing
   - Values speed and ease

2. **Picky Enthusiast**
   - Has specific tastes (genres, tone, actors) and wants tailored suggestions
   - Values accuracy and detailed explanations

3. **Busy User**
   - Wants to know where to watch and see a trailer without extra searching
   - Values convenience and time-saving features

---

## Core Features (v1)

1. **Free-text description input** – Natural language input for "what I'm in the mood for"
2. **Preference questions** – Optional guided questions to refine recommendations
3. **Smart recommendations** – 5–10 results with explanations
4. **Where to watch** – Platform availability information
5. **Spoiler-free synopsis** – Brief, non-spoilery descriptions
6. **Trailer integration** – Direct access to official trailers

---

## Platform & Tech Stack

- **Platform:** Responsive web app (desktop + mobile web)
- **Frontend:** React + TypeScript, shadcn/ui, Tailwind CSS
- **Backend:** Node.js/TypeScript (Express, Fastify, or Next.js)
- **Catalog:** TMDB API (metadata, posters, trailers)
- **AI:** Free-tier LLM for parsing, explanations, synopsis generation
- **Availability:** JustWatch (if available) or fallback
- **Storage:** No persistent databases; on-demand API calls + simple caching

---

## v1 Constraints

- No user accounts or persistent profiles
- No watchlist/bookmarking (future feature)
- Must filter out unrated, X-rated, and adult content
- Typical response time target: < 2–3 seconds
- Privacy-first: no persistent user data logging

---

## Success Criteria

- Users can describe what they want in natural language
- System returns 5–10 relevant recommendations with explanations
- Each recommendation shows where to watch + trailer link
- Content safety filters work reliably (no adult/unrated/X content)
- UX is intuitive and accessible