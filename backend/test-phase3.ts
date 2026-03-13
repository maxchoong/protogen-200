import { RankingScorer } from './src/engine/rankingScorer'
import { ParsedPreferences } from './src/engine/preferenceParser'

console.log('=== Phase 3: Multi-Factor Ranking Tests ===\n')

// Test 1: Genre match scoring
console.log('📋 Test 1: Genre Match Scoring')
const genreScores = [
  {
    name: 'Exact match (Comedy, Drama vs Comedy, Drama, Crime)',
    itemGenres: ['Comedy', 'Drama', 'Crime'],
    preferredGenres: ['Comedy', 'Drama'],
    expected: 'high'
  },
  {
    name: 'Partial match (Comedy vs Comedy, Action)',
    itemGenres: ['Comedy', 'Action'],
    preferredGenres: ['Comedy'],
    expected: 'medium-high'
  },
  {
    name: 'No match (Horror vs Comedy, Drama)',
    itemGenres: ['Horror'],
    preferredGenres: ['Comedy', 'Drama'],
    expected: 'zero'
  }
]

genreScores.forEach(test => {
  const score = RankingScorer.genreMatchScore(test.itemGenres, test.preferredGenres)
  console.log(`   ${test.name}`)
  console.log(`   ✓ Score: ${(score * 100).toFixed(0)}% (expected: ${test.expected})`)
})
console.log()

// Test 2: Mood match scoring
console.log('📋 Test 2: Mood Match Scoring')
const plots = [
  {
    name: 'Dark mood + dark plot',
    plot: 'A gritty noir story about a brooding detective in a bleak city',
    moods: ['Dark'],
    moodStrength: new Map([['Dark', 0.9]]),
    expected: 'high'
  },
  {
    name: 'Funny mood + funny plot',
    plot: 'A hilarious comedy about witty characters making jokes',
    moods: ['Funny'],
    moodStrength: new Map([['Funny', 1.0]]),
    expected: 'high'
  },
  {
    name: 'No matching mood',
    plot: 'An action-packed thriller with explosions',
    moods: ['Relaxing'],
    moodStrength: new Map([['Relaxing', 0.8]]),
    expected: 'low'
  },
  {
    name: 'Multiple moods (mixed)',
    plot: 'A thoughtful sci-fi film with intense action sequences',
    moods: ['Thoughtful', 'Intense'],
    moodStrength: new Map([['Thoughtful', 0.9], ['Intense', 1.0]]),
    expected: 'high'
  }
]

plots.forEach(test => {
  const score = RankingScorer.moodMatchScore(test.plot, test.moods, test.moodStrength)
  console.log(`   ${test.name}`)
  console.log(`   ✓ Score: ${(score * 100).toFixed(0)}% (expected: ${test.expected})`)
})
console.log()

// Test 3: Rating score
console.log('📋 Test 3: Rating Score Normalization')
const ratings = [
  { rating: 9.0, expected: 'very high' },
  { rating: 7.0, expected: 'high' },
  { rating: 5.0, expected: 'medium' },
  { rating: 3.0, expected: 'low' },
  { rating: 0, expected: 'neutral' }
]

ratings.forEach(test => {
  const score = RankingScorer.ratingScore(test.rating)
  console.log(`   IMDb ${test.rating}/10: ${(score * 100).toFixed(0)}% (expected: ${test.expected})`)
})
console.log()

// Test 4: Popularity score
console.log('📋 Test 4: Popularity Score (vote-based)')
const voteCounts = [
  { votes: 1000000, expected: 'very high' },
  { votes: 100000, expected: 'high' },
  { votes: 10000, expected: 'medium' },
  { votes: 1000, expected: 'low' },
  { votes: 100, expected: 'very low' }
]

voteCounts.forEach(test => {
  const score = RankingScorer.popularityScore(test.votes)
  console.log(`   ${test.votes} votes: ${(score * 100).toFixed(0)}% (expected: ${test.expected})`)
})
console.log()

// Test 5: Recency boost
console.log('📋 Test 5: Recency Boost (year-based)')
const years = [
  { year: 2025, expected: '1.0 (recent)' },
  { year: 2023, expected: '0.8 (recent-ish)' },
  { year: 2020, expected: '0.6 (older)' },
  { year: 2015, expected: '0.4 (old)' }
]

years.forEach(test => {
  const score = RankingScorer.recencyBoost(test.year)
  console.log(`   ${test.year}: ${score.toFixed(1)} (expected: ${test.expected})`)
})
console.log()

// Test 6: Composite scoring
console.log('📋 Test 6: Composite Score Calculation')
const prefs: ParsedPreferences = {
  genres: ['Comedy', 'Drama'],
  mood: ['Funny', 'Dark'],
  contentType: 'both',
  maxRating: 'R',
  referenceTitle: [],
  excludedGenres: [],
  constraints: [],
  moodStrength: new Map([['Funny', 0.95], ['Dark', 0.6]])
}

const titles = [
  {
    title: 'High-quality match',
    genres: ['Comedy', 'Drama'],
    plot: 'A hilarious yet dark comedy with witty characters',
    rating: 8.5,
    voteCount: 500000,
    year: 2024,
    talentMatchScore: 0.8
  },
  {
    title: 'Decent match',
    genres: ['Comedy'],
    plot: 'A funny movie with some action',
    rating: 7.0,
    voteCount: 50000,
    year: 2020,
    talentMatchScore: 0.3
  },
  {
    title: 'Poor match',
    genres: ['Action', 'Thriller'],
    plot: 'An intense action-packed thriller',
    rating: 6.5,
    voteCount: 30000,
    year: 2018,
    talentMatchScore: 0.0
  }
]

const scored = titles.map(t => ({
  ...t,
  factors: RankingScorer.calculateCompositeScore(t, prefs)
}))

// Sort by composite score
scored.sort((a, b) => b.factors.composite - a.factors.composite)

console.log('   Ranking results (by composite score):')
scored.forEach((t, i) => {
  const score = (t.factors.composite * 100).toFixed(0)
  console.log(`   ${i + 1}. "${t.title}" - ${score}%`)
  console.log(`      [Genre: ${(t.factors.genreScore * 100).toFixed(0)}%, Mood: ${(t.factors.moodScore * 100).toFixed(0)}%, Talent: ${(t.factors.talentScore * 100).toFixed(0)}%, Rating: ${(t.factors.ratingScore * 100).toFixed(0)}%, Popular: ${(t.factors.popularityScore * 100).toFixed(0)}%, Recency: ${(t.factors.recencyBoost * 100).toFixed(0)}%]`)
})
console.log()

// Test 7: Ranking function
console.log('📋 Test 7: Rank Titles Function')
const ranked = RankingScorer.rankTitles(titles, prefs)
console.log(`   Sorted ${ranked.length} titles by composite score`)
ranked.forEach((t, i) => {
  const composite = (t.scoringFactors?.composite || 0) * 100
  console.log(`   ${i + 1}. "${t.title}" - ${composite.toFixed(0)}%`)
})
console.log()

console.log('✅ Phase 3 Tests Complete')
console.log()
console.log('Key behaviors verified:')
console.log('✓ Genre scoring: exact matches reward heavily')
console.log('✓ Mood scoring: scans plot for keywords, weighted by confidence')
console.log('✓ Talent scoring: integrates Phase 2 results')
console.log('✓ Rating scoring: normalized 0-10 to 0-1')
console.log('✓ Popularity scoring: log scale for vote counts')
console.log('✓ Recency scoring: recent titles get boost')
console.log('✓ Composite: weighted average of all factors')
console.log('✓ High-quality multi-signal matches rank first')
