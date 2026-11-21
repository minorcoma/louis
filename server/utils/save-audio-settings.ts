import { AsyncLocalStorage } from 'node:async_hooks'
import { DEFAULT_AUDIO_BITRATE, normalizeAudioBitrate } from '../../shared/audioEncode.ts'
import {
  DEFAULT_SPLIT_TARGET_SECONDS,
  normalizeSplitTargetSeconds,
} from '../../shared/myo-editor/splitTarget.ts'
import { YOTO_MYO_SPLIT_TRACK_SECONDS } from '../../shared/myo-editor/yotoMyoLimits.ts'

type SaveAudioSettings = {
  bitrate: string
  splitTargetSeconds: number
}

const storage = new AsyncLocalStorage<SaveAudioSettings>()

/** Per-save encode and split settings. Shared client code must not import this module. */
export function withSaveAudioSettings<T>(
  input: { audioBitrate?: unknown, splitTargetSeconds?: unknown },
  fn: () => T,
): T {
  return storage.run({
    bitrate: normalizeAudioBitrate(input.audioBitrate),
    splitTargetSeconds: normalizeSplitTargetSeconds(
      input.splitTargetSeconds,
      YOTO_MYO_SPLIT_TRACK_SECONDS,
    ),
  }, fn)
}

export function currentAudioBitrate(): string {
  return storage.getStore()?.bitrate ?? DEFAULT_AUDIO_BITRATE
}

export function currentSplitTargetSeconds(): number {
  return storage.getStore()?.splitTargetSeconds ?? DEFAULT_SPLIT_TARGET_SECONDS
}
