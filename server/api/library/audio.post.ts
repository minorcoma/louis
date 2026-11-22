import { createWriteStream } from 'node:fs'
import { mkdir, open, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { probeAudioDurationSeconds } from '../../utils/ffmpeg-split'
import { readM4bChapters } from '../../utils/m4b-chapters'
import {
  localLibraryDir,
  localUploadFilePath,
  sweepOldLocalUploads,
  writeStoredLocalAudio,
} from '../../utils/local-audio-store'
import { resolveAudioWorkDirConfig } from '../../utils/audio-work-dir'
import {
  LOCAL_AUDIO_MAX_BYTES,
  localAudioBytesMatch,
  localAudioExtension,
  safeLocalFilename,
  type LocalAudioUploadResult,
} from '#shared/myo-editor/localAudio'

class ByteCap extends Transform {
  total = 0

  constructor(private max: number) {
    super()
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ) {
    this.total += chunk.length
    if (this.total > this.max) {
      callback(new Error('LOCAL_AUDIO_TOO_LARGE'))
      return
    }
    callback(null, chunk)
  }
}

async function sniff(filePath: string): Promise<Uint8Array> {
  const handle = await open(filePath, 'r')
  try {
    const bytes = Buffer.alloc(32)
    await handle.read(bytes, 0, bytes.length, 0)
    return bytes
  }
  finally {
    await handle.close()
  }
}

export default defineEventHandler(async (event): Promise<LocalAudioUploadResult> => {
  const filename = safeLocalFilename(getHeader(event, 'x-filename') || '')
  const ext = localAudioExtension(filename)
  if (!ext) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Choose an MP3 or M4B file.',
    })
  }

  const declared = Number(getHeader(event, 'content-length') || 0)
  if (Number.isFinite(declared) && declared > LOCAL_AUDIO_MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'That file is over 1 GB.',
    })
  }

  const config = resolveAudioWorkDirConfig(event)
  const uploadId = randomUUID()
  const dest = localUploadFilePath(config.audioWorkDir, uploadId, ext)
  await mkdir(localLibraryDir(config.audioWorkDir), { recursive: true })
  await sweepOldLocalUploads(config.audioWorkDir, config.audioCacheMaxAgeMs).catch(() => undefined)

  const cap = new ByteCap(LOCAL_AUDIO_MAX_BYTES)
  try {
    await pipeline(event.node.req, cap, createWriteStream(dest))
  }
  catch (err) {
    await rm(dest, { force: true })
    if (err instanceof Error && err.message === 'LOCAL_AUDIO_TOO_LARGE') {
      throw createError({ statusCode: 413, statusMessage: 'That file is over 1 GB.' })
    }
    throw createError({ statusCode: 400, statusMessage: 'Could not read that file.' })
  }

  if (cap.total < 1024) {
    await rm(dest, { force: true })
    throw createError({ statusCode: 400, statusMessage: 'That file is empty.' })
  }

  const bytes = await sniff(dest)
  if (!localAudioBytesMatch(ext, bytes)) {
    await rm(dest, { force: true })
    throw createError({
      statusCode: 400,
      statusMessage: ext === 'm4b'
        ? 'That file does not look like an M4B.'
        : 'That file does not look like an MP3.',
    })
  }

  const durationSeconds = await probeAudioDurationSeconds(dest)
  if (!durationSeconds) {
    await rm(dest, { force: true })
    throw createError({
      statusCode: 400,
      statusMessage: 'Could not read the length of that file.',
    })
  }

  let chapters: LocalAudioUploadResult['chapters'] = []
  let chaptersWarning: string | undefined
  if (ext === 'm4b') {
    const probed = await readM4bChapters(dest)
    chapters = probed.chapters
    if (!probed.readable) {
      chaptersWarning = 'Could not read chapters in this M4B, so it was added as one track.'
    }
    else if (chapters.length < 2) {
      chaptersWarning = 'This M4B has no chapter list, so it was added as one track.'
    }
  }

  await writeStoredLocalAudio(config.audioWorkDir, {
    uploadId,
    filename,
    ext,
    durationSeconds,
  })

  return {
    uploadId,
    filename,
    ext,
    durationSeconds,
    chapters,
    ...(chaptersWarning ? { chaptersWarning } : {}),
  }
})
