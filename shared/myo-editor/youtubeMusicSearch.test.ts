import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  youtubeMusicArtistName,
  youtubeMusicSongIds,
  youtubeMusicSongsSearchUrl,
} from './youtubeMusicSearch.ts'
import { dedupeResultsById, normalizeSearchSources } from './soundcloudSearch.ts'

describe('youtube music search', () => {
  it('builds the Songs search URL', () => {
    assert.equal(
      youtubeMusicSongsSearchUrl(' let it go & frozen '),
      'https://music.youtube.com/search?q=let%20it%20go%20%26%20frozen#songs',
    )
  })

  it('keeps only video ids, in order, once each', () => {
    assert.deepEqual(youtubeMusicSongIds([
      { id: 'qSU560anReg', title: 'Let It Go' },
      { id: 'MPREb_By51sR1oJpH' },
      { id: 'qSU560anReg' },
      null,
      { id: '0SbTvDL0VFE' },
    ]), ['qSU560anReg', '0SbTvDL0VFE'])
  })

  it('strips the auto-generated "- Topic" channel suffix', () => {
    assert.equal(youtubeMusicArtistName('Idina Menzel - Topic'), 'Idina Menzel')
    assert.equal(youtubeMusicArtistName('Disney Music VEVO'), 'Disney Music VEVO')
  })

  it('orders sources and dedupes shared ids', () => {
    assert.deepEqual(normalizeSearchSources(['soundcloud', 'youtube-music']), ['youtube-music', 'soundcloud'])
    assert.deepEqual(
      dedupeResultsById([{ id: 'a', n: 1 }, { id: 'b', n: 2 }, { id: 'a', n: 3 }]).map(item => item.n),
      [1, 2],
    )
  })
})
