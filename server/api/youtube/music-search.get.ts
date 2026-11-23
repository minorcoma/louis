import {
  youtubeMusicArtistName,
  youtubeMusicSongIds,
  youtubeMusicSongsSearchUrl,
} from '#shared/myo-editor/youtubeMusicSearch'
import { discoverYoutubeVideos } from '../../utils/youtube-discovery'
import { rememberYoutubeCache } from '../../utils/youtube'
import { runYtdlpJson } from '../../utils/youtube-ytdlp-json'
import { unwrapYtdlpEntries } from '../../utils/youtube-ytdlp-map'

const MAX_RESULTS = 24
const MAX_DEPTH = 96

export interface YoutubeMusicSearchItem {
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  publishedAt: string
  duration?: string
  durationSeconds?: number
  youtubeMusic: true
}

/**
 * YouTube Music "Songs" search. yt-dlp lists ids and titles only, so details
 * (length, artist, art) come from a videos lookup: 1 Data API quota unit per
 * 50 ids with a key, or yt-dlp without one. The search itself never uses the API.
 */
export default defineEventHandler(async (event): Promise<{
  items: YoutubeMusicSearchItem[]
  nextPage?: number
}> => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  if (!q) {
    throw createError({ statusCode: 400, statusMessage: 'Query parameter "q" is required' })
  }
  if (q.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'That search is too long.' })
  }
  const maxResults = Math.min(MAX_RESULTS, Math.max(1, Number(query.maxResults) || 12))
  const page = Math.max(0, Math.floor(Number(query.page) || 0))
  const start = page * maxResults
  const end = start + maxResults
  if (end > MAX_DEPTH) return { items: [] }

  const cacheKey = `ytdlp-ytmusic:${q}:${start}:${maxResults}`
  return rememberYoutubeCache(cacheKey, async () => {
    const dump = await runYtdlpJson({
      event,
      cacheKey,
      args: [
        '--flat-playlist',
        '--playlist-start', String(start + 1),
        '--playlist-end', String(end),
        '--',
        youtubeMusicSongsSearchUrl(q),
      ],
    })
    const entries = unwrapYtdlpEntries(dump)
    const ids = youtubeMusicSongIds(entries).slice(0, maxResults)
    if (ids.length === 0) return { items: [] }

    const details = await discoverYoutubeVideos(event, ids)
    const byId = new Map(details.items.map(item => [item.id, item]))
    const items = ids.flatMap((id): YoutubeMusicSearchItem[] => {
      const item = byId.get(id)
      if (!item) return []
      return [{
        id,
        title: item.title,
        channelTitle: youtubeMusicArtistName(item.channelTitle),
        thumbnailUrl: item.thumbnailUrl || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        publishedAt: item.publishedAt,
        duration: item.duration,
        durationSeconds: item.durationSeconds,
        youtubeMusic: true,
      }]
    })
    return {
      items,
      nextPage: entries.length >= maxResults && end + maxResults <= MAX_DEPTH ? page + 1 : undefined,
    }
  })
})
