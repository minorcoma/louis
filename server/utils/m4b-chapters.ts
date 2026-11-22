import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chaptersFromFfprobeJson, type LocalAudioChapter } from '#shared/myo-editor/localAudio'

const execFileAsync = promisify(execFile)

async function resolveFfprobeBinary(): Promise<string | null> {
  const { resolveFfmpegBinary } = await import('./system-deps')
  const ffmpeg = await resolveFfmpegBinary()
  const candidates: string[] = []
  if (ffmpeg && path.isAbsolute(ffmpeg)) {
    const sibling = path.join(
      path.dirname(ffmpeg),
      process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
    )
    candidates.push(sibling)
  }
  candidates.push(process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')

  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) return candidate
    try {
      await access(candidate, constants.X_OK)
      return candidate
    }
    catch {
      // Try the next candidate.
    }
  }
  return null
}

export async function readM4bChapters(filePath: string): Promise<{
  chapters: LocalAudioChapter[]
  readable: boolean
}> {
  const ffprobe = await resolveFfprobeBinary()
  if (!ffprobe) return { chapters: [], readable: false }
  try {
    const result = await execFileAsync(
      ffprobe,
      ['-v', 'error', '-print_format', 'json', '-show_chapters', filePath],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' },
    )
    return { chapters: chaptersFromFfprobeJson(String(result.stdout || '')), readable: true }
  }
  catch (err) {
    console.warn(
      '[m4b] chapter probe failed:',
      err instanceof Error ? err.message : err,
    )
    return { chapters: [], readable: false }
  }
}
