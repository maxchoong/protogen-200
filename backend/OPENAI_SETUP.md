# OpenAI Setup (Legacy Note)

This project previously documented direct OpenAI API setup, but the active implementation now uses GitHub Models for LLM features.

## Current Source of Truth

Use:
- `backend/GITHUB_MODELS_SETUP.md`
- `backend/.env.example`

Key environment variables in active use:

```env
GITHUB_TOKEN=...
GITHUB_MODEL=gpt-4o-mini
```

## Why this file exists

It is retained for historical context and to avoid broken references from older notes.

If you need direct OpenAI support in the future, add it as a separate implementation path and document it in a new file rather than reusing outdated instructions.
