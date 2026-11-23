export type TrackSource =
  | 'app-youtube'
  | 'youtube-url'
  | 'soundcloud'
  | 'local-file'
  | 'yoto-upload'
  | 'stream'
  | 'unknown'

/** A SoundCloud track Louis downloads on save. */
export interface SoundcloudAudio {
  id: string
  url: string
}

/** A file uploaded to this Louis server, and the slice this row plays. */
export interface LocalAudioFile {
  uploadId: string
  filename: string
  startSeconds: number
  durationSeconds: number
}

export interface YotoTrackPayload {
  key: string
  title: string
  trackUrl: string
  type: 'audio' | 'stream'
  format: string
  duration: number
  fileSize: number
  overlayLabel: string
  channels?: 'stereo' | 'mono'
  display?: { icon16x16: string | null }
  uid?: string
}

/** Snapshot of Yoto track fields needed to reuse without re-upload. */
export type YotoTrackReuseSnapshot = Omit<YotoTrackPayload, 'key' | 'title' | 'overlayLabel'>

export interface YotoTrackDetail extends YotoTrackPayload {
  chapterKey: string
  trackKey: string
  /** Parent chapter icon when flattened from card detail */
  chapterDisplay?: { icon16x16: string | null }
}

export interface YotoChapterDetail {
  key: string
  title: string
  display?: { icon16x16: string | null }
  tracks: YotoTrackDetail[]
}

export interface YotoCardCover {
  imageL?: string | null
}

/** Metadata returned from Yoto content API — preserved on save to avoid clearing cover, etc. */
export interface YotoCardMetadata {
  title?: string
  description?: string
  author?: string
  cover?: YotoCardCover
  category?: string
  note?: string
  feedUrl?: string
  media?: {
    duration?: number
    fileSize?: number
    readableFileSize?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface YotoCardDetail {
  cardId: string
  title: string
  contentVersion: string | null
  metadataNote: string | null
  feedUrl: string | null
  metadata: YotoCardMetadata | null
  chapters: YotoChapterDetail[]
}

/** One slice of a YouTube source that exceeds the per-track duration cap. */
export interface TrackSplit {
  groupId: string
  /** 0-based part index. */
  index: number
  count: number
  /** Absolute start in the YouTube file (keep-region already applied). */
  startSeconds: number
  durationSeconds: number
  /** Full YouTube file length; keep-region is `trim` on the same row. */
  sourceDurationSeconds?: number
}

export interface PlaylistTrack {
  id: string
  title: string
  subtitle: string
  thumbnailUrl: string
  source: TrackSource
  youtubeId?: string
  chapterKey?: string
  trackKey?: string
  duration?: number
  /** Parent chapter icon from the loaded card (preserved on save). */
  chapterDisplay?: { icon16x16: string | null }
  /** Cached Yoto fields for reuse on save (avoids ambiguous lookups). */
  yotoReuse?: YotoTrackReuseSnapshot
  /** HTTPS preview for the track's 16×16 icon (playlist thumb); not sent to Yoto. */
  iconPreviewUrl?: string | null
  /** Present when this row is one part of an auto-split YouTube source. */
  split?: TrackSplit
  /** Front/back keep-region, relative to the full YouTube source. */
  trim?: {
    startSeconds: number
    endSeconds: number
  }
  /** Present when this row was added from an MP3 or M4B on this server. */
  localFile?: LocalAudioFile
  /** Present when this row was added from a SoundCloud link. */
  soundcloud?: SoundcloudAudio
}

export interface ProvenanceTrackEntry {
  chapterKey: string
  trackKey: string
  youtubeId: string
  title: string
  split?: TrackSplit
}

export interface YotoCardsManifest {
  version: number
  tracks: ProvenanceTrackEntry[]
}

export const YOTO_CARDS_CONTENT_VERSION = 'yoto-cards:1'

export interface TranscodedAudioResult {
  transcodedSha256: string
  transcodedInfo: {
    duration?: number
    fileSize?: number
    channels?: number | string
    format?: string
    metadata?: { title?: string }
  }
}

export type SaveTrackAction =
  | { kind: 'extract-youtube'; youtubeId: string; playlistIndex: number; split?: TrackSplit }
  | { kind: 'extract-soundcloud'; soundcloudId: string; url: string; playlistIndex: number; split?: TrackSplit }
  | { kind: 'extract-local'; uploadId: string; playlistIndex: number }
  | { kind: 'reuse-yoto'; snapshot: YotoTrackReuseSnapshot; playlistIndex: number }
  | { kind: 'passthrough-stream'; snapshot: YotoTrackReuseSnapshot; playlistIndex: number }
  | { kind: 'unsupported'; reason: string; playlistIndex: number }

export interface SavePlan {
  tracks: SaveTrackAction[]
  errors: string[]
}

export type SaveJobPhase =
  | 'planning'
  | 'downloading'
  | 'uploading'
  | 'posting'
  | 'complete'
  | 'failed'

export type SaveTrackStatus =
  | 'pending'
  | 'extracting'
  | 'leveling'
  | 'uploading'
  | 'transcoding'
  | 'ready'
  | 'skipped'
  | 'failed'

export interface SaveJobTrackProgress {
  playlistIndex: number
  title: string
  status: SaveTrackStatus
  error?: string
}

/** The YouTube source that stopped a save, so the client can offer Retry / Remove. */
export interface SaveJobFailedSource {
  youtubeId: string
  /** Title of the source as shown in the playlist (first part when split). */
  title: string
  /** Every playlist row that comes from this source (all split parts). */
  playlistIndexes: number[]
  /** Which step failed: the YouTube download, or cutting/uploading/transcoding it. */
  stage: 'download' | 'process'
  /** Underlying error without the title prefix. */
  error: string
}

export interface SaveJobState {
  id: string
  operation?: 'create' | 'update'
  /** Present for updates, and for creates once Yoto returns an id. */
  cardId?: string
  status: SaveJobPhase
  /** Monotonic 0–100 progress for the entire save job. */
  progress: number
  /** 0–100 progress for the current step (per-track download/upload/transcode). */
  operationProgress: number
  error?: string
  outcomeUncertain?: boolean
  /** Set when one YouTube source failed to download or process. */
  failedSource?: SaveJobFailedSource
  tracks: SaveJobTrackProgress[]
  createdAt: number
  /** Last time this job was written (heartbeat while Yoto transcode polls). */
  updatedAt?: number
}
