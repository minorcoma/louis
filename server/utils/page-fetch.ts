import { createError } from 'h3'

const PAGE_MAX_BYTES = 2_000_000
const PAGE_TIMEOUT_MS = 15_000

const BROWSER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'User-Agent': 'Mozilla/5.0 (compatible; Louis/1.0)',
}

export async function readLimitedText(response: Response, maxBytes = PAGE_MAX_BYTES): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw createError({ statusCode: 502, statusMessage: 'That page was too large to read.' })
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function isAllowedHost(url: URL, hosts: ReadonlySet<string>): boolean {
  if (url.protocol !== 'https:') return false
  const host = url.hostname.replace(/^www\./i, '').toLowerCase()
  return hosts.has(host)
}

/** Follow a few HTTPS redirects, staying on the allowed hosts. */
export async function fetchAllowedPage(
  start: string,
  hosts: ReadonlySet<string>,
): Promise<{ finalUrl: string, html: string }> {
  let current = start
  for (let hop = 0; hop < 4; hop++) {
    let url: URL
    try {
      url = new URL(current)
    }
    catch {
      throw createError({ statusCode: 400, statusMessage: 'That link is not allowed.' })
    }
    if (!isAllowedHost(url, hosts)) {
      throw createError({ statusCode: 400, statusMessage: 'That link is not allowed.' })
    }

    const response = await fetch(url, {
      redirect: 'manual',
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    })
    if (response.status >= 300 && response.status < 400) {
      const next = new URL(response.headers.get('location') ?? '', url)
      current = next.toString()
      continue
    }
    if (!response.ok) {
      throw createError({ statusCode: 404, statusMessage: 'That link was not found or is not public.' })
    }
    return { finalUrl: url.toString(), html: await readLimitedText(response) }
  }
  throw createError({ statusCode: 502, statusMessage: 'That link redirected too many times.' })
}
