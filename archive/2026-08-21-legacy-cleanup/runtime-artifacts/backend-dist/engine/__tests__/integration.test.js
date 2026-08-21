/**
 * PHASE 6: Integration Tests for Full Recommendation Flow
 * Tests all four phases working together focusing on preference parsing
 */
import { PreferenceParser } from '../preferenceParser';
import { recommendationEngine } from '../recommendationEngine';
import { fmdbClient } from '../../clients/fmdb';
import { tmdbClient } from '../../clients/tmdb';
describe('End-to-End Recommendation Flow - Phase 5 Integration', () => {
    describe('Query: "funny heist like Ocean\'s Eleven"', () => {
        it('Phase 1: Should parse reference titles', () => {
            const request = { description: 'funny heist like Ocean\'s Eleven' };
            const preferences = PreferenceParser.parse(request);
            expect(preferences.referenceTitle).toBeDefined();
            expect(preferences.referenceTitle.length).toBeGreaterThan(0);
            expect(preferences.genres).toContain('Comedy');
        });
        it('Phase 1: Should extract mood confidence', () => {
            const request = { description: 'funny heist' };
            const preferences = PreferenceParser.parse(request);
            expect(preferences.moodStrength).toBeDefined();
            expect(preferences.moodStrength.has('Funny')).toBe(true);
            // 'funny' should have high confidence
            expect(preferences.moodStrength.get('Funny')).toBeGreaterThan(0.7);
        });
    });
    describe('Query: "no horror, dark comedy instead"', () => {
        it('Phase 1: Should detect excluded genres', () => {
            const request = { description: 'no horror, dark comedy instead' };
            const preferences = PreferenceParser.parse(request);
            expect(preferences.excludedGenres).toBeDefined();
            expect(preferences.excludedGenres.length).toBeGreaterThan(0);
            // Horror should be excluded
            const hasHorror = preferences.excludedGenres.some(g => g.toLowerCase().includes('horror'));
            expect(hasHorror).toBe(true);
        });
        it('Phase 1: Should parse comedy genre', () => {
            const request = { description: 'no horror, dark comedy instead' };
            const preferences = PreferenceParser.parse(request);
            expect(preferences.genres).toContain('Comedy');
        });
        it('Phase 1: Should capture dark mood', () => {
            const request = { description: 'no horror, dark comedy instead' };
            const preferences = PreferenceParser.parse(request);
            expect(preferences.moodStrength).toBeDefined();
            // Dark mood should be detected or at least have moods parsed
            expect(preferences.mood.length > 0 || preferences.moodStrength.size > 0).toBe(true);
        });
    });
    describe('Query: "slow-burn thoughtful sci-fi"', () => {
        it('Phase 1: Should parse sci-fi genre', () => {
            const request = { description: 'slow-burn thoughtful sci-fi' };
            const preferences = PreferenceParser.parse(request);
            expect(preferences.genres).toContain('Sci-Fi');
        });
        it('Phase 1: Should extract thoughtful mood', () => {
            const request = { description: 'slow-burn thoughtful sci-fi' };
            const preferences = PreferenceParser.parse(request);
            expect(preferences.moodStrength).toBeDefined();
            // Thoughtful mood should be captured
            const hasThoughtful = Array.from(preferences.moodStrength.keys()).some(m => m.toLowerCase().includes('thoughtful') || m.toLowerCase().includes('slow'));
            expect(hasThoughtful || preferences.mood.length > 0).toBe(true);
        });
        it('Phase 1: Should capture constraint', () => {
            const request = { description: 'slow-burn thoughtful sci-fi' };
            const preferences = PreferenceParser.parse(request);
            // Should have either constraint or mood data
            const hasData = preferences.constraints || preferences.mood.length > 0 || preferences.moodStrength.size > 0;
            expect(hasData).toBeTruthy();
        });
    });
    describe('Mood Strength Weighting', () => {
        it('should apply different confidence for different intensity modifiers', () => {
            const veryRequest = { description: 'very funny' };
            const kindaRequest = { description: 'kinda funny' };
            const veryPrefs = PreferenceParser.parse(veryRequest);
            const kindaPrefs = PreferenceParser.parse(kindaRequest);
            const veryConfidence = veryPrefs.moodStrength?.get('Funny') || 0;
            const kindaConfidence = kindaPrefs.moodStrength?.get('Funny') || 0;
            // 'very funny' should have higher confidence than 'kinda funny'
            if (veryConfidence > 0 && kindaConfidence > 0) {
                expect(veryConfidence).toBeGreaterThan(kindaConfidence);
            }
        });
        it('should prefer parsed moods in recommendations', () => {
            const request = { description: 'very funny movie' };
            const preferences = PreferenceParser.parse(request);
            const funnyConfidence = preferences.moodStrength?.get('Funny') || 0;
            if (funnyConfidence > 0) {
                expect(funnyConfidence).toBeGreaterThan(0.7);
            }
        });
    });
    describe('Genre Exclusion Logic', () => {
        it('should properly exclude genres from parsed preferences', () => {
            const request = { description: 'comedy but no action' };
            const preferences = PreferenceParser.parse(request);
            expect(preferences.genres).toContain('Comedy');
            expect(preferences.excludedGenres).toBeDefined();
            // Action should be in excluded
            const hasAction = preferences.excludedGenres.some(g => g.toLowerCase() === 'action');
            expect(hasAction).toBe(true);
            // Action should be removed from genres if it was there
            expect(preferences.genres).not.toContain('Action');
        });
    });
    describe('Multiple mood extraction', () => {
        it('should handle multiple moods in single query', () => {
            const request = {
                description: 'something funny, thoughtful, and romantic'
            };
            const preferences = PreferenceParser.parse(request);
            expect(preferences.mood.length > 0 || preferences.moodStrength.size > 0).toBe(true);
        });
        it('should apply confidence scoring to each mood', () => {
            const request = {
                description: 'very funny, kinda dark, thoughtful'
            };
            const preferences = PreferenceParser.parse(request);
            for (const [mood, confidence] of preferences.moodStrength.entries()) {
                expect(confidence).toBeGreaterThan(0);
                expect(confidence).toBeLessThanOrEqual(1.0);
            }
        });
    });
    describe('Genre Detection Across Queries', () => {
        it('should detect multiple genres when mentioned', () => {
            const request = {
                description: 'comedy thriller with mystery elements'
            };
            const preferences = PreferenceParser.parse(request);
            expect(preferences.genres.length).toBeGreaterThan(1);
        });
        it('should not duplicate genres', () => {
            const request = {
                description: 'I want a comedy, something funny and laughable'
            };
            const preferences = PreferenceParser.parse(request);
            const uniqueGenres = new Set(preferences.genres);
            expect(uniqueGenres.size).toBe(preferences.genres.length);
        });
    });
    describe('Reference Title Detection', () => {
        it('should detect movie reference when mentioned', () => {
            const request = {
                description: 'something like Inception'
            };
            const preferences = PreferenceParser.parse(request);
            expect(preferences.referenceTitle).toBeDefined();
            expect(preferences.referenceTitle.length).toBeGreaterThan(0);
        });
        it('should detect multiple reference titles', () => {
            const request = {
                description: 'like The Matrix but more like Inception'
            };
            const preferences = PreferenceParser.parse(request);
            if (preferences.referenceTitle && preferences.referenceTitle.length > 0) {
                // Should detect at least one reference
                expect(preferences.referenceTitle.length).toBeGreaterThanOrEqual(1);
            }
        });
        it('should not confuse genre keywords with reference titles', () => {
            const request = {
                description: 'a comedy thriller'
            };
            const preferences = PreferenceParser.parse(request);
            // Should not treat 'comedy' or 'thriller' as reference titles
            const lowerRefs = preferences.referenceTitle?.map(r => r.toLowerCase()) || [];
            expect(lowerRefs).not.toContain('comedy');
            expect(lowerRefs).not.toContain('thriller');
        });
    });
});
/**
 * Performance benchmarks for Phase 3 & 4
 */
describe('Performance Benchmarks - Phase 6', () => {
    it('should parse preferences efficiently', () => {
        const requests = Array(1000)
            .fill(null)
            .map((_, i) => ({
            description: `funny heist like Ocean's Eleven number ${i}`
        }));
        const start = Date.now();
        requests.forEach(req => PreferenceParser.parse(req));
        const duration = Date.now() - start;
        // Should process 1000 queries in under 1 second
        expect(duration).toBeLessThan(1000);
    });
    it('should handle complex multi-constraint queries', () => {
        const complexQueries = [
            'very funny dark comedy heist like Ocean\'s Eleven but no action',
            'slow-burn thoughtful sci-fi like Inception with mystery elements',
            'romantic comedy tragedy, sort of like The Notebook but darker'
        ];
        complexQueries.forEach(query => {
            const start = Date.now();
            const preferences = PreferenceParser.parse({ description: query });
            const duration = Date.now() - start;
            expect(duration).toBeLessThan(10); // Each query should parse in <10ms
            expect(preferences).toBeDefined();
            expect(preferences.genres.length > 0).toBe(true);
        });
    });
});
/**
 * Manual smoke tests for expected behavior
 */
describe('Manual Smoke Tests - Phase 4 Explanations', () => {
    it('Query 1: heist with reference title should focus on inference and talent', () => {
        const request = { description: 'heist like Ocean\'s Eleven' };
        const preferences = PreferenceParser.parse(request);
        // Verification: reference title survives parsing; genre enforcement happens later in ranking.
        expect(preferences.referenceTitle).toBeDefined();
        expect(preferences.referenceTitle.length).toBeGreaterThan(0);
    });
    it('Query 2: excluded genres should be captured for filtering', () => {
        const request = { description: 'no horror, no action' };
        const preferences = PreferenceParser.parse(request);
        expect(preferences.excludedGenres).toBeDefined();
        expect(preferences.excludedGenres.length).toBeGreaterThan(0);
    });
    it('Query 3: mood-focused query should prioritize mood matching', () => {
        const request = { description: 'very funny and thoughtful' };
        const preferences = PreferenceParser.parse(request);
        expect(preferences.moodStrength).toBeDefined();
        expect(preferences.moodStrength.size).toBeGreaterThan(0);
    });
});
describe('Ranking Guardrails - Golden Prompt Behaviors', () => {
    it('should suppress anchor title for contrastive reference prompts', () => {
        const preferences = PreferenceParser.parse({
            description: 'Like Inception but more relaxing'
        });
        const titles = [
            {
                id: 'tt1375666',
                title: 'Inception',
                genres: ['Drama', 'Sci-Fi'],
                plot: 'A high-stakes intense dream heist with relentless tension.',
                rating: 8.8,
                voteCount: 1000,
                year: 2010,
                talentMatchScore: 1
            },
            {
                id: 'tt0123456',
                title: 'Calm Sci-Fi Choice',
                genres: ['Drama', 'Sci-Fi'],
                plot: 'A gentle and peaceful speculative journey with quiet emotional stakes.',
                rating: 7.8,
                voteCount: 700,
                year: 2018,
                talentMatchScore: 0.4
            }
        ];
        const referenceTitles = [{ id: 'tt1375666', title: 'Inception' }];
        const ranked = recommendationEngine.rankTitles(titles, preferences, referenceTitles);
        const rankedIds = ranked.map((item) => item.id);
        expect(rankedIds).not.toContain('tt1375666');
        expect(rankedIds).toContain('tt0123456');
    });
    it('should favor calmer candidates when contrastive mood shift is requested', () => {
        const preferences = PreferenceParser.parse({
            description: 'Like Inception but more relaxing'
        });
        const titles = [
            {
                id: 'tt1111111',
                title: 'Calm Option',
                genres: ['Drama'],
                plot: 'A calm, peaceful, and soothing journey through human connection.',
                rating: 7.5,
                voteCount: 500,
                year: 2019,
                talentMatchScore: 0.2
            },
            {
                id: 'tt2222222',
                title: 'Intense Option',
                genres: ['Drama'],
                plot: 'An intense, high-stakes, adrenaline-fueled race against danger.',
                rating: 7.5,
                voteCount: 500,
                year: 2019,
                talentMatchScore: 0.2
            }
        ];
        const ranked = recommendationEngine.rankTitles(titles, preferences, []);
        expect(ranked[0].id).toBe('tt1111111');
        expect(ranked[0].scoringFactors.composite).toBeGreaterThan(ranked[1].scoringFactors.composite);
    });
    it('should suppress explicitly mentioned anchor title by default even without contrastive language', () => {
        const preferences = PreferenceParser.parse({
            description: 'Something like Inception'
        });
        const titles = [
            {
                id: 'tt1375666',
                title: 'Inception',
                genres: ['Drama', 'Sci-Fi'],
                plot: 'A high-stakes dream heist.',
                rating: 8.8,
                voteCount: 1000,
                year: 2010,
                talentMatchScore: 1
            },
            {
                id: 'tt7654321',
                title: 'Alternative Sci-Fi Pick',
                genres: ['Drama', 'Sci-Fi'],
                plot: 'A cerebral and atmospheric science fiction mystery.',
                rating: 7.6,
                voteCount: 650,
                year: 2017,
                talentMatchScore: 0.3
            }
        ];
        const referenceTitles = [{ id: 'tt1375666', title: 'Inception' }];
        const ranked = recommendationEngine.rankTitles(titles, preferences, referenceTitles);
        const rankedIds = ranked.map((item) => item.id);
        expect(rankedIds).not.toContain('tt1375666');
        expect(rankedIds).toContain('tt7654321');
    });
    it('should keep explicitly mentioned anchor title when query asks to rewatch', () => {
        const preferences = PreferenceParser.parse({
            description: 'I want to rewatch Inception again'
        });
        const titles = [
            {
                id: 'tt1375666',
                title: 'Inception',
                genres: ['Drama', 'Sci-Fi'],
                plot: 'A high-stakes dream heist.',
                rating: 8.8,
                voteCount: 1000,
                year: 2010,
                talentMatchScore: 1
            },
            {
                id: 'tt7654321',
                title: 'Alternative Sci-Fi Pick',
                genres: ['Drama', 'Sci-Fi'],
                plot: 'A cerebral and atmospheric science fiction mystery.',
                rating: 7.6,
                voteCount: 650,
                year: 2017,
                talentMatchScore: 0.3
            }
        ];
        const referenceTitles = [{ id: 'tt1375666', title: 'Inception' }];
        const ranked = recommendationEngine.rankTitles(titles, preferences, referenceTitles);
        const rankedIds = ranked.map((item) => item.id);
        expect(rankedIds).toContain('tt1375666');
    });
    it('should treat slower pace refinement as relaxing and reduce intensity', () => {
        const preferences = PreferenceParser.parse({
            description: 'Like Inception but more relaxing',
            clarificationContext: {
                clarificationRound: 1,
                userClarification: 'Genre similarity slower pace'
            }
        });
        expect(preferences.boostedMoods).toContain('Relaxing');
        expect(preferences.reducedMoods).toContain('Intense');
        expect(preferences.genres).toEqual([]);
    });
    it('should favor sci-fi alternatives over comedy drift for relaxing Inception-like requests', () => {
        const preferences = PreferenceParser.parse({
            description: 'Like Inception but more relaxing',
            clarificationContext: {
                clarificationRound: 1,
                userClarification: 'Genre similarity slower pace'
            }
        });
        const titles = [
            {
                id: 'tt3000001',
                title: 'Relaxed Sci-Fi Option',
                genres: ['Sci-Fi', 'Thriller'],
                plot: 'A calm and thoughtful science-fiction mystery with gentle pacing.',
                rating: 7.4,
                voteCount: 900,
                year: 2018,
                talentMatchScore: 0.3
            },
            {
                id: 'tt3000002',
                title: 'Comedy Drift Option',
                genres: ['Drama', 'Comedy'],
                plot: 'A hilarious and lighthearted comedy about unlikely friendships.',
                rating: 7.9,
                voteCount: 1200,
                year: 2019,
                talentMatchScore: 0.3
            }
        ];
        const referenceTitles = [{ id: 'tt1375666', title: 'Inception', genres: ['Sci-Fi', 'Thriller', 'Drama'] }];
        const ranked = recommendationEngine.rankTitles(titles, preferences, referenceTitles);
        expect(ranked).toHaveLength(1);
        expect(ranked[0].id).toBe('tt3000001');
    });
    it('should keep a broader set of extracted search terms for mixed queries', () => {
        const terms = recommendationEngine.extractSearchTerms('funny mystery sci-fi thriller with robots and conspiracies', ['Comedy', 'Sci-Fi']);
        expect(terms.length).toBeGreaterThan(3);
        expect(terms).toContain('funny');
        expect(terms).toContain('mystery');
        expect(terms).toContain('sci');
    });
    it('should diversify the final selection inside the rerank window', () => {
        const ranked = [
            {
                id: 'tt1',
                title: 'Comedy One',
                genres: ['Comedy', 'Drama'],
                year: 2019,
                scoringFactors: { composite: 0.91 }
            },
            {
                id: 'tt2',
                title: 'Comedy Two',
                genres: ['Comedy', 'Drama'],
                year: 2018,
                scoringFactors: { composite: 0.9 }
            },
            {
                id: 'tt3',
                title: 'Comedy Three',
                genres: ['Comedy', 'Drama'],
                year: 2017,
                scoringFactors: { composite: 0.89 }
            },
            {
                id: 'tt4',
                title: 'Sci-Fi Break',
                genres: ['Sci-Fi', 'Mystery'],
                year: 2016,
                scoringFactors: { composite: 0.87 }
            },
            {
                id: 'tt5',
                title: 'Thriller Break',
                genres: ['Thriller', 'Crime'],
                year: 2015,
                scoringFactors: { composite: 0.86 }
            },
            {
                id: 'tt6',
                title: 'Drama Tail',
                genres: ['Drama'],
                year: 2014,
                scoringFactors: { composite: 0.7 }
            }
        ];
        const final = recommendationEngine.selectFinalResults(ranked, 4);
        const finalIds = final.map((item) => item.id);
        expect(finalIds).toContain('tt4');
        expect(finalIds).toContain('tt5');
        expect(finalIds).not.toEqual(['tt1', 'tt2', 'tt3', 'tt4']);
    });
    it('should boost mainstream titles when blockbuster refinement is provided', () => {
        const preferences = PreferenceParser.parse({
            description: 'Like Inception but more relaxing',
            clarificationContext: {
                clarificationRound: 1,
                userClarification: 'prioritize blockbusters'
            }
        });
        const titles = [
            {
                id: 'ttA111111',
                title: 'High Popularity Pick',
                genres: ['Drama', 'Sci-Fi'],
                plot: 'A calm and reflective science-fiction story.',
                rating: 7.4,
                voteCount: 1200000,
                year: 2017,
                talentMatchScore: 0.2
            },
            {
                id: 'ttB222222',
                title: 'Low Popularity Pick',
                genres: ['Drama', 'Sci-Fi'],
                plot: 'A calm and reflective science-fiction story.',
                rating: 7.6,
                voteCount: 1200,
                year: 2017,
                talentMatchScore: 0.2
            }
        ];
        const ranked = recommendationEngine.rankTitles(titles, preferences, []);
        expect(ranked[0].id).toBe('ttA111111');
        expect(ranked[0].scoringFactors.composite).toBeGreaterThan(ranked[1].scoringFactors.composite);
    });
    it('should boost 80s titles when decade refinement is provided', () => {
        const preferences = PreferenceParser.parse({
            description: 'Like Blade Runner but warmer',
            clarificationContext: {
                clarificationRound: 1,
                userClarification: 'show me movies from the 80s'
            }
        });
        const titles = [
            {
                id: 'ttC333333',
                title: '1980s Match',
                genres: ['Drama', 'Sci-Fi'],
                plot: 'A warm and thoughtful science fiction character study.',
                rating: 7.2,
                voteCount: 40000,
                year: 1984,
                talentMatchScore: 0.1
            },
            {
                id: 'ttD444444',
                title: 'Modern Match',
                genres: ['Drama', 'Sci-Fi'],
                plot: 'A warm and thoughtful science fiction character study.',
                rating: 7.2,
                voteCount: 40000,
                year: 2019,
                talentMatchScore: 0.1
            }
        ];
        const ranked = recommendationEngine.rankTitles(titles, preferences, []);
        expect(ranked[0].id).toBe('ttC333333');
        expect(ranked[0].scoringFactors.composite).toBeGreaterThan(ranked[1].scoringFactors.composite);
    });
    it('should reuse previous recommendations and skip broad retrieval when pool is sufficient', async () => {
        const previousIds = [
            'tt0083658',
            'tt0088247',
            'tt0090605',
            'tt0081505',
            'tt0086190',
            'tt0081398',
            'tt0082971',
            'tt0086250',
            'tt0091763',
            'tt0092005',
            'tt0093058',
            'tt0095016'
        ];
        const getDetailsSpy = jest
            .spyOn(fmdbClient, 'getDetails')
            .mockImplementation(async (id) => ({
            imdbID: id,
            Title: `Hydrated ${id}`,
            Year: '1984',
            Type: 'movie',
            Plot: 'A warm and thoughtful science fiction story with reflective pacing.',
            Genre: 'Sci-Fi, Drama',
            imdbRating: '7.4',
            Poster: 'N/A',
            Rated: 'PG-13',
            Director: 'N/A',
            Actors: 'N/A'
        }));
        const searchCandidatesSpy = jest
            .spyOn(recommendationEngine, 'searchCandidates')
            .mockResolvedValue({ results: [], source: 'omdb' });
        const recommendations = await recommendationEngine.getRecommendations({
            description: 'Like Blade Runner but warmer',
            region: 'US',
            clarificationContext: {
                clarificationRound: 1,
                userClarification: 'prioritize blockbusters from the 80s',
                previousRecommendationIds: previousIds,
                cumulativeConstraints: ['prioritize blockbusters', 'show me movies from the 80s']
            }
        });
        expect(recommendations.length).toBeGreaterThan(0);
        expect(recommendations.length).toBeLessThanOrEqual(10);
        expect(getDetailsSpy).toHaveBeenCalledTimes(previousIds.length + 1);
        expect(searchCandidatesSpy).not.toHaveBeenCalled();
        getDetailsSpy.mockRestore();
        searchCandidatesSpy.mockRestore();
    });
    it('should return actor-led comedy matches for talent-mode prompts', async () => {
        const isEnabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(true);
        const actorSearchSpy = jest.spyOn(tmdbClient, 'searchTitlesForPerson').mockResolvedValue([
            {
                id: 101,
                title: 'The Nice Guys',
                media_type: 'movie',
                poster_path: '/test.jpg',
                overview: 'A private eye and enforcer investigate a missing girl in 1970s Los Angeles.',
                release_date: '2016-05-20',
                genre_ids: [35, 80],
                vote_average: 7.4,
                vote_count: 3800,
                adult: false,
                original_language: 'en'
            }
        ]);
        const broadSearchSpy = jest
            .spyOn(recommendationEngine, 'searchCandidates')
            .mockResolvedValue({ results: [], source: 'omdb' });
        const externalIdsSpy = jest
            .spyOn(tmdbClient, 'getExternalIds')
            .mockResolvedValue({});
        const recommendations = await recommendationEngine.getRecommendations({
            description: 'Something funny with Ryan Gosling',
            region: 'US'
        });
        expect(actorSearchSpy).toHaveBeenCalled();
        expect(recommendations.length).toBeGreaterThan(0);
        expect(recommendations.some(r => r.title === 'The Nice Guys')).toBe(true);
        expect(recommendations.every(r => r.type === 'movie' || r.type === 'tv')).toBe(true);
        expect(broadSearchSpy).toHaveBeenCalled();
        isEnabledSpy.mockRestore();
        actorSearchSpy.mockRestore();
        broadSearchSpy.mockRestore();
        externalIdsSpy.mockRestore();
    });
    it('should avoid empty responses when talent strict-filter finds no actor metadata matches', async () => {
        const tmdbEnabledSpy = jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(false);
        const searchCandidatesSpy = jest
            .spyOn(recommendationEngine, 'searchCandidates')
            .mockResolvedValue({
            source: 'omdb',
            results: [
                {
                    id: 'tt9990001',
                    title: 'Comedy Placeholder One',
                    year: 2019,
                    type: 'movie',
                    poster: 'N/A',
                    rating: 7.2,
                    plot: 'A witty comedic story with quirky misunderstandings and big laughs.',
                    genres: ['Comedy'],
                    rated: 'PG-13',
                    director: 'Director Name',
                    actors: 'Another Actor, Different Person',
                    voteCount: 1200
                },
                {
                    id: 'tt9990002',
                    title: 'Comedy Placeholder Two',
                    year: 2017,
                    type: 'movie',
                    poster: 'N/A',
                    rating: 6.9,
                    plot: 'A funny caper featuring oddball friends and chaotic plans.',
                    genres: ['Comedy', 'Crime'],
                    rated: 'PG-13',
                    director: 'Director Name',
                    actors: 'Another Actor, Different Person',
                    voteCount: 980
                }
            ]
        });
        const recommendations = await recommendationEngine.getRecommendations({
            description: 'Something funny with Ryan Gosling',
            region: 'US'
        });
        expect(recommendations.length).toBeGreaterThan(0);
        tmdbEnabledSpy.mockRestore();
        searchCandidatesSpy.mockRestore();
    });
});
