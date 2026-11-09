<template>
  <section class="real-atlas">
    <header class="atlas-title">
      <div><p class="eyebrow">GEOGRAPHICAL MEMORY / GCJ-02</p><h2>旅行足迹图</h2><p>从地点索引进入沿途的照片与故事。</p></div>
      <div class="actions">
        <template v-if="viewMode === 'map'">
          <button type="button" class="plain-btn" @click="changeStyle">{{ darkStyle ? '☀ 浅色地图' : '☾ 夜色地图' }}</button>
          <button v-if="editable" class="pink-btn" :disabled="!ready || busy" @click="togglePlacing">{{ placing ? '× 取消选点' : '＋ 添加记忆点' }}</button>
          <button type="button" class="world-btn" :disabled="loading || orderedPoints.length < 2" @click="open3DWorld">
            {{ orderedPoints.length >= 2 ? `${sceneStale ? '↻ 更新' : '✦ 生成'} 3D 旅行地图 · ${orderedPoints.length}站` : '✦ 至少 2 个地点生成 3D' }}
          </button>
        </template>
        <button v-else type="button" class="world-back-btn" @click="backToRealMap">← 返回真实地图</button>
      </div>
    </header>
    <div v-show="viewMode === 'map'" class="real-map-view">
    <div class="phase9-route-bar">
      <div class="phase9-route-caption">
        <b>✦ 旅行足迹</b>
        <small>
          {{ routeCaption }}
        </small>
      </div>

      <button v-if="routeError" type="button" class="phase9-pill" :disabled="routeBusy" @click="refreshTravelRoute(true)">重新查询路线</button>
      <label>
        排列顺序
        <select v-model="routeOrder">
          <option value="manual">手动顺序</option>
          <option value="date">旅行日期</option>
        </select>
      </label>

      <button
        type="button"
        class="phase9-pill"
        @click="routeVisible = !routeVisible"
      >
        {{ routeVisible ? '隐藏路线' : '显示路线' }}
      </button>

      <button
        type="button"
        class="phase9-pill emphasis"
        :disabled="!ready || (!points.length && !anchoredCustom.length)"
        @click="showEntireJourney"
      >
        ⊕ 全览路线
      </button>
    </div>

    <div v-if="message" role="status" class="message">
      <span>{{ message }}</span>
      <button v-if="apiOnline === false" type="button" class="message-retry" @click="retryBackend">重新连接</button>
    </div>
    <div class="workspace">
      <div class="map-box">
        <!-- ★★★★★【地图底图由高德 JS API 在线绘制；无需放置 PNG】★★★★★ -->
        <div ref="mapElement" class="amap-canvas"></div>
        <div v-if="!ready" class="map-loading"><span>⌖</span><h3>{{ mapError ? '无法加载真实地图' : '正在打开旅行地图…' }}</h3><p>{{ mapError || '地图从高德在线加载，请稍候。' }}</p><a v-if="!mapKey" href="https://console.amap.com/" target="_blank" rel="noopener noreferrer">申请高德地图 Key ↗</a></div>
        <div v-if="ready" class="search-wrap">
          <div class="search-input"><span>⌕</span><input v-model.trim="keyword" type="search" placeholder="搜索城市、景点、街道…" maxlength="80" @keydown.enter.prevent="searchPlaces" /><button :disabled="searching||!keyword" @click="searchPlaces">{{ searching ? '稍候' : '搜索' }}</button></div>
          <div v-if="searchPlacesList.length" class="search-list"><div v-for="(place,i) in searchPlacesList" :key="i" class="search-result"><button class="go-place" @click="flyTo(place)"><b>{{place.name}}</b><small>{{place.address}}</small></button><button v-if="editable" class="quick-add" :title="locatingCustomId?'确认关联已有记忆':'标记此地'" :disabled="busy" @click="locatingCustomId?confirmCustomLocation(place):beginDraftAt(place.lng,place.lat,place.name)">{{locatingCustomId?'关联':'＋'}}</button></div></div>
        </div>
        <div v-if="ready&&placing" class="placing-tip">✿ 请点击地图上的一处位置</div>
        <div v-if="ready" class="map-label">⌖ 已标记 {{ points.length+anchoredCustom.length }} 个地点 · 拖动地图探索</div>
      </div>
      <aside class="panel">
        <header class="panel-header"><p class="eyebrow">PLACES & MOMENTS</p><h3>沿途站点</h3><small>点击编号，定位地图上的这一站</small></header>
        <div v-if="loading" class="empty">正在读取旅行记忆…</div>
        <div v-else-if="!points.length && !anchoredCustom.length && !creating" class="empty"><span>✿</span><b>还没有留下地理足迹</b><p>{{ editable ? '搜索目的地后点 ＋，或点击「添加记忆点」再在地图上选位置。' : '作者还没有在真实地图上标记地点。' }}</p></div>
        <div v-else-if="points.length" class="point-list"><button v-for="(p,i) in orderedPoints" :key="p.id" class="point-entry" :aria-pressed="p.id===selectedId" :class="{ chosen: p.id===selectedId }" @click="choose(p,true)"><span class="point-number">{{ String(i+1).padStart(2,'0') }}</span><span class="point-name"><b>{{p.title}}</b><span class="point-place">{{ p.locationName || '旅行地点' }}<small v-if="Number.isFinite(p.longitude) && Number.isFinite(p.latitude)" class="entry-coordinates">{{ p.longitude.toFixed(4) }}, {{ p.latitude.toFixed(4) }}</small></span></span><span>↗</span></button></div>
        <div v-if="anchoredCustom.length" class="point-list anchored-list">
          <p class="eyebrow">✿ 已关联地理位置的手账记忆（复用原记录）</p>
          <button v-for="p in anchoredCustom" :key="`custom-${p.id}`" class="point-entry" :class="{chosen:selectedCustom?.id===p.id}" @click="chooseCustom(p,true)"><span class="point-number">▧</span><span class="point-name"><b>{{p.title}}</b><small>{{p.locationName||'已定位的手账记忆'}}</small></span><span>↗</span></button>
        </div>
        <details v-if="editable && unlocatedCustom.length" class="unlocated-panel">
          <summary>待确认的旧手账地点 · {{unlocatedCustom.length}} 处</summary>
          <p>这些记忆只有地点名称，没有可靠经纬度。点击“确认位置”后，请在搜索结果中选择准确景点；不会自动使用城市中心，也不会新建记忆记录。</p>
          <button v-for="p in unlocatedCustom" :key="`unlocated-${p.id}`" type="button" :disabled="!ready || busy" @click="searchExistingStory(p)">⌖ 为「{{p.locationName}}」确认位置</button>
          <p v-if="locatingCustomId" role="status">正在为原有记忆确认地点，请核对 POI 后点击搜索结果右侧“关联”。</p>
        </details>
        <section v-if="selectedCustom" class="point-editor"><p class="eyebrow">ALREADY SAVED · 原手账记忆</p><div v-if="pictureUrl" class="preview"><img :src="pictureUrl" alt="原手账记忆照片" /></div><h3>{{selectedCustom.title}}</h3><p>{{selectedCustom.locationName}} · {{selectedCustom.travelDate||'日期待补充'}}</p><p>{{selectedCustom.subtitle}}</p><p class="read-only">{{selectedCustom.content||'这段记忆还没有故事内容。'}}</p><p class="tip">这张图钉关联原手账记忆，不会生成第二条数据库记录。故事内容请在原手账中修改。</p></section>
        <section v-if="selected || creating" class="point-editor"><p class="eyebrow">{{editable?'EDIT MEMORY':'MEMORY STORY'}}</p>
          <div v-if="pictureUrl" class="preview"><img :src="pictureUrl" alt="记忆点照片" /></div>
          <template v-if="editable">
            <label>标题<input v-model.trim="draft.title" maxlength="80" placeholder="例如：平江路的午后" /></label>
            <label>地点<input v-model.trim="draft.locationName" maxlength="120" placeholder="例如：苏州 · 平江路" /></label>
            <label>日期<input v-model="draft.travelDate" type="date" /></label>
            <label>一句话留言<input v-model.trim="draft.subtitle" maxlength="150" placeholder="路过这里时，风很温柔…" /></label>
            <label>关联照片<select v-model="draft.mediaId"><option :value="null">暂不关联</option><option v-for="m in photos" :key="m.id" :value="m.id">{{m.originalName || `照片 ${m.id}`}}</option></select></label>
            <label>故事内容<textarea v-model.trim="draft.content" maxlength="10000" rows="4" placeholder="写下这段回忆…" /></label>
            <label>故事顺序<input v-model.number="draft.sortOrder" min="0" max="100000" type="number" /></label>
            <div class="coords">⌖ {{draft.lng.toFixed(6)}} , {{draft.lat.toFixed(6)}}<small>高德 GCJ-02 · 拖动图钉，松开自动保存</small></div>
            <div class="save-actions">
              <button class="pink-btn" :disabled="busy" @click="save">{{ busy ? '保存中…' : (creating ? '创建记忆点' : '保存故事') }}</button>
              <button v-if="creating" class="del-btn" :disabled="busy" @click="cancelDraft">取消</button>
              <button v-else class="del-btn" :disabled="busy" @click="remove">删除</button>
            </div>
          </template>
          <div v-else-if="selected" class="read-only"><h3>{{selected.title}}</h3><p>{{selected.locationName||'旅行的某一站'}} · {{selected.travelDate||'日期待补充'}}</p><blockquote v-if="selected.subtitle">{{selected.subtitle}}</blockquote><p>{{selected.content||'这段回忆暂时没有文字。'}}</p></div>
        </section>
      </aside>
    </div>
    <footer>高德地图 JS API 2.0 · GCJ-02 坐标 · 作者可以查看自己的私密旅行 · 访客仅可查看公开已发布内容</footer>
    </div>

    <RealJourney3DPanel
      v-if="worldVisited"
      v-show="viewMode === 'world'"
      :travel-id="travelId"
      :editable="editable"
      :points="orderedPoints"
      :route="sharedRoute"
      :route-busy="routeBusy"
      :route-error="routeError"
      @retry-route="refreshTravelRoute(true)"
      @generated="generatedSourceHash = $event"
      @stale-change="routeSceneStale = $event"
    />
  </section>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { loadTravelAMap } from '@/utils/amap'
import { sortMemories, type MemorySortMode } from '@/utils/memoryOrder'
import { createMediaBlobUrl, getTravelMediaApi, type TravelMedia } from '@/api/media'
import { createRealMapPointApi, deleteRealMapPointApi, getRealMapPointsApi, anchorCustomMemoryApi,
  updateRealMapPointApi, type RealMapPoint, type RealMapPointPayload } from '@/api/travelRealMap'
import { getThemeArtApi } from '@/api/themeArt'
import { getTravelStoryPointsApi,type TravelStoryPoint } from '@/api/travelStory'
import { readCachedTravelRoute, cacheTravelRoute, buildTravelRoute, journeyGeometrySignature, journeySourceHash, validJourneyPoints, type TravelRoute } from '@/utils/travelRoute'
import { getRouteSnapshotApi, saveRouteSnapshotApi, type TravelRouteState } from '@/api/travelRouteSnapshot'
import { isTravelRouteConsistent } from '@/utils/travelRoute'

const RealJourney3DPanel = defineAsyncComponent({
  loader: () => import('@/components/RealJourney3DPanel.vue'),
  loadingComponent: { render: () => h('p', { role: 'status', class: 'message' }, '正在打开 3D 旅行地图…') },
  errorComponent: { render: () => h('p', { role: 'alert', class: 'message' }, '3D 地图暂时无法加载，请返回真实地图或刷新页面。') }
})
const props = defineProps<{ travelId:number; editable:boolean; focusPointId?:number|null }>()
// Saved viewport is a client preference, not an additional map point or server record.
const viewportKey = () => {
  let user = 'guest'
  try { user = String(JSON.parse(localStorage.getItem('travel_user') || '{}').id || 'guest') } catch { /* ignore */ }
  return `tm_real_map_view_${user}_${props.travelId}`
}
function readViewport(): {lng:number;lat:number;zoom:number}|null {
  try {
    const v=JSON.parse(localStorage.getItem(viewportKey())||'null')
    if(v && Number.isFinite(v.lng) && Number.isFinite(v.lat) && Number.isFinite(v.zoom)
      && Math.abs(v.lng)<=180 && Math.abs(v.lat)<=90 && v.zoom>=3 && v.zoom<=20) return v
  } catch { /* bad/old value */ }
  return null
}
let userMovedMap = false
function restoreOrFit() {
  if(!map.value || (!points.value.length && !anchoredCustom.value.length) || userMovedMap) return
  const saved=readViewport()
  if(saved) map.value.setZoomAndCenter(saved.zoom,[saved.lng,saved.lat])
  else if(points.value.length + anchoredCustom.value.length>1) map.value.setFitView([...markers.values(),...customMarkers.values()],false,[70,70,70,70],15)
  else if(points.value.length)map.value.setZoomAndCenter(12,[points.value[0]!.longitude,points.value[0]!.latitude])
  else if(anchoredCustom.value[0])map.value.setZoomAndCenter(12,[anchoredCustom.value[0].longitude,anchoredCustom.value[0].latitude])
}

type AtlasViewMode = 'map' | 'world'
const viewMode = ref<AtlasViewMode>('map')
const worldVisited = ref(false)
const generatedSourceHash = ref('')
const routeSceneStale = ref(false)
const sceneStale = computed(() => Boolean(routeSceneStale.value || generatedSourceHash.value && generatedSourceHash.value !== journeySourceHash(orderedPoints.value)))

function open3DWorld() {
  if (orderedPoints.value.length < 2) {
    message.value = '至少添加 2 个真实地图记忆点后才能生成 3D 旅行世界'
    return
  }
  placing.value = false
  map.value?.setStatus?.({ doubleClickZoom: true })
  if (mapElement.value) mapElement.value.style.cursor = ''
  hidePointHover()
  worldVisited.value = true
  viewMode.value = 'world'
}

async function backToRealMap() {
  viewMode.value = 'map'
  await nextTick()
  // AMap was kept mounted with v-show. Resize after it becomes visible again,
  // then fit the SAME journey points so 2D and 3D always refer to one trip.
  map.value?.resize?.()
  if (markers.size > 1) showEntireJourney()
}
const mapKey = String(import.meta.env.VITE_AMAP_KEY || '').trim()
const mapElement = ref<HTMLDivElement|null>(null)
const sdk = shallowRef<any>(null)
const map = shallowRef<any>(null)
const markers = new Map<number,any>()
const points = ref<RealMapPoint[]>([])
const storyPoints=ref<TravelStoryPoint[]>([])
const anchoredCustom=computed(()=>storyPoints.value.filter(p=>p.pointType==='CUSTOM' && p.longitude!=null && p.latitude!=null && Number.isFinite(p.longitude) && Number.isFinite(p.latitude)))
const unlocatedCustom=computed(()=>storyPoints.value.filter(p=>p.pointType==='CUSTOM' && !!p.locationName?.trim() && (p.longitude==null || p.latitude==null)))
const selectedCustom=ref<TravelStoryPoint|null>(null)
const locatingCustomId=ref<number|null>(null)
const customMarkers=new Map<number,any>()
function chooseCustom(p:TravelStoryPoint,focus=false){
  selectedId.value=null;creating.value=false;selectedCustom.value=p
  draft.mediaId=p.mediaId;void setPreview(p.mediaId)
  if(focus && p.longitude!=null && p.latitude!=null)map.value?.setZoomAndCenter(Math.max(12,map.value?.getZoom?.()||12),[p.longitude,p.latitude])
}
function drawCustomPins(){
  for(const marker of customMarkers.values())marker.setMap(null)
  customMarkers.clear()
  if(!map.value || !sdk.value)return
  anchoredCustom.value.forEach((p,index)=>{
    const marker=new sdk.value.Marker({map:map.value,position:[p.longitude,p.latitude],content:markerDom(points.value.length+index),offset:new sdk.value.Pixel(-19,-39),draggable:false,zIndex:145})
    marker.on('click',()=>chooseCustom(p,true))
    customMarkers.set(p.id,marker)
  })
}
async function searchExistingStory(p:TravelStoryPoint){
  if(!props.editable || !ready.value || !p.locationName)return
  locatingCustomId.value=p.id;keyword.value=p.locationName
  await searchPlaces()
  message.value='请选择准确地点，再点击搜索结果右侧“关联”；城市中心不能自动视为景点。'
}
async function confirmCustomLocation(place:SearchPlace){
  const p=storyPoints.value.find(s=>s.id===locatingCustomId.value && s.pointType==='CUSTOM')
  if(!p || busy.value || !props.editable)return
  if(!window.confirm(`为原记忆「${p.title}」关联「${place.name}」的位置？请确认这是实际景点，而非仅表示城市的中心位置。此操作不会创建新记忆。`))return
  busy.value=true
  try{
    const result=await anchorCustomMemoryApi(props.travelId,p.id,place.lng,place.lat)
    if(result.code!==200)throw new Error(result.message||'位置关联失败')
    locatingCustomId.value=null;searchPlacesList.value=[]
    await loadData()
    message.value='已关联已有记忆，刷新后仍可显示，未创建额外记录。'
  }catch(e){errorText(e,'位置关联失败')}finally{busy.value=false}
}

const photos = ref<TravelMedia[]>([])
const selectedId = ref<number|null>(null)
const selected = computed(() => points.value.find(p=>p.id===selectedId.value) ?? null)
const creating = ref(false)
const draftMarker = shallowRef<any>(null)
const apiOnline = ref<boolean|null>(null)
// PHASE9_ROUTE_FEATURE · 路线顺序与地图图钉序号统一
const routeOrder = ref<MemorySortMode>('manual')
const routeVisible = ref(true)
const orderedPoints = computed(() => sortMemories(points.value, routeOrder.value))
let travelPolyline: any = null
const sharedRoute = shallowRef<TravelRoute | null>(null)
const routeBusy = ref(false)
const routeError = ref('')
const routeProgress = ref('')
let routeAbort: AbortController | null = null
let routeTimer: ReturnType<typeof setTimeout> | undefined
const geometrySignature = computed(() => journeyGeometrySignature(orderedPoints.value))
const routeCaption = computed(() => routeBusy.value ? `正在规划道路路线${routeProgress.value}`
  : sharedRoute.value ? `${sharedRoute.value.stopIds.length} 站 · ${(sharedRoute.value.distanceMeters/1000).toFixed(2)} km · ${sharedRoute.value.cacheState === 'STALE_CACHE' ? '沿用较早缓存路线' : sharedRoute.value.cacheState === 'CACHE' ? '已恢复缓存路线' : sharedRoute.value.cacheState === 'SERVER' ? '云端保存的路线' : '2D / 3D 共用驾车路线'}`
    : routeError.value ? `${routeError.value}；当前虚线仅表示地点顺序` : `串联 ${orderedPoints.value.length} 个地理记忆点`)

/**
 * Route Snapshot v1: server snapshot is authoritative for manual point order.
 * A dated custom order remains local because backend snapshots use sort_order,id.
 * The existing 2D route remains usable when the snapshot API is unavailable.
 */
async function refreshTravelRoute(forceNetwork = false) {
  routeAbort?.abort()
  const controller = new AbortController()
  routeAbort = controller
  const previous = isTravelRouteConsistent(sharedRoute.value, props.travelId, orderedPoints.value) ? sharedRoute.value : null
  const locallyCached = previous || readCachedTravelRoute(props.travelId, orderedPoints.value)
  sharedRoute.value = locallyCached
  routeError.value = ''
  routeProgress.value = ''
  routeBusy.value = false
  updateRouteLine()
  if (!sdk.value || validJourneyPoints(orderedPoints.value).length < 2) return

  const signature = geometrySignature.value
  const syncEnabled = routeOrder.value === 'manual'
  let snapshot: TravelRouteState | null = null
  if (syncEnabled) {
    try {
      const response = await getRouteSnapshotApi(props.travelId, controller.signal)
      if (controller.signal.aborted || signature !== geometrySignature.value) return
      if (response.code === 200 && response.data) {
        snapshot = response.data
        const saved = snapshot.cacheState === 'READY' ? snapshot.route : null
        if (isTravelRouteConsistent(saved, props.travelId, orderedPoints.value)) {
          const cloudRoute = { ...saved!, cacheState: 'SERVER' as const }
          sharedRoute.value = cloudRoute
          cacheTravelRoute(cloudRoute)
          updateRouteLine()
          if (!forceNetwork) return
        }
      }
    } catch (error) {
      // Older backend / temporarily offline: keep existing browser-cache behavior.
      if (controller.signal.aborted) return
      console.debug('Route snapshot not available, using local route:', error)
    }
  }

  if (sharedRoute.value && !forceNetwork) {
    // Migrate an existing verified browser cache to the server once, when needed.
    if (syncEnabled && props.editable && snapshot && snapshot.cacheState !== 'READY'
        && sharedRoute.value.cacheState !== 'STALE_CACHE') {
      try {
        const cached = sharedRoute.value
        const saved = await saveRouteSnapshotApi(
          props.travelId, cached, snapshot.pointSignature, snapshot.revision, controller.signal)
        if (!controller.signal.aborted && signature === geometrySignature.value && saved.code === 200) {
          sharedRoute.value = { ...cached, cacheState: 'SERVER' }
          cacheTravelRoute(sharedRoute.value)
          updateRouteLine()
        }
      } catch(error) {
        // A valid local route remains usable if the server is unavailable.
        console.debug('Could not sync browser cache; continuing locally:', error)
      }
    }
    return
  }
  routeBusy.value = true
  try {
    const route = await buildTravelRoute(sdk.value, props.travelId, orderedPoints.value, controller.signal,
      (done,total) => { if (!controller.signal.aborted) routeProgress.value = ` · ${done}/${total}` })
    if (controller.signal.aborted || signature !== geometrySignature.value) return
    sharedRoute.value = route
    cacheTravelRoute(route)
    // Never upload alternate date order: server validates manual sort_order,id.
    if (syncEnabled && props.editable && snapshot) {
      try {
        const saved = await saveRouteSnapshotApi(
          props.travelId, route, snapshot.pointSignature, snapshot.revision, controller.signal)
        if (!controller.signal.aborted && signature === geometrySignature.value) {
          if (saved.code === 200) {
            sharedRoute.value = { ...route, cacheState: 'SERVER' }
            cacheTravelRoute(sharedRoute.value)
          } else {
            routeError.value = saved.message || '路线已生成，但云端同步失败'
          }
        }
      } catch(error) {
        if (!controller.signal.aborted) {
          routeError.value = '路线已生成，但云端暂时无法保存；本机缓存仍可使用'
          console.debug('Route save failed:', error)
        }
      }
    }
  } catch(error) {
    if (controller.signal.aborted) return
    routeError.value = error instanceof Error ? error.message : '路线读取失败，请重试'
  } finally {
    if (!controller.signal.aborted) { routeBusy.value = false; updateRouteLine() }
  }
}

function updateRouteLine() {
  travelPolyline?.setMap?.(null)
  travelPolyline = null
  if (!map.value || !sdk.value || !routeVisible.value) return
  const route = sharedRoute.value
  const path = route?.geometry.map(p=>[p.lng,p.lat]) || validJourneyPoints(orderedPoints.value).map(p=>[p.longitude,p.latitude])
  if (path.length < 2) return
  travelPolyline = new sdk.value.Polyline({
    map:map.value,path,strokeColor:darkStyle.value?'#B7E5C9':'#275944',strokeWeight:4,strokeOpacity:.95,
    strokeStyle:route ? 'solid' : 'dashed',lineJoin:'round',isOutline:true,outlineColor:darkStyle.value?'#14241f':'#fffdf5',zIndex:95,showDir:true
  })
}


/** 一键把整条旅行路线放进当前视野。 */
function showEntireJourney() {
  if (!map.value || (!markers.size && !customMarkers.size)) return

  map.value.setFitView(
    [...markers.values(),...customMarkers.values(), ...(travelPolyline ? [travelPolyline] : [])],
    false,
    [72, 72, 72, 72],
    15
  )
}

/** 从故事模式跳回地图时，自动定位对应真实地图记忆点。 */
function focusFromStory(id: number | null | undefined) {
  if (id == null) return

  const point = points.value.find(p => p.id === id)
  if (point) choose(point, true)
}

watch(routeVisible, () => {
  updateRouteLine()
})

watch(routeOrder, () => {
  drawPins()
})

/**
 * 同时监听 pointId 和 points 加载完成。
 * 这样兼容你当前已经修改过的 onMounted 写法。
 */
watch(
  [() => props.focusPointId, () => points.value.length],
  ([id]) => {
    focusFromStory(id)
  },
  { immediate: true }
)
const loading = ref(true), ready = ref(false), busy = ref(false), searching = ref(false), placing = ref(false)
watch([geometrySignature, ready], () => {
  routeAbort?.abort()
  sharedRoute.value = null
  routeBusy.value = false
  routeError.value = ''
  updateRouteLine()
  clearTimeout(routeTimer)
  routeTimer = setTimeout(() => void refreshTravelRoute(), 240)
})
const mapError = ref(''), message = ref(''), keyword = ref(''), darkStyle = ref(false)
type SearchPlace = { name:string; address:string; lng:number; lat:number }
const searchPlacesList = ref<SearchPlace[]>([])
const pictureUrl = ref('')
const photoCache = new Map<number,string>()
// ★★★★★【地图记忆点 · 主题封面悬停预览】★★★★★
const themeCoverUrl = ref('')

let hoverInfo: any = null
let hoveredPointId: number | null = null

// 获取本段旅行设置的主题主封面
async function loadThemeCover() {
  try {
    const result = await getThemeArtApi(props.travelId)

    if (result.code !== 200) return

    const mediaId = result.data?.coverMediaId

    if (mediaId == null) return

    let url = photoCache.get(mediaId)

    if (!url) {
      url = await createMediaBlobUrl(props.travelId, mediaId)

      if (!alive) {
        URL.revokeObjectURL(url)
        return
      }

      photoCache.set(mediaId, url)
    }

    themeCoverUrl.value = url

    // 图片加载完成后，更新正在显示的悬停卡片
    if (hoveredPointId !== null) {
      const point = points.value.find(
        p => p.id === hoveredPointId
      )

      if (point) showPointHover(point)
    }
  } catch (error) {
    // 主题设置接口仅允许创建者读取。
    console.debug('主题封面暂不可用：', error)
  }
}

// 显示悬停卡片
function showPointHover(p: RealMapPoint) {
  if (!map.value || !sdk.value) return

  hoveredPointId = p.id

  const card = document.createElement('div')
  card.className = 'tm-hover-card'

  if (themeCoverUrl.value) {
    const img = document.createElement('img')

    img.className = 'tm-hover-image'
    img.src = themeCoverUrl.value
    img.alt = '旅行主题封面'

    card.appendChild(img)
  } else {
    const placeholder = document.createElement('div')

    placeholder.className = 'tm-hover-placeholder'
    placeholder.textContent = '✿'

    card.appendChild(placeholder)
  }

  const info = document.createElement('div')
  info.className = 'tm-hover-info'

  const label = document.createElement('small')
  label.textContent = '✦ TRAVEL MEMORY'

  const title = document.createElement('strong')
  title.textContent = p.title

  const place = document.createElement('span')
  place.textContent = p.locationName || '一段珍贵的旅行记忆'

  info.append(label, title, place)
  card.appendChild(info)

  if (!hoverInfo) {
    hoverInfo = new sdk.value.InfoWindow({
      isCustom: true,
      offset: new sdk.value.Pixel(0, -48),
      closeWhenClickMap: false,
      autoMove: false
    })
  }

  hoverInfo.setContent(card)

  hoverInfo.open(map.value, [
    p.longitude,
    p.latitude
  ])
}

// 鼠标离开，关闭预览
function hidePointHover() {
  hoveredPointId = null
  hoverInfo?.close?.()
}

const draft = reactive({ mediaId:null as number|null, title:'', subtitle:'', content:'', locationName:'', travelDate:'', lng:0, lat:0, sortOrder:0 })
let searchService:any = null
let alive = true

function errorText(e:unknown, fallback:string) { message.value = e instanceof Error ? e.message : fallback }
function toPayload(p:RealMapPoint):RealMapPointPayload {
  return { mediaId:p.mediaId,title:p.title,subtitle:p.subtitle,content:p.content,
    locationName:p.locationName,travelDate:p.travelDate,longitude:p.longitude,latitude:p.latitude,sortOrder:p.sortOrder }
}
function draftPayload():RealMapPointPayload {
  return { mediaId:draft.mediaId,title:draft.title,subtitle:draft.subtitle||null,content:draft.content||null,
    locationName:draft.locationName||null,travelDate:draft.travelDate||null,
    longitude:draft.lng,latitude:draft.lat,sortOrder:Number(draft.sortOrder)||0 }
}
async function setPreview(mediaId:number|null) {
  pictureUrl.value = ''
  if(mediaId == null) return
  if(photoCache.has(mediaId)) { pictureUrl.value = photoCache.get(mediaId)||'';return }
  try {
    const url = await createMediaBlobUrl(props.travelId,mediaId)
    if(!alive){URL.revokeObjectURL(url);return}
    photoCache.set(mediaId,url)
    if(draft.mediaId===mediaId)pictureUrl.value=url
  } catch { /* 未授权照片保持隐藏，不影响地图文字 */ }
}
watch(()=>draft.mediaId, id=>{void setPreview(id)})
function choose(p:RealMapPoint, focus=false) {
  selectedCustom.value=null
  clearDraftMarker()
  creating.value = false
  selectedId.value = p.id
  draft.title=p.title;draft.subtitle=p.subtitle||'';draft.content=p.content||''
  draft.locationName=p.locationName||'';draft.travelDate=p.travelDate||''
  draft.lng=p.longitude;draft.lat=p.latitude;draft.sortOrder=p.sortOrder;draft.mediaId=p.mediaId
  if(focus && map.value)map.value.setZoomAndCenter(Math.max(13,map.value.getZoom()),[p.longitude,p.latitude])
  for(const [id,mark] of markers) {
    const element=mark.getContent?.()
    if(element instanceof HTMLElement)element.classList.toggle('pin-active',id===p.id)
  }
  void setPreview(p.mediaId)
}
function markerDom(index:number):HTMLElement {
  // 不用 innerHTML；用户输入不会被解释成 HTML。
  const div=document.createElement('div');div.className='travel-geo-pin'
  const flower=document.createElement('span');flower.textContent='✿';flower.className='pin-flower'
  const label=document.createElement('span');label.className='pin-index';label.textContent=String(index+1)
  div.append(flower,label);return div
}
function drawPins(){
  if(!map.value||!sdk.value)return
  clearDraftMarker()
  for(const mark of markers.values())mark.setMap(null)
  markers.clear()
  orderedPoints.value.forEach((p,index)=>{
    const mark=new sdk.value.Marker({map:map.value,position:[p.longitude,p.latitude],
      content:markerDom(index),offset:new sdk.value.Pixel(-19,-39),draggable:props.editable,zIndex:150})
    mark.on('click',()=>choose(p))
    // ★★★★★【鼠标悬停显示主题封面】★★★★★
    mark.on('mouseover', () => {
      showPointHover(p)
    })
    mark.on('mouseout', () => {
      hidePointHover()
    })
    mark.on('dragstart', () => {
      hidePointHover()
    })
    if(props.editable)mark.on('dragend',()=>{void saveDrag(p,mark)})
    markers.set(p.id,mark)
  })
  updateRouteLine()
  if(selected.value) choose(selected.value)
}
async function saveDrag(p:RealMapPoint,mark:any){
  const pos=mark.getPosition?.()
  const longitude=Number(pos?.getLng?.()),latitude=Number(pos?.getLat?.())
  if(!Number.isFinite(longitude)||!Number.isFinite(latitude))return
  if(busy.value){mark.setPosition([p.longitude,p.latitude]);return}
  busy.value=true
  try {
    const result=await updateRealMapPointApi(props.travelId,p.id,{...toPayload(p),longitude,latitude})
    if(result.code!==200)throw new Error(result.message||'位置保存失败')
    const i=points.value.findIndex(q=>q.id===p.id)
    if(i>=0)points.value[i]=result.data
    updateRouteLine()
    if(selectedId.value===p.id){draft.lng=longitude;draft.lat=latitude}
    message.value='✿ 记忆点新位置已保存'
  }catch(e){mark.setPosition([p.longitude,p.latitude]);errorText(e,'保存位置失败')}
  finally{busy.value=false}
}
async function loadData(){
  loading.value=true
  try {
    const [result,media,story]=await Promise.allSettled([getRealMapPointsApi(props.travelId),getTravelMediaApi(props.travelId),getTravelStoryPointsApi(props.travelId)])
    if(!alive)return
    if(result.status!=='fulfilled')throw result.reason
    if(result.value.code!==200)throw new Error(result.value.message||'读取真实地图失败')
    apiOnline.value=true
    points.value=result.value.data||[]
    if(media.status==='fulfilled'&&media.value.code===200) photos.value=media.value.data||[]
    storyPoints.value=story.status==='fulfilled'&&story.value.code===200?story.value.data||[]:[]
    drawPins();drawCustomPins()
    if(points.value.length){
      const current=points.value.find(p=>p.id===selectedId.value)??points.value[0]!
      choose(current)
      restoreOrFit()
    } else {selectedId.value=null;pictureUrl.value='';restoreOrFit()}
  }catch(e){apiOnline.value=false;errorText(e,'读取地图记忆点失败')}finally{if(alive)loading.value=false}
}
function clearDraftMarker(){
  if(draftMarker.value){
    draftMarker.value.setMap?.(null)
    draftMarker.value = null
  }
}
function beginDraftAt(lng:number,lat:number,placeName=''){
  selectedCustom.value=null;locatingCustomId.value=null
  if(!props.editable||!ready.value||busy.value)return
  if(!Number.isFinite(lng)||!Number.isFinite(lat))return

  creating.value = true
  selectedId.value = null
  pictureUrl.value = ''
  draft.mediaId = null
  draft.title = placeName ? `${placeName}的回忆` : '新的旅行记忆'
  draft.subtitle = ''
  draft.content = ''
  draft.locationName = placeName
  draft.travelDate = ''
  draft.lng = lng
  draft.lat = lat
  draft.sortOrder = points.value.length

  clearDraftMarker()
  if(map.value && sdk.value){
    draftMarker.value = new sdk.value.Marker({
      map: map.value,
      position: [lng, lat],
      content: markerDom(points.value.length),
      offset: new sdk.value.Pixel(-19,-39),
      draggable: true,
      zIndex: 260
    })
    draftMarker.value.on('dragend',()=>{
      const pos=draftMarker.value?.getPosition?.()
      const nextLng=Number(pos?.getLng?.()),nextLat=Number(pos?.getLat?.())
      if(Number.isFinite(nextLng)&&Number.isFinite(nextLat)){
        draft.lng=nextLng;draft.lat=nextLat
      }
    })
  }

  placing.value=false
  map.value?.setStatus?.({ doubleClickZoom: true })
  if(mapElement.value) mapElement.value.style.cursor=''
  searchPlacesList.value=[]
  message.value='✿ 已选择位置。先编辑右侧内容，再点击「创建记忆点」保存到服务器。'
}
function cancelDraft(){
  creating.value=false
  clearDraftMarker()
  message.value='已取消新建记忆点'
  if(points.value.length && selectedId.value==null) choose(points.value[0]!)
}
async function retryBackend(){
  message.value='正在重新连接 Spring Boot…'
  await loadData()
  if(apiOnline.value) message.value='✿ 后端连接正常，可以保存记忆点'
}
async function save(){
  if(!props.editable||busy.value)return
  if(!draft.title.trim()){message.value='请填写标题';return}
  if(!creating.value && !selected.value)return

  busy.value=true
  try{
    if(creating.value){
      const result=await createRealMapPointApi(props.travelId,draftPayload())
      if(result.code!==200)throw new Error(result.message||'创建失败')
      apiOnline.value=true
      points.value.push(result.data)
      creating.value=false
      clearDraftMarker()
      drawPins()
      choose(result.data,true)
      message.value='✿ 记忆点已创建并保存'
      return
    }

    const result=await updateRealMapPointApi(props.travelId,selected.value!.id,draftPayload())
    if(result.code!==200)throw new Error(result.message||'保存失败')
    apiOnline.value=true
    const i=points.value.findIndex(p=>p.id===selectedId.value)
    if(i>=0)points.value[i]=result.data
    drawPins();choose(result.data);message.value='✿ 记忆点故事已保存'
  }catch(e){
    apiOnline.value=false
    errorText(e,creating.value?'创建地图点失败':'保存失败')
  }finally{busy.value=false}
}
async function remove(){
  if(!props.editable||!selected.value||busy.value)return
  const p=selected.value
  if(!window.confirm(`删除记忆点「${p.title}」？`))return
  busy.value=true
  try{
    const result=await deleteRealMapPointApi(props.travelId,p.id)
    if(result.code!==200)throw new Error(result.message||'删除失败')
    points.value=points.value.filter(q=>q.id!==p.id)
    selectedId.value=null;drawPins()
    if(points.value.length)choose(points.value[0]!)
    else pictureUrl.value=''
    message.value='已删除记忆点'
  }catch(e){errorText(e,'删除失败')}finally{busy.value=false}
}
function togglePlacing(){
  placing.value=!placing.value
  if(placing.value){
    clearDraftMarker()
    creating.value=false
    selectedId.value=null
    message.value='✿ 选点模式：请在地图上单击一次。双击仍由高德用于缩放。'
    map.value?.setStatus?.({ doubleClickZoom: false })
    if(mapElement.value) mapElement.value.style.cursor='crosshair'
  } else {
    map.value?.setStatus?.({ doubleClickZoom: true })
    if(mapElement.value) mapElement.value.style.cursor=''
  }
}
function changeStyle(){ darkStyle.value=!darkStyle.value;map.value?.setMapStyle(darkStyle.value?'amap://styles/dark':'amap://styles/normal');updateRouteLine() }
function flyTo(place:SearchPlace){map.value?.setZoomAndCenter(15,[place.lng,place.lat]);searchPlacesList.value=[]}
async function searchPlaces(){
  if(!searchService||!keyword.value)return
  searching.value=true;searchPlacesList.value=[]
  try{
    await new Promise<void>((resolve,reject)=>{
      searchService.search(keyword.value,(status:string,result:any)=>{
        if(status!=='complete'){reject(new Error('没有找到地点，请试试完整地址'));return}
        const pois:any[]=result?.poiList?.pois||[]
        searchPlacesList.value=pois.flatMap(p=>{
          const lng=Number(p.location?.getLng?.()),lat=Number(p.location?.getLat?.())
          return Number.isFinite(lng)&&Number.isFinite(lat)?[{name:String(p.name||'未知地点'),address:String(p.address||''),lng,lat}]:[]
        }).slice(0,6)
        if (status !== 'complete') {
        console.error('高德地点搜索失败：', status, result)

        const detail =
          typeof result === 'string'
            ? result
            : String(result?.info || result?.message || status)

        reject(
          new Error(
            status === 'no_data'
              ? '没有找到地点，请试试完整地址'
              : `高德地点搜索失败：${detail}`
          )
        )
        return
      }
        resolve()
      })
    })
  }catch(e){errorText(e,'搜索失败')}finally{searching.value=false}
}
async function initMap(){
  if(!mapElement.value)return
  try{
    const AMap=await loadTravelAMap()
    if(!alive)return
    sdk.value=AMap
    const initialView=readViewport()
    map.value=new AMap.Map(mapElement.value,{center:initialView?[initialView.lng,initialView.lat]:[105,35],zoom:initialView?.zoom||5,viewMode:'2D',mapStyle:'amap://styles/normal',scrollWheel:true,dragEnable:true})
    // Only user-initiated gestures update the saved view. Initial fit/marker selection never does.
    for(const event of ['dragstart','touchstart']) map.value.on(event,()=>{userMovedMap=true})
    mapElement.value.addEventListener('wheel',()=>{userMovedMap=true},{passive:true})
    mapElement.value.addEventListener('pointerdown',()=>{userMovedMap=true},{passive:true})
    map.value.on('moveend',()=>{
      if(!userMovedMap) return
      const center=map.value?.getCenter?.(),zoom=Number(map.value?.getZoom?.())
      const lng=Number(center?.getLng?.()),lat=Number(center?.getLat?.())
      if(Number.isFinite(lng)&&Number.isFinite(lat)&&Number.isFinite(zoom))
        try {localStorage.setItem(viewportKey(),JSON.stringify({lng,lat,zoom}))} catch {/* storage disabled */}
    })
    map.value.addControl(new AMap.Scale({position:'LB'}))
    map.value.addControl(new AMap.ToolBar({position:'RB'}))
    searchService=new AMap.PlaceSearch({city:'全国',pageSize:6,panel:false,autoFitView:false})
    map.value.on('click',(e:any)=>{
      if(!placing.value||!props.editable||busy.value)return
      const lng=Number(e.lnglat?.getLng?.()),lat=Number(e.lnglat?.getLat?.())
      if(Number.isFinite(lng)&&Number.isFinite(lat))beginDraftAt(lng,lat)
    })
    ready.value=true
    drawPins();drawCustomPins()
    restoreOrFit()
  }catch(e){mapError.value=e instanceof Error?e.message:'高德加载失败：检查 Key、安全密钥和域名白名单'}
}
onMounted(async () => {
  await Promise.all([
    initMap(),
    loadData(),
    loadThemeCover()
  ])
})
onBeforeUnmount(()=>{
  clearTimeout(routeTimer)
  routeAbort?.abort()
  clearDraftMarker()
  alive=false
  travelPolyline?.setMap?.(null)
  travelPolyline = null
  for(const mark of markers.values())mark.setMap(null)
  for(const mark of customMarkers.values())mark.setMap(null)
  customMarkers.clear()
  markers.clear();map.value?.destroy?.()
  map.value=null
  for(const url of photoCache.values())URL.revokeObjectURL(url)
  photoCache.clear()
  hidePointHover()
  hoverInfo?.destroy?.()
  hoverInfo = null
})
</script>
<style scoped>
/* ★★★★★【第9阶段：真实地图旅行轨迹工具条】★★★★★ */
.phase9-route-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 11px 14px;
  margin: 0 0 13px;
  border: 1px solid rgba(255, 255, 255, .92);
  border-radius: 18px;
  color: #87506c;
  background:
    linear-gradient(
      95deg,
      rgba(255, 249, 252, .96),
      rgba(255, 235, 244, .94)
    );
  box-shadow:
    0 9px 25px
    rgba(216, 148, 178, .11);
}

.phase9-route-caption {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-right: auto;
}

.phase9-route-caption b {
  font-size: 13px;
}

.phase9-route-caption small {
  font-size: 10px;
  color: #ae879a;
}

.phase9-route-bar label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #9c7290;
}

.phase9-route-bar select {
  padding: 8px 12px;
  border: 1px solid #f6d1e2;
  border-radius: 11px;
  color: #854969;
  background: #fff;
}

.phase9-pill {
  padding: 9px 14px;
  border: 1px solid #f6d1e2;
  border-radius: 999px;
  color: #a56f89;
  cursor: pointer;
  font-size: 11px;
  background: #fff;
}

.phase9-pill.emphasis {
  border: 0;
  color: #7f4662;
  font-weight: 800;
  background:
    linear-gradient(
      120deg,
      #ffd6e8,
      #fff0c8
    );
}

.phase9-pill:disabled {
  opacity: .4;
  cursor: not-allowed;
}

@media (max-width: 690px) {
  .phase9-route-caption {
    width: 100%;
  }
}

.real-map-view{min-width:0}
.world-btn,.world-back-btn{padding:11px 15px;border:0;border-radius:13px;cursor:pointer;font:inherit;font-size:12px;font-weight:850;color:#fff;background:linear-gradient(125deg,#b45d8a,#ef8fb7);box-shadow:0 10px 25px rgba(179,86,131,.24);transition:transform .2s,opacity .2s}
.world-btn:hover,.world-back-btn:hover{transform:translateY(-2px)}
.world-btn:disabled{cursor:not-allowed;opacity:.42;transform:none}
.world-back-btn{color:#7b4560;background:linear-gradient(125deg,#fff,#ffe6f1);border:1px solid #f4cfde}

.real-atlas{padding:23px;border-radius:29px;border:1px solid #fff;background:linear-gradient(142deg,#fffcfef0,#ffe7f1de);box-shadow:0 23px 55px #d789a624;color:#75415d}
.atlas-title{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:17px}
.eyebrow{font-size:10px;letter-spacing:.16em;color:#c57f9f;font-weight:800;margin:0 0 7px}
.atlas-title h2{font-size:clamp(22px,2.6vw,30px);margin:0}
.atlas-title p:last-child{color:#aa8095;font-size:12px;margin:7px 0 0}
.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.plain-btn,.pink-btn,.del-btn{padding:11px 15px;cursor:pointer;border:0;border-radius:13px;font:inherit;font-size:12px;transition:transform .2s}
.plain-btn:hover,.pink-btn:hover{transform:translateY(-2px)}.plain-btn{background:#fff;color:#895069}
.pink-btn{background:linear-gradient(115deg,#ffc5dd,#fff0bf);font-weight:800;color:#824563;box-shadow:0 9px 24px #d988ac25}
.pink-btn:disabled,.del-btn:disabled{cursor:wait;opacity:.55}
.message{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff2f7;color:#a25a7a;border-radius:14px;margin-bottom:14px;padding:12px 16px;font-size:12px}.message-retry{border:0;border-radius:999px;padding:7px 12px;background:#fff;color:#96536f;font:inherit;font-weight:800;cursor:pointer;white-space:nowrap}
.workspace{display:grid;grid-template-columns:minmax(0,1fr) 325px;gap:15px;align-items:start}
.map-box{position:relative;min-width:0;height:585px;border-radius:23px;overflow:hidden;isolation:isolate;background:#202b3b;box-shadow:0 16px 38px #4a536c30}
.amap-canvas{position:absolute;inset:0;width:100%;height:100%}
.map-loading{position:absolute;z-index:9;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;text-align:center;padding:23px;color:#fce5f0;background:linear-gradient(135deg,#314159,#172437)}
.map-loading>span{font-size:57px;color:#ffd0e4}.map-loading h3{margin:0;font-size:23px}.map-loading p{max-width:370px;font-size:12px;line-height:1.8;margin:0}.map-loading a{color:#ffd0e4}
.search-wrap{position:absolute;top:15px;left:15px;z-index:10;width:min(398px,calc(100% - 30px))}
.search-input{display:flex;align-items:center;gap:9px;height:49px;padding:5px 6px 5px 13px;border-radius:16px;box-sizing:border-box;background:#fffafded;border:1px solid #fff;box-shadow:0 12px 29px #0f1b3659}
.search-input>span{color:#bd6c92;font-size:22px}.search-input input{flex:1;min-width:0;outline:0;border:0;background:transparent;color:#744663;font:inherit;font-size:12px}
.search-input button{border:0;background:#ffe1ec;color:#814966;font:inherit;font-size:12px;font-weight:700;padding:9px 12px;border-radius:12px;cursor:pointer}
.search-list{margin-top:6px;max-height:230px;overflow:auto;padding:5px;border-radius:14px;background:#fffcfdf5;box-shadow:0 15px 35px #1e203f66}
.search-result{display:flex;gap:4px;padding:4px 5px;border-bottom:1px solid #f9e7ef}.search-result:last-child{border-bottom:0}
.go-place{flex:1;text-align:left;min-width:0;border:0;background:none;cursor:pointer;color:#764664;font:inherit;padding:7px}.go-place b,.go-place small{display:block;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.go-place b{font-size:12px}.go-place small{font-size:10px;color:#ae869a;margin-top:4px}
.quick-add{align-self:center;width:32px;height:32px;background:#ffdae8;color:#874f6e;border:0;border-radius:10px;font-size:19px;cursor:pointer}
.placing-tip{position:absolute;left:15px;top:76px;z-index:3;border-radius:22px;padding:10px 14px;background:#fffa;backdrop-filter:blur(10px);color:#fcecf4;font-size:12px}
.map-label{position:absolute;bottom:14px;left:14px;z-index:4;border-radius:20px;background:#172333b9;color:#fff;padding:9px 13px;backdrop-filter:blur(10px);font-size:11px}
.panel{max-height:585px;overflow:auto;border-radius:23px;background:#fffcfdef;border:1px solid #fff;padding:17px;box-sizing:border-box;scrollbar-width:thin;scrollbar-color:#edbfd3 transparent}
.panel-header{padding:5px 3px 13px}.panel-header h3{margin:0 0 9px;font-size:20px}.panel-header small{font-size:11px;color:#ae8198}
.empty{padding:30px 10px;display:grid;justify-items:center;text-align:center;gap:12px;color:#ab8094;line-height:1.8;font-size:12px}.empty>span{font-size:40px;color:#db93b3}.empty b{font-size:15px;color:#89546d}.empty p{margin:0}
.point-list{display:grid;gap:7px;max-height:195px;overflow:auto;padding:3px}
.point-entry{display:flex;gap:10px;align-items:center;width:100%;padding:11px 9px;border-radius:14px;border:1px solid #f9e3ee;background:#fffafc;color:#8b5a74;font:inherit;text-align:left;cursor:pointer}
.point-entry.chosen{background:linear-gradient(105deg,#ffe1ec,#fff3dc);border-color:#f6b9d3}.point-number{font-size:11px;color:#c27e9f;font-weight:900}.point-name{flex:1;min-width:0}.point-name b,.point-name small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.point-name b{font-size:12px;color:#75435f}.point-name small{color:#b5849d;font-size:10px;margin-top:5px}
.point-editor{margin-top:13px;padding-top:13px;border-top:1px dashed #efc5d8}.point-editor label{display:block;font-size:11px;color:#a77992;margin-top:12px}
.point-editor input,.point-editor textarea,.point-editor select{width:100%;box-sizing:border-box;padding:10px;margin-top:6px;border:1px solid #f5d8e4;background:#fffafd;border-radius:12px;outline:0;color:#784461;font:inherit;font-size:12px}
.point-editor input:focus,.point-editor textarea:focus,.point-editor select:focus{border-color:#db95b6;box-shadow:0 0 0 3px #fac8de4d}
.coords{padding:11px;margin-top:12px;border-radius:12px;background:#fff1f7;color:#a36f89;font-size:11px}.coords small{display:block;color:#bf94a8;margin-top:5px;font-size:10px}
.save-actions{display:flex;gap:8px;margin-top:13px}.save-actions .pink-btn{flex:1}.del-btn{color:#c36a84;background:#fff0f3}
.preview{border-radius:13px;overflow:hidden;max-height:170px}.preview img{display:block;width:100%;height:160px;object-fit:cover}
.read-only h3{font-size:17px}.read-only p,.read-only blockquote{color:#a77d93;font-size:12px;line-height:1.8}.read-only blockquote{margin:9px 0;padding:5px 12px;border-left:3px solid #f6b1cd}.read-only p:last-child{white-space:pre-wrap}
.real-atlas footer{text-align:right;margin-top:13px;color:#bf90a7;font-size:10px}
/* SDK 注入的自定义 Marker 元素需要穿透 scoped 样式 */
:global(.travel-geo-pin){position:relative;width:39px;height:41px;display:grid;place-items:center;filter:drop-shadow(0 5px 8px #16223693);cursor:pointer;transition:transform .18s}
:global(.travel-geo-pin .pin-flower){display:grid;place-items:center;width:35px;height:35px;border-radius:50% 50% 50% 12%;border:2px solid #fff;background:linear-gradient(140deg,#fff9fb,#ffc4db);font-size:22px;color:#ad5b82;transform:rotate(-45deg)}
:global(.travel-geo-pin .pin-index){position:absolute;left:14px;top:10px;font-size:9px;font-weight:900;color:#ae517e}
:global(.travel-geo-pin.pin-active){transform:scale(1.19) translateY(-5px);filter:drop-shadow(0 7px 13px #eb8bbaaa)}
@media(max-width:1030px){.workspace{grid-template-columns:minmax(0,1fr) 270px}}
@media(max-width:800px){.workspace{grid-template-columns:1fr}.map-box{height:470px}.panel{max-height:none}.real-atlas{padding:14px}}
@media(max-width:470px){.map-box{height:420px}.actions{width:100%}.actions button{flex:1}.search-wrap{top:10px;left:10px;width:calc(100% - 20px)}.real-atlas{border-radius:22px}}
/* ★★★★★【记忆点悬停主题封面卡片】★★★★★ */

:global(.tm-hover-card) {
  width: 218px;
  overflow: hidden;
  border-radius: 18px;

  background: rgba(255, 248, 252, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.9);

  box-shadow:
    0 15px 40px rgba(207, 105, 151, 0.25),
    0 0 18px rgba(255, 183, 212, 0.24);

  backdrop-filter: blur(18px);
  pointer-events: none;

  animation: memoryHoverIn 0.25s ease both;
}

:global(.tm-hover-image),
:global(.tm-hover-placeholder) {
  display: block;
  width: 100%;
  height: 132px;
  object-fit: cover;
}

:global(.tm-hover-placeholder) {
  display: grid;
  place-items: center;
  color: #cf78a0;
  font-size: 38px;
  background: linear-gradient(135deg, #ffe0ec, #fff0c9);
}

:global(.tm-hover-info) {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #77445f;
}

:global(.tm-hover-info small) {
  color: #d17fa4;
  font-size: 9px;
  letter-spacing: 1.5px;
}

:global(.tm-hover-info strong) {
  font-size: 15px;
}

:global(.tm-hover-info span) {
  color: #a27891;
  font-size: 11px;
}

@keyframes memoryHoverIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.94);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.anchored-list{margin-top:16px}.anchored-list .eyebrow{padding:6px 0}.unlocated-panel{margin-top:15px;padding:12px;border:1px solid #efcadc;border-radius:14px;background:#fff5fa;font-size:12px;color:#986b82}.unlocated-panel summary{cursor:pointer;font-weight:750}.unlocated-panel p{line-height:1.7}.unlocated-panel button{display:block;margin:7px 0;border:1px solid #e4b2cc;border-radius:9px;padding:8px 12px;color:#8c5070;background:#fff;cursor:pointer}.unlocated-panel button:focus-visible{outline:2px solid #bd6c97;outline-offset:2px}
.real-atlas{border-radius:5px;background:var(--tm-sheet);color:var(--tm-ink);border-color:var(--tm-line);box-shadow:none}
.atlas-title h2,.panel-header h3{font-family:var(--tm-display)}
.real-atlas .eyebrow,.atlas-title p:last-child,.panel-header small,.phase9-route-caption small,.phase9-route-bar label,.real-atlas footer{color:var(--tm-muted)}
.phase9-route-bar,.panel{background:var(--tm-paper);color:var(--tm-ink);border:1px solid var(--tm-line);border-radius:5px;box-shadow:none}
.map-box{border-radius:4px}
.phase9-pill,.phase9-route-bar select,.plain-btn,.world-back-btn{background:var(--tm-sheet);color:var(--tm-accent);border:1px solid var(--tm-line);border-radius:4px}
.phase9-pill.emphasis,.pink-btn,.world-btn{background:var(--tm-accent);color:var(--tm-sheet);border-radius:4px;box-shadow:none}
.point-entry{border-color:var(--tm-line);border-radius:4px;background:var(--tm-sheet);color:var(--tm-accent)}
.point-entry.chosen{background:#deece2;border-color:#7e9c8c}
.point-name b{color:var(--tm-ink)}
.point-name .point-place,.point-name small{color:var(--tm-muted);font-size:.7rem}
.point-name .entry-coordinates,.point-number{font-family:var(--tm-index);color:var(--tm-accent)}
.search-input,.search-list,.search-input button,.placing-tip{border-radius:4px;color:var(--tm-accent);background:var(--tm-sheet)}
@media(prefers-reduced-motion:reduce){
 .world-btn,.world-back-btn,.plain-btn,.pink-btn,.del-btn{transition:none;transform:none}
}
</style>
