<template>
  <div class="cinema-map">
    <div ref="host" class="map-host"></div>
    <small v-if="error">{{ error }} · 继续播放旅行照片</small>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadTravelAMap } from '@/utils/amap'

const props = defineProps<{
  longitude: number | null
  latitude: number | null
  duration: number
}>()

const host = ref<HTMLElement | null>(null)
const error = ref('')
let map: any = null
let marker: any = null
let alive = true

function move() {
  if (!map || !marker || props.longitude == null || props.latitude == null) return
  const center = [props.longitude, props.latitude]
  marker.setPosition(center)
  map.setZoomAndCenter(13, center, false, Math.max(300, props.duration))
}

onMounted(async () => {
  try {
    const AMap = await loadTravelAMap()
    if (!alive || !host.value) return

    map = new AMap.Map(host.value, {
      zoom: 5,
      center: [105, 35],
      viewMode: '2D',
      mapStyle: 'amap://styles/normal',
      dragEnable: false,
      scrollWheel: false,
      doubleClickZoom: false,
      keyboardEnable: false
    })

    marker = new AMap.Marker({ zIndex: 200 })
    map.add(marker)
    move()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '地图加载失败'
  }
})

watch(
  () => [props.longitude, props.latitude, props.duration],
  () => move()
)

onBeforeUnmount(() => {
  alive = false
  marker?.setMap?.(null)
  marker = null
  map?.destroy?.()
  map = null
})
</script>

<style scoped>
.cinema-map {
  position: absolute;
  inset: 0;
  opacity: .72;
  overflow: hidden;
}
.map-host {
  width: 100%;
  height: 100%;
}
small {
  position: absolute;
  left: 16px;
  top: 16px;
  padding: 8px 10px;
  border-radius: 12px;
  color: #fff;
  background: rgba(117,69,99,.86);
  backdrop-filter: blur(10px);
}
</style>
