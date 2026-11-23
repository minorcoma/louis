import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { soundcloudDownloadArgs } from '../../shared/myo-editor/soundcloudDownload.ts'

describe('soundcloudDownloadArgs', () => {
  it('downloads one SoundCloud track and rejects other hosts', () => {
    const args = soundcloudDownloadArgs(
      'https://soundcloud.com/forss/flickermood?si=1',
      '/tmp/soundcloud-293.%(ext)s',
      [],
    )
    assert.ok(args.includes('--no-playlist'))
    assert.ok(args.includes('--audio-format'))
    assert.equal(args.at(-1), 'https://soundcloud.com/forss/flickermood?si=1')
    assert.throws(
      () => soundcloudDownloadArgs('https://example.com/forss/flickermood', '/tmp/out.%(ext)s', []),
      /not allowed/,
    )
  })
})
