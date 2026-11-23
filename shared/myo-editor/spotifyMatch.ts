export interface SpotifyTrackRef {
  id: string
  title: string
  artist: string
  durationSeconds?: number
}

export interface YoutubeMatchCandidate {
  id: string
  title: string
  channelTitle: string
  durationSeconds?: number
}

export interface SpotifyListing {
  title: string
  tracks: SpotifyTrackRef[]
  /** True when Spotify only returned the first 100 tracks. */
  truncated: boolean
}

function words(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function coreTitle(value: string): string {
  return words(value.replace(/\([^)]*\)|\[[^\]]*\]/g, ' '))
}

function containsTerm(haystack: string, needle: string): boolean {
  if (!needle) return false
  if (needle.length >= 4) return haystack.includes(needle)
  return ` ${haystack} `.includes(` ${needle} `)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : ''
}

function positiveSeconds(value: unknown): number | undefined {
  const ms = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  return Math.round(ms / 1000)
}

function artistsFrom(record: Record<string, unknown>): string {
  const artists = Array.isArray(record.artists) ? record.artists : []
  const names = artists
    .map(artist => artist && typeof artist === 'object' ? text((artist as { name?: unknown }).name) : '')
    .filter(Boolean)
  if (names.length > 0) return names.join(', ')
  return text(record.subtitle)
}

function trackIdFrom(record: Record<string, unknown>): string {
  const uri = text(record.uri)
  const fromUri = uri.match(/^spotify:(?:track|episode):([A-Za-z0-9]{10,32})$/)?.[1]
  if (fromUri) return fromUri
  const id = text(record.id)
  return /^[A-Za-z0-9]{10,32}$/.test(id) ? id : ''
}

function trackFromRecord(record: Record<string, unknown>): SpotifyTrackRef | null {
  if (record.isPlayable === false) return null
  const title = text(record.title) || text(record.name)
  const id = trackIdFrom(record)
  if (!title || !id) return null
  return {
    id,
    title: title.slice(0, 180),
    artist: artistsFrom(record).slice(0, 180),
    durationSeconds: positiveSeconds(record.duration),
  }
}

/** Tracks from a Spotify embed `__NEXT_DATA__` payload. */
export function spotifyListingFromEmbed(payload: unknown): SpotifyListing | null {
  const entity = payload
    && typeof payload === 'object'
    && 'props' in payload
    ? (payload as { props?: { pageProps?: { state?: { data?: { entity?: unknown } } } } })
      .props?.pageProps?.state?.data?.entity
    : null
  if (!entity || typeof entity !== 'object') return null
  const record = entity as Record<string, unknown>
  const title = text(record.name) || text(record.title) || 'Spotify'
  const list = Array.isArray(record.trackList) ? record.trackList : null
  const rows = list ?? [record]
  const tracks: SpotifyTrackRef[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const track = trackFromRecord(row as Record<string, unknown>)
    if (!track) continue
    tracks.push(track)
    if (tracks.length >= 100) break
  }
  if (tracks.length === 0) return null
  return {
    title,
    tracks,
    truncated: Array.isArray(list) && list.length >= 100,
  }
}

export function spotifyYoutubeQuery(track: SpotifyTrackRef): string {
  return `${track.artist} ${track.title}`.replace(/\s+/g, ' ').trim().slice(0, 180)
}

/**
 * Best YouTube video for a Spotify song. The title has to match, and a known
 * duration that is off by more than a minute and a half is rejected.
 */
export function pickYoutubeMatch(
  track: Pick<SpotifyTrackRef, 'title' | 'artist' | 'durationSeconds'>,
  candidates: readonly YoutubeMatchCandidate[],
  usedIds?: ReadonlySet<string>,
): YoutubeMatchCandidate | null {
  const title = coreTitle(track.title)
  if (title.length < 2) return null
  const artist = coreTitle(track.artist)
  let best: { item: YoutubeMatchCandidate, score: number, delta: number } | null = null

  for (const item of candidates) {
    const id = item.id.trim()
    if (!id || usedIds?.has(id)) continue
    const candidateTitle = coreTitle(item.title)
    const titleHit = containsTerm(candidateTitle, title)
      || (candidateTitle.length >= 8 && containsTerm(title, candidateTitle))
    if (!titleHit) continue

    let score = 5
    if (artist.length >= 3 && (
      containsTerm(candidateTitle, artist) || containsTerm(words(item.channelTitle), artist)
    )) {
      score += 3
    }

    let delta = Number.POSITIVE_INFINITY
    if (track.durationSeconds && item.durationSeconds && item.durationSeconds > 0) {
      delta = Math.abs(track.durationSeconds - item.durationSeconds)
      if (delta > 90) continue
      if (delta <= 15) score += 4
      else if (delta <= 45) score += 2
    }

    if (!best || score > best.score || (score === best.score && delta < best.delta)) {
      best = { item: { ...item, id }, score, delta }
    }
  }

  return best?.item ?? null
}
