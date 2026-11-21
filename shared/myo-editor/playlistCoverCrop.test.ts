import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  coverDestRect,
  coverFitZoom,
  panFromDestOrigin,
  playlistCoverAspect,
  playlistCoverFileError,
  PLAYLIST_COVER_ASPECT_HEIGHT,
  PLAYLIST_COVER_ASPECT_WIDTH,
  PLAYLIST_COVER_EXPORT_HEIGHT,
  PLAYLIST_COVER_EXPORT_WIDTH,
} from './playlistCoverCrop.ts'

const FRAME = { zoom: 1, panX: 0, panY: 0 }

describe('playlistCoverCrop', () => {
  it('uses the Yoto default cover frame (638×1011)', () => {
    assert.equal(PLAYLIST_COVER_EXPORT_WIDTH, 638)
    assert.equal(PLAYLIST_COVER_EXPORT_HEIGHT, 1011)
    assert.equal(playlistCoverAspect(), PLAYLIST_COVER_ASPECT_WIDTH / PLAYLIST_COVER_ASPECT_HEIGHT)
  })

  it('fills the frame for an exact cover-sized source at zoom 1', () => {
    const dest = coverDestRect(
      PLAYLIST_COVER_EXPORT_WIDTH,
      PLAYLIST_COVER_EXPORT_HEIGHT,
      FRAME,
    )
    assert.equal(dest.x, 0)
    assert.equal(dest.y, 0)
    assert.equal(dest.width, PLAYLIST_COVER_EXPORT_WIDTH)
    assert.equal(dest.height, PLAYLIST_COVER_EXPORT_HEIGHT)
  })

  function assertFillsFrame(dest: { x: number, y: number, width: number, height: number }) {
    assert.ok(dest.x <= 0.001, `x ${dest.x}`)
    assert.ok(dest.y <= 0.001, `y ${dest.y}`)
    assert.ok(dest.x + dest.width >= PLAYLIST_COVER_EXPORT_WIDTH - 0.001)
    assert.ok(dest.y + dest.height >= PLAYLIST_COVER_EXPORT_HEIGHT - 0.001)
  }

  it('never letterboxes: tall, square, and wide sources all fill the frame at zoom 1', () => {
    for (const [w, h] of [[500, 1200], [700, 700], [1600, 900], [100, 3000], [3000, 100]] as const) {
      assertFillsFrame(coverDestRect(w, h, FRAME))
    }
  })

  it('crops the overflowing axis of a square at zoom 1, centered', () => {
    const dest = coverDestRect(700, 700, FRAME)
    assert.equal(Math.round(dest.height), PLAYLIST_COVER_EXPORT_HEIGHT)
    assert.ok(dest.width > PLAYLIST_COVER_EXPORT_WIDTH)
    assert.equal(Math.round(dest.x * 2 + dest.width), PLAYLIST_COVER_EXPORT_WIDTH)
    assert.ok(Math.abs(dest.y) < 1e-9)
  })

  it('cover-fit zoom is the base zoom', () => {
    assert.equal(coverFitZoom(700, 700), 1)
  })

  it('grows the dest rect when zooming in', () => {
    const full = coverDestRect(700, 700, FRAME)
    const zoomed = coverDestRect(700, 700, { zoom: 2, panX: 0, panY: 0 })
    assert.equal(Math.round(zoomed.width), Math.round(full.width * 2))
    assert.equal(Math.round(zoomed.height), Math.round(full.height * 2))
  })

  it('still fills the frame at any pan and zoom', () => {
    for (const zoom of [1, 1.7, 4]) {
      for (const pan of [-1, 0, 1]) {
        assertFillsFrame(coverDestRect(1600, 900, { zoom, panX: pan, panY: pan }))
        assertFillsFrame(coverDestRect(500, 1200, { zoom, panX: pan, panY: pan }))
      }
    }
  })

  it('ignores pan on an axis with no overflow', () => {
    const exact = coverDestRect(PLAYLIST_COVER_EXPORT_WIDTH, PLAYLIST_COVER_EXPORT_HEIGHT, FRAME)
    const panned = coverDestRect(PLAYLIST_COVER_EXPORT_WIDTH, PLAYLIST_COVER_EXPORT_HEIGHT, { zoom: 1, panX: -1, panY: 1 })
    assert.equal(panned.x, exact.x)
    assert.equal(panned.y, exact.y)
  })

  it('clamps pan so a cover-fit crop stays in frame', () => {
    const zoom = coverFitZoom(1600, 900)
    const left = coverDestRect(1600, 900, { zoom, panX: -2, panY: 0 })
    const right = coverDestRect(1600, 900, { zoom, panX: 2, panY: 0 })
    assert.equal(Math.round(left.x), 0)
    assert.equal(Math.round(right.x + right.width), PLAYLIST_COVER_EXPORT_WIDTH)
  })

  it('round-trips pan from a dest origin', () => {
    const zoom = coverFitZoom(1600, 900)
    const next = panFromDestOrigin(1600, 900, zoom, 0, 0)
    const dest = coverDestRect(1600, 900, next)
    assert.equal(Math.round(dest.x), 0)
  })

  it('rejects non-image files', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'notes.txt', { type: 'text/plain' })
    assert.equal(playlistCoverFileError(file), 'Use a JPG, PNG, WebP, or GIF.')
  })
})
