import { execFile } from 'node:child_process'
import { copyFile, mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { ffmpegTimeoutMs } from './ffmpeg-split.ts'
import { currentAudioBitrate } from './save-audio-settings.ts'
import { AUDIO_ONLY_OUTPUT_ARGS } from './ffmpeg-audio-only.ts'

const execFileAsync = promisify(execFile)
const AAC_SAMPLE_RATE = '44100'
const PREVIEW_M4A_COPY_EXTS = new Set(['.m4a', '.aac', '.mp4'])

/** Preview files already in an M4A/AAC container can be copied into the save cache. */
export function canCopyPreviewAsM4a(filename: string): boolean {
  return PREVIEW_M4A_COPY_EXTS.has(path.extname(filename).toLowerCase())
}

/** Match yt-dlp `-x --audio-format m4a` (AAC in an M4A container) without another YouTube hit. */
export function previewToSaveM4aArgs(
  sourcePath: string,
  destPath: string,
  bitrate: string = currentAudioBitrate(),
): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-y',
    '-i', sourcePath,
    ...AUDIO_ONLY_OUTPUT_ARGS,
    '-c:a', 'aac',
    '-b:a', bitrate,
    '-ar', AAC_SAMPLE_RATE,
    '-ac', '2',
    destPath,
  ]
}

export async function materializeSaveM4aFromPreview(options: {
  previewPath: string
  destPath: string
  /**
   * When set, always re-encode at this bitrate. Copying a YouTube m4a keeps
   * the source bitrate, and those files can land over Yoto's 100 MB cap.
   */
  bitrate?: string
}): Promise<{ destPath: string, copied: boolean } | null> {
  const previewStat = await stat(options.previewPath).catch(() => null)
  if (!previewStat || previewStat.size <= 0) return null

  await mkdir(path.dirname(options.destPath), { recursive: true })
  const copied = !options.bitrate && canCopyPreviewAsM4a(options.previewPath)

  try {
    if (copied) {
      await copyFile(options.previewPath, options.destPath)
    }
    else {
      const { resolveFfmpegBinary } = await import('./system-deps')
      const ffmpeg = await resolveFfmpegBinary()
      if (!ffmpeg) return null
      await execFileAsync(
        ffmpeg,
        previewToSaveM4aArgs(options.previewPath, options.destPath, options.bitrate),
        { timeout: ffmpegTimeoutMs() },
      )
    }
    const destStat = await stat(options.destPath)
    if (destStat.size <= 0) {
      await rm(options.destPath, { force: true })
      return null
    }
    return { destPath: options.destPath, copied }
  }
  catch (err) {
    await rm(options.destPath, { force: true }).catch(() => {})
    console.warn(
      '[ffmpeg-m4a] preview remux failed:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
