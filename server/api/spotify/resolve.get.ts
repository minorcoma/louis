import { resolveSpotifyLink } from '../../utils/spotify-resolve'

export default defineEventHandler(async (event) => {
  const url = String(getQuery(event).url ?? '').trim()
  if (!url || url.length > 500) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Paste a Spotify track, album, or playlist link.',
    })
  }
  return await resolveSpotifyLink(event, url)
})
