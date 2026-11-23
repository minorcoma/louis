import { createError, type H3Event } from 'h3'
import { discoverYoutubeSearch } from './youtube-discovery'
import { fetchAllowedPage } from './page-fetch'
import {
  parseSpotifyUrl,
  type SpotifyEntity,
} from '#shared/myo-editor/mediaLink'
import {
  pickYoutubeMatch,
  spotifyListingFromEmbed,
  spotifyYoutubeQuery,
  type SpotifyListing,
  type SpotifyTrackRef,
  type YoutubeMatchCandidate,
} from '#shared/myo-editor/spotifyMatch'

const SPOTIFY_HOSTS = new Set(['open.spotify.com', 'spotify.link'])
const COLLECTION: ReadonlySet<SpotifyEntity> = new Set(['album', 'playlist', 'show'])

export interface ResolvedSpotifyVideo {
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  publishedAt: string
  duration?: string
  durationSeconds?: number
}

export interface ResolvedSpotifyLink {
  title: string
  videos: ResolvedSpotifyVideo[]
  unmatched: string[]
  truncated: boolean
}

function readNextData(html: string): unknown {
  const marker = '<script id="__NEXT_DATA__" type="application/json">'
  const start = html.indexOf(marker)
  if (start < 0) return null
  const jsonStart = start + marker.length
  const end = html.indexOf('</script>', jsonStart)
  if (end < 0) return null
  try {
    return JSON.parse(html.slice(jsonStart, end))
  }
  catch {
    return null
  }
}

async function loadEmbed(entity: SpotifyEntity, id: string): Promise<SpotifyListing> {
  const page = await fetchAllowedPage(
    `https://open.spotify.com/embed/${entity}/${id}`,
    new Set(['open.spotify.com']),
  )
  const listing = spotifyListingFromEmbed(readNextData(page.html))
  if (!listing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'That Spotify link has no public tracks.',
    })
  }
  return listing
}

async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index]!)
    }
  }
  const workers = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

function toVideo(match: YoutubeMatchCandidate, searched: {
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  publishedAt: string
  duration?: string
  durationSeconds?: number
}): ResolvedSpotifyVideo {
  return {
    id: match.id,
    title: searched.title || match.title,
    channelTitle: searched.channelTitle || match.channelTitle,
    thumbnailUrl: searched.thumbnailUrl,
    publishedAt: searched.publishedAt,
    duration: searched.duration,
    durationSeconds: searched.durationSeconds ?? match.durationSeconds,
  }
}

export async function resolveSpotifyLink(event: H3Event, rawUrl: string): Promise<ResolvedSpotifyLink> {
  let parsed = parseSpotifyUrl(rawUrl)
  if (parsed?.kind === 'spotify-short') {
    const page = await fetchAllowedPage(parsed.url, SPOTIFY_HOSTS)
    parsed = parseSpotifyUrl(page.finalUrl)
  }
  if (!parsed || parsed.kind !== 'spotify') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Paste a Spotify track, album, or playlist link.',
    })
  }
  if (!COLLECTION.has(parsed.entity) && parsed.entity !== 'track' && parsed.entity !== 'episode') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Paste a Spotify track, album, or playlist link.',
    })
  }

  const listing = await loadEmbed(parsed.entity, parsed.id)
  let searchError: unknown = null
  const searches = await mapPool(listing.tracks, 4, async (track) => {
    try {
      const page = await discoverYoutubeSearch(event, {
        q: spotifyYoutubeQuery(track),
        maxResults: 5,
      })
      return page.items
    }
    catch (err) {
      searchError ??= err
      return []
    }
  })

  const used = new Set<string>()
  const videos: ResolvedSpotifyVideo[] = []
  const unmatched: string[] = []
  listing.tracks.forEach((track: SpotifyTrackRef, index) => {
    const candidates = (searches[index] ?? []).map(item => ({
      id: item.id,
      title: item.title,
      channelTitle: item.channelTitle,
      durationSeconds: item.durationSeconds,
    }))
    const match = pickYoutubeMatch(track, candidates, used)
    const found = searches[index]?.find(item => item.id === match?.id)
    if (!match || !found) {
      unmatched.push(track.artist ? `${track.title} — ${track.artist}` : track.title)
      return
    }
    used.add(match.id)
    videos.push(toVideo(match, found))
  })

  if (videos.length === 0 && searchError) throw searchError

  if (videos.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: unmatched[0]
        ? `No YouTube audio matched ${unmatched[0]}.`
        : 'No YouTube audio matched that Spotify link.',
    })
  }

  return {
    title: listing.title,
    videos,
    unmatched,
    truncated: listing.truncated,
  }
}
