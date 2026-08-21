import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { validateConfig } from './config.js';
import { PreferenceParser } from './engine/preferenceParser.js';
import { recommendationEngine } from './engine/recommendationEngine.js';
import { tmdbClient } from './clients/tmdb.js';
import { streamingClient } from './clients/streaming.js';
export const app = express();
const port = process.env.PORT || 3000;
// Validate configuration on startup
validateConfig();
// Middleware
app.use(cors());
app.use(express.json());
const MIN_TOP_COMPOSITE = 0.45;
const MIN_STRONG_MATCH_COUNT = 2;
const MAX_CLARIFICATION_TURNS = 3;
const MIN_HIGHLIGHT_RATING = 6.5;
const MIN_HIGHLIGHT_VOTE_COUNT = 200;
const TMDB_POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const RESULTS_FIRST_CONFIDENCE_THRESHOLD = 0.8;
const MIXED_RESULTS_FIRST_CONFIDENCE_THRESHOLD = 0.55;
const REFERENCE_NEAR_THRESHOLD_TOP_COMPOSITE = 0.43;
const REFERENCE_NEAR_THRESHOLD_FLOOR_COMPOSITE = 0.4;
const REFERENCE_NEAR_THRESHOLD_MIN_COUNT = 5;
const buildAppliedConstraints = (parsedPreferences, clarificationContext) => {
    const baseConstraints = clarificationContext?.cumulativeConstraints || [];
    const parsedConstraints = parsedPreferences.constraints || [];
    const pageConstraint = parsedPreferences.blockbusterPage
        ? [`blockbuster_page:${parsedPreferences.blockbusterPage}`]
        : [];
    return Array.from(new Set([...baseConstraints, ...parsedConstraints, ...pageConstraint]));
};
const EXPLICIT_UNSUPPORTED_CRITIC_SOURCES = [
    { pattern: /\brotten\s*tomatoes\b|\brt\s*score\b/i, label: 'Rotten Tomatoes' },
    { pattern: /\bmetacritic\b|\bmeta\s*score\b/i, label: 'Metacritic' },
    { pattern: /\bletterboxd\b/i, label: 'Letterboxd' }
];
const detectUnsupportedCriticSource = (text) => {
    for (const source of EXPLICIT_UNSUPPORTED_CRITIC_SOURCES) {
        if (source.pattern.test(text)) {
            return source.label;
        }
    }
    return null;
};
const buildInterpretationNote = (parsedPreferences) => {
    if (!parsedPreferences.criticsIntent) {
        return undefined;
    }
    return 'Interpreting "critics favourites" using available signals: TMDB/IMDb ratings and vote volume (not Rotten Tomatoes or Metacritic critic scores).';
};
const shouldPreferResultsFirst = (clarificationQuestions, clarificationRound, mode, confidence) => {
    if (!clarificationQuestions || clarificationQuestions.length === 0) {
        return false;
    }
    if (clarificationRound > 0) {
        return false;
    }
    if (!mode) {
        return false;
    }
    if (mode === 'mixed') {
        return (confidence ?? 0) >= MIXED_RESULTS_FIRST_CONFIDENCE_THRESHOLD;
    }
    return (confidence ?? 0) >= RESULTS_FIRST_CONFIDENCE_THRESHOLD;
};
const isWeakRecommendationSet = (recommendations) => {
    if (recommendations.length === 0) {
        return true;
    }
    const compositeScores = recommendations
        .map(r => r.scoringFactors?.composite)
        .filter((value) => typeof value === 'number');
    const topComposite = compositeScores.length > 0 ? Math.max(...compositeScores) : 0;
    const strongMatches = compositeScores.filter(score => score >= MIN_TOP_COMPOSITE).length;
    return topComposite < MIN_TOP_COMPOSITE || strongMatches < MIN_STRONG_MATCH_COUNT;
};
const shouldBypassWeakSetForReference = (recommendations, mode) => {
    if (mode !== 'reference' || recommendations.length === 0) {
        return false;
    }
    const compositeScores = recommendations
        .map(r => r.scoringFactors?.composite)
        .filter((value) => typeof value === 'number');
    if (compositeScores.length === 0) {
        return false;
    }
    const topComposite = Math.max(...compositeScores);
    const nearThresholdMatches = compositeScores.filter(score => score >= REFERENCE_NEAR_THRESHOLD_FLOOR_COMPOSITE).length;
    return (topComposite >= REFERENCE_NEAR_THRESHOLD_TOP_COMPOSITE &&
        nearThresholdMatches >= REFERENCE_NEAR_THRESHOLD_MIN_COUNT);
};
const nextUnaskedQuestion = (askedQuestionIds, candidates) => {
    for (const candidate of candidates) {
        if (!askedQuestionIds.has(candidate.id)) {
            return candidate;
        }
    }
    return null;
};
const hasKeywordMatch = (value, keywords) => {
    const lower = value.toLowerCase();
    return keywords.some(keyword => lower.includes(keyword.toLowerCase()));
};
const inferClarificationState = (mode, parsedPreferences, latestAnswer, askedQuestionIds) => {
    const lowerAnswer = latestAnswer.toLowerCase();
    const genreKeywords = [
        'action', 'comedy', 'comedies', 'drama', 'sci-fi', 'sci fi', 'scifi', 'scifis',
        'science fiction', 'thriller', 'thrillers', 'romance', 'romcom', 'romcoms',
        'rom-com', 'rom-coms', 'horror', 'fantasy', 'animation', 'anime',
        'documentary', 'documentaries', 'indie'
    ];
    const axisResolved = mode === 'talent' ||
        askedQuestionIds.has('quality_reference_axis') ||
        askedQuestionIds.has('quality_disambiguate_intent') ||
        hasKeywordMatch(lowerAnswer, [
            'mood', 'tone', 'plot', 'plot complexity', 'cast', 'director',
            'genre similarity', 'genre', 'actor', 'title', 'reference title'
        ]);
    const formatResolved = askedQuestionIds.has('quality_format_focus') ||
        parsedPreferences.contentType === 'movie' ||
        parsedPreferences.contentType === 'tv' ||
        hasKeywordMatch(lowerAnswer, [
            'movie', 'film', 'series', 'show', 'either', 'no preference'
        ]);
    const paceResolved = askedQuestionIds.has('quality_runtime_focus') ||
        hasKeywordMatch(lowerAnswer, [
            'slower pace', 'slow pace', 'slower', 'gentler', 'more relaxed', 'relaxed pace',
            'faster pace', 'fast pace', 'faster', 'more kinetic', 'balanced pace', 'no preference'
        ]);
    const eraResolved = askedQuestionIds.has('quality_era_focus') ||
        hasKeywordMatch(lowerAnswer, ['recent', 'last 5 years', '2010s', '2000s', 'classic', 'before 2000', 'no preference']);
    const genreResolved = parsedPreferences.genres.length > 0 ||
        hasKeywordMatch(lowerAnswer, genreKeywords) ||
        (mode === 'reference' && (parsedPreferences.referenceTitle?.length || 0) > 0 && axisResolved);
    const moodResolved = (parsedPreferences.boostedMoods?.length || 0) > 0 ||
        (parsedPreferences.reducedMoods?.length || 0) > 0 ||
        hasKeywordMatch(lowerAnswer, ['mood', 'tone', 'relaxing', 'calm', 'intense', 'dark', 'funny']);
    const enoughContextToFinalize = (mode === 'reference' && axisResolved && genreResolved && (paceResolved || formatResolved)) ||
        (mode === 'mood' && genreResolved && (paceResolved || formatResolved)) ||
        (mode === 'talent' && genreResolved) ||
        (mode === 'mixed' && axisResolved && (genreResolved || moodResolved));
    return {
        axisResolved,
        formatResolved,
        paceResolved,
        eraResolved,
        genreResolved,
        moodResolved,
        enoughContextToFinalize
    };
};
const buildWeakMatchClarification = (mode, clarificationRound, askedQuestionIds, parsedPreferences, latestAnswer) => {
    const sharedContext = 'I need one more detail so I can return closer matches instead of weak guesses.';
    const hasInferredMoodShift = (parsedPreferences.boostedMoods?.length || 0) > 0 ||
        (parsedPreferences.reducedMoods?.length || 0) > 0;
    const modeKey = mode || 'mixed';
    const state = inferClarificationState(modeKey, parsedPreferences, latestAnswer, askedQuestionIds);
    if (state.enoughContextToFinalize) {
        return null;
    }
    const roundOneByMode = {
        mood: [
            {
                id: 'quality_mood_genre_focus',
                question: 'What genre should I pair with that mood?',
                type: 'select',
                options: ['Action', 'Comedy', 'Drama', 'Sci-Fi', 'Thriller', 'Other (type your own)']
            }
        ],
        reference: [
            {
                id: 'quality_reference_axis',
                question: 'For titles similar to your reference, what should I prioritise?',
                type: 'select',
                options: [
                    ...(hasInferredMoodShift ? [] : ['Mood/tone']),
                    'Plot complexity',
                    'Cast/director overlap',
                    'Genre similarity',
                    'Other (type your own)'
                ]
            }
        ],
        talent: [
            {
                id: 'quality_talent_genre_focus',
                question: 'Which genre should I focus on for that actor/director?',
                type: 'select',
                options: ['Action', 'Comedy', 'Drama', 'Romance', 'Thriller', 'Other (type your own)']
            }
        ],
        mixed: [
            {
                id: 'quality_disambiguate_intent',
                question: 'To narrow this down, what did you mean most by your request?',
                type: 'select',
                options: ['Mood/tone', 'Genre', 'A specific title', 'A specific actor/director', 'Other (type your own)']
            }
        ]
    };
    const roundOneFollowUps = [
        {
            id: 'quality_genre_focus',
            question: 'Is there a particular genre you are interested in?',
            type: 'select',
            options: ['Action', 'Comedy', 'Drama', 'Sci-Fi', 'Thriller', 'No preference', 'Other (type your own)']
        },
        {
            id: 'quality_format_focus',
            question: 'Do you want a movie, series, or either?',
            type: 'select',
            options: ['Movie', 'Series', 'Either', 'Other (type your own)']
        }
    ];
    const roundTwoGeneric = [
        {
            id: 'quality_runtime_focus',
            question: 'Do you prefer a faster pace or a slower, more relaxed pace?',
            type: 'select',
            options: ['Faster pace', 'Balanced pace', 'Slower pace', 'No preference', 'Other (type your own)']
        },
        {
            id: 'quality_era_focus',
            question: 'Any preferred release era?',
            type: 'select',
            options: ['Recent (last 5 years)', '2010s', '2000s', 'Classic (before 2000)', 'No preference']
        }
    ];
    let primaryCandidates = [];
    // For weak talent results on round 0, ask talent-genre focus only if genre intent is still unresolved.
    if (clarificationRound === 0 && modeKey === 'talent' && !state.genreResolved) {
        primaryCandidates = [roundOneByMode.talent[0]];
    }
    else if (clarificationRound === 0 && !state.axisResolved) {
        primaryCandidates = roundOneByMode[modeKey];
    }
    else if (!state.genreResolved) {
        if (modeKey === 'mood') {
            primaryCandidates = [roundOneByMode.mood[0]];
        }
        else if (modeKey === 'talent') {
            primaryCandidates = [roundOneByMode.talent[0]];
        }
        else if (modeKey === 'mixed') {
            primaryCandidates = [roundOneFollowUps[0]];
        }
    }
    else if (!state.paceResolved && !hasInferredMoodShift) {
        primaryCandidates = [roundTwoGeneric[0]];
    }
    else if (!state.eraResolved && clarificationRound >= 2) {
        primaryCandidates = [roundTwoGeneric[1]];
    }
    if (primaryCandidates.length === 0) {
        return null;
    }
    const question = nextUnaskedQuestion(askedQuestionIds, primaryCandidates);
    if (!question) {
        return null;
    }
    return {
        context: sharedContext,
        questions: [question]
    };
};
// Routes
app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});
app.get('/highlights', async (req, res) => {
    try {
        if (!tmdbClient.isEnabled()) {
            return res.json({ success: true, highlights: [] });
        }
        const [weeklyTrending, dailyTrending] = await Promise.all([
            tmdbClient.getTrending('week'),
            tmdbClient.getTrending('day')
        ]);
        const merged = new Map();
        for (const item of [...weeklyTrending, ...dailyTrending]) {
            if (!item.poster_path) {
                continue;
            }
            const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
            const key = `${mediaType}-${item.id}`;
            if (!merged.has(key)) {
                merged.set(key, {
                    id: item.id,
                    title: item.title || item.name || 'Untitled',
                    releaseDate: item.release_date,
                    firstAirDate: item.first_air_date,
                    mediaType,
                    overview: item.overview || '',
                    genreIds: item.genre_ids || [],
                    originalLanguage: item.original_language || 'en',
                    voteAverage: item.vote_average || 0,
                    voteCount: item.vote_count || 0,
                    posterPath: item.poster_path
                });
            }
        }
        const highlights = Array.from(merged.values())
            .filter(item => item.voteAverage >= MIN_HIGHLIGHT_RATING &&
            item.voteCount >= MIN_HIGHLIGHT_VOTE_COUNT)
            .sort((a, b) => {
            if (b.voteCount !== a.voteCount) {
                return b.voteCount - a.voteCount;
            }
            return b.voteAverage - a.voteAverage;
        })
            .slice(0, 60)
            .map(item => ({
            id: `${item.mediaType}-${item.id}`,
            title: item.title,
            year: (item.mediaType === 'tv' ? item.firstAirDate : item.releaseDate)?.slice(0, 4),
            type: item.mediaType,
            rating: item.voteAverage,
            voteCount: item.voteCount,
            posterUrl: `${TMDB_POSTER_BASE_URL}${item.posterPath}`,
            synopsis: item.overview,
            genres: tmdbClient.mapGenreIdsToNames(item.genreIds),
            originalLanguage: item.originalLanguage
        }));
        res.json({ success: true, highlights });
    }
    catch (error) {
        console.error('Error in /highlights:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to load highlights'
        });
    }
});
app.get('/highlights/:type/:id', async (req, res) => {
    try {
        if (!tmdbClient.isEnabled()) {
            return res.status(503).json({
                success: false,
                message: 'TMDB is not configured'
            });
        }
        const typeParam = req.params.type === 'tv' ? 'tv' : req.params.type === 'movie' ? 'movie' : null;
        const idParam = Number.parseInt(req.params.id, 10);
        if (!typeParam || !Number.isFinite(idParam) || idParam <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid highlight identifier'
            });
        }
        const [details, credits, videos, externalIds] = await Promise.all([
            tmdbClient.getTitleDetails(idParam, typeParam),
            tmdbClient.getTitleCredits(idParam, typeParam),
            tmdbClient.getVideos(idParam, typeParam),
            tmdbClient.getExternalIds(idParam, typeParam)
        ]);
        if (!details) {
            return res.status(404).json({
                success: false,
                message: 'Highlight not found'
            });
        }
        const trailerUrl = videos.length > 0 ? `https://www.youtube.com/watch?v=${videos[0].key}` : undefined;
        const highlightDetails = {
            id: `${typeParam}-${idParam}`,
            imdbId: externalIds.imdbId,
            title: details.title || details.name || 'Untitled',
            year: (typeParam === 'tv' ? details.first_air_date : details.release_date)?.slice(0, 4) || 'Unknown year',
            type: typeParam,
            genres: tmdbClient.mapGenreIdsToNames(details.genre_ids || []),
            originalLanguage: details.original_language,
            runtimeMinutes: details.runtime,
            rating: details.vote_average,
            voteCount: details.vote_count,
            mainCast: credits.mainCast,
            directors: credits.directors,
            synopsis: details.overview || undefined,
            posterUrl: details.poster_path ? `${TMDB_POSTER_BASE_URL}${details.poster_path}` : undefined,
            trailerUrl
        };
        return res.json({
            success: true,
            highlightDetails
        });
    }
    catch (error) {
        console.error('Error in /highlights/:type/:id:', error);
        return res.status(500).json({
            success: false,
            message: 'Unable to load highlight details'
        });
    }
});
app.post('/recommendations', async (req, res) => {
    try {
        const { description, preferences, region, clarificationContext } = req.body;
        const normalizedDescription = (description || '').trim();
        const hasDescription = normalizedDescription.length > 0;
        const hasPreferences = !!(preferences && ((preferences.genres && preferences.genres.length > 0) ||
            (preferences.mood && preferences.mood.length > 0) ||
            !!preferences.type ||
            !!preferences.maxRating));
        // Validation: allow description-only OR preferences-only flow
        if (!hasDescription && !hasPreferences) {
            return res.status(400).json({
                success: false,
                message: 'Provide a description or select at least one preference.'
            });
        }
        // Validation: if description is provided, it must be at least 3 chars
        if (hasDescription && normalizedDescription.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Description must be at least 3 characters.'
            });
        }
        // Log the query (anonymized) for debugging
        console.log(`[${new Date().toISOString()}] Recommendation request:`, {
            descriptionLength: normalizedDescription.length,
            hasPreferences: !!preferences,
            preferencesKeys: preferences ? Object.keys(preferences) : [],
            region: region || 'US',
            clarificationRound: clarificationContext?.clarificationRound ?? 0,
            hasUserClarification: !!clarificationContext?.userClarification
        });
        // === PHASE 5: Parse preferences and check for clarification need ===
        const preferencesObject = preferences ? {
            genres: preferences.genres,
            mood: preferences.mood,
            contentType: preferences.type,
            maxRating: preferences.maxRating
        } : undefined;
        const parsedPreferences = PreferenceParser.parse({
            description: normalizedDescription,
            region,
            preferences: preferencesObject,
            clarificationContext
        });
        const appliedConstraints = buildAppliedConstraints(parsedPreferences, clarificationContext);
        const interpretationNote = buildInterpretationNote(parsedPreferences);
        const explicitUnsupportedSource = detectUnsupportedCriticSource(normalizedDescription);
        if (explicitUnsupportedSource) {
            return res.json({
                success: true,
                requiresClarification: {
                    context: `I can't directly rank by ${explicitUnsupportedSource} data in this build. I can continue using TMDB/IMDb rating and vote signals as a proxy if you want.`,
                    questions: [
                        {
                            id: 'critic_proxy_confirmation',
                            question: 'Continue with TMDB/IMDb rating-based proxy instead?',
                            type: 'select',
                            options: ['Yes, use TMDB/IMDb proxy', 'No, I will rephrase']
                        }
                    ]
                },
                detectedIntent: parsedPreferences.discoveryMode && parsedPreferences.intentConfidence
                    ? {
                        mode: parsedPreferences.discoveryMode,
                        confidence: parsedPreferences.intentConfidence
                    }
                    : undefined,
                turnOperation: parsedPreferences.turnOperation
            });
        }
        // Check if clarification is needed (only on first round, confidence-gated)
        const clarificationRound = clarificationContext?.clarificationRound ?? 0;
        const clarificationQuestions = PreferenceParser.needsClarification(parsedPreferences, clarificationRound, clarificationContext?.userClarification);
        const requestedLimit = parsedPreferences.resultLimit;
        const recommendationLimit = requestedLimit && Number.isFinite(requestedLimit)
            ? Math.max(1, Math.min(10, requestedLimit))
            : 10;
        const bypassInitialClarification = shouldPreferResultsFirst(clarificationQuestions, clarificationRound, parsedPreferences.discoveryMode, parsedPreferences.intentConfidence);
        if (clarificationQuestions && !bypassInitialClarification) {
            console.log(`[${new Date().toISOString()}] Clarification suggested with ${clarificationQuestions.length} questions`);
            return res.json({
                success: true,
                requiresClarification: {
                    questions: clarificationQuestions,
                    context: 'I can tune this a few ways. Choose one, or type your own direction.',
                    confidenceScore: parsedPreferences.intentConfidence
                },
                detectedIntent: parsedPreferences.discoveryMode && parsedPreferences.intentConfidence
                    ? {
                        mode: parsedPreferences.discoveryMode,
                        confidence: parsedPreferences.intentConfidence
                    }
                    : undefined,
                turnOperation: parsedPreferences.turnOperation
            });
        }
        if (clarificationQuestions && bypassInitialClarification) {
            console.log(`[${new Date().toISOString()}] Results-first override applied for high-confidence first-turn request`);
        }
        // Use real recommendation engine
        const recommendations = await recommendationEngine.getRecommendations({
            description: normalizedDescription,
            region,
            preferences: preferences ? {
                genres: preferences.genres,
                mood: preferences.mood,
                contentType: preferences.type,
                maxRating: preferences.maxRating
            } : undefined,
            clarificationContext: clarificationContext
        }, recommendationLimit);
        const retrievalDiagnostics = recommendationEngine.getLastRetrievalDiagnostics();
        const shouldBypassWeakSet = shouldBypassWeakSetForReference(recommendations, parsedPreferences.discoveryMode);
        const weakResultSet = isWeakRecommendationSet(recommendations) && !shouldBypassWeakSet;
        if (shouldBypassWeakSet) {
            console.log(`[${new Date().toISOString()}] Weak-result bypass applied for near-threshold reference recommendations`);
        }
        if (weakResultSet) {
            const round = clarificationContext?.clarificationRound ?? 0;
            const askedQuestionIds = new Set(clarificationContext?.askedQuestionIds || []);
            if (round < MAX_CLARIFICATION_TURNS) {
                const clarification = buildWeakMatchClarification(parsedPreferences.discoveryMode, round, askedQuestionIds, parsedPreferences, clarificationContext?.userClarification || '');
                if (clarification) {
                    console.log(`[${new Date().toISOString()}] Weak recommendation set detected; returning best available results with refinement suggestions`);
                    return res.json({
                        success: true,
                        recommendations,
                        appliedConstraints,
                        interpretationNote,
                        detectedIntent: parsedPreferences.discoveryMode && parsedPreferences.intentConfidence !== undefined
                            ? {
                                mode: parsedPreferences.discoveryMode,
                                confidence: parsedPreferences.intentConfidence
                            }
                            : undefined,
                        retrievalDiagnostics,
                        turnOperation: parsedPreferences.turnOperation
                    });
                }
            }
            console.log(`[${new Date().toISOString()}] Weak recommendation set persisted after clarification cap; returning best available results`);
        }
        res.json({
            success: true,
            recommendations,
            appliedConstraints,
            interpretationNote,
            detectedIntent: parsedPreferences.discoveryMode && parsedPreferences.intentConfidence !== undefined
                ? {
                    mode: parsedPreferences.discoveryMode,
                    confidence: parsedPreferences.intentConfidence
                }
                : undefined,
            retrievalDiagnostics,
            turnOperation: parsedPreferences.turnOperation
        });
    }
    catch (error) {
        console.error('Error in /recommendations:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
app.get('/availability/:imdbId', async (req, res) => {
    try {
        const rawImdbId = String(req.params.imdbId || '').trim();
        if (!/^tt\d{5,}$/.test(rawImdbId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid IMDb ID.'
            });
        }
        const rawRegion = String(req.query.region || 'US').trim().toLowerCase();
        const country = rawRegion === 'uk' ? 'gb' : rawRegion;
        const availability = await streamingClient.getAvailability(rawImdbId, country);
        const diagnostics = streamingClient.getLastBatchDiagnostics();
        return res.json({
            success: true,
            availability,
            diagnostics
        });
    }
    catch (error) {
        console.error('Error in /availability/:imdbId:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
// Health check and 404
app.get('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Not found'
    });
});
// Error handling middleware
app.use((err, req, res) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});
// Start server when not running under Jest tests
if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => {
        console.log(`🚀 Film & TV Advisor backend listening on port ${port}`);
        console.log(`   Health check: http://localhost:${port}/health`);
    });
}
