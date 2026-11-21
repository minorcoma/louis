import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { YOUTUBE_SAFE_SEARCH_DEFAULT, YOUTUBE_SAFE_SEARCH_VALUES } from './youtubeSafeSearch.ts'

/**
 * Supervisor `RE_SCHEMA_ELEMENT` (supervisor/apps/options.py).
 * A schema value that is not one of these type strings — including a nested
 * name/description/select map — makes the store reject the whole repository.
 */
const RE_SCHEMA_ELEMENT = /^(?:|bool|email|url|port|device(?:\((?:subsystem=[a-z]+)\))?|str(?:\((?:\d+)?,(?:\d+)?\))?|password(?:\((?:\d+)?,(?:\d+)?\))?|int(?:\((?:-?\d+)?,(?:-?\d+)?\))?|float(?:\((?:-?\d*\.?\d+)?,(?:-?\d*\.?\d+)?\))?|match\((?:.*)\)|list\((?:.+)\))\??$/

const configPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../homeassistant/louis/config.yaml',
)

type SchemaLeaf = { path: string, type: string }

function schemaLeaves(yaml: string): SchemaLeaf[] {
  const lines = yaml.split(/\r?\n/)
  const start = lines.findIndex(line => line === 'schema:')
  assert.notEqual(start, -1, 'config.yaml is missing a schema: block')
  const leaves: SchemaLeaf[] = []
  const stack: string[] = []

  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    if (!line.startsWith(' ')) break
    const indent = line.match(/^ */)?.[0].length ?? 0
    assert.equal(indent % 2, 0, `odd indent in schema: ${line}`)
    const depth = indent / 2
    const content = line.trim()
    const colon = content.indexOf(':')
    assert.notEqual(colon, -1, `schema line has no colon: ${line}`)
    const key = content.slice(0, colon).trim()
    const value = content.slice(colon + 1).trim()
    stack.length = depth - 1
    const path = [...stack, key].join('.')
    if (value) leaves.push({ path, type: value })
    stack[depth - 1] = key
  }

  return leaves
}

function optionDefault(yaml: string, key: string): string | undefined {
  const lines = yaml.split(/\r?\n/)
  const start = lines.findIndex(line => line === 'options:')
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    if (!line.startsWith(' ')) break
    const match = line.match(/^\s+([A-Za-z0-9_]+):\s*(.*?)\s*$/)
    if (match?.[1] === key) return match[2]?.replace(/^["']|["']$/g, '')
  }
  return undefined
}

describe('Home Assistant add-on schema', () => {
  const yaml = readFileSync(configPath, 'utf8')
  const leaves = schemaLeaves(yaml)

  it('uses only Supervisor type strings', () => {
    assert.ok(leaves.length > 0)
    for (const leaf of leaves) {
      assert.match(leaf.type, RE_SCHEMA_ELEMENT, `${leaf.path}: ${leaf.type}`)
    }
  })

  it('offers the same YouTube safe-search values the app accepts', () => {
    const leaf = leaves.find(item => item.path === 'youtube_safe_search')
    assert.ok(leaf)
    assert.equal(leaf.type, `list(${YOUTUBE_SAFE_SEARCH_VALUES.join('|')})?`)
    assert.equal(optionDefault(yaml, 'youtube_safe_search'), YOUTUBE_SAFE_SEARCH_DEFAULT)
  })
})
