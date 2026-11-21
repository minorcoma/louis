/** HTMLMediaElement.HAVE_METADATA — kept numeric so this file has no DOM lib. */
const HAVE_METADATA = 1

export type RewindableAudio = {
  readyState: number
  currentTime: number
}

/**
 * Rewind a clip that has already loaded metadata.
 * Setting currentTime before HAVE_METADATA throws InvalidStateError on iOS
 * WebKit and no-ops or queues on desktop. Callers that are about to play()
 * should skip the seek until the element can actually seek.
 */
export function rewindLoadedAudio(audio: RewindableAudio): void {
  if (audio.readyState < HAVE_METADATA) return
  if (!Number.isFinite(audio.currentTime) || audio.currentTime === 0) return
  try {
    audio.currentTime = 0
  }
  catch {
    // Not seekable yet (WebKit InvalidStateError).
  }
}
