import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  chaptersFromFfprobeJson,
  isSupportedLocalAudioTrack,
  localAudioBytesMatch,
  localAudioExtension,
  localAudioTitleFromFilename,
  planLocalAudioTracks,
  safeLocalFilename,
} from './localAudio.ts'
import { YOTO_MYO_SPLIT_TRACK_SECONDS } from './yotoMyoLimits.ts'
import type { PlaylistTrack } from './types.ts'

const UPLOAD_ID = '11111111-1111-4111-8111-111111111111'

describe('local audio files', () => {
  it('accepts mp3 and m4b names and rejects other extensions', () => {
    assert.equal(localAudioExtension('Bedtime.mp3'), 'mp3')
    assert.equal(localAudioExtension('C:\\books\\Story.M4B'), 'm4b')
    assert.equal(localAudioExtension('notes.m4a'), null)
    assert.equal(localAudioExtension('track'), null)
  })

  it('keeps a filename and drops a directory prefix', () => {
    assert.equal(safeLocalFilename('folder/My%20Story.mp3'), 'My Story.mp3')
    assert.equal(localAudioTitleFromFilename('my_bedtime-story.mp3'), 'my bedtime story')
  })

  it('matches mp3 and m4b magic bytes', () => {
    assert.equal(localAudioBytesMatch('mp3', Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0])), true)
    assert.equal(localAudioBytesMatch('mp3', Uint8Array.from([0xff, 0xfb, 0x90, 0, 0, 0, 0, 0])), true)
    const m4b = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])
    assert.equal(localAudioBytesMatch('m4b', m4b), true)
    assert.equal(localAudioBytesMatch('mp3', m4b), false)
    assert.equal(localAudioBytesMatch('m4b', Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0])), false)
  })

  it('reads chapter titles and times from ffprobe JSON', () => {
    const chapters = chaptersFromFfprobeJson(JSON.stringify({
      chapters: [
        { start_time: '0.000', end_time: '12.5', tags: { title: 'Opening' } },
        { start_time: 12.5, end_time: 40, tags: { title: '  The woods  ' } },
        { start_time: '40', end_time: '40', tags: { title: 'Empty' } },
      ],
    }))
    assert.deepEqual(chapters, [
      { title: 'Opening', startSeconds: 0, endSeconds: 12.5 },
      { title: 'The woods', startSeconds: 12.5, endSeconds: 40 },
    ])
    assert.deepEqual(chaptersFromFfprobeJson('not json'), [])
  })

  it('keeps a short mp3 as one track', () => {
    const tracks = planLocalAudioTracks({
      uploadId: UPLOAD_ID,
      filename: 'lullaby.mp3',
      ext: 'mp3',
      durationSeconds: 8 * 60,
      splitTargetSeconds: 15 * 60,
    })
    assert.equal(tracks.length, 1)
    assert.equal(tracks[0]?.title, 'lullaby')
    assert.equal(tracks[0]?.source, 'local-file')
    assert.equal(tracks[0]?.localFile?.startSeconds, 0)
    assert.equal(tracks[0]?.localFile?.durationSeconds, 8 * 60)
    assert.equal(tracks[0]?.split, undefined)
    assert.equal(isSupportedLocalAudioTrack(tracks[0]!), true)
  })

  it('time-splits a long mp3 into even parts', () => {
    const duration = 40 * 60
    const tracks = planLocalAudioTracks({
      uploadId: UPLOAD_ID,
      filename: 'long-story.mp3',
      ext: 'mp3',
      durationSeconds: duration,
      splitTargetSeconds: 15 * 60,
    })
    assert.ok(tracks.length >= 2)
    assert.equal(tracks[0]?.split?.count, tracks.length)
    const covered = tracks.reduce((sum, track) => sum + (track.localFile?.durationSeconds ?? 0), 0)
    assert.equal(covered, duration)
    assert.ok(tracks.every(track => (track.localFile?.durationSeconds ?? 0) <= YOTO_MYO_SPLIT_TRACK_SECONDS))
  })

  it('splits an m4b into one track per chapter', () => {
    const tracks = planLocalAudioTracks({
      uploadId: UPLOAD_ID,
      filename: 'ocean_book.m4b',
      ext: 'm4b',
      durationSeconds: 100,
      splitTargetSeconds: 15 * 60,
      chapters: [
        { title: 'Tide', startSeconds: 0, endSeconds: 30 },
        { title: 'Harbor', startSeconds: 30, endSeconds: 70 },
        { title: 'Home', startSeconds: 70, endSeconds: 100 },
      ],
    })
    assert.deepEqual(tracks.map(track => track.title), ['Tide', 'Harbor', 'Home'])
    assert.ok(tracks.every(track => track.subtitle === 'ocean book' && !track.split))
    assert.equal(tracks[1]?.localFile?.startSeconds, 30)
    assert.equal(tracks[1]?.localFile?.durationSeconds, 40)
  })

  it('leaves a chapter under the cap whole and subdivides a longer one', () => {
    const tracks = planLocalAudioTracks({
      uploadId: UPLOAD_ID,
      filename: 'novel.m4b',
      ext: 'm4b',
      durationSeconds: 110 * 60,
      splitTargetSeconds: 15 * 60,
      chapters: [
        { title: 'Short', startSeconds: 0, endSeconds: 40 * 60 },
        { title: 'Long', startSeconds: 40 * 60, endSeconds: 110 * 60 },
      ],
    })
    assert.equal(tracks[0]?.title, 'Short')
    assert.equal(tracks[0]?.split, undefined)
    const longParts = tracks.slice(1)
    assert.ok(longParts.length >= 2)
    assert.ok(longParts.every(track => track.title.startsWith('Long')))
    assert.ok(longParts.every(track => (track.duration ?? 0) <= YOTO_MYO_SPLIT_TRACK_SECONDS))
    const covered = longParts.reduce((sum, track) => sum + (track.duration ?? 0), 0)
    assert.equal(covered, 70 * 60)
  })

  it('treats an m4b with one chapter as a single file', () => {
    const tracks = planLocalAudioTracks({
      uploadId: UPLOAD_ID,
      filename: 'single.m4b',
      ext: 'm4b',
      durationSeconds: 10 * 60,
      chapters: [{ title: 'Only', startSeconds: 0, endSeconds: 10 * 60 }],
    })
    assert.equal(tracks.length, 1)
    assert.equal(tracks[0]?.title, 'single')
  })

  it('rejects a local row that has no stored file', () => {
    const track = {
      id: 'x',
      title: 'Missing',
      subtitle: '',
      thumbnailUrl: '',
      source: 'local-file',
    } as PlaylistTrack
    assert.equal(isSupportedLocalAudioTrack(track), false)
  })
})
