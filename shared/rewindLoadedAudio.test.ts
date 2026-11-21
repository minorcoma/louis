import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { rewindLoadedAudio, type RewindableAudio } from './rewindLoadedAudio.ts'

function clip(readyState: number, currentTime: number): RewindableAudio & { sets: number[] } {
  const sets: number[] = []
  const audio = {
    readyState,
    sets,
    get currentTime() {
      return currentTime
    },
    set currentTime(value: number) {
      if (readyState < 1) {
        throw new DOMException('The media element is not seekable.', 'InvalidStateError')
      }
      sets.push(value)
      currentTime = value
    },
  }
  return audio
}

describe('rewindLoadedAudio', () => {
  it('does not seek a clip that has no metadata yet', () => {
    const audio = clip(0, 0)
    assert.doesNotThrow(() => rewindLoadedAudio(audio))
    assert.deepEqual(audio.sets, [])
  })

  it('does not seek when playback is already at the start', () => {
    const audio = clip(1, 0)
    rewindLoadedAudio(audio)
    assert.deepEqual(audio.sets, [])
  })

  it('rewinds a loaded clip that has moved', () => {
    const audio = clip(2, 4.5)
    rewindLoadedAudio(audio)
    assert.deepEqual(audio.sets, [0])
    assert.equal(audio.currentTime, 0)
  })

  it('swallows a seek that the element rejects', () => {
    const audio = clip(1, 3)
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => 3,
      set() {
        throw new DOMException('not seekable', 'InvalidStateError')
      },
    })
    assert.doesNotThrow(() => rewindLoadedAudio(audio))
  })
})
