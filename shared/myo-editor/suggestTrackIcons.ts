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

/** Words worth searching. Drops “(Part 2)” and tiny filler. */
export function iconSearchTokens(text: string): string[] {
  const withoutParts = text.replace(/\(\s*part\s+\d+\s*\)/gi, ' ')
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const raw of withoutParts.toLowerCase().split(/[^a-z0-9]+/)) {
    const token = raw.trim()
    if (token.length < 3 || STOP_WORDS.has(token) || seen.has(token)) continue
    seen.add(token)
    tokens.push(token)
  }
  return tokens
}

/** Short tag searches, track words first, then the card name. */
export function iconSearchQueries(
  cardTitle: string,
  trackTitles: readonly string[],
  limit = 6,
): string[] {
  const ranked = [
    ...trackTitles.flatMap(title => iconSearchTokens(title).sort((a, b) => b.length - a.length)),
    ...iconSearchTokens(cardTitle),
  ]
  const queries: string[] = []
  const seen = new Set<string>()
  for (const token of ranked) {
    if (queries.length >= limit) break
    if (seen.has(token)) continue
    seen.add(token)
    queries.push(token)
  }
  return queries
}

function iconWords(icon: SuggestableIcon): Set<string> {
  return new Set(iconSearchTokens([icon.title, ...icon.tags].join(' ')))
}

export function scoreIcon(
  icon: SuggestableIcon,
  trackTokens: readonly string[],
  cardTokens: readonly string[],
): number {
  const words = iconWords(icon)
  let score = 0
  for (const token of trackTokens) {
    if (words.has(token)) score += 5
  }
  for (const token of cardTokens) {
    if (words.has(token) && !trackTokens.includes(token)) score += 2
  }
  return score
}

/**
 * Best unused icon for each track. A titled track needs a word from its own
 * title. A title with no searchable words can match the card name instead.
 */
export function suggestIconsForTracks(input: {
  cardTitle: string
  tracks: readonly { id: string, title: string }[]
  icons: readonly SuggestableIcon[]
}): IconSuggestion[] {
  const cardTokens = iconSearchTokens(input.cardTitle)
  const used = new Set<string>()
  const picks: IconSuggestion[] = []

  for (const track of input.tracks) {
    const trackTokens = iconSearchTokens(track.title)
    const floor = trackTokens.length > 0 ? 5 : 2
    const ranked = input.icons
      .filter(icon => !used.has(icon.key))
      .map(icon => ({ icon, score: scoreIcon(icon, trackTokens, cardTokens) }))
      .filter(item => item.score >= floor)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        if (a.icon.source !== b.icon.source) return a.icon.source === 'yoto' ? -1 : 1
        return a.icon.title.localeCompare(b.icon.title)
      })
    const best = ranked[0]
    if (!best) continue
    used.add(best.icon.key)
    picks.push({ trackId: track.id, icon: best.icon, score: best.score })
  }

  return picks
}
