import { createError } from 'h3'
import { parseSoundcloudUrl } from '#shared/myo-editor/mediaLink'
import {
  finishSoundcloudListing,
  soundcloudListingFromHydration,
  type SoundcloudListing,
  type SoundcloudListingTrack,
} from '#shared/myo-editor/soundcloudTracks'
import { fetchAllowedPage, readLimitedText } from './page-fetch'

const SOUNDCLOUD_HOSTS = new Set(['soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'])

function readHydration(html: string): unknown {
  const marker = 'window.__sc_hydration = '
  const start = html.indexOf(marker)
  if (start < 0) return null
  const jsonStart = start + marker.length
  const end = html.indexOf('</script>', jsonStart)
  if (end < 0) return null
  const slice = html.slice(jsonStart, end).trim().replace(/;$/, '')
  try {
    return JSON.parse(slice)
  }
  catch {
    return null
  }
}

async function fetchMissingTracks(
  clientId: string,
  ids: string[],
): Promise<SoundcloudListingTrack[]> {
  if (!clientId || ids.length === 0) return []
  const collected: SoundcloudListingTrack[] = []
  for (let offset = 0; offset < ids.length; offset += 40) {
    const batch = ids.slice(offset, offset + 40)
    const url = new URL('https://api-v2.soundcloud.com/tracks')
    url.searchParams.set('ids', batch.join(','))
    url.searchParams.set('client_id', clientId)
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; Louis/1.0)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) continue
    const payload = JSON.parse(await readLimitedText(response)) as unknown
    if (!Array.isArray(payload)) continue
    const draft = soundcloudListingFromHydration([
      { hydratable: 'playlist', data: { title: 'SoundCloud', tracks: payload } },
    ])
    for (const entry of draft?.entries ?? []) {
      if ('url' in entry) collected.push(entry)
    }
  }
  return collected
}

async function listingFromHtml(html: string): Promise<SoundcloudListing | null> {
  const draft = soundcloudListingFromHydration(readHydration(html))
  if (!draft) return null
  const missing = draft.entries.filter((entry): entry is { id: string } => !('url' in entry))
  const fetched = await fetchMissingTracks(draft.clientId, missing.map(entry => entry.id))
  return finishSoundcloudListing(draft, fetched)
}

export async function resolveSoundcloudLink(rawUrl: string): Promise<SoundcloudListing> {
  let parsed = parseSoundcloudUrl(rawUrl)
  if (parsed?.kind === 'soundcloud-short') {
    const page = await fetchAllowedPage(parsed.url, SOUNDCLOUD_HOSTS)
    const listing = await listingFromHtml(page.html)
    if (listing) return listing
    parsed = parseSoundcloudUrl(page.finalUrl)
  }

  if (parsed?.kind !== 'soundcloud-track' && parsed?.kind !== 'soundcloud-set') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Paste a SoundCloud track or playlist link.',
    })
  }

  const page = await fetchAllowedPage(parsed.url, SOUNDCLOUD_HOSTS)
  const listing = await listingFromHtml(page.html)
  if (!listing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'That SoundCloud link has no public tracks.',
    })
  }
  return listing
}
