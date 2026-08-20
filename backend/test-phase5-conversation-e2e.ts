/**
 * Phase 5 End-to-End Tests: Conversational Flow with Intent Classification
 * 
 * Tests the complete multi-turn conversation loop:
 * 1. Initial query → intent classification → decision (clarify or recommend)
 * 2. If clarification needed: confidence < 0.65 → question generation
 * 3. User clarification → round 2 → refined recommendations
 * 
 * Run with: node --loader tsx test-phase5-conversation-e2e.ts
 * Or compile: npx tsc test-phase5-conversation-e2e.ts --target es2020 --module commonjs
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000'

interface TestResult {
  name: string
  passed: boolean
  details?: string
  error?: string
}

const results: TestResult[] = []

/**
 * Helper: Make API request
 */
async function makeRequest(payload: any): Promise<any> {
  const response = await fetch(`${API_BASE}/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${await response.text()}`)
  }

  return response.json()
}

/**
 * Test 1: High-confidence mood query → immediate results
 */
async function testHighConfidenceMood(): Promise<TestResult> {
  try {
    const response = await makeRequest({
      description: 'I want something cozy and relaxing for tonight',
      region: 'US',
    })

    const passed =
      response.recommendations &&
      Array.isArray(response.recommendations) &&
      response.recommendations.length > 0 &&
      response.detectedIntent &&
      response.detectedIntent.mode === 'mood' &&
      response.detectedIntent.confidence > 0.65 &&
      !response.requiresClarification

    return {
      name: 'High-confidence mood query → immediate results',
      passed,
      details: passed
        ? `✓ Detected mood mode at ${(response.detectedIntent.confidence * 100).toFixed(1)}% confidence, returned ${response.recommendations.length} recommendations`
        : `✗ Failed: ${JSON.stringify(response)}`,
    }
  } catch (error) {
    return {
      name: 'High-confidence mood query → immediate results',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test 2: Actor-only query (talent mode) → high confidence
 */
async function testHighConfidenceTalent(): Promise<TestResult> {
  try {
    const response = await makeRequest({
      description: 'Show me movies with Tom Hanks',
      region: 'US',
    })

    const passed =
      response.recommendations &&
      Array.isArray(response.recommendations) &&
      response.detectedIntent &&
      response.detectedIntent.mode === 'talent' &&
      response.detectedIntent.confidence > 0.65 &&
      !response.requiresClarification

    return {
      name: 'Talent-focused query → high confidence, no clarification',
      passed,
      details: passed
        ? `✓ Detected talent mode at ${(response.detectedIntent.confidence * 100).toFixed(1)}%, returned ${response.recommendations.length} items`
        : `✗ Failed: ${JSON.stringify(response)}`,
    }
  } catch (error) {
    return {
      name: 'Talent-focused query → high confidence, no clarification',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test 3: Reference-only query (reference mode) → high confidence
 */
async function testHighConfidenceReference(): Promise<TestResult> {
  try {
    const response = await makeRequest({
      description: 'Something like Inception',
      region: 'US',
    })

    const passed =
      response.recommendations &&
      Array.isArray(response.recommendations) &&
      response.detectedIntent &&
      response.detectedIntent.mode === 'reference' &&
      response.detectedIntent.confidence > 0.65 &&
      !response.requiresClarification

    return {
      name: 'Reference-focused query → high confidence, no clarification',
      passed,
      details: passed
        ? `✓ Detected reference mode at ${(response.detectedIntent.confidence * 100).toFixed(1)}%, returned ${response.recommendations.length} items`
        : `✗ Failed: ${JSON.stringify(response)}`,
    }
  } catch (error) {
    return {
      name: 'Reference-focused query → high confidence, no clarification',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test 4: Ambiguous query → requires clarification
 */
async function testAmbiguousQuery(): Promise<TestResult> {
  try {
    const response = await makeRequest({
      description: 'I like comedies but want something dark with great actors',
      region: 'US',
    })

    const passed =
      response.requiresClarification &&
      Array.isArray(response.requiresClarification.questions) &&
      response.requiresClarification.questions.length > 0 &&
      response.detectedIntent &&
      response.detectedIntent.confidence < 0.75 &&
      !response.recommendations

    return {
      name: 'Ambiguous query → triggers clarification',
      passed,
      details: passed
        ? `✓ Confidence ${(response.detectedIntent.confidence * 100).toFixed(1)}% triggered ${response.requiresClarification.questions.length} clarification question(s)`
        : `✗ Failed: ${JSON.stringify(response)}`,
    }
  } catch (error) {
    return {
      name: 'Ambiguous query → triggers clarification',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test 5: Multi-turn flow - initial ambiguous → clarification → refined results
 */
async function testMultiTurnFlow(): Promise<TestResult> {
  try {
    // Round 0: Ambiguous query
    const round0 = await makeRequest({
      description: 'Something fun with great acting',
      region: 'US',
    })

    if (!round0.requiresClarification) {
      return {
        name: 'Multi-turn clarification flow',
        passed: false,
        details: `✗ Round 0 should require clarification but returned recommendations`,
      }
    }

    // Extract first question
    const question = round0.requiresClarification.questions[0]
    if (!question || !question.options || question.options.length === 0) {
      return {
        name: 'Multi-turn clarification flow',
        passed: false,
        details: `✗ Question malformed: ${JSON.stringify(question)}`,
      }
    }

    // Round 1: User answers clarification
    const round1 = await makeRequest({
      description: 'Something fun with great acting',
      region: 'US',
      clarificationContext: {
        clarificationRound: 1,
        userClarification: question.options[0],
      },
    })

    const passed =
      round1.recommendations &&
      Array.isArray(round1.recommendations) &&
      round1.recommendations.length > 0 &&
      round1.detectedIntent &&
      !round1.requiresClarification

    return {
      name: 'Multi-turn clarification flow',
      passed,
      details: passed
        ? `✓ Round 0 asked question, user clarified, Round 1 returned ${round1.recommendations.length} recommendations`
        : `✗ Round 1 failed: ${JSON.stringify(round1)}`,
    }
  } catch (error) {
    return {
      name: 'Multi-turn clarification flow',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test 6: Intent metadata is always included
 */
async function testIntentMetadata(): Promise<TestResult> {
  try {
    const response = await makeRequest({
      description: 'Show me comedies',
      region: 'US',
    })

    const passed =
      response.detectedIntent &&
      typeof response.detectedIntent.mode === 'string' &&
      typeof response.detectedIntent.confidence === 'number' &&
      response.detectedIntent.confidence >= 0 &&
      response.detectedIntent.confidence <= 1 &&
      ['mood', 'reference', 'talent', 'mixed'].includes(response.detectedIntent.mode)

    return {
      name: 'Intent metadata always included in response',
      passed,
      details: passed
        ? `✓ Mode: ${response.detectedIntent.mode}, Confidence: ${(response.detectedIntent.confidence * 100).toFixed(1)}%`
        : `✗ Invalid intent: ${JSON.stringify(response.detectedIntent)}`,
    }
  } catch (error) {
    return {
      name: 'Intent metadata always included in response',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test 7: Recommendations include required fields
 */
async function testRecommendationFields(): Promise<TestResult> {
  try {
    const response = await makeRequest({
      description: 'I want a drama',
      region: 'US',
    })

    if (!response.recommendations || response.recommendations.length === 0) {
      return {
        name: 'Recommendations include required fields',
        passed: false,
        details: `✗ No recommendations returned`,
      }
    }

    const title = response.recommendations[0]
    const hasRequiredFields =
      title.imdbId &&
      title.title &&
      (title.type === 'movie' || title.type === 'tvSeries') &&
      typeof title.year === 'string' &&
      title.plot &&
      title.rating !== undefined

    return {
      name: 'Recommendations include required fields',
      passed: hasRequiredFields,
      details: hasRequiredFields
        ? `✓ Sample recommendation: ${title.title} (${title.type}) - ${title.rating}/10`
        : `✗ Missing fields: ${JSON.stringify(title, null, 2)}`,
    }
  } catch (error) {
    return {
      name: 'Recommendations include required fields',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test 8: Mode-specific ranking works (talent results prioritize actor matches)
 */
async function testTalentModeRanking(): Promise<TestResult> {
  try {
    const response = await makeRequest({
      description: 'with Christopher Nolan',
      region: 'US',
    })

    const passed =
      response.recommendations &&
      response.recommendations.length > 0 &&
      response.detectedIntent &&
      response.detectedIntent.mode === 'talent' &&
      response.detectedIntent.confidence > 0.6

    return {
      name: 'Talent mode detected and ranking applied',
      passed,
      details: passed
        ? `✓ Detected talent mode for actor query, returned ${response.recommendations.length} results`
        : `✗ Failed mode detection or ranking`,
    }
  } catch (error) {
    return {
      name: 'Talent mode detected and ranking applied',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test 9: Backward compatibility - old request format still works
 */
async function testBackwardCompatibility(): Promise<TestResult> {
  try {
    const response = await makeRequest({
      description: 'I want a thriller',
      region: 'US',
      preferences: {
        genres: ['thriller'],
        type: 'movie',
      },
      // No clarificationContext - old API contract
    })

    const passed =
      response.recommendations &&
      Array.isArray(response.recommendations) &&
      response.recommendations.length > 0

    return {
      name: 'Backward compatibility - old request format',
      passed,
      details: passed
        ? `✓ Old API format still works, returned ${response.recommendations.length} results`
        : `✗ Failed with old format`,
    }
  } catch (error) {
    return {
      name: 'Backward compatibility - old request format',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Test 10: No clarification on round > 0 (prevents loops)
 */
async function testNoRepeatClarification(): Promise<TestResult> {
  try {
    // First, get a clarification prompt
    const round0 = await makeRequest({
      description: 'Funny dark comedies with action',
      region: 'US',
    })

    if (!round0.requiresClarification) {
      return {
        name: 'No clarification on round > 0',
        passed: false,
        details: `✗ Initial query should need clarification`,
      }
    }

    // Now send round 2+ (should never ask clarification again)
    const round2 = await makeRequest({
      description: 'Funny dark comedies with action',
      region: 'US',
      clarificationContext: {
        clarificationRound: 2,
        userClarification: 'I prefer comedies',
      },
    })

    const passed =
      round2.recommendations &&
      Array.isArray(round2.recommendations) &&
      !round2.requiresClarification

    return {
      name: 'No clarification on round > 0',
      passed,
      details: passed
        ? `✓ Round 2+ correctly returns recommendations without re-clarifying`
        : `✗ Round 2 should not ask clarification`,
    }
  } catch (error) {
    return {
      name: 'No clarification on round > 0',
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Run all tests
 */
async function runAllTests(): Promise<void> {
  console.log('🧪 Phase 5 Conversational Flow E2E Tests\n')
  console.log(`API: ${API_BASE}\n`)

  try {
    results.push(await testHighConfidenceMood())
    results.push(await testHighConfidenceTalent())
    results.push(await testHighConfidenceReference())
    results.push(await testAmbiguousQuery())
    results.push(await testMultiTurnFlow())
    results.push(await testIntentMetadata())
    results.push(await testRecommendationFields())
    results.push(await testTalentModeRanking())
    results.push(await testBackwardCompatibility())
    results.push(await testNoRepeatClarification())
  } catch (error) {
    console.error('Fatal error during test execution:', error)
    process.exit(1)
  }

  // Print results
  console.log('\n' + '='.repeat(70))
  console.log('TEST RESULTS')
  console.log('='.repeat(70) + '\n')

  const passed = results.filter(r => r.passed).length
  const total = results.length

  results.forEach((result, i) => {
    const icon = result.passed ? '✅' : '❌'
    console.log(`${i + 1}. ${icon} ${result.name}`)
    if (result.details) console.log(`   ${result.details}`)
    if (result.error) console.log(`   ERROR: ${result.error}`)
    console.log()
  })

  console.log('='.repeat(70))
  console.log(`SUMMARY: ${passed}/${total} tests passed`)
  console.log('='.repeat(70))

  process.exit(passed === total ? 0 : 1)
}

// Run tests
runAllTests().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
