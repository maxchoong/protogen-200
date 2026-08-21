# Archive: 2026-08-21 legacy cleanup

This folder contains files moved out of active development paths because they are historical, generated, or no longer referenced by current build/test scripts.

## Why these were archived

- Legacy phase/setup documents superseded by current memory-bank and README docs.
- Ad-hoc phase test scripts not wired into current npm test/build workflows.
- Generated frontend TypeScript outputs from `vite.config.ts` (`.js`/`.d.ts`) and incremental metadata (`.tsbuildinfo`).
- Local runtime artifacts (`backend/dist`, `backend/server.log`) that should not live in active source folders.

## Moved files

### backend
- OPENAI_SETUP.md
- PHASE_3_SUMMARY.md
- PHASE_4_SETUP.md
- PHASE_4_SUMMARY.md
- run-e2e-tests.js
- test-phase1.ts
- test-phase123-e2e.ts
- test-phase2-integration.ts
- test-phase2.ts
- test-phase3.ts

### frontend
- tsconfig.node.tsbuildinfo
- tsconfig.tsbuildinfo
- vite.config.d.ts
- vite.config.js

### runtime-artifacts
- backend-dist/
- backend-server.log

## Restore guidance

If any archived file is needed again, move it back to its previous location and re-add script/docs references as needed.
