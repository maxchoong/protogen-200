import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { auditDocumentation, inspectMarkdown } from './check-docs.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lumera-doc-check-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (path, text) => {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text)
  }
  for (const path of [
    '.github/copilot-instructions.md', 'backend/README.md',
    'backend/GITHUB_MODELS_SETUP.md', 'frontend/README.md', 'PLAYWRIGHT_MCP_GUIDE.md'
  ]) write(path, '# Reference\n')
  write('memory-bank/memory-bank-instructions.md', 'Status: current\n[rules](copilot-rules.md)\n[handoff](activeContext.md)\n')
  write('memory-bank/copilot-rules.md', 'Status: current\n')
  write('memory-bank/activeContext.md', 'Status: current\n')
  return { root, write }
}

test('a minimal indexed documentation set passes', t => {
  const { root } = fixture(t)
  const result = auditDocumentation(root)
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.warnings, [])
  assert.equal(result.documents, 8)
})

test('checks relative, repository-root, encoded and angle-delimited local links', t => {
  const { root, write } = fixture(t)
  write('memory-bank/a file.md', '# Reference\n')
  const result = inspectMarkdown('[one](a%20file.md) [two](<a file.md>) [root](/backend/README.md)', 'memory-bank/test.md', root)
  assert.deepEqual(result.errors, [])
  assert.equal(result.links.length, 3)
})

test('ignores external URLs, anchors and links inside code', t => {
  const { root } = fixture(t)
  const text = '[web](https://example.com/no-file) [cdn](//example.com/file) [anchor](#section)\n`[inline](missing.md)`\n```md\n[example](missing.md)\n```\n'
  assert.deepEqual(inspectMarkdown(text, 'memory-bank/test.md', root).errors, [])
})

test('reports missing local links and malformed URL encoding', t => {
  const { root } = fixture(t)
  const result = inspectMarkdown('[bad](missing.md) [encoded](bad%ZZ.md)', 'memory-bank/test.md', root)
  assert.equal(result.errors.length, 2)
  assert.match(result.errors.join('\n'), /missing local link/)
  assert.match(result.errors.join('\n'), /invalid URL encoding/)
})

test('rejects paths escaping the repository', t => {
  const { root } = fixture(t)
  assert.match(inspectMarkdown('[bad](../../../outside.md)', 'memory-bank/test.md', root).errors[0], /escapes repository/)
})

test('handles longer and tilde fences and detects an unclosed fence', t => {
  const { root } = fixture(t)
  assert.deepEqual(inspectMarkdown('````md\n```\n````\n~~~md\nexample\n~~~\n', 'test.md', root).errors, [])
  assert.match(inspectMarkdown('```js\nunfinished\n', 'test.md', root).errors[0], /unclosed code fence/)
})

test('fails on a missing required document', t => {
  const { root } = fixture(t)
  rmSync(join(root, 'frontend/README.md'))
  assert.ok(auditDocumentation(root).errors.some(error => /required documentation file is missing/.test(error)))
})

test('requires current memory status metadata', t => {
  const { root, write } = fixture(t)
  write('memory-bank/activeContext.md', '# No status\n')
  assert.ok(auditDocumentation(root).errors.some(error => /missing Status metadata/.test(error)))
})

test('reports a current memory document missing from the index graph', t => {
  const { root, write } = fixture(t)
  write('memory-bank/forgotten.md', 'Status: planned\n')
  assert.ok(auditDocumentation(root).errors.some(error => /forgotten.md: not reachable/.test(error)))
})

test('historical links alone do not make a current owner discoverable', t => {
  const { root, write } = fixture(t)
  write('memory-bank/forgotten.md', 'Status: current\n')
  write('memory-bank/memory-bank-instructions.md', 'Status: current\n[rules](copilot-rules.md)\n[handoff](activeContext.md)\n[history](archive/README.md)\n')
  write('memory-bank/archive/README.md', 'Status: historical\n[forgotten](../forgotten.md)\n')
  assert.ok(auditDocumentation(root).errors.some(error => /forgotten.md: not reachable/.test(error)))
})

test('warns rather than discarding information or failing when context grows', t => {
  const { root, write } = fixture(t)
  write('memory-bank/activeContext.md', `Status: current\n${'word '.repeat(2100)}`)
  const result = auditDocumentation(root)
  assert.deepEqual(result.errors, [])
  assert.equal(result.warnings.length, 2)
})

test('preserves hashes and resolves snapshot links from the original directory', t => {
  const { root, write } = fixture(t)
  const text = '# Original snapshot\n[rules](copilot-rules.md)\n'
  const archive = 'memory-bank/archive/2026-10-16'
  write(`${archive}/old.md`, text)
  write(`${archive}/snapshots.json`, JSON.stringify({
    status: 'historical',
    files: [{
      snapshot: 'old.md', original: 'memory-bank/activeContext.md',
      sha256: createHash('sha256').update(text).digest('hex')
    }]
  }))
  assert.deepEqual(auditDocumentation(root).errors, [])
  assert.equal(auditDocumentation(root).snapshots, 1)
  write(`${archive}/old.md`, `${text}changed\n`)
  assert.ok(auditDocumentation(root).errors.some(error => /snapshot hash mismatch/.test(error)))
  rmSync(join(root, archive, 'old.md'))
  assert.ok(auditDocumentation(root).errors.some(error => /missing snapshot/.test(error)))
})

test('reports invalid manifests and unlabelled archived references', t => {
  const { root, write } = fixture(t)
  write('memory-bank/archive/example/snapshots.json', 'not json')
  write('memory-bank/archive/example/README.md', '# Missing historical status\n')
  const result = auditDocumentation(root)
  assert.ok(result.errors.some(error => /snapshots.json/.test(error)))
  assert.ok(result.errors.some(error => /must declare Status: historical/.test(error)))
})
