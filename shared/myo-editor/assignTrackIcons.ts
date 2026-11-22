import type { PlaylistTrack } from './types.ts'
import { applyTrackIcon, mediaIdFromIcon16x16, resolveTrackIcon } from './trackArt.ts'

export interface PublicIconChoice {
  mediaId: string
  url: string
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    const current = copy[index]!
    copy[index] = copy[swap]!
    copy[swap] = current
  }
  return copy
}

/**
 * Fill tracks that have no icon yet, drawing from the public Yoto catalog
 * without repeating until every other icon has been used.
 * Tracks that already have an icon are returned unchanged.
 */
export function assignRandomTrackIcons(
  tracks: PlaylistTrack[],
  icons: readonly PublicIconChoice[],
  options?: {
    include?: (track: PlaylistTrack, index: number) => boolean
    avoidMediaIds?: readonly string[]
    random?: () => number
  },
): PlaylistTrack[] {
  const usable = icons.filter(icon => icon.mediaId.trim() && icon.url.trim())
  const include = options?.include ?? (() => true)
  const random = options?.random ?? Math.random
  const used = new Set(
    (options?.avoidMediaIds ?? []).map(id => id.trim()).filter(Boolean),
  )
  for (const track of tracks) {
    const existing = mediaIdFromIcon16x16(resolveTrackIcon(track).icon16x16)
    if (existing) used.add(existing)
  }

  let deck: PublicIconChoice[] = []
  let cursor = 0
  let lastId: string | null = null

  function takeNext(): PublicIconChoice | null {
    if (usable.length === 0) return null
    if (cursor >= deck.length) {
      const unused = usable.filter(icon => !used.has(icon.mediaId))
      const source = unused.length > 0 ? unused : usable
      deck = shuffle(source, random)
      cursor = 0
      if (lastId && deck.length > 1 && deck[0]?.mediaId === lastId) {
        deck.push(deck.shift()!)
      }
    }
    const choice = deck[cursor]
    cursor += 1
    if (!choice) return null
    used.add(choice.mediaId)
    lastId = choice.mediaId
    return choice
  }

  return tracks.map((track, index) => {
    if (mediaIdFromIcon16x16(resolveTrackIcon(track).icon16x16)) return track
    if (!include(track, index)) return track
    const choice = takeNext()
    if (!choice) return track
    return applyTrackIcon(track, `yoto:#${choice.mediaId.trim()}`, choice.url.trim())
  })
}
