import { TalentMatcher } from './src/engine/talentMatcher'

console.log('=== Phase 2: Cast/Director Similarity Matching Tests ===\n')

// Test 1: Extract talent from titles
console.log('📋 Test 1: Extract Talent Data')
const oceans11 = {
  title: 'Ocean\'s Eleven',
  actors: 'George Clooney, Brad Pitt, Matt Damon, Don Cheadle',
  director: 'Steven Soderbergh'
}

const heist1 = {
  title: 'Ocean\'s Twelve',
  actors: 'George Clooney, Brad Pitt, Matt Damon, Don Cheadle',
  director: 'Steven Soderbergh'
}

const heist2 = {
  title: 'Ocean\'s Thirteen',
  actors: 'George Clooney, Brad Pitt, Matt Damon, Al Pacino',
  director: 'Steven Soderbergh'
}

const differentMovie = {
  title: 'The Italian Job',
  actors: 'Mark Wahlberg, Charlize Theron, Edward Norton',
  director: 'F. Gary Gray'
}

const talent1 = TalentMatcher.extractTalent(oceans11)
console.log(`   "${oceans11.title}"`)
console.log(`   ✓ Actors: ${talent1.actors.join(', ')}`)
console.log(`   ✓ Director: ${talent1.director.join(', ')}`)
console.log()

// Test 2: Find talent match - high similarity
console.log('📋 Test 2: Talent Match - High Similarity')
const matchResult1 = TalentMatcher.findTalentMatch(heist1, [oceans11])
console.log(`   Candidate: "${heist1.title}"`)
console.log(`   Reference: "${oceans11.title}"`)
console.log(`   ✓ Actor Overlap: ${(matchResult1.actorOverlap * 100).toFixed(0)}%`)
console.log(`   ✓ Director Match: ${matchResult1.directorMatch}`)
console.log(`   ✓ Combined Score: ${(matchResult1.combinedScore * 100).toFixed(0)}%`)
console.log()

// Test 3: Find talent match - partial similarity
console.log('📋 Test 3: Talent Match - Partial Similarity')
const matchResult2 = TalentMatcher.findTalentMatch(heist2, [oceans11])
console.log(`   Candidate: "${heist2.title}"`)
console.log(`   Reference: "${oceans11.title}"`)
console.log(`   ✓ Actor Overlap: ${(matchResult2.actorOverlap * 100).toFixed(0)}%`)
console.log(`   ✓ Director Match: ${matchResult2.directorMatch}`)
console.log(`   ✓ Combined Score: ${(matchResult2.combinedScore * 100).toFixed(0)}%`)
console.log()

// Test 4: Find talent match - low similarity
console.log('📋 Test 4: Talent Match - Low Similarity')
const matchResult3 = TalentMatcher.findTalentMatch(differentMovie, [oceans11])
console.log(`   Candidate: "${differentMovie.title}"`)
console.log(`   Reference: "${oceans11.title}"`)
console.log(`   ✓ Actor Overlap: ${(matchResult3.actorOverlap * 100).toFixed(0)}%`)
console.log(`   ✓ Director Match: ${matchResult3.directorMatch}`)
console.log(`   ✓ Combined Score: ${(matchResult3.combinedScore * 100).toFixed(0)}%`)
console.log()

// Test 5: Multiple references
console.log('📋 Test 5: Multiple References')
const matchResult4 = TalentMatcher.findTalentMatch(heist2, [oceans11, differentMovie])
console.log(`   Candidate: "${heist2.title}"`)
console.log(`   References: "${oceans11.title}", "${differentMovie.title}"`)
console.log(`   ✓ Actor Overlap: ${(matchResult4.actorOverlap * 100).toFixed(0)}%`)
console.log(`   ✓ Director Match: ${matchResult4.directorMatch}`)
console.log(`   ✓ Combined Score: ${(matchResult4.combinedScore * 100).toFixed(0)}%`)
console.log()

// Test 6: Caching
console.log('📋 Test 6: Talent Caching')
const testTitle = { title: 'Test', actors: 'Actor A, Actor B', director: 'Director X' }
const talentData = TalentMatcher.extractTalent(testTitle)
TalentMatcher.cacheTalent('test-123', talentData)
console.log(`   ✓ Cached talent for test-123`)

const cached = TalentMatcher.getCachedTalent('test-123')
console.log(`   ✓ Retrieved from cache: ${cached?.actors.join(', ')}`)
console.log(`   ✓ Cache size: ${TalentMatcher.getCacheSize()} entries`)
TalentMatcher.clearCache()
console.log(`   ✓ Cache cleared: ${TalentMatcher.getCacheSize()} entries`)
console.log()

console.log('✅ Phase 2 Tests Complete')
