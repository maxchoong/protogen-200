import { useState } from 'react'
import HomePage from './pages/HomePage'
import ResultsPage from './pages/ResultsPage'
import './App.css'

interface RecommendationRequest {
  description: string
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

  const handleSubmit = async (request: RecommendationRequest) => {
    try {
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        throw new Error('Failed to get recommendations')
      }

      const data = await response.json()
      setResults(data.recommendations || [])
      setQuery(request.description)
      setCurrentPage('results')
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to get recommendations. Please try again.')
    }
  }

  const handleBackHome = () => {
    setCurrentPage('home')
    setResults([])
    setQuery('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {currentPage === 'home' ? (
        <HomePage onSubmit={handleSubmit} />
      ) : (
        <ResultsPage results={results} query={query} onBackHome={handleBackHome} />
      )}
    </div>
  )
}

export default App
