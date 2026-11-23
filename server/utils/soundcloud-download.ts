import { execFile } from 'node:child_process'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { createError, type H3Event } from 'h3'
import { soundcloudDownloadArgs } from '#shared/myo-editor/soundcloudDownload'
import { getCacheDir, resolveAudioWorkDirConfig } from './audio-work-dir'
import { resolveYtdlpBinary } from './ytdlp-binary'
import { resolveYtdlpCookiesArgs } from './ytdlp-cookies'

export { soundcloudDownloadArgs }

const execFileAsync = promisify(execFile)
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000

const inFlight = new Map<string, Promise<string>>()

function cacheName(soundcloudId: string): string {
  return `soundcloud-${soundcloudId}.m4a`
}

async function findProducedFile(dir: string, soundcloudId: string): Promise<string | null> {
  const names = await readdir(dir).catch(() => [])
  const prefix = `soundcloud-${soundcloudId}.`
  const match = names.find(name => name.startsWith(prefix) && !name.endsWith('.part'))
  return match ? path.join(dir, match) : null
}

export async function downloadSoundcloudAudio(
  soundcloudId: string,
  url: string,
  event?: H3Event,
): Promise<string> {
  if (!/^\d{1,20}$/.test(soundcloudId)) {
    throw new Error('That SoundCloud track is missing an id.')
  }
  const existing = inFlight.get(soundcloudId)
  if (existing) return existing

  const promise = downloadUncached(soundcloudId, url, event).finally(() => {
    if (inFlight.get(soundcloudId) === promise) inFlight.delete(soundcloudId)
  })
  inFlight.set(soundcloudId, promise)
  return promise
}

async function downloadUncached(soundcloudId: string, url: string, event?: H3Event): Promise<string> {
  const audioWorkDir = resolveAudioWorkDirConfig(event).audioWorkDir
  const cacheDir = getCacheDir(audioWorkDir, 'save')
  await mkdir(cacheDir, { recursive: true })
  const dest = path.join(cacheDir, cacheName(soundcloudId))
  const cached = await stat(dest).then(info => info.size > 1000).catch(() => false)
  if (cached) return dest

  const binary = await resolveYtdlpBinary(event)
  const cookies = await resolveYtdlpCookiesArgs(event)
  const scratch = path.join(cacheDir, `soundcloud-${soundcloudId}.%(ext)s`)
  const args = soundcloudDownloadArgs(url, scratch, cookies)
  try {
    await execFileAsync(binary.path, args, {
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    })
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'SoundCloud download failed.'
    throw createError({
      statusCode: 502,
      statusMessage: message.includes('yt-dlp') ? message : `Could not download that SoundCloud track. ${message}`.slice(0, 240),
    })
  }

  const produced = await findProducedFile(cacheDir, soundcloudId)
  if (!produced) {
    throw createError({ statusCode: 502, statusMessage: 'SoundCloud download did not produce an audio file.' })
  }
  if (produced !== dest) {
    await rename(produced, dest).catch(async () => {
      await rm(dest, { force: true })
      await rename(produced, dest)
    })
  }
  const info = await stat(dest)
  if (info.size < 1000) {
    await rm(dest, { force: true })
    throw createError({ statusCode: 502, statusMessage: 'SoundCloud download was empty.' })
  }
  return dest
}
