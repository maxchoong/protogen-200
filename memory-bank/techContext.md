# Tech Context – Architecture & Implementation

## Stack

### Frontend
- React 18
- TypeScript
- Vite 5
- Tailwind CSS

### Backend
- Node.js 20
- Express 4
- TypeScript 5

### External Services
- TMDB for discovery, details enrichment, credits, trailers, and IMDb mapping
- OMDb/FMDb path for search/details fallback and metadata compatibility
- GitHub Models `gpt-4o-mini` for preference parsing and recommendation explanations (optional)
- Streaming Availability API via RapidAPI for watch-platform availability

---

## Runtime Architecture

### Frontend Responsibilities
- Collect user description and optional preferences
- Allow submission with description, preferences, or both
- Infer `region` from `navigator.language`
- Send `POST /recommendations` to backend
- Render recommendation cards, availability links, and trailer modal

### Backend Responsibilities
- Validate request shape and input rules
- Parse preferences with rule-based logic and optional LLM enhancement
- Retrieve candidate titles using TMDB and/or OMDb strategies
- Apply content-safety filtering
- Rank and shape recommendations
- Enrich results with availability and trailers when optional APIs are configured
- Attach applied constraints and interpretation notes for transparent conversational responses

---

## API Design

### `POST /recommendations`

**Request**
```json
{
  "description": "Inception-like sci-fi thriller",
  "preferences": {
    "genres": ["Sci-Fi", "Thriller"],
    "mood": ["Intense"],
    "type": "movie",
    "maxRating": "PG-13"
  },
  "region": "US"
}
```

**Validation Rules**
- Request is invalid if description is empty and no preferences are selected.
- If description is present, it must be at least 3 characters.
- Preferences-only flow is valid.

**Response**
```json
{
  "success": true,
  "appliedConstraints": ["year:2020", "ranking:critic_proxy"],
  "interpretationNote": "Interpreting critics favourites using TMDB/IMDb rating and vote signals.",
  "recommendations": [
    {
      "id": "tt1375666",
      "title": "Inception",
      "year": "2010",
      "type": "movie",
      "synopsis": "A thief who steals corporate secrets through dream-sharing technology...",
      "posterUrl": "https://...",
      "whyThis": "Matches your sci-fi thriller request with a highly rated, mind-bending premise.",
      "availability": [
        {
          "platform": "Apple TV",
          "type": "rent",
          "link": "https://..."
        }
      ],
      "trailerUrl": "https://www.youtube.com/watch?v=...",
      "score": 8.8
    }
  ]
}
```

---

## Recommendation Pipeline

1. Validate request body.
2. Parse preferences from explicit controls and free text (including follow-up context).
3. Detect refinement modes (e.g., mainstream paging, critics proxy, genre aliases).
4. Retrieve candidates from TMDB and/or OMDb depending on intent and provider availability.
5. Normalize and enrich candidates (runtime, genres, language, cast/director where available).
6. Filter unsafe content.
7. Rank with mode-aware scoring and hard constraints (year, genre, proxy quality floors).
8. Generate "Why this?" explanations using LLM batch mode or fallback templates.
9. Fetch availability using IMDb ID and lowercase country code.
10. Fetch trailers using TMDB when possible.
11. Return recommendations with `appliedConstraints`, intent metadata, diagnostics, and optional `interpretationNote`.

---

## Service Integration Notes

### TMDB
- Used for year-based discovery, popularity retrieval, enrichment details, credits, and trailers.
- Also used for IMDb-to-TMDB mapping and richer metadata hydration.

### OMDb / FMDb path
- Provides additional search/detail fallback and compatibility fields.
- Supports recommendation continuity where TMDB is unavailable or sparse.

### GitHub Models
- Base URL: `https://models.inference.ai.azure.com`
- Model: `gpt-4o-mini`
- Used for:
  - enhanced preference parsing
  - batch recommendation explanations
- Fallback mode keeps the app usable without a token

### Streaming Availability
- Host: `streaming-availability.p.rapidapi.com`
- Verified endpoint: `GET /shows/{imdbId}`
- Query params include `country`, `output_language`, and `series_granularity`
- Response is read from `streamingOptions[country]`

### TMDB
- Core retrieval and enrichment path for multiple recommendation modes
- Missing key or failures should degrade gracefully to other available signals

## Transparency and Honesty Policy (Implemented)

- Critics-style prompts are treated as proxy intent using available rating/vote signals.
- Explicit external critic-source requests (e.g., Rotten Tomatoes, Metacritic) trigger clarification rather than fabricated source claims.
- Responses can include `interpretationNote` to explain proxy assumptions to the user.

---

## Constraints and Trade-Offs

- No persistent user storage in v1.
- Availability and trailer data are optional enrichments, not hard dependencies.
- Spoiler-safe synopsis generation exists in code but is not part of the active v1 response contract.
- Frontend linting is currently not configured even though build succeeds.
- Content safety relies on metadata filtering and may still need broader test coverage.