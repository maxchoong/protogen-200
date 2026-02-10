# Tech Context – Architecture & Implementation

## System Architecture

### Components

**1. Client (Web App)**
- React + TypeScript SPA
- Responsive layout (mobile-first)
- Uses shadcn/ui + Tailwind CSS
- Calls backend `POST /recommendations`

**2. Backend API**
- Node.js/TypeScript (Express, Fastify, or Next.js API routes)
- Endpoints:
  - `POST /recommendations`: main endpoint
  - Optional: `GET /title/:id` for future detail views
- Orchestrates: LLM calls, catalog API, availability API
- Applies rating and adult-content filters

**3. Recommendation Engine (Backend Module)**
- Parses user description and preferences
- Builds queries to external catalog
- Filters and ranks candidate titles
- Generates "Why this?" and spoiler-free synopses (via LLM)

**4. External Integrations**
- **Catalog:** TMDB (metadata, posters, trailers, ratings)
- **Availability:** JustWatch or similar (if free tier available; otherwise fallback)
- **LLM:** Free-tier LLM (OpenAI or open-source) for parsing, explanations, synopsis generation

**5. Storage & Caching**
- No user database (no accounts)
- Simple caching layer (in-memory or Redis) for:
  - Title metadata by ID
  - LLM-generated synopsis per title
  - Cached recommendation results for common queries

---

## Data Model

### Title
```
- id
- name
- type (movie | series)
- year
- genres (list)
- tags (mood/themes if available)
- runtime or episode_count
- rating (e.g., PG‑13, TV‑MA)
- is_adult or adult flag
- poster_url
- catalog_synopsis
- popularity_score / vote_average
- trailer_url or trailer_video_id
```

### Availability
```
- title_id
- region (e.g., US, UK)
- platforms: list of { name, availability_type, deeplink_url }
```

### RecommendationResult (API response)
```
- id
- name
- year
- type
- poster_url
- synopsis_short
- why_this
- availability (list of platforms)
- trailer_url
```

---

## Backend API Design

### POST /recommendations

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
- 400 for invalid input (no description and no preferences)
- 500 for upstream failures (catalog/LLM); return friendly message and log details

---

## LLM Integration Strategy

### Input Parsing

**LLM Prompt:** Request structured JSON with:
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

**Fallback:** Rule-based parsing if LLM fails.

### "Why this?" Explanation

- LLM generates 1–2 sentences explaining why title matches user's preferences
- No spoilers; must reference at least one user preference
- Fallback: template-based explanation using metadata

### Spoiler-Free Synopsis

1. Retrieve catalog synopsis
2. If short and clearly non-spoilery, use as-is
3. Else: Ask LLM to summarize in 1–3 sentences (premise only, no twists/endings), enforce 300–400 char limit
4. Optional heuristic: Check for spoiler phrases; re-generate if needed
5. **Cache `synopsis_short` per title** to reduce cost/latency

---

## Catalog Query & Filtering Pipeline

1. **Build query** from structured preferences:
   - Map genres to catalog genre IDs
   - Filter by type (movie/series)
   - Filter by rating: exclude unrated and X, use `adult` flag

2. **Fetch candidates** using catalog's discover/search APIs

3. **Filter:**
   - Drop all `adult = true` titles
   - Drop unrated and X-rated content

4. **Rank** by scoring:
   - Genre match
   - Mood/keyword match
   - Similarity to reference titles (if any)
   - Popularity/ratings

5. **Select top 5–10** results

---

## Performance & Security

### Performance

- **Target response time:** < 2–3 seconds typical
- **Caching:**
  - Title metadata by ID
  - LLM outputs (synopsis, "why this")
- **Parallelization:**
  - Catalog calls
  - Availability calls
  - LLM calls (within rate limits)

### Security & Privacy

- No accounts; no persistent PII
- Do not log full user descriptions long-term; truncate or anonymize
- Keep API keys server-side only
- **Enforce content filters:** no unrated/X/adult content

---

## Implementation Phases

1. **Skeleton MVP:** Basic frontend pages with mock data; backend stub
2. **Catalog integration:** Real data from TMDB; rating/adult filters
3. **LLM integration:** Parsing input; "Why this?" and synopsis generation
4. **Availability + polish:** Integrate availability API or fallback; UI polish, error handling, performance tuning