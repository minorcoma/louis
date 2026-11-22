import {
  coverDestRect,
  PLAYLIST_COVER_EXPORT_HEIGHT,
  PLAYLIST_COVER_EXPORT_WIDTH,
  PLAYLIST_COVER_LETTERBOX,
  PLAYLIST_COVER_UPLOAD_MAX_BYTES,
  type CoverCrop,
} from '#shared/myo-editor/playlistCoverCrop'

export function loadCoverImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image.'))
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

/** JPEG qualities tried, in order, when the lossless PNG is over the upload cap. */
const COVER_JPEG_QUALITIES = [0.92, 0.86, 0.8, 0.72, 0.64, 0.55, 0.45]

/**
 * Crop to the Yoto cover frame and encode under PLAYLIST_COVER_UPLOAD_MAX_BYTES.
 * PNG first (lossless, fine for flat art); detailed photos fall back to JPEG at
 * stepped-down quality so the user never has to shrink the photo themselves.
 */
export async function renderPlaylistCoverPng(
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  crop: CoverCrop,
): Promise<Blob> {
  const dest = coverDestRect(imageWidth, imageHeight, crop)
  const canvas = document.createElement('canvas')
  canvas.width = PLAYLIST_COVER_EXPORT_WIDTH
  canvas.height = PLAYLIST_COVER_EXPORT_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not crop that image.')
  ctx.fillStyle = PLAYLIST_COVER_LETTERBOX
  ctx.fillRect(0, 0, PLAYLIST_COVER_EXPORT_WIDTH, PLAYLIST_COVER_EXPORT_HEIGHT)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    image,
    0,
    0,
    imageWidth,
    imageHeight,
    dest.x,
    dest.y,
    dest.width,
    dest.height,
  )
  const png = await canvasToBlob(canvas, 'image/png')
  if (!png) throw new Error('Could not crop that image.')
  if (png.size <= PLAYLIST_COVER_UPLOAD_MAX_BYTES) return png

  for (const quality of COVER_JPEG_QUALITIES) {
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality)
    // Some browsers ignore unsupported types and hand back PNG; stop if so.
    if (!jpeg || jpeg.type !== 'image/jpeg') break
    if (jpeg.size <= PLAYLIST_COVER_UPLOAD_MAX_BYTES) return jpeg
  }
  throw new Error('Could not shrink that image enough to upload. Try a different photo.')
}
