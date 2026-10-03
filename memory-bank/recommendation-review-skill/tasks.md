# Tasks: Recommendation Review Skill

## RR-1: Implement Review Skill

- **Description:** Create `.github/skills/recommendation-review/SKILL.md` with discoverable frontmatter and the approved evidence-based review workflow.
- **Acceptance criteria:**
  - Skill name matches folder name and description includes recommendation review, ranking assessment, composite prompts, and multi-turn refinement.
  - Procedure reconstructs active user constraints and distinguishes additions, refinements, pivots, and replaced preferences.
  - Evaluates concept/reference fit separately from every requested tone/genre/person/era/format constraint.
  - Audits generated explanations against synopsis and metadata rather than treating them as evidence.
  - Reviews ordering and defensible omissions without inventing retrieval or filtering causes.
  - Defaults to read-only review; implementation changes remain separate and require user authorization.
  - Includes concise, useful output structure; no code-specific assets or dependencies are added.
- **Effort:** S
- **Files affected:** `.github/skills/recommendation-review/SKILL.md`

## RR-2: Validate Skill Behavior

- **Description:** Verify skill placement and frontmatter, then walk its procedure against representative single-turn, composite, and multi-turn recommendation examples.
- **Acceptance criteria:**
  - Frontmatter parses, `name` matches directory, and trigger description is specific and discoverable.
  - A reference-plus-mood example reports conceptual fit and tone fit independently.
  - A composite request checks each active explicit constraint rather than reducing everything to genre.
  - A multi-turn sequence preserves added/narrowed constraints and clears replaced constraints after an explicit pivot.
  - Weak rationales are checked against supplied synopsis evidence; unknown catalog/retrieval facts remain explicitly unknown.
  - Review does not modify recommendation code or generate unsupported missing-title claims.
- **Effort:** S
- **Files affected:** `.github/skills/recommendation-review/SKILL.md`

### Validation Results

- [x] Frontmatter parsed with the installed YAML parser; `name` matches the skill directory and the description contains recommendation-review and multi-turn discovery terms.
- [x] Single-turn live snapshot, "Like Inception but more relaxing": assessment separated concept from tone. It identified `The Man from Earth` as a calm conceptual fit; `Project Hail Mary` as conceptually relevant but extinction-stakes-heavy; and adventure/action options as weak on the requested contrast. User-suggested omitted candidates were labeled not visible, with retrieval status unknown.
- [x] Composite hypothetical: `a witty 1990s British mystery movie starring Olivia Colman, no horror` was evaluated across decade, region, format, actor, tone, mystery, and hard Horror exclusion rather than collapsed to Mystery.
- [x] Multi-turn case: `cozy weekend movie` -> `with Jude Law` -> `more of a rom-com vibe` retains compatible constraints; `forget all that, show me a documentary` clears the old movie/actor/rom-com frame. Assistant-only suggestions are not treated as user constraints.
- [x] Weak rationale is checked against the synopsis; absent candidate-pool evidence is reported as unknown rather than attributed to retrieval or ranking.
- [x] Validation was read-only; no recommendation parsing, retrieval, ranking, or UI code was changed.

## Kiro-Lite State

RR-1 implementation and RR-2 validation are complete. Await `/review complete`.
