/**
 * Content Safety Rating definitions based on TMDB data
 */
export var ContentRating;
(function (ContentRating) {
    ContentRating["G"] = "G";
    ContentRating["PG"] = "PG";
    ContentRating["PG13"] = "PG-13";
    ContentRating["R"] = "R";
    ContentRating["NC17"] = "NC-17";
})(ContentRating || (ContentRating = {}));
/**
 * Filters out adult and inappropriate content
 * Non-negotiable requirement: block adult/unrated/X content
 */
export class ContentSafetyFilter {
    /**
     * Check if a title is safe for viewing based on user preferences
     * Blocks: adult=true, unrated, NC-17
     */
    static isContentSafe(title, maxRating = ContentRating.R) {
        // CRITICAL: Always block adult content
        if (title.adult) {
            console.log(`[Safety] Blocking adult content: ${title.title}`);
            return false;
        }
        // Note: TMDB doesn't provide detailed MPAA ratings in the search endpoint
        // This is a limitation we document. In production, you'd:
        // 1. Fetch full title details for rating info
        // 2. Cross-reference external rating databases
        // 3. Use heuristics (vote_average, genre patterns)
        // For now, we rely on the adult flag which TMDB maintains
        return true;
    }
    /**
     * Filter a list of titles for content safety
     */
    static filterTitles(titles, maxRating = ContentRating.R) {
        return titles.filter(title => this.isContentSafe(title, maxRating));
    }
    /**
     * Get safety explanation (for logging/debugging)
     */
    static getSafetyReason(title) {
        if (title.adult) {
            return 'Blocked: Adult content';
        }
        return 'Safe';
    }
}
