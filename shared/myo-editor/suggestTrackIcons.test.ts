import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  iconSearchQueries,
  iconSearchTokens,
  iconWordStem,
  suggestIconsForTracks,
  type SuggestableIcon,
} from './suggestTrackIcons.ts'

const ocean: SuggestableIcon = {
  key: 'yoto:ocean',
  title: 'Ocean',
  tags: ['water', 'sea'],
  url: 'https://icons.example/ocean.png',
  source: 'yoto',
  mediaId: 'ocean',
}
const tide: SuggestableIcon = {
  key: 'yi:tide',
  title: 'Tide pool',
  tags: ['tide', 'beach'],
  url: 'https://yotoicons.com/static/uploads/1.png',
  source: 'yotoicons',
}
const harbor: SuggestableIcon = {
  key: 'yoto:harbor',
  title: 'Harbor',
  tags: ['boat'],
  url: 'https://icons.example/harbor.png',
  source: 'yoto',
  mediaId: 'harbor',
}

const dragon: SuggestableIcon = {
  key: 'yoto:dragon',
  title: 'Dragon',
  tags: ['fantasy'],
  url: 'https://icons.example/dragon.png',
  source: 'yoto',
  mediaId: 'dragon',
}
const crystal: SuggestableIcon = {
  key: 'yi:crystal',
  title: 'Crystal',
  tags: ['gem'],
  url: 'https://yotoicons.com/static/uploads/2.png',
  source: 'yotoicons',
}

describe('suggestTrackIcons', () => {
  it('keeps useful words and drops part labels and bare numbers', () => {
    assert.deepEqual(iconSearchTokens('The Ocean Book (Part 2)'), ['ocean', 'book'])
    assert.deepEqual(iconSearchTokens('Dragon Masters #26'), ['dragon', 'masters'])
  })

  it('folds plurals and simple endings', () => {
    assert.equal(iconWordStem('dragons'), 'dragon')
    assert.equal(iconWordStem('stories'), 'story')
    assert.equal(iconWordStem('boxes'), 'box')
    assert.equal(iconWordStem('glass'), 'glass')
    assert.equal(iconWordStem('bus'), 'bus')
  })

  it('searches every track before the card name and extra words', () => {
    assert.deepEqual(
      iconSearchQueries('Ocean stories', ['Tide pool', 'Harbor lights']),
      ['tide', 'harbor', 'ocean', 'stories', 'pool', 'lights'],
    )
    assert.deepEqual(iconSearchQueries('', ['Dragons', 'Dragon']), ['dragons'])
  })

  it('gives each track a different icon that matches its title', () => {
    const picks = suggestIconsForTracks({
      cardTitle: 'Ocean stories',
      tracks: [
        { id: 'a', title: 'Tide' },
        { id: 'b', title: 'Harbor lights' },
      ],
      icons: [ocean, tide, harbor],
    })
    assert.deepEqual(picks.map(pick => [pick.trackId, pick.icon.key, pick.kind]), [
      ['a', 'yi:tide', 'title'],
      ['b', 'yoto:harbor', 'title'],
    ])
  })

  it('matches plurals in track titles', () => {
    const picks = suggestIconsForTracks({
      cardTitle: '',
      tracks: [{ id: 'a', title: 'Here be Dragons' }],
      icons: [dragon],
    })
    assert.equal(picks[0]?.icon.key, 'yoto:dragon')
  })

  it('falls back to the card name when the title has no match', () => {
    const picks = suggestIconsForTracks({
      cardTitle: 'Ocean stories',
      tracks: [{ id: 'c', title: 'Zebra parade' }],
      icons: [ocean, harbor],
    })
    assert.deepEqual(picks.map(pick => [pick.icon.key, pick.kind]), [['yoto:ocean', 'card']])
  })

  it('lets title matches claim icons before any card-name fallback', () => {
    // Track 1 only matches via the card; track 2 matches "crystal" in its title.
    // Track 1 must not take the crystal icon away from track 2.
    const picks = suggestIconsForTracks({
      cardTitle: 'Cave of the Crystal Dragon',
      tracks: [
        { id: '1', title: 'Chapter 1' },
        { id: '2', title: 'The Crystal' },
      ],
      icons: [crystal, dragon],
    })
    assert.deepEqual(picks.map(pick => [pick.trackId, pick.icon.key, pick.kind]), [
      ['1', 'yoto:dragon', 'card'],
      ['2', 'yi:crystal', 'title'],
    ])
  })

  it('reuses an icon once unused matches run out, so every chapter gets one', () => {
    const picks = suggestIconsForTracks({
      cardTitle: 'Ocean',
      tracks: [
        { id: 'a', title: 'Part 1' },
        { id: 'b', title: 'Part 2' },
      ],
      icons: [ocean, harbor],
    })
    assert.deepEqual(picks.map(pick => [pick.trackId, pick.icon.key, pick.kind]), [
      ['a', 'yoto:ocean', 'card'],
      ['b', 'yoto:ocean', 'reused'],
    ])
  })

  it('leaves out tracks with nothing matching at all', () => {
    const picks = suggestIconsForTracks({
      cardTitle: 'Zoo',
      tracks: [{ id: 'z', title: 'Zebra parade' }],
      icons: [ocean, harbor],
    })
    assert.equal(picks.length, 0)
  })

  it('avoids icons other tracks already use until it has to reuse', () => {
    const picks = suggestIconsForTracks({
      cardTitle: 'Ocean',
      tracks: [{ id: 'a', title: 'Ocean waves' }],
      icons: [ocean, tide],
      avoidKeys: ['yoto:ocean'],
    })
    assert.equal(picks[0]?.kind, 'reused')
    assert.equal(picks[0]?.icon.key, 'yoto:ocean')
  })
})
