const STOP_WORDS = new Set([
  'a', 'an', 'and', 'chapter', 'for', 'from', 'in', 'of', 'on', 'or', 'part',
  'pt', 'the', 'to', 'track', 'vol', 'volume', 'with',
])

export interface SuggestableIcon {
  key: string
  title: string
  tags: string[]
  url: string
  source: 'yoto' | 'yotoicons'
  mediaId?: string
}

export interface IconSuggestion {
  trackId: string
  icon: SuggestableIcon
  score: number
}

/**
 * Fold plurals and simple endings so "dragons", "stories" and "boxes" match
 * icons tagged "dragon", "story" and "box". Deliberately tiny.
 */
export function iconWordStem(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`
  if (token.length > 4 && /(?:ches|shes|xes|sses|zes)$/.test(token)) return token.slice(0, -2)
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us')) {
    return token.slice(0, -1)
  }
  return token
}

/** Words worth searching. Drops “(Part 2)”, numbers like “#26”, and tiny filler. */
export function iconSearchTokens(text: string): string[] {
  const withoutParts = text.replace(/\(\s*part\s+\d+\s*\)/gi, ' ')
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const raw of withoutParts.toLowerCase().split(/[^a-z0-9]+/)) {
    const token = raw.trim()
    if (token.length < 3 || /^\d+$/.test(token) || STOP_WORDS.has(token) || seen.has(token)) continue
    seen.add(token)
    tokens.push(token)
  }
  return tokens
}

function stems(tokens: readonly string[]): string[] {
  return [...new Set(tokens.map(iconWordStem))]
}

/**
 * Community icon searches: each track's longest word first (so every track
 * gets at least one search), then its other words, then the card name.
 */
export function iconSearchQueries(
  cardTitle: string,
  trackTitles: readonly string[],
  limit = 24,
): string[] {
  const perTrack = trackTitles.map(title =>
    iconSearchTokens(title).sort((a, b) => b.length - a.length),
  )
  const ranked = [
    ...perTrack.map(tokens => tokens[0]).filter((token): token is string => Boolean(token)),
    ...iconSearchTokens(cardTitle),
    ...perTrack.flatMap(tokens => tokens.slice(1)),
  ]
  const queries: string[] = []
  const seen = new Set<string>()
  for (const token of ranked) {
    if (queries.length >= limit) break
    const stem = iconWordStem(token)
    if (seen.has(stem)) continue
    seen.add(stem)
    queries.push(token)
  }
  return queries
}

function iconWords(icon: SuggestableIcon): Set<string> {
  return new Set(stems(iconSearchTokens([icon.title, ...icon.tags].join(' '))))
}

export function scoreIcon(
  icon: SuggestableIcon,
  trackTokens: readonly string[],
  cardTokens: readonly string[],
): number {
  const words = iconWords(icon)
  const track = stems(trackTokens)
  let score = 0
  for (const token of track) {
    if (words.has(token)) score += 5
  }
  for (const token of stems(cardTokens)) {
    if (words.has(token) && !track.includes(token)) score += 2
  }
  return score
}

export type IconMatchKind = 'title' | 'card' | 'reused'

export interface IconSuggestionWithKind extends IconSuggestion {
  /** title: a word from the track's own title; card: the card name; reused: shared with another track. */
  kind: IconMatchKind
}

/**
 * An icon for as many tracks as possible, in passes so better matches win:
 *   1. an unused icon matching a word in the track's own title
 *   2. an unused icon matching the card name
 *   3. the best match again, even if another track already uses it
 * Tracks with no matching icon at all are left out.
 * `avoidKeys` are icons already on other tracks; they're only used in pass 3.
 */
export function suggestIconsForTracks(input: {
  cardTitle: string
  tracks: readonly { id: string, title: string }[]
  icons: readonly SuggestableIcon[]
  avoidKeys?: Iterable<string>
}): IconSuggestionWithKind[] {
  const cardTokens = iconSearchTokens(input.cardTitle)
  const used = new Set<string>(input.avoidKeys ?? [])
  const picked = new Map<string, IconSuggestionWithKind>()

  const scored = input.tracks.map((track) => {
    const trackTokens = iconSearchTokens(track.title)
    return {
      track,
      ranked: input.icons
        .map(icon => ({ icon, score: scoreIcon(icon, trackTokens, cardTokens) }))
        .filter(item => item.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          if (a.icon.source !== b.icon.source) return a.icon.source === 'yoto' ? -1 : 1
          return a.icon.title.localeCompare(b.icon.title)
        }),
    }
  })

  const passes: Array<{ kind: IconMatchKind, minScore: number, allowUsed: boolean }> = [
    { kind: 'title', minScore: 5, allowUsed: false },
    { kind: 'card', minScore: 2, allowUsed: false },
    { kind: 'reused', minScore: 2, allowUsed: true },
  ]
  for (const pass of passes) {
    for (const { track, ranked } of scored) {
      if (picked.has(track.id)) continue
      const best = ranked.find(item =>
        item.score >= pass.minScore && (pass.allowUsed || !used.has(item.icon.key)),
      )
      if (!best) continue
      used.add(best.icon.key)
      picked.set(track.id, { trackId: track.id, icon: best.icon, score: best.score, kind: pass.kind })
    }
  }

  return input.tracks.flatMap(track => {
    const pick = picked.get(track.id)
    return pick ? [pick] : []
  })
}
