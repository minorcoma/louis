/** Search source toggles in the picker. Spotify stays link-only (no keyless search). */
export type SearchSource = 'youtube' | 'soundcloud'

export const SEARCH_SOURCES: readonly SearchSource[] = ['youtube', 'soundcloud']

export const DEFAULT_SEARCH_SOURCES: readonly SearchSource[] = ['youtube']

/** Keeps known sources in a stable order; falls back to YouTube when none are left. */
export function normalizeSearchSources(value: unknown): SearchSource[] {
  const list = Array.isArray(value) ? value : []
  const picked = SEARCH_SOURCES.filter(source => list.includes(source))
  return picked.length > 0 ? picked : [...DEFAULT_SEARCH_SOURCES]
}

/** Picker row for a SoundCloud search hit (same shape as a YouTube result). */
export interface SoundcloudSearchItem {
  /** Prefixed so it never collides with, or is mistaken for, a YouTube id. */
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  publishedAt: string
  durationSeconds?: number
  soundcloud: { id: string, url: string }
}

export const SOUNDCLOUD_RESULT_PREFIX = 'sc:'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function soundcloudPageUrl(raw: unknown): string | null {
  const value = text(raw)
  if (!value) return null
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./i, '').toLowerCase()
    if (url.protocol !== 'https:' || (host !== 'soundcloud.com' && host !== 'm.soundcloud.com')) return null
    url.hostname = 'soundcloud.com'
    url.search = ''
    url.hash = ''
    return url.toString()
  }
  catch {
    return null
  }
}

function pickThumbnail(entry: Record<string, unknown>): string {
  const list = Array.isArray(entry.thumbnails) ? entry.thumbnails as Array<Record<string, unknown>> : []
  const urls = list.map(thumb => text(thumb?.url)).filter(Boolean)
  return urls.find(url => url.includes('t500x500'))
    ?? urls.find(url => url.includes('original'))
    ?? urls.at(-1)
    ?? text(entry.thumbnail)
}

/** One `yt-dlp --flat-playlist -J scsearchN:` entry → picker row, or null if unusable. */
export function soundcloudSearchItemFromYtdlp(raw: unknown): SoundcloudSearchItem | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const id = text(typeof entry.id === 'number' ? String(entry.id) : entry.id)
  if (!/^\d{1,20}$/.test(id)) return null
  const url = soundcloudPageUrl(entry.webpage_url)
  const title = text(entry.title)
  if (!url || !title) return null
  const duration = typeof entry.duration === 'number' && entry.duration > 0
    ? Math.round(entry.duration)
    : undefined
  const timestamp = typeof entry.timestamp === 'number' ? entry.timestamp : undefined
  return {
    id: `${SOUNDCLOUD_RESULT_PREFIX}${id}`,
    title,
    channelTitle: text(entry.uploader) || text(entry.artist) || 'SoundCloud',
    thumbnailUrl: pickThumbnail(entry),
    publishedAt: timestamp ? new Date(timestamp * 1000).toISOString() : '',
    durationSeconds: duration,
    soundcloud: { id, url },
  }
}

/**
 * Whether a picker row should render. YouTube rows use the YouTube check
 * (11-char video id, real title, known duration); SoundCloud rows have
 * `sc:` ids that check would reject, so they only need a title.
 */
export function isListablePickerResult(
  video: { id?: string, title?: string, durationSeconds?: number, soundcloud?: unknown },
  isListableYoutube: (video: { id?: string, title?: string, durationSeconds?: number }) => boolean,
): boolean {
  if (video.soundcloud) return Boolean(video.title?.trim())
  return isListableYoutube(video)
}

/** Alternate rows from each source so neither buries the other. */
export function interleaveResults<T>(lists: ReadonlyArray<readonly T[]>): T[] {
  const out: T[] = []
  const longest = Math.max(0, ...lists.map(list => list.length))
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const item = list[i]
      if (item !== undefined) out.push(item)
    }
  }
  return out
}
