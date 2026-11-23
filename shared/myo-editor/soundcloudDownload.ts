/** yt-dlp args for one public SoundCloud track. Other hosts are rejected. */
export function soundcloudDownloadArgs(
  url: string,
  outputTemplate: string,
  cookiesArgs: readonly string[] = [],
): string[] {
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    throw new Error('That SoundCloud link is not allowed.')
  }
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()
  if (parsed.protocol !== 'https:' || (host !== 'soundcloud.com' && host !== 'm.soundcloud.com')) {
    throw new Error('That SoundCloud link is not allowed.')
  }
  return [
    ...cookiesArgs,
    '--no-playlist',
    '--no-progress',
    '-f', 'bestaudio/best',
    '-x',
    '--audio-format', 'm4a',
    '-o', outputTemplate,
    '--',
    parsed.toString(),
  ]
}
