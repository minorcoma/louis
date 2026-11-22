import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assignRandomTrackIcons, type PublicIconChoice } from './assignTrackIcons.ts'
import { applyTrackIcon } from './trackArt.ts'
import type { PlaylistTrack } from './types.ts'

const ICONS: PublicIconChoice[] = [
  { mediaId: 'apple', url: 'https://icons.example/apple.png' },
  { mediaId: 'boat', url: 'https://icons.example/boat.png' },
  { mediaId: 'cat', url: 'https://icons.example/cat.png' },
]

function track(id: string): PlaylistTrack {
  return {
    id,
    title: id,
    subtitle: '',
    thumbnailUrl: '',
    source: 'app-youtube',
    youtubeId: id,
  }
}

describe('assignRandomTrackIcons', () => {
  it('gives each new track a different icon when the catalog allows it', () => {
    const assigned = assignRandomTrackIcons(
      [track('a'), track('b'), track('c')],
      ICONS,
      { random: () => 0 },
    )
    const ids = assigned.map(item => item.chapterDisplay?.icon16x16)
    assert.equal(new Set(ids).size, 3)
    assert.ok(ids.every(icon => icon?.startsWith('yoto:#')))
    assert.ok(assigned.every(item => item.iconPreviewUrl?.startsWith('https://')))
  })

  it('does not replace an icon that is already chosen', () => {
    const kept = applyTrackIcon(track('a'), 'yoto:#apple', 'https://icons.example/apple.png')
    const assigned = assignRandomTrackIcons([kept, track('b')], ICONS, { random: () => 0 })
    assert.equal(assigned[0], kept)
    assert.notEqual(assigned[1]?.chapterDisplay?.icon16x16, 'yoto:#apple')
  })

  it('skips tracks the caller excludes', () => {
    const original = track('saved')
    const assigned = assignRandomTrackIcons([original, track('new')], ICONS, {
      include: track => track.id !== 'saved',
      random: () => 0,
    })
    assert.equal(assigned[0], original)
    assert.ok(assigned[1]?.chapterDisplay?.icon16x16)
  })

  it('repeats only after every icon has been used', () => {
    const assigned = assignRandomTrackIcons(
      [track('a'), track('b'), track('c'), track('d')],
      ICONS.slice(0, 2),
      { random: () => 0 },
    )
    const ids = assigned.map(item => item.chapterDisplay?.icon16x16)
    assert.equal(new Set(ids.slice(0, 2)).size, 2)
    assert.ok(ids[3])
  })
})
