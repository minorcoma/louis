import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

type Listener = () => void

class FakeAudio {
  static created: FakeAudio[] = []

  readyState = 0
  paused = true
  ended = false
  muted = false
  volume = 1
  loop = false
  preload = ''
  playsInline = false
  src: string
  playCalls = 0
  private time = 0
  private listeners = new Map<string, Set<Listener>>()

  constructor(src?: string) {
    this.src = src ?? ''
    FakeAudio.created.push(this)
  }

  get currentTime() {
    return this.time
  }

  set currentTime(value: number) {
    if (this.readyState < 1) {
      throw new DOMException('The media element is not seekable.', 'InvalidStateError')
    }
    this.time = value
  }

  addEventListener(type: string, fn: Listener) {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(fn)
  }

  play() {
    this.playCalls += 1
    this.paused = false
    return Promise.resolve()
  }

  pause() {
    this.paused = true
    for (const fn of this.listeners.get('pause') ?? []) fn()
  }
}

const playerUrl = new URL('../app/utils/uiSoundPlayer.ts', import.meta.url).href

async function loadPlayer() {
  const mod = await import(playerUrl)
  mod.resetUiSoundPlayerForTests()
  return mod.getUiSoundPlayer()
}

describe('UI sound player with an unloaded clip', () => {
  const previousAudio = globalThis.Audio

  afterEach(() => {
    FakeAudio.created = []
    globalThis.Audio = previousAudio
  })

  it('plays without seeking when WebKit would reject currentTime', async () => {
    globalThis.Audio = FakeAudio as unknown as typeof Audio
    const player = await loadPlayer()

    for (let i = 0; i < 30; i++) {
      assert.equal(await player.tryPlayOneShot('button'), true)
    }

    assert.ok(FakeAudio.created.length > 0)
    assert.ok(FakeAudio.created.length <= 24)
    assert.ok(FakeAudio.created.every(audio => audio.playCalls >= 1))
    assert.ok(FakeAudio.created.every(audio => audio.playsInline))
  })

  it('unlocks from a user gesture without a seek on an unloaded clip', async () => {
    globalThis.Audio = FakeAudio as unknown as typeof Audio
    const player = await loadPlayer()
    assert.equal(await player.unlock('louis'), true)
    assert.equal(player.isUnlocked(), true)
    assert.ok(FakeAudio.created.some(audio => audio.playCalls >= 1))
  })
})
