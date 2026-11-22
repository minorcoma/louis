import type { LocalAudioUploadResult } from '#shared/myo-editor/localAudio'

function messageFromBody(body: { statusMessage?: string, message?: string } | null, status: number): string {
  return body?.statusMessage
    || body?.message
    || (status === 413 ? 'That file is over 1 GB.' : 'Could not read that file.')
}

export async function uploadLocalAudio(file: File): Promise<LocalAudioUploadResult> {
  const response = await fetch('/api/library/audio', {
    method: 'POST',
    headers: {
      'content-type': file.type || 'application/octet-stream',
      'x-filename': encodeURIComponent(file.name),
    },
    body: file,
  })
  const body = await response.json().catch(() => null) as
    | (LocalAudioUploadResult & { statusMessage?: string, message?: string })
    | null
  if (!response.ok) {
    throw new Error(messageFromBody(body, response.status))
  }
  if (!body?.uploadId || !body.ext || !(body.durationSeconds > 0)) {
    throw new Error('Could not read that file.')
  }
  return body
}
