# Phase 4 Setup: Availability and Trailers

## Overview

Phase 4 adds optional enrichment features to recommendations:
- Streaming availability links (RapidAPI Streaming Availability)
- Trailer links (TMDB)

The recommendation flow still works when these keys are missing.

---

## Required vs Optional Keys

### Required for core recommendations
- `OMDB_API_KEY` (development often uses `trilogy`)

### Optional for enrichment
- `RAPIDAPI_KEY` for streaming availability
- `TMDB_API_KEY` for trailer links

### Optional for AI enhancements
- `GITHUB_TOKEN`
- `GITHUB_MODEL` (default `gpt-4o-mini`)

---

## RapidAPI Setup (Availability)

1. Create/sign in to RapidAPI.
2. Subscribe to Streaming Availability (Basic free plan).
3. Copy the `X-RapidAPI-Key` value.
4. Add it to `backend/.env`:

```env
RAPIDAPI_KEY=your_rapidapi_key_here
```

### Integration details used by this codebase
- Host: `streaming-availability.p.rapidapi.com`
- Endpoint: `GET /shows/{imdbId}`
- Query params:
  - `country`
  - `output_language=en`
  - `series_granularity=show`
- Parser reads `streamingOptions[country]`

If this key is missing, availability arrays are empty and the frontend shows:
"Availability info not available."

---

## TMDB Setup (Trailers)

1. Create/sign in to TMDB.
2. Generate an API key.
3. Add it to `backend/.env`:

```env
TMDB_API_KEY=your_tmdb_api_key_here
```

If this key is missing, trailer URLs are omitted and trailer controls are hidden in the UI.

---

## Restart and Verify

```bash
cd backend
npm run build
npm start
```

Quick checks:

```bash
curl -s -X POST http://localhost:3000/recommendations \
  -H "Content-Type: application/json" \
  -d '{"description":"Inception-like sci-fi thriller","region":"US"}' | jq '.success, (.recommendations | length)'
```

Availability spot-check:

```bash
curl -s -X POST http://localhost:3000/recommendations \
  -H "Content-Type: application/json" \
  -d '{"description":"Inception-like sci-fi thriller","region":"US"}' \
  | jq -c '.recommendations[] | select(.title=="Inception") | {title, availability: .availability[0:3], trailerUrl}'
```

---

## Expected Behavior by Configuration

1. No optional keys:
   - recommendations still return
   - no availability
   - no trailers
2. RapidAPI only:
   - availability data appears
   - trailers remain missing
3. TMDB only:
   - trailers may appear
   - availability remains empty
4. RapidAPI + TMDB:
   - both enrichments appear when data exists upstream

---

## Troubleshooting

- 401 from RapidAPI: invalid/missing `RAPIDAPI_KEY`
- 401 from TMDB: invalid/missing `TMDB_API_KEY`
- Empty availability for a title: provider has no data for that title/region
- Empty trailer URL: TMDB has no matching trailer for that title/type
