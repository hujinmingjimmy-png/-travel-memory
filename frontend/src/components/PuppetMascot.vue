<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{
  speed?: number
  intensity?: number
  width?: number
  storageKey?: string
}>(), {
  speed: 1,
  intensity: 1,
  width: 235,
  storageKey: 'travel_me_puppet_position'
})

const widgetRef = ref<HTMLElement | null>(null)
const paused = ref(false)
const dragging = ref(false)
const x = ref(20)
const y = ref(150)

let pointerStartX = 0
let pointerStartY = 0
let widgetStartX = 0
let widgetStartY = 0
let moved = false

const widgetStyle = computed(() => ({
  left: `${x.value}px`,
  top: `${y.value}px`,
  '--mascot-width': `${props.width}px`,
  '--duration': `${3.8 / Math.max(.2, props.speed)}s`,
  '--amount': Math.max(0, Math.min(2, props.intensity))
}))

const clampPosition = () => {
  const el = widgetRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  x.value = Math.min(Math.max(8, x.value), Math.max(8, window.innerWidth - rect.width - 8))
  y.value = Math.min(Math.max(8, y.value), Math.max(8, window.innerHeight - rect.height - 8))
}

const savePosition = () => {
  localStorage.setItem(props.storageKey, JSON.stringify({ x: x.value, y: y.value }))
}

const loadPosition = async () => {
  await nextTick()
  try {
    const raw = localStorage.getItem(props.storageKey)
    if (raw) {
      const saved = JSON.parse(raw)
      if (typeof saved.x === 'number' && typeof saved.y === 'number') {
        x.value = saved.x
        y.value = saved.y
        clampPosition()
        return
      }
    }
  } catch (e) {
    console.warn('读取吉祥物位置失败', e)
  }
  const width = widgetRef.value?.getBoundingClientRect().width ?? props.width
  x.value = Math.max(20, window.innerWidth - width - 38)
  y.value = 150
  clampPosition()
}

const pointerDown = (e: PointerEvent) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const el = widgetRef.value
  if (!el) return
  dragging.value = true
  moved = false
  pointerStartX = e.clientX
  pointerStartY = e.clientY
  widgetStartX = x.value
  widgetStartY = y.value
  el.setPointerCapture(e.pointerId)
  e.preventDefault()
}

const pointerMove = (e: PointerEvent) => {
  if (!dragging.value) return
  const dx = e.clientX - pointerStartX
  const dy = e.clientY - pointerStartY
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true
  x.value = widgetStartX + dx
  y.value = widgetStartY + dy
  clampPosition()
  e.preventDefault()
}

const pointerUp = (e: PointerEvent) => {
  if (!dragging.value) return
  const el = widgetRef.value
  if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  dragging.value = false
  if (moved) savePosition()
  else paused.value = !paused.value
}

const pointerCancel = (e: PointerEvent) => {
  dragging.value = false
  const el = widgetRef.value
  if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
}

const onResize = () => {
  clampPosition()
  savePosition()
}

onMounted(async () => {
  await loadPosition()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => window.removeEventListener('resize', onResize))
</script>

<template>
  <div
    ref="widgetRef"
    class="puppet-widget"
    :class="{ paused, dragging }"
    :style="widgetStyle"
    title="拖动移动位置 · 点击暂停/继续"
    @pointerdown="pointerDown"
    @pointermove="pointerMove"
    @pointerup="pointerUp"
    @pointercancel="pointerCancel"
  >
    <div class="frame">
      <!-- ★★★★★【素材路径】★★★★★ public/anya/background.png -->
      <img class="water" src="/anya/background.png" alt="" draggable="false" @dragstart.prevent />
      <div class="ripple"></div>
      <div class="person">
        <!-- ★★★★★【素材路径】★★★★★ public/anya/character.png -->
        <img class="part torso" src="/anya/character.png" alt="" draggable="false" @dragstart.prevent />
        <img class="part arm left" src="/anya/character.png" alt="" draggable="false" @dragstart.prevent />
        <img class="part arm right" src="/anya/character.png" alt="" draggable="false" @dragstart.prevent />
        <img class="part head" src="/anya/character.png" alt="旅行吉祥物" draggable="false" @dragstart.prevent />
      </div>
      <span class="hint">{{ dragging ? '移动中…' : paused ? '已暂停 · 点击继续' : '拖动我 · 点击暂停' }}</span>
    </div>
  </div>
</template>

<style scoped>
.puppet-widget {
  position: fixed;
  z-index: 18;
  width: min(var(--mascot-width), 42vw);
  user-select: none;
  touch-action: none;
  cursor: grab;
  filter: drop-shadow(0 18px 32px rgba(171,86,127,.22));
}
.puppet-widget.dragging { cursor: grabbing; filter: drop-shadow(0 24px 40px rgba(211,110,157,.34)); }
.frame { position:relative; width:100%; aspect-ratio:1188/1324; overflow:hidden; border:2px solid rgba(255,255,255,.8); border-radius:24px; isolation:isolate; background:#c9efff; box-shadow:0 16px 46px rgba(103,153,181,.21),0 0 0 5px rgba(255,203,222,.11); }
.water,.part { position:absolute; inset:0; width:100%; height:100%; object-fit:fill; user-select:none; pointer-events:none; }
.water { z-index:0; }
.ripple { position:absolute; z-index:1; left:39%; top:73%; width:25%; height:10%; border:2px solid #ddfaff66; border-radius:50%; filter:blur(2px); animation:ripple calc(var(--duration)*1.3) ease-out infinite; }
.person { position:absolute; z-index:2; inset:0; animation:float var(--duration) ease-in-out infinite; }
.torso { clip-path:polygon(40% 40%,61% 40%,72% 53%,77% 69%,69% 82%,60% 83%,61% 100%,41% 100%,42% 83%,29% 75%,30% 61%); z-index:1; }
.arm { z-index:2; }
.left { clip-path:polygon(38% 48%,44% 49%,40% 58%,33% 66%,21% 73%,20% 79%,29% 78%,40% 65%,44% 58%); transform-origin:39% 53%; animation:leftArm var(--duration) ease-in-out infinite; }
.right { clip-path:polygon(60% 48%,69% 48%,73% 57%,81% 64%,90% 69%,89% 74%,81% 72%,68% 63%,63% 58%); transform-origin:66% 54%; animation:rightArm var(--duration) ease-in-out infinite; }
.head { z-index:3; clip-path:polygon(39% 0%,76% 0%,88% 12%,88% 31%,81% 45%,73% 52%,62% 48%,54% 44%,45% 49%,34% 43%,24% 28%,17% 19%,18% 10%); transform-origin:52% 44%; animation:headTilt var(--duration) ease-in-out infinite; }
.hint { position:absolute; z-index:5; right:10px; bottom:10px; padding:5px 9px; border-radius:999px; color:white; font-size:10px; background:#644c6b70; backdrop-filter:blur(8px); pointer-events:none; opacity:0; transition:.2s ease; }
.puppet-widget:hover .hint,.puppet-widget.dragging .hint { opacity:1; }
.paused .frame * { animation-play-state:paused!important; }
@keyframes float { 50% { transform:translateY(calc(-.6% * var(--amount))); } }
@keyframes headTilt { 0%,100% { transform:rotate(calc(-.8deg * var(--amount))); } 50% { transform:rotate(calc(1deg * var(--amount))); } }
@keyframes leftArm { 50% { transform:rotate(calc(-2deg * var(--amount))); } }
@keyframes rightArm { 50% { transform:rotate(calc(2deg * var(--amount))); } }
@keyframes ripple { 0% { transform:scale(.5);opacity:0 } 35% { opacity:1 } 100% { transform:scale(1.7);opacity:0 } }
@media (max-width:760px) { .puppet-widget { width:min(var(--mascot-width),38vw); } .hint { display:none; } }
@media (prefers-reduced-motion:reduce) { .frame * { animation:none!important; } }
</style>
