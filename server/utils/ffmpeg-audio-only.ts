/**
 * Output options that keep only the first audio stream. Without them ffmpeg
 * also maps embedded cover art (an M4B/MP3 "attached pic", which it tries to
 * encode as H.264), chapter text tracks, and chapter markers — and the .m4a
 * (ipod) muxer then refuses to write the file.
 */
export const AUDIO_ONLY_OUTPUT_ARGS: readonly string[] = [
  '-map', '0:a:0',
  '-vn',
  '-sn',
  '-dn',
  '-map_chapters', '-1',
]
