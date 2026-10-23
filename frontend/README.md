# Film & TV Advisor Frontend

A responsive React + TypeScript web application for getting film and TV recommendations based on natural language input.

## Development

Install dependencies:
```bash
npm install
```

Run development server:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## Features

- Conversation-first natural language input and freeform follow-ups
- Inline clarification choices with backend-issued scoped selection tokens
- Structured request state stored and sent back on follow-ups; cleared on new chat
- Recommendation rounds, poster highlights, details panels, availability and trailers
- Generic chat fallback text when an API response has no assistant intro
- Responsive design for mobile and desktop

## Architecture

- Uses Vite for fast development and optimized builds
- Component-based structure with Pages
- Tailwind CSS for styling
- TypeScript for type safety
- Recommendation API base: `VITE_BACKEND_URL` when set, otherwise `http://localhost:3000` in development or `https://protogen-backend-1bvp.onrender.com` in production
- Vite's separate `/api` proxy targets the Render backend; it is not the local recommendation-call default
- Optional `VITE_STREAMING_REGION` overrides browser-locale region inference
- Provider keys belong on the backend, never in frontend `VITE_*` settings

## State and Lazy Enrichment

- Messages, recommendation rounds and the current request spec live in React
  memory via [useConversation](src/hooks/useConversation.ts). Reset clears that
  conversation; there is no server session or persistent conversation history.
- [ConversationalHome](src/pages/ConversationalHome.tsx) sends the original query,
  latest answer, user turns, asked-question IDs, previous result IDs, cumulative
  constraint tags and previous spec. Request IDs ignore cancelled/superseded
  replies in the UI. Cancel, new-chat reset and unmount now also abort the HTTP
  fetch; the backend propagates response disconnect cancellation to providers.
  Exact catalogue-option selections also send `selectedOptionToken`; freeform
  answers omit it. Transport retries keep that exact token without adding a
  duplicate user turn. Stale tokens return a text clarification with the saved
  request unchanged. Token lifetime/restart boundaries belong to the
  [API contract](../backend/README.md#post-recommendations).
- Browser POST requests opt into server-sent events over fetch. Real backend
  stage transitions update the loading text; progress does not change the saved
  spec or add a result round. Only a terminal response resolves submission.
  Five seconds triggers honest slow-search wording, not cancellation; the
  provisional server search ceiling is 15 seconds. Cancel is available from
  the start. Interrupted/malformed streams surface an error and preserve state.
- [ResultsPage](src/pages/ResultsPage.tsx) loads highlights for the empty state
  and highlight metadata when their details panel opens. It fetches streaming
  availability separately for either kind of details panel when an IMDb ID is
  known. Recommendation responses do not preload availability.
- Recommendation trailers are also lazy: opening details calls
  `/trailers/:type/:id`. Successful lookups stay in component memory; failed
  requests show a retry button and are not cached. Closing/switching details
  aborts the fetch and prevents late updates. Highlight metadata can already
  contain its own trailer.
- Highlights, highlight details, availability and availability diagnostics are
  cached in `sessionStorage`. Highlight-detail failures store the basic tile as
  fallback; availability failures store an empty list plus error diagnostics.
  These browser entries have no TTL, and availability keys use IMDb ID without
  country. A cached failure can therefore prevent a retry during the browser
  session, and a changed region can reuse stale data. Backend cache TTLs do not
  invalidate browser entries. Conversation reset does not clear these caches.
- A response containing clarification takes precedence over recommendations in
  the chat renderer. Some non-empty backend weak-result paths omit intro text;
  generic frontend text is not evidence of a fact-grounded backend reply.
- Optional LLM failure/deadline diagnostics are retained with conversation
  messages and result passes. They are provider-attempt evidence, not a claim
  that failed output contributed or that the whole HTTP turn met a deadline;
  see the [API diagnostics](../backend/README.md#post-recommendations).
- Whole-turn expiry is rendered as the backend's `search_timeout` text
  clarification, not an empty recommendation list. The saved request is unchanged
  and optional `requestDiagnostics` (including completed-stage timings) is
  retained on assistant messages and result passes.
  Retry the intended change rather than assuming it was committed. Backend
  deadline timing does not certify browser/network latency.

## Visual Development Controls

[LensTweakPanel](src/components/LensTweakPanel.tsx) is available in development
or when the URL contains `?tweak`, and starts closed. It adjusts visual lens/beam
parameters and the shader toggle, not recommendation preferences. Theme-specific
settings and the toggle use `localStorage`; defaults and gating belong to
[lensTweaks](src/lensTweaks.ts). The beam renderer uses OGL/WebGL in
[BeamBackground](src/components/BeamBackground.tsx). These existing local UI
changes have not received fresh browser/deployment certification.

## Implementation Status

As of October 16, structured-request round-tripping and catalogue-backed genre
choices/explicit widening are implemented locally. Tone-built questions, general
relaxation records and full backend fact-grounded replies remain planned.
Progressive POST delivery, deterministic initial copy and lazy recommendation
trailers are implemented locally; optional generated copy is not streamed later.
With a saved spec, failed/unusable understanding now returns a text
clarification and unchanged request rather than unconfirmed new results. Live
quality and latency acceptance remain open. A mocked browser check covers actual
progress, terminal results, lazy trailers and cancel/retry state retention, not
live recommendations or deployment/proxy behaviour; see the
[engine design](../memory-bank/design-conversational-engine.md) and
[dated progress](../memory-bank/progress.md).

Stream-parser regressions use the existing backend `tsx` runner without new
dependencies: from the repository root, run
`backend/node_modules/.bin/tsx --test frontend/tests/recommendationStream.test.ts`.
