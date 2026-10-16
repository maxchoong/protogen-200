/**
 * Media-aware genre taxonomy.
 *
 * TMDB uses different genre lists for films and TV. Several canonical genres
 * (Thriller, Horror, History, Music) do not exist as TV genres, and others are
 * merged (e.g. "Sci-Fi & Fantasy"). These helpers keep retrieval, hard filtering
 * and scoring consistent across both media types.
 */

/**
 * Canonical genres that TMDB TV metadata expresses through other genres.
 * A series tagged with any equivalent is treated as satisfying the genre.
 */
export const SERIES_GENRE_EQUIVALENTS: Record<string, string[]> = {
  Thriller: ['Crime', 'Mystery']
}

/**
 * TMDB keyword searches used to retrieve series for genres that TV genre IDs
 * cannot express (or express only sparsely).
 */
export const SERIES_KEYWORD_FALLBACKS: Record<string, string[]> = {
  Thriller: ['thriller', 'psychological thriller', 'suspense'],
  Horror: ['horror', 'supernatural horror', 'ghost', 'zombie'],
  History: ['historical drama', 'period drama', 'historical'],
  Romance: ['romance', 'love story'],
  Music: ['music', 'musician']
}

export interface GenreMatchable {
  type?: string
  genres?: string[]
  genreKeywordMatches?: string[]
}

/**
 * Genres a title can be matched against, including keyword-retrieval evidence
 * and series-only equivalents.
 */
export function matchableGenres(title: GenreMatchable): string[] {
  const genres = new Set<string>([...(title.genres || []), ...(title.genreKeywordMatches || [])])
  if (title.type === 'series' || title.type === 'tv') {
    for (const [genre, equivalents] of Object.entries(SERIES_GENRE_EQUIVALENTS)) {
      if (equivalents.some(equivalent => genres.has(equivalent))) {
        genres.add(genre)
      }
    }
  }
  return Array.from(genres)
}

export function titleMatchesAnyGenre(title: GenreMatchable, requiredGenres: string[]): boolean {
  const available = new Set(matchableGenres(title).map(genre => genre.toLowerCase()))
  return requiredGenres.some(genre => available.has(genre.toLowerCase()))
}

/** Expands requested genres with their series equivalents for TV discovery. */
export function expandGenresForSeries(genres: string[]): string[] {
  return Array.from(new Set(genres.flatMap(genre => [genre, ...(SERIES_GENRE_EQUIVALENTS[genre] || [])])))
}
