import { useState } from 'react'
import HomePage from './pages/HomePage'
import ResultsPage from './pages/ResultsPage'
import './App.css'

interface RecommendationRequest {
  description: string
  region?: string
  preferences?: {
    genres?: string[]
    mood?: string[]
    type?: 'movie' | 'tv' | 'both'
    maxRating?: string
  }
}

function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'results'>('home')
  const [results, setResults] = useState<any[]>([])
  const [query, setQuery] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const inferRegionFromLocale = (): string => {
    const locale = navigator.language || 'en-US'
    const parts = locale.split('-')
    if (parts.length > 1 && parts[1].length === 2) {
      return parts[1].toUpperCase()
    }
    return 'US'
  }

  const handleSubmit = async (request: RecommendationRequest) => {
    setLoading(true)
    setError(null)
    const payload: RecommendationRequest = {
      ...request,
      region: inferRegionFromLocale()
    }
    
    try {
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to get recommendations')
      }

      const data = await response.json()
      setResults(data.recommendations || [])
      setQuery(request.description.trim() ? request.description : 'Preferences-based recommendations')
      setCurrentPage('results')
    } catch (error) {
      console.error('Error:', error)
      setError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleBackHome = () => {
    setCurrentPage('home')
    setResults([])
    setQuery('')
    setError(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {currentPage === 'home' ? (
        <HomePage onSubmit={handleSubmit} loading={loading} error={error} />
      ) : (
        <ResultsPage results={results} query={query} onBackHome={handleBackHome} />
      )}
    </div>
  )
}

export default App
