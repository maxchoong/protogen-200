# GitHub Models Setup Guide

## Current Setup: Migrate Away From GitHub Models

GitHub Models was retired on July 30, 2026. Its inference API is no longer
available. GitHub Copilot is a separate service and cannot supply this app's
model requests. Rotating a GitHub token will not restore the retired API.

Official notice: https://docs.github.com/en/github-models/quickstart

The backend now supports OpenAI or an OpenAI-compatible Chat Completions API.
No provider has been purchased or credential changed automatically.

### OpenAI

1. Create an API key at https://platform.openai.com/api-keys and configure API
   billing/model access. API usage is billed separately from ChatGPT and Copilot.
2. Enter the key directly in your local `backend/.env`, never in chat or git:

```env
OPENAI_API_KEY=your_provider_key
LLM_MODEL=gpt-4o-mini
```

Keep any other existing local API settings. `GITHUB_TOKEN` and `GITHUB_MODEL`
are no longer used by this LLM client. The default base URL is
`https://api.openai.com/v1`. Leave `LLM_API_KEY` and `LLM_BASE_URL` unset for
this configuration.

### Another Compatible Provider

#### Gemini Free Tier

Keep your Google AI Studio project on the free tier and enter its key privately
in local `backend/.env`:

```env
LLM_API_KEY=your_gemini_api_key
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
LLM_MODEL=gemini-3.5-flash-lite
```

This uses Google's documented OpenAI-compatible endpoint, not the native
Interactions REST endpoint. The native SDK's `GEMINI_API_KEY` setting is not
automatically read by this client; use `LLM_API_KEY` here.

On October 2, 2026, this model passed both live smoke-check paths. The earlier
`gemini-2.5-flash-lite` setting returned 404 on generation despite appearing in
the model catalog. Google notes that 2.5 model access is limited for new
projects; use a currently supported model rather than treating catalog presence
as proof of access. Model availability and free quotas may change.

References: https://ai.google.dev/gemini-api/docs/openai and
https://ai.google.dev/gemini-api/docs/deprecations.

#### Other Providers

Set the provider-specific key, base URL, and model together in local `backend/.env`:

```env
LLM_API_KEY=your_provider_key
LLM_BASE_URL=https://provider.example/v1
LLM_MODEL=your_provider_model
```

`LLM_API_KEY` takes precedence over `OPENAI_API_KEY`. Use only an endpoint you
trust: this key and viewing requests will be sent there. The selected model
must support Chat Completions, JSON-object responses, `temperature`, and
`max_tokens`. Azure endpoints requiring a different authentication scheme or
deployment-specific API version need additional integration; they are not
automatically supported by setting these variables.

### Verify and Restart

From the workspace root:

```bash
npm --prefix backend run check:llm
```

This sends two small provider requests and may incur usage charges. It reports
success only after both preference parsing and explanation generation return
usable responses; merely configuring a key does not prove connectivity.

Stop the existing backend in its terminal with Ctrl+C, then restart:

```bash
npm --prefix backend run dev
```

For deployment, set the same variables in the backend host's secret settings
and redeploy/restart. Do not expose provider keys through frontend `VITE_*`
variables. Without a supported provider key, the app keeps rule-based parsing
and template explanations, and no requests are made to the retired service.

### Troubleshooting

- `401`/`403`: verify the new provider key, permissions, and model access.
- `404`: verify the API base path and model identifier.
- `429`: inspect provider quota/rate limits and billing.
- Connection errors: inspect DNS, TLS trust, firewall, or proxy settings. Do
  not disable TLS verification to work around them.
- JSON-output errors: select a model supporting the required request options.

## Historical Instructions (Obsolete, Do Not Follow)

The original GitHub Models configuration below is retained for historical
context only. Its endpoints, token advice, models, pricing, and limits are no
longer valid setup instructions.

## Overview

Phase 3 uses **GitHub Models** - a free AI service that provides access to GPT-4o-mini and other models at no cost!

**Free Tier Benefits:**
- ✅ **150 requests/day** on low-tier models (GPT-4o-mini, Llama, Mistral, Phi)
- ✅ **50 requests/day** on high-tier models
- ✅ OpenAI-compatible API (easy integration)
- ✅ No credit card required
- ✅ Perfect for development & production

---

## Quick Setup (2 minutes)

### Step 1: Create GitHub Personal Access Token

1. Go to https://github.com/settings/tokens?type=beta
2. Click **"Generate new token"** (fine-grained token)
3. Give it a name: `Film Advisor Dev`
4. Set expiration: 90 days (or longer)
5. Under **"Account permissions"**:
   - Find **"GitHub Copilot"**
   - Set to **"Read-only"**
   - (This grants access to GitHub Models)
6. Click **"Generate token"**
7. **Copy the token** (starts with `github_pat_`)

⚠️ **Important:** Save the token immediately - you won't be able to see it again!

### Step 2: Configure Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` and add your token:
```env
GITHUB_TOKEN=github_pat_11XXXXXXXXXXXXX_YYYYYYYYYYYYYYYYYY
GITHUB_MODEL=gpt-4o-mini
```

### Step 3: Restart Backend

```bash
npm run build
npm start
```

You should see:
```
✅ GitHub Models LLM Client initialized (gpt-4o-mini)
📊 Free tier: 150 requests/day
```

---

## Available Models

GitHub Models provides access to several high-quality models:

### Recommended for Film Advisor

**GPT-4o-mini** (default)
- Fast, high-quality responses
- Best for natural language understanding
- 150 requests/day free
- Perfect for preference parsing and explanations

**Alternative Models:**
- `Llama-3.1-8B` - Fast, open-source model
- `Phi-3-medium-4k` - Lightweight, efficient
- `Mistral-7B` - Good balance of speed/quality

To change models, update `GITHUB_MODEL` in `.env`:
```env
GITHUB_MODEL=Llama-3.1-8B
```

---

## Testing Your Setup

### Test 1: Basic Request

```bash
curl -X POST http://localhost:3000/recommendations \
  -H "Content-Type: application/json" \
  -d '{"description": "cozy mystery series like Only Murders in the Building"}'
```

**With GitHub Models enabled, you should see:**
- `[Engine] LLM enhanced: +X keywords`
- Personalized "Why this?" explanations
- Better understanding of complex queries

### Test 2: Check Logs

The backend logs will show:
```
[LLM] Parsing preferences with GPT-4o-mini...
[LLM] Parsed: 2 genres, 4 keywords
[Engine] Generated 10 LLM explanations
```

---

## Rate Limits & Usage

### Free Tier Limits

| Model Tier | Requests/Min | Requests/Day | Tokens/Request |
|------------|--------------|--------------|----------------|
| Low (GPT-4o-mini) | 15 | 150 | 8000 in, 4000 out |
| High (GPT-4) | 10 | 50 | 8000 in, 4000 out |

### Usage Estimation for Film Advisor

**Per recommendation request:**
- Preference parsing: ~1 API call
- Batch explanations: ~1 API call
- **Total: 2 API calls per user query**

**Daily capacity:**
- 150 requests/day ÷ 2 = **75 user queries/day**
- Perfect for development and small production deployments

### Monitoring Usage

Check your usage at:
https://github.com/marketplace/models

Or in the backend logs:
```
[LLM] Using cached preference parsing  # Cache hit = no API call!
```

---

## Cost Analysis

### GitHub Models (Current Setup)

| Users/Day | Queries/Day | API Calls | Cost |
|-----------|-------------|-----------|------|
| 10 | 20 | 40 | **FREE** |
| 25 | 50 | 100 | **FREE** |
| 37 | 75 | 150 | **FREE** |

**Cost:** $0/month 🎉

### When to Upgrade

If you exceed 75 queries/day, consider:
1. **Increase caching** - Already reduces usage by 60-80%
2. **GitHub Copilot Pro** - Higher limits ($10/month)
3. **Paid GitHub Models** - Production-grade limits

---

## Caching Strategy

Our implementation includes aggressive caching to maximize your free tier:

**Cache TTLs:**
- Preference parsing: 1 hour
- Explanations: 2 hours
- Synopses: 24 hours

**Cache hit rates:**
- ~60-80% for common queries
- Significantly reduces API calls
- Faster responses for users

**Example:**
```
Query 1: "romantic comedy" → 2 API calls
Query 2: "romantic comedy" (same day) → 0 API calls (cached!)
```

---

## Troubleshooting

### "GITHUB_TOKEN not set" Warning

**Problem:** Token not configured
**Solution:** 
```bash
cd backend
echo "GITHUB_TOKEN=github_pat_your_token" >> .env
npm restart
```

### "Invalid token" Error

**Problem:** Token doesn't have correct permissions
**Solution:**
1. Go to https://github.com/settings/tokens
2. Find your token
3. Edit permissions
4. Enable "GitHub Copilot" (Read-only)
5. Save changes

### "Rate limit exceeded" Error

**Problem:** Used all 150 requests today
**Solution:**
- Limits reset at 00:00 UTC
- Check cache hit rate (should be 60-80%)
- Consider adding more caching
- App still works with rule-based fallback!

### No LLM Enhancements

**Problem:** Token set but no LLM features
**Solution:**
```bash
# Check if backend sees the token
npm start | grep "GitHub Models"

# Should show:
✅ GitHub Models LLM Client initialized (gpt-4o-mini)
```

---

## Security Best Practices

✅ **DO:**
- Store token in `.env` file (not committed to git)
- Use fine-grained tokens with minimal permissions
- Set expiration dates (90 days recommended)
- Rotate tokens regularly

❌ **DON'T:**
- Commit `.env` to version control
- Share tokens in chat/email
- Use classic tokens (use fine-grained)
- Give unnecessary permissions

---

## Comparison: GitHub Models vs OpenAI

| Feature | GitHub Models | OpenAI |
|---------|---------------|--------|
| **Cost** | FREE (150/day) | ~$9/month for 1000 users |
| **Setup** | GitHub token | Credit card required |
| **Quality** | Same models | Same models |
| **Limits** | 150 req/day | Pay as you go |
| **Best for** | Dev + small prod | Large scale |

**Verdict:** GitHub Models is perfect for this project! 🎉

---

## Available Models Catalog

Browse all models at:
- https://github.com/marketplace/models

**Popular choices:**
- `gpt-4o-mini` - Best general purpose (default)
- `Llama-3.1-8B-Instruct` - Fast open-source
- `Phi-3-medium-4k` - Efficient & lightweight
- `Mistral-7B-Instruct` - Good quality

---

## Migration Guide (From OpenAI)

If you previously set up OpenAI:

**Old config:**
```env
OPENAI_API_KEY=sk-proj-xxx
OPENAI_MODEL=gpt-4o-mini
```

**New config:**
```env
GITHUB_TOKEN=github_pat_xxx
GITHUB_MODEL=gpt-4o-mini
```

No code changes needed - just update your `.env` file!

---

## Next Steps

1. ✅ Create GitHub token
2. ✅ Add to `.env`
3. ✅ Restart backend
4. 🎬 Test with real queries!

Example test:
```bash
curl -X POST http://localhost:3000/recommendations \
  -H "Content-Type: application/json" \
  -d '{"description": "mind-bending sci-fi like Inception"}'
```

You should see personalized, intelligent recommendations! ✨

---

## Support

- **GitHub Models docs:** https://docs.github.com/en/github-models
- **Model playground:** https://github.com/marketplace/models
- **API reference:** https://docs.github.com/en/rest/models

For issues with this project, check [main README](../README.md) or [memory bank](../memory-bank/).
