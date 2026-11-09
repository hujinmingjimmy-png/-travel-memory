<template>
  <div class="cinema" aria-label="30 秒电影分镜动态预览">
    <div v-if="previousShot && entering" class="shot-layer" :style="{opacity: String(1 - mix)}">
      <div class="film-gradient" :class="`tone-${previousIndex % 4}`"></div>
      <img v-if="previousUrl" :src="previousUrl" class="film-photo" :style="imageMotion(previousShot, 1)" alt="上一镜头旅行照片" />
      <div class="wash"></div>
      <div class="shot-text">
        <h2 v-if="previousIndex === 0">{{ draft.title }}</h2>
        <p>{{ previousShot.caption }}</p>
      </div>
    </div>
    <div v-if="currentShot" class="shot-layer" :style="{opacity: String(frameOpacity)}">
      <div class="film-gradient" :class="`tone-${activeIndex % 4}`"></div>
      <img v-if="currentUrl" :src="currentUrl" class="film-photo" :style="imageMotion(currentShot, localProgress)" alt="当前镜头旅行照片" @error="onImageError(currentShot.mediaId)" />
      <div class="wash"></div>
      <div class="shot-text">
        <h2 v-if="activeIndex === 0 || activeIndex === draft.shots.length - 1">{{ draft.title }}</h2>
        <p>{{ currentShot.caption }}</p>
      </div>
    </div>
    <div class="film-vignette" aria-hidden="true"></div>
    <div class="film-kicker">TRAVEL MEMORY <span>·</span> CINEMATIC <span>·</span> 16:9</div>
    <div class="film-time">{{ formatTime(playhead) }} <span>/ 00:30</span></div>
    <div v-if="!currentUrl && currentShot && currentShot.mediaId && !loading" class="photo-note">照片无法加载，已使用备用画面</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { createMediaBlobUrl } from '@/api/media'
import type { DirectorDraft, DirectorShot } from '@/api/aiDirector'

const props = defineProps<{ draft: DirectorDraft; travelId: number; playhead: number }>()
const mediaUrls = ref<Record<number, string>>({})
const failedIds = ref<number[]>([])
const loading = ref(false)
let generation = 0
let destroyed = false
// Read authenticated image bytes from Travel Memory. Never expose media paths or credentials.
watch(() => props.draft.shots.map(s => s.mediaId ?? 0).join(','), async () => {
  const epoch = ++generation
  const old = mediaUrls.value
  mediaUrls.value = {}
  failedIds.value = []
  for (const url of Object.values(old)) URL.revokeObjectURL(url)
  const unique = [...new Set(props.draft.shots.map(s => s.mediaId).filter((id): id is number =>
    typeof id === 'number' && Number.isInteger(id) && id > 0))]
  loading.value = unique.length > 0
  // Keep concurrency low; 30-second films have at most 6 distinct media IDs in v2.
  const workers = Array.from({ length: Math.min(2, unique.length) }, async () => {
    while (unique.length && !destroyed && generation === epoch) {
      const id = unique.shift()!
      try {
        const url = await createMediaBlobUrl(props.travelId, id)
        if (destroyed || generation !== epoch) URL.revokeObjectURL(url)
        else mediaUrls.value = { ...mediaUrls.value, [id]: url }
      } catch {
        if (!destroyed && generation === epoch) failedIds.value = [...failedIds.value, id]
      }
    }
  })
  await Promise.all(workers)
  if (!destroyed && generation === epoch) loading.value = false
}, { immediate: true })

onBeforeUnmount(() => {
  destroyed = true
  generation++
  for (const url of Object.values(mediaUrls.value)) URL.revokeObjectURL(url)
  mediaUrls.value = {}
})

const timeMs = computed(() => Math.max(0, Math.min(30000, props.playhead || 0)))
const activeIndex = computed(() => {
  if (timeMs.value >= 30000) return Math.max(0, props.draft.shots.length - 1)
  const n = props.draft.shots.findIndex(s => timeMs.value >= s.startMs && timeMs.value < s.startMs + s.durationMs)
  return n < 0 ? 0 : n
})
const currentShot = computed(() => props.draft.shots[activeIndex.value] ?? null)
const previousIndex = computed(() => activeIndex.value - 1)
const previousShot = computed(() => previousIndex.value >= 0 ? props.draft.shots[previousIndex.value] : null)
const shotElapsed = computed(() => currentShot.value ? Math.max(0, timeMs.value - currentShot.value.startMs) : 0)
const localProgress = computed(() => currentShot.value ? Math.min(1, shotElapsed.value / Math.max(1, currentShot.value.durationMs)) : 0)
const dissolveMs = 450
const entering = computed(() => previousShot.value !== null && shotElapsed.value < dissolveMs)
const mix = computed(() => Math.max(0, Math.min(1, shotElapsed.value / dissolveMs)))
const frameOpacity = computed(() => {
  if (entering.value) return mix.value
  if (activeIndex.value === 0) return Math.min(1, timeMs.value / 500)
  if (timeMs.value > 29500) return Math.max(0, (30000 - timeMs.value) / 500)
  return 1
})
const currentUrl = computed(() => currentShot.value?.mediaId ? mediaUrls.value[currentShot.value.mediaId] : undefined)
const previousUrl = computed(() => previousShot.value?.mediaId ? mediaUrls.value[previousShot.value.mediaId] : undefined)
function formatTime(ms: number) { return `00:${String(Math.floor(ms / 1000)).padStart(2,'0')}` }
function imageMotion(shot: DirectorShot, p: number) {
  const v = Math.max(0, Math.min(1, p))
  let x = 0, scale = 1.06
  switch (shot.motion) {
    case 'SLOW_ZOOM_IN': scale = 1.00 + v * 0.09; break
    case 'SLOW_ZOOM_OUT': scale = 1.10 - v * 0.10; break
    case 'PAN_LEFT': scale = 1.14; x = 3.2 - v * 6.4; break
    case 'PAN_RIGHT': scale = 1.14; x = -3.2 + v * 6.4; break
    case 'CROSSFADE': scale = 1.04 + v * 0.05; break
    case 'STILL': scale = 1.02; break
    default: scale = 1.04
  }
  return { transform: `translate3d(${x}%,0,0) scale(${scale})` }
}
function onImageError(id: number | null) {
  if (!id) return
  const url = mediaUrls.value[id]
  if (!url) return
  const next = { ...mediaUrls.value }
  delete next[id]
  mediaUrls.value = next
  URL.revokeObjectURL(url)
  failedIds.value = [...failedIds.value, id]
}
</script>

<style scoped>
.cinema{aspect-ratio:16/9;position:relative;isolation:isolate;overflow:hidden;border-radius:15px;background:#080c15;color:#fff}
.shot-layer,.film-gradient,.film-photo,.wash,.film-vignette{position:absolute;inset:0;width:100%;height:100%}
.shot-layer{overflow:hidden;will-change:opacity}
.film-gradient{background:radial-gradient(ellipse at 72% 32%,#b17e70 0%,#423c50 38%,#151e32 85%)}
.tone-1{background:radial-gradient(ellipse at 30% 65%,#788d8f,#35445c 52%,#161c2c)}
.tone-2{background:radial-gradient(ellipse at 65% 25%,#af9175,#695263 48%,#252537)}
.tone-3{background:radial-gradient(ellipse at 24% 35%,#747e97,#323c56 52%,#151b30)}
.film-photo{display:block;object-fit:cover;object-position:center;will-change:transform;transition:transform 60ms linear}
.wash{background:linear-gradient(180deg,rgba(5,8,13,.34) 0%,transparent 27%,rgba(5,8,13,.12) 56%,rgba(5,8,13,.76) 100%)}
.film-vignette{pointer-events:none;background:radial-gradient(ellipse at center,transparent 38%,rgba(8,11,22,.34) 100%);z-index:4}
.shot-text{position:absolute;z-index:2;bottom:12%;left:10%;right:10%;text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.95)}
.shot-text h2{font-size:clamp(18px,2.7vw,38px);margin:0 0 14px;letter-spacing:.08em}
.shot-text p{font-size:clamp(13px,1.65vw,23px);line-height:1.6;margin:0}
.film-kicker{position:absolute;z-index:5;left:22px;top:17px;font-size:11px;letter-spacing:.16em;color:rgba(255,255,255,.88)}
.film-kicker span{color:#e4aac1}.film-time{position:absolute;right:20px;bottom:16px;z-index:5;font-size:12px;letter-spacing:.04em}.film-time span{opacity:.64}
.photo-note{position:absolute;z-index:5;left:18px;bottom:14px;color:#f6d1d2;font-size:11px}
@media(max-width:600px){.film-kicker{font-size:9px;left:12px;top:12px}.shot-text{bottom:15%}.shot-text h2{margin-bottom:6px}.film-time{bottom:8px;right:10px}}
</style>
