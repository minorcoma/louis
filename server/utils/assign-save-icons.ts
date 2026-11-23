import type { PlaylistTrack, SavePlan } from '#shared/myo-editor/types'
import { assignRandomTrackIcons, type PublicIconChoice } from '#shared/myo-editor/assignTrackIcons'
import { resolveTrackIcon } from '#shared/myo-editor/trackArt'
import { fetchPublicYotoIconRecords, normalizeIconUrl } from './yoto-icons'

/** Give new uploads a public Yoto icon when the playlist row does not already have one. */
export async function assignIconsForNewExtracts(
  accessToken: string,
  playlist: PlaylistTrack[],
  plan: SavePlan,
): Promise<PlaylistTrack[]> {
  const indexes = new Set(
    plan.tracks
      .filter(action =>
        action.kind === 'extract-youtube'
        || action.kind === 'extract-local'
        || action.kind === 'extract-soundcloud',
      )
      .map(action => action.playlistIndex),
  )
  const needsIcon = [...indexes].some((index) => {
    const track = playlist[index]
    return track ? !resolveTrackIcon(track).icon16x16 : false
  })
  if (!needsIcon) return playlist

  let icons: PublicIconChoice[] = []
  try {
    const records = await fetchPublicYotoIconRecords(accessToken)
    icons = records.flatMap((record) => {
      const url = normalizeIconUrl(record.url, record.mediaId)
      if (!record.mediaId || !url) return []
      return [{ mediaId: record.mediaId, url }]
    })
  }
  catch (err) {
    console.warn(
      '[icons] public catalog unavailable:',
      err instanceof Error ? err.message : err,
    )
    return playlist
  }

  return assignRandomTrackIcons(playlist, icons, {
    include: (_track, index) => indexes.has(index),
  })
}
