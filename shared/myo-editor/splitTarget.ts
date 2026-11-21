/** Product default. Parts stay near this length; the 55-minute hard cap is separate. */
export const DEFAULT_SPLIT_TARGET_SECONDS = 15 * 60
export const MIN_SPLIT_TARGET_SECONDS = 5 * 60
export const DEFAULT_SPLIT_TARGET_MINUTES = 15

/** Settings choices, in minutes. 55 is the longest part we will cut. */
export const SPLIT_TARGET_CHOICES_MINUTES = [10, 15, 20, 30, 45, 55] as const

let activeTargetSeconds = DEFAULT_SPLIT_TARGET_SECONDS

export function getSplitTargetSeconds(): number {
  return activeTargetSeconds
}

/**
 * Clamp a requested chapter length. Missing or junk values fall back to 15 minutes.
 * `hardMaxSeconds` is Yoto's safety cap (55 minutes), not the user's target.
 */
export function normalizeSplitTargetSeconds(value: unknown, hardMaxSeconds: number): number {
  const n = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN
  if (!Number.isFinite(n)) return DEFAULT_SPLIT_TARGET_SECONDS
  return Math.min(hardMaxSeconds, Math.max(MIN_SPLIT_TARGET_SECONDS, Math.round(n)))
}

export function setSplitTargetSeconds(value: unknown, hardMaxSeconds = 55 * 60): number {
  activeTargetSeconds = normalizeSplitTargetSeconds(value, hardMaxSeconds)
  return activeTargetSeconds
}

export function normalizeSplitTargetMinutes(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if ((SPLIT_TARGET_CHOICES_MINUTES as readonly number[]).includes(n)) return n
  return DEFAULT_SPLIT_TARGET_MINUTES
}

export interface EvenSplitRange {
  start: number
  duration: number
}

/**
 * How many even chapters a duration becomes.
 * A short tail (under ~40% of the target, and at least 5 minutes) is folded
 * into the previous chapter so the last part is not a 2-minute stub.
 * Count still grows until every part is within `hardMaxSeconds`.
 */
export function evenSplitCount(
  durationSeconds: number,
  targetSeconds: number,
  hardMaxSeconds: number,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 1
  const target = normalizeSplitTargetSeconds(targetSeconds, hardMaxSeconds)
  if (durationSeconds <= target) return 1

  let count = Math.max(2, Math.ceil(durationSeconds / target))
  while (durationSeconds / count > hardMaxSeconds) count += 1

  const minPart = Math.min(target, Math.max(MIN_SPLIT_TARGET_SECONDS, Math.round(target * 0.4)))
  const fixedRemainder = durationSeconds - (count - 1) * target
  if (
    fixedRemainder > 0
    && fixedRemainder < minPart
    && durationSeconds / (count - 1) <= hardMaxSeconds
  ) {
    count -= 1
  }
  return count < 2 ? 1 : count
}
