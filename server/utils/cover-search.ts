import { coversFromItunesPayload, type CoverSearchHit } from '#shared/myo-editor/coverSearch'

const ITUNES_SEARCH = 'https://itunes.apple.com/search'

async function searchEntity(query: string, entity: 'album' | 'ebook'): Promise<unknown> {
  const url = new URL(ITUNES_SEARCH)
  url.searchParams.set('term', query)
  url.searchParams.set('entity', entity)
  url.searchParams.set('limit', '12')
  url.searchParams.set('media', entity === 'ebook' ? 'ebook' : 'music')
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`Cover search returned ${response.status}`)
  }
  return response.json()
}

/** Album and book covers for a playlist name. */
export async function searchCoverImages(query: string): Promise<CoverSearchHit[]> {
  const [albums, books] = await Promise.all([
    searchEntity(query, 'album'),
    searchEntity(query, 'ebook').catch(() => ({ results: [] })),
  ])
  const albumHits = coversFromItunesPayload(albums, 8)
  const bookHits = coversFromItunesPayload(books, 8)
  const seen = new Set(albumHits.map(hit => hit.imageUrl))
  const merged = [...albumHits]
  for (const hit of bookHits) {
    if (seen.has(hit.imageUrl)) continue
    seen.add(hit.imageUrl)
    merged.push(hit)
    if (merged.length >= 12) break
  }
  return merged.slice(0, 12)
}
