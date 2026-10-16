# Memory snapshot: October 16, 2026

Status: historical; immutable recovery evidence, not active instructions.

## Preservation contract

These six snapshots preserve the exact **uncommitted worktree** bytes immediately
before the document-structure migration, not just the versions in Git history.
[The manifest](snapshots.json) records original paths and SHA-256 hashes.
Do not edit snapshots or refresh their hashes to make a check pass.

Relative links inside snapshots retain their original source-directory meaning.
Open current references from [the memory index](../../memory-bank-instructions.md);
the documentation checker resolves historical links using the manifest's original
path rather than rewriting historical bytes. Historical instructions are inert:
never follow their former read-all policy.

## Recovery map

| Information | Preserved source | Current owner |
|---|---|---|
| October 13-16 diagnoses, origin widening, vote confidence, genre mapping, retrieval and ranking nuances | [Active context snapshot](activeContext.md) | [Engine design](../../design-conversational-engine.md), source/tests; consult snapshot for detailed rationale |
| Evaluation sequence, provider failures and limits of the harness | [Progress snapshot](progress.md), active context snapshot | [Verification ledger](../../progress.md) |
| UI details, highlight panels, caching and prior browser checks | Active context snapshot, progress snapshot | [Visual reference](../../design2.md), source/tests; historical evidence stays in snapshots |
| All prior outstanding tasks, safety gaps and older milestone checklists | Progress snapshot, active context snapshot | [Current task list](../../tasks-conversational-engine.md), [general backlog](../../progress.md#general-backlog) |
| Original MVP PRD, architecture, acceptance history and consolidated overview | [Consolidated snapshot](Film_Advisor_App_AllDocs.md) | [Product brief](../../projectbrief.md), [architecture](../../systemPatterns.md), feature PRD/design |
| Superseded MovieFlix styling | [Design snapshot](design.md) | Visual reference and shipped CSS tokens |
| Former loading/update rules | [Memory instructions snapshot](memory-bank-instructions.md), [workspace instructions snapshot](copilot-instructions.md) | Memory index and workspace instructions |

Open safety and verification tasks were carried forward without marking them
complete. Older speculation, title lists, dated evidence and implementation
details remain recoverable here; they were not silently turned into current
guarantees. Archives are searched only when history/rationale is relevant.

## Migration acceptance

- User approved selective loading and information ownership before migration.
- Design: retain familiar current paths; replace oversized mixed-purpose files
  with concise owners and preserve originals here. No application changes.
- Tasks: preserve bytes, route current context, consolidate evidence/backlog,
  update instruction entry points, add a dependency-free checker, verify hashes
  and links, and measure the default context size.
- Automated checks validate structure and preservation, not semantic truth or
  application/provider health. See the verification ledger for final results.
