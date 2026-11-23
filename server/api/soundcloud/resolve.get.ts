import { resolveSoundcloudLink } from '../../utils/soundcloud-resolve'

export default defineEventHandler(async (event) => {
  const url = String(getQuery(event).url ?? '').trim()
  if (!url || url.length > 500) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Paste a SoundCloud track or playlist link.',
    })
  }
  return await resolveSoundcloudLink(url)
})
