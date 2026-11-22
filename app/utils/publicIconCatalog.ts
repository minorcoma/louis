import { ref } from 'vue'
import type { PublicIconChoice } from '#shared/myo-editor/assignTrackIcons'

export const publicIconCatalog = ref<PublicIconChoice[]>([])

let inflight: Promise<void> | null = null

/** Load Yoto's public icons once so new tracks can each get a different picture. */
export function loadPublicIconCatalog(): Promise<void> {
  if (!import.meta.client) return Promise.resolve()
  if (publicIconCatalog.value.length > 0) return Promise.resolve()
  if (!inflight) {
    inflight = $fetch<{ icons?: { mediaId?: string, url?: string }[] }>('/api/yoto/icons/public')
      .then((data) => {
        publicIconCatalog.value = (data.icons ?? []).flatMap((icon) => {
          const mediaId = icon.mediaId?.trim()
          const url = icon.url?.trim()
          if (!mediaId || !url) return []
          return [{ mediaId, url }]
        })
      })
      .catch(() => {
        inflight = null
      })
  }
  return inflight ?? Promise.resolve()
}
