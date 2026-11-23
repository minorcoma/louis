import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isListableYoutubeSearchResult } from './youtubePlaylistImport.ts'
import {
  interleaveResults,
  isListablePickerResult,
  normalizeSearchSources,
  soundcloudSearchItemFromYtdlp,
} from './soundcloudSearch.ts'

const ENTRY = {
  id: '417816560',
  title: 'You Are My Sunshine (Piano Lullaby)',
  uploader: 'Sleepyheadz',
  duration: 178.046,
  timestamp: 1_521_000_000,
  url: 'https://api.soundcloud.com/tracks/soundcloud%3Atracks%3A417816560',
  webpage_url: 'https://soundcloud.com/sleepyheadz/you-are-my-sunshine?in=x',
  thumbnails: [
    { id: 'small', url: 'https://i1.sndcdn.com/artworks-a-small.png' },
    { id: 't500x500', url: 'https://i1.sndcdn.com/artworks-a-t500x500.png' },
    { id: 'original', url: 'https://i1.sndcdn.com/artworks-a-original.png' },
  ],
}

describe('soundcloud search', () => {
  it('maps a yt-dlp scsearch entry to a picker row', () => {
    const item = soundcloudSearchItemFromYtdlp(ENTRY)
    assert.deepEqual(item, {
      id: 'sc:417816560',
      title: 'You Are My Sunshine (Piano Lullaby)',
      channelTitle: 'Sleepyheadz',
      thumbnailUrl: 'https://i1.sndcdn.com/artworks-a-t500x500.png',
      publishedAt: new Date(1_521_000_000 * 1000).toISOString(),
      durationSeconds: 178,
      soundcloud: {
        id: '417816560',
        url: 'https://soundcloud.com/sleepyheadz/you-are-my-sunshine',
      },
    })
  })

  it('rejects entries without a soundcloud.com page or a numeric id', () => {
    assert.equal(soundcloudSearchItemFromYtdlp({ ...ENTRY, webpage_url: 'https://evil.example/x' }), null)
    assert.equal(soundcloudSearchItemFromYtdlp({ ...ENTRY, webpage_url: 'http://soundcloud.com/a/b' }), null)
    assert.equal(soundcloudSearchItemFromYtdlp({ ...ENTRY, id: 'abc' }), null)
    assert.equal(soundcloudSearchItemFromYtdlp({ ...ENTRY, title: ' ' }), null)
    assert.equal(soundcloudSearchItemFromYtdlp(null), null)
  })

  it('leaves duration unset when unknown', () => {
    assert.equal(soundcloudSearchItemFromYtdlp({ ...ENTRY, duration: null })?.durationSeconds, undefined)
  })

  it('normalizes stored sources and never returns none', () => {
    assert.deepEqual(normalizeSearchSources(['soundcloud', 'youtube', 'spotify']), ['youtube', 'soundcloud'])
    assert.deepEqual(normalizeSearchSources(['soundcloud']), ['soundcloud'])
    assert.deepEqual(normalizeSearchSources([]), ['youtube'])
    assert.deepEqual(normalizeSearchSources('youtube'), ['youtube'])
  })

  it('lists SoundCloud rows that the YouTube-only check would hide', () => {
    const row = soundcloudSearchItemFromYtdlp(ENTRY)!
    assert.equal(isListableYoutubeSearchResult(row), false)
    assert.equal(isListablePickerResult(row, isListableYoutubeSearchResult), true)
    assert.equal(isListablePickerResult({ ...row, title: '' }, isListableYoutubeSearchResult), false)
    const youtube = { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', durationSeconds: 214 }
    assert.equal(isListablePickerResult(youtube, isListableYoutubeSearchResult), true)
    assert.equal(isListablePickerResult({ ...youtube, id: 'sc:1' }, isListableYoutubeSearchResult), false)
  })

  it('interleaves sources so neither buries the other', () => {
    assert.deepEqual(interleaveResults<number | string>([[1, 2, 3], ['a']]), [1, 'a', 2, 3])
    assert.deepEqual(interleaveResults<string>([[], ['a', 'b']]), ['a', 'b'])
    assert.deepEqual(interleaveResults<string>([]), [])
  })
})
