import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { uploadTrackArtFromUrl, toIcon16x16 } from '~/components/track-art/upload'
import { mediaIdFromIcon16x16, resolveTrackIcon } from '#shared/myo-editor/trackArt'
import {
  iconSearchQueries,
  suggestIconsForTracks,
  type SuggestableIcon,
} from '#shared/myo-editor/suggestTrackIcons'

/** Community searches in flight at once. */
const SEARCH_CONCURRENCY = 4

/** One run at a time, shared by the playlist button and per-track actions. */
const finding = ref(false)

export interface FindIconsResult {
  applied: number
  reused: number
  /** Titles of tracks that matched nothing. */
  unmatched: string[]
  error?: string
}

async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

async function loadCandidates(cardTitle: string, trackTitles: string[]): Promise<SuggestableIcon[]> {
  const icons: SuggestableIcon[] = []
  const publicData = await $fetch<{
    icons?: Array<{ mediaId?: string, title?: string, tags?: string[], url?: string }>
  }>('/api/yoto/icons/public').catch(() => ({ icons: [] }))

  for (const icon of publicData.icons ?? []) {
    const mediaId = icon.mediaId?.trim()
    const url = icon.url?.trim()
    if (!mediaId || !url) continue
    icons.push({
      key: `yoto:${mediaId}`,
      title: icon.title?.trim() || 'Yoto icon',
      tags: icon.tags ?? [],
      url,
      source: 'yoto',
      mediaId,
    })
  }

  const queries = iconSearchQueries(cardTitle, trackTitles)
  const community = await mapPool(queries, SEARCH_CONCURRENCY, async (query) => {
    const data = await $fetch<{
      icons?: Array<{ id?: string, title?: string, tags?: string[], imageUrl?: string }>
    }>('/api/yotoicons/search', { query: { q: query } }).catch(() => ({ icons: [] }))
    return data.icons ?? []
  })

  const seen = new Set(icons.map(icon => icon.key))
  for (const icon of community.flat()) {
    const id = icon.id?.trim()
    const url = icon.imageUrl?.trim()
    if (!id || !url || seen.has(`yotoicons:${id}`)) continue
    seen.add(`yotoicons:${id}`)
    icons.push({
      key: `yotoicons:${id}`,
      title: icon.title?.trim() || 'Icon',
      tags: icon.tags ?? [],
      url,
      source: 'yotoicons',
    })
  }

  return icons
}

/**
 * Find and apply icons for some or all tracks of the open playlist.
 * Call from a component's setup (uses the injected editor).
 */
export function useFindIcons() {
  const editor = inject(MYO_EDITOR_KEY, null)

  const canFind = computed(() => Boolean(
    editor
    && editor.isEditing.value
    && !editor.isPodcast.value
    && !editor.isPlaylistLocked.value
    && editor.playlist.value.length > 0,
  ))

  /** `trackIds` omitted = every track. */
  async function findIcons(trackIds?: readonly string[]): Promise<FindIconsResult> {
    const empty: FindIconsResult = { applied: 0, reused: 0, unmatched: [] }
    if (!editor || !canFind.value || finding.value) return { ...empty, error: 'busy' }
    finding.value = true
    try {
      const all = editor.playlist.value
      const wanted = trackIds ? new Set(trackIds) : null
      const targets = all.filter(track => !wanted || wanted.has(track.id))
      if (targets.length === 0) return empty

      // Prefer icons nobody on this card has yet; for a single track, also
      // skip the one it has now so asking again gives something new.
      const avoidKeys = new Set<string>()
      for (const track of all) {
        const isTarget = !wanted || wanted.has(track.id)
        // A multi-track run replaces its targets' icons, so those are free.
        if (isTarget && targets.length > 1) continue
        const mediaId = mediaIdFromIcon16x16(resolveTrackIcon(track).icon16x16)
        if (mediaId) avoidKeys.add(`yoto:${mediaId}`)
      }

      const cardTitle = editor.cardTitle.value
      const tracks = targets.map(track => ({ id: track.id, title: track.title }))
      const icons = await loadCandidates(cardTitle, tracks.map(track => track.title))
      const picks = suggestIconsForTracks({ cardTitle, tracks, icons, avoidKeys })

      const pickedIds = new Set(picks.map(pick => pick.trackId))
      const unmatched = targets.filter(track => !pickedIds.has(track.id)).map(track => track.title)

      // Community icons are uploaded once per run, even when reused.
      const uploaded = new Map<string, { mediaId: string, url: string }>()
      let applied = 0
      let reused = 0
      for (const pick of picks) {
        try {
          let mediaId = pick.icon.mediaId
          let previewUrl = pick.icon.url
          if (!mediaId) {
            let done = uploaded.get(pick.icon.key)
            if (!done) {
              const result = await uploadTrackArtFromUrl(pick.icon.url, `icon-${pick.trackId}.png`)
              done = { mediaId: result.mediaId, url: result.url || pick.icon.url }
              uploaded.set(pick.icon.key, done)
            }
            mediaId = done.mediaId
            previewUrl = done.url
          }
          const result = await editor.persistTrackArt(pick.trackId, toIcon16x16(mediaId), previewUrl)
          if (result.error) return { applied, reused, unmatched, error: result.error }
          applied++
          if (pick.kind === 'reused') reused++
        }
        catch {
          // A community icon that won't upload is skipped; the rest still apply.
          const title = targets.find(track => track.id === pick.trackId)?.title
          if (title) unmatched.push(title)
        }
      }
      return { applied, reused, unmatched }
    }
    catch (err: unknown) {
      return { ...empty, error: err instanceof Error ? err.message : 'Could not search for icons.' }
    }
    finally {
      finding.value = false
    }
  }

  return { finding: readonly(finding), canFind, findIcons }
}
