import { soundcloudSearchItemFromYtdlp, type SoundcloudSearchItem } from '#shared/myo-editor/soundcloudSearch'
import { rememberYoutubeCache } from '../../utils/youtube'
import { runYtdlpJson } from '../../utils/youtube-ytdlp-json'
import { unwrapYtdlpEntries } from '../../utils/youtube-ytdlp-map'

const MAX_RESULTS = 24
/** scsearch has no cursor, so deep pages re-fetch from the top; cap the depth. */
const MAX_DEPTH = 96

export default defineEventHandler(async (event): Promise<{
  items: SoundcloudSearchItem[]
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

  const cacheKey = `ytdlp-scsearch:${q}:${start}:${maxResults}`
  return rememberYoutubeCache(cacheKey, async () => {
    const dump = await runYtdlpJson({
      event,
      cacheKey,
      args: [
        '--flat-playlist',
        '--playlist-start', String(start + 1),
        '--playlist-end', String(end),
        '--',
        `scsearch${end}:${q}`,
      ],
    })
    const entries = unwrapYtdlpEntries(dump).slice(0, maxResults)
    const items = entries.flatMap((entry) => {
      const item = soundcloudSearchItemFromYtdlp(entry)
      return item ? [item] : []
    })
    return {
      items,
      nextPage: entries.length >= maxResults && end + maxResults <= MAX_DEPTH ? page + 1 : undefined,
    }
  })
})
