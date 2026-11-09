<template>
  <section class="cartoon-designer" :class="`theme-${draft.cartoonStyle.toLowerCase()}`">
    <header class="designer-head">
      <div>
        <p class="eyebrow">REAL MAP → CARTOON ATLAS</p>
        <h3>从真实地图取景，生成独立 3D 卡通旅行世界</h3>
        <p>先在真实地图确定范围，再切到「3D 卡通世界」查看独立渲染结果；最终画面不会直接使用高德底图。</p>
      </div>
      <div class="save-area">
        <span v-if="dirty" class="dirty-dot">● 当前区域尚未保存</span>
        <button v-if="editable" class="save-btn" type="button" :disabled="saving || !ready" @click="saveCurrentView">
          {{ saving ? '保存中…' : '保存当前区域' }}
        </button>
      </div>
    </header>

    <div v-if="editable" class="creator-tools">
      <div class="search-box">
        <input v-model.trim="keyword" maxlength="80" placeholder="搜索城市 / 景点，例如：武汉东湖" @keyup.enter="searchPlaces" />
        <button type="button" :disabled="searching || !keyword" @click="searchPlaces">{{ searching ? '搜索中…' : '搜索地点' }}</button>
        <div v-if="searchResults.length" class="search-results">
          <button v-for="place in searchResults" :key="`${place.lng}-${place.lat}-${place.name}`" type="button" @click="flyTo(place)">
            <strong>{{ place.name }}</strong><small>{{ place.address || '点击定位到这里' }}</small>
          </button>
        </div>
      </div>

      <div class="style-choices" aria-label="卡通地图风格">
        <button v-for="style in styles" :key="style.key" type="button"
          :class="{ active: draft.cartoonStyle === style.key }" @click="setStyle(style.key)">
          <span>{{ style.icon }}</span><b>{{ style.name }}</b><small>{{ style.desc }}</small>
        </button>
      </div>

      <div class="camera-tools">
        <label>3D 倾斜 <b>{{ Math.round(draft.pitch) }}°</b><input v-model.number="draft.pitch" type="range" min="0" max="70" step="1" @input="applyCamera" /></label>
        <label>地图旋转 <b>{{ Math.round(draft.rotation) }}°</b><input v-model.number="draft.rotation" type="range" min="-180" max="180" step="1" @input="applyCamera" /></label>
        <button type="button" @click="resetCamera">恢复推荐镜头</button>
      </div>
    </div>

    <p v-if="message" class="message">{{ message }}</p>

    <div class="preview-switch">
      <button type="button" :class="{ active: previewMode === 'SELECT' }" @click="switchPreview('SELECT')">① 真实地图选区</button>
      <button
        type="button"
        :class="{ active: previewMode === 'WORLD' }"
        :disabled="!regionSaved"
        :title="regionSaved ? '查看已经保存的 3D 卡通世界' : '请先在真实地图中选择区域并点击“保存当前区域”'"
        @click="switchPreview('WORLD')"
      >
        ② 3D 卡通世界
      </button>
      <span v-if="regionSaved">已保存取景区域，可以进入 3D 卡通世界。</span>
      <span v-else>请先搜索 / 拖动真实地图，确定范围并保存当前区域。</span>
    </div>

    <div v-if="previewMode === 'SELECT'" class="scene-shell">
      <div class="paper-shadow" aria-hidden="true"></div>
      <div ref="frameElement" class="map-frame">
        <div ref="mapElement" class="amap-host" :class="`map-${draft.cartoonStyle.toLowerCase()}`"></div>
        <div class="map-surface-wash" aria-hidden="true"></div>

        <div v-if="!ready" class="map-loading">
          <span>🗺️</span>
          <strong>{{ mapError || '正在加载真实地图…' }}</strong>
          <small>需要前端 .env.local 中的高德 Key 和安全密钥</small>
        </div>

        <div class="selection-frame" aria-hidden="true">
          <span class="corner tl"></span><span class="corner tr"></span>
          <span class="corner bl"></span><span class="corner br"></span>
          <b>✦ 当前视野就是卡通地图取景范围</b>
        </div>


        <div class="scene-badge">
          <span>3D CARTOON MAP</span>
          <strong>{{ styleName }}</strong>
          <small>{{ realPoints.length }} 个真实地点 · 路线会自动投影到这里</small>
        </div>
      </div>

      <div class="scene-meta">
        <span>中心 {{ centerText }}</span>
        <span>Zoom {{ zoomText }}</span>
        <span>Pitch {{ Math.round(draft.pitch) }}°</span>
        <span>Rotation {{ Math.round(draft.rotation) }}°</span>
      </div>
    </div>

    <CartoonWorld3D
      v-if="previewMode === 'WORLD'"
      :travel-id="travelId"
      :config="worldConfig"
      :points="realPoints"
      :photo-urls="photoUrls"
      :theme="draft.cartoonStyle"
    />

    <div class="usage-tip">
      <b>Phase 2 重构：高德地图只用于“取景”，最终画面不再直接显示高德地图。</b>
      <span>3D 世界由 Three.js 独立生成：真实道路 / 建筑 / 水域优先读取 OSM，失败时自动回退程序化地形；同时加入 Toon 材质、森林、山体、城市群、旅行路线、小车、照片卡、云层、Bloom 和电影镜头。</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { loadTravelAMap } from '@/utils/amap'
import { getRealMapPointsApi, type RealMapPoint } from '@/api/travelRealMap'
import { createMediaBlobUrl } from '@/api/media'
import CartoonWorld3D from '@/components/CartoonWorld3D.vue'
import {
  saveTravelMapSceneApi,
  type CartoonMapStyle,
  type TravelMapSceneConfig
} from '@/api/travelMapScene'

const props = defineProps<{
  travelId: number
  editable: boolean
  config: TravelMapSceneConfig
}>()

const emit = defineEmits<{
  saved: [config: TravelMapSceneConfig]
}>()

type Place = { name: string; address: string; lng: number; lat: number }

const mapElement = ref<HTMLDivElement | null>(null)
const frameElement = ref<HTMLDivElement | null>(null)
const ready = ref(false)
const saving = ref(false)
const searching = ref(false)
const dirty = ref(false)
const mapError = ref('')
const message = ref('')
const keyword = ref('')
const searchResults = ref<Place[]>([])
const realPoints = ref<RealMapPoint[]>([])
const previewMode = ref<'SELECT' | 'WORLD'>('SELECT')
const screenPoints = ref<any[]>([])
const screenDecor = ref<any[]>([])
const screenRoutePath = ref('')
const frameSize = reactive({ width: 1, height: 1 })
const photoUrls = reactive<Record<number, string>>({})

const draft = reactive({
  centerLng: props.config.centerLng ?? 114.3055,
  centerLat: props.config.centerLat ?? 30.5928,
  zoom: props.config.zoom || 11,
  pitch: props.config.pitch ?? 55,
  rotation: props.config.rotation ?? 0,
  cartoonStyle: props.config.cartoonStyle || 'SAKURA' as CartoonMapStyle,
  southWestLng: props.config.southWestLng,
  southWestLat: props.config.southWestLat,
  northEastLng: props.config.northEastLng,
  northEastLat: props.config.northEastLat
})

const styles: Array<{ key: CartoonMapStyle; icon: string; name: string; desc: string }> = [
  { key: 'SAKURA', icon: '🌸', name: '樱花手账', desc: '粉白 · 奶油 · 清甜' },
  { key: 'FRESH', icon: '🌿', name: '清新日系', desc: '薄荷 · 湖蓝 · 轻快' },
  { key: 'PAPER', icon: '📜', name: '旅行纸张', desc: '米白 · 低饱和 · 复古' },
  { key: 'NIGHT', icon: '🌙', name: '夜游城市', desc: '深蓝 · 微光 · 电影感' }
]

const styleName = computed(() => styles.find(s => s.key === draft.cartoonStyle)?.name || '樱花手账')
const centerText = computed(() => `${draft.centerLng.toFixed(4)}, ${draft.centerLat.toFixed(4)}`)
const zoomText = computed(() => Number(draft.zoom).toFixed(1))

function hasValidSavedBounds(config: TravelMapSceneConfig): boolean {
  const swLng = Number(config.southWestLng)
  const swLat = Number(config.southWestLat)
  const neLng = Number(config.northEastLng)
  const neLat = Number(config.northEastLat)
  return [swLng, swLat, neLng, neLat].every(Number.isFinite)
    && neLng > swLng
    && neLat > swLat
}

const regionSaved = ref(hasValidSavedBounds(props.config))
const worldConfig = computed<TravelMapSceneConfig>(() => ({
  travelId: props.travelId,
  sourceType: 'CARTOON_REAL',
  centerLng: draft.centerLng,
  centerLat: draft.centerLat,
  zoom: draft.zoom,
  pitch: draft.pitch,
  rotation: draft.rotation,
  cartoonStyle: draft.cartoonStyle,
  southWestLng: draft.southWestLng ?? null,
  southWestLat: draft.southWestLat ?? null,
  northEastLng: draft.northEastLng ?? null,
  northEastLat: draft.northEastLat ?? null
}))

let AMap: any = null
let map: any = null
let placeSearch: any = null
type DecorAnchor = {
  id: string
  kind: 'tree' | 'building' | 'landmark'
  lng: number
  lat: number
  scale: number
  variant: number
}
let decorAnchors: DecorAnchor[] = []
let projectionRaf = 0
let resizeObserver: ResizeObserver | null = null
let alive = true
let applyingSavedView = false

const styleMap: Record<CartoonMapStyle, string> = {
  SAKURA: 'amap://styles/macaron',
  FRESH: 'amap://styles/fresh',
  PAPER: 'amap://styles/whitesmoke',
  NIGHT: 'amap://styles/darkblue'
}

function assignConfig(config: TravelMapSceneConfig) {
  draft.centerLng = config.centerLng ?? 114.3055
  draft.centerLat = config.centerLat ?? 30.5928
  draft.zoom = config.zoom || 11
  draft.pitch = config.pitch ?? 55
  draft.rotation = config.rotation ?? 0
  draft.cartoonStyle = config.cartoonStyle || 'SAKURA'
  draft.southWestLng = config.southWestLng
  draft.southWestLat = config.southWestLat
  draft.northEastLng = config.northEastLng
  draft.northEastLat = config.northEastLat
}

watch(() => props.config, config => {
  assignConfig(config)
  regionSaved.value = hasValidSavedBounds(config)
  if (map) applySavedView()
}, { deep: true })

function setStyle(style: CartoonMapStyle) {
  draft.cartoonStyle = style
  map?.setMapStyle?.(styleMap[style])
  regenerateDecorAnchors()
  scheduleProjection()
  dirty.value = true
}

function applyCamera() {
  if (!map) return
  map.setPitch?.(Number(draft.pitch))
  map.setRotation?.(Number(draft.rotation))
  scheduleProjection()
  dirty.value = true
}

function resetCamera() {
  draft.pitch = 55
  draft.rotation = 0
  applyCamera()
}

function captureView(markDirty = true) {
  if (!map) return
  const center = map.getCenter?.()
  const bounds = map.getBounds?.()
  const sw = bounds?.getSouthWest?.()
  const ne = bounds?.getNorthEast?.()

  const lng = Number(center?.getLng?.())
  const lat = Number(center?.getLat?.())
  if (Number.isFinite(lng)) draft.centerLng = lng
  if (Number.isFinite(lat)) draft.centerLat = lat

  const zoom = Number(map.getZoom?.())
  const pitch = Number(map.getPitch?.())
  const rotation = Number(map.getRotation?.())
  if (Number.isFinite(zoom)) draft.zoom = zoom
  if (Number.isFinite(pitch)) draft.pitch = pitch
  if (Number.isFinite(rotation)) draft.rotation = rotation

  const swLng = Number(sw?.getLng?.()), swLat = Number(sw?.getLat?.())
  const neLng = Number(ne?.getLng?.()), neLat = Number(ne?.getLat?.())
  draft.southWestLng = Number.isFinite(swLng) ? swLng : null
  draft.southWestLat = Number.isFinite(swLat) ? swLat : null
  draft.northEastLng = Number.isFinite(neLng) ? neLng : null
  draft.northEastLat = Number.isFinite(neLat) ? neLat : null

  if (markDirty && !applyingSavedView) regenerateDecorAnchors()
  scheduleProjection()
  if (markDirty && !applyingSavedView) dirty.value = true
}

function applySavedView() {
  if (!map) return
  applyingSavedView = true
  map.setMapStyle?.(styleMap[draft.cartoonStyle])
  map.setZoomAndCenter?.(draft.zoom, [draft.centerLng, draft.centerLat], false)
  map.setPitch?.(draft.pitch)
  map.setRotation?.(draft.rotation)
  window.setTimeout(() => {
    captureView(false)
    regenerateDecorAnchors()
    scheduleProjection()
    dirty.value = false
    applyingSavedView = false
  }, 80)
}

function numberFromPixel(pixel: any, key: 'x' | 'y'): number {
  const getter = key === 'x' ? pixel?.getX : pixel?.getY
  const direct = Number(pixel?.[key])
  if (Number.isFinite(direct)) return direct
  const fromGetter = Number(typeof getter === 'function' ? getter.call(pixel) : NaN)
  return Number.isFinite(fromGetter) ? fromGetter : 0
}

function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

function currentBoundsNumbers() {
  const bounds = map?.getBounds?.()
  const sw = bounds?.getSouthWest?.()
  const ne = bounds?.getNorthEast?.()
  const swLng = Number(sw?.getLng?.())
  const swLat = Number(sw?.getLat?.())
  const neLng = Number(ne?.getLng?.())
  const neLat = Number(ne?.getLat?.())
  if (![swLng, swLat, neLng, neLat].every(Number.isFinite)) return null
  return { swLng, swLat, neLng, neLat }
}

function regenerateDecorAnchors() {
  const bounds = currentBoundsNumbers()
  if (!bounds) return
  const random = seededRandom(Math.abs(Math.trunc(props.travelId * 9176 + bounds.swLng * 1000 + bounds.neLat * 1000)))
  const next: DecorAnchor[] = []
  const count = Math.max(18, Math.min(34, 20 + realPoints.value.length * 2))
  for (let i = 0; i < count; i += 1) {
    const edgeBias = i % 4 === 0
    const rx = edgeBias ? (random() < .5 ? random() * .22 : .78 + random() * .22) : .08 + random() * .84
    const ry = edgeBias ? .08 + random() * .84 : .1 + random() * .8
    const kind: DecorAnchor['kind'] = i % 7 === 0 ? 'landmark' : i % 3 === 0 ? 'building' : 'tree'
    next.push({
      id: `decor-${i}`,
      kind,
      lng: bounds.swLng + (bounds.neLng - bounds.swLng) * rx,
      lat: bounds.swLat + (bounds.neLat - bounds.swLat) * ry,
      scale: kind === 'tree' ? .72 + random() * .55 : .68 + random() * .48,
      variant: Math.floor(random() * 3)
    })
  }
  decorAnchors = next
}

function smoothSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return ''
  const first = points[0]!
  let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p0 = points[i - 1] ?? p1
    const p3 = points[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

function projectLngLat(lng: number, lat: number) {
  if (!map) return { x: 0, y: 0 }
  const pixel = map.lngLatToContainer?.([lng, lat])
  return { x: numberFromPixel(pixel, 'x'), y: numberFromPixel(pixel, 'y') }
}

function updateProjection() {
  projectionRaf = 0
  if (!map || !frameElement.value) return
  const rect = frameElement.value.getBoundingClientRect()
  frameSize.width = Math.max(1, rect.width)
  frameSize.height = Math.max(1, rect.height)

  const ordered = [...realPoints.value].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  screenPoints.value = ordered.map(point => {
    const pixel = projectLngLat(point.longitude, point.latitude)
    return {
      id: point.id,
      mediaId: point.mediaId,
      title: point.title,
      locationName: point.locationName,
      x: pixel.x,
      y: pixel.y
    }
  })
  screenRoutePath.value = smoothSvgPath(screenPoints.value)
  screenDecor.value = decorAnchors.map(item => {
    const pixel = projectLngLat(item.lng, item.lat)
    return { id: item.id, kind: item.kind, x: pixel.x, y: pixel.y, scale: item.scale, variant: item.variant }
  })
}

function scheduleProjection() {
  if (projectionRaf) return
  projectionRaf = window.requestAnimationFrame(updateProjection)
}

async function loadPointPhotos() {
  const mediaIds = [...new Set(realPoints.value.map(point => point.mediaId).filter((id): id is number => id != null))].slice(0, 6)
  await Promise.all(mediaIds.map(async mediaId => {
    if (photoUrls[mediaId]) return
    try {
      photoUrls[mediaId] = await createMediaBlobUrl(props.travelId, mediaId)
    } catch (error) {
      console.debug('卡通地图照片预览读取失败：', error)
    }
  }))
}

function releasePointPhotos() {
  for (const [id, url] of Object.entries(photoUrls)) {
    URL.revokeObjectURL(url)
    delete photoUrls[Number(id)]
  }
}

async function loadPoints() {
  try {
    const result = await getRealMapPointsApi(props.travelId)
    if (result.code === 200) {
      realPoints.value = result.data || []
      regenerateDecorAnchors()
      scheduleProjection()
      await loadPointPhotos()
    }
  } catch {
    realPoints.value = []
  }
}

async function searchPlaces() {
  if (!placeSearch || !keyword.value || searching.value) return
  searching.value = true
  message.value = ''
  searchResults.value = []
  try {
    await new Promise<void>((resolve, reject) => {
      placeSearch.search(keyword.value, (status: string, result: any) => {
        if (status !== 'complete') {
          reject(new Error('没有找到地点，请试试“城市 + 景点”的完整名称'))
          return
        }
        const pois: any[] = result?.poiList?.pois || []
        searchResults.value = pois.flatMap(p => {
          const lng = Number(p.location?.getLng?.())
          const lat = Number(p.location?.getLat?.())
          return Number.isFinite(lng) && Number.isFinite(lat)
            ? [{ name: String(p.name || '未知地点'), address: String(p.address || ''), lng, lat }]
            : []
        }).slice(0, 6)
        resolve()
      })
    })
  } catch (error) {
    message.value = error instanceof Error ? error.message : '地点搜索失败'
  } finally {
    searching.value = false
  }
}

function flyTo(place: Place) {
  map?.setZoomAndCenter?.(14, [place.lng, place.lat], false)
  searchResults.value = []
  scheduleProjection()
  dirty.value = true
}

async function switchPreview(mode: 'SELECT' | 'WORLD') {
  if (mode === 'WORLD') {
    if (!regionSaved.value) {
      message.value = '请先在真实地图中搜索 / 拖动到想要的区域，然后点击“保存当前区域”。'
      previewMode.value = 'SELECT'
      await nextTick()
      if (!map) await initMap()
      return
    }

    // 离开选区前先把当前镜头写回 draft，然后销毁 AMap。
    // 不让高德地图长期藏在 display:none 容器里，避免再次切回来出现空白。
    if (map) captureView(false)
    destroyMapInstance()
    previewMode.value = 'WORLD'
    return
  }

  if (previewMode.value === 'SELECT' && map) {
    map.resize?.()
    return
  }

  previewMode.value = 'SELECT'
  await nextTick()
  await initMap()
}

async function saveCurrentView() {
  if (!props.editable || !ready.value || saving.value) return
  captureView(false)
  saving.value = true
  message.value = ''
  try {
    const result = await saveTravelMapSceneApi(props.travelId, {
      sourceType: 'CARTOON_REAL',
      centerLng: Number(draft.centerLng.toFixed(6)),
      centerLat: Number(draft.centerLat.toFixed(6)),
      zoom: Number(Number(draft.zoom).toFixed(2)),
      pitch: Number(Number(draft.pitch).toFixed(2)),
      rotation: Number(Number(draft.rotation).toFixed(2)),
      cartoonStyle: draft.cartoonStyle,
      southWestLng: draft.southWestLng == null ? null : Number(draft.southWestLng.toFixed(6)),
      southWestLat: draft.southWestLat == null ? null : Number(draft.southWestLat.toFixed(6)),
      northEastLng: draft.northEastLng == null ? null : Number(draft.northEastLng.toFixed(6)),
      northEastLat: draft.northEastLat == null ? null : Number(draft.northEastLat.toFixed(6))
    })
    if (result.code !== 200) throw new Error(result.message || '地图场景保存失败')
    regenerateDecorAnchors()
    scheduleProjection()
    regionSaved.value = true
    dirty.value = false
    message.value = '✿ 当前真实地图区域已保存。现在可以进入「② 3D 卡通世界」。'
    emit('saved', result.data)
  } catch (error) {
    message.value = error instanceof Error ? error.message : '地图场景保存失败'
  } finally {
    saving.value = false
  }
}

function destroyMapInstance() {
  if (projectionRaf) {
    window.cancelAnimationFrame(projectionRaf)
    projectionRaf = 0
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  try {
    map?.destroy?.()
  } catch (error) {
    console.debug('高德地图销毁失败：', error)
  }
  map = null
  placeSearch = null
  ready.value = false
}

async function initMap() {
  if (!mapElement.value) return
  // 每次重新进入“真实地图选区”都创建一个新的 AMap 实例。
  // 这样可以彻底避免地图曾经处于 display:none / 被 Three.js 页面替换后出现白屏。
  destroyMapInstance()
  try {
    AMap = await loadTravelAMap()
    if (!alive || !mapElement.value) return
    map = new AMap.Map(mapElement.value, {
      center: [draft.centerLng, draft.centerLat],
      zoom: draft.zoom,
      pitch: draft.pitch,
      rotation: draft.rotation,
      viewMode: '3D',
      mapStyle: styleMap[draft.cartoonStyle],
      scrollWheel: props.editable,
      dragEnable: props.editable,
      zoomEnable: props.editable,
      rotateEnable: props.editable,
      pitchEnable: props.editable,
      showBuildingBlock: false,
      showLabel: false,
      features: ['bg', 'road']
    })
    if (props.editable) {
      map.addControl(new AMap.ToolBar({ position: 'RB', liteStyle: true }))
      map.addControl(new AMap.Scale({ position: 'LB' }))
    }
    placeSearch = new AMap.PlaceSearch({ city: '全国', pageSize: 6, panel: false, autoFitView: false })
    map.on('mapmove', scheduleProjection)
    map.on('zoomchange', scheduleProjection)
    map.on('rotatechange', scheduleProjection)
    map.on('pitchchange', scheduleProjection)
    map.on('moveend', () => captureView())
    map.on('zoomend', () => captureView())
    map.on('rotateend', () => captureView())
    map.on('pitchend', () => captureView())
    ready.value = true
    await nextTick()
    regenerateDecorAnchors()
    applySavedView()
    scheduleProjection()
    if (frameElement.value) {
      resizeObserver = new ResizeObserver(scheduleProjection)
      resizeObserver.observe(frameElement.value)
    }
  } catch (error) {
    mapError.value = error instanceof Error ? error.message : '高德地图加载失败'
  }
}

onMounted(async () => {
  // 初始一定从真实地图选区开始。
  previewMode.value = 'SELECT'
  await nextTick()
  await initMap()
  await loadPoints()
})

onBeforeUnmount(() => {
  alive = false
  destroyMapInstance()
  releasePointPhotos()
  AMap = null
})
</script>

<style scoped>
.cartoon-designer{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.9);border-radius:25px;padding:17px;background:linear-gradient(145deg,rgba(255,252,254,.94),rgba(255,232,242,.82));box-shadow:0 20px 50px rgba(185,100,139,.14);color:#75405b}
.designer-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:14px}.designer-head h3{margin:5px 0 6px;font-size:21px}.designer-head p:last-child{margin:0;color:#a4778d;font-size:12px;line-height:1.7}.eyebrow{margin:0;font-size:9px;letter-spacing:.15em;color:#c8799e;font-weight:850}.save-area{display:grid;justify-items:end;gap:7px;flex:none}.dirty-dot{font-size:10px;color:#d06f9a}.save-btn,.creator-tools button{border:0;cursor:pointer;font:inherit}.save-btn{padding:11px 15px;border-radius:13px;color:#78415c;font-size:12px;font-weight:850;background:linear-gradient(120deg,#ffc4dc,#fff0be);box-shadow:0 9px 22px rgba(207,101,151,.16)}.save-btn:disabled{opacity:.55;cursor:not-allowed}
.creator-tools{display:grid;gap:12px;margin-bottom:14px}.search-box{position:relative;display:flex;gap:8px}.search-box input{min-width:0;flex:1;border:1px solid #f0c8d9;border-radius:13px;padding:10px 12px;background:#fff;color:#74415a;outline:none}.search-box>button,.camera-tools button{padding:0 14px;border-radius:13px;background:#fff;color:#8f5671;font-weight:750}.search-results{position:absolute;z-index:60;top:46px;left:0;width:min(520px,calc(100% - 110px));display:grid;padding:7px;border-radius:15px;background:#fff;box-shadow:0 18px 45px rgba(92,49,71,.2)}.search-results button{display:grid;gap:3px;text-align:left;padding:10px;border-radius:10px;background:transparent;color:#814862}.search-results button:hover{background:#fff0f6}.search-results small{color:#ad8095}
.style-choices{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.style-choices button{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:8px;text-align:left;padding:10px;border:1px solid rgba(238,177,204,.5);border-radius:14px;background:rgba(255,255,255,.68);color:#8a5270}.style-choices button>span{grid-row:1/3;align-self:center;font-size:22px}.style-choices b{font-size:11px}.style-choices small{font-size:9px;color:#ad8095}.style-choices button.active{border-color:#eb9fc0;background:#ffe6f1;box-shadow:0 0 0 3px rgba(255,207,226,.42)}
.camera-tools{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:center;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.56)}.camera-tools label{display:grid;grid-template-columns:auto auto;gap:4px 8px;font-size:10px;color:#93617a}.camera-tools label b{text-align:right}.camera-tools input{grid-column:1/3;width:100%;accent-color:#e97aaa}.camera-tools button{min-height:36px;border:1px solid #f3ccdc}
.message{margin:0 0 12px;padding:9px 12px;border-radius:12px;background:#fff2f7;color:#985a77;font-size:11px}.scene-shell{perspective:1400px}.paper-shadow{height:14px;margin:0 5% -2px;border-radius:50%;background:rgba(91,51,71,.16);filter:blur(10px)}.map-frame{position:relative;height:560px;overflow:hidden;border:7px solid #fff;border-radius:25px;background:#e9edf0;box-shadow:0 28px 55px rgba(77,45,60,.24);transform:rotateX(2deg);transform-origin:center bottom;isolation:isolate}.amap-host{position:absolute;inset:0;filter:saturate(.78) contrast(.92) brightness(1.05)}.map-sakura{filter:saturate(.68) sepia(.06) hue-rotate(320deg) brightness(1.08)}.map-fresh{filter:saturate(.78) hue-rotate(350deg) brightness(1.04)}.map-paper{filter:saturate(.38) sepia(.13) contrast(.9) brightness(1.08)}.map-night{filter:saturate(.8) contrast(1.07) brightness(.82)}
.map-surface-wash{position:absolute;z-index:12;inset:0;pointer-events:none;background:linear-gradient(135deg,rgba(255,247,241,.18),rgba(255,219,231,.08));mix-blend-mode:screen}.theme-fresh .map-surface-wash{background:linear-gradient(135deg,rgba(235,255,247,.12),rgba(196,234,226,.08))}.theme-paper .map-surface-wash{background:rgba(248,232,203,.15);mix-blend-mode:multiply}.theme-night .map-surface-wash{background:linear-gradient(135deg,rgba(57,70,112,.12),rgba(26,28,55,.12));mix-blend-mode:soft-light}
.map-loading{position:absolute;z-index:50;inset:0;display:grid;place-content:center;gap:8px;text-align:center;padding:20px;color:#81506a;background:linear-gradient(135deg,#ffe1ed,#e6f0e9)}.map-loading span{font-size:45px}.map-loading small{font-size:10px;color:#a87b90}.selection-frame{position:absolute;z-index:20;inset:9%;pointer-events:none;border:1px dashed rgba(255,255,255,.86);box-shadow:inset 0 0 0 1px rgba(124,78,102,.15)}.selection-frame b{position:absolute;top:-25px;left:0;padding:5px 9px;border-radius:999px;color:#7a455e;background:rgba(255,255,255,.88);font-size:9px}.corner{position:absolute;width:22px;height:22px;border-color:#fff}.tl{left:-2px;top:-2px;border-left:3px solid;border-top:3px solid}.tr{right:-2px;top:-2px;border-right:3px solid;border-top:3px solid}.bl{left:-2px;bottom:-2px;border-left:3px solid;border-bottom:3px solid}.br{right:-2px;bottom:-2px;border-right:3px solid;border-bottom:3px solid}
.scene-badge{position:absolute;z-index:23;left:18px;bottom:18px;display:grid;gap:2px;padding:10px 13px;border:1px solid rgba(255,255,255,.88);border-radius:15px;background:rgba(255,252,254,.82);backdrop-filter:blur(10px);color:#7b4862;box-shadow:0 10px 24px rgba(87,45,66,.14)}.theme-night .scene-badge{background:rgba(31,37,65,.72);color:#ffe7f1}.scene-badge span{font-size:8px;letter-spacing:.15em}.scene-badge strong{font-size:13px}.scene-badge small{font-size:9px;opacity:.72}.scene-meta{display:flex;gap:9px;flex-wrap:wrap;margin-top:10px}.scene-meta span{padding:6px 9px;border-radius:999px;background:#fff8fb;color:#a36f88;font-size:9px}.usage-tip{display:grid;gap:4px;margin-top:14px;padding:12px 14px;border-radius:15px;background:rgba(255,255,255,.55);font-size:11px;color:#9a6881;line-height:1.6}.usage-tip b{color:#7d4862}
:deep(.cartoon-real-pin){display:flex;align-items:center;gap:5px;white-space:nowrap;filter:drop-shadow(0 6px 8px rgba(88,42,65,.2))}:deep(.cartoon-real-pin__bubble){width:30px;height:30px;display:grid;place-items:center;border:3px solid #fff;border-radius:50% 50% 50% 10%;transform:rotate(-45deg);background:#f48bb7;color:#fff;font-size:10px;font-weight:900}:deep(.cartoon-real-pin__bubble){line-height:1}:deep(.cartoon-real-pin__label){max-width:130px;overflow:hidden;text-overflow:ellipsis;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.9);color:#80455f;font-size:9px;font-weight:800}
.preview-switch{display:flex;align-items:center;gap:7px;margin:2px 0 12px;padding:7px;border:1px solid rgba(238,177,204,.5);border-radius:14px;background:rgba(255,255,255,.58)}.preview-switch button{border:1px solid transparent;border-radius:11px;padding:8px 11px;background:rgba(255,255,255,.72);color:#8d5871;font-size:10px;font-weight:850;cursor:pointer}.preview-switch button.active{border-color:#eea3c3;background:linear-gradient(120deg,#ffe2ef,#fff3d5);box-shadow:0 6px 16px rgba(195,99,143,.12)}.preview-switch button:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}.preview-switch span{margin-left:auto;color:#a77a8f;font-size:9px}
@media(max-width:850px){.designer-head{flex-direction:column}.save-area{justify-items:start}.style-choices{grid-template-columns:1fr 1fr}.camera-tools{grid-template-columns:1fr}.map-frame{height:470px}.search-results{width:100%}}@media(max-width:520px){.cartoon-designer{padding:10px}.style-choices{grid-template-columns:1fr}.search-box{flex-wrap:wrap}.search-box>button{min-height:38px}.map-frame{height:420px;border-width:4px}.camera-tools{padding:8px}.cloud{font-size:48px}}
</style>
