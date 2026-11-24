import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isFullFileTrim, trimAacArgs } from './ffmpeg-trim.ts'

describe('isFullFileTrim (ffmpeg no-op)', () => {
  it('skips a window that covers the whole file', () => {
    assert.equal(isFullFileTrim(0, 12.5, 12.5), true)
    assert.equal(isFullFileTrim(0.02, 12.48, 12.5), true)
  })

  it('does not skip a real intro cut', () => {
    assert.equal(isFullFileTrim(8, 12.5, 12.5), false)
  })
})

describe('trimAacArgs', () => {
  it('puts -ss and -to after the input for a decode-accurate cut', () => {
    const args = trimAacArgs('/in.m4a', '/out.m4a', 4.5, 40)
    const inputAt = args.indexOf('-i')
    const ssAt = args.indexOf('-ss')
    const toAt = args.indexOf('-to')
    assert.ok(inputAt >= 0 && ssAt > inputAt && toAt > ssAt)
    assert.equal(args[ssAt + 1], '4.5')
    assert.equal(args[toAt + 1], '40')
    assert.equal(args[args.length - 1], '/out.m4a')
  })
})

describe('trimAacArgs keeps audio only', () => {
  it('drops embedded cover art, text tracks, and chapters (M4B)', () => {
    const args = trimAacArgs('/in.m4b', '/out.m4a', 5, 65)
    const at = args.indexOf('-map')
    assert.equal(args[at + 1], '0:a:0')
    for (const flag of ['-vn', '-sn', '-dn']) assert.ok(args.includes(flag), flag)
    assert.equal(args[args.indexOf('-map_chapters') + 1], '-1')
    assert.ok(at < args.indexOf('/out.m4a'), 'output options come before the output path')
  })
})
