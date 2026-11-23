import type { PlaylistTrack } from './types.ts'
import { makeTrackSplit, planTrackSplit, splitPartTitle, splitPartTrackId } from './splitTrack.ts'

export interface SoundcloudListingTrack {
  id: string
  title: string
  artist: string
  url: string
  thumbnailUrl: string
  durationSeconds: number
}

export interface SoundcloudListing {
  title: string
  tracks: SoundcloudListingTrack[]
  truncated: boolean
}

export interface SoundcloudListingDraft {
  title: string
  clientId: string
  /** Full tracks, with id-only placeholders where the page did not include details. */
  entries: Array<SoundcloudListingTrack | { id: string }>
  truncated: boolean
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function soundcloudId(value: unknown): string {
  const id = typeof value === 'number' && Number.isFinite(value)
    ? String(Math.trunc(value))
    : text(value)
  return /^\d{1,20}$/.test(id) ? id : ''
}

export function soundcloudArtworkUrl(raw: unknown): string {
  const url = text(raw)
  if (!url.startsWith('https://')) return ''
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.endsWith('.sndcdn.com') && parsed.hostname !== 'sndcdn.com') return ''
  }
  catch {
    return ''
  }
  return url.replace('-large.', '-t500x500.')
}

function listingTrack(record: Record<string, unknown>, fallbackArtist: string): SoundcloudListingTrack | null {
  if (record.public === false) return null
  const id = soundcloudId(record.id)
  const title = text(record.title).slice(0, 180)
  const url = text(record.permalink_url)
  if (!id || !title || !url.startsWith('https://soundcloud.com/')) return null
  const user = record.user && typeof record.user === 'object'
    ? text((record.user as { username?: unknown }).username)
    : ''
  const durationMs = typeof record.duration === 'number' ? record.duration : 0
  return {
    id,
    title,
    artist: (user || fallbackArtist).slice(0, 180),
    url,
    thumbnailUrl: soundcloudArtworkUrl(record.artwork_url),
    durationSeconds: durationMs > 0 ? Math.round(durationMs / 1000) : 0,
  }
}

function clientIdFrom(items: Array<{ hydratable?: unknown, data?: unknown }>): string {
  const client = items.find(item => item.hydratable === 'apiClient' && item.data && typeof item.data === 'object')
  const id = client?.data && typeof client.data === 'object'
    ? text((client.data as { id?: unknown }).id)
    : ''
  return /^[A-Za-z0-9]{16,64}$/.test(id) ? id : ''
}

function placeholder(record: Record<string, unknown>): { id: string } | null {
  const id = soundcloudId(record.id)
  return id ? { id } : null
}

/** Tracks from a SoundCloud `window.__sc_hydration` array. */
export function soundcloudListingFromHydration(payload: unknown): SoundcloudListingDraft | null {
  if (!Array.isArray(payload)) return null
  const items = payload.filter(item => item && typeof item === 'object') as Array<{
    hydratable?: unknown
    data?: unknown
  }>
  const clientId = clientIdFrom(items)
  const playlist = items.find(item => item.hydratable === 'playlist' && item.data && typeof item.data === 'object')
  if (playlist?.data && typeof playlist.data === 'object') {
    const data = playlist.data as Record<string, unknown>
    const rows = Array.isArray(data.tracks) ? data.tracks : []
    const artist = data.user && typeof data.user === 'object'
      ? text((data.user as { username?: unknown }).username)
      : ''
    const entries: SoundcloudListingDraft['entries'] = []
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const record = row as Record<string, unknown>
      const track = listingTrack(record, artist)
      if (track) {
        entries.push(track)
      }
      else if (!text(record.title) && !text(record.permalink_url)) {
        const slot = placeholder(record)
        if (slot) entries.push(slot)
      }
      if (entries.length >= 100) break
    }
    if (entries.length === 0) return null
    return {
      title: text(data.title) || 'SoundCloud',
      clientId,
      entries,
      truncated: rows.length >= 100,
    }
  }

  const sound = items.find(item => item.hydratable === 'sound' && item.data && typeof item.data === 'object')
  if (!sound?.data || typeof sound.data !== 'object') return null
  const track = listingTrack(sound.data as Record<string, unknown>, '')
  if (!track) return null
  return { title: track.title, clientId, entries: [track], truncated: false }
}

export function finishSoundcloudListing(
  draft: SoundcloudListingDraft,
  fetched: readonly SoundcloudListingTrack[],
): SoundcloudListing | null {
  const byId = new Map(fetched.map(track => [track.id, track]))
  const tracks: SoundcloudListingTrack[] = []
  for (const entry of draft.entries) {
    const track = 'url' in entry ? entry : byId.get(entry.id)
    if (!track) continue
    tracks.push(track)
  }
  if (tracks.length === 0) return null
  return { title: draft.title, tracks, truncated: draft.truncated }
}

export function soundcloudListingToTracks(
  tracks: readonly SoundcloudListingTrack[],
  targetSeconds: number,
): PlaylistTrack[] {
  const rows: PlaylistTrack[] = []
  for (const track of tracks) {
    const groupId = `soundcloud:${track.id}`
    const base: PlaylistTrack = {
      id: groupId,
      title: track.title,
      subtitle: track.artist,
      thumbnailUrl: track.thumbnailUrl,
      source: 'soundcloud',
      duration: track.durationSeconds > 0 ? track.durationSeconds : undefined,
      soundcloud: { id: track.id, url: track.url },
    }
    const plan = track.durationSeconds > 0
      ? planTrackSplit(track.durationSeconds, targetSeconds)
      : null
    if (!plan) {
      rows.push(base)
      continue
    }
    for (const [index, part] of plan.parts.entries()) {
      rows.push({
        ...base,
        id: splitPartTrackId(groupId, index),
        title: splitPartTitle(track.title, index),
        duration: part.duration,
        split: makeTrackSplit(groupId, index, plan, {
          sourceDurationSeconds: track.durationSeconds,
        }),
      })
    }
  }
  return rows
}
