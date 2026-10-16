# Memory index and maintenance contract

Status: current policy. Updated: October 16, 2026.

## Start here: selective context

At session start or after context loss, read this index, [project rules](copilot-rules.md)
and [active context](activeContext.md). Then load only the references needed for
the task. Within the same session, reuse context already read; reread changed
owners or when uncertainty requires it. Do not recursively load the memory bank.

| Task or question | Read next |
|---|---|
| Product intent and scope | [Project brief](projectbrief.md), [product context](productContext.md) |
| Architecture and code ownership | [System patterns](systemPatterns.md) |
| Setup, API use and environment | [Backend README](../backend/README.md), [frontend README](../frontend/README.md), [provider guide](../backend/GITHUB_MODELS_SETUP.md); [technical context](techContext.md) for integration constraints |
| Recommendation-engine changes | [Engine PRD](prd-conversational-engine.md), [design](design-conversational-engine.md), [tasks](tasks-conversational-engine.md) |
| Test/evaluation status and provider health | [Verification ledger](progress.md) |
| UI styling/testing | [Visual reference](design2.md), actual component/CSS source; [browser guide](../PLAYWRIGHT_MCP_GUIDE.md) for historical examples, not current verification |
| Recommendation review workflow | [Review PRD](recommendation-review-skill/prd.md), [design](recommendation-review-skill/design.md), [tasks](recommendation-review-skill/tasks.md); load [the skill](../.github/skills/recommendation-review/SKILL.md) when applicable |
| Historical decisions, diagnoses or recovery | [Snapshot recovery map](archive/2026-10-16/README.md); search/read only relevant sections |

Read source/tests before changing or asserting implementation behaviour. Docs
route investigation; they are not substitutes for code evidence. Archives are
historical evidence, never active instructions or current health claims.

Old links remain valid through the [consolidated-doc entry point](Film_Advisor_App_AllDocs.md)
and [superseded design entry point](design.md); do not load their snapshots by default.

## One authoritative home per fact

- PRD: requirements, product decisions and acceptance targets.
- Design: implemented architecture, rationale, deviations and labelled plans.
- Feature tasks: implementation completion and outstanding work.
- [Progress](progress.md): dated validation/evaluation evidence and general backlog.
- [Active context](activeContext.md): current focus, blockers, next action and owner links.
- READMEs/provider guide: runnable setup and configuration.
- Source types/tests: exact runtime contracts.

Link to an owner rather than duplicating its test counts, scores, task lists or
API types. A short blocker reminder is useful; a second full ledger is not.
When evidence disagrees, inspect the relevant source/report and update the owner.
Do not silently promote historical observations into current facts.

## Maintenance on each meaningful change

1. Follow Kiro-Lite: PRD -> Design -> Tasks -> Code, proportional to scope. Keep
   requirements, design and tasks distinct; do not duplicate the implementation
   story in all three. Use the explicit Kiro-Lite skill only when requested.
2. Update the affected owner in the same change, or explain why none changed.
3. Refresh active context when focus, blockers or the next action changes. Link
   verification there rather than copying results.
4. Record validation with date, scope and command/report. Distinguish implemented,
   verified, accepted and deployed. Editing a doc does not refresh verification.
5. Move completed detail out of the handoff. Preserve unique evidence and open
   tasks before shortening; use dated snapshots for substantial restructuring.
6. Run `npm --prefix backend run check:docs` after documentation/instruction edits.

Keep the default reading set small (soft warning above 2,000 words combined;
active context guideline 500-800 words). Do not drop critical facts to meet a
budget; move detail to an indexed owner.

On **/update memory bank**, review this index, current state, ledger, affected
owners and their consistency. Inventory all current document owners; inspect
unchanged reference/history selectively, not by loading every snapshot. Report
what was checked and what was not verified. Never refresh immutable archives.

## Checks and limitations

[Documentation checker](../backend/scripts/check-docs.mjs) validates local inline
links, code-fence balance, managed-document coverage, current status metadata,
snapshot hashes and the default word budget. It does not validate prose truth,
external URLs, heading anchors, all Markdown/YAML syntax or provider health.
Historical snapshot links resolve from their recorded original source paths.
