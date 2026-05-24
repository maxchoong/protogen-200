import { useState, useEffect, useRef } from 'react'
import { buttonClass, inlineActionClass } from '../buttonStyles'

interface Recommendation {
  id: string
  title: string
  year: string
  type: string
  genres?: string[]
  originalLanguage?: string
  certification?: string
  runtimeMinutes?: number
  rating?: number
  voteCount?: number
  mainCast?: string[]
  directors?: string[]
  synopsis?: string
  whyThis?: string
  posterUrl?: string
  availability?: {
    platform: string
    type: string
    link?: string
  }[]
  trailerUrl?: string
}

interface TurnOperation {
  continuity: 'continue' | 'soft_pivot' | 'hard_pivot'
  operation: 'narrow' | 'widen' | 'replace'
  confidence: number
  rationaleTags: string[]
}

interface ResultsPageProps {
  results: Recommendation[]
  query: string
  passIndex: number
  passCount: number
  triggerText?: string
  turnOperation?: TurnOperation
  activeConstraints?: string[]
  interpretationNote?: string
  retrievalDiagnostics?: {
    tmdbEnabled: boolean
    usedTmdb: boolean
    usedOmdb: boolean
    omdbFallbackUsed: boolean
    streaming?: {
      enabled: boolean
      country: string
      status: 'ok' | 'rate_limited' | 'error' | 'disabled' | 'not_requested'
    }
  }
  onPreviousPass: () => void
  onNextPass: () => void
}

interface HighlightTile {
  id: string
  title: string
  year?: string
  type: 'movie' | 'tv'
  rating: number
  voteCount: number
  posterUrl: string
  synopsis?: string
  genres?: string[]
  originalLanguage?: string
  runtimeMinutes?: number
  mainCast?: string[]
  directors?: string[]
  trailerUrl?: string
}

const HIGHLIGHTS_STORAGE_KEY = 'lumera:session-highlights:v1'
const HIGHLIGHT_DETAILS_CACHE_STORAGE_KEY = 'lumera:highlight-details-cache:v1'
const AVAILABILITY_CACHE_STORAGE_KEY = 'lumera:availability-cache:v1'
const AVAILABILITY_DIAGNOSTICS_STORAGE_KEY = 'lumera:availability-diagnostics:v1'
const HIGHLIGHT_COUNT = 6
const MIN_HIGHLIGHT_RATING = 6.5
const MIN_HIGHLIGHT_VOTE_COUNT = 200

const pickRandomItems = <T,>(items: T[], count: number): T[] => {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

const formatRuntime = (runtimeMinutes?: number): string | null => {
  if (!runtimeMinutes || runtimeMinutes <= 0) {
    return null
  }

  const hours = Math.floor(runtimeMinutes / 60)
  const minutes = runtimeMinutes % 60

  if (hours === 0) {
    return `${minutes}m`
  }

  if (minutes === 0) {
    return `${hours}h`
  }

  return `${hours}h ${minutes}m`
}

const formatVoteCount = (voteCount?: number): string | null => {
  if (!voteCount || voteCount <= 0) {
    return null
  }

  return voteCount.toLocaleString()
}

const languageDisplayNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames !== 'undefined'
    ? new Intl.DisplayNames(['en'], { type: 'language' })
    : null

const formatLanguageName = (languageCode?: string): string | null => {
  if (!languageCode) {
    return null
  }

  const normalized = languageCode.toLowerCase()
  const fullName = languageDisplayNames?.of(normalized)
  if (fullName && fullName.toLowerCase() !== normalized) {
    return fullName
  }

  return normalized.toUpperCase()
}

const regionDisplayNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames !== 'undefined'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

const formatRegionName = (regionCode?: string): string => {
  if (!regionCode) {
    return 'your location'
  }

  const normalized = regionCode.toUpperCase()
  const fullName = regionDisplayNames?.of(normalized)
  if (fullName && fullName.toLowerCase() !== normalized.toLowerCase()) {
    return fullName
  }

  return normalized
}

const streamingTypePriority: Record<string, number> = {
  subscription: 0,
  free: 1,
  addon: 2,
  rent: 3,
  buy: 4
}

const normalizeWatchOptions = (
  availability?: Recommendation['availability']
): NonNullable<Recommendation['availability']> => {
  if (!availability || availability.length === 0) {
    return []
  }

  const sorted = [...availability].sort((a, b) => {
    const typeDelta = (streamingTypePriority[a.type] ?? 99) - (streamingTypePriority[b.type] ?? 99)
    if (typeDelta !== 0) {
      return typeDelta
    }

    if (!!a.link !== !!b.link) {
      return a.link ? -1 : 1
    }

    return a.platform.localeCompare(b.platform)
  })

  const dedupedByPlatform = new Map<string, NonNullable<Recommendation['availability']>[number]>()
  for (const option of sorted) {
    const key = option.platform.trim().toLowerCase()
    if (!dedupedByPlatform.has(key)) {
      dedupedByPlatform.set(key, option)
    }
  }

  return Array.from(dedupedByPlatform.values()).slice(0, 6)
}

const clampLinesStyle = (lines: number) => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden'
})

const detailsLabelClass = 'text-[11px] uppercase tracking-[0.11em] text-text-muted'
const detailsMetaLabelClass = 'text-[11px] uppercase tracking-[0.11em] text-text-muted/90'
const detailsSubLabelClass = 'text-[10px] uppercase tracking-[0.11em] text-text-muted/90'
const detailsCounterLabelClass = 'text-[10px] uppercase tracking-[0.11em] text-text-muted opacity-75'

const getMetaLine = (rec: Recommendation): string => {
  const parts: string[] = []

  if (rec.year) {
    parts.push(rec.year)
  }

  parts.push(rec.type === 'tv' ? 'Series' : 'Film')

  const runtime = formatRuntime(rec.runtimeMinutes)
  if (runtime) {
    parts.push(runtime)
  }

  if (typeof rec.rating === 'number' && rec.rating > 0) {
    const votes = formatVoteCount(rec.voteCount)
    parts.push(votes ? `${rec.rating.toFixed(1)}/10 (${votes} votes)` : `${rec.rating.toFixed(1)}/10`)
  }

  return parts.join(' • ')
}

const mapHighlightToRecommendation = (highlight: HighlightTile): Recommendation => ({
  id: highlight.id,
  title: highlight.title,
  year: highlight.year || 'Unknown year',
  type: highlight.type,
  genres: highlight.genres,
  originalLanguage: highlight.originalLanguage,
  runtimeMinutes: highlight.runtimeMinutes,
  rating: highlight.rating,
  voteCount: highlight.voteCount,
  mainCast: highlight.mainCast,
  directors: highlight.directors,
  synopsis: highlight.synopsis,
  posterUrl: highlight.posterUrl,
  trailerUrl: highlight.trailerUrl
})

const parseHighlightId = (id: string): { type: 'movie' | 'tv'; tmdbId: number } | null => {
  const match = id.match(/^(movie|tv)-(\d+)$/)
  if (!match) {
    return null
  }

  const tmdbId = Number.parseInt(match[2], 10)
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
    return null
  }

  return {
    type: match[1] as 'movie' | 'tv',
    tmdbId
  }
}

const getBackendUrl = (): string => {
  return (
    import.meta.env.VITE_BACKEND_URL ||
    (import.meta.env.DEV
      ? 'http://localhost:3000'
      : 'https://protogen-backend-1bvp.onrender.com')
  )
}

const inferRegionFromLocale = (): string => {
  const locale = navigator.language || 'en-US'
  const normalizedLocale = locale.replace('_', '-')
  const localeParts = normalizedLocale.split('-')
  const localeRegion = localeParts.length > 1 ? localeParts[localeParts.length - 1] : ''

  if (localeRegion.length === 2) {
    const region = localeRegion.toUpperCase()
    return region === 'UK' ? 'GB' : region
  }

  return 'US'
}

const isImdbId = (id: string): boolean => /^tt\d{5,}$/.test(id)

export default function ResultsPage({
  results,
  query,
  passIndex,
  passCount,
  triggerText,
  turnOperation,
  activeConstraints: _activeConstraints = [],
  interpretationNote,
  retrievalDiagnostics,
  onPreviousPass,
  onNextPass
}: ResultsPageProps) {
  const [trailerModal, setTrailerModal] = useState<{ isOpen: boolean; embedUrl: string; sourceUrl: string; title: string }>({
    isOpen: false,
    embedUrl: '',
    sourceUrl: '',
    title: ''
  })
  const [roundMenuOpen, setRoundMenuOpen] = useState(false)
  const [sessionHighlights, setSessionHighlights] = useState<HighlightTile[]>([])
  const [highlightsLoading, setHighlightsLoading] = useState(false)
  const [highlightPosterReady, setHighlightPosterReady] = useState<Record<string, boolean>>({})
  const [detailsIndex, setDetailsIndex] = useState<number | null>(null)
  const [highlightDetailsIndex, setHighlightDetailsIndex] = useState<number | null>(null)
  const [highlightDetailsCache, setHighlightDetailsCache] = useState<Record<string, Recommendation>>({})
  const [highlightDetailsLoading, setHighlightDetailsLoading] = useState(false)
  const [trailerLoadError, setTrailerLoadError] = useState(false)
  const [trailerLoading, setTrailerLoading] = useState(false)
  const [detailsPanelEntered, setDetailsPanelEntered] = useState(false)
  const [infoPopoverOpen, setInfoPopoverOpen] = useState(false)
  const [availabilityByTitleId, setAvailabilityByTitleId] = useState<Record<string, NonNullable<Recommendation['availability']>>>({})
  const [availabilityDiagnosticsByTitleId, setAvailabilityDiagnosticsByTitleId] = useState<
    Record<string, { enabled: boolean; country: string; status: 'ok' | 'rate_limited' | 'error' | 'disabled' | 'not_requested' }>
  >({})
  const [availabilityLoadingByTitleId, setAvailabilityLoadingByTitleId] = useState<Record<string, boolean>>({})
  const closeDetailsTimerRef = useRef<number | null>(null)
  const headerControlsRef = useRef<HTMLDivElement | null>(null)

  const detailsRec = detailsIndex !== null && detailsIndex >= 0 && detailsIndex < results.length
    ? results[detailsIndex]
    : null

  const highlightDetails =
    highlightDetailsIndex !== null &&
    highlightDetailsIndex >= 0 &&
    highlightDetailsIndex < sessionHighlights.length
      ? sessionHighlights[highlightDetailsIndex]
      : null

  const activeDetailsSource: 'recommendation' | 'highlight' | null = detailsRec
    ? 'recommendation'
    : highlightDetails
      ? 'highlight'
      : null

  const activeDetailsRec: Recommendation | null = detailsRec
    ? detailsRec
    : highlightDetails
      ? (highlightDetailsCache[highlightDetails.id] || mapHighlightToRecommendation(highlightDetails))
      : null

  const activeDetailsIndex = detailsRec
    ? detailsIndex
    : highlightDetails
      ? highlightDetailsIndex
      : null

  const activeDetailsCount = detailsRec
    ? results.length
    : highlightDetails
      ? sessionHighlights.length
      : 0

  const hasInfoPopoverContent =
    !!query ||
    (!!triggerText && triggerText !== query) ||
    !!interpretationNote ||
    !!turnOperation

  const dataSourceSummary = getDataSourceSummary()
  const activeAvailabilityDiagnostics = activeDetailsRec
    ? availabilityDiagnosticsByTitleId[activeDetailsRec.id] || retrievalDiagnostics?.streaming
    : undefined
  const streamingRegionName = formatRegionName(activeAvailabilityDiagnostics?.country)
  const streamingStatus = activeAvailabilityDiagnostics?.status
  const watchOptions = normalizeWatchOptions(
    activeDetailsRec ? (availabilityByTitleId[activeDetailsRec.id] || activeDetailsRec.availability) : undefined
  )
  const isAvailabilityLoading = !!(activeDetailsRec && availabilityLoadingByTitleId[activeDetailsRec.id])
  const streamingEmptyMessage =
    isAvailabilityLoading
      ? `Checking streaming options in ${streamingRegionName}...`
      : streamingStatus === 'rate_limited'
      ? `Streaming lookup is currently rate limited for ${streamingRegionName}.`
      : `No streaming options in ${streamingRegionName}.`

  const getTurnSummary = (): string => {
    if (!turnOperation) {
      return 'Initial round based on your conversation context.'
    }

    if (turnOperation.operation === 'narrow') {
      return 'Narrowed this round based on your latest refinement.'
    }

    if (turnOperation.operation === 'widen') {
      return 'Broadened this round to offer a wider set of options.'
    }

    return 'Shifted direction this round based on your latest message.'
  }

  function getDataSourceSummary(): string | null {
    if (!retrievalDiagnostics) {
      return null
    }

    if (retrievalDiagnostics.omdbFallbackUsed) {
      return 'TMDB + OMDB fallback (TMDB available, OMDB used for result coverage).'
    }

    if (!retrievalDiagnostics.tmdbEnabled && retrievalDiagnostics.usedOmdb) {
      return 'OMDB only (TMDB is not configured in this environment).'
    }

    if (retrievalDiagnostics.usedTmdb && retrievalDiagnostics.usedOmdb) {
      return 'TMDB + OMDB.'
    }

    if (retrievalDiagnostics.usedTmdb) {
      return 'TMDB.'
    }

    if (retrievalDiagnostics.usedOmdb) {
      return 'OMDB.'
    }

    return 'Unavailable.'
  }

  const markHighlightPosterReady = (highlightId: string) => {
    setHighlightPosterReady(prev => {
      if (prev[highlightId]) {
        return prev
      }
      return { ...prev, [highlightId]: true }
    })
  }

  const closeDetailsPanel = () => {
    if (!activeDetailsRec) {
      return
    }

    setDetailsPanelEntered(false)

    if (closeDetailsTimerRef.current !== null) {
      window.clearTimeout(closeDetailsTimerRef.current)
    }

    closeDetailsTimerRef.current = window.setTimeout(() => {
      setDetailsIndex(null)
      setHighlightDetailsIndex(null)
      closeDetailsTimerRef.current = null
    }, 300)
  }

  const openRecommendationDetails = (index: number) => {
    if (closeDetailsTimerRef.current !== null) {
      window.clearTimeout(closeDetailsTimerRef.current)
      closeDetailsTimerRef.current = null
    }

    setHighlightDetailsIndex(null)
    setDetailsIndex(index)
  }

  const openHighlightDetails = (index: number) => {
    if (closeDetailsTimerRef.current !== null) {
      window.clearTimeout(closeDetailsTimerRef.current)
      closeDetailsTimerRef.current = null
    }

    setDetailsIndex(null)
    setHighlightDetailsIndex(index)
  }

  const showPreviousDetails = () => {
    if (activeDetailsSource === 'recommendation' && detailsIndex !== null && detailsIndex > 0) {
      setDetailsIndex(detailsIndex - 1)
      return
    }

    if (activeDetailsSource === 'highlight' && highlightDetailsIndex !== null && highlightDetailsIndex > 0) {
      setHighlightDetailsIndex(highlightDetailsIndex - 1)
    }
  }

  const showNextDetails = () => {
    if (activeDetailsSource === 'recommendation' && detailsIndex !== null && detailsIndex < results.length - 1) {
      setDetailsIndex(detailsIndex + 1)
      return
    }

    if (
      activeDetailsSource === 'highlight' &&
      highlightDetailsIndex !== null &&
      highlightDetailsIndex < sessionHighlights.length - 1
    ) {
      setHighlightDetailsIndex(highlightDetailsIndex + 1)
    }
  }

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && detailsRec) {
        closeDetailsPanel()
      }

      if (e.key === 'Escape' && highlightDetails) {
        closeDetailsPanel()
      }

      if (e.key === 'Escape' && trailerModal.isOpen) {
        closeTrailer()
      }

      if (e.key === 'Escape' && infoPopoverOpen) {
        setInfoPopoverOpen(false)
      }

      if (e.key === 'Escape' && roundMenuOpen) {
        setRoundMenuOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [trailerModal.isOpen, detailsRec, highlightDetails, infoPopoverOpen, roundMenuOpen])

  useEffect(() => {
    if (!infoPopoverOpen) {
      return
    }

    const handlePointerDown = (e: MouseEvent) => {
      if (!headerControlsRef.current) {
        return
      }

      if (!headerControlsRef.current.contains(e.target as Node)) {
        setInfoPopoverOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [infoPopoverOpen])

  useEffect(() => {
    if (!roundMenuOpen) {
      return
    }

    const handlePointerDown = (e: MouseEvent) => {
      if (!headerControlsRef.current) {
        return
      }

      if (!headerControlsRef.current.contains(e.target as Node)) {
        setRoundMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [roundMenuOpen])

  useEffect(() => {
    const storedHighlightDetails = sessionStorage.getItem(HIGHLIGHT_DETAILS_CACHE_STORAGE_KEY)
    if (storedHighlightDetails) {
      try {
        const parsed = JSON.parse(storedHighlightDetails) as Record<string, Recommendation>
        if (parsed && typeof parsed === 'object') {
          setHighlightDetailsCache(parsed)
        }
      } catch {
        // Ignore malformed cache.
      }
    }

    const storedAvailability = sessionStorage.getItem(AVAILABILITY_CACHE_STORAGE_KEY)
    if (storedAvailability) {
      try {
        const parsed = JSON.parse(storedAvailability) as Record<string, NonNullable<Recommendation['availability']>>
        if (parsed && typeof parsed === 'object') {
          setAvailabilityByTitleId(parsed)
        }
      } catch {
        // Ignore malformed cache.
      }
    }

    const storedDiagnostics = sessionStorage.getItem(AVAILABILITY_DIAGNOSTICS_STORAGE_KEY)
    if (storedDiagnostics) {
      try {
        const parsed = JSON.parse(storedDiagnostics) as Record<
          string,
          { enabled: boolean; country: string; status: 'ok' | 'rate_limited' | 'error' | 'disabled' | 'not_requested' }
        >
        if (parsed && typeof parsed === 'object') {
          setAvailabilityDiagnosticsByTitleId(parsed)
        }
      } catch {
        // Ignore malformed cache.
      }
    }
  }, [])

  useEffect(() => {
    sessionStorage.setItem(HIGHLIGHT_DETAILS_CACHE_STORAGE_KEY, JSON.stringify(highlightDetailsCache))
  }, [highlightDetailsCache])

  useEffect(() => {
    sessionStorage.setItem(AVAILABILITY_CACHE_STORAGE_KEY, JSON.stringify(availabilityByTitleId))
  }, [availabilityByTitleId])

  useEffect(() => {
    sessionStorage.setItem(AVAILABILITY_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(availabilityDiagnosticsByTitleId))
  }, [availabilityDiagnosticsByTitleId])

  useEffect(() => {
    setInfoPopoverOpen(false)
  }, [passIndex, query])

  useEffect(() => {
    if (results.length === 0 && detailsIndex !== null) {
      setDetailsIndex(null)
      return
    }

    if (detailsIndex !== null && detailsIndex >= results.length) {
      setDetailsIndex(null)
    }
  }, [detailsIndex, results.length])

  useEffect(() => {
    setHighlightPosterReady({})
  }, [sessionHighlights])

  useEffect(() => {
    if (results.length > 0) {
      setHighlightsLoading(false)
      return
    }

    let cancelled = false

    const loadHighlights = async () => {
      setHighlightsLoading(true)
      const storedHighlights = sessionStorage.getItem(HIGHLIGHTS_STORAGE_KEY)
      if (storedHighlights) {
        try {
          const parsed = JSON.parse(storedHighlights) as HighlightTile[]
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (!cancelled) {
              setSessionHighlights(parsed)
              setHighlightsLoading(false)
            }
            return
          }
        } catch {
          // Ignore malformed session cache.
        }
      }

      try {
        const backendUrl = getBackendUrl()

        const response = await fetch(`${backendUrl}/highlights`)
        if (!response.ok) {
          throw new Error('Highlights request failed')
        }

        const data = await response.json() as { success: boolean; highlights?: HighlightTile[] }
        const highlights = data.highlights || []
        const qualityFiltered = highlights.filter(item =>
          item.rating >= MIN_HIGHLIGHT_RATING && item.voteCount >= MIN_HIGHLIGHT_VOTE_COUNT && !!item.posterUrl
        )

        const source = qualityFiltered.length >= HIGHLIGHT_COUNT ? qualityFiltered : highlights
        const selected = pickRandomItems(source, HIGHLIGHT_COUNT)

        if (!cancelled) {
          setSessionHighlights(selected)
        }
        sessionStorage.setItem(HIGHLIGHTS_STORAGE_KEY, JSON.stringify(selected))
      } catch {
        if (!cancelled) {
          setSessionHighlights([])
        }
      } finally {
        if (!cancelled) {
          setHighlightsLoading(false)
        }
      }
    }

    void loadHighlights()

    return () => {
      cancelled = true
    }
  }, [results.length])

  useEffect(() => {
    if (!highlightDetails) {
      return
    }

    if (highlightDetailsCache[highlightDetails.id]) {
      return
    }

    const parsedId = parseHighlightId(highlightDetails.id)
    if (!parsedId) {
      return
    }

    let cancelled = false

    const loadHighlightDetails = async () => {
      setHighlightDetailsLoading(true)
      try {
        const backendUrl = getBackendUrl()
        const response = await fetch(`${backendUrl}/highlights/${parsedId.type}/${parsedId.tmdbId}`)
        if (!response.ok) {
          throw new Error('Highlight detail request failed')
        }

        const data = await response.json() as { success: boolean; highlightDetails?: Recommendation }
        if (!cancelled && data.success && data.highlightDetails) {
          setHighlightDetailsCache(prev => ({
            ...prev,
            [highlightDetails.id]: {
              ...mapHighlightToRecommendation(highlightDetails),
              ...data.highlightDetails
            }
          }))
        }
      } catch {
        if (!cancelled) {
          setHighlightDetailsCache(prev => ({
            ...prev,
            [highlightDetails.id]: mapHighlightToRecommendation(highlightDetails)
          }))
        }
      } finally {
        if (!cancelled) {
          setHighlightDetailsLoading(false)
        }
      }
    }

    void loadHighlightDetails()

    return () => {
      cancelled = true
    }
  }, [highlightDetails, highlightDetailsCache])

  useEffect(() => {
    if (!activeDetailsRec || !isImdbId(activeDetailsRec.id)) {
      return
    }

    if (availabilityByTitleId[activeDetailsRec.id]) {
      return
    }

    if (availabilityLoadingByTitleId[activeDetailsRec.id]) {
      return
    }

    let cancelled = false

    const loadAvailability = async () => {
      setAvailabilityLoadingByTitleId(prev => ({ ...prev, [activeDetailsRec.id]: true }))

      try {
        const backendUrl = getBackendUrl()
        const region = retrievalDiagnostics?.streaming?.country?.toUpperCase() || inferRegionFromLocale()
        const response = await fetch(
          `${backendUrl}/availability/${activeDetailsRec.id}?region=${encodeURIComponent(region)}`
        )

        if (!response.ok) {
          throw new Error('Availability request failed')
        }

        const data = await response.json() as {
          success: boolean
          availability?: Recommendation['availability']
          diagnostics?: { enabled: boolean; country: string; status: 'ok' | 'rate_limited' | 'error' | 'disabled' | 'not_requested' }
        }

        if (cancelled) {
          return
        }

        setAvailabilityByTitleId(prev => ({
          ...prev,
          [activeDetailsRec.id]: (data.availability || []) as NonNullable<Recommendation['availability']>
        }))

        if (data.diagnostics) {
          setAvailabilityDiagnosticsByTitleId(prev => ({
            ...prev,
            [activeDetailsRec.id]: data.diagnostics!
          }))
        }
      } catch {
        if (cancelled) {
          return
        }

        setAvailabilityByTitleId(prev => ({
          ...prev,
          [activeDetailsRec.id]: []
        }))

        const fallbackCountry = retrievalDiagnostics?.streaming?.country || inferRegionFromLocale().toLowerCase()
        setAvailabilityDiagnosticsByTitleId(prev => ({
          ...prev,
          [activeDetailsRec.id]: {
            enabled: true,
            country: fallbackCountry,
            status: 'error'
          }
        }))
      } finally {
        if (!cancelled) {
          setAvailabilityLoadingByTitleId(prev => ({ ...prev, [activeDetailsRec.id]: false }))
        }
      }
    }

    void loadAvailability()

    return () => {
      cancelled = true
    }
  }, [
    activeDetailsRec,
    availabilityByTitleId,
    availabilityLoadingByTitleId,
    retrievalDiagnostics?.streaming?.country
  ])

  useEffect(() => {
    if (!trailerModal.isOpen || !trailerModal.embedUrl || trailerLoadError || !trailerLoading) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setTrailerLoadError(true)
      setTrailerLoading(false)
    }, 3500)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [trailerModal.isOpen, trailerModal.embedUrl, trailerLoadError, trailerLoading])

  useEffect(() => {
    if (!activeDetailsRec) {
      setDetailsPanelEntered(false)
      return
    }

    const frame = window.requestAnimationFrame(() => {
      setDetailsPanelEntered(true)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [activeDetailsRec])

  useEffect(() => {
    return () => {
      if (closeDetailsTimerRef.current !== null) {
        window.clearTimeout(closeDetailsTimerRef.current)
      }
    }
  }, [])

  const parseYouTubeVideoId = (url: string): string | null => {
    try {
      const parsed = new URL(url)
      const host = parsed.hostname.toLowerCase()

      if (host.includes('youtu.be')) {
        const id = parsed.pathname.split('/').filter(Boolean)[0]
        return id || null
      }

      if (host.includes('youtube.com')) {
        const searchId = parsed.searchParams.get('v')
        if (searchId) {
          return searchId
        }

        const parts = parsed.pathname.split('/').filter(Boolean)
        if (parts[0] === 'embed' && parts[1]) {
          return parts[1]
        }

        if (parts[0] === 'shorts' && parts[1]) {
          return parts[1]
        }
      }
    } catch {
      return null
    }

    return null
  }

  const openTrailer = (url: string, title: string) => {
    const videoId = parseYouTubeVideoId(url)
    const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0` : ''

    setTrailerLoadError(!videoId)
    setTrailerLoading(!!videoId)
    setTrailerModal({
      isOpen: true,
      embedUrl,
      sourceUrl: url,
      title
    })
  }

  const closeTrailer = () => {
    setTrailerLoadError(false)
    setTrailerLoading(false)
    setTrailerModal({ isOpen: false, embedUrl: '', sourceUrl: '', title: '' })
  }

  return (
    <div className="editorial-results-scroll h-full overflow-y-auto px-4">
      <div className="mx-auto max-w-3xl">
        {passCount > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-border">
              <h2 className="font-serif text-2xl font-medium tracking-[-0.02em] text-text">Recommendations</h2>
              <div ref={headerControlsRef} className="relative flex items-center gap-1">
                <button
                  onClick={() => {
                    if (!hasInfoPopoverContent) {
                      return
                    }
                    setInfoPopoverOpen(prev => !prev)
                    setRoundMenuOpen(false)
                  }}
                  className={buttonClass({ variant: 'ghost', size: 'icon-sm' })}
                  aria-label="Why these picks"
                  aria-haspopup="dialog"
                  aria-expanded={infoPopoverOpen}
                  aria-controls="recommendation-context-popover"
                  title="Why these picks"
                  disabled={!hasInfoPopoverContent}
                >
                  <svg
                    className="h-5 w-5 text-text"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 10v6" />
                    <circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
                  </svg>
                </button>

                <button
                  onClick={() => {
                    setRoundMenuOpen(prev => !prev)
                    setInfoPopoverOpen(false)
                  }}
                  className={buttonClass({ variant: 'ghost', size: 'icon-sm' })}
                  aria-label="Round selection menu"
                  title="Select round"
                >
                  <svg
                    className="h-5 w-5 text-text"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>
                </button>

                {infoPopoverOpen && hasInfoPopoverContent && (
                  <div
                    id="recommendation-context-popover"
                    role="dialog"
                    aria-label="Why these picks"
                    className="absolute right-8 top-full z-20 mt-2 w-[22rem] rounded-lg border border-border/80 bg-surface px-4 py-4 shadow-card"
                  >
                    <p className="text-[11px] uppercase tracking-[0.11em] text-text-muted">Why these picks</p>
                    <div className="mt-3 space-y-2.5 text-[12px] leading-[1.6] text-text-muted">
                      <p>
                        <span className="font-medium text-text">Round:</span> {passIndex + 1} of {passCount}
                      </p>
                      {query && (
                        <p>
                          <span className="font-medium text-text">You asked for:</span> {query}
                        </p>
                      )}
                      {triggerText && triggerText !== query && (
                        <p>
                          <span className="font-medium text-text">Latest refinement:</span> {triggerText}
                        </p>
                      )}
                      {interpretationNote && <p>{interpretationNote}</p>}
                      <p>{getTurnSummary()}</p>
                      {dataSourceSummary && (
                        <p>
                          <span className="font-medium text-text">Data source:</span> {dataSourceSummary}
                        </p>
                      )}
                      <div className="pt-1.5">
                        <img
                          src="/assets/tmdb/tmdb-primary-long-blue.svg"
                          alt="TMDB logo"
                          className="mb-2 h-3.5 w-auto"
                          loading="lazy"
                        />
                        <p className="max-w-[34ch] text-[10px] leading-[1.5] text-text-muted">
                          This application uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {roundMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-44 rounded-lg border border-border bg-surface shadow-card z-10">
                    <div className="p-2">
                      {Array.from({ length: passCount }).map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            if (idx < passIndex) {
                              for (let i = 0; i < passIndex - idx; i++) {
                                onPreviousPass()
                              }
                            } else if (idx > passIndex) {
                              for (let i = 0; i < idx - passIndex; i++) {
                                onNextPass()
                              }
                            }
                            setRoundMenuOpen(false)
                          }}
                          className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                            idx === passIndex
                              ? 'bg-surface-2 text-text font-medium ring-1 ring-border/70'
                              : 'text-text hover:bg-surface-2'
                          }`}
                        >
                          Round {idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {results.length === 0 ? (
          <div className="space-y-6" role="status" aria-live="polite">
            {sessionHighlights.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3" role="list" aria-label="Session highlight titles">
                {sessionHighlights.map((item) => (
                  <article
                    key={item.id}
                    className="group space-y-3 rounded-md p-1 -m-1 cursor-pointer transition-colors hover:bg-surface-2/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                    role="button"
                    tabIndex={0}
                    aria-label={`Open highlight details for ${item.title}`}
                    onClick={() => {
                      const index = sessionHighlights.findIndex((entry) => entry.id === item.id)
                      if (index >= 0) {
                        openHighlightDetails(index)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        const index = sessionHighlights.findIndex((entry) => entry.id === item.id)
                        if (index >= 0) {
                          openHighlightDetails(index)
                        }
                      }
                    }}
                  >
                    <div className="relative rounded-lg shadow-card transition-all duration-300 group-hover:-translate-y-[2px] group-focus-visible:-translate-y-[2px] group-hover:shadow-[0_10px_20px_rgba(4,4,7,0.24)] group-focus-visible:shadow-[0_10px_20px_rgba(4,4,7,0.24)]">
                      <div className="relative overflow-hidden rounded-lg">
                        {!highlightPosterReady[item.id] && (
                          <div
                            className="absolute inset-0 rounded-lg animate-pulse bg-surface-2/70"
                            aria-hidden="true"
                          />
                        )}
                        <img
                          src={item.posterUrl}
                          alt={`${item.title} poster`}
                          className={`aspect-[2/3] w-full rounded-lg object-cover transition-opacity duration-300 ${
                            highlightPosterReady[item.id] ? 'opacity-100' : 'opacity-0'
                          }`}
                          loading="lazy"
                          ref={(img) => {
                            if (img && img.complete) {
                              markHighlightPosterReady(item.id)
                            }
                          }}
                          onLoad={() => {
                            markHighlightPosterReady(item.id)
                          }}
                          onError={() => {
                            markHighlightPosterReady(item.id)
                          }}
                        />
                      </div>
                    </div>
                    <p className="text-sm font-medium leading-snug tracking-[-0.01em] text-text">{item.title}</p>
                    <p className="text-xs leading-relaxed tracking-[-0.004em] text-text-muted">
                      {item.year || 'Unknown year'} • {item.type === 'tv' ? 'Series' : 'Film'} • {item.rating.toFixed(1)}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <div
                className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3"
                aria-hidden="true"
                aria-label={highlightsLoading ? 'Loading highlight posters' : 'Highlights unavailable'}
              >
                {Array.from({ length: HIGHLIGHT_COUNT }).map((_, idx) => (
                  <div key={idx} className="space-y-3">
                    <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-surface-2/70" />
                    <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2/70" />
                    <div className="h-2 w-1/2 animate-pulse rounded bg-surface-2/60" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-6" role="list" aria-label="Movie and TV show recommendations">
            {results.map((rec, index) => (
              <article
                key={rec.id}
                className="group rounded-lg shadow-none cursor-pointer transition-all duration-200 hover:-translate-y-[1px] hover:bg-surface-2/35 hover:shadow-[0_8px_18px_rgba(4,4,7,0.26)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                role="button"
                tabIndex={0}
                aria-label={`Open more details for ${rec.title}`}
                onClick={() => openRecommendationDetails(index)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openRecommendationDetails(index)
                  }
                }}
              >
                <div className="p-5">
                  <div className="flex gap-4">
                    {rec.posterUrl ? (
                      <img
                        src={rec.posterUrl}
                        alt={`${rec.title} poster`}
                        className="h-36 w-24 flex-shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="flex h-36 w-24 flex-shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-muted"
                        role="img"
                        aria-label="No poster available"
                      >
                        No poster
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="mb-3 min-w-0">
                        <h3 className="font-serif text-xl font-medium tracking-[-0.018em] text-text">{rec.title}</h3>
                        <p className="text-xs text-text-muted/80">{getMetaLine(rec)}</p>
                      </div>

                      {rec.synopsis ? (
                        <p className="mb-4 text-sm text-text-muted/90" style={clampLinesStyle(2)}>{rec.synopsis}</p>
                      ) : rec.whyThis ? (
                        <p className="mb-4 text-sm text-text-muted/90" style={clampLinesStyle(2)}>{rec.whyThis}</p>
                      ) : null}

                      <div className="mt-2 flex flex-wrap items-center gap-5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openRecommendationDetails(index)
                          }}
                          className={inlineActionClass()}
                          aria-label={`Open more details for ${rec.title}`}
                        >
                          More details
                        </button>
                        {rec.trailerUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              openTrailer(rec.trailerUrl!, rec.title)
                            }}
                            className={inlineActionClass()}
                            aria-label={`Watch trailer for ${rec.title}`}
                          >
                            View trailer
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {activeDetailsRec && (
        <div
          className={`fixed inset-0 z-40 bg-black/55 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
            detailsPanelEntered ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={closeDetailsPanel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="details-title"
        >
          <aside
            className={`absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-border/60 bg-surface px-6 py-7 shadow-card-hover transition-transform duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none sm:px-8 lg:min-w-[40rem] lg:max-w-[54vw] xl:max-w-[50vw] ${
              detailsPanelEntered ? 'translate-x-0' : 'translate-x-8'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={showPreviousDetails}
                  disabled={activeDetailsIndex === null || activeDetailsIndex === 0}
                  className={inlineActionClass('gap-1 text-xs disabled:opacity-45 disabled:cursor-not-allowed disabled:no-underline')}
                  aria-label="Previous title"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  <span>Previous</span>
                </button>

                <p className={detailsCounterLabelClass}>
                  {activeDetailsIndex !== null ? `${activeDetailsIndex + 1} of ${activeDetailsCount}` : ''}
                </p>

                <button
                  onClick={showNextDetails}
                  disabled={activeDetailsIndex === null || activeDetailsIndex >= activeDetailsCount - 1}
                  className={inlineActionClass('gap-1 text-xs disabled:opacity-45 disabled:cursor-not-allowed disabled:no-underline')}
                  aria-label="Next title"
                >
                  <span>Next</span>
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>

              <button
                onClick={closeDetailsPanel}
                className={buttonClass({ variant: 'ghost', size: 'icon-sm', className: 'text-2xl leading-none' })}
                aria-label="Close details panel"
              >
                ×
              </button>
            </div>

            <header className="mb-6">
              <h2 id="details-title" className="font-serif text-[2.2rem] font-medium leading-[1.06] tracking-[-0.024em] text-text sm:text-[2.5rem]">
                {activeDetailsRec.title}
              </h2>
              <p className={`mt-2 ${detailsMetaLabelClass}`}>{getMetaLine(activeDetailsRec)}</p>
            </header>

            <section className="mb-6 grid gap-6 border-b border-border/30 pb-6 md:grid-cols-[168px_1fr]">
              {activeDetailsRec.posterUrl ? (
                <img
                  src={activeDetailsRec.posterUrl}
                  alt={`${activeDetailsRec.title} poster`}
                  className="h-[252px] w-[168px] rounded-lg object-cover shadow-soft"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-[252px] w-[168px] items-center justify-center rounded-lg bg-surface-2 text-text-muted">No poster</div>
              )}

              <div className="min-w-0">
                {highlightDetails && !highlightDetailsCache[highlightDetails.id] && highlightDetailsLoading && (
                  <p className="mb-3 text-xs text-text-muted">Loading full title details...</p>
                )}

                {activeDetailsRec.whyThis && (
                  <div className="mb-6">
                    <div className="mb-2 flex items-center gap-3">
                      <p className={detailsLabelClass}>
                        Lumera note
                      </p>
                      <span
                        className="h-px flex-1"
                        style={{ backgroundColor: 'var(--color-accent)', opacity: 0.45 }}
                        aria-hidden="true"
                      />
                    </div>
                    <p className="max-w-[60ch] font-serif text-[1.08rem] font-medium italic leading-[1.75] text-text/95">
                      {activeDetailsRec.whyThis}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  {activeDetailsRec.trailerUrl && (
                    <button
                      onClick={() => openTrailer(activeDetailsRec.trailerUrl!, activeDetailsRec.title)}
                      className={buttonClass({ variant: 'secondary', size: 'xs', className: 'gap-1.5' })}
                      aria-label={`Watch trailer for ${activeDetailsRec.title}`}
                    >
                      <span>Watch trailer</span>
                    </button>
                  )}

                  {watchOptions.length > 0 ? (
                    watchOptions.map((option) => (
                      option.link ? (
                        <a
                          key={`${option.platform}-${option.type}`}
                          href={option.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonClass({ variant: 'chip', size: 'xs', className: 'no-underline' })}
                        >
                          {option.platform}
                        </a>
                      ) : (
                        <span
                          key={`${option.platform}-${option.type}`}
                          className={buttonClass({ variant: 'chip', size: 'xs', className: 'pointer-events-none' })}
                        >
                          {option.platform}
                        </span>
                      )
                    ))
                  ) : (
                    <span>{streamingEmptyMessage}</span>
                  )}
                </div>
              </div>
            </section>

            {(activeDetailsRec.synopsis || activeDetailsRec.mainCast?.length || activeDetailsRec.directors?.length || activeDetailsRec.genres?.length || activeDetailsRec.originalLanguage) && (
              <section className="pb-6 md:grid md:grid-cols-[minmax(0,1fr)_220px] md:gap-10">
                <div>
                  {activeDetailsRec.synopsis && (
                    <>
                      <p className={`mb-2 ${detailsLabelClass}`}>Synopsis</p>
                      <p className="max-w-[62ch] text-[15px] leading-[1.9] text-text/92">{activeDetailsRec.synopsis}</p>
                    </>
                  )}
                </div>

                {(activeDetailsRec.mainCast?.length || activeDetailsRec.directors?.length || activeDetailsRec.genres?.length || activeDetailsRec.originalLanguage) && (
                  <aside className="mt-6 border-t border-border/25 pt-6 md:mt-0 md:border-t-0 md:pt-0">
                    <div className="grid gap-y-4">
                      {activeDetailsRec.mainCast && activeDetailsRec.mainCast.length > 0 && (
                        <div>
                          <p className={`mb-2 ${detailsSubLabelClass}`}>Cast</p>
                          <ul className="space-y-0.5 text-[12px] leading-[1.75] text-text/80">
                            {activeDetailsRec.mainCast.slice(0, 4).map((name) => (
                              <li key={name}>{name}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {activeDetailsRec.directors && activeDetailsRec.directors.length > 0 && (
                        <div>
                          <p className={`mb-2 ${detailsSubLabelClass}`}>Director</p>
                          <ul className="space-y-0.5 text-[12px] leading-[1.75] text-text/80">
                            {activeDetailsRec.directors.slice(0, 3).map((name) => (
                              <li key={name}>{name}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {activeDetailsRec.genres && activeDetailsRec.genres.length > 0 && (
                        <div>
                          <p className={`mb-2 ${detailsSubLabelClass}`}>Genres</p>
                          <p className="text-[12px] leading-[1.75] text-text/80">{activeDetailsRec.genres.join(', ')}</p>
                        </div>
                      )}
                      {formatLanguageName(activeDetailsRec.originalLanguage) && (
                        <div>
                          <p className={`mb-2 ${detailsSubLabelClass}`}>Language</p>
                          <p className="text-[12px] leading-[1.75] text-text/80">{formatLanguageName(activeDetailsRec.originalLanguage)}</p>
                        </div>
                      )}
                    </div>
                  </aside>
                )}
              </section>
            )}
          </aside>
        </div>
      )}

      {trailerModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={closeTrailer}
          role="dialog"
          aria-modal="true"
          aria-labelledby="trailer-title"
        >
          <div
            className="w-full max-w-4xl overflow-hidden rounded-lg border border-border/70 bg-surface shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4">
              <h2 id="trailer-title" className="text-xl font-semibold tracking-[-0.03em] text-text">
                {trailerModal.title} - Trailer
              </h2>
              <button
                onClick={closeTrailer}
                className={buttonClass({ variant: 'ghost', size: 'icon-sm', className: 'text-2xl leading-none' })}
                aria-label="Close trailer"
              >
                ×
              </button>
            </div>

            {trailerModal.embedUrl && !trailerLoadError ? (
              <div className="relative" style={{ paddingBottom: '56.25%' }}>
                {trailerLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-surface text-sm text-text-muted">
                    Loading trailer...
                  </div>
                )}
                <iframe
                  className="absolute inset-0 h-full w-full border-0"
                  src={trailerModal.embedUrl}
                  title={`${trailerModal.title} Trailer`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  onError={() => {
                    setTrailerLoadError(true)
                    setTrailerLoading(false)
                  }}
                  onLoad={() => setTrailerLoading(false)}
                />
              </div>
            ) : (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-text-muted">Trailer playback is not available in the embedded player for this title.</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 p-4 text-center">
              {trailerModal.sourceUrl && (
                <a
                  href={trailerModal.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: 'secondary', size: 'md' })}
                >
                  Open trailer on source site
                </a>
              )}
              <button
                onClick={closeTrailer}
                className={buttonClass({ variant: 'secondary', size: 'md' })}
                aria-label="Close trailer modal"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
