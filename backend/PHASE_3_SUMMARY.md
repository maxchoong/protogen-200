# Phase 3 Complete: LLM Integration (GitHub Models)

**Date Completed:** February 2026  
**Status:** Complete

---

## Summary

Phase 3 integrated LLM capabilities into the recommendation pipeline using the OpenAI SDK pointed at GitHub Models (`gpt-4o-mini`). The backend supports enhanced preference parsing and personalized "Why this?" explanations with graceful fallback to rule-based behavior when no token is configured.

---

## What Was Implemented

### LLM Client
- File: `backend/src/clients/llm.ts`
- Uses:
  - `GITHUB_TOKEN`
  - `GITHUB_MODEL` (default `gpt-4o-mini`)
  - base URL `https://models.inference.ai.azure.com`
- Features:
  - Natural language preference parsing
  - Single and batch explanation generation
  - Spoiler-safe synopsis helper (implemented but not required in current v1 response flow)
  - In-memory caching with per-feature TTL
  - Timeouts and retries

### Recommendation Engine Integration
- File: `backend/src/engine/recommendationEngine.ts`
- Added hybrid approach:
  1. Parse with rule-based parser
  2. Optionally merge LLM-derived preferences
  3. Generate explanations in batch when LLM is enabled
  4. Fall back to template explanations on LLM failure

### Config and Environment
- `.env.example` includes:
  - `GITHUB_TOKEN`
  - `GITHUB_MODEL`
- Setup guide: `backend/GITHUB_MODELS_SETUP.md`

---

## Runtime Modes

### With GitHub token
- LLM-enhanced parsing
- LLM-generated explanation text
- Rule-based fallback remains available on individual failures

### Without GitHub token
- Full app still works
- Rule-based parsing and template explanations only
- No hard dependency on LLM availability

---

## Verification

Completed during implementation and subsequent review:
- Backend handles both token-enabled and token-disabled startup paths
- Recommendation endpoint continues returning results in fallback mode
- LLM batch explanation flow is integrated and non-blocking

---

## Notes

- This project does not use direct OpenAI API billing for its active LLM path.
- GitHub Models is the canonical integration for v1.
- Any OpenAI-specific setup docs should be treated as legacy unless explicitly needed.
