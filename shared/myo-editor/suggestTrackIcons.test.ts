import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  iconSearchQueries,
  iconSearchTokens,
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

describe('suggestTrackIcons', () => {
  it('keeps useful words and drops part labels', () => {
    assert.deepEqual(iconSearchTokens('The Ocean Book (Part 2)'), ['ocean', 'book'])
  })

  it('searches track words before the card name', () => {
    assert.deepEqual(
      iconSearchQueries('Ocean stories', ['Tide pool', 'Harbor']),
      ['tide', 'pool', 'harbor', 'ocean', 'stories'],
    )
  })

  it('gives each track a different icon that matches its title', () => {
    const picks = suggestIconsForTracks({
      cardTitle: 'Ocean stories',
      tracks: [
        { id: 'a', title: 'Tide' },
        { id: 'b', title: 'Harbor lights' },
        { id: 'c', title: 'Zebra parade' },
      ],
      icons: [ocean, tide, harbor],
    })
    assert.deepEqual(picks.map(pick => [pick.trackId, pick.icon.key]), [
      ['a', 'yi:tide'],
      ['b', 'yoto:harbor'],
    ])
  })

  it('lets a nameless chapter use the card name, without repeating an icon', () => {
    const picks = suggestIconsForTracks({
      cardTitle: 'Ocean',
      tracks: [
        { id: 'a', title: 'Part 1' },
        { id: 'b', title: 'Part 2' },
      ],
      icons: [ocean, harbor],
    })
    assert.equal(picks.length, 1)
    assert.equal(picks[0]?.icon.key, 'yoto:ocean')
  })
})
