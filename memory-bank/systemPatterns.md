# System Patterns – Architecture & Design Patterns

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React + TypeScript)                               │
│ - Home Page (input + preferences)                           │
│ - Results Page (recommendations)                            │
│ - Trailer Modal                                             │
└─────────────┬───────────────────────────────────────────────┘
              │ HTTP POST /recommendations
              ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend API (Node.js/TypeScript)                            │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Recommendation Engine                                 │   │
│ │ 1. Parse user input (via LLM)                         │   │
│ │ 2. Query catalog (TMDB)                               │   │
│ │ 3. Filter (adult/unrated/X)                           │   │
│ │ 4. Rank by relevance                                  │   │
│ │ 5. Fetch availability (JustWatch or fallback)         │   │
│ │ 6. Generate explanations (LLM)                        │   │
│ │ 7. Shape response + cache results                     │   │
│ └───────────────────────────────────────────────────────┘   │
└──────────┬───────────────┬──────────────┬───────────────────┘
           ↓               ↓              ↓
     ┌──────────┐    ┌────────┐    ┌──────────┐
     │   TMDB   │    │  LLM   │    │JustWatch/│
     │   API    │    │Provider│    │Fallback  │
     └──────────┘    └────────┘    └──────────┘
```

---

## Module Organization

### Backend Modules

**1. RecommendationEngine** (core orchestration)
- `parseUserPreferences(description, preferences)` → structured JSON
- `fetchCandidateTitles(parsedPrefs, region)` → array of Title objects
- `filterAndRank(titles)` → top 5–10 ranked titles
- `enrichRecommendations(titles)` → fetch availability, synopsis, trailers
- `generateExplanations(titles, userPrefs)` → "Why this?" text per title

**2. CatalogClient** (TMDB integration)
- `discoverTitles(genres, type, rating)` → array of Title objects
- `searchTitles(query)` → search results
- `getTitle(id)` → full Title metadata
- `getVideos(id)` → videos/trailers for title
- Query builder for filters, pagination

**3. LLMClient** (language model integration)
- `parsePreferences(description, preferences)` → JSON structure
- `generateWhyThis(userPrefs, titleMetadata)` → explanation string
- `generateSynopsis(catalogSynopsis, titleMetadata)` → short synopsis
- Error handling + fallbacks
- Rate limiting, timeouts, retry logic

**4. AvailabilityClient** (where to watch)
- `fetchAvailability(titleId, region)` → array of platforms
- Fallback: `generateSearchLink(title)` → generic search URL
- Error handling

**5. CacheLayer** (performance)
- In-memory or Redis cache
- Keys: `title:{id}`, `synopsis:{id}`, `availability:{id}:{region}`
- TTL strategy

---

## Frontend Components

### Pages

**1. HomePage**
- Input section (textarea, character limit, validation)
- Preferences panel (collapsible)
- "Get recommendations" button
- Submission logic + loading state

**2. ResultsPage**
- Query summary at top
- Edit buttons (Re-enter description / Edit preferences)
- Recommendation card grid/list
- Loading + empty states

### Components

**RecommendationCard**
- Poster image + fallback
- Title, year, type
- Synopsis (truncated if needed)
- "Why this?" explanation
- Availability chips (platforms + type)
- "Watch trailer" button

**PreferencesPanel**
- Genre multi-select chips
- Mood multi-select chips
- Type selector (segmented control or radio)
- Rating control (dropdown or slider)
- All optional, no required validation

**TrailerModal**
- YouTube embed (or generic video player)
- Full-screen on mobile
- Play/pause, mute controls
- Close button

---

## Data Flow Patterns

### Request Processing Pipeline

1. **Frontend** sends `POST /recommendations` with description + preferences
2. **Backend validates** request body
3. **LLM parses** user input → structured JSON (genres, mood, type, constraints)
4. **CatalogClient queries** TMDB with parsed preferences
5. **Filter & rank** candidates:
   - Remove adult, unrated, X-rated titles
   - Score by genre match, mood, popularity
   - Select top 5–10
6. **Parallel fetch** for each title:
   - Availability from JustWatch
   - Trailers from TMDB
   - Fetch or generate spoiler-free synopsis (LLM)
7. **Batch LLM calls** to generate "Why this?" for all results
8. **Shape response** and **cache** results
9. **Frontend receives** `RecommendationResult[]` and renders

---

## Content Safety Pattern

**Filter Strategy:**
- Every title from catalog checked for:
  - `adult === true` → exclude
  - `rating` in ['Unrated', 'X', 'NC-17'] → exclude
- Filter applied at three steps:
  1. During catalog query (filtering by rating_max)
  2. During filtering phase (removing any remaining unsafe titles)
  3. Unit tests verify no unsafe titles leak through

**Fallback/Guardrail:**
- If LLM-generated content (synopsis, explanation) contains spoilers or inappropriate material:
  - Use catalog's default synopsis
  - Fall back to template-based explanation

---

## Error Handling Patterns

### LLM Integration
- **Timeout:** 5–10 second timeout; fallback to rule-based parsing
- **Parse error:** Fallback to rule-based preferences extraction
- **Rate limit:** Batch calls within rate limits; queue if needed

### Catalog Integration
- **API error:** Return 500 with friendly message; log details
- **No results:** Return empty array + "Maybe try different preferences" message
- **Timeout:** Fallback to cached data if available

### Availability Integration
- **API unavailable:** Omit availability info or show generic search links
- **Missing data:** Show "Where to watch: info not available"

### Frontend
- **API error:** Global error banner with retry button
- **Loading:** Skeleton cards or spinner
- **Empty:** Friendly message + "Refine your search" suggestions

---

## Caching Strategy

### What to Cache
1. **Title metadata** (by ID): posters, synopsis, trailers → TTL: 1 week
2. **LLM-generated synopsis** (by ID): to reduce LLM cost → TTL: 2 weeks
3. **Recommendation results** (by query hash): common queries → TTL: 6–12 hours
4. **Availability data** (by title + region): location-specific → TTL: 24 hours

### Cache Invalidation
- Manual invalidation for bug fixes
- TTL-based expiration
- Optional: invalidate on catalog updates

---

## Performance Optimization

### Parallelization
- Fetch availability, trailers, and synopsis in parallel for each title
- Batch LLM calls (e.g., generate 10 "Why this?" explanations in one call)
- Database queries in parallel when possible

### Response Time Target
- **Goal:** < 2–3 seconds for typical recommendation request
- Optimization levers:
  - Cache hot paths (common queries, popular titles)
  - Parallelize external calls
  - Pre-fetch trailers/availability for top candidates
  - Rate-limit/timeout LLM calls

---

## Scalability Considerations

- **Stateless backend:** No persistent user state → scales horizontally
- **Caching layer:** Reduce external API calls → cost and latency
- **Queuing (optional):** For high-load scenarios, queue LLM calls
- **CDN for posters:** Serve poster images via CDN for performance
- **Rate limiting:** Respect catalog and LLM provider rate limits