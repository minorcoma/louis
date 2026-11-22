import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isLocalUploadId, type LocalAudioUploadResult } from '#shared/myo-editor/localAudio'

export interface StoredLocalAudio {
  uploadId: string
  filename: string
  ext: 'mp3' | 'm4b'
  durationSeconds: number
  filePath: string
}

export function localLibraryDir(audioWorkDir: string): string {
  return path.join(audioWorkDir, 'library')
}

export function localUploadFilePath(
  audioWorkDir: string,
  uploadId: string,
  ext: 'mp3' | 'm4b',
): string {
  return path.join(localLibraryDir(audioWorkDir), `${uploadId}.${ext}`)
}

function metaPath(audioWorkDir: string, uploadId: string): string {
  return path.join(localLibraryDir(audioWorkDir), `${uploadId}.json`)
}

export async function writeStoredLocalAudio(
  audioWorkDir: string,
  meta: Omit<StoredLocalAudio, 'filePath'>,
): Promise<void> {
  await mkdir(localLibraryDir(audioWorkDir), { recursive: true })
  await writeFile(metaPath(audioWorkDir, meta.uploadId), JSON.stringify({
    uploadId: meta.uploadId,
    filename: meta.filename,
    ext: meta.ext,
    durationSeconds: meta.durationSeconds,
  }))
}

export async function readStoredLocalAudio(
  audioWorkDir: string,
  uploadId: string,
): Promise<StoredLocalAudio | null> {
  if (!isLocalUploadId(uploadId)) return null
  try {
    const raw = await readFile(metaPath(audioWorkDir, uploadId), 'utf8')
    const parsed = JSON.parse(raw) as Partial<LocalAudioUploadResult>
    if (parsed.ext !== 'mp3' && parsed.ext !== 'm4b') return null
    if (parsed.uploadId !== uploadId) return null
    const filePath = localUploadFilePath(audioWorkDir, uploadId, parsed.ext)
    await stat(filePath)
    return {
      uploadId,
      filename: typeof parsed.filename === 'string' && parsed.filename.trim()
        ? parsed.filename
        : `${uploadId}.${parsed.ext}`,
      ext: parsed.ext,
      durationSeconds: typeof parsed.durationSeconds === 'number' ? parsed.durationSeconds : 0,
      filePath,
    }
  }
  catch {
    return null
  }
}

/** Drop library files older than the audio cache so a forgotten audiobook does not sit forever. */
export async function sweepOldLocalUploads(audioWorkDir: string, maxAgeMs: number): Promise<void> {
  const dir = localLibraryDir(audioWorkDir)
  let entries: string[]
  try {
    entries = await readdir(dir)
  }
  catch {
    return
  }
  const cutoff = Date.now() - maxAgeMs
  await Promise.all(entries.map(async (name) => {
    const full = path.join(dir, name)
    try {
      const info = await stat(full)
      if (info.mtimeMs < cutoff) await rm(full, { force: true })
    }
    catch {
      // A file that disappears mid-sweep is already gone.
    }
  }))
}
