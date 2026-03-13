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
- OMDb API for catalog metadata and plots
- GitHub Models `gpt-4o-mini` for preference parsing and recommendation explanations
- Streaming Availability API via RapidAPI for watch-platform availability
- TMDB for trailer lookup when configured

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
- Search OMDb and normalize title metadata
- Apply content-safety filtering
- Rank and shape recommendations
- Enrich results with availability and trailers when optional APIs are configured

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
2. Parse preferences from explicit controls and free text.
3. Optionally merge LLM-derived preferences and keywords.
4. Search OMDb using extracted search terms.
5. Convert OMDb records into internal recommendation candidates.
6. Filter unsafe content.
7. Rank by genre fit and rating.
8. Generate "Why this?" explanations using LLM batch mode or fallback templates.
9. Fetch availability using IMDb ID and lowercase country code.
10. Fetch trailers using TMDB when `TMDB_API_KEY` is available.

---

## Service Integration Notes

### OMDb
- Base URL: `http://www.omdbapi.com`
- Development key: `trilogy`
- Used for title search and detailed metadata lookup

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
- Used only for trailer lookup
- Optional in local/dev environments
- Missing key should not break the recommendation flow

---

## Constraints and Trade-Offs

- No persistent user storage in v1.
- Availability and trailer data are optional enrichments, not hard dependencies.
- Spoiler-safe synopsis generation exists in code but is not part of the active v1 response contract.
- Frontend linting is currently not configured even though build succeeds.
- Content safety relies on metadata filtering and may still need broader test coverage.