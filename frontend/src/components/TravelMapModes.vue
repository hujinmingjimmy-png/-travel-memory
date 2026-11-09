<template>
  <section class="travel-map-modes">
    <!-- ★★★★★【双场景玻璃拨片】★★★★★：放在地图内部，不改变三大模式主导航 -->
    <div class="scene-head">
      <div class="scene-brand"><span class="petal" aria-hidden="true">⌖</span><div><small>Memory Atlas / 足迹索引</small><strong>同一段旅程的两种地图</strong></div></div>
      <div class="segmented" role="group" aria-label="地图类型">
        <span class="segmented-active" :class="{ right: scene === 'real' }"></span>
        <button type="button" :aria-pressed="scene === 'journal'" :class="{ active: scene === 'journal' }" @click="choose('journal')">▧ 手账地图</button>
        <button type="button" :aria-pressed="scene === 'real'" :class="{ active: scene === 'real' }" @click="choose('real')">⌖ 真实地图 + 3D</button>
      </div>
    </div>
    <Transition name="fade" mode="out-in">
      <TravelMapEditor v-if="scene === 'journal'" :key="`journal-${travelId}`" :travel-id="travelId" :editable="editable" :focus-point-id="journalFocusId" />
      <TravelRealMapEditor v-else :key="`real-${travelId}`" :travel-id="travelId" :editable="editable" :focus-point-id="realFocusId" />
    </Transition>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import TravelMapEditor from '@/components/TravelMapEditor.vue'
import TravelRealMapEditor from '@/components/TravelRealMapEditor.vue'
// PHASE9_STORY_FOCUS · 故事时间线点击「地图定位」时切换对应地图
const props = defineProps<{
  travelId: number
  editable: boolean
  focusPoint?: {
    pointId: number
    pointType: 'CUSTOM' | 'REAL'
  } | null
}>()

const realFocusId = computed(() =>
  props.focusPoint?.pointType === 'REAL'
    ? props.focusPoint.pointId
    : null
)

const journalFocusId = computed(() =>
  props.focusPoint?.pointType === 'CUSTOM'
    ? props.focusPoint.pointId
    : null
)
type Scene = 'journal' | 'real'
const key = () => {
  let user = 'guest'
  try { user = String(JSON.parse(localStorage.getItem('travel_user') || '{}').id || 'guest') } catch { /* no session */ }
  return `travel_scene_v2_${user}_${props.travelId}`
}
function read(): Scene {
  try { const stored=localStorage.getItem(key()) ?? localStorage.getItem(`travel_scene_${props.travelId}`);return stored === 'journal' ? 'journal' : 'real' }
  catch { return 'real' }
}
const scene = ref<Scene>(read())
function choose(next: Scene) { scene.value = next; try { localStorage.setItem(key(), next) } catch { /* ignore */ } }
watch(() => props.travelId, () => {
  scene.value = read()
})

watch(
  () => props.focusPoint,
  point => {
    if (point) {
      // Story location is temporary navigation; do not overwrite a manually saved choice.
      scene.value = point.pointType === 'REAL' ? 'real' : 'journal'
    }
  },
  { immediate: true }
)
</script>
<style scoped>
.travel-map-modes{min-width:0;margin-top:12px}
.scene-head{padding:12px 16px;margin-bottom:12px;border:1px solid #4a6557;border-radius:4px;background:var(--tm-night);display:flex;align-items:center;justify-content:space-between;gap:12px}
.scene-brand{display:flex;align-items:center;gap:11px;color:var(--tm-sheet)}
.scene-brand small{display:block;color:var(--tm-rose);font:600 .7rem/1.6 var(--tm-index);letter-spacing:.08em}
.scene-brand strong{font-size:.88rem}
.petal{width:35px;height:35px;display:grid;place-items:center;border:1px solid #9cb2a3;border-radius:50%;font-size:1.25rem}
.segmented{display:grid;grid-template-columns:1fr 1fr;position:relative;flex:none;padding:4px;border:1px solid #63806f;background:#233a30;border-radius:5px}
.segmented-active{position:absolute;top:4px;bottom:4px;left:4px;width:calc((100% - 8px) / 2);background:var(--tm-sheet);border-radius:3px;transition:transform .22s ease}
.segmented-active.right{transform:translateX(100%)}
.segmented button{position:relative;min-height:42px;border:0;background:transparent;padding:7px 13px;color:var(--tm-sheet);cursor:pointer;font-size:.83rem}
.segmented button.active{color:var(--tm-night);font-weight:800}
.fade-enter-active,.fade-leave-active{transition:opacity .16s,transform .16s}.fade-enter-from,.fade-leave-to{opacity:0;transform:translateY(5px)}
@media(max-width:680px){.scene-head{align-items:stretch;flex-direction:column;padding:12px}}
@media(prefers-reduced-motion:reduce){.fade-enter-active,.fade-leave-active,.segmented-active{transition:none}}
</style>
