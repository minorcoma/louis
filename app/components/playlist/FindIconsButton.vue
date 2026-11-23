<script setup lang="ts">
import { MYO_EDITOR_KEY } from '~/components/myo-editor/keys'

const editor = inject(MYO_EDITOR_KEY, null)
const { playEvent } = useUiSound()
const { showAddedToPlaylist, showError } = useToast()
const { finding, canFind, findIcons } = useFindIcons()

function sample(titles: string[]): string {
  const shown = titles.slice(0, 2).map(title => `“${title}”`).join(', ')
  return titles.length > 2 ? `${shown} and ${titles.length - 2} more` : shown
}

async function onFind() {
  if (!canFind.value || finding.value) {
    playEvent('disabled')
    return
  }
  playEvent('buttonClick')
  const result = await findIcons()
  if (result.error === 'busy') return
  if (result.error && result.applied === 0) {
    showError(result.error, 6000, 'Find icons')
    return
  }
  if (result.applied === 0) {
    showError('No icons matched this card or its track titles.', 6000, 'Find icons')
    return
  }
  if (result.unmatched.length > 0 || result.error) {
    const missed = result.unmatched.length > 0
      ? ` No match for ${sample(result.unmatched)}; click a track's icon to pick one.`
      : ''
    showError(`Applied ${result.applied} ${result.applied === 1 ? 'icon' : 'icons'}.${missed}${result.error ? ` ${result.error}` : ''}`, 8000, 'Find icons')
    return
  }
  const noun = result.applied === 1 ? 'icon' : 'icons'
  showAddedToPlaylist(`${result.applied} ${noun}`, editor?.cardTitle.value.trim() || 'this playlist')
}
</script>

<template>
  <button
    v-if="canFind || finding"
    type="button"
    class="find-icons-button maru-button maru-button--sm bg-maru-yellow-light text-maru-black w-full"
    :disabled="finding"
    @click="onFind"
  >
    <span class="maru-button__label">{{ finding ? 'Finding…' : 'Find icons' }}</span>
  </button>
</template>
