import { coverSearchQuery } from '#shared/myo-editor/coverSearch'
import { searchCoverImages } from '../../utils/cover-search'

export default defineEventHandler(async (event) => {
  const raw = getQuery(event).q
  const title = typeof raw === 'string' ? raw : ''
  const query = coverSearchQuery(title)
  if (!query) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Name this playlist before searching for a cover.',
    })
  }
  if (query.length > 120) {
    throw createError({ statusCode: 400, statusMessage: 'That name is too long to search.' })
  }

  try {
    const images = await searchCoverImages(query)
    return { query, images }
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cover search failed'
    throw createError({ statusCode: 502, statusMessage: message })
  }
})
