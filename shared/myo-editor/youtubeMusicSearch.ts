const YOUTUBE_VIDEO_ID = /^[\w-]{11}$/

/** YouTube Music "Songs" search page for yt-dlp (no API key needed). */
export function youtubeMusicSongsSearchUrl(query: string): string {
  return `https://music.youtube.com/search?q=${encodeURIComponent(query.trim())}#songs`
}

/**
 * Video ids from a `yt-dlp --flat-playlist -J` dump of a YouTube Music search,
 * in order. Albums/playlists (browse ids) and anything else are skipped.
 */
export function youtubeMusicSongIds(entries: readonly unknown[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue
    const id = (raw as { id?: unknown }).id
    if (typeof id !== 'string' || !YOUTUBE_VIDEO_ID.test(id) || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

/** "Idina Menzel - Topic" → "Idina Menzel" (auto-generated artist channels). */
export function youtubeMusicArtistName(channelTitle: string): string {
  return channelTitle.replace(/\s+-\s+Topic$/i, '').trim() || channelTitle
}
