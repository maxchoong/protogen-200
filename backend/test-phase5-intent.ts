import { PreferenceParser } from './src/engine/preferenceParser'
import { RankingScorer } from './src/engine/rankingScorer'

console.log('=== Phase 5: Intent Classification & Mode-Aware Ranking Tests ===\n')

// ============= TEST 1: Intent Classification Detection =============
console.log('📋 Test 1: Intent Classification Detection')

const testCases = [
  {
    description: 'Something funny with Tom Cruise',
    expectedMode: 'talent',
    label: 'Talent + Mood'
  },
  {
    description: 'Like Ocean\'s Eleven but funnier',
    expectedMode: 'reference',
    label: 'Reference + Mood'
  },
  {
    description: 'A cozy lazy Sunday vibe movie',
    expectedMode: 'mood',
    label: 'Mood + Situation'
  },
  {
    description: 'Tom Hanks movies like Cast Away',
    expectedMode: 'talent',
    label: 'Mixed: Talent prioritized over reference'
  },
  {
    description: 'Something relaxing',
    expectedMode: 'mood',
    label: 'Mood only'
  }
]

testCases.forEach((test, i) => {
  const parsed = PreferenceParser.parse({ description: test.description })
  const mode = parsed.discoveryMode
  const confidence = (parsed.intentConfidence ?? 0) * 100
  const passed = mode === test.expectedMode
  
  console.log(`   ${i + 1}. "${test.description}"`)
  console.log(`      ✓ Mode: ${mode} (confidence: ${confidence.toFixed(0)}%)`)
  console.log(`      Expected: ${test.expectedMode} (${test.label})`)
  if (!passed) {
    console.log(`      ⚠️ MISMATCH - got ${mode}, expected ${test.expectedMode}`)
  }
  console.log()
})

// ============= TEST 2: Actor Extraction =============
console.log('📋 Test 2: Actor Extraction')

const actorTests = [
  { description: 'with Ryan Gosling and Emma Stone', expectedCount: 2, names: ['Ryan Gosling', 'Emma Stone'] },
  { description: 'starring Tom Hanks', expectedCount: 1, names: ['Tom Hanks'] },
  { description: 'cast: Meryl Streep, Denzel Washington', expectedCount: 2, names: ['Meryl Streep', 'Denzel Washington'] }
]

actorTests.forEach((test, i) => {
  const parsed = PreferenceParser.parse({ description: test.description })
  const actors = parsed.detectedActors ?? []
  const passed = actors.length === test.expectedCount
  
  console.log(`   ${i + 1}. "${test.description}"`)
  console.log(`      Detected: ${actors.join(', ') || '(none)'}`)
  console.log(`      Expected count: ${test.expectedCount}, Got: ${actors.length}`)
  if (!passed) {
    console.log(`      ⚠️ COUNT MISMATCH`)
  }
  console.log()
})

// ============= TEST 3: Mode-Specific Weighting =============
console.log('📋 Test 3: Mode-Specific Weight Profiles')

const modes: Array<'mood' | 'reference' | 'talent' | 'mixed'> = ['mood', 'reference', 'talent', 'mixed']

modes.forEach(mode => {
  const config = RankingScorer.getWeightsForMode(mode)
  const weights = config.weights
  
  console.log(`   ${mode.toUpperCase()}:`)
  console.log(`      Genre: ${(weights.genre * 100).toFixed(0)}%`)
  console.log(`      Mood: ${(weights.mood * 100).toFixed(0)}%`)
  console.log(`      Talent: ${(weights.talent * 100).toFixed(0)}%`)
  console.log(`      Rating: ${(weights.rating * 100).toFixed(0)}%`)
  console.log(`      Popularity: ${(weights.popularity * 100).toFixed(0)}%`)
  console.log(`      Recency: ${(weights.recency * 100).toFixed(0)}%`)
  
  // Verify sum is 1.0
  const sum = Object.values(weights).reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 1.0) > 0.01) {
    console.log(`      ⚠️ Weights don't sum to 1.0: ${sum.toFixed(2)}`)
  }
  console.log()
})

// ============= TEST 4: Intent Signals =============
console.log('📋 Test 4: Intent Signal Detection')

const signalTests = [
  {
    description: 'funny with Ryan Gosling like Drive',
    checkFn: (signals: any) => signals.foundActorNames && signals.foundReferenceTitle && signals.hasMoodDescriptors,
    label: 'Multiple signals should trigger mixed/conflict'
  },
  {
    description: 'Sunday cozy relaxing',
    checkFn: (signals: any) => signals.hasMoodDescriptors && signals.hasSituationDescriptors,
    label: 'Mood + Situation signals'
  }
]

signalTests.forEach((test, i) => {
  const parsed = PreferenceParser.parse({ description: test.description })
  const signals = parsed.intentSignals
  const passed = signals && test.checkFn(signals)
  
  console.log(`   ${i + 1}. "${test.description}" (${test.label})`)
  if (signals) {
    console.log(`      Signals: ${JSON.stringify(signals)}`)
  }
  console.log(`      Result: ${passed ? '✓ PASS' : '✗ FAIL'}`)
  console.log()
})

console.log('✅ Phase 5 Intent Classification & Ranking Tests Complete\n')
