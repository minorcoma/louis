import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AUDIO_QUALITY_PRESETS,
  DEFAULT_AUDIO_BITRATE,
  normalizeAudioBitrate,
} from './audioEncode.ts'

describe('normalizeAudioBitrate', () => {
  it('defaults to 96 kbps', () => {
    assert.equal(DEFAULT_AUDIO_BITRATE, '96k')
    assert.equal(normalizeAudioBitrate(undefined), '96k')
    assert.equal(normalizeAudioBitrate(''), '96k')
    assert.equal(normalizeAudioBitrate('320k'), '96k')
  })

  it('accepts a preset id or bitrate', () => {
    assert.equal(normalizeAudioBitrate('High'), '192k')
    assert.equal(normalizeAudioBitrate('64K'), '64k')
    assert.equal(normalizeAudioBitrate('music'), '128k')
    assert.deepEqual(
      AUDIO_QUALITY_PRESETS.map(preset => preset.bitrate),
      ['64k', '96k', '128k', '192k'],
    )
  })
})
