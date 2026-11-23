const YOTOICONS_BASE = 'https://yotoicons.com'

export interface YotoiconsSearchItem {
  id: string
  title: string
  tags: string[]
  author: string
  imageUrl: string
  source: 'yotoicons'
}

/**
 * Parse yotoicons.com browse HTML for icon cards:
 * populate_icon_modal('id', 'category', 'tag1', 'tag2', 'author', 'downloads')
 */
export function parseYotoiconsHtml(html: string): YotoiconsSearchItem[] {
  const results: YotoiconsSearchItem[] = []
  const seen = new Set<string>()
  const re
    = /populate_icon_modal\(\s*'(\d+)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'(\d+)'\s*\)/g

  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const id = match[1]!
    if (seen.has(id)) continue
    seen.add(id)
    const category = match[2] || ''
    const tag1 = match[3] || ''
    const tag2 = match[4] || ''
    const author = match[5] || ''
    const tags = [category, tag1, tag2, author].filter(Boolean)
    const title = [tag1, tag2].filter(Boolean).join(' · ') || category || `Icon ${id}`
    results.push({
      id,
      title,
      tags,
      author,
      imageUrl: `${YOTOICONS_BASE}/static/uploads/${id}.png`,
      source: 'yotoicons',
    })
  }

  return results
}

const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000
const SEARCH_CACHE_MAX = 500
const SEARCH_TIMEOUT_MS = 15_000
/** Find icons runs many tag searches; repeat runs shouldn't re-hit yotoicons.com. */
const searchCache = new Map<string, { expiresAt: number, items: YotoiconsSearchItem[] }>()
const searchInflight = new Map<string, Promise<YotoiconsSearchItem[]>>()

async function fetchYotoicons(tag: string): Promise<YotoiconsSearchItem[]> {
  const url = `${YOTOICONS_BASE}/icons?tag=${encodeURIComponent(tag)}&type=singles&sort=popular`
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'LouisYotoCards/1.0 (+https://github.com)',
    },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`yotoicons.com returned ${res.status}`)
  }
  const html = await res.text()
  return parseYotoiconsHtml(html)
}

export async function searchYotoicons(query: string): Promise<YotoiconsSearchItem[]> {
  const tag = query.trim()
  if (!tag) return []
  const key = tag.toLowerCase()

  const cached = searchCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.items
  const pending = searchInflight.get(key)
  if (pending) return pending

  const promise = fetchYotoicons(tag)
    .then((items) => {
      if (searchCache.size >= SEARCH_CACHE_MAX) {
        const oldest = searchCache.keys().next().value
        if (oldest !== undefined) searchCache.delete(oldest)
      }
      searchCache.set(key, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, items })
      return items
    })
    .finally(() => searchInflight.delete(key))
  searchInflight.set(key, promise)
  return promise
}
