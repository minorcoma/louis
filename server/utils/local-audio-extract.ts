import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { PlaylistTrack, SaveTrackStatus, TranscodedAudioResult } from '#shared/myo-editor/types'
import { probeAudioDurationSeconds, splitAudioFile } from './ffmpeg-split'
import { loudnormAudioFile } from './ffmpeg-loudnorm'
import { pollPutAudioTranscode, putAudioForTranscode } from './yoto-media'
import { readStoredLocalAudio } from './local-audio-store'

function uploadName(title: string, playlistIndex: number): string {
  const safe = title.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
  return `${safe || `track-${playlistIndex + 1}`}.m4a`
}

export async function uploadLocalPlaylistTrack(options: {
  accessToken: string
  audioWorkDir: string
  jobId: string
  playlistIndex: number
  track: PlaylistTrack
  normalizeVolume: boolean
  onStatus?: (status: SaveTrackStatus) => void
}): Promise<TranscodedAudioResult> {
  const file = options.track.localFile
  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: `"${options.track.title}" is missing its file. Add the MP3 or M4B again.`,
    })
  }

  const stored = await readStoredLocalAudio(options.audioWorkDir, file.uploadId)
  if (!stored) {
    throw createError({
      statusCode: 400,
      statusMessage: `"${options.track.title}" is no longer on this Louis server. Add the file again.`,
    })
  }

  const probed = await probeAudioDurationSeconds(stored.filePath)
  const start = Math.max(0, file.startSeconds)
  let duration = file.durationSeconds
  if (probed && start >= probed) {
    throw createError({
      statusCode: 500,
      statusMessage: `Could not cut "${options.track.title}".`,
    })
  }
  if (probed && start + duration > probed + 0.25) {
    duration = Math.max(0.5, probed - start)
  }

  const splitDir = path.join(options.audioWorkDir, 'jobs', options.jobId, 'local', file.uploadId)
  await mkdir(splitDir, { recursive: true })
  const destPath = path.join(splitDir, `${options.playlistIndex}.m4a`)
  options.onStatus?.('extracting')
  const cut = await splitAudioFile({
    sourcePath: stored.filePath,
    destPath,
    startSeconds: start,
    durationSeconds: duration,
    codec: 'aac',
  })
  if (!cut) {
    throw createError({
      statusCode: 500,
      statusMessage: `Could not prepare "${options.track.title}" for Yoto.`,
    })
  }

  let uploadPath = destPath
  if (options.normalizeVolume) {
    options.onStatus?.('leveling')
    const leveledPath = path.join(splitDir, `${options.playlistIndex}-leveled.m4a`)
    const leveled = await loudnormAudioFile(destPath, leveledPath, duration)
    if (leveled) uploadPath = leveled
  }

  const filename = uploadName(options.track.title, options.playlistIndex)
  options.onStatus?.('uploading')
  const put = await putAudioForTranscode(options.accessToken, uploadPath, filename, {
    meta: {
      jobId: options.jobId,
      durationSeconds: duration,
      partLabel: options.track.title,
    },
  })
  options.onStatus?.('transcoding')
  return pollPutAudioTranscode(options.accessToken, put, {
    meta: {
      jobId: options.jobId,
      durationSeconds: duration,
      partLabel: options.track.title,
    },
  })
}
