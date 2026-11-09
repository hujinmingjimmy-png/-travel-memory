<template>
  <span ref="frame" class="journey-art" aria-hidden="true">
    <img
      v-if="source"
      :key="source"
      :src="source"
      :class="{ ready: loaded }"
      alt=""
      decoding="async"
      @load="loaded = true"
      @error="tryNext?.()"
    />
  </span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createMediaBlobUrl, getTravelMediaApi } from '@/api/media'
import { getThemeArtApi } from '@/api/themeArt'

const props = defineProps<{
  travelId: number
  mediaId?: number | null
  directUrl?: string | null
  backgroundUrl?: string | null
  lookupTheme?: boolean
  albumFallback?: boolean
  eager?: boolean
  revision?: number
}>()

const frame = ref<HTMLElement | null>(null)
const visible = ref(false)
const source = ref('')
const loaded = ref(false)
let tryNext: (() => void) | undefined
let observer: IntersectionObserver | undefined

onMounted(() => {
  if (props.eager || !frame.value || !('IntersectionObserver' in window)) {
    visible.value = true
    return
  }
  observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return
    visible.value = true
    observer?.disconnect()
  }, { rootMargin: '320px' })
  observer.observe(frame.value)
})
onBeforeUnmount(() => observer?.disconnect())

watch(() => [
  visible.value, props.travelId, props.mediaId, props.directUrl, props.backgroundUrl,
  props.lookupTheme, props.albumFallback, props.revision
] as const, ([inRange, id, mediaId, directUrl, backgroundUrl, lookup, album], _, cleanup) => {
  let cancelled = false
  let blob = ''
  const seen = new Set<number>()
  source.value = ''
  loaded.value = false
  tryNext = undefined
  cleanup(() => {
    cancelled = true
    if (blob) URL.revokeObjectURL(blob)
  })
  if (!inRange) return

  const media = async (selected: number | null | undefined) => {
    if (cancelled || !selected || seen.has(selected)) return ''
    seen.add(selected)
    try {
      const url = await createMediaBlobUrl(id, selected)
      if (cancelled) {
        URL.revokeObjectURL(url)
        return ''
      }
      blob = url
      return url
    } catch {
      return ''
    }
  }

  async function* candidates() {
    let selected = mediaId
    let background: number | null | undefined
    if (lookup) {
      try {
        const result = await getThemeArtApi(id)
        if (result.code === 200) {
          selected = result.data.coverMediaId
          background = result.data.backgroundMediaId
        }
      } catch { /* Try the other available artwork. */ }
    }
    yield await media(selected)
    for (const url of new Set([directUrl?.trim(), backgroundUrl?.trim()])) {
      if (url && (/^https?:\/\//i.test(url) || url.startsWith('/images/'))) yield url
    }
    yield await media(background)
    if (!cancelled && album) {
      try {
        const result = await getTravelMediaApi(id)
        if (result.code === 200) {
          for (const photo of (result.data || []).slice(0, 3)) yield await media(photo.id)
        }
      } catch { /* Retain the shared photo backdrop. */ }
    }
  }

  const images = candidates()
  async function advance() {
    if (cancelled) return
    if (blob) URL.revokeObjectURL(blob)
    blob = ''
    source.value = ''
    loaded.value = false
    for (let item = await images.next(); !cancelled && !item.done; item = await images.next()) {
      if (item.value) {
        source.value = item.value
        return
      }
    }
  }
  tryNext = () => { void advance() }
  tryNext()
})
</script>

<style scoped>
.journey-art {
  position: absolute;
  inset: 0;
  display: block;
  overflow: hidden;
  background: var(--tm-street) center / cover no-repeat, var(--tm-night);
}
.journey-art img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity .22s ease;
}
.journey-art img.ready { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .journey-art img { transition: none; }
}
</style>
