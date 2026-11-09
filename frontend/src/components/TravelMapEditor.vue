<template>
  <section class="memory-map">
    <header class="map-header">
      <div>
        <p class="eyebrow">MAP MEMORY · 01 / THREE MODES</p>
        <h2>✿ 旅行地图</h2>
        <p class="intro">把照片留在发生故事的位置。拖动粉色记忆点，移动结束后自动保存。</p>
      </div>
      <div class="header-actions">
        <button class="soft-btn" type="button" :disabled="loading" @click="refresh">↻ 刷新地图</button>
        <button v-if="editable" class="pink-btn" type="button" :disabled="busy || loading" @click="createPoint()">＋ 添加记忆点</button>
      </div>
    </header>

    <p v-if="message" class="message" role="status">{{ message }}</p>
    <p v-if="loading" class="load-message">正在加载旅行地图…</p>

    <div v-else class="map-layout">
      <div class="canvas-column">
        <div v-if="editable" class="background-picker">
          <label for="map-image-select">★★★★★【地图专用背景图片】★★★★★</label>
          <div class="picker-row">
            <select id="map-image-select" v-model="backgroundSelection">
              <option value="">不使用背景图片（粉色地图）</option>
              <option v-for="m in photos" :key="m.id" :value="String(m.id)">
                {{ m.originalName || `照片 #${m.id}` }}
              </option>
            </select>
            <button class="pink-btn" type="button" :disabled="busy" @click="saveBackground">保存背景</button>
          </div>
          <small>背景从当前旅行已上传的相册中选取；不会修改首页主题的封面或背景。</small>
        </div>

        <!-- 画布的宽高比与背景照片原始宽高比一致，坐标百分比与图片实际位置严格对应。 -->
        <div
          ref="mapSurface"
          class="map-surface"
          :style="{ aspectRatio: mapRatio }"
          @dblclick="addAtPosition"
        >
          <img v-if="backgroundBlobUrl" class="map-art" :src="backgroundBlobUrl" alt="旅行地图背景" draggable="false" />
          <div v-else class="map-fallback" aria-hidden="true">
            <span class="flower flower-one">✿</span><span class="flower flower-two">✿</span>
            <span class="placeholder-title">地图等待你的第一段回忆</span>
            <span class="placeholder-subtitle">选择背景照片，或直接在地图上添加记忆点</span>
          </div>
          <div class="canvas-vignette" aria-hidden="true"></div>

          <button
            v-for="(point, index) in points" :key="point.id"
            type="button"
            class="memory-pin"
            :class="{ selected: point.id === selectedId, dragging: draggingId === point.id }"
            :style="{ left: `${point.xRatio * 100}%`, top: `${point.yRatio * 100}%` }"
            :title="`${point.title} (${Math.round(point.xRatio * 100)}%, ${Math.round(point.yRatio * 100)}%)`"
            :aria-label="`记忆点 ${point.title}`"
            @pointerdown="startDrag($event, point)"
            @pointermove="moveDrag($event, point)"
            @pointerup="endDrag($event, point)"
            @pointercancel="cancelDrag($event)"
            @click="choosePoint(point)"
          >
            <span class="pin-number">{{ index + 1 }}</span>
            <span class="pin-label">{{ point.title }}</span>
          </button>
          <span class="map-tip">{{ editable ? '双击空白处添加 · 拖动图钉定位' : '点击图钉查看记忆' }}</span>
        </div>
        <div class="map-footnote">
          <span>⌖ 比例坐标：0～1</span>
          <span>{{ points.length }} 个记忆点</span>
          <span>自适应屏幕缩放</span>
        </div>
      </div>

      <aside class="editor-panel">
        <div class="panel-heading">
          <p class="eyebrow">MEMORY POINTS</p>
          <h3>旅行记忆点</h3>
        </div>

        <div v-if="!points.length" class="empty-panel">还没有记忆点。{{ editable ? '点击左上角「添加记忆点」，或双击地图空白处创建。' : '创作者尚未留下地图记忆。' }}</div>
        <template v-else>
          <div class="point-list">
            <button v-for="(p, index) in sortedPoints" :key="p.id" type="button"
              class="point-list-item" :class="{ active: selectedId === p.id }" @click="choosePoint(p)">
              <span class="list-number">{{ index + 1 }}</span>
              <span class="list-title"><strong>{{ p.title }}</strong><small>{{ p.locationName || p.travelDate || '未填写地点' }}</small></span>
              <span class="list-arrow">↗</span>
            </button>
          </div>
        </template>

        <div v-if="selectedPoint" class="point-editor">
          <h4>{{ editable ? '编辑记忆点' : '这段旅行的故事' }}</h4>
          <div class="selected-photo" v-if="selectedPoint.mediaId && photoUrlById(selectedPoint.mediaId)">
            <img :src="photoUrlById(selectedPoint.mediaId)" alt="记忆点照片" />
          </div>
          <template v-if="editable">
            <label>标题<input v-model="draft.title" maxlength="80" placeholder="例如：洱海日落" /></label>
            <label>地点<input v-model="draft.locationName" maxlength="120" placeholder="例如：云南 · 大理" /></label>
            <label>发生日期<input v-model="draft.travelDate" type="date" /></label>
            <label>一句话<input v-model="draft.subtitle" maxlength="150" placeholder="夕阳落在湖面上…" /></label>
            <label>关联相册照片<select v-model="draft.mediaId">
              <option value="">不关联照片</option>
              <option v-for="m in photos" :key="m.id" :value="String(m.id)">{{ m.originalName || `照片 #${m.id}` }}</option>
            </select></label>
            <label>故事顺序<input v-model.number="draft.sortOrder" type="number" min="0" max="100000" /></label>
            <label>记忆故事<textarea v-model="draft.content" rows="4" maxlength="10000" placeholder="写下这里发生的故事…"></textarea></label>
            <div class="coord-label">相对坐标：{{ selectedPoint.xRatio.toFixed(4) }} / {{ selectedPoint.yRatio.toFixed(4) }}</div>
            <div class="editor-actions">
              <button class="pink-btn" type="button" :disabled="busy" @click="savePoint">{{ busy ? '保存中…' : '保存内容' }}</button>
              <button class="danger-btn" type="button" :disabled="busy" @click="removePoint">删除</button>
            </div>
          </template>
          <div v-else class="readonly-story">
            <p><strong>地点：</strong>{{ selectedPoint.locationName || '旅途中某个地方' }}</p>
            <p><strong>日期：</strong>{{ selectedPoint.travelDate || '暂未记录' }}</p>
            <p v-if="selectedPoint.subtitle">{{ selectedPoint.subtitle }}</p>
            <p class="memory-text">{{ selectedPoint.content || '这段回忆还没有填写故事。' }}</p>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { createMediaBlobUrl, getTravelMediaApi, type TravelMedia } from '@/api/media'
import {
  getTravelMapApi, setMapBackgroundApi, createTravelPointApi,
  updateTravelPointApi, deleteTravelPointApi,
  type TravelPoint, type TravelPointRequest
} from '@/api/travelMap'

const props = defineProps<{ travelId: number; editable: boolean; focusPointId?: number | null }>()
type Picture = TravelMedia & { blobUrl: string }
const mapSurface = ref<HTMLDivElement | null>(null)
const points = ref<TravelPoint[]>([])
const photos = ref<Picture[]>([])
const backgroundSelection = ref('')
const mapRatio = ref('16 / 10')
const loading = ref(true)
const busy = ref(false)
const message = ref('')
const selectedId = ref<number | null>(null)
const draggingId = ref<number | null>(null)
const selectedPoint = computed(() => points.value.find(p => p.id === selectedId.value) ?? null)
const sortedPoints = computed(() => [...points.value].sort((a,b) => a.sortOrder - b.sortOrder || a.id - b.id))
const backgroundBlobUrl = computed(() => photoUrlById(backgroundSelection.value ? Number(backgroundSelection.value) : null))

interface Draft {
  title: string
  locationName: string
  travelDate: string
  subtitle: string
  mediaId: string
  sortOrder: number
  content: string
}
const draft = reactive<Draft>({ title: '', locationName: '', travelDate: '', subtitle: '', mediaId: '', sortOrder: 0, content: '' })

function photoUrlById(id: number | null): string {
  return photos.value.find(p => p.id === id)?.blobUrl || ''
}
watch(() => props.focusPointId, id => {
  const point = points.value.find(p => p.id === id)
  if (point) choosePoint(point)
})

function choosePoint(p: TravelPoint) {
  selectedId.value = p.id
  draft.title = p.title
  draft.locationName = p.locationName || ''
  draft.travelDate = p.travelDate || ''
  draft.subtitle = p.subtitle || ''
  draft.mediaId = p.mediaId == null ? '' : String(p.mediaId)
  draft.sortOrder = p.sortOrder
  draft.content = p.content || ''
}
function releaseUrls(data: Picture[]) {
  for (const picture of data) if (picture.blobUrl) URL.revokeObjectURL(picture.blobUrl)
}
let version = 0
let destroyed = false
async function refresh() {
  const v = ++version
  loading.value = true
  message.value = ''
  let loaded: Picture[] = []
  try {
    const [mapResult, photoResult] = await Promise.all([
      getTravelMapApi(props.travelId), getTravelMediaApi(props.travelId)
    ])
    if (mapResult.code !== 200) throw new Error(mapResult.message || '读取地图失败')
    if (photoResult.code !== 200) throw new Error(photoResult.message || '读取相册失败')
    const list = photoResult.data || []
    loaded = await Promise.all(list.map(async m => {
      try {
        const blobUrl = await createMediaBlobUrl(props.travelId, m.id)
        return { ...m, blobUrl }
      } catch { return { ...m, blobUrl: '' } }
    }))
    if (destroyed || v !== version) { releaseUrls(loaded); return }
    releaseUrls(photos.value)
    photos.value = loaded
    points.value = mapResult.data.points || []
    backgroundSelection.value = mapResult.data.mapBackgroundMediaId == null
      ? '' : String(mapResult.data.mapBackgroundMediaId)
    // PHASE9_JOURNAL_FOCUS · 从故事卡片回到手账地图时优先选中对应图钉
    const current =
      points.value.find(p => p.id === props.focusPointId)
      || points.value.find(p => p.id === selectedId.value)
      || points.value[0]
    if (current) choosePoint(current)
    else selectedId.value = null
  } catch (error) {
    releaseUrls(loaded)
    if (v === version && !destroyed) message.value = error instanceof Error ? error.message : '地图加载失败'
  } finally {
    if (v === version && !destroyed) loading.value = false
  }
}

// ★★★★★【真实背景比例】★★★★★ 避免 object-fit:cover 裁切后让图钉坐标跑位。
watch(backgroundBlobUrl, url => {
  if (!url) { mapRatio.value = '16 / 10'; return }
  const image = new Image()
  image.onload = () => {
    if (backgroundBlobUrl.value === url && image.naturalWidth && image.naturalHeight) {
      mapRatio.value = `${image.naturalWidth} / ${image.naturalHeight}`
    }
  }
  image.src = url
}, { immediate: true })

async function saveBackground() {
  if (!props.editable || busy.value) return
  busy.value = true
  try {
    const id = backgroundSelection.value ? Number(backgroundSelection.value) : null
    const result = await setMapBackgroundApi(props.travelId, id)
    if (result.code !== 200) throw new Error(result.message)
    message.value = '地图背景已保存（电影式首页的背景不会改变）'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存地图背景失败'
  } finally { busy.value = false }
}

function clamp(v: number): number { return Math.min(1, Math.max(0, v)) }
function fromEvent(event: MouseEvent | PointerEvent) {
  const rect = mapSurface.value?.getBoundingClientRect()
  if (!rect || !rect.width || !rect.height) return { x: 0.5, y: 0.5 }
  return {
    x: clamp((event.clientX - rect.left) / rect.width),
    y: clamp((event.clientY - rect.top) / rect.height)
  }
}
async function createPoint(location = { x: 0.5, y: 0.5 }) {
  if (!props.editable || busy.value) return
  busy.value = true
  try {
    const result = await createTravelPointApi(props.travelId, {
      title: '新的记忆点', subtitle: null, content: null, locationName: null,
      travelDate: null, mediaId: null, xRatio: location.x,
      yRatio: location.y, sortOrder: points.value.length
    })
    if (result.code !== 200) throw new Error(result.message)
    points.value.push(result.data)
    choosePoint(result.data)
    message.value = '记忆点创建成功，拖动定位后可以在右侧填写故事'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '创建记忆点失败'
  } finally { busy.value = false }
}
function addAtPosition(event: MouseEvent) {
  if (!props.editable || (event.target as HTMLElement).closest('.memory-pin')) return
  void createPoint(fromEvent(event))
}
function toRequest(p: TravelPoint, useDraft = true): TravelPointRequest {
  return {
    mediaId: useDraft ? (draft.mediaId ? Number(draft.mediaId) : null) : p.mediaId,
    title: useDraft ? draft.title.trim() : p.title,
    subtitle: useDraft ? (draft.subtitle.trim() || null) : p.subtitle,
    content: useDraft ? (draft.content.trim() || null) : p.content,
    locationName: useDraft ? (draft.locationName.trim() || null) : p.locationName,
    travelDate: useDraft ? (draft.travelDate || null) : p.travelDate,
    sortOrder: useDraft ? Number(draft.sortOrder) : p.sortOrder,
    xRatio: Number(p.xRatio.toFixed(6)),
    yRatio: Number(p.yRatio.toFixed(6))
  }
}
async function savePoint() {
  if (!selectedPoint.value || !props.editable || busy.value) return
  busy.value = true
  try {
    const p = selectedPoint.value
    const result = await updateTravelPointApi(props.travelId, p.id, toRequest(p))
    if (result.code !== 200) throw new Error(result.message)
    replacePoint(result.data)
    choosePoint(result.data)
    message.value = '记忆点内容已保存'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存失败'
  } finally { busy.value = false }
}
function replacePoint(point: TravelPoint) {
  const index = points.value.findIndex(p => p.id === point.id)
  if (index >= 0) points.value.splice(index, 1, point)
}
async function removePoint() {
  const point = selectedPoint.value
  if (!point || !props.editable || busy.value) return
  if (!window.confirm(`确定要删除记忆点「${point.title}」吗？`)) return
  busy.value = true
  try {
    const result = await deleteTravelPointApi(props.travelId, point.id)
    if (result.code !== 200) throw new Error(result.message)
    points.value = points.value.filter(p => p.id !== point.id)
    const next = points.value[0]
    if (next) choosePoint(next)
    else selectedId.value = null
    message.value = '记忆点已删除'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '删除失败'
  } finally { busy.value = false }
}

// Pointer Events 同时兼容桌面鼠标和触屏。整个移动过程只在内存中改坐标；松手才 PUT 一次。
let dragOrigin: { x: number; y: number } | null = null
let moved = false
function startDrag(e: PointerEvent, p: TravelPoint) {
  choosePoint(p)
  if (!props.editable || busy.value) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  e.preventDefault()
  draggingId.value = p.id
  dragOrigin = { x: p.xRatio, y: p.yRatio }
  moved = false
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function moveDrag(e: PointerEvent, p: TravelPoint) {
  if (draggingId.value !== p.id || !dragOrigin) return
  const loc = fromEvent(e)
  p.xRatio = loc.x
  p.yRatio = loc.y
  if (Math.abs(p.xRatio - dragOrigin.x) > 0.0005 || Math.abs(p.yRatio - dragOrigin.y) > 0.0005) moved = true
  e.preventDefault()
}
async function endDrag(e: PointerEvent, p: TravelPoint) {
  if (draggingId.value !== p.id) return
  const el = e.currentTarget as HTMLElement
  if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  draggingId.value = null
  const before = dragOrigin
  dragOrigin = null
  if (!moved) return
  busy.value = true
  try {
    const result = await updateTravelPointApi(props.travelId, p.id, toRequest(p, false))
    if (result.code !== 200) throw new Error(result.message)
    replacePoint(result.data)
    message.value = `位置已保存：${Math.round(result.data.xRatio * 100)}% / ${Math.round(result.data.yRatio * 100)}%`
  } catch (error) {
    if (before) { p.xRatio = before.x; p.yRatio = before.y }
    message.value = error instanceof Error ? error.message : '位置保存失败'
  } finally { busy.value = false }
}
function cancelDrag(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  const p = points.value.find(point => point.id === draggingId.value)
  if (p && dragOrigin) { p.xRatio = dragOrigin.x; p.yRatio = dragOrigin.y }
  draggingId.value = null
  dragOrigin = null
}
watch(() => props.travelId, refresh, { immediate: true })
onBeforeUnmount(() => {
  destroyed = true
  version++
  releaseUrls(photos.value)
  photos.value = []
})
</script>

<style scoped>
.memory-map{width:100%;min-width:0;box-sizing:border-box;padding:22px;border:1px solid rgba(255,255,255,.82);border-radius:28px;color:#75405b;background:rgba(255,247,251,.63);box-shadow:0 22px 60px rgba(207,113,152,.13);backdrop-filter:blur(20px)}
.map-header{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:18px}
.map-header h2{margin:5px 0 6px;font-size:29px}.map-header p{margin:0}.eyebrow{font-size:11px;letter-spacing:.13em;color:#c8759e;font-weight:750}
.intro{font-size:13px;line-height:1.7;color:#a9788f}.header-actions{display:flex;gap:9px;flex-wrap:wrap}
.pink-btn,.soft-btn,.danger-btn{border:0;cursor:pointer;min-height:39px;padding:0 14px;border-radius:13px;font-weight:700;white-space:nowrap}
.pink-btn{background:linear-gradient(115deg,#ffc5dc,#ffedbd);color:#7d3d5c;box-shadow:0 8px 21px rgba(221,116,164,.15)}
.soft-btn{background:rgba(255,255,255,.73);color:#94617c}.danger-btn{background:#fff0f4;color:#bd5e85}
button:disabled{opacity:.55;cursor:not-allowed}.message,.load-message{margin:8px 0 14px;padding:11px 14px;border-radius:12px;background:rgba(255,234,244,.88);color:#915570;font-size:13px}
.map-layout{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(260px,1fr);gap:18px;align-items:start}
.canvas-column{min-width:0}.background-picker{margin-bottom:12px;padding:14px;border-radius:16px;background:rgba(255,255,255,.55)}
.background-picker label{display:block;font-size:12px;font-weight:750;margin-bottom:8px}.background-picker small{display:block;font-size:11px;color:#a07188;margin-top:8px}
.picker-row{display:flex;gap:8px}.picker-row select{min-width:0;flex:1}
select,input,textarea{width:100%;box-sizing:border-box;border:1px solid rgba(227,135,175,.32);border-radius:10px;outline:none;padding:10px 11px;color:#75425d;background:#fffafb;font:inherit}
select:focus,input:focus,textarea:focus{border-color:#e58db8;box-shadow:0 0 0 3px rgba(237,166,196,.18)}
.map-surface{width:100%;position:relative;isolation:isolate;overflow:hidden;border:5px solid #fff;border-radius:24px;box-sizing:border-box;box-shadow:0 22px 50px rgba(175,97,141,.14);background:#ffd4e4;touch-action:pan-y}
.map-art{display:block;position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;user-select:none}
.map-fallback{position:absolute;inset:0;display:flex;align-items:center;flex-direction:column;justify-content:center;gap:10px;background:linear-gradient(130deg,#ffcee0,#e8d8e7 52%,#e4f0ea);text-align:center}
.flower{position:absolute;color:#fff6fb;font-size:90px;opacity:.5}.flower-one{left:8%;top:7%}.flower-two{right:10%;bottom:9%}
.placeholder-title{font-weight:850;font-size:clamp(17px,2vw,25px);z-index:1}.placeholder-subtitle{font-size:12px;opacity:.65;z-index:1}
.canvas-vignette{position:absolute;inset:0;pointer-events:none;background:linear-gradient(0deg,rgba(98,53,81,.19),transparent 30%,rgba(255,255,255,.05));z-index:1}
.memory-pin{position:absolute;z-index:3;transform:translate(-50%,-50%);border:2px solid #fff;display:flex;gap:6px;align-items:center;padding:5px 8px 5px 5px;border-radius:100px;background:rgba(255,233,242,.95);box-shadow:0 6px 18px rgba(107,52,77,.24);cursor:pointer;touch-action:none;user-select:none;max-width:190px;transition:background .12s,box-shadow .12s}
.memory-pin.selected{z-index:4;background:#ffbed7;box-shadow:0 0 0 5px rgba(255,209,228,.42),0 8px 22px rgba(117,52,85,.22)}
.memory-pin.dragging{cursor:grabbing;transition:none;z-index:5}.pin-number{flex:none;width:26px;height:26px;border-radius:100%;display:grid;place-items:center;background:#fff;color:#d26b98;font-weight:900}
.pin-label{font-weight:750;color:#854764;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.map-tip{position:absolute;bottom:12px;right:12px;pointer-events:none;z-index:2;font-size:11px;color:#75435e;background:rgba(255,253,255,.79);padding:7px 10px;border-radius:99px}
.map-footnote{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;margin-top:9px;font-size:11px;color:#ac7893}
.editor-panel{min-width:0;border:1px solid rgba(255,255,255,.8);background:rgba(255,255,255,.47);border-radius:23px;padding:19px}
.panel-heading h3{font-size:21px;margin:5px 0 14px}.empty-panel{font-size:13px;color:#9b7188;line-height:1.8}
.point-list{display:grid;gap:7px;max-height:250px;overflow:auto;margin-bottom:16px}.point-list-item{width:100%;display:flex;align-items:center;gap:10px;text-align:left;padding:10px;border:1px solid transparent;border-radius:13px;background:rgba(255,255,255,.56);cursor:pointer;color:#82455f}
.point-list-item.active{background:#ffe2ef;border-color:#efb2cc}.list-number{width:26px;height:26px;border-radius:9px;background:#ffc6dd;display:grid;place-items:center;font-size:11px;flex:none}
.list-title{display:grid;gap:3px;min-width:0;flex:1}.list-title strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.list-title small{font-size:10px;color:#a5798e}.list-arrow{color:#cf7ca1}
.point-editor{padding-top:10px;border-top:1px dashed #ebc3d6}.point-editor h4{margin:6px 0 14px;font-size:16px}.point-editor label{display:grid;gap:5px;margin:0 0 11px;font-size:12px;color:#915873}
.selected-photo{width:100%;height:150px;overflow:hidden;border-radius:13px;margin-bottom:13px;background:#ffe1ee}.selected-photo img{width:100%;height:100%;object-fit:cover}
.coord-label{font-size:11px;color:#ad7d94;margin-bottom:10px}.editor-actions{display:flex;gap:9px}.readonly-story{font-size:13px;color:#81506a;line-height:1.8}.memory-text{white-space:pre-wrap}
@media(max-width:930px){.map-layout{grid-template-columns:1fr}.map-header{flex-wrap:wrap}}@media(max-width:560px){.memory-map{padding:12px}.picker-row{flex-wrap:wrap}.picker-row button{width:100%}.memory-pin .pin-label{display:none}.map-surface{border-width:3px}.map-tip{font-size:9px}.map-header h2{font-size:24px}}
</style>
