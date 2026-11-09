<template>
  <section class="world3d-shell" :class="`world3d-${theme.toLowerCase()}`">
    <div class="world3d-toolbar">
      <div class="world3d-title">
        <p>THREE.JS TRAVEL WORLD</p>
        <strong>{{ visualMode === 'CINEMA' ? '电影视觉实验室 · 真实地理世界' : '真实地理驱动的 3D 旅行世界' }}</strong>
        <small :class="{ warning: dataSource === 'PROCEDURAL' }">{{ sourceMessage }}</small>
      </div>
      <div class="world3d-meta" v-if="qualityProfile">
        <b>{{ qualityProfile.label }}</b>
        <span>{{ selectionSize }}</span>
        <small>{{ qualityProfile.description }}</small>
      </div>
      <div class="world3d-actions">
        <div class="world3d-visual-switch" role="group" aria-label="3D 视觉模式">
          <button type="button" :class="{ selected: visualMode === 'GEO' }" :aria-pressed="visualMode === 'GEO'" @click="visualMode = 'GEO'">地理探索</button>
          <button type="button" :class="{ selected: visualMode === 'CINEMA' }" :aria-pressed="visualMode === 'CINEMA'" @click="visualMode = 'CINEMA'">电影视觉</button>
        </div>
        <button type="button" @click="resetCamera">重置镜头</button>
        <button v-if="visualMode === 'CINEMA'" type="button" title="固定水岸视角，便于比较升级前后的光影" @click="previewWaterfront">水岸样板镜头</button>
        <button type="button" @click="playTour">🎬 镜头预览</button>
        <button type="button" class="primary" :disabled="!journeyState.ready" @click="toggleJourney">{{ journeyState.status === 'PLAYING' ? '⏸ 暂停旅程' : '▶ 开始旅程' }}</button>
      </div>
    </div>

    <div ref="host" class="world3d-stage">
      <div v-if="loading" class="world3d-loading">
        <div class="world3d-loading__version">{{ BUILD_VERSION }}</div>
        <span class="world3d-loading__spark">✦</span>
        <b>{{ loadingText }}</b>
        <small>{{ loadingDetail }}</small>
        <div class="world3d-progress"><i :style="{ width: `${loadProgress}%` }"></i></div>
        <div class="world3d-progress__meta">
          <span>{{ Math.round(loadProgress) }}%</span>
          <span v-if="qualityProfile">{{ qualityProfile.label }} · {{ selectionSize }}</span>
        </div>
      </div>

      <div v-if="renderWarning && !geoFailed" class="world3d-render-warning" role="status">{{ renderWarning }}</div>

      <div v-if="geoFailed" class="world3d-geo-error">
        <span>⚠</span>
        <b>{{ failureKind === 'SCENE' ? '3D 场景构建中断' : '这次没有拿到真实地理数据' }}</b>
        <p>{{ sourceMessage }}</p>
        <div>
          <button type="button" class="primary" @click="retryScene">重新生成（优先缓存）</button>
          <button type="button" @click="retryRealGeo">重新获取真实地理</button>
          <button v-if="failureKind === 'GEO'" type="button" @click="useProceduralPreview">仅查看程序化预览</button>
        </div>
        <small>{{ failureKind === 'SCENE' ? '构建错误不必每次重新下载地图；先重试缓存中的地理数据。' : '大范围自动使用“地形优先”查询，避免请求海量房屋。' }}</small>
      </div>

      <div class="world3d-corner corner-a">
        <b>TRAVEL<br>MEMORY</b>
        <small>{{ BUILD_SHORT }}</small>
      </div>
      <div class="world3d-corner corner-b" :class="{ procedural: dataSource === 'PROCEDURAL' || terrainSource !== 'REAL DEM' }">
        {{ points.length }} STOPS<br>
        {{ dataSource === 'OSM' ? 'REAL GEO' : geoFailed ? 'NO REAL GEO' : '⚠ PROCEDURAL' }}<br>
        {{ terrainSource }}
      </div>

      <div class="world3d-controls-hud">
        <b>自由视角</b>
        <span>↑ ↓ ← → 平移</span>
        <span>Space 上升 · Shift 下降</span>
        <span>左键拖动：原地转动视角</span>
        <span>中键拖动：环绕原始世界中心</span>
        <span>滚轮：惯性前进 / 后退 · R 重置镜头</span>
        <label class="world3d-speed" @pointerdown.stop @click.stop>
          <span>渲染清晰度</span>
          <select v-model="renderQuality" aria-label="渲染清晰度"><option value="SHARP">高清</option><option value="BALANCED">流畅</option></select>
        </label>
        <label class="world3d-speed" @pointerdown.stop @click.stop>
          <span>镜头速度 {{ cameraSpeed.toFixed(1) }}×</span>
          <input v-model.number="cameraSpeed" type="range" min="0.75" max="3.5" step="0.25" aria-label="镜头移动速度">
        </label>
      </div>

      <div v-if="journeyState.ready" class="world3d-journey-hud">
        <div class="journey-head">
          <div>
            <small>JOURNEY ROUTE · {{ routeModeLabel }}</small>
            <b>{{ currentStopLabel }}</b>
          </div>
          <span>{{ Math.min(journeyState.currentStopIndex + 1, journeyState.totalStops) }} / {{ journeyState.totalStops }}</span>
        </div>
        <div class="journey-progress"><i :style="{ width: `${Math.round(journeyState.progress * 100)}%` }"></i></div>
        <div class="journey-buttons">
          <button type="button" title="上一站" @click="previousStop">⏮</button>
          <button type="button" class="journey-play" @click="toggleJourney">{{ journeyState.status === 'PLAYING' ? '⏸' : '▶' }}</button>
          <button type="button" title="下一站" @click="nextStop">⏭</button>
          <button type="button" title="重新播放" @click="restartJourney">↻</button>
        </div>
        <div class="journey-camera">
          <label class="journey-speed" @pointerdown.stop @click.stop>
            行驶速度
            <select :value="journeyState.speedMultiplier" aria-label="旅行车辆播放速度" @change="changeJourneySpeed">
              <option :value="0.5">0.5×</option><option :value="1">1×</option>
              <option :value="1.5">1.5×</option><option :value="2">2×</option>
            </select>
          </label>
          <button type="button" :class="{ active: journeyState.cameraMode === 'FOLLOW' }" @click="setCameraMode('FOLLOW')">跟车</button>
          <button type="button" :class="{ active: journeyState.cameraMode === 'OVERVIEW' }" @click="setCameraMode('OVERVIEW')">俯视</button>
          <button type="button" :class="{ active: journeyState.cameraMode === 'FREE' }" @click="setCameraMode('FREE')">自由</button>
        </div>
      </div>

      <div v-if="assetProgress.total > 0 || assetProgress.loaded < 0" class="world3d-assets-hud" :class="{ missing: assetProgress.loaded < 0 }">
        {{ assetProgress.loaded < 0 ? 'GLB 模型未安装 · 当前使用程序化建筑' : `GLB ${assetProgress.loaded}/${assetProgress.total}` }}
      </div>
    </div>

    <footer class="world3d-footer">
      <span>{{ BUILD_VERSION }}</span>
      <span v-if="qualityProfile">LOD: {{ qualityProfile.id }}</span>
      <span>Three.js</span>
      <span>Adaptive OSM</span>
      <span>IndexedDB Geo Cache</span>
      <span>AWS Terrarium DEM</span>
      <span>GLB Asset Pipeline</span>
      <span>Topology-safe Water/Land</span>
      <span>Bridge-aware Roads</span>
      <span>Free-look + World Orbit Camera</span>
      <span>Road-aware Journey Routing</span>
      <span>Vehicle Playback + Stop Dwell</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { withResourceDeadline } from '@/utils/asyncResources'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { CartoonMapStyle, TravelMapSceneConfig } from '@/api/travelMapScene'
import type { RealMapPoint } from '@/api/travelRealMap'
import type { TravelRoute } from '@/utils/travelRoute'
import { normalizeBounds } from '@/components/cartoon-world/geo'
import { loadOsmWorld, type OsmWorldData } from '@/components/cartoon-world/osm'
import { loadDemTerrain, type DemTerrainData } from '@/components/cartoon-world/dem'
import { chooseWorldQuality, formatSelectionSize, type WorldQualityProfile } from '@/components/cartoon-world/quality'
import { WorldRenderer } from '@/components/cartoon-world/WorldRenderer'
import type { WorldVisualMode } from '@/components/cartoon-world/VisualModeController'
import type { JourneyCameraMode, JourneyPlaybackSnapshot } from '@/components/cartoon-world/journey/JourneyPlaybackController'

const BUILD_VERSION = 'TM-CW v4.0.0-alpha.3.1 · Reflection & Render Recovery · 2026-10-12'
const BUILD_SHORT = 'v4.0 a3.1'

const props = defineProps<{
  travelId: number
  config: TravelMapSceneConfig
  points: RealMapPoint[]
  photoUrls: Record<number, string>
  theme: CartoonMapStyle
  route?: TravelRoute | null
}>()

const emit=defineEmits<{ready:[]}>()
const host = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const loadProgress = ref(0)
const loadingText = ref('准备生成 3D 卡通世界…')
const loadingDetail = ref(BUILD_VERSION)
const sourceMessage = ref('准备真实地理数据…')
const dataSource = ref<'OSM' | 'PROCEDURAL'>('PROCEDURAL')
const geoFailed = ref(false)
const renderWarning = ref('')
const terrainSource = ref<'REAL DEM' | 'PROCEDURAL TERRAIN'>('PROCEDURAL TERRAIN')
const terrainMessage = ref('尚未读取真实高程')
const allowProceduralPreview = ref(false)
const qualityProfile = ref<WorldQualityProfile | null>(null)
const cameraSpeed = ref(1.8)
const renderQuality = ref<'SHARP' | 'BALANCED'>('SHARP')
const visualMode = ref<WorldVisualMode>('CINEMA')
const failureKind = ref<'GEO' | 'SCENE' | null>(null)
const assetProgress = reactive({ loaded: 0, total: 0 })
const journeyState = reactive<JourneyPlaybackSnapshot>({
  ready: false,
  status: 'IDLE',
  progress: 0,
  currentStopIndex: 0,
  nextStopIndex: 0,
  totalStops: 0,
  cameraMode: 'FOLLOW',
  routeMode: 'DIRECT',
  roadCoverage: 0,
  speedMultiplier: 1
})
const orderedJourneyPoints = computed(() => [...props.points]
  .filter(point => Number.isFinite(point.longitude) && Number.isFinite(point.latitude))
  .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id))
const currentStopLabel = computed(() => {
  const point = orderedJourneyPoints.value[journeyState.currentStopIndex]
  return point?.title || point?.locationName || `旅行第 ${journeyState.currentStopIndex + 1} 站`
})
const routeModeLabel = computed(() => props.route ? '共享驾车路线' : journeyState.routeMode === 'ROAD'
  ? `真实道路 ${Math.round(journeyState.roadCoverage * 100)}%`
  : journeyState.routeMode === 'MIXED'
    ? `道路优先 ${Math.round(journeyState.roadCoverage * 100)}%`
    : '直连兜底')
let renderer: WorldRenderer | null = null
let abortController: AbortController | null = null
let rebuildTimer = 0

const selectionSize = computed(() => qualityProfile.value ? formatSelectionSize(qualityProfile.value) : '')
const sceneKey = computed(() => [
  props.travelId,
  props.theme,
  props.config.centerLng,
  props.config.centerLat,
  props.config.southWestLng,
  props.config.southWestLat,
  props.config.northEastLng,
  props.config.northEastLat,
  props.config.rotation,
  props.route?.sourceSignature,
  props.points.map(point => `${point.id}:${point.longitude}:${point.latitude}:${point.mediaId}:${point.sortOrder}`).join('|')
].join('~'))

function setProgress(value: number, text?: string, detail?: string) {
  loadProgress.value = Math.max(0, Math.min(100, value))
  if (text) loadingText.value = text
  if (detail) loadingDetail.value = detail
}

async function rebuild(forceNetwork = false) {
  if (!host.value) return
  abortController?.abort()
  const runController = new AbortController()
  abortController = runController
  // 保留上次可用渲染器，直到新场景完整构造成功。
  assetProgress.loaded = 0
  assetProgress.total = 0
  Object.assign(journeyState, { ready: false, status: 'IDLE', progress: 0, currentStopIndex: 0, nextStopIndex: 0, totalStops: 0, cameraMode: 'FOLLOW', routeMode: 'DIRECT', roadCoverage: 0, speedMultiplier: 1 })
  loading.value = true
  geoFailed.value = false
  renderWarning.value = ''
  failureKind.value = null
  terrainSource.value = 'PROCEDURAL TERRAIN'
  terrainMessage.value = '尚未读取真实高程'
  setProgress(3, '分析取景范围…', BUILD_VERSION)

  const bounds = normalizeBounds({
    centerLng: props.config.centerLng,
    centerLat: props.config.centerLat,
    southWestLng: props.config.southWestLng ?? undefined,
    southWestLat: props.config.southWestLat ?? undefined,
    northEastLng: props.config.northEastLng ?? undefined,
    northEastLat: props.config.northEastLat ?? undefined
  })
  const profile = chooseWorldQuality(bounds)
  qualityProfile.value = profile
  setProgress(7, `已选择「${profile.label}」渲染策略`, `${formatSelectionSize(profile)} · ${profile.description}`)

  let osm: OsmWorldData
  try {
    osm = await loadOsmWorld(bounds, runController.signal, {
      detail: profile.osmDetail,
      cacheMaxAgeMs: forceNetwork ? 0 : undefined,
      onProgress: progress => {
        if (runController.signal.aborted) return
        const ratio = progress.total > 0 ? progress.completed / progress.total : 0
        const base = progress.stage === 'CACHE' ? 8 : progress.stage === 'REQUEST' ? 12 : progress.stage === 'PARSE' ? 60 : 64
        const span = progress.stage === 'REQUEST' ? 46 : 3
        setProgress(base + ratio * span, '正在读取真实地理结构…', progress.message)
      }
    })
  } catch (error) {
    if (runController.signal.aborted) return
    sourceMessage.value = `真实地理读取中断：${error instanceof Error ? error.message : '未知错误'}`
    geoFailed.value = true
    failureKind.value = 'GEO'
    loading.value = false
    return
  }

  if (runController.signal.aborted) return
  sourceMessage.value = osm.message
  dataSource.value = osm.source
  if (osm.source === 'PROCEDURAL' && !allowProceduralPreview.value) {
    geoFailed.value = true
    failureKind.value = 'GEO'
    loading.value = false
    return
  }

  setProgress(67, '正在读取真实 DEM 高程…', '地形瓦片会使用浏览器缓存；大范围自动降低 DEM 请求级别。')
  let dem: DemTerrainData | null = null
  try {
    dem = await withResourceDeadline(signal=>loadDemTerrain(bounds,signal),14000,runController.signal)
  } catch (error) {
    if (runController.signal.aborted) return
  }
  if (runController.signal.aborted) return
  terrainSource.value = dem ? 'REAL DEM' : 'PROCEDURAL TERRAIN'
  terrainMessage.value = dem?.message || '真实 DEM 本次读取失败，使用平滑程序化地形兜底。'
  sourceMessage.value = `${osm.message} ${terrainMessage.value}`

  setProgress(83, '正在统一水陆拓扑、道路与桥梁连续性…', `${profile.label} · ${profile.id === 'REGION' ? '大范围主动弱化普通建筑' : '正在生成街区建筑与环境细节'}`)
  await nextTick()
  if (!host.value || runController.signal.aborted) return

  const childrenBefore=new Set(host.value.children)
  try {
  const nextRenderer = new WorldRenderer({
    container: host.value,
    travelId: props.travelId,
    style: props.theme,
    bounds,
    points: props.points,
    sharedRoute: props.route,
    photoUrls: props.photoUrls,
    osm,
    dem,
    quality: profile,
    preferredAzimuthDeg: Number(props.config.rotation || 0),
    onAssetProgress: (loaded, total) => {
      if(runController.signal.aborted)return
      assetProgress.loaded = loaded
      assetProgress.total = total
    },
    onJourneyState: state => {if(!runController.signal.aborted)Object.assign(journeyState,state)},
    onRenderWarning: (message, fallbackMode) => {
      if (runController.signal.aborted) return
      renderWarning.value = message
      if (fallbackMode === 'GEO') visualMode.value = 'GEO'
    },
    onRenderError: error=>{if(runController.signal.aborted)return;sourceMessage.value=`渲染中断：${error}`;geoFailed.value=true;failureKind.value='SCENE';loading.value=false}
  })
  renderer?.destroy()
  renderer=nextRenderer
  renderer.setCameraSpeedMultiplier(cameraSpeed.value)
  renderer.setRenderQuality(renderQuality.value)
  renderer.setVisualMode(visualMode.value)
  }catch(error){
    runController.abort()
    for(const child of host.value.children)if(!childrenBefore.has(child))child.remove()
    sourceMessage.value=`3D 构建失败：${error instanceof Error?error.message:'未知错误'}；可以重试，之前的场景未被替换。`
    geoFailed.value=true;failureKind.value='SCENE';loading.value=false;return
  }
  setProgress(100, '3D 世界加载完成', `${BUILD_VERSION} · ${profile.label}`)
  emit('ready')
  window.setTimeout(() => {
    if (!runController.signal.aborted) loading.value = false
  }, 180)
}

function scheduleRebuild() {
  window.clearTimeout(rebuildTimer)
  rebuildTimer = window.setTimeout(() => void rebuild(false), 220)
}

function retryScene() {
  void rebuild(false)
}

function retryRealGeo() {
  allowProceduralPreview.value = false
  void rebuild(true)
}

function useProceduralPreview() {
  allowProceduralPreview.value = true
  void rebuild(false)
}

function resetCamera() {
  renderer?.resetCamera(true)
}

function playTour() {
  renderer?.playTour()
}

function previewWaterfront() {
  if (!renderer?.previewWaterfront()) {
    // The selected OSM world contains no water geometry to use as a QA target.
    window.alert('当前地图选区内没有可用水域，请选择含河道或湖泊的旅行区域。')
  }
}

function toggleJourney() {
  renderer?.toggleJourney()
}

function restartJourney() {
  renderer?.restartJourney()
}

function nextStop() {
  renderer?.nextJourneyStop()
}

function previousStop() {
  renderer?.previousJourneyStop()
}

function changeJourneySpeed(event: Event) {
  const select = event.target as HTMLSelectElement
  renderer?.setJourneySpeed(Number(select.value))
}

function setCameraMode(mode: JourneyCameraMode) {
  renderer?.setJourneyCameraMode(mode)
}

watch(cameraSpeed, value => renderer?.setCameraSpeedMultiplier(value))
watch(renderQuality, value => renderer?.setRenderQuality(value))
watch(visualMode, value => renderer?.setVisualMode(value))
watch(sceneKey, scheduleRebuild)
watch(() => props.photoUrls, scheduleRebuild, { deep: true })

onMounted(() => void rebuild(false))
onBeforeUnmount(() => {
  window.clearTimeout(rebuildTimer)
  abortController?.abort()
  renderer?.destroy()
  renderer = null
})
</script>

<style scoped>
.world3d-shell{position:relative;display:grid;gap:10px}.world3d-toolbar{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(190px,.75fr) auto;align-items:center;gap:14px;padding:10px 12px;border:1px solid rgba(255,255,255,.82);border-radius:15px;background:rgba(255,255,255,.72);box-shadow:0 10px 24px rgba(92,52,71,.08);backdrop-filter:blur(12px)}.world3d-title{display:grid;gap:2px;min-width:0}.world3d-toolbar p{margin:0;font-size:8px;letter-spacing:.18em;font-weight:900;color:#ce79a0}.world3d-toolbar strong{font-size:12px;color:#704158}.world3d-toolbar small{font-size:9px;color:#9c7487}.world3d-toolbar small.warning{color:#b24f62;font-weight:800}.world3d-meta{display:grid;gap:2px;padding:7px 10px;border-radius:11px;background:rgba(255,247,251,.78);border:1px solid rgba(224,157,187,.22)}.world3d-meta b{font-size:10px;color:#7b4960}.world3d-meta span{font-size:9px;font-weight:800;color:#d46f9c}.world3d-meta small{font-size:8px;line-height:1.4}.world3d-actions{display:flex;gap:7px;flex:none}.world3d-actions button{border:1px solid rgba(224,157,187,.55);border-radius:11px;padding:8px 11px;background:rgba(255,255,255,.82);color:#83526a;font-size:10px;font-weight:800;cursor:pointer}.world3d-actions button.primary{border-color:transparent;background:linear-gradient(120deg,#ef79a9,#ffb7cf);color:#fff;box-shadow:0 8px 18px rgba(216,91,145,.22)}.world3d-actions button:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.world3d-stage{position:relative;height:620px;overflow:hidden;border:7px solid rgba(255,255,255,.95);border-radius:27px;box-shadow:0 30px 64px rgba(77,45,60,.28);isolation:isolate}.world3d-stage :deep(.cartoon-world-canvas){position:absolute;inset:0;width:100%!important;height:100%!important;display:block;outline:none}.world3d-stage :deep(.cartoon-world-labels){z-index:6}.world3d-stage :deep(.world-memory-card){display:grid;grid-template-columns:66px minmax(70px,110px);gap:8px;align-items:center;padding:6px;border:1px solid rgba(255,255,255,.94);border-radius:11px;background:rgba(255,250,252,.92);box-shadow:0 12px 28px rgba(68,43,55,.25);backdrop-filter:blur(8px);transform:translateY(-8px);color:#71445a}.world3d-stage :deep(.world-memory-card img),.world3d-stage :deep(.world-memory-card__placeholder){width:66px;height:45px;object-fit:cover;border-radius:7px;background:linear-gradient(135deg,#ffd4e4,#e0ece4);display:grid;place-items:center;color:#fff;font-size:18px}.world3d-stage :deep(.world-memory-card>div:last-child){display:grid;gap:2px;min-width:0}.world3d-stage :deep(.world-memory-card b){font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.world3d-stage :deep(.world-memory-card small){font-size:7px;color:#a87a90;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.world3d-night .world3d-stage :deep(.world-memory-card){background:rgba(30,36,58,.9);border-color:rgba(255,255,255,.18);color:#ffe4ef}.world3d-night .world3d-stage :deep(.world-memory-card small){color:#c6acba}.world3d-stage :deep(.world-memory-card){opacity:.42;transform:translateY(-8px) scale(.86);transition:opacity .3s ease,transform .35s cubic-bezier(.2,.9,.25,1.2),filter .3s ease;filter:saturate(.72)}.world3d-stage :deep(.world-memory-card.is-past){opacity:.68;filter:saturate(.88)}.world3d-stage :deep(.world-memory-card.is-active){opacity:1;transform:translateY(-14px) scale(1.08);filter:saturate(1.08);box-shadow:0 18px 40px rgba(222,93,148,.28),0 0 0 2px rgba(255,255,255,.7)}
.world3d-loading{position:absolute;z-index:20;inset:0;display:grid;place-content:center;justify-items:center;gap:8px;text-align:center;padding:22px;background:linear-gradient(150deg,rgba(255,242,247,.96),rgba(231,245,246,.96));color:#75465d}.world3d-loading__version{padding:5px 9px;border-radius:999px;background:#fff;border:1px solid rgba(214,116,159,.22);font-size:8px;font-weight:900;letter-spacing:.08em;color:#c3638f}.world3d-loading__spark{font-size:30px;animation:worldSpark 1.15s ease-in-out infinite alternate}.world3d-loading b{font-size:14px}.world3d-loading small{max-width:520px;font-size:9px;line-height:1.6;color:#a17389}.world3d-progress{width:min(430px,70vw);height:7px;border-radius:999px;background:rgba(121,70,94,.10);overflow:hidden;box-shadow:inset 0 1px 3px rgba(85,45,64,.08)}.world3d-progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ef7eab,#9ad6d7);transition:width .22s ease}.world3d-progress__meta{width:min(430px,70vw);display:flex;justify-content:space-between;gap:12px;font-size:8px;color:#9d6d83}@keyframes worldSpark{from{transform:scale(.92) rotate(-8deg);opacity:.55}to{transform:scale(1.1) rotate(8deg);opacity:1}}
.world3d-render-warning{position:absolute;z-index:18;top:18px;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100% - 38px);padding:8px 13px;border-radius:12px;background:rgba(255,247,211,.96);color:#684d23;border:1px solid rgba(176,123,55,.35);font-size:10px;font-weight:700;box-shadow:0 6px 20px rgba(0,0,0,.14)}.world3d-geo-error{position:absolute;z-index:22;left:50%;top:50%;width:min(520px,calc(100% - 36px));transform:translate(-50%,-50%);display:grid;justify-items:center;gap:8px;padding:22px;border:1px solid rgba(190,74,98,.2);border-radius:18px;background:rgba(255,248,250,.96);box-shadow:0 24px 60px rgba(70,40,54,.2);backdrop-filter:blur(12px);text-align:center;color:#704158}.world3d-geo-error>span{font-size:28px}.world3d-geo-error>b{font-size:14px}.world3d-geo-error p{margin:0;max-width:440px;font-size:10px;line-height:1.7;color:#9b6d82}.world3d-geo-error>div{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}.world3d-geo-error button{border:1px solid rgba(224,157,187,.55);border-radius:11px;padding:8px 12px;background:#fff;color:#83526a;font-size:10px;font-weight:800;cursor:pointer}.world3d-geo-error button.primary{border-color:transparent;background:linear-gradient(120deg,#ef79a9,#ffb7cf);color:#fff}.world3d-geo-error small{font-size:9px;color:#a37389}
.world3d-corner{position:absolute;z-index:8;padding:8px 10px;border:1px solid rgba(255,255,255,.75);border-radius:11px;background:rgba(255,255,255,.66);box-shadow:0 6px 18px rgba(66,48,56,.10);backdrop-filter:blur(9px);color:#8d506c;font-size:8px;font-weight:900;letter-spacing:.09em}.corner-a{left:16px;top:16px}.corner-a{display:grid;gap:4px}.corner-a small{font-size:7px;letter-spacing:.04em;color:#c36a92}.corner-b{right:16px;bottom:16px;text-align:right}.corner-b.procedural{color:#ad465d;background:rgba(255,240,243,.86)}.world3d-controls-hud{position:absolute;z-index:8;left:16px;bottom:16px;display:grid;gap:2px;padding:8px 10px;border-radius:11px;background:rgba(31,42,48,.58);color:#fff;backdrop-filter:blur(8px);pointer-events:none}.world3d-controls-hud b{font-size:8px;letter-spacing:.08em}.world3d-controls-hud span{font-size:7px;opacity:.86}.world3d-controls-hud .world3d-speed{display:grid;gap:4px;margin-top:5px;pointer-events:auto}.world3d-speed span{font-size:8px;opacity:1}.world3d-speed input{width:140px;accent-color:#f7a2c7;cursor:pointer}.world3d-speed select{width:140px;min-height:24px;padding:3px 7px;border:1px solid rgba(255,255,255,.34);border-radius:7px;background:rgba(255,255,255,.14);color:#fff;font:inherit;font-size:9px;cursor:pointer}.world3d-speed select option{color:#2b3239;background:#fff}.world3d-journey-hud{position:absolute;z-index:10;left:50%;bottom:16px;transform:translateX(-50%);width:min(460px,calc(100% - 330px));min-width:300px;display:grid;gap:7px;padding:10px 12px;border:1px solid rgba(255,255,255,.8);border-radius:15px;background:rgba(35,45,52,.66);color:#fff;backdrop-filter:blur(12px);box-shadow:0 14px 38px rgba(32,38,42,.22)}.journey-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.journey-head>div{display:grid;gap:2px;min-width:0}.journey-head small{font-size:7px;letter-spacing:.12em;opacity:.72}.journey-head b{font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.journey-head>span{font-size:9px;font-weight:900;color:#ffd1e3}.journey-progress{height:5px;border-radius:999px;background:rgba(255,255,255,.15);overflow:hidden}.journey-progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff82b4,#ffd07a);transition:width .18s linear}.journey-buttons,.journey-camera{display:flex;align-items:center;justify-content:center;gap:6px}.journey-buttons button,.journey-camera button{border:1px solid rgba(255,255,255,.2);border-radius:9px;background:rgba(255,255,255,.10);color:#fff;font-size:9px;font-weight:900;padding:5px 9px;cursor:pointer}.journey-buttons .journey-play{min-width:42px;background:linear-gradient(120deg,#ef79a9,#ffb7cf);border-color:transparent}.journey-camera button.active{background:rgba(255,218,232,.92);color:#75465d;border-color:transparent}.journey-camera{border-top:1px solid rgba(255,255,255,.10);padding-top:6px}.journey-speed{display:flex;align-items:center;gap:4px;font-size:9px;color:#fff}.journey-speed select{font-size:10px;border:1px solid rgba(255,255,255,.22);border-radius:7px;padding:3px;background:#533e52;color:#fff}.world3d-night .world3d-journey-hud{background:rgba(20,27,44,.74)}
.world3d-assets-hud{position:absolute;z-index:8;right:16px;top:16px;padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.72);font-size:8px;font-weight:900;color:#7c4c62;backdrop-filter:blur(8px)}.world3d-assets-hud.missing{background:rgba(255,239,243,.9);color:#b24860}
.world3d-footer{display:flex;gap:6px;flex-wrap:wrap}.world3d-footer span{padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.66);border:1px solid rgba(224,157,187,.24);font-size:8px;font-weight:800;color:#96637b}@media(max-width:900px){.world3d-toolbar{grid-template-columns:1fr}.world3d-meta{order:2}.world3d-actions{order:3}.world3d-stage{height:520px}.world3d-controls-hud{display:none}.world3d-journey-hud{width:calc(100% - 32px);min-width:0;bottom:14px}.world3d-assets-hud{top:10px;right:10px}}
.world3d-visual-switch{display:inline-flex;align-items:center;gap:3px;padding:3px;background:rgba(29,42,58,.13);border-radius:999px;border:1px solid rgba(255,255,255,.42)}
.world3d-visual-switch button{border:0;border-radius:999px;background:transparent;color:#655568;padding:8px 12px;font-weight:800;font-size:11px;white-space:nowrap;cursor:pointer}
.world3d-visual-switch button.selected{background:#2b354c;color:white;box-shadow:0 2px 8px rgba(22,28,50,.18)}
.world3d-visual-switch button:focus-visible{outline:2px solid #367da8;outline-offset:2px}
</style>
