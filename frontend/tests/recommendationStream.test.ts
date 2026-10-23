import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readRecommendationStream } from '../src/recommendationStream'

const event = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
const response = (text: string, chunkSize = 1) => {
  const bytes = new TextEncoder().encode(text)
  return new Response(new ReadableStream({
    start(controller) {
      for (let index = 0; index < bytes.length; index += chunkSize) controller.enqueue(bytes.slice(index, index + chunkSize))
      controller.close()
    }
  }))
}

test('handles fragmented events and UTF-8, delivering progress but resolving only a terminal response', async () => {
  const progress: unknown[] = []
  const body = { success: true, spec: { countries: ['FR'] }, recommendations: [{ id: 'tt0211915', title: 'Amélie' }] }
  const result = await readRecommendationStream(
    response(event('progress', { stage: 'understanding', elapsedMs: 0 }) + event('response', body)),
    next => progress.push(next))
  assert.deepEqual(progress, [{ stage: 'understanding', elapsedMs: 0 }])
  assert.deepEqual(result, body)
})

test('progress alone never resolves as a completed request', async () => {
  await assert.rejects(readRecommendationStream(response(event('progress', { stage: 'retrieval', elapsedMs: 4000 }))), /before a complete response/)
})

test('supports CRLF split across chunks and explicit timeout clarifications', async () => {
  const body = { success: true, spec: { format: 'movie' }, requestDiagnostics: { outcome: 'timed_out' }, requiresClarification: { context: 'Incomplete search.', questions: [{ id: 'search_timeout', type: 'text', question: 'Try again.' }] } }
  const result = await readRecommendationStream(response(event('response', body).replace(/\n/g, '\r\n')))
  assert.deepEqual(result, body)
})

test('surfaces explicit server errors after progress', async () => {
  await assert.rejects(readRecommendationStream(response(
    event('progress', { stage: 'verification', elapsedMs: 2000 }) +
    event('error', { success: false, message: 'Catalogue unavailable' })
  )), /Catalogue unavailable/)
})

test('rejects malformed, missing-terminal and duplicated terminal events', async () => {
  for (const text of [
    'event: response\ndata: invalid\n\n',
    event('progress', { stage: 'invented', elapsedMs: 0 }),
    event('progress', { stage: 'ranking', elapsedMs: -1 }),
    event('response', { spec: {} }),
    event('response', { success: true }),
    event('response', { success: true, recommendations: [{ id: 1 }] }),
    event('response', { success: true, requiresClarification: { questions: [] } }),
    event('response', { success: true, recommendations: [] }) + event('response', { success: true, recommendations: [] }),
    'event: response\ndata: {"success":true}',
    event('response', { success: true }) + 'partial',
    ''
  ]) await assert.rejects(readRecommendationStream(response(text)))
})

test('does not commit a terminal response when the request has been cancelled', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(readRecommendationStream(response(event('response', { success: true })), undefined, controller.signal), { name: 'AbortError' })
})

test('cancels the reader after a progress callback aborts the active request', async () => {
  const controller = new AbortController()
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    start(output) { output.enqueue(new TextEncoder().encode(event('progress', { stage: 'retrieval', elapsedMs: 1 }))) },
    cancel() { cancelled = true }
  })
  await assert.rejects(readRecommendationStream(new Response(stream), () => controller.abort(), controller.signal), { name: 'AbortError' })
  assert.equal(cancelled, true)
})

test('surfaces an interrupted transport rather than treating progress as success', async () => {
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.error(new Error('Connection lost')) }
  })
  await assert.rejects(readRecommendationStream(new Response(stream)), /Connection lost/)
})
