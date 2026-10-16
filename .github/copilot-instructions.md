# Project working instructions

- Start with [the memory index](../memory-bank/memory-bank-instructions.md),
  [project rules](../memory-bank/copilot-rules.md) and
  [active context](../memory-bank/activeContext.md) at session start/context loss.
  Load task-relevant owners from the index; reuse unchanged context already read.
  Do not load every memory-bank file or archived snapshot.
- Follow Kiro-Lite: PRD -> Design -> Tasks -> Code, proportionate to scope.
  Use the explicit Kiro-Lite skill only when requested.
- Update affected documentation owners with each meaningful change. Keep
  active context a handoff, feature tasks a work list, and progress the evidence
  ledger. Link instead of repeating scores, test counts and contracts.
- On "/update memory bank", reconcile current state and affected owners using
  the index's maintenance procedure. Preserve unique evidence and outstanding
  tasks before shortening; archives are historical, not active instructions.
- Run `npm --prefix backend run check:docs` after documentation/instruction edits.
  Do not imply that structural checks establish application/provider health.
