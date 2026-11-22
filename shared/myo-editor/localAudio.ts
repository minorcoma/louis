import type { PlaylistTrack, TrackSplit } from './types.ts'
import { planTrackSplit, splitPartTitle } from './splitTrack.ts'
import { getSplitTargetSeconds } from './splitTarget.ts'
import { YOTO_MYO_SPLIT_TRACK_SECONDS } from './yotoMyoLimits.ts'

export const LOCAL_AUDIO_MAX_BYTES = 1024 * 1024 * 1024
const MIN_CHAPTER_SECONDS = 0.5
const TITLE_MAX = 80

export interface LocalAudioChapter {
  title: string
  startSeconds: number
  endSeconds: number
}

export interface LocalAudioUploadResult {
  uploadId: string
  filename: string
  ext: 'mp3' | 'm4b'
  durationSeconds: number
  chapters: LocalAudioChapter[]
  /** Set when an M4B had no readable chapter list. */
  chaptersWarning?: string
}

const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isLocalUploadId(value: string): boolean {
  return UPLOAD_ID.test(value.trim())
}

export function localAudioExtension(filename: string): 'mp3' | 'm4b' | null {
  const base = filename.trim().split(/[/\\]/).pop() ?? ''
  const match = base.match(/\.([a-z0-9]+)$/i)
  const ext = match?.[1]?.toLowerCase()
  if (ext === 'mp3' || ext === 'm4b') return ext
  return null
}

export function safeLocalFilename(raw: string): string {
  let decoded = raw.trim()
  try {
    decoded = decodeURIComponent(decoded)
  }
  catch {
    // Keep the raw header when it is not valid percent-encoding.
  }
  const base = decoded.split(/[/\\]/).pop()?.replace(/[\u0000-\u001f]/g, '').trim() || 'audio'
  return base.slice(0, 180)
}

/** True when the leading bytes match the extension the user chose. */
export function localAudioBytesMatch(ext: 'mp3' | 'm4b', bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false
  if (ext === 'm4b') {
    return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
  }
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true
  const limit = Math.min(bytes.length - 1, 32)
  for (let index = 0; index < limit; index++) {
    if (bytes[index] === 0xff && ((bytes[index + 1] ?? 0) & 0xe0) === 0xe0) return true
  }
  return false
}

export function localAudioTitleFromFilename(filename: string): string {
  const base = safeLocalFilename(filename).replace(/\.(mp3|m4b)$/i, '')
  const cleaned = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, TITLE_MAX) || 'Track'
}

export function isSupportedLocalAudioTrack(track: PlaylistTrack): boolean {
  if (!track || track.source !== 'local-file') return false
  const file = track.localFile
  if (!file || !isLocalUploadId(file.uploadId)) return false
  return Number.isFinite(file.startSeconds)
    && file.startSeconds >= 0
    && Number.isFinite(file.durationSeconds)
    && file.durationSeconds > 0
}

function cleanChapterTitle(title: string, index: number): string {
  const cleaned = title.replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim()
  return (cleaned || `Chapter ${index + 1}`).slice(0, TITLE_MAX)
}

/** Chapters ffprobe printed, in file order. Empty or broken JSON yields none. */
export function chaptersFromFfprobeJson(json: string): LocalAudioChapter[] {
  let data: unknown
  try {
    data = JSON.parse(json)
  }
  catch {
    return []
  }
  const chapters = data && typeof data === 'object' && 'chapters' in data
    ? (data as { chapters?: unknown }).chapters
    : null
  if (!Array.isArray(chapters)) return []

  const parsed: LocalAudioChapter[] = []
  for (const [index, chapter] of chapters.entries()) {
    if (!chapter || typeof chapter !== 'object') continue
    const record = chapter as {
      start_time?: unknown
      end_time?: unknown
      tags?: { title?: unknown }
    }
    const start = Number(record.start_time)
    const end = Number(record.end_time)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    const rawTitle = typeof record.tags?.title === 'string' ? record.tags.title : ''
    parsed.push({
      title: cleanChapterTitle(rawTitle, index),
      startSeconds: start,
      endSeconds: end,
    })
  }
  return parsed.sort((a, b) => a.startSeconds - b.startSeconds)
}

function usableChapters(
  chapters: LocalAudioChapter[],
  durationSeconds: number,
): LocalAudioChapter[] {
  const usable: LocalAudioChapter[] = []
  for (const [index, chapter] of chapters.entries()) {
    const start = Math.max(0, Math.min(chapter.startSeconds, durationSeconds))
    const end = Math.max(start, Math.min(chapter.endSeconds, durationSeconds))
    if (end - start < MIN_CHAPTER_SECONDS) continue
    usable.push({
      title: cleanChapterTitle(chapter.title, usable.length || index),
      startSeconds: start,
      endSeconds: end,
    })
  }
  return usable
}

function localRow(input: {
  uploadId: string
  filename: string
  id: string
  title: string
  subtitle: string
  startSeconds: number
  durationSeconds: number
  split?: TrackSplit
}): PlaylistTrack {
  return {
    id: input.id,
    title: input.title,
    subtitle: input.subtitle,
    thumbnailUrl: '',
    source: 'local-file',
    duration: input.durationSeconds,
    localFile: {
      uploadId: input.uploadId,
      filename: input.filename,
      startSeconds: input.startSeconds,
      durationSeconds: input.durationSeconds,
    },
    ...(input.split ? { split: input.split } : {}),
  }
}

function timeSplitTracks(input: {
  uploadId: string
  filename: string
  title: string
  subtitle: string
  idPrefix: string
  groupId: string
  offsetSeconds: number
  durationSeconds: number
  sourceDurationSeconds: number
  splitTargetSeconds: number
}): PlaylistTrack[] {
  const plan = planTrackSplit(input.durationSeconds, input.splitTargetSeconds)
  if (!plan) {
    return [localRow({
      uploadId: input.uploadId,
      filename: input.filename,
      id: input.idPrefix,
      title: input.title,
      subtitle: input.subtitle,
      startSeconds: input.offsetSeconds,
      durationSeconds: input.durationSeconds,
    })]
  }

  return plan.parts.map((part, index) => localRow({
    uploadId: input.uploadId,
    filename: input.filename,
    id: `${input.idPrefix}:p${index}`,
    title: splitPartTitle(input.title, index),
    subtitle: input.subtitle,
    startSeconds: input.offsetSeconds + part.start,
    durationSeconds: part.duration,
    split: {
      groupId: input.groupId,
      index,
      count: plan.count,
      startSeconds: input.offsetSeconds + part.start,
      durationSeconds: part.duration,
      sourceDurationSeconds: input.sourceDurationSeconds,
    },
  }))
}

/**
 * One playlist row per MP3, or one row per M4B chapter.
 * A file (or a single chapter) longer than Yoto's cap is cut into even parts.
 * Chapter lists shorter than two chapters are treated as one file.
 */
export function planLocalAudioTracks(input: {
  uploadId: string
  filename: string
  ext: 'mp3' | 'm4b'
  durationSeconds: number
  chapters?: LocalAudioChapter[]
  splitTargetSeconds?: number
}): PlaylistTrack[] {
  const durationSeconds = input.durationSeconds
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return []
  const uploadId = input.uploadId.trim()
  if (!isLocalUploadId(uploadId)) return []
  const splitTargetSeconds = input.splitTargetSeconds ?? getSplitTargetSeconds()
  const bookTitle = localAudioTitleFromFilename(input.filename)
  const chapters = input.ext === 'm4b'
    ? usableChapters(input.chapters ?? [], durationSeconds)
    : []

  if (chapters.length < 2) {
    return timeSplitTracks({
      uploadId,
      filename: input.filename,
      title: bookTitle,
      subtitle: input.ext === 'm4b' ? 'M4B' : 'MP3',
      idPrefix: `local:${uploadId}`,
      groupId: `local:${uploadId}`,
      offsetSeconds: 0,
      durationSeconds,
      sourceDurationSeconds: durationSeconds,
      splitTargetSeconds,
    })
  }

  const tracks: PlaylistTrack[] = []
  for (const [chapterIndex, chapter] of chapters.entries()) {
    const length = chapter.endSeconds - chapter.startSeconds
    const prefix = `local:${uploadId}:c${chapterIndex}`
    if (length <= YOTO_MYO_SPLIT_TRACK_SECONDS) {
      tracks.push(localRow({
        uploadId,
        filename: input.filename,
        id: prefix,
        title: chapter.title,
        subtitle: bookTitle,
        startSeconds: chapter.startSeconds,
        durationSeconds: length,
      }))
      continue
    }
    tracks.push(...timeSplitTracks({
      uploadId,
      filename: input.filename,
      title: chapter.title,
      subtitle: bookTitle,
      idPrefix: prefix,
      groupId: prefix,
      offsetSeconds: chapter.startSeconds,
      durationSeconds: length,
      sourceDurationSeconds: length,
      splitTargetSeconds,
    }))
  }
  return tracks
}
