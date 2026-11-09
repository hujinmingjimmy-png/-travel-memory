<template>
  <section class="journey3d-panel">
    <header class="journey3d-plan">
      <div class="plan-copy">
        <p class="eyebrow">REAL JOURNEY → 3D WORLD</p>
        <h3>{{ stale ? '↻ 更新 3D 旅行地图' : '✦ 生成 3D 旅行地图' }}</h3>
        <p>范围包含全部旅行地点和完整驾车路线；确认后才加载 3D 世界。</p>
      </div>
      <div v-if="plan" class="plan-stats">
        <span><b>{{ plan.pointCount }} 站 · {{ plan.routeDistanceKm.toFixed(2) }} km</b><small>旅行站点 / 道路距离</small></span>
        <span><b>{{ plan.widthKm.toFixed(2) }} × {{ plan.heightKm.toFixed(2) }} km</b><small>含完整路线和安全边距</small></span>
        <span><b>{{ plan.lodLabel }}</b><small>推荐模式</small></span>
        <span><b>{{ plan.directionLabel }} · {{ plan.cameraAzimuthDeg.toFixed(0) }}°</b><small>推荐地图方向</small></span>
      </div>
      <p class="load-plan">预计加载：道路 · 建筑 · 水域 · DEM · 模型。实际结果将在生成后显示。</p>
      <div class="plan-actions">
        <div class="theme-choices" aria-label="3D 地图主题">
          <button v-for="option in themes" :key="option.value" type="button" :disabled="busy || preferenceLoading"
            :class="{ active: theme === option.value }" @click="theme = option.value"><span>{{ option.icon }}</span>{{ option.label }}</button>
        </div>
        <button type="button" class="rebuild-btn" :disabled="busy || preferenceLoading || routeBusy || !plan" @click="generate()">
          {{ busy ? '正在生成…' : routeBusy ? '正在规划完整路线…' : stale ? '更新 3D 旅行地图' : sceneConfig ? '重新生成' : '开始生成' }}
        </button>
      </div>
    </header>
    <p v-if="stale" role="status" class="panel-message">地点、顺序、故事或主题已变化，下方场景已过期。请确认新范围后更新。</p>
    <p v-if="routeError" role="alert" class="panel-message">{{ routeError }}。{{ route ? '当前仍可使用已取得的路线。' : '道路路线可用后才能开始生成。' }}
      <button type="button" :disabled="routeBusy" @click="emit('retryRoute')">重新查询路线</button>
    </p>
    <p v-if="message" role="status" class="panel-message">{{ message }}</p>
    <p v-if="plan" class="route-note">车辆在记忆点附近可通行道路上的到站位置停车；2D 和 3D 共享同一条驾车路线。</p>
    <div v-if="sceneConfig && worldRoute" class="world-wrap" :class="{ 'world-stale': stale }">
      <CartoonWorld3D :key="worldKey" :travel-id="travelId" :config="sceneConfig" :points="worldPoints"
        :route="worldRoute" :photo-urls="photoUrls" :theme="worldTheme" @ready="rememberSuccessfulScene" />
      <div v-if="stale" class="stale-overlay"><b>3D 场景已过期</b><span>请点击上方「更新 3D 旅行地图」</span></div>
    </div>
    <div v-else class="world-empty">
      <b>{{ routeBusy ? '正在读取完整道路路线…' : plan ? '生成前确认' : '等待有效路线' }}</b>
      <p>{{ plan ? '检查站点、路线范围和主题，然后点击「开始生成」。' : '请保留至少 2 个不同地点，并等待道路路线查询完成。' }}</p>
    </div>
  </section>
</template>
<script setup lang="ts">
import { withResourceDeadline } from '@/utils/asyncResources'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CartoonWorld3D from '@/components/CartoonWorld3D.vue'
import { createMediaBlobUrl } from '@/api/media'
import { getTravelMapSceneApi, saveTravelMapSceneApi, type CartoonMapStyle, type TravelMapSceneConfig } from '@/api/travelMapScene'
import type { RealMapPoint } from '@/api/travelRealMap'
import { buildJourneyScenePlan } from '@/components/cartoon-world/journeyScene'
import { journeyGeometrySignature, isTravelRouteConsistent, journeySourceHash, travelRouteRevision, toWorldJourneyRoute, validJourneyPoints, type TravelRoute } from '@/utils/travelRoute'
import { gcj02ToWgs84 } from '@/utils/journeyCoordinates'

const props = defineProps<{travelId:number; editable:boolean; points:RealMapPoint[]; route:TravelRoute|null; routeBusy:boolean; routeError:string}>()
const emit = defineEmits<{retryRoute:[]; generated:[sourceHash:string]; staleChange:[stale:boolean]}>()
const themes: Array<{value:CartoonMapStyle;label:string;icon:string}> = [
  {value:'SAKURA',label:'樱花手账',icon:'🌸'},{value:'FRESH',label:'清新日系',icon:'🌿'},
  {value:'PAPER',label:'旅行纸张',icon:'📜'},{value:'NIGHT',label:'夜游城市',icon:'🌙'}
]
const theme=ref<CartoonMapStyle>('FRESH'), worldTheme=ref<CartoonMapStyle>('FRESH')
const sceneConfig=ref<TravelMapSceneConfig|null>(null)
const worldRoute=ref<TravelRoute|null>(null)
const worldPoints=ref<RealMapPoint[]>([])
const photoUrls=ref<Record<number,string>>({})
const generatedRouteRevision=ref('')
const worldKey=ref(0), generatedHash=ref(''), busy=ref(false), preferenceLoading=ref(true), message=ref('')
const ownedUrls=new Set<string>()
let alive=true, generation=0
function projectPoints(points:RealMapPoint[]):RealMapPoint[] {
  // 父组件已经排序；保留同一顺序。数据库与高德图钉仍使用原始 GCJ-02。
  return validJourneyPoints(points).map((p,index)=>{
    const wgs=gcj02ToWgs84({lng:p.longitude,lat:p.latitude})
    return {...p,longitude:wgs.lng,latitude:wgs.lat,sortOrder:index*10}
  })
}
const currentHash=computed(()=>journeySourceHash(props.points))
const pendingRoute=computed(() => isTravelRouteConsistent(props.route ?? null, props.travelId, props.points)
  ? toWorldJourneyRoute(props.route!) : null)
const stale=computed(()=>Boolean(sceneConfig.value && (generatedHash.value!==currentHash.value || worldTheme.value!==theme.value
  || generatedRouteRevision.value!==travelRouteRevision(pendingRoute.value))))
watch(stale,value=>emit('staleChange',value),{immediate:true})
const plan=computed(()=>{
  if(!pendingRoute.value || validJourneyPoints(props.points).length<2) return null
  return buildJourneyScenePlan(props.travelId,projectPoints(props.points),theme.value,pendingRoute.value)
})
function releasePhotos(){for(const url of ownedUrls) URL.revokeObjectURL(url);ownedUrls.clear();photoUrls.value={}}
async function preloadPhotos(points:RealMapPoint[],token:number){
  const next:Record<number,string>={}
  const ids=[...new Set(points.flatMap(p=>p.mediaId==null?[]:[p.mediaId]))]
  await Promise.all(ids.map(async id=>{
    try {
      const url=await withResourceDeadline(async signal=>{
        const loaded=await createMediaBlobUrl(props.travelId,id)
        if(signal.aborted){URL.revokeObjectURL(loaded);throw new DOMException('Aborted','AbortError')}
        return loaded
      },6000)
      if(!alive || token!==generation){URL.revokeObjectURL(url);return}
      ownedUrls.add(url);next[id]=url
    }catch { /* 照片不可用时仍可显示旅行地图。 */ }
  }))
  if(alive && token===generation) photoUrls.value=next
}
/** 只有确认按钮调用；地点变化不会静默保存/重建旧场景。 */
async function generate(persist=true){
  const nextPlan=plan.value, nextRoute=pendingRoute.value
  if(!nextPlan || !nextRoute || busy.value || props.routeBusy || preferenceLoading.value) return
  busy.value=true;message.value=''
  const token=++generation
  const sourceHash=currentHash.value, selectedTheme=theme.value, snapshotPoints=projectPoints(props.points)
  try {
    releasePhotos()
    await preloadPhotos(snapshotPoints,token)
    if(!alive || token!==generation) return
    if(sourceHash!==currentHash.value || selectedTheme!==theme.value){message.value='旅行内容已变化，请重新确认后生成。';return}
    worldPoints.value=snapshotPoints;worldRoute.value=nextRoute;worldTheme.value=selectedTheme
    sceneConfig.value={...nextPlan.config};generatedHash.value=sourceHash;generatedRouteRevision.value=travelRouteRevision(nextRoute);worldKey.value++
    emit('generated',sourceHash)
    // 保存只用于主题/配置持久化。忽略返回的旧 bounds，不让响应改写当前快照。
    if(props.editable&&persist){
      try {
        const {travelId:ignored,...body}=nextPlan.config
        const result=await withResourceDeadline(()=>saveTravelMapSceneApi(props.travelId,body),10000)
        if(result.code!==200) throw new Error(result.message || '配置保存失败')
      }catch {
        if(alive && token===generation) message.value='本次 3D 已生成；场景配置暂未写入服务器，请稍后重试。'
      }
    }
  }finally {if(alive && token===generation) busy.value=false}
}
onMounted(async()=>{
  const initialHash=currentHash.value
  try {
    const result=await withResourceDeadline(()=>getTravelMapSceneApi(props.travelId),5000)
    if(alive && initialHash===currentHash.value && result.code===200 && themes.some(t=>t.value===result.data?.cartoonStyle))
      theme.value=result.data.cartoonStyle
  }catch { /* 已保存的城市范围不能成为新的场景来源。 */ }
  finally {
    if(alive){
      preferenceLoading.value=false
      restoreGeneratedScene()
    }
  }
})
function rememberSuccessfulScene(){
  if(!worldRoute.value||stale.value)return
  try{localStorage.setItem(`tm-generated-v33:${props.travelId}`,JSON.stringify({sourceHash:generatedHash.value,routeRevision:travelRouteRevision(worldRoute.value),theme:worldTheme.value}))}catch{/* 缓存可选 */}
}
function restoreGeneratedScene(){
  if(!alive||preferenceLoading.value||sceneConfig.value||busy.value||!pendingRoute.value)return
  try{
    const stamp=JSON.parse(localStorage.getItem(`tm-generated-v33:${props.travelId}`)||'null')
    if(stamp?.sourceHash===currentHash.value&&stamp.routeRevision===travelRouteRevision(pendingRoute.value)&&themes.some(t=>t.value===stamp.theme)){
      theme.value=stamp.theme
      void generate(false)
    }
  }catch{/* 旧版本或损坏缓存不恢复 */}
}
watch(pendingRoute,()=>restoreGeneratedScene())
onBeforeUnmount(()=>{alive=false;generation++;releasePhotos()})
</script>
<style scoped>
.journey3d-panel{display:grid;gap:14px;margin-top:4px;color:#75415d}.journey3d-plan{display:grid;grid-template-columns:minmax(250px,1fr) minmax(360px,1.2fr);gap:16px;padding:17px;border:1px solid #fff;border-radius:22px;background:linear-gradient(125deg,#fffafd,#ffe7f1);box-shadow:0 14px 36px rgba(180,95,137,.12)}
.plan-copy h3{margin:4px 0 7px;font-size:19px}.plan-copy p:last-child{margin:0;color:#a97b92;font-size:11px;line-height:1.65}.eyebrow{font-size:9px;letter-spacing:.16em;color:#c57f9f;font-weight:850;margin:0 0 6px}.plan-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.plan-stats span{display:grid;gap:2px;padding:9px 11px;border-radius:13px;background:rgba(255,255,255,.76);border:1px solid rgba(247,213,227,.8)}.plan-stats b{font-size:11px;color:#78445f}.plan-stats small{font-size:9px;color:#b08098}.plan-actions{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.theme-choices{display:flex;gap:7px;flex-wrap:wrap}.theme-choices button,.rebuild-btn{border:1px solid #f3ccdc;border-radius:999px;background:#fff;color:#8b5671;padding:8px 11px;font:inherit;font-size:10px;cursor:pointer}.theme-choices button.active{background:linear-gradient(120deg,#ffd7e7,#fff0c6);border-color:#eea6c4;color:#77415c;font-weight:850}.rebuild-btn{font-weight:800}.rebuild-btn:disabled{opacity:.5;cursor:wait}.panel-message{margin:0;padding:10px 13px;border-radius:13px;background:#fff2f7;color:#9a5a77;font-size:11px}.world-wrap{min-width:0;position:relative}.world-stale{min-height:360px}.stale-overlay{position:absolute;inset:0;z-index:50;background:rgba(255,245,250,.92);border-radius:22px;display:grid;place-content:center;text-align:center;gap:10px}.stale-overlay b{font-size:20px}.stale-overlay span{font-size:13px}.load-plan{grid-column:1/-1;margin:0;font-size:11px;color:#8b5671}.route-note{margin:0;font-size:11px;color:#996d85}.panel-message button{margin-left:10px;border:1px solid #f3ccdc;background:#fff;color:#8b5671;border-radius:10px;padding:6px 9px}.world-empty{min-height:360px;display:grid;place-content:center;text-align:center;border:1px dashed #efbfd3;border-radius:22px;background:#fff9fc;color:#9e7088}.world-empty b{font-size:17px}.world-empty p{font-size:11px}
@media(max-width:900px){.journey3d-plan{grid-template-columns:1fr}.plan-actions{grid-column:auto}.plan-stats{grid-template-columns:1fr 1fr}}@media(max-width:560px){.plan-stats{grid-template-columns:1fr}.theme-choices{display:grid;grid-template-columns:1fr 1fr;width:100%}.rebuild-btn{width:100%}}
</style>
