import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { appleArtworkUrl, coverSearchQuery, coversFromItunesPayload } from './coverSearch.ts'

const ART = 'https://is1-ssl.mzstatic.com/image/thumb/Music/abc/cover.jpg/100x100bb.jpg'

describe('cover search', () => {
  it('adds the word cover to the card name', () => {
    assert.equal(coverSearchQuery('  Ocean   stories '), 'Ocean stories cover')
    assert.equal(coverSearchQuery('Best covers'), 'Best covers')
    assert.equal(coverSearchQuery('   '), '')
  })

  it('only rewrites Apple artwork URLs', () => {
    assert.equal(
      appleArtworkUrl(ART, 600),
      'https://is1-ssl.mzstatic.com/image/thumb/Music/abc/cover.jpg/600x600bb.jpg',
    )
    assert.equal(appleArtworkUrl('https://example.com/cover.jpg', 600), null)
    assert.equal(appleArtworkUrl('http://is1-ssl.mzstatic.com/x/100x100bb.jpg', 600), null)
  })

  it('reads album covers and skips explicit ones', () => {
    const hits = coversFromItunesPayload({
      results: [
        {
          collectionId: 1,
          collectionName: 'Ocean stories',
          artistName: 'Ada',
          artworkUrl100: ART,
          collectionExplicitness: 'notExplicit',
        },
        {
          collectionId: 2,
          collectionName: 'Nope',
          artistName: 'Bea',
          artworkUrl100: ART.replace('abc', 'nope'),
          collectionExplicitness: 'explicit',
        },
        {
          wrapperType: 'track',
          trackId: 3,
          trackName: 'Not a picture',
        },
      ],
    })
    assert.equal(hits.length, 1)
    assert.equal(hits[0]?.title, 'Ocean stories')
    assert.equal(hits[0]?.artist, 'Ada')
    assert.match(hits[0]?.imageUrl ?? '', /600x600bb/)
  })
})
