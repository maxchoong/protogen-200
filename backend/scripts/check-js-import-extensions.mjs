import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = join(process.cwd(), 'src')

function walk(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      results.push(...walk(fullPath))
      continue
    }
    if (extname(fullPath) === '.ts') {
      results.push(fullPath)
    }
  }
  return results
}

function shouldCheck(filePath) {
  if (filePath.includes('/__tests__/')) return false
  if (filePath.endsWith('.test.ts')) return false
  return true
}

function collectViolations(filePath) {
  const content = readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const violations = []

  const staticImport = /from\s+['"](\.{1,2}\/[^'"]+)['"]/g
  const dynamicImport = /import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g

  lines.forEach((line, idx) => {
    for (const regex of [staticImport, dynamicImport]) {
      regex.lastIndex = 0
      let match
      while ((match = regex.exec(line)) !== null) {
        const specifier = match[1]
        if (specifier.endsWith('.js') || specifier.endsWith('.json')) {
          continue
        }
        violations.push({
          filePath,
          line: idx + 1,
          specifier,
        })
      }
    }
  })

  return violations
}

const tsFiles = walk(ROOT).filter(shouldCheck)
const violations = tsFiles.flatMap(collectViolations)

if (violations.length > 0) {
  console.error('Found relative imports without explicit .js extension in backend runtime source:')
  for (const violation of violations) {
    console.error(`- ${violation.filePath}:${violation.line} -> ${violation.specifier}`)
  }
  console.error('Use explicit .js extensions for runtime-relative imports (ESM).')
  process.exit(1)
}

console.log('All backend runtime relative imports use explicit .js extensions.')
