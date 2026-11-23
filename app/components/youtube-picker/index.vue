<!--
  YouTube Picker — self-contained search/browse/select component.

  Search uses bundled yt-dlp when LOUIS_YOUTUBE_API_KEY is unset.
  A Data API key is recommended (faster search, moderate safeSearch on typed search).
  Server proxy routes: /api/youtube/search, /api/youtube/videos, /api/youtube/playlist, /api/youtube/channel
-->
<script setup lang="ts">
import { useYoutubePicker, YOUTUBE_PICKER_RESULTS_KEY } from './useYoutubePicker'
import YoutubePickerResultsPane from './YoutubePickerResultsPane.vue'
import YoutubePickerSearch from './YoutubePickerSearch.vue'
import { useYoutubeAudioPlayer, YOUTUBE_AUDIO_PLAYER_KEY } from './useYoutubeAudioPlayer'
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'
import { videosToPlaylistTracks } from '~/components/playlist/types'
import { classifyInsertTracksOutcome } from '#shared/myo-editor/standalonePlaylist'
import { localAudioExtension, planLocalAudioTracks } from '#shared/myo-editor/localAudio'
import { getSplitTargetSeconds } from '#shared/myo-editor/splitTarget'
import { classifyYoutubeSearchInput } from '#shared/myo-editor/youtubeUrl'
import { mediaSearchAction } from '#shared/myo-editor/mediaLink'
import { soundcloudListingToTracks, type SoundcloudListing } from '#shared/myo-editor/soundcloudTracks'
import { uploadLocalAudio } from '~/utils/uploadLocalAudio'
import type { PlaylistTrack } from '#shared/myo-editor/types'
import type { YoutubeVideoSummary } from './types'

const props = withDefaults(defineProps<{
  placeholders?: string[]
  maxResults?: number
  embedded?: boolean
}>(), {
  maxResults: 12,
  embedded: false,
})

const DEFAULT_SEARCH_PLACEHOLDERS = [
  'K Pop Demon Hunters',
  'Sesame Street',
  'Warren Zevon',
  'The Beach Boys',
]

const appConfig = useAppConfig()
const {
  searchPlaceholders: preferredPlaceholders,
  searchSources,
  setSearchSource,
} = useUserPreferences()

const SEARCH_SOURCE_OPTIONS = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'soundcloud', label: 'SoundCloud' },
] as const
const searchPlaceholders = computed(
  () => preferredPlaceholders.value
    ?? props.placeholders
    ?? appConfig.youtubePicker?.searchPlaceholders
    ?? DEFAULT_SEARCH_PLACEHOLDERS,
)

const containerRef = ref<HTMLElement | null>(null)
const audioPlayer = useYoutubeAudioPlayer()
provide(YOUTUBE_AUDIO_PLAYER_KEY, audioPlayer)

const {
  query,
  submittedQuery,
  results,
  focusedIndex,
  status,
  errorMessage,
  nextPageToken,
  loadingMore,
  search,
  loadEntirePlaylist,
  loadMore,
  selectVideo,
  moveFocus,
  resetSearch,
  playlistSummary,
  skippedUnavailable,
  skippedMissingDuration,
  selectedCount,
  allImportableSelected,
  importableCount,
  playlistMode,
  channelSummary,
  searchSource,
  toggleSelectAll,
} = useYoutubePicker(props.maxResults)

function onToggleSearchSource(source: 'youtube' | 'soundcloud', event: Event) {
  const input = event.target as HTMLInputElement
  const before = searchSources.value.join(',')
  setSearchSource(source, input.checked)
  // The last checked source can't be turned off; put the box back.
  input.checked = searchSources.value.includes(source)
  if (searchSources.value.join(',') === before) return
  playEvent(input.checked ? 'toggleOn' : 'toggleOff')
  // Re-run a typed search so the results match the boxes.
  if (searchSource.value === 'text' && submittedQuery.value.trim() && status.value !== 'loading') {
    query.value = submittedQuery.value
    void search()
  }
}

provide(YOUTUBE_PICKER_RESULTS_KEY, results)

const { showAddedToPlaylist, showDuplicateTrack, showError } = useToast()
const { playEvent } = useUiSound()
const editor = inject(MYO_EDITOR_KEY, null)
const adding = ref(false)
const addingFiles = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const searchAction = computed(() =>
  mediaSearchAction(query.value, Boolean(submittedQuery.value.trim())),
)

watch(errorMessage, (msg, prev) => {
  if (!msg || msg === prev) return
  showError(msg)
})

const resultsPaneMode = computed(() => {
  if (!submittedQuery.value.trim()) return 'initial' as const
  if (status.value === 'loading' && results.value.length === 0) return 'loading' as const
  if (results.value.length === 0) return 'no-results' as const
  return 'results' as const
})

function addedLabel(videos: YoutubeVideoSummary[], added: number) {
  if (added === 1) return videos[0]?.title ?? 'Track'
  return `${added} tracks`
}

function commitTracks(
  tracks: PlaylistTrack[],
  options: {
    truncated?: boolean
    playlistTitle?: string
    addedLabel: string | ((added: number) => string)
    duplicateLabel?: string
  },
) {
  if (!editor || tracks.length === 0) return

  if (!editor.isEditing.value && !editor.startNewPlaylist()) {
    showError('Could not start a new playlist. Try again.')
    return
  }

  if (!editor.canAcceptTracks.value) {
    editor.appendPendingCreateTracks(tracks)
    playEvent('buttonClick')
    const extra = options.truncated
      ? ' Yoto playlists hold 100 tracks, so the rest was left out.'
      : ''
    showError(`Name this playlist to finish adding these tracks.${extra}`, 8000, 'Name this playlist')
    return
  }

  const result = editor.insertTracks(tracks)
  if (!result.ok) {
    playEvent('disabled')
    showError(result.message)
    return
  }

  const outcome = classifyInsertTracksOutcome(result)
  const destination = editor.cardTitle.value.trim() || options.playlistTitle || 'playlist'
  if (options.truncated && result.added > 0) {
    showError(
      `Added ${result.added}. Yoto playlists hold 100 tracks, so the rest was left out.`,
      8000,
    )
    return
  }
  if (outcome.kind === 'mixed' || outcome.kind === 'overflow') {
    showError(outcome.message, 0, outcome.title)
    return
  }
  if (outcome.kind === 'added') {
    const label = typeof options.addedLabel === 'function'
      ? options.addedLabel(result.added)
      : options.addedLabel
    showAddedToPlaylist(label, destination)
    return
  }
  if (outcome.kind === 'duplicate') {
    showDuplicateTrack(options.duplicateLabel ?? 'Track')
  }
}

function commitVideos(
  videos: YoutubeVideoSummary[],
  options: { truncated: boolean, playlistTitle?: string },
) {
  const tracks = videosToPlaylistTracks(videos)
  if (tracks.length === 0) {
    showError('Nothing in that link can be added.')
    return
  }
  commitTracks(tracks, {
    truncated: options.truncated,
    playlistTitle: options.playlistTitle,
    addedLabel: added => addedLabel(videos, added),
    duplicateLabel: videos[0]?.title ?? 'Track',
  })
}

function localAddedLabel(tracks: PlaylistTrack[]): string {
  if (tracks.length === 1) return tracks[0]?.title ?? 'Track'
  const books = new Set(tracks.map(track => track.subtitle).filter(Boolean))
  if (books.size === 1 && tracks[0]?.subtitle && tracks[0].subtitle !== 'MP3' && tracks[0].subtitle !== 'M4B') {
    return `${tracks.length} chapters`
  }
  return `${tracks.length} tracks`
}

async function onLocalFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (files.length === 0 || addingFiles.value) return
  addingFiles.value = true
  const tracks: PlaylistTrack[] = []
  const problems: string[] = []
  try {
    for (const file of files) {
      if (!localAudioExtension(file.name)) {
        problems.push(`${file.name} is not an MP3 or M4B.`)
        continue
      }
      try {
        const probed = await uploadLocalAudio(file)
        const planned = planLocalAudioTracks({
          uploadId: probed.uploadId,
          filename: probed.filename,
          ext: probed.ext,
          durationSeconds: probed.durationSeconds,
          chapters: probed.chapters,
          splitTargetSeconds: getSplitTargetSeconds(),
        })
        if (planned.length === 0) {
          problems.push(`Could not read ${file.name}.`)
          continue
        }
        tracks.push(...planned)
        if (probed.chaptersWarning) problems.push(`${file.name}: ${probed.chaptersWarning}`)
      }
      catch (err) {
        problems.push(err instanceof Error ? err.message : `Could not read ${file.name}.`)
      }
    }
    if (tracks.length > 0) {
      commitTracks(tracks, { addedLabel: localAddedLabel(tracks) })
    }
    if (problems.length > 0) showError(problems.join(' '))
  }
  finally {
    addingFiles.value = false
  }
}

function linkError(err: unknown, fallback: string): string {
  const e = err as { data?: { statusMessage?: string, message?: string }, statusMessage?: string, message?: string }
  return e.data?.statusMessage || e.data?.message || e.statusMessage || e.message || fallback
}

async function onAddSpotify() {
  const url = query.value.trim()
  try {
    const data = await $fetch<{
      title: string
      videos: YoutubeVideoSummary[]
      unmatched: string[]
      truncated: boolean
    }>('/api/spotify/resolve', { query: { url } })
    if (!data.videos?.length) {
      showError('Nothing in that Spotify link matched a YouTube video.')
      return
    }
    const keepLink = !editor?.canAcceptTracks.value
    commitVideos(data.videos, { truncated: data.truncated, playlistTitle: data.title })
    if (!keepLink) query.value = ''
    if (!keepLink && data.unmatched?.length) {
      const sample = data.unmatched.slice(0, 3).join(', ')
      const extra = data.unmatched.length > 3 ? ` and ${data.unmatched.length - 3} more` : ''
      showError(`No YouTube match for ${sample}${extra}.`, 8000, 'Spotify')
    }
  }
  catch (err) {
    showError(linkError(err, 'Could not read that Spotify link.'), 6000, 'Spotify')
  }
}

async function onAddSoundcloud() {
  const url = query.value.trim()
  try {
    const data = await $fetch<SoundcloudListing>('/api/soundcloud/resolve', { query: { url } })
    const tracks = soundcloudListingToTracks(data.tracks ?? [], getSplitTargetSeconds())
    if (tracks.length === 0) {
      showError('Nothing in that SoundCloud link can be added.')
      return
    }
    const keepLink = !editor?.canAcceptTracks.value
    commitTracks(tracks, {
      truncated: data.truncated,
      playlistTitle: data.title,
      addedLabel: tracks.length === 1 ? (tracks[0]?.title ?? 'Track') : `${tracks.length} tracks`,
      duplicateLabel: tracks[0]?.title ?? 'Track',
    })
    if (!keepLink) query.value = ''
  }
  catch (err) {
    showError(linkError(err, 'Could not read that SoundCloud link.'), 6000, 'SoundCloud')
  }
}

async function onSearchSubmit() {
  if (adding.value || status.value === 'loading') return
  const intent = searchAction.value.kind
  if ((intent === 'add-spotify' || intent === 'add-soundcloud') && editor) {
    adding.value = true
    try {
      if (intent === 'add-spotify') await onAddSpotify()
      else await onAddSoundcloud()
    }
    finally {
      adding.value = false
    }
    return
  }
  if ((intent === 'add-video' || intent === 'add-playlist') && editor) {
    adding.value = true
    try {
      if (intent === 'add-video') {
        await search()
        if (status.value === 'error' || results.value.length === 0) return
        commitVideos(results.value, { truncated: false })
      }
      else {
        const parsed = classifyYoutubeSearchInput(query.value)
        if (parsed.kind !== 'playlist') return
        const loaded = await loadEntirePlaylist(parsed.playlistId, query.value.trim())
        if (!loaded || loaded.videos.length === 0) return
        commitVideos(loaded.videos, { truncated: loaded.truncated, playlistTitle: loaded.title })
      }
      query.value = ''
    }
    finally {
      adding.value = false
    }
    return
  }
  search()
}

function onClearSearch() {
  resetSearch()
}

function onPlaceholderSearch(term: string) {
  query.value = term
  search()
}

async function onSelect(id: string) {
  await selectVideo(id)
}

function onKeydown(event: KeyboardEvent) {
  if (results.value.length === 0) return
  if (event.target instanceof HTMLInputElement) return

  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowRight':
      event.preventDefault()
      moveFocus(1)
      break
    case 'ArrowUp':
    case 'ArrowLeft':
      event.preventDefault()
      moveFocus(-1)
      break
    case 'Enter':
      if (focusedIndex.value >= 0) {
        event.preventDefault()
        onSelect(results.value[focusedIndex.value]!.id)
      }
      break
  }
}

onMounted(() => {
  containerRef.value?.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  containerRef.value?.removeEventListener('keydown', onKeydown)
  audioPlayer.destroy()
})
</script>

<template>
  <div
    ref="containerRef"
    tabindex="0"
    class="yt-picker"
    :class="embedded ? 'relative flex flex-col gap-2 sm:gap-3 h-full min-h-0' : 'relative'"
  >
    <div :class="embedded ? 'shrink-0' : ''">
      <YoutubePickerSearch
        v-model="query"
        :placeholders="searchPlaceholders"
        :embedded="embedded"
        :clearable="Boolean(submittedQuery.trim())"
        :action="adding ? { ...searchAction, label: 'Adding…', ariaLabel: 'Adding this link' } : searchAction"
        @submit="onSearchSubmit"
        @clear="onClearSearch"
      />
      <fieldset class="search-sources mt-2">
        <legend class="sr-only">Search on</legend>
        <span
          class="search-sources__label type-caption font-maru-medium"
          aria-hidden="true"
        >Search</span>
        <label
          v-for="option in SEARCH_SOURCE_OPTIONS"
          :key="option.id"
          class="search-sources__option maru-checkbox"
        >
          <input
            type="checkbox"
            class="maru-checkbox__input"
            :checked="searchSources.includes(option.id)"
            :disabled="searchSources.length === 1 && searchSources.includes(option.id)"
            @change="onToggleSearchSource(option.id, $event)"
          >
          <span
            class="maru-checkbox__box"
            aria-hidden="true"
          >
            <span class="maru-checkbox__mark" />
          </span>
          <span class="type-meta">{{ option.label }}</span>
        </label>
      </fieldset>
      <button
        type="button"
        class="maru-button maru-button--sm bg-maru-yellow-light text-maru-black mt-2 w-full"
        :disabled="addingFiles"
        aria-label="Add an MP3 or M4B. M4B files are split into chapters."
        @click="fileInput?.click()"
      >
        <span class="maru-button__label">{{ addingFiles ? 'Reading…' : 'Add MP3 or M4B' }}</span>
      </button>
      <input
        ref="fileInput"
        class="sr-only"
        type="file"
        accept=".mp3,.m4b,audio/mpeg,audio/mp4,audio/x-m4b"
        multiple
        aria-label="Choose MP3 or M4B files"
        @change="onLocalFiles"
      >
    </div>

    <div :class="embedded ? 'flex flex-1 min-h-0 flex-col overflow-hidden' : ''">
      <p
        v-if="status === 'error'"
        class="type-meta text-maru-red py-4 border-maru rounded-maru bg-maru-red-lighter px-4"
      >
        {{ errorMessage }}
      </p>

      <YoutubePickerResultsPane
        v-else
        :mode="resultsPaneMode"
        :query="submittedQuery"
        :placeholders="searchPlaceholders"
        :results="results"
        :focused-index="focusedIndex"
        :next-page-token="nextPageToken"
        :loading-more="loadingMore"
        :playlist="playlistSummary"
        :channel="channelSummary"
        :search-source="searchSource"
        :skipped-unavailable="skippedUnavailable"
        :skipped-missing-duration="skippedMissingDuration"
        :selected-count="selectedCount"
        :all-importable-selected="allImportableSelected"
        :importable-count="importableCount"
        :playlist-mode="playlistMode"
        :fill="embedded"
        @search="onPlaceholderSearch"
        @select="onSelect"
        @toggle-select-all="toggleSelectAll"
        @load-more="loadMore"
      />
    </div>
  </div>
</template>
