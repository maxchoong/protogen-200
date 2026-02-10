# Product Context – PRD & User Stories

## Problem Statement

Users waste significant time deciding what to watch due to:
- Decision fatigue (too many options)
- Difficulty articulating preferences
- Unclear where to watch / how to start
- Spoiler risk when researching options

## Solution

A lightweight recommendation app that:
- Accepts natural language descriptions ("what I'm in the mood for")
- Asks 3–7 optional preference questions for refinement
- Returns 5–10 tailored recommendations with explanations
- Shows where to watch and provides trailer previews
- Maintains spoiler-free descriptions

---

## User Stories & Acceptance Criteria

### User Story 1 – Free‑Text Description
**As a user, I want to describe what I'm in the mood to watch in my own words so that I can get recommendations that match my current interests.**

**Acceptance Criteria**
- 1.1 User can enter free-text input (e.g., "funny heist movie", "slow-burn sci‑fi show with complex characters")
- 1.2 Input field supports at least 200 characters
- 1.3 System accepts natural language (not just predefined tags)
- 1.4 On submit, system processes description and generates recommendations
- 1.5 If input is empty or too short (< 3 chars), show validation message

---

### User Story 2 – Preference Questions
**As a user, I want the app to ask me a few simple questions about my preferences so that it can refine recommendations when my initial description isn't enough.**

**Acceptance Criteria**
- 2.1 System can present 3–7 multiple-choice or quick-tap questions (genre, mood, length, language, content rating)
- 2.2 Questions are optional; user can skip all and still receive recommendations
- 2.3 System uses answers to adjust/filter recommendations
- 2.4 User can change answers before final submission without restarting
- 2.5 If user provides no description but answers questions, system still generates recommendations

---

### User Story 3 – Recommendations List & Explanations
**As a user, I want to see a concise list of recommended movies or shows, with a clear explanation of why each was recommended.**

**Acceptance Criteria**
- 3.1 System returns list of 5–10 recommendations per query
- 3.2 Each card includes: Title, Type (movie/series), Year, Poster, "Why this?" explanation
- 3.3 "Why this?" references at least one of: user's description, preference answers, known attributes
- 3.4 If no recommendations found, show friendly "no results" state with suggestions
- 3.5 Recommendations sorted by relevance (best match first)

---

### User Story 4 – Where to Watch
**As a user, I want to see where each recommended title is available to watch so that I can quickly start watching.**

**Acceptance Criteria**
- 4.1 Each card shows available platforms (Netflix, Hulu, Prime, Disney+, etc.) where title can be watched
- 4.2 For each platform, indicates availability type (subscription, rent, buy, free with ads)
- 4.3 Clicking/tapping platform link opens the service to the title's page
- 4.4 If availability data unavailable, UI clearly indicates "Availability info not available"
- 4.5 System can localize availability based on user's region

---

### User Story 5 – Brief, Spoiler‑Free Description
**As a user, I want a short, spoiler‑free description of each recommended title so I can understand what it's about without having the plot spoiled.**

**Acceptance Criteria**
- 5.1 Each recommendation includes brief synopsis (1–3 sentences, up to ~300 characters)
- 5.2 Synopsis avoids major plot twists, endings, and late-season reveals
- 5.3 System uses vetted source or spoiler-filtering logic
- 5.4 If synopsis unavailable, display "Description not available" rather than leaving blank
- 5.5 Description clearly indicates whether title is movie or series

---

### User Story 6 – Watch the Trailer
**As a user, I want to watch a trailer for a recommended title directly from the app so that I can quickly gauge whether I'm interested.**

**Acceptance Criteria**
- 6.1 If trailer available, each card shows "Watch Trailer" button or icon
- 6.2 Tapping "Watch Trailer" either plays inline or opens video player (e.g., YouTube)
- 6.3 If no trailer available, button is hidden or disabled with "Trailer not available"
- 6.4 Trailer playback includes controls: play/pause, mute/unmute, close
- 6.5 Trailers are region-appropriate when possible

---

## Content Safety Requirement

⚠️ **CRITICAL:** The system must **NOT** recommend unrated or X‑rated content. Adult/explicit content must be filtered out based on catalog flags and ratings.

---

## Future Features (Out of Scope for v1)

- Save/bookmark titles to a watchlist
- Regenerate or refine recommendations with advanced controls
- View search history and revisit past recommendation sessions