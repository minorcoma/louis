export interface CoverSearchHit {
  id: string
  title: string
  artist: string
  thumbUrl: string
  imageUrl: string
}

/** Search phrase for a playlist cover: the card name plus the word cover. */
export function coverSearchQuery(cardTitle: string): string {
  const name = cardTitle.trim().replace(/\s+/g, ' ')
  if (!name) return ''
  if (/\bcovers?\b/i.test(name)) return name
  return `${name} cover`
}

/** Apple artwork URL, rewritten to a square size. Rejects anything else. */
export function appleArtworkUrl(raw: string, size: number): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(trimmed)
  }
  catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (!url.hostname.endsWith('.mzstatic.com')) return null
  if (!Number.isInteger(size) || size < 60 || size > 1200) return null
  const sized = trimmed.replace(/\/\d+x\d+bb(?=\.[a-z0-9]+$)/i, `/${size}x${size}bb`)
  if (sized === trimmed && !/\/\d+x\d+bb\.[a-z0-9]+$/i.test(trimmed)) return null
  return sized
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Album and book covers from an iTunes Search API payload. */
export function coversFromItunesPayload(payload: unknown, limit = 12): CoverSearchHit[] {
  const results = payload && typeof payload === 'object' && 'results' in payload
    ? (payload as { results?: unknown }).results
    : null
  if (!Array.isArray(results)) return []

  const hits: CoverSearchHit[] = []
  const seen = new Set<string>()
  for (const result of results) {
    if (!result || typeof result !== 'object') continue
    const record = result as {
      artworkUrl100?: unknown
      collectionName?: unknown
      trackName?: unknown
      artistName?: unknown
      collectionId?: unknown
      trackId?: unknown
      collectionExplicitness?: unknown
      trackExplicitness?: unknown
    }
    const explicit = text(record.collectionExplicitness) || text(record.trackExplicitness)
    if (explicit.toLowerCase() === 'explicit') continue
    const artwork = text(record.artworkUrl100)
    const thumbUrl = appleArtworkUrl(artwork, 100)
    const imageUrl = appleArtworkUrl(artwork, 600)
    if (!thumbUrl || !imageUrl || seen.has(imageUrl)) continue
    seen.add(imageUrl)
    const id = text(record.collectionId) || text(record.trackId) || imageUrl
    hits.push({
      id,
      title: text(record.collectionName) || text(record.trackName) || 'Cover',
      artist: text(record.artistName),
      thumbUrl,
      imageUrl,
    })
    if (hits.length >= limit) break
  }
  return hits
}
