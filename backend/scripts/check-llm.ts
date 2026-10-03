import 'dotenv/config'
import { llmClient } from '../src/clients/llm.js'

async function checkLLM(): Promise<void> {
  if (!llmClient.isEnabled()) {
    console.error('[LLM check] No supported provider is configured. See GITHUB_MODELS_SETUP.md for migration steps.')
    process.exitCode = 1
    return
  }

  const prompt = 'Like Inception but more relaxing'
  const preferences = await llmClient.parsePreferences(prompt)
  if (!preferences) {
    console.error('[LLM check] Preference parsing failed. Check provider credentials, model access, endpoint, quota, and network.')
    process.exitCode = 1
    return
  }
  console.log('[LLM check] Preference parsing succeeded.')

  const explanations = await llmClient.generateWhyThisBatch(prompt, [{
    title: 'Eternal Sunshine of the Spotless Mind',
    genre: 'Sci-Fi, Romance, Drama',
    plot: 'An estranged couple undergoes a procedure to erase memories of their relationship.',
    genreScore: 0.7,
    moodScore: 0.7,
    compositeScore: 0.8
  }])
  if (explanations.size === 0) {
    console.error('[LLM check] No explanation returned. Check provider logs and model support for JSON output.')
    process.exitCode = 1
    return
  }
  console.log('[LLM check] Explanation generation succeeded. Both LLM paths are working.')
}

void checkLLM().catch(() => {
  console.error('[LLM check] Unexpected failure; verify the provider configuration locally.')
  process.exitCode = 1
})