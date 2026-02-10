# Film & TV Advisor Backend

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
