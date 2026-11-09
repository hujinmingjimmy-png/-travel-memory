<template>
  <section class="story-book">
    <header class="story-top">
      <div>
        <p class="eyebrow">Field Notes / 沿途故事</p>
        <h2>沿途的每一章</h2>
        <p class="top-note">沿着时间线翻阅照片，再回到地图上的这一站。</p>
      </div>
      <div class="story-actions">
        <label class="sort-label">
          故事排列
          <select v-model="sortMode">
            <option value="manual">手动顺序</option>
            <option value="date">旅行日期</option>
          </select>
        </label>
        <button class="refresh" type="button" :disabled="loading" @click="loadStory">↻ 刷新故事</button>
      </div>
    </header>

    <p v-if="error" class="status error" role="alert">{{ error }}</p>
    <p v-if="loading" class="status">正在翻开旅行手账…</p>
    <div v-else-if="!ordered.length" class="no-story">
      <span>✿</span>
      <h3>旅行故事还没有第一章</h3>
      <p>{{ editable ? '先在地图添加记忆点，再为它写下故事。' : '创建者还没有添加旅行故事。' }}</p>
      <button v-if="editable" type="button" class="refresh" @click="$emit('create')">去地图添加记忆点</button>
    </div>
    <template v-else>
      <div class="story-count">{{ ordered.length }} 个记忆片段 · {{ sortMode === 'manual' ? '按照你设置的顺序讲述' : '按照旅行日期讲述' }}</div>
      <div class="timeline">
        <article v-for="(point,index) in visiblePoints" :key="`${point.pointType}-${point.id}`" class="chapter">
          <div class="line-rail"><span>{{ String(index + 1).padStart(2, '0') }}</span></div>
          <div class="chapter-card">
            <div v-if="point.mediaId != null" class="photo-side">
              <img v-if="photoUrl(point.mediaId)" :src="photoUrl(point.mediaId)" :alt="`${point.title}的旅行照片`" loading="lazy" />
              <div v-else class="photo-loading">✿<small>旅行照片</small></div>
              <span class="photo-sticker">MEMORY · {{ index + 1 }}</span>
            </div>
            <div class="chapter-body">
              <div class="meta"><span>{{ point.travelDate || '未填写日期' }}</span><span>{{ point.pointType === 'REAL' ? '⌖ 真实地点' : '▧ 手账记忆' }}</span></div>
              <h3>{{ point.title }}</h3>
              <p class="location" v-if="point.locationName">✿ {{ point.locationName }}</p>
              <blockquote v-if="point.subtitle">“{{ point.subtitle }}”</blockquote>
              <p class="content" v-if="point.content">{{ point.content }}</p>
              <p class="content muted" v-else>这一站的故事，还等着你慢慢写下。</p>
              <button type="button" class="locate" @click="emit('locate', { pointId: point.id, pointType: point.pointType })">在{{ point.pointType === 'REAL' ? '真实地图' : '手账地图' }}中查看 <span>↗</span></button>
            </div>
          </div>
        </article>
      </div>
      <div v-if="showCount < ordered.length" class="show-more">
        <button type="button" @click="showCount += 8">再翻 8 段记忆 · {{ ordered.length - showCount }} 段待阅读</button>
      </div>
      <div v-else class="end-note">✿ —— 这一段旅行的故事，未完待续 —— ✿</div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { createMediaBlobUrl } from '@/api/media'
import { getTravelStoryPointsApi, type TravelStoryPoint } from '@/api/travelStory'
import { sortMemories, type MemorySortMode } from '@/utils/memoryOrder'

const props = defineProps<{ travelId: number; editable?:boolean }>()
const emit = defineEmits<{ create:[];locate: [item: { pointId: number; pointType: 'CUSTOM' | 'REAL' }] }>()

const loading = ref(true)
const error = ref('')
const points = ref<TravelStoryPoint[]>([])
const showCount = ref(8)
const sortMode = ref<MemorySortMode>('manual')
const ordered = computed(() => sortMemories(points.value, sortMode.value))
const visiblePoints = computed(() => ordered.value.slice(0, showCount.value))

// ★★★★★【私密照片】★★★★★ 通过 JWT 下载 Blob；离开页面时统一释放 URL。
const imageUrls = reactive<Record<number, string>>({})
const inFlight = new Set<number>()
let currentVersion = 0
let alive = true

function photoUrl(mediaId: number | null): string {
  return mediaId == null ? '' : (imageUrls[mediaId] || '')
}

function releaseAllImages() {
  for (const [id, url] of Object.entries(imageUrls)) {
    URL.revokeObjectURL(url)
    delete imageUrls[Number(id)]
  }
  inFlight.clear()
}

async function ensurePhoto(mediaId: number, version: number, travelId: number) {
  if (imageUrls[mediaId] || inFlight.has(mediaId)) return
  inFlight.add(mediaId)
  try {
    const url = await createMediaBlobUrl(travelId, mediaId)
    if (!alive || currentVersion !== version || travelId !== props.travelId) {
      URL.revokeObjectURL(url)
      return
    }
    imageUrls[mediaId] = url
  } catch (err) {
    // 图片无权限或已删除时，只隐藏图片，不破坏故事文字。
    console.debug('这张旅行照片暂时无法显示', err)
  } finally {
    inFlight.delete(mediaId)
  }
}

watch(visiblePoints, (current) => {
  const version = currentVersion
  const travelId = props.travelId
  for (const p of current) if (p.mediaId != null) void ensurePhoto(p.mediaId, version, travelId)
})

async function loadStory() {
  const version = ++currentVersion
  releaseAllImages()
  loading.value = true
  error.value = ''
  try {
    const result = await getTravelStoryPointsApi(props.travelId)
    if (!alive || currentVersion !== version) return
    if (result.code !== 200) throw new Error(result.message || '读取旅行故事失败')
    points.value = result.data || []
    showCount.value = 8
  } catch (err) {
    if (!alive || currentVersion !== version) return
    points.value = []
    error.value = err instanceof Error ? err.message : '暂时无法读取旅行故事'
  } finally {
    if (alive && currentVersion === version) loading.value = false
  }
}

watch(() => props.travelId, () => { void loadStory() })
onMounted(() => { void loadStory() })
onBeforeUnmount(() => { alive = false; ++currentVersion; releaseAllImages() })
</script>

<style scoped>
.story-book{padding:30px 28px 45px;margin-top:12px;border:1px solid rgba(255,255,255,.94);border-radius:29px;background:linear-gradient(135deg,rgba(255,252,254,.92),rgba(255,228,240,.92));box-shadow:0 20px 52px rgba(213,112,155,.12);color:#78445f}
.story-top{display:flex;justify-content:space-between;gap:20px;align-items:center;flex-wrap:wrap}.eyebrow{margin:0 0 6px;font-size:10px;font-weight:800;letter-spacing:.16em;color:#c778a1}.story-top h2{font-size:clamp(22px,3vw,31px);margin:5px 0}.top-note{font-size:12px;line-height:1.8;color:#a17b90;margin:7px 0}.story-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.sort-label{display:flex;align-items:center;gap:9px;font-size:12px;color:#a36b88}
.sort-label select,.refresh{padding:11px 13px;border:1px solid #f4c8dd;border-radius:14px;background:#fffafa;color:#8d5573;outline:none;cursor:pointer}.refresh:disabled{opacity:.6;cursor:wait}
.status{margin:20px 0;padding:16px 20px;border-radius:17px;background:#fff;color:#986582}.error{color:#ba567f}.no-story{margin-top:22px;border:1px dashed #efbdd2;background:#fff7fb;border-radius:24px;text-align:center;padding:70px 16px}.no-story>span{display:block;font-size:45px;color:#da83a9}.no-story h3{margin:14px 0 8px}.no-story p{font-size:12px;color:#a47b91}.story-count{margin:27px 0 22px 10px;color:#b77c99;font-size:11px;letter-spacing:.09em}
.timeline{position:relative;display:grid;gap:24px}.timeline:before{content:'';position:absolute;left:30px;top:4px;bottom:20px;width:2px;background:linear-gradient(#f3a6c6,#f6d1e3,#eac6dc)}.chapter{position:relative;display:grid;grid-template-columns:62px minmax(0,1fr);gap:20px;align-items:start}.line-rail{z-index:2;padding-top:27px}.line-rail span{display:grid;place-items:center;width:55px;height:55px;border:5px solid #fff;border-radius:50%;background:linear-gradient(145deg,#f9c3db,#fff0bf);font-weight:900;font-size:16px;box-shadow:0 9px 25px #e5a0bf50}
.chapter-card{display:flex;gap:23px;padding:17px;background:#fff9fc;border:1px solid #fff;border-radius:22px;box-shadow:0 12px 31px rgba(209,115,153,.10);transition:transform .3s,box-shadow .3s;min-height:194px}.chapter-card:hover{transform:translateY(-3px);box-shadow:0 19px 40px rgba(209,115,153,.17)}.photo-side{width:30%;max-width:265px;min-width:130px;aspect-ratio:4/3;position:relative;overflow:hidden;flex-shrink:0;border-radius:13px;background:linear-gradient(135deg,#fcd4e4,#f5dcb8)}.photo-side img{width:100%;height:100%;object-fit:cover;display:block}.photo-loading{height:100%;display:grid;place-content:center;gap:3px;text-align:center;font-size:32px;color:#c67ca2}.photo-loading small{font-size:10px}.photo-sticker{position:absolute;bottom:10px;left:10px;background:#fff9;padding:5px 8px;font-size:9px;letter-spacing:.1em;border-radius:999px}
.chapter-body{min-width:0;flex:1;display:flex;flex-direction:column;align-items:flex-start}.meta{display:flex;gap:8px;flex-wrap:wrap;font-size:10px;font-weight:700;color:#c581a2}.meta span{background:#ffe8f3;border-radius:999px;padding:5px 9px}.chapter h3{margin:11px 0 6px;line-height:1.4;font-size:clamp(18px,2.2vw,23px)}.location{margin:0 0 9px;font-size:12px;color:#a87990}.chapter blockquote{margin:8px 0;padding:6px 12px;border-left:3px solid #eaa4c4;font-size:13px;color:#a26282}.content{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9;font-size:12px;color:#765069;margin:7px 0 16px}.muted{color:#bc9aae}.locate{margin-top:auto;cursor:pointer;background:linear-gradient(120deg,#ffdaea,#fff0c9);border:0;border-radius:999px;padding:10px 14px;color:#985a7a;font-weight:800;font-size:11px}.locate span{margin-left:10px}
.show-more,.end-note{text-align:center;margin-top:24px}.show-more button{border:1px solid #f3bdd7;background:#fffafa;border-radius:999px;padding:13px 22px;color:#a76789;cursor:pointer}.end-note{font-size:12px;color:#c087a4}
@media(max-width:760px){.story-book{padding:20px 13px}.chapter{grid-template-columns:38px minmax(0,1fr);gap:8px}.timeline:before{left:18px}.line-rail span{width:35px;height:35px;border-width:3px;font-size:11px}.chapter-card{flex-direction:column;padding:13px;gap:12px}.photo-side{width:100%;max-width:none;aspect-ratio:16/9}.story-actions{width:100%}}
@media(prefers-reduced-motion:reduce){.chapter-card{transition:none}}
.story-book{background:var(--tm-paper);border-color:var(--tm-line);border-radius:5px;color:var(--tm-ink);box-shadow:none}
.story-top h2,.chapter h3{font-family:var(--tm-display)}
.eyebrow,.story-count{color:var(--tm-accent);font-family:var(--tm-index)}
.top-note,.sort-label,.location,.content,.muted,.end-note{color:var(--tm-muted)}
.timeline:before{background:#a6baab}
.line-rail span{background:var(--tm-accent);color:var(--tm-sheet);border-color:var(--tm-paper);box-shadow:none;font-family:var(--tm-index)}
.chapter-card{background:var(--tm-sheet);border-color:var(--tm-line);border-radius:4px;box-shadow:none}
.chapter-card:hover{box-shadow:var(--tm-lift)}
.chapter h3,.chapter blockquote{overflow-wrap:anywhere}
.chapter blockquote{color:#325445;border-color:#8ba995}
.photo-side{background:var(--tm-street) center / cover;align-self:start;width:39%;max-width:345px;border-radius:3px}
.photo-loading{background:#14241f78;color:#fff}
.photo-sticker,.meta span{border-radius:3px;background:var(--tm-paper);color:var(--tm-muted)}
.locate,.refresh,.sort-label select,.show-more button{border:1px solid var(--tm-line);background:var(--tm-sheet);color:var(--tm-accent);border-radius:4px;min-height:40px}
.no-story{border-color:var(--tm-line);border-radius:4px;background:var(--tm-sheet)}
.no-story p{color:var(--tm-muted)}
@media(max-width:760px){.photo-side{width:100%;max-width:none;min-width:0}}
@media(prefers-reduced-motion:reduce){.chapter-card:hover{transform:none}}
</style>
