import { TMDBClient } from '../tmdb'

jest.mock('../../config', () => ({
  config: { tmdb: { apiKey: 'test-key', readAccessToken: '', baseUrl: 'https://example.test', region: 'US' } }
}))

describe('Role-aware person filmographies', () => {
  const originalFetch = global.fetch
  const fetchMock = jest.fn()
  const credit = (id: number, job?: string, vote_count = 10) => ({
    id, title: `Film ${id}`, media_type: 'movie', genre_ids: [18], adult: false,
    vote_average: 7, vote_count, job, overview: 'A film', release_date: '1995-01-01', poster_path: '/poster.jpg'
  })

  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/search/person') ? {
        results: [
          { id: 3, name: 'James Cameron Jr', known_for_department: 'Directing' },
          { id: 1, name: 'James Cameron', known_for_department: 'Acting' },
          { id: 2, name: 'James Cameron', known_for_department: 'Directing' }
        ]
      } : {
        cast: [credit(4, undefined, 10000)],
        crew: [credit(1, 'Director', 1), credit(1, 'Screenplay', 1), credit(2, 'Producer', 1000),
          credit(3, 'Assistant Director', 2000), credit(5, 'Executive Producer', 500)]
      }
    }))
  })

  afterAll(() => { global.fetch = originalFetch })

  it('aggregates crew jobs and puts directors before popular fallback credits before limiting', async () => {
    const results = await new TMDBClient().searchTitlesForPerson('James Cameron', {
      creator: { name: 'James Cameron', role: 'director', allowOtherRoles: true }
    }, 2)
    expect(results.map(title => title.id)).toEqual([1, 2])
    expect(results[0].creatorCredits).toEqual([{ name: 'James Cameron', roles: ['director', 'writer'] }])
    expect(fetchMock.mock.calls[1][0]).toContain('/person/2/combined_credits')
  })

  it.each([
    ['director', [1]], ['writer', [1]], ['producer', [2, 5]]
  ] as const)('uses only %s jobs for explicit roles', async (role, expectedIds) => {
    const results = await new TMDBClient().searchTitlesForPerson('James Cameron', {
      creator: { name: 'James Cameron', role, allowOtherRoles: false }
    })
    expect(results.map(title => title.id)).toEqual([...expectedIds])
  })

  it('keeps cast queries unchanged and person resolution caches role-specific', async () => {
    const client = new TMDBClient()
    expect((await client.searchTitlesForPerson('James Cameron')).map(title => title.id)).toEqual([4])
    const creator = { name: 'James Cameron', role: 'director', allowOtherRoles: true } as const
    expect((await client.searchTitlesForPerson('James Cameron', { creator })).map(title => title.id)).toEqual([1, 2, 5])
    expect(fetchMock.mock.calls[1][0]).toContain('/person/1/combined_credits')
    expect(fetchMock.mock.calls[3][0]).toContain('/person/2/combined_credits')
    await client.searchTitlesForPerson('James Cameron', { creator: { ...creator, allowOtherRoles: false } })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('applies media and safety restrictions to creator credits', async () => {
    const client = new TMDBClient()
    const creator = { name: 'James Cameron', role: 'director', allowOtherRoles: true } as const
    expect(await client.searchTitlesForPerson('James Cameron', { creator, includeMovies: false, includeTV: true })).toEqual([])
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    expect(await client.searchTitlesForPerson('Unknown Person', { creator })).toEqual([])
  })
})
describe('Title details', () => {
  const originalFetch = global.fetch
  afterAll(() => { global.fetch = originalFetch })

  it.each([
    [{ origin_country: ['KR'], production_countries: [{ iso_3166_1: 'US' }] }, ['KR']],
    [{ origin_country: [], production_countries: [{ iso_3166_1: 'MY' }, { iso_3166_1: 'ID' }] }, ['MY', 'ID']],
    [{}, undefined]
  ])('keeps origin countries from details %#', async (countries, expected) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 7, title: 'Film', overview: 'A film', genres: [{ id: 18 }], original_language: 'ko', ...countries })
    }) as any
    const details = await new TMDBClient().getTitleDetails(7, 'movie')
    expect(details?.origin_country).toEqual(expected)
  })
})
