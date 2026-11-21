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
import { classifyYoutubeSearchInput, youtubeSearchAction } from '#shared/myo-editor/youtubeUrl'
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
const { searchPlaceholders: preferredPlaceholders } = useUserPreferences()
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

provide(YOUTUBE_PICKER_RESULTS_KEY, results)

const { showAddedToPlaylist, showDuplicateTrack, showError } = useToast()
const { playEvent } = useUiSound()
const editor = inject(MYO_EDITOR_KEY, null)
const adding = ref(false)

const searchAction = computed(() =>
  youtubeSearchAction(query.value, Boolean(submittedQuery.value.trim())),
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

function commitVideos(
  videos: YoutubeVideoSummary[],
  options: { truncated: boolean, playlistTitle?: string },
) {
  if (!editor || videos.length === 0) return
  const tracks = videosToPlaylistTracks(videos)
  if (tracks.length === 0) {
    showError('Nothing in that link can be added.')
    return
  }

  if (!editor.isEditing.value && !editor.startNewPlaylist()) {
    showError('Could not start a new playlist. Try again.')
    return
  }

  if (!editor.canAcceptTracks.value) {
    editor.appendPendingCreateTracks(tracks)
    playEvent('buttonClick')
    const extra = options.truncated
      ? ' Yoto playlists hold 100 tracks, so the rest of this playlist was left out.'
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
      `Added ${result.added}. Yoto playlists hold 100 tracks, so the rest of this playlist was left out.`,
      8000,
    )
    return
  }
  if (outcome.kind === 'mixed' || outcome.kind === 'overflow') {
    showError(outcome.message, 0, outcome.title)
    return
  }
  if (outcome.kind === 'added') {
    showAddedToPlaylist(addedLabel(videos, result.added), destination)
    return
  }
  if (outcome.kind === 'duplicate') {
    showDuplicateTrack(videos[0]?.title ?? 'Track')
  }
}

async function onSearchSubmit() {
  if (adding.value || status.value === 'loading') return
  const intent = searchAction.value.kind
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
        :action="searchAction"
        @submit="onSearchSubmit"
        @clear="onClearSearch"
      />
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
