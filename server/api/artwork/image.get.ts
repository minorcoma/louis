import { appleArtworkUrl } from '#shared/myo-editor/coverSearch'
import { PLAYLIST_COVER_SOURCE_MAX_BYTES } from '#shared/myo-editor/playlistCoverCrop'

export default defineEventHandler(async (event) => {
  const raw = getQuery(event).url
  const imageUrl = appleArtworkUrl(typeof raw === 'string' ? raw : '', 600)
  if (!imageUrl) {
    throw createError({ statusCode: 400, statusMessage: 'That cover image is not allowed.' })
  }

  let current = imageUrl
  let response: Response | null = null
  for (let hop = 0; hop < 3; hop++) {
    response = await fetch(current, {
      redirect: 'manual',
      headers: { Accept: 'image/jpeg,image/png,image/*' },
    })
    if (response.status < 300 || response.status >= 400) break
    const next = appleArtworkUrl(response.headers.get('location') ?? '', 600)
    if (!next || next === current) {
      throw createError({ statusCode: 502, statusMessage: 'Could not download that cover.' })
    }
    current = next
  }
  if (!response?.ok) {
    throw createError({ statusCode: 502, statusMessage: 'Could not download that cover.' })
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 32 || bytes.length > PLAYLIST_COVER_SOURCE_MAX_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'That cover image is the wrong size.' })
  }

  const type = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
  setHeader(event, 'content-type', type)
  setHeader(event, 'cache-control', 'private, max-age=3600')
  return bytes
})
