export interface RecommendationProgress {
  stage: 'understanding' | 'retrieval' | 'ranking' | 'verification' | 'catalogue_choices'
  elapsedMs: number
}

const stages = new Set(['understanding', 'retrieval', 'ranking', 'verification', 'catalogue_choices'])

export async function readRecommendationStream<T>(
  response: Response,
  onProgress?: (progress: RecommendationProgress) => void,
  signal?: AbortSignal
): Promise<T> {
  if (!response.body) throw new Error('The recommendation response was empty. Please try again.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let terminal: T | undefined
  let hasTerminal = false
  let ended = false
  const consume = (event: string) => {
    const lines = event.split('\n')
    const type = lines.find(line => line.startsWith('event:'))?.slice(6).trim()
    const text = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!text) return
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('The recommendation service sent an invalid response. Please try again.')
      throw error
    }
    if (!data || typeof data !== 'object') throw new Error('Invalid recommendation stream event.')
    if (hasTerminal) throw new Error('Unexpected event after the recommendation response.')
    if (type === 'progress') {
      if (!('stage' in data) || typeof data.stage !== 'string' || !stages.has(data.stage) ||
          !('elapsedMs' in data) || typeof data.elapsedMs !== 'number' || !Number.isFinite(data.elapsedMs) || data.elapsedMs < 0) {
        throw new Error('Invalid recommendation progress event.')
      }
      onProgress?.(data as RecommendationProgress)
    } else if (type === 'response' || type === 'error') {
      if (!('success' in data) || typeof data.success !== 'boolean') throw new Error('Invalid recommendation response event.')
      if (!data.success || type === 'error') {
        throw new Error('message' in data && typeof data.message === 'string' ? data.message : 'The recommendation search failed. Please try again.')
      }
      const recommendations = 'recommendations' in data ? data.recommendations : undefined
      const clarification = 'requiresClarification' in data ? data.requiresClarification : undefined
      const validResults = Array.isArray(recommendations) && recommendations.every(item =>
        item && typeof item === 'object' && typeof item.id === 'string' && typeof item.title === 'string')
      const validClarification = clarification && typeof clarification === 'object' &&
        'context' in clarification && typeof clarification.context === 'string' &&
        'questions' in clarification && Array.isArray(clarification.questions) && clarification.questions.length > 0 &&
        clarification.questions.every(question => question && typeof question === 'object' &&
          typeof question.id === 'string' && typeof question.question === 'string' &&
          ['select', 'text', 'boolean'].includes(question.type))
      if ((recommendations !== undefined && !validResults) || (clarification !== undefined && !validClarification) ||
          (!validResults && !validClarification)) {
        throw new Error('The recommendation service sent an incomplete response. Please try again.')
      }
      terminal = data as T
      hasTerminal = true
    } else {
      throw new Error('Unrecognised recommendation stream event.')
    }
  }
  try {
    while (!ended) {
      signal?.throwIfAborted()
      const { done, value } = await reader.read()
      ended = done
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        consume(event)
      }
    }
    signal?.throwIfAborted()
    if (!hasTerminal || buffer.trim()) throw new Error('The recommendation connection ended before a complete response. Please try again.')
    return terminal as T
  } finally {
    try {
      await reader.cancel()
    } finally {
      reader.releaseLock()
    }
  }
}
