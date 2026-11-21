import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { YOTO_MYO_SPLIT_TRACK_SECONDS } from './yotoMyoLimits.ts'
import {
  DEFAULT_SPLIT_TARGET_SECONDS,
  evenSplitCount,
  getSplitTargetSeconds,
  normalizeSplitTargetMinutes,
  normalizeSplitTargetSeconds,
  setSplitTargetSeconds,
} from './splitTarget.ts'
import { planTrackSplit } from './splitTrack.ts'

const HARD = YOTO_MYO_SPLIT_TRACK_SECONDS
const TARGET = DEFAULT_SPLIT_TARGET_SECONDS

describe('evenSplitCount', () => {
  it('leaves a track alone when it is already near the target', () => {
    assert.equal(evenSplitCount(17 * 60, TARGET, HARD), 1)
    assert.equal(evenSplitCount(20 * 60, TARGET, HARD), 1)
    assert.equal(evenSplitCount(TARGET, TARGET, HARD), 1)
  })

  it('folds a short tail instead of leaving a stub', () => {
    assert.equal(evenSplitCount(32 * 60, TARGET, HARD), 2)
    assert.equal(evenSplitCount(47 * 60, TARGET, HARD), 3)
    assert.equal(evenSplitCount(62 * 60, TARGET, HARD), 4)
  })

  it('keeps even parts when the tail is a full chapter', () => {
    assert.equal(evenSplitCount(30 * 60, TARGET, HARD), 2)
    assert.equal(evenSplitCount(90 * 60, TARGET, HARD), 6)
    assert.equal(evenSplitCount(2 * 60 * 60, TARGET, HARD), 8)
  })

  it('still respects the 55-minute hard cap when that is the target', () => {
    assert.equal(evenSplitCount(HARD, HARD, HARD), 1)
    assert.equal(evenSplitCount(HARD + 1, HARD, HARD), 2)
    assert.equal(evenSplitCount(7200, HARD, HARD), 3)
    assert.equal(evenSplitCount(60 * 60, HARD, HARD), 2)
  })
})

describe('planTrackSplit default target', () => {
  it('splits about 15 minutes and keeps the leftover on the last part', () => {
    const plan = planTrackSplit(32 * 60)
    assert.ok(plan)
    assert.equal(plan.count, 2)
    assert.equal(plan.parts[0]?.duration, 16 * 60)
    assert.equal(plan.parts[1]?.duration, 16 * 60)
    assert.equal(
      plan.parts.reduce((sum, part) => sum + part.duration, 0),
      32 * 60,
    )
  })

  it('does not split a 17 minute track into 15 plus 2', () => {
    assert.equal(planTrackSplit(17 * 60), null)
  })
})

describe('split target preference', () => {
  it('falls back to 15 minutes and only accepts the settings choices', () => {
    assert.equal(normalizeSplitTargetSeconds('nope', HARD), DEFAULT_SPLIT_TARGET_SECONDS)
    assert.equal(normalizeSplitTargetSeconds(60, HARD), 5 * 60)
    assert.equal(normalizeSplitTargetSeconds(2 * 60 * 60, HARD), HARD)
    assert.equal(normalizeSplitTargetMinutes(30), 30)
    assert.equal(normalizeSplitTargetMinutes(12), 15)
  })

  it('restores the active target after a test changes it', () => {
    const previous = getSplitTargetSeconds()
    try {
      setSplitTargetSeconds(30 * 60, HARD)
      assert.equal(getSplitTargetSeconds(), 30 * 60)
      assert.equal(planTrackSplit(50 * 60)?.count, 2)
    }
    finally {
      setSplitTargetSeconds(previous, HARD)
    }
  })
})
