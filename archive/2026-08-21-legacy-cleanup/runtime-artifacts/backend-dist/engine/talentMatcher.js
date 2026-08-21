/**
 * Phase 2: Cast/Director Similarity Matching
 * Enables "similar to X" queries by finding titles with overlapping talent
 */
/**
 * Talent extraction and similarity matching
 * Parses actor/director information and calculates overlap scores
 */
export class TalentMatcher {
    /**
     * Extract actors and directors from title data
     * Input format: "Actor1, Actor2, Actor3" and/or "Director" (comma-separated)
     * Returns normalized arrays
     */
    static extractTalent(title) {
        const data = {
            actors: [],
            director: []
        };
        // Extract actors (comma-separated string)
        if (title.actors && typeof title.actors === 'string') {
            data.actors = title.actors
                .split(',')
                .map((a) => a.trim().toLowerCase())
                .filter((a) => a.length > 0);
        }
        // Extract director(s) (comma-separated string)
        if (title.director && typeof title.director === 'string') {
            data.director = title.director
                .split(',')
                .map((d) => d.trim().toLowerCase())
                .filter((d) => d.length > 0);
        }
        return data;
    }
    /**
     * Calculate talent overlap between a candidate and reference titles
     * Returns weighted composite score (0-1)
     *
     * Scoring:
     * - Actors: count overlaps ÷ max(candidate.actors, reference.actors) → 0-1
     * - Director: +0.3 if director matches (or full 0.3 if any director overlaps)
     * - Combined: (actorScore * 0.7) + (directorScore * 0.3)
     */
    static findTalentMatch(candidateTitle, referenceTitles) {
        if (referenceTitles.length === 0) {
            return {
                actorOverlap: 0,
                directorMatch: false,
                combinedScore: 0
            };
        }
        const candidateTalent = this.extractTalent(candidateTitle);
        const referenceTalentList = referenceTitles.map(t => this.extractTalent(t));
        // Calculate actor overlap across all reference titles
        let bestActorOverlap = 0;
        let bestDirectorMatch = false;
        for (const refTalent of referenceTalentList) {
            // Actor overlap: intersection / max set size
            if (candidateTalent.actors.length > 0 && refTalent.actors.length > 0) {
                const intersection = candidateTalent.actors.filter(a => refTalent.actors.some(ra => ra.includes(a) || a.includes(ra))).length;
                const maxSize = Math.max(candidateTalent.actors.length, refTalent.actors.length);
                const actorScore = maxSize > 0 ? intersection / maxSize : 0;
                if (actorScore > bestActorOverlap) {
                    bestActorOverlap = actorScore;
                }
            }
            // Director match: exact match
            if (candidateTalent.director.length > 0 && refTalent.director.length > 0) {
                const directorMatch = candidateTalent.director.some(d => refTalent.director.some(rd => rd === d));
                if (directorMatch) {
                    bestDirectorMatch = true;
                }
            }
        }
        // Combine scores
        const directorScore = bestDirectorMatch ? 1.0 : 0.0;
        const combinedScore = bestActorOverlap * 0.7 + directorScore * 0.3;
        return {
            actorOverlap: bestActorOverlap,
            directorMatch: bestDirectorMatch,
            combinedScore: combinedScore
        };
    }
    /**
     * Calculate talent overlap between a candidate and directly requested actors.
     * Used for talent-mode queries such as "with Ryan Gosling" where there is no
     * reference title to compare against.
     */
    static findTalentMatchForActors(candidateTitle, targetActors) {
        if (targetActors.length === 0) {
            return {
                actorOverlap: 0,
                directorMatch: false,
                combinedScore: 0
            };
        }
        const candidateTalent = this.extractTalent(candidateTitle);
        if (candidateTalent.actors.length === 0) {
            return {
                actorOverlap: 0,
                directorMatch: false,
                combinedScore: 0
            };
        }
        const normalizedTargets = targetActors
            .map(actor => actor.trim().toLowerCase())
            .filter(actor => actor.length > 0);
        const intersection = normalizedTargets.filter(targetActor => candidateTalent.actors.some(candidateActor => candidateActor.includes(targetActor) || targetActor.includes(candidateActor))).length;
        const actorOverlap = normalizedTargets.length > 0
            ? intersection / normalizedTargets.length
            : 0;
        return {
            actorOverlap,
            directorMatch: false,
            combinedScore: actorOverlap * 0.7
        };
    }
    /**
     * Cache talent data by title ID
     * Useful for avoiding repeated extraction
     */
    static cacheTalent(titleId, talentData) {
        this.talentCache.set(titleId, {
            data: talentData,
            timestamp: Date.now()
        });
    }
    /**
     * Retrieve cached talent data if not expired
     */
    static getCachedTalent(titleId) {
        const cached = this.talentCache.get(titleId);
        if (!cached)
            return null;
        // Check if expired
        if (Date.now() - cached.timestamp > this.CACHE_TTL) {
            this.talentCache.delete(titleId);
            return null;
        }
        return cached.data;
    }
    /**
     * Clear entire cache (for testing or manual reset)
     */
    static clearCache() {
        this.talentCache.clear();
    }
    /**
     * Get cache size (for monitoring)
     */
    static getCacheSize() {
        return this.talentCache.size;
    }
}
// Simple cache: titleId -> TalentData (1 hour TTL)
TalentMatcher.talentCache = new Map();
TalentMatcher.CACHE_TTL = 60 * 60 * 1000; // 1 hour
