import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ENTRY = 'memory-bank/memory-bank-instructions.md'
const DEFAULT_CONTEXT = [
  '.github/copilot-instructions.md',
  ENTRY,
  'memory-bank/copilot-rules.md',
  'memory-bank/activeContext.md'
]
const GUIDES = [
  'backend/README.md',
  'backend/GITHUB_MODELS_SETUP.md',
  'frontend/README.md',
  'PLAYWRIGHT_MCP_GUIDE.md'
]

const words = text => text.trim().split(/\s+/).filter(Boolean).length
const portable = path => path.split(sep).join('/')

function walk(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : []
  }).sort()
}

/** Checks simple inline Markdown links and fenced blocks, not full Markdown syntax. */
export function inspectMarkdown(text, source, root, logicalSource = source) {
  const errors = []
  const links = []
  const prose = []
  let fence
  for (const [index, line] of text.split('\n').entries()) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (fence) {
      if (marker && marker[1][0] === fence.character &&
          marker[1].length >= fence.length && !marker[2].trim()) fence = undefined
    } else if (marker) {
      fence = { character: marker[1][0], length: marker[1].length, line: index + 1 }
    } else {
      prose.push(line.replace(/`+[^`\n]*`+/g, ''))
    }
  }
  if (fence) errors.push(`${source}: unclosed code fence at line ${fence.line}`)

  const pattern = /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+["'][^"'\n]*["'])?\s*\)/g
  for (const match of prose.join('\n').matchAll(pattern)) {
    const target = match[1] ?? match[2]
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue
    const path = target.split(/[?#]/)[0]
    if (!path) continue
    let decoded
    try {
      decoded = decodeURIComponent(path)
    } catch {
      errors.push(`${source}: invalid URL encoding in ${target}`)
      continue
    }
    const resolved = decoded.startsWith('/')
      ? resolve(root, `.${decoded}`)
      : resolve(dirname(resolve(root, logicalSource)), decoded)
    const local = relative(root, resolved)
    if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) {
      errors.push(`${source}: link escapes repository: ${target}`)
    } else if (!existsSync(resolved)) {
      errors.push(`${source}: missing local link ${target}`)
    } else {
      links.push(portable(local))
    }
  }
  return { errors, links }
}

export function auditDocumentation(root = ROOT) {
  const errors = []
  const warnings = []
  const files = [...new Set([
    ...walk(resolve(root, 'memory-bank')),
    ...walk(resolve(root, '.github')),
    ...GUIDES.map(path => resolve(root, path))
  ])]
  const originalPaths = new Map()
  let snapshots = 0
  for (const manifestPath of files.filter(path => path.endsWith(`${sep}snapshots.json`))) {
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (error) {
      errors.push(`${relative(root, manifestPath)}: ${error.message}`)
      continue
    }
    if (manifest.status !== 'historical' || !Array.isArray(manifest.files)) {
      errors.push(`${relative(root, manifestPath)}: expected historical snapshot manifest`)
      continue
    }
    for (const entry of manifest.files) {
      if (typeof entry.snapshot !== 'string' || typeof entry.original !== 'string' ||
          !/^[a-f\d]{64}$/.test(entry.sha256 ?? '')) {
        errors.push(`${relative(root, manifestPath)}: malformed snapshot entry`)
        continue
      }
      const snapshot = resolve(dirname(manifestPath), entry.snapshot)
      if (!files.includes(snapshot)) {
        errors.push(`${relative(root, manifestPath)}: missing snapshot ${entry.snapshot}`)
        continue
      }
      const digest = createHash('sha256').update(readFileSync(snapshot)).digest('hex')
      if (digest !== entry.sha256) errors.push(`${relative(root, snapshot)}: snapshot hash mismatch`)
      originalPaths.set(snapshot, entry.original)
      snapshots += 1
    }
  }

  const graph = new Map()
  const texts = new Map()
  for (const path of files.filter(path => path.endsWith('.md'))) {
    const source = portable(relative(root, path))
    if (!existsSync(path)) {
      errors.push(`${source}: required documentation file is missing`)
      continue
    }
    const text = readFileSync(path, 'utf8')
    texts.set(source, text)
    const inspection = inspectMarkdown(text, source, root, originalPaths.get(path) ?? source)
    errors.push(...inspection.errors)
    graph.set(source, inspection.links)
    const isMemory = source.startsWith('memory-bank/')
    const isArchive = source.startsWith('memory-bank/archive/')
    if (isMemory && !isArchive && !/^(?:\*\*)?Status:\s*(?:\*\*)?\S/im.test(text)) {
      errors.push(`${source}: missing Status metadata`)
    }
    if (isArchive && !originalPaths.has(path) && !/^Status: historical\b/im.test(text)) {
      errors.push(`${source}: non-snapshot archive document must declare Status: historical`)
    }
  }

  const reachable = new Set()
  const visit = source => {
    if (reachable.has(source)) return
    reachable.add(source)
    if (source.startsWith('memory-bank/archive/')) return
    for (const link of graph.get(source) ?? []) visit(link)
  }
  visit(ENTRY)
  for (const source of texts.keys()) {
    if (source.startsWith('memory-bank/') && !source.startsWith('memory-bank/archive/') &&
        !reachable.has(source)) errors.push(`${source}: not reachable from the memory index`)
  }
  for (const source of DEFAULT_CONTEXT) {
    if (!texts.has(source)) errors.push(`${source}: missing default context document`)
  }
  const defaultWords = DEFAULT_CONTEXT.reduce((sum, source) => sum + words(texts.get(source) ?? ''), 0)
  if (defaultWords > 2000) warnings.push(`Default context is ${defaultWords} words (guideline: 2000). Move detail to indexed owners; do not discard critical information.`)
  const activeWords = words(texts.get('memory-bank/activeContext.md') ?? '')
  if (activeWords > 800) warnings.push(`Active context is ${activeWords} words (guideline: 500-800).`)
  return { errors, warnings, documents: texts.size, snapshots, defaultWords, activeWords }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditDocumentation()
  for (const error of result.errors) console.error(`ERROR: ${error}`)
  for (const warning of result.warnings) console.warn(`WARNING: ${warning}`)
  console.log(`Checked ${result.documents} documents and ${result.snapshots} snapshots. Default context: ${result.defaultWords} words; active context: ${result.activeWords}.`)
  console.log('Scope: simple local inline links, fences, memory index coverage/status and snapshot hashes; not semantic truth, external URLs, anchors or full Markdown/YAML validation.')
  process.exitCode = result.errors.length ? 1 : 0
}
