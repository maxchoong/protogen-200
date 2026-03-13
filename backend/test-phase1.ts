import { PreferenceParser, RecommendationRequest } from './src/engine/preferenceParser'

// Test cases for Phase 1
const testCases: Array<{ name: string; description: string }> = [
  {
    name: 'Reference Title Detection',
    description: 'funny heist movie like Ocean\'s Eleven'
  },
  {
    name: 'Mood Confidence Scoring',
    description: 'very funny light comedy but kinda dark'
  },
  {
    name: 'Excluded Genres',
    description: 'sci-fi but no horror, nothing too intense'
  },
  {
    name: 'Complex Query',
    description: 'slow-burn thoughtful sci-fi similar to The Leftovers, no action-heavy stuff, dark but intellectual'
  },
  {
    name: 'Simple Query',
    description: 'something to make me laugh'
  }
]

console.log('=== Phase 1: Enhanced Preference Parsing Tests ===\n')

for (const testCase of testCases) {
  console.log(`📋 Test: ${testCase.name}`)
  console.log(`   Input: "${testCase.description}"`)
  
  const request: RecommendationRequest = {
    description: testCase.description
  }
  
  const parsed = PreferenceParser.parse(request)
  
  console.log(`   ✓ Genres: ${parsed.genres.join(', ') || '(none)'}`)
  
  if (parsed.excludedGenres && parsed.excludedGenres.length > 0) {
    console.log(`   🚫 Excluded: ${parsed.excludedGenres.join(', ')}`)
  }
  
  if (parsed.referenceTitle && parsed.referenceTitle.length > 0) {
    console.log(`   📚 References: ${parsed.referenceTitle.join(', ')}`)
  }
  
  if (parsed.mood && parsed.mood.length > 0) {
    const moodBreakdown = parsed.mood.map(m => {
      const strength = parsed.moodStrength?.get(m) ?? 0
      return `${m} (${(strength * 100).toFixed(0)}%)`
    }).join(', ')
    console.log(`   🎭 Mood: ${moodBreakdown}`)
  }
  
  if (parsed.constraints && parsed.constraints.length > 0) {
    console.log(`   🔧 Constraints: ${parsed.constraints.join(', ')}`)
  }
  
  console.log(`   📊 Full Explain: ${PreferenceParser.explain(parsed)}`)
  console.log()
}
