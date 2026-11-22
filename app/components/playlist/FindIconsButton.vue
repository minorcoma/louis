<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { uploadTrackArtFromUrl, toIcon16x16 } from '~/components/track-art/upload'
import {
  iconSearchQueries,
  suggestIconsForTracks,
  type SuggestableIcon,
} from '#shared/myo-editor/suggestTrackIcons'

const editor = inject(MYO_EDITOR_KEY, null)
const { playEvent } = useUiSound()
const { showAddedToPlaylist, showError } = useToast()
const finding = ref(false)

const canFind = computed(() => Boolean(
  editor
  && editor.isEditing.value
  && !editor.isPodcast.value
  && !editor.isPlaylistLocked.value
  && editor.playlist.value.length > 0,
))

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
  const community = await Promise.all(queries.map(async (query) => {
    const data = await $fetch<{
      icons?: Array<{ id?: string, title?: string, tags?: string[], imageUrl?: string }>
    }>('/api/yotoicons/search', { query: { q: query } }).catch(() => ({ icons: [] }))
    return data.icons ?? []
  }))

  for (const icon of community.flat()) {
    const id = icon.id?.trim()
    const url = icon.imageUrl?.trim()
    if (!id || !url) continue
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

async function onFind() {
  if (!editor || !canFind.value || finding.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  finding.value = true
  try {
    const tracks = editor.playlist.value.map(track => ({ id: track.id, title: track.title }))
    const icons = await loadCandidates(editor.cardTitle.value, tracks.map(track => track.title))
    const picks = suggestIconsForTracks({
      cardTitle: editor.cardTitle.value,
      tracks,
      icons,
    })
    if (picks.length === 0) {
      showError('No icons matched this card or its track titles.', 6000, 'Find icons')
      return
    }

    let applied = 0
    for (const pick of picks) {
      try {
        let mediaId = pick.icon.mediaId
        let previewUrl = pick.icon.url
        if (!mediaId) {
          const uploaded = await uploadTrackArtFromUrl(pick.icon.url, `icon-${pick.trackId}.png`)
          mediaId = uploaded.mediaId
          previewUrl = uploaded.url || previewUrl
        }
        const result = await editor.persistTrackArt(pick.trackId, toIcon16x16(mediaId), previewUrl)
        if (result.error) {
          showError(result.error, 6000, 'Find icons')
          break
        }
        applied++
      }
      catch {
        // A community icon that will not upload is skipped. The rest still apply.
      }
    }

    if (applied === 0) {
      showError('Those matches could not be saved. Try again once Yoto is connected.', 6000, 'Find icons')
      return
    }
    const noun = applied === 1 ? 'icon' : 'icons'
    showAddedToPlaylist(`${applied} ${noun}`, editor.cardTitle.value.trim() || 'this playlist')
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not search for icons.'
    showError(message, 6000, 'Find icons')
  }
  finally {
    finding.value = false
  }
}
</script>

<template>
  <button
    v-if="canFind || finding"
    type="button"
    class="find-icons-button maru-button maru-button--sm bg-maru-yellow-light text-maru-black w-full"
    :disabled="finding"
    @click="onFind"
  >
    <span class="maru-button__label">{{ finding ? 'Finding…' : 'Find icons' }}</span>
  </button>
</template>
