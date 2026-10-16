import { assessSpecTurn, diffSpecs, emptySpec, releaseWindow, summariseOrigins, toIsoDate, validateSpec, validateSpecTurn } from '../requestSpec'
import { PreferenceParser } from '../preferenceParser'
import { recommendationEngine } from '../recommendationEngine'
import { fmdbClient } from '../../clients/fmdb'
import { llmClient } from '../../clients/llm'
import { tmdbClient } from '../../clients/tmdb'

const today = new Date('2026-10-15T12:00:00Z')

describe('usable structured updates', () => {
  const previous = validateSpec({
    countries: ['MY'], languages: ['ms'], format: 'movie', genres: ['Comedy'],
    years: { min: 2000 }, excludeGenres: ['Horror'], maxCertification: 'PG'
  }, today)

  it.each([null, [], {}, { operation: 'explode', spec: previous }, { operation: 'refine', spec: {} }])(
    'rejects malformed or empty understanding: %j', raw => {
      expect(assessSpecTurn(raw, previous, today).accepted).toBe(false)
    }
  )

  it.each([
    { countries: [] }, { countries: ['ID'] }, { languages: [] }, { format: 'both' },
    { years: undefined }, { years: { min: 1990 } }, { excludeGenres: [] },
    { maxCertification: 'R' }
  ])('does not let refine silently lose hard constraints: %j', change => {
    expect(assessSpecTurn({ operation: 'refine', spec: { ...previous, ...change } }, previous, today).accepted).toBe(false)
  })

  it('permits narrowing, explicit removal/replacement/pivot and compatible addition', () => {
    for (const [operation, spec] of [
      ['refine', { ...previous, years: { min: 2010 }, tones: ['Happy'] }],
      ['add', { ...previous, countries: ['MY', 'ID'] }],
      ['remove', { ...previous, countries: [] }],
      ['replace', { ...previous, countries: ['ID'] }],
      ['pivot', { genres: ['Documentary'], format: 'tv' }],
      ['remove', { ...emptySpec(), years: null, maxCertification: null }]
    ]) {
      expect(assessSpecTurn({ operation, spec }, previous, today).accepted).toBe(true)
    }
  })

  it('requires populated saved fields to be present even for replace/remove', () => {
    expect(assessSpecTurn({
      operation: 'replace', spec: { countries: ['ID'], format: 'movie' }
    }, previous, today).accepted).toBe(false)
  })

  it.each([{ countries: 'MY' }, { genres: null }, { format: 'cinema' }])(
    'rejects malformed field shapes rather than silently defaulting: %j', change => {
      expect(assessSpecTurn({ operation: 'refine', spec: { ...previous, ...change } }, previous, today).accepted).toBe(false)
    }
  )

  it('protects absolute and relative windows from implicit loosening', () => {
    const recent = validateSpec({ format: 'movie', releasedWithinDays: 7 }, today)
    expect(assessSpecTurn({
      operation: 'refine', spec: { ...recent, releasedWithinDays: 31 }
    }, recent, today).accepted).toBe(false)
    expect(assessSpecTurn({
      operation: 'refine', spec: { ...recent, releasedWithinDays: 3 }
    }, recent, today).accepted).toBe(true)
    expect(toIsoDate('2026-02-30')).toBeUndefined()
    expect(toIsoDate('2026-10-15')).toBe('2026-10-15')
  })
})

describe('validateSpec', () => {
  it('keeps valid ISO codes and drops invented ones', () => {
    const spec = validateSpec({ countries: ['my', 'ID', 'XX', 'Malaysia'], languages: ['ms', 'zz', 'cn', 'Spanish'] }, today)
    expect(spec.countries).toEqual(['MY', 'ID'])
    expect(spec.languages).toEqual(['ms', 'cn'])
  })

  it('canonicalises genres and tones and removes excluded genres', () => {
    const spec = validateSpec({
      genres: ['science fiction', 'crime', 'Horror', 'space opera'],
      excludeGenres: ['horror'],
      tones: ['dark', 'Gritty', 'Funny']
    }, today)
    expect(spec.genres).toEqual(['Sci-Fi', 'Crime'])
    expect(spec.excludeGenres).toEqual(['Horror'])
    expect(spec.tones).toEqual(['Dark', 'Funny'])
  })

  it('swaps reversed years and ignores out-of-range values', () => {
    expect(validateSpec({ years: { min: 1999, max: 1990 } }, today).years).toEqual({ min: 1990, max: 1999 })
    expect(validateSpec({ years: { min: 1200, max: '2015' } }, today).years).toEqual({ max: 2015 })
    expect(validateSpec({ years: { min: null, max: null } }, today).years).toBeUndefined()
  })

  it('keeps people distinct and drops a reference from its own suggestions', () => {
    const spec = validateSpec({
      references: ['Inception'],
      referenceSuggestions: ['inception', 'Paprika'],
      actors: ['Christopher Nolan', 'Keanu Reeves'],
      creators: [{ name: 'Christopher Nolan', role: 'director', allowOtherRoles: true }, { name: 'Nobody', role: 'grip' }]
    }, today)
    expect(spec.referenceSuggestions).toEqual(['Paprika'])
    expect(spec.actors).toEqual(['Keanu Reeves'])
    expect(spec.creators).toEqual([{ name: 'Christopher Nolan', role: 'director', allowOtherRoles: true }])
  })

  it('defaults unknown output to an empty request', () => {
    expect(validateSpec('nonsense', today)).toEqual(emptySpec())
    expect(validateSpecTurn({ operation: 'explode', spec: {} }, true, today).operation).toBe('refine')
    expect(validateSpecTurn({ operation: 'add', spec: {} }, false, today).operation).toBe('new')
  })
})

describe('summariseOrigins', () => {
  it('describes an added country alongside the previous one', () => {
    const previous = { ...emptySpec(), countries: ['MY'] }
    const next = { ...emptySpec(), countries: ['MY', 'ID'] }
    expect(summariseOrigins(previous, next)).toEqual(expect.objectContaining({
      originCountry: 'MY|ID',
      originCountryName: 'Malaysian or Indonesian',
      originChange: 'added',
      originChangeNote: 'Added Indonesian alongside Malaysian.'
    }))
  })

  it('describes a replaced and a narrowed origin', () => {
    const previous = { ...emptySpec(), countries: ['JP', 'KR'] }
    expect(summariseOrigins(previous, { ...emptySpec(), countries: ['TH'] })).toEqual(expect.objectContaining({
      originChange: 'replaced', originChangeNote: 'Switched to Thai.'
    }))
    expect(summariseOrigins(previous, { ...emptySpec(), countries: ['KR'] })).toEqual(expect.objectContaining({
      originChange: 'narrowed'
    }))
  })

  it('names languages and reports no change on the first turn', () => {
    const summary = summariseOrigins(undefined, { ...emptySpec(), languages: ['es', 'pt'] })
    expect(summary.originalLanguage).toBe('es|pt')
    expect(summary.originalLanguageName).toBe('Spanish or Portuguese')
    expect(summary.originChange).toBeUndefined()
  })
})

describe('diffSpecs and releaseWindow', () => {
  it('lists changed fields only', () => {
    const previous = { ...emptySpec(), genres: ['Crime'], format: 'tv' as const }
    const next = { ...emptySpec(), genres: ['Crime', 'Mystery'], format: 'tv' as const, tones: ['Dark'] }
    expect(diffSpecs(previous, next).map(change => [change.field, change.kind])).toEqual([
      ['genres', 'added'], ['tones', 'added']
    ])
  })

  it('turns relative recency into dates and copy', () => {
    expect(releaseWindow({ ...emptySpec(), releasedWithinDays: 31 }, today)).toEqual({
      gte: '2026-09-14', lte: '2026-10-15', label: 'released in the last month'
    })
    expect(releaseWindow(emptySpec(), today)).toBeUndefined()
  })
})

describe('PreferenceParser with a spec', () => {
  const nordic = validateSpec({
    countries: ['SE', 'DK', 'NO', 'IS', 'FI'], format: 'tv', genres: ['Crime', 'Mystery'], tones: ['Dark']
  }, today)

  it('takes constraints from the spec over rule extraction', () => {
    const preferences = PreferenceParser.parse({ description: 'Nordic noir series', spec: nordic, specOperation: 'new' })
    expect(preferences.originCountry).toBe('SE|DK|NO|IS|FI')
    expect(preferences.contentType).toBe('tv')
    expect(preferences.genres).toEqual(['Crime', 'Mystery'])
    expect(preferences.explicitGenres).toEqual(['Crime', 'Mystery'])
    expect(preferences.mood).toEqual(['Dark'])
    expect(preferences.turnOperation).toBeUndefined()
  })

  it('clears a constraint the spec dropped even when earlier turns mention it', () => {
    const previousSpec = validateSpec({ countries: ['JP'], format: 'movie', genres: ['Animation'] }, today)
    const spec = validateSpec({ format: 'movie', genres: ['Animation'] }, today)
    const preferences = PreferenceParser.parse({
      description: 'Japanese anime movies',
      clarificationContext: {
        clarificationRound: 1,
        userClarification: 'any country is fine',
        userTurns: ['Japanese anime movies', 'any country is fine']
      },
      spec,
      previousSpec,
      specOperation: 'remove'
    })
    expect(preferences.originCountry).toBeUndefined()
    expect(preferences.turnOperation).toEqual(expect.objectContaining({ continuity: 'continue', operation: 'widen' }))
  })

  it('maps a widened origin to a widen turn with a change note', () => {
    const previousSpec = validateSpec({ countries: ['MY'], format: 'movie' }, today)
    const spec = validateSpec({ countries: ['MY', 'ID'], format: 'movie' }, today)
    const preferences = PreferenceParser.parse({
      description: 'Malaysian movies',
      clarificationContext: {
        clarificationRound: 1,
        userClarification: 'What about Indonesian films too?',
        userTurns: ['Malaysian movies', 'What about Indonesian films too?']
      },
      spec,
      previousSpec,
      specOperation: 'add'
    })
    expect(preferences.originChangeNote).toBe('Added Indonesian alongside Malaysian.')
    expect(preferences.turnOperation).toEqual(expect.objectContaining({
      operation: 'widen', rationaleTags: expect.arrayContaining(['llm_spec', 'origin_added'])
    }))
  })

  it('treats a pivot as a hard pivot and flags new anchors', () => {
    const previousSpec = validateSpec({ genres: ['Horror'] }, today)
    const spec = validateSpec({ references: ['Toy Story'], genres: ['Animation', 'Family'] }, today)
    const preferences = PreferenceParser.parse({
      description: 'scary movies',
      clarificationContext: { clarificationRound: 1, userClarification: 'actually, something like Toy Story' },
      spec,
      previousSpec,
      specOperation: 'pivot'
    })
    expect(preferences.referenceTitle).toEqual(['Toy Story'])
    expect(preferences.excludedGenres).toEqual([])
    expect(preferences.turnOperation).toEqual(expect.objectContaining({
      continuity: 'hard_pivot', operation: 'replace', rationaleTags: expect.arrayContaining(['anchor_shift'])
    }))
  })
})

describe('PreferenceParser spec genres', () => {
  it('treats Indie as discovery intent rather than a required genre', () => {
    const spec = validateSpec({ genres: ['Horror', 'Indie'], releasedWithinDays: 31 }, today)
    const preferences = PreferenceParser.parse({ description: 'new horror', spec, specOperation: 'new' })
    expect(preferences.explicitGenres).toEqual(['Horror'])
    expect(preferences.genres).toEqual(expect.arrayContaining(['Horror', 'Indie']))
    expect(preferences.noveltyIntent).toBe(true)
  })
})

describe('PreferenceParser spec popularity', () => {
  it('ignores popularity the user did not ask for', () => {
    const spec = validateSpec({ popularity: 'mainstream' }, today)
    const preferences = PreferenceParser.parse({ description: 'something good to watch', spec, specOperation: 'new' })
    expect(preferences.popularityPreference).toBeUndefined()
  })

  describe('Structured refinement retrieval', () => {
    const previousSpec = validateSpec({ format: 'movie', genres: ['Sci-Fi'] }, today)
    const previousIds = Array.from({ length: 12 }, (_, index) => `tt92000${index}`)
    const film = (id: string, year: string) => ({
      imdbID: id, Title: `Film ${id}`, Year: year, Type: 'movie' as const,
      Plot: 'A thoughtful science fiction story.', Genre: 'Sci-Fi', imdbRating: '7.4',
      Poster: 'N/A', Rated: 'PG-13', Director: 'N/A', Actors: 'N/A'
    })

    beforeEach(() => {
      jest.spyOn(llmClient, 'isEnabled').mockReturnValue(false)
      jest.spyOn(tmdbClient, 'isEnabled').mockReturnValue(false)
      jest.spyOn(fmdbClient, 'getDetails').mockImplementation(async id => film(id, '2026'))
      jest.spyOn(fmdbClient, 'searchWithDetails').mockResolvedValue([film('tt9209999', '1995')])
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it.each([
      { years: { min: 1990, max: 1999 } },
      { releasedWithinDays: 365 },
      { genres: ['Sci-Fi', 'Comedy'] },
      { countries: ['FR'] },
      { languages: ['fr'] },
      { format: 'tv' },
      { excludeGenres: ['Horror'] }
    ])('searches the catalogue again when the search scope changes: %j', async change => {
      await recommendationEngine.getRecommendations({
        description: 'sci-fi movies',
        previousSpec,
        spec: validateSpec({ ...previousSpec, ...change }, today),
        specOperation: 'refine',
        clarificationContext: {
          clarificationRound: 1, userClarification: 'narrow it down',
          previousRecommendationIds: previousIds
        }
      })

      expect(fmdbClient.searchWithDetails).toHaveBeenCalled()
    })

    it('returns newly retrieved titles from the requested decade, not an empty prior pool', async () => {
      const recommendations = await recommendationEngine.getRecommendations({
        description: 'sci-fi movies',
        previousSpec,
        spec: validateSpec({ ...previousSpec, years: { min: 1990, max: 1999 } }, today),
        specOperation: 'refine',
        clarificationContext: {
          clarificationRound: 1, userClarification: 'just ones from the 90s',
          previousRecommendationIds: previousIds
        }
      })

      expect(recommendations.map(item => item.year)).toEqual(['1995'])
      expect(recommendations[0].id).toBe('tt9209999')
    })

    it.each([{}, { tones: ['Thoughtful'] }])('keeps reuse for an unchanged scope: %j', async change => {
      const recommendations = await recommendationEngine.getRecommendations({
        description: 'sci-fi movies',
        previousSpec,
        spec: validateSpec({ ...previousSpec, ...change }, today),
        specOperation: 'refine',
        clarificationContext: {
          clarificationRound: 1, userClarification: 'make it more thoughtful',
          previousRecommendationIds: previousIds
        }
      })

      expect(recommendations.length).toBeGreaterThan(0)
      expect(fmdbClient.searchWithDetails).not.toHaveBeenCalled()
    })
  })

  it('keeps popularity backed by the wording', () => {
    const spec = validateSpec({ genres: ['Horror'], popularity: 'niche' }, today)
    const preferences = PreferenceParser.parse({ description: 'underrated horror', spec, specOperation: 'new' })
    expect(preferences.popularityPreference).toBe('niche')
  })
})
