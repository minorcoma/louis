import type { InjectionKey, Ref } from 'vue'
import type { PickerStatus, YoutubeSearchResponse, YoutubeVideo, YoutubeVideoSummary } from './types'
import {
  importableResultKeys,
  isListableYoutubeSearchResult,
  listableYoutubeSearchResults,
  mapPlaylistImportItems,
  videoResultKey,
  type YoutubePlaylistImportResponse,
  type YoutubePlaylistSummary,
} from '#shared/myo-editor/youtubePlaylistImport'
import {
  classifyYoutubeSearchInput,
  type YoutubeChannelSummary,
} from '#shared/myo-editor/youtubeUrl'
import { videosToPlaylistTracks } from '~/components/playlist/types'
import { YOTO_MYO_MAX_TRACKS } from '#shared/myo-editor/yotoMyoLimits'
import {
  interleaveResults,
  type SearchSource,
  type SoundcloudSearchItem,
} from '#shared/myo-editor/soundcloudSearch'

const MIN_SEARCH_LOADING_MS = 2000

export type YoutubePickerSource = 'text' | 'playlist' | 'video' | 'channel'

export const YOUTUBE_PICKER_RESULTS_KEY: InjectionKey<Ref<YoutubeVideoSummary[]>>
  = Symbol('youtubePickerResults')
export const YOUTUBE_PICKER_RESULTS_STATE = 'youtube-picker-results'

export function useYoutubePicker(maxResults = 12) {
  const { playEvent } = useUiSound()
  const {
    selectedCount,
    selectedKeySet,
    setSelectedKeys,
    addSelectedKeys,
    clear: clearResultSelection,
  } = useYoutubeResultSelection()

  const query = ref('')
  const submittedQuery = ref('')
  const results = useState<YoutubeVideoSummary[]>(YOUTUBE_PICKER_RESULTS_STATE, () => [])
  const focusedIndex = ref(-1)
  const status = ref<PickerStatus>('idle')
  const errorMessage = ref('')
  const nextPageToken = ref<string | undefined>()
  const loadingMore = ref(false)
  const playlistSummary = ref<YoutubePlaylistSummary | null>(null)
  const activePlaylistId = ref<string | null>(null)
  const skippedUnavailable = ref(0)
  const skippedMissingDuration = ref(0)
  const channelSummary = ref<YoutubeChannelSummary | null>(null)
  const activeChannelId = ref<string | null>(null)
  const searchSource = ref<YoutubePickerSource>('text')
  const { searchSources } = useUserPreferences()
  /** Per-source cursors for typed search; nextPageToken is just "more exists". */
  let youtubeNextToken: string | undefined
  let soundcloudNextPage: number | undefined
  let lastSourcesKey = ''

  const videoCache = new Map<string, YoutubeVideo>()

  let searchGeneration = 0

  async function ensureMinLoadingTime(startedAt: number) {
    const remaining = MIN_SEARCH_LOADING_MS - (Date.now() - startedAt)
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining))
    }
  }

  function fetchErrorMessage(err: unknown, fallback: string): string {
    const fetchErr = err as {
      statusMessage?: string
      data?: string | { message?: string, statusMessage?: string }
      message?: string
    }
    const data = fetchErr.data
    const fromData = typeof data === 'string'
      ? data
      : data?.message || data?.statusMessage
    const candidate = fromData
      ?? fetchErr.statusMessage
      ?? fetchErr.message
      ?? fallback
    const generic = /^(Not Found|Bad Request|Unauthorized|Forbidden|Internal Server Error)$/i
    if (generic.test(candidate.trim())) return fallback
    return candidate
  }

  function resetPlaylistState() {
    playlistSummary.value = null
    activePlaylistId.value = null
    skippedUnavailable.value = 0
    skippedMissingDuration.value = 0
  }

  function resetChannelState() {
    channelSummary.value = null
    activeChannelId.value = null
  }

  function resetPasteState() {
    resetPlaylistState()
    resetChannelState()
    searchSource.value = 'text'
  }

  function resetSearch() {
    searchGeneration += 1
    query.value = ''
    submittedQuery.value = ''
    results.value = []
    focusedIndex.value = -1
    status.value = 'idle'
    errorMessage.value = ''
    nextPageToken.value = undefined
    loadingMore.value = false
    resetPasteState()
    clearResultSelection()
  }

  function precheckImportable(videos: YoutubeVideoSummary[], replace: boolean) {
    const keys = importableResultKeys(videos)
    if (replace) setSelectedKeys(keys)
    else addSelectedKeys(keys)
  }

  async function fetchPlaylistPage(playlistId: string, pageToken?: string) {
    return await $fetch<YoutubePlaylistImportResponse>('/api/youtube/playlist', {
      query: { playlistId, pageToken },
    })
  }

  async function loadPlaylist(playlistId: string, q: string) {
    searchGeneration += 1
    const generation = searchGeneration
    const loadingStartedAt = Date.now()
    submittedQuery.value = q
    status.value = 'loading'
    errorMessage.value = ''
    focusedIndex.value = -1
    results.value = []
    nextPageToken.value = undefined
    playlistSummary.value = null
    activePlaylistId.value = playlistId
    skippedUnavailable.value = 0
    skippedMissingDuration.value = 0
    resetChannelState()
    searchSource.value = 'playlist'
    clearResultSelection()
    playEvent('buttonClick')

    try {
      const data = await fetchPlaylistPage(playlistId)
      if (generation !== searchGeneration) return

      const mapped = mapPlaylistImportItems(data.items)
      playlistSummary.value = data.playlist ?? null
      results.value = mapped.videos
      skippedUnavailable.value = mapped.skippedUnavailable
      skippedMissingDuration.value = mapped.skippedMissingDuration
      nextPageToken.value = data.nextPageToken
      precheckImportable(mapped.videos, true)
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'idle'
    }
    catch (err: unknown) {
      if (generation !== searchGeneration) return
      errorMessage.value = fetchErrorMessage(err, 'Playlist not found or not public')
      results.value = []
      resetPasteState()
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'error'
    }
  }

  async function loadEntirePlaylist(playlistId: string, q: string): Promise<{
    videos: YoutubeVideoSummary[]
    title: string
    truncated: boolean
  } | null> {
    searchGeneration += 1
    const generation = searchGeneration
    const loadingStartedAt = Date.now()
    submittedQuery.value = q
    status.value = 'loading'
    errorMessage.value = ''
    focusedIndex.value = -1
    results.value = []
    nextPageToken.value = undefined
    playlistSummary.value = null
    activePlaylistId.value = playlistId
    skippedUnavailable.value = 0
    skippedMissingDuration.value = 0
    resetChannelState()
    searchSource.value = 'playlist'
    clearResultSelection()
    playEvent('buttonClick')

    const videos: YoutubeVideoSummary[] = []
    let pageToken: string | undefined
    let title = 'Playlist'
    try {
      for (let page = 0; page < 40; page++) {
        const data = await fetchPlaylistPage(playlistId, pageToken)
        if (generation !== searchGeneration) return null
        if (data.playlist?.title) title = data.playlist.title
        if (data.playlist) playlistSummary.value = data.playlist
        const mapped = mapPlaylistImportItems(data.items)
        skippedUnavailable.value += mapped.skippedUnavailable
        skippedMissingDuration.value += mapped.skippedMissingDuration
        videos.push(...mapped.videos)
        pageToken = data.nextPageToken
        if (!pageToken || videos.length >= YOTO_MYO_MAX_TRACKS) break
      }
      if (generation !== searchGeneration) return null

      const truncated = videos.length > YOTO_MYO_MAX_TRACKS || Boolean(pageToken)
      results.value = videos
      nextPageToken.value = pageToken
      precheckImportable(videos.slice(0, YOTO_MYO_MAX_TRACKS), true)
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return null
      status.value = 'idle'
      return {
        videos: videos.slice(0, YOTO_MYO_MAX_TRACKS),
        title,
        truncated,
      }
    }
    catch (err: unknown) {
      if (generation !== searchGeneration) return null
      errorMessage.value = fetchErrorMessage(err, 'Playlist not found or not public')
      results.value = []
      resetPasteState()
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return null
      status.value = 'error'
      return null
    }
  }

  async function loadMorePlaylist() {
    const playlistId = activePlaylistId.value
    const token = nextPageToken.value
    if (!playlistId || !token || loadingMore.value) return

    loadingMore.value = true
    try {
      const data = await fetchPlaylistPage(playlistId, token)
      const mapped = mapPlaylistImportItems(data.items)
      results.value = [...results.value, ...mapped.videos]
      skippedUnavailable.value += mapped.skippedUnavailable
      skippedMissingDuration.value += mapped.skippedMissingDuration
      nextPageToken.value = data.nextPageToken
      if (data.playlist) playlistSummary.value = data.playlist
      precheckImportable(mapped.videos, false)
      playEvent('loadMoreComplete')
    }
    catch (err: unknown) {
      errorMessage.value = fetchErrorMessage(err, 'Couldn\'t load more')
    }
    finally {
      loadingMore.value = false
    }
  }

  async function loadVideo(videoId: string, q: string) {
    searchGeneration += 1
    const generation = searchGeneration
    const loadingStartedAt = Date.now()
    submittedQuery.value = q
    status.value = 'loading'
    errorMessage.value = ''
    focusedIndex.value = -1
    results.value = []
    nextPageToken.value = undefined
    resetPasteState()
    searchSource.value = 'video'
    clearResultSelection()
    playEvent('buttonClick')

    try {
      const data = await $fetch<{ items: YoutubeVideo[] }>('/api/youtube/videos', {
        query: { ids: videoId },
      })
      if (generation !== searchGeneration) return

      const item = data.items[0]
      if (!item || !isListableYoutubeSearchResult(item)) {
        errorMessage.value = 'Video not found or not public'
        results.value = []
        resetPasteState()
        await ensureMinLoadingTime(loadingStartedAt)
        if (generation !== searchGeneration) return
        status.value = 'error'
        return
      }

      const summary: YoutubeVideoSummary = {
        id: item.id,
        title: item.title,
        channelTitle: item.channelTitle,
        thumbnailUrl: item.thumbnailUrl,
        publishedAt: item.publishedAt,
        duration: item.duration,
        durationSeconds: item.durationSeconds,
      }
      results.value = [summary]
      precheckImportable([summary], true)
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'idle'
    }
    catch (err: unknown) {
      if (generation !== searchGeneration) return
      errorMessage.value = fetchErrorMessage(err, 'Failed to load YouTube video')
      results.value = []
      resetPasteState()
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'error'
    }
  }

  async function fetchChannelPage(params: Record<string, string | undefined>) {
    const query: Record<string, string | number> = { maxResults }
    for (const [key, value] of Object.entries(params)) {
      if (value) query[key] = value
    }
    return await $fetch<{
      channel: YoutubeChannelSummary
      items: YoutubeVideoSummary[]
      nextPageToken?: string
    }>('/api/youtube/channel', { query })
  }

  async function loadChannel(
    ref: Extract<ReturnType<typeof classifyYoutubeSearchInput>, { kind: 'channel' }>,
    q: string,
  ) {
    searchGeneration += 1
    const generation = searchGeneration
    const loadingStartedAt = Date.now()
    submittedQuery.value = q
    status.value = 'loading'
    errorMessage.value = ''
    focusedIndex.value = -1
    results.value = []
    nextPageToken.value = undefined
    resetPlaylistState()
    channelSummary.value = null
    activeChannelId.value = null
    searchSource.value = 'channel'
    clearResultSelection()
    playEvent('buttonClick')

    try {
      const data = await fetchChannelPage({
        channelId: ref.channelId,
        handle: ref.handle,
        username: ref.username,
        custom: ref.custom,
      })
      if (generation !== searchGeneration) return

      const items = listableYoutubeSearchResults(data.items)
      channelSummary.value = data.channel
      activeChannelId.value = data.channel.id
      results.value = items
      nextPageToken.value = data.nextPageToken
      precheckImportable(items, true)
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'idle'
    }
    catch (err: unknown) {
      if (generation !== searchGeneration) return
      errorMessage.value = fetchErrorMessage(err, 'Failed to load YouTube channel')
      results.value = []
      resetPasteState()
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'error'
    }
  }

  async function loadMoreChannel() {
    const channelId = activeChannelId.value
    const token = nextPageToken.value
    if (!channelId || !token || loadingMore.value) return

    loadingMore.value = true
    try {
      const data = await fetchChannelPage({ channelId, pageToken: token })
      const items = listableYoutubeSearchResults(data.items)
      results.value = [...results.value, ...items]
      nextPageToken.value = data.nextPageToken
      if (data.channel) channelSummary.value = data.channel
      precheckImportable(items, false)
      playEvent('loadMoreComplete')
    }
    catch (err: unknown) {
      errorMessage.value = fetchErrorMessage(err, 'Couldn\'t load more')
    }
    finally {
      loadingMore.value = false
    }
  }

  async function search(pageToken?: string) {
    const q = pageToken
      ? submittedQuery.value.trim()
      : query.value.trim()

    if (!q) {
      resetSearch()
      return
    }

    if (!pageToken) {
      const intent = classifyYoutubeSearchInput(q)
      if (intent.kind === 'playlist') {
        await loadPlaylist(intent.playlistId, q)
        return
      }
      if (intent.kind === 'video') {
        await loadVideo(intent.videoId, q)
        return
      }
      if (intent.kind === 'channel') {
        await loadChannel(intent, q)
        return
      }
      resetPasteState()
    }

    const sources = [...searchSources.value]
    const sourcesKey = sources.join(',')

    if (pageToken) {
      loadingMore.value = true
      try {
        const page = await fetchTextPage(q, sources, {
          youtubeToken: youtubeNextToken,
          soundcloudPage: soundcloudNextPage,
          more: true,
        })
        results.value = [...results.value, ...page.items]
        playEvent('loadMoreComplete')
        if (page.error && page.items.length === 0) errorMessage.value = page.error
      }
      catch (err: unknown) {
        errorMessage.value = fetchErrorMessage(err, 'Couldn\'t load more')
      }
      finally {
        loadingMore.value = false
      }
      return
    }

    if (
      q === submittedQuery.value
      && sourcesKey === lastSourcesKey
      && status.value === 'idle'
      && results.value.length > 0
      && searchSource.value === 'text'
    ) {
      return
    }

    submittedQuery.value = q
    lastSourcesKey = sourcesKey
    searchGeneration += 1
    const generation = searchGeneration
    const loadingStartedAt = Date.now()
    status.value = 'loading'
    errorMessage.value = ''
    focusedIndex.value = -1
    results.value = []
    nextPageToken.value = undefined
    youtubeNextToken = undefined
    soundcloudNextPage = undefined
    clearResultSelection()

    try {
      const page = await fetchTextPage(q, sources, { more: false }, () => generation === searchGeneration)
      if (generation !== searchGeneration) return
      if (page.items.length === 0 && page.error) throw new Error(page.error)
      results.value = page.items
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'idle'
    }
    catch (err: unknown) {
      if (generation !== searchGeneration) return
      errorMessage.value = fetchErrorMessage(err, 'Search failed')
      results.value = []
      await ensureMinLoadingTime(loadingStartedAt)
      if (generation !== searchGeneration) return
      status.value = 'error'
    }
  }

  /**
   * One page of typed search from every checked source, interleaved. A source
   * that fails is skipped as long as another one returned rows.
   */
  async function fetchTextPage(
    q: string,
    sources: SearchSource[],
    cursor: { youtubeToken?: string, soundcloudPage?: number, more: boolean },
    stillCurrent: () => boolean = () => true,
  ): Promise<{ items: YoutubeVideoSummary[], error?: string }> {
    const wantYoutube = sources.includes('youtube') && (!cursor.more || Boolean(cursor.youtubeToken))
    const wantSoundcloud = sources.includes('soundcloud')
      && (!cursor.more || cursor.soundcloudPage !== undefined)

    const [youtube, soundcloud] = await Promise.allSettled([
      wantYoutube
        ? $fetch<YoutubeSearchResponse>('/api/youtube/search', {
            query: { q, maxResults, pageToken: cursor.more ? cursor.youtubeToken : undefined },
          })
        : Promise.resolve(null),
      wantSoundcloud
        ? $fetch<{ items: SoundcloudSearchItem[], nextPage?: number }>('/api/soundcloud/search', {
            query: { q, maxResults, page: cursor.more ? cursor.soundcloudPage : 0 },
          })
        : Promise.resolve(null),
    ])
    if (!stillCurrent()) return { items: [] }

    const lists: YoutubeVideoSummary[][] = []
    let error: string | undefined
    if (youtube.status === 'fulfilled') {
      if (youtube.value) {
        lists.push(listableYoutubeSearchResults(youtube.value.items))
        youtubeNextToken = youtube.value.nextPageToken
      }
      else if (cursor.more) {
        youtubeNextToken = undefined
      }
    }
    else {
      youtubeNextToken = undefined
      error = fetchErrorMessage(youtube.reason, 'YouTube search failed')
    }
    if (soundcloud.status === 'fulfilled') {
      if (soundcloud.value) {
        lists.push(soundcloud.value.items)
        soundcloudNextPage = soundcloud.value.nextPage
      }
    }
    else {
      soundcloudNextPage = undefined
      error ??= fetchErrorMessage(soundcloud.reason, 'SoundCloud search failed')
    }
    if (!sources.includes('youtube')) youtubeNextToken = undefined
    if (!sources.includes('soundcloud')) soundcloudNextPage = undefined
    nextPageToken.value = youtubeNextToken || soundcloudNextPage !== undefined ? 'more' : undefined
    return { items: interleaveResults(lists), error }
  }

  async function loadMore() {
    if (!nextPageToken.value || loadingMore.value) return
    if (activePlaylistId.value) {
      await loadMorePlaylist()
      return
    }
    if (activeChannelId.value) {
      await loadMoreChannel()
      return
    }
    await search(nextPageToken.value)
  }

  async function selectVideo(id: string) {
    const summary = results.value.find(v => v.id === id)
    if (!summary) return

    focusedIndex.value = results.value.findIndex(v => v.id === id)

    if (summary.soundcloud || videoCache.has(id)) return

    try {
      const data = await $fetch<{ items: YoutubeVideo[] }>('/api/youtube/videos', {
        query: { ids: id },
      })
      const enriched = data.items[0]
      if (enriched) {
        videoCache.set(id, enriched)
      }
    }
    catch {
      // Enrichment is optional for focus/selection
    }
  }

  function moveFocus(delta: number) {
    if (results.value.length === 0) return
    const next = focusedIndex.value + delta
    if (next < 0) {
      focusedIndex.value = results.value.length - 1
    }
    else if (next >= results.value.length) {
      focusedIndex.value = 0
    }
    else {
      focusedIndex.value = next
    }
  }

  const importableKeys = computed(() =>
    importableResultKeys(results.value),
  )

  const allImportableSelected = computed(() => {
    const keys = importableKeys.value
    return keys.length > 0 && keys.every(key => selectedKeySet.value.has(key))
  })

  function toggleSelectAll() {
    const keys = importableKeys.value
    if (keys.length === 0) return
    if (allImportableSelected.value) {
      clearResultSelection()
      playEvent('toggleOff')
      return
    }
    setSelectedKeys(keys)
    playEvent('toggleOn')
  }

  return {
    query,
    submittedQuery,
    results,
    focusedIndex,
    status,
    errorMessage,
    nextPageToken,
    loadingMore,
    playlistSummary,
    channelSummary,
    skippedUnavailable,
    skippedMissingDuration,
    selectedCount,
    allImportableSelected,
    importableCount: computed(() => importableKeys.value.length),
    playlistMode: computed(() => Boolean(activePlaylistId.value)),
    searchSource,
    toggleSelectAll,
    search,
    loadEntirePlaylist,
    resetSearch,
    loadMore,
    selectVideo,
    moveFocus,
  }
}

export function useSelectedResultTracks() {
  const results = useState<YoutubeVideoSummary[]>(YOUTUBE_PICKER_RESULTS_STATE, () => [])
  const { selectedKeySet } = useYoutubeResultSelection()
  return computed(() =>
    results.value
      .filter(video => selectedKeySet.value.has(videoResultKey(video)))
      .flatMap(videosToPlaylistTracks),
  )
}
