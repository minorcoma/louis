export const AUDIO_QUALITY_PRESETS = [
  { id: 'speech', label: 'Speech', bitrate: '64k' },
  { id: 'standard', label: 'Standard', bitrate: '96k' },
  { id: 'music', label: 'Music', bitrate: '128k' },
  { id: 'high', label: 'High', bitrate: '192k' },
] as const

export type AudioQualityId = typeof AUDIO_QUALITY_PRESETS[number]['id']
export type AudioBitrate = typeof AUDIO_QUALITY_PRESETS[number]['bitrate']

/** Stepped down from the old 192 kbps default so a chapter stays under Yoto's 100 MB cap. */
export const DEFAULT_AUDIO_BITRATE: AudioBitrate = '96k'

export function normalizeAudioBitrate(value: unknown): AudioBitrate {
  if (typeof value !== 'string') return DEFAULT_AUDIO_BITRATE
  const trimmed = value.trim().toLowerCase()
  const match = AUDIO_QUALITY_PRESETS.find(
    preset => preset.bitrate === trimmed || preset.id === trimmed,
  )
  return match?.bitrate ?? DEFAULT_AUDIO_BITRATE
}
