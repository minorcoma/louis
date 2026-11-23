import { youtubeSearchAction, type YoutubeSearchAction } from './youtubeUrl.ts'

const SPOTIFY_ENTITIES = new Set(['track', 'album', 'playlist', 'episode', 'show'])
const SPOTIFY_ID = /^[A-Za-z0-9]{10,32}$/
const SOUNDCLOUD_HOSTS = new Set(['soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'])
const SOUNDCLOUD_RESERVED = new Set([
  'discover', 'you', 'search', 'stations', 'popular', 'charts', 'upload',
  'messages', 'settings', 'mobile', 'pages', 'tags', 'groups',
])

export type SpotifyEntity = 'track' | 'album' | 'playlist' | 'episode' | 'show'

export type ParsedMediaLink =
  | { kind: 'spotify', entity: SpotifyEntity, id: string }
  | { kind: 'spotify-short', url: string }
  | { kind: 'soundcloud-track', user: string, slug: string, url: string }
  | { kind: 'soundcloud-set', user: string, slug: string, url: string }
  | { kind: 'soundcloud-short', url: string }
  | { kind: 'soundcloud-unsupported' }
  | { kind: 'spotify-unsupported' }

function hostOf(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase()
}

function pathSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean).map(segment => {
    try {
      return decodeURIComponent(segment)
    }
    catch {
      return segment
    }
  })
}

function safeSlug(value: string | undefined): string | null {
  const slug = value?.trim() ?? ''
  if (!slug || slug === '.' || slug === '..' || slug.length > 200) return null
  if (/[\u0000-\u001f]/.test(slug)) return null
  return slug
}

export function parseSpotifyUrl(value: string): ParsedMediaLink | null {
  const raw = value.trim()
  const uri = raw.match(/^spotify:(track|album|playlist|episode|show):([A-Za-z0-9]{10,32})$/i)
  if (uri?.[1] && uri[2] && SPOTIFY_ENTITIES.has(uri[1].toLowerCase())) {
    return { kind: 'spotify', entity: uri[1].toLowerCase() as SpotifyEntity, id: uri[2] }
  }

  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const host = hostOf(url.hostname)
  if (host === 'spotify.link') {
    return { kind: 'spotify-short', url: url.toString() }
  }
  if (host !== 'open.spotify.com') return null

  const segments = pathSegments(url.pathname)
  const entityIndex = segments[0]?.startsWith('intl-') || segments[0] === 'embed' ? 1 : 0
  const entity = segments[entityIndex]?.toLowerCase()
  const id = segments[entityIndex + 1]
  if (!entity || !id) return { kind: 'spotify-unsupported' }
  if (!SPOTIFY_ENTITIES.has(entity) || !SPOTIFY_ID.test(id)) return { kind: 'spotify-unsupported' }
  return { kind: 'spotify', entity: entity as SpotifyEntity, id }
}

export function parseSoundcloudUrl(value: string): ParsedMediaLink | null {
  let url: URL
  try {
    url = new URL(value.trim())
  }
  catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const host = hostOf(url.hostname)
  if (!SOUNDCLOUD_HOSTS.has(host)) return null

  const segments = pathSegments(url.pathname)
  if (host === 'on.soundcloud.com') {
    const code = safeSlug(segments[0])
    if (!code || segments.length !== 1) return { kind: 'soundcloud-unsupported' }
    return { kind: 'soundcloud-short', url: `https://on.soundcloud.com/${encodeURIComponent(code)}` }
  }

  const user = safeSlug(segments[0])
  if (!user || SOUNDCLOUD_RESERVED.has(user.toLowerCase())) return { kind: 'soundcloud-unsupported' }

  if (segments.length === 3 && segments[1]?.toLowerCase() === 'sets') {
    const slug = safeSlug(segments[2])
    if (!slug) return { kind: 'soundcloud-unsupported' }
    return {
      kind: 'soundcloud-set',
      user,
      slug,
      url: `https://soundcloud.com/${encodeURIComponent(user)}/sets/${encodeURIComponent(slug)}`,
    }
  }

  if (segments.length === 2) {
    const slug = safeSlug(segments[1])
    if (!slug || slug.toLowerCase() === 'sets') return { kind: 'soundcloud-unsupported' }
    return {
      kind: 'soundcloud-track',
      user,
      slug,
      url: `https://soundcloud.com/${encodeURIComponent(user)}/${encodeURIComponent(slug)}`,
    }
  }

  return { kind: 'soundcloud-unsupported' }
}

export function classifyMediaLink(value: string): ParsedMediaLink | null {
  return parseSpotifyUrl(value) ?? parseSoundcloudUrl(value)
}

/** Button for the search field, including Spotify and SoundCloud links. */
export function mediaSearchAction(query: string, clearable: boolean): YoutubeSearchAction {
  const link = classifyMediaLink(query)
  if (link?.kind === 'spotify' || link?.kind === 'spotify-short' || link?.kind === 'spotify-unsupported') {
    const many = link.kind === 'spotify' && (link.entity === 'album' || link.entity === 'playlist' || link.entity === 'show')
    return many
      ? { kind: 'add-spotify', label: 'Add all', ariaLabel: 'Add this Spotify album or playlist' }
      : { kind: 'add-spotify', label: 'Add', ariaLabel: 'Add this Spotify link' }
  }
  if (
    link?.kind === 'soundcloud-track'
    || link?.kind === 'soundcloud-set'
    || link?.kind === 'soundcloud-short'
    || link?.kind === 'soundcloud-unsupported'
  ) {
    return link.kind === 'soundcloud-set'
      ? { kind: 'add-soundcloud', label: 'Add all', ariaLabel: 'Add every track in this SoundCloud playlist' }
      : { kind: 'add-soundcloud', label: 'Add', ariaLabel: 'Add this SoundCloud link' }
  }
  return youtubeSearchAction(query, clearable)
}
