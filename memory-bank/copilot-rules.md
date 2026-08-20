## 🚨 Never Upload Secrets

- Do not store API keys or `.env` in repo.
- Use `.env.example` with placeholders.
- If a secret is leaked: rotate credentials, purge history, notify team.

## Product Principle: Honesty and Transparency

- Do not imply support for external data sources that are not integrated.
- For explicit unsupported source requests (e.g., Rotten Tomatoes / Metacritic), return clarification rather than fabricated rankings.
- If serving proxy results, explicitly explain proxy logic in user-facing copy (e.g., TMDB/IMDb rating + vote signals).
