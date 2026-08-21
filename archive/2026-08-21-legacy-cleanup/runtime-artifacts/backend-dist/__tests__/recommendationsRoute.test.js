import request from 'supertest';
import { app } from '../index';
import { recommendationEngine } from '../engine/recommendationEngine';
describe('POST /recommendations route guardrails', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });
    it('should return weak recommendations with refinement suggestions', async () => {
        const mockRecommendations = [
            {
                id: 'tt1234567',
                title: 'Weak Match One',
                year: '2015',
                type: 'movie',
                synopsis: 'A loosely related title.',
                score: 6.2,
                scoringFactors: { composite: 0.32 }
            },
            {
                id: 'tt7654321',
                title: 'Weak Match Two',
                year: '2012',
                type: 'movie',
                synopsis: 'Another weakly related title.',
                score: 6.0,
                scoringFactors: { composite: 0.28 }
            }
        ];
        jest
            .spyOn(recommendationEngine, 'getRecommendations')
            .mockResolvedValue(mockRecommendations);
        const response = await request(app)
            .post('/recommendations')
            .send({
            description: 'Like Inception but more relaxing',
            region: 'US'
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.requiresClarification).toBeUndefined();
        expect(response.body.recommendations).toHaveLength(2);
        expect(response.body.refinementSuggestions).toBeDefined();
        expect(response.body.refinementSuggestions.length).toBeGreaterThan(0);
    });
    it('should bypass first-turn clarification for high-confidence non-mixed intent', async () => {
        const mockRecommendations = [
            {
                id: 'tt1856101',
                title: 'Blade Runner 2049',
                year: '2017',
                type: 'movie',
                synopsis: 'A replicant hunter uncovers a buried secret.',
                score: 8.0,
                scoringFactors: { composite: 0.61 }
            },
            {
                id: 'tt0137523',
                title: 'Fight Club',
                year: '1999',
                type: 'movie',
                synopsis: 'An office worker forms an underground fight club.',
                score: 8.8,
                scoringFactors: { composite: 0.57 }
            }
        ];
        const getRecommendationsSpy = jest
            .spyOn(recommendationEngine, 'getRecommendations')
            .mockResolvedValue(mockRecommendations);
        const response = await request(app)
            .post('/recommendations')
            .send({
            description: 'Like Blade Runner but warmer',
            region: 'US'
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.requiresClarification).toBeUndefined();
        expect(response.body.recommendations).toHaveLength(2);
        expect(getRecommendationsSpy).toHaveBeenCalledTimes(1);
    });
    it('should return recommendations when quality is strong', async () => {
        const mockRecommendations = [
            {
                id: 'tt2468101',
                title: 'Strong Match One',
                year: '2019',
                type: 'movie',
                synopsis: 'A strongly relevant recommendation.',
                score: 7.9,
                scoringFactors: { composite: 0.62 }
            },
            {
                id: 'tt1357913',
                title: 'Strong Match Two',
                year: '2020',
                type: 'movie',
                synopsis: 'Another strongly relevant recommendation.',
                score: 7.8,
                scoringFactors: { composite: 0.57 }
            }
        ];
        jest
            .spyOn(recommendationEngine, 'getRecommendations')
            .mockResolvedValue(mockRecommendations);
        const response = await request(app)
            .post('/recommendations')
            .send({
            description: 'Like Inception but more relaxing',
            region: 'US'
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.requiresClarification).toBeUndefined();
        expect(response.body.recommendations).toHaveLength(2);
    });
    it('should forward iterative refinement context to recommendation engine', async () => {
        const mockRecommendations = [
            {
                id: 'tt2468101',
                title: 'Strong Match One',
                year: '2019',
                type: 'movie',
                synopsis: 'A strongly relevant recommendation.',
                score: 7.9,
                scoringFactors: { composite: 0.62 }
            },
            {
                id: 'tt1357913',
                title: 'Strong Match Two',
                year: '2020',
                type: 'movie',
                synopsis: 'Another strongly relevant recommendation.',
                score: 7.8,
                scoringFactors: { composite: 0.57 }
            }
        ];
        const getRecommendationsSpy = jest
            .spyOn(recommendationEngine, 'getRecommendations')
            .mockResolvedValue(mockRecommendations);
        const response = await request(app)
            .post('/recommendations')
            .send({
            description: 'Like Inception but more relaxing',
            region: 'US',
            clarificationContext: {
                clarificationRound: 1,
                userClarification: 'prioritize blockbusters',
                previousRecommendationIds: ['tt1375666', 'tt0816692'],
                cumulativeConstraints: ['show me movies from the 80s']
            }
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.requiresClarification).toBeUndefined();
        expect(response.body.recommendations).toHaveLength(2);
        expect(response.body.turnOperation).toBeDefined();
        expect(response.body.turnOperation).toEqual(expect.objectContaining({
            continuity: expect.any(String),
            operation: expect.any(String),
            confidence: expect.any(Number)
        }));
        expect(getRecommendationsSpy).toHaveBeenCalledWith(expect.objectContaining({
            description: 'Like Inception but more relaxing',
            region: 'US',
            clarificationContext: expect.objectContaining({
                clarificationRound: 1,
                userClarification: 'prioritize blockbusters',
                previousRecommendationIds: ['tt1375666', 'tt0816692'],
                cumulativeConstraints: ['show me movies from the 80s']
            })
        }), 10);
    });
    it('should apply top-N refinement as recommendation limit', async () => {
        const mockRecommendations = [
            {
                id: 'tt001',
                title: 'Match One',
                year: '2018',
                type: 'movie',
                synopsis: 'A relevant title.',
                score: 7.9,
                scoringFactors: { composite: 0.68 }
            },
            {
                id: 'tt002',
                title: 'Match Two',
                year: '2019',
                type: 'movie',
                synopsis: 'A relevant title.',
                score: 7.8,
                scoringFactors: { composite: 0.66 }
            },
            {
                id: 'tt003',
                title: 'Match Three',
                year: '2020',
                type: 'movie',
                synopsis: 'A relevant title.',
                score: 7.7,
                scoringFactors: { composite: 0.64 }
            }
        ];
        const getRecommendationsSpy = jest
            .spyOn(recommendationEngine, 'getRecommendations')
            .mockResolvedValue(mockRecommendations);
        const response = await request(app)
            .post('/recommendations')
            .send({
            description: 'Something funny with Ryan Gosling',
            region: 'US',
            clarificationContext: {
                clarificationRound: 1,
                userClarification: 'Show me the top 3 rated titles'
            }
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(getRecommendationsSpy).toHaveBeenCalledWith(expect.objectContaining({
            description: 'Something funny with Ryan Gosling',
            clarificationContext: expect.objectContaining({
                clarificationRound: 1,
                userClarification: 'Show me the top 3 rated titles'
            })
        }), 3);
    });
    it('should ask the next unresolved follow-up question when a meaningful gap remains', async () => {
        const mockRecommendations = [
            {
                id: 'tt1234567',
                title: 'Weak Match One',
                year: '2015',
                type: 'movie',
                synopsis: 'A loosely related title.',
                score: 6.2,
                scoringFactors: { composite: 0.31 }
            },
            {
                id: 'tt7654321',
                title: 'Weak Match Two',
                year: '2012',
                type: 'movie',
                synopsis: 'Another weakly related title.',
                score: 6.0,
                scoringFactors: { composite: 0.29 }
            }
        ];
        jest
            .spyOn(recommendationEngine, 'getRecommendations')
            .mockResolvedValue(mockRecommendations);
        const response = await request(app)
            .post('/recommendations')
            .send({
            description: 'Fast',
            region: 'US',
            clarificationContext: {
                clarificationRound: 1,
                userClarification: 'Mood/tone',
                askedQuestionIds: ['quality_disambiguate_intent']
            }
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.requiresClarification).toBeUndefined();
        expect(response.body.recommendations).toHaveLength(2);
    });
    it('should stop asking clarification after max turns and return best available recommendations', async () => {
        const mockRecommendations = [
            {
                id: 'tt1234567',
                title: 'Weak Match One',
                year: '2015',
                type: 'movie',
                synopsis: 'A loosely related title.',
                score: 6.2,
                scoringFactors: { composite: 0.31 }
            },
            {
                id: 'tt7654321',
                title: 'Weak Match Two',
                year: '2012',
                type: 'movie',
                synopsis: 'Another weakly related title.',
                score: 6.0,
                scoringFactors: { composite: 0.29 }
            }
        ];
        jest
            .spyOn(recommendationEngine, 'getRecommendations')
            .mockResolvedValue(mockRecommendations);
        const response = await request(app)
            .post('/recommendations')
            .send({
            description: 'Fast',
            region: 'US',
            clarificationContext: {
                clarificationRound: 3,
                userClarification: 'Movie',
                askedQuestionIds: ['quality_disambiguate_intent', 'quality_format_focus', 'quality_era_focus']
            }
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.requiresClarification).toBeUndefined();
        expect(response.body.recommendations).toHaveLength(2);
    });
    it('should skip generic genre follow-up for reference similarity refinements', async () => {
        const mockRecommendations = [
            {
                id: 'tt1234567',
                title: 'Weak Match One',
                year: '2015',
                type: 'movie',
                synopsis: 'A loosely related title.',
                score: 6.2,
                scoringFactors: { composite: 0.31 }
            },
            {
                id: 'tt7654321',
                title: 'Weak Match Two',
                year: '2012',
                type: 'movie',
                synopsis: 'Another weakly related title.',
                score: 6.0,
                scoringFactors: { composite: 0.29 }
            }
        ];
        jest
            .spyOn(recommendationEngine, 'getRecommendations')
            .mockResolvedValue(mockRecommendations);
        const response = await request(app)
            .post('/recommendations')
            .send({
            description: 'Like Inception but more relaxing',
            region: 'US',
            clarificationContext: {
                clarificationRound: 1,
                userClarification: 'Genre similarity',
                askedQuestionIds: ['quality_reference_axis']
            }
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.requiresClarification).toBeUndefined();
        expect(response.body.recommendations).toHaveLength(2);
    });
    it('should not ask for genre or type when talent intent already inferred comedy', async () => {
        const mockRecommendations = [
            {
                id: 'tt3799694',
                title: 'The Nice Guys',
                year: '2016',
                type: 'movie',
                synopsis: 'A mismatched pair investigates a conspiracy in 1970s Los Angeles.',
                score: 7.4,
                scoringFactors: { composite: 0.33 }
            },
            {
                id: 'tt1951265',
                title: 'The Place Beyond the Pines',
                year: '2012',
                type: 'movie',
                synopsis: 'An outlaw motorcycle stunt rider turns to robbing banks.',
                score: 7.3,
                scoringFactors: { composite: 0.29 }
            }
        ];
        jest
            .spyOn(recommendationEngine, 'getRecommendations')
            .mockResolvedValue(mockRecommendations);
        const response = await request(app)
            .post('/recommendations')
            .send({
            description: 'Something funny with Ryan Gosling',
            region: 'US'
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.requiresClarification).toBeUndefined();
        expect(response.body.recommendations).toHaveLength(2);
    });
    it('should finalize when a freeform answer resolves multiple clarification dimensions', async () => {
        const mockRecommendations = [
            {
                id: 'tt2468101',
                title: 'Strong Match One',
                year: '2019',
                type: 'movie',
                synopsis: 'A strongly relevant recommendation.',
                score: 7.9,
                scoringFactors: { composite: 0.62 }
            },
            {
                id: 'tt1357913',
                title: 'Strong Match Two',
                year: '2020',
                type: 'movie',
                synopsis: 'Another strongly relevant recommendation.',
                score: 7.8,
                scoringFactors: { composite: 0.57 }
            }
        ];
        jest
            .spyOn(recommendationEngine, 'getRecommendations')
            .mockResolvedValue(mockRecommendations);
        const response = await request(app)
            .post('/recommendations')
            .send({
            description: 'Like Inception but more relaxing',
            region: 'US',
            clarificationContext: {
                clarificationRound: 1,
                userClarification: 'Genre similarity and slower pace',
                askedQuestionIds: ['quality_reference_axis']
            }
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.requiresClarification).toBeUndefined();
        expect(response.body.recommendations).toHaveLength(2);
    });
    it('should return near-threshold reference recommendations without clarification', async () => {
        const mockRecommendations = [
            {
                id: 'tt3315342',
                title: 'Logan',
                year: '2017',
                type: 'movie',
                synopsis: 'Mutant drama with sci-fi themes.',
                score: 8.1,
                scoringFactors: { composite: 0.444 }
            },
            {
                id: 'tt0816692',
                title: 'Interstellar',
                year: '2014',
                type: 'movie',
                synopsis: 'Explorers travel through a wormhole in space.',
                score: 8.4,
                scoringFactors: { composite: 0.443 }
            },
            {
                id: 'tt0338013',
                title: 'Eternal Sunshine of the Spotless Mind',
                year: '2004',
                type: 'movie',
                synopsis: 'A surreal romance blending memory and science fiction.',
                score: 8.3,
                scoringFactors: { composite: 0.436 }
            },
            {
                id: 'tt6644200',
                title: 'A Quiet Place',
                year: '2018',
                type: 'movie',
                synopsis: 'A family survives in silence under alien threat.',
                score: 7.5,
                scoringFactors: { composite: 0.434 }
            },
            {
                id: 'tt2543164',
                title: 'Arrival',
                year: '2016',
                type: 'movie',
                synopsis: 'A linguist helps communicate with extraterrestrials.',
                score: 7.9,
                scoringFactors: { composite: 0.432 }
            },
            {
                id: 'tt1798709',
                title: 'Her',
                year: '2013',
                type: 'movie',
                synopsis: 'A gentle futuristic romance with reflective pacing.',
                score: 8.0,
                scoringFactors: { composite: 0.431 }
            }
        ];
        jest
            .spyOn(recommendationEngine, 'getRecommendations')
            .mockResolvedValue(mockRecommendations);
        const response = await request(app)
            .post('/recommendations')
            .send({
            description: 'Like Inception but more relaxing',
            region: 'US'
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.requiresClarification).toBeUndefined();
        expect(response.body.recommendations).toHaveLength(6);
    });
});
