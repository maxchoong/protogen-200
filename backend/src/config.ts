// Configuration for API keys and environment variables

export const config = {
  tmdb: {
    apiKey: process.env.TMDB_API_KEY || 'demo-key',
    baseUrl: 'https://api.themoviedb.org/3',
    region: process.env.TMDB_REGION || 'US'
  },
  server: {
    port: process.env.PORT || 3000,
    environment: process.env.NODE_ENV || 'development'
  }
}

// Validate required config on startup
export function validateConfig() {
  if (config.tmdb.apiKey === 'demo-key') {
    console.warn('⚠️  TMDB_API_KEY not set. Using demo key - real data unavailable.')
    console.warn('   Set TMDB_API_KEY environment variable to use real TMDB data.')
  }
}
