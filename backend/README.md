# Film & TV Advisor Backend

## Optional LLM Setup

GitHub Models was retired on July 30, 2026. Configure `OPENAI_API_KEY` and
optionally `LLM_MODEL`, or `LLM_API_KEY` + `LLM_BASE_URL` + `LLM_MODEL` for a
compatible provider. See [migration and setup instructions](GITHUB_MODELS_SETUP.md).
Run `npm run check:llm` to verify parsing and explanation generation after
configuring credentials locally. The app uses rule-based fallbacks without them.

## Development

Install dependencies:
\`\`\`bash
npm install
\`\`\`

Run in development mode:
\`\`\`bash
npm run dev
\`\`\`

Build:
\`\`\`bash
npm run build
\`\`\`

Start production server:
\`\`\`bash
npm start
\`\`\`

## API Endpoints

### POST /recommendations
Request body:
\`\`\`json
{
  "description": "I want a cozy romance on a rainy day",
  "preferences": {
    "genres": ["romance", "drama"],
    "mood": ["cozy", "romantic"],
    "type": "movie",
    "maxRating": "PG-13"
  }
}
\`\`\`

Response:
\`\`\`json
{
  "success": true,
  "recommendations": [...]
}
\`\`\`
