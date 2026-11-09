<template>
  <main class="director">
    <header class="header">
      <button @click="router.push(`/journey/${travelId}`)">← 返回旅行</button>
      <div><small>TRAVEL MEMORY / DIRECTOR STUDIO</small><h1>AI 旅行导演</h1></div>
      <span>电影叙事 · 30s · 16:9</span>
    </header>

    <section class="toolbar">
      <label class="optin"><input v-model="useAi" type="checkbox" /> 使用 AI 文案（会向模型发送旅行文字和照片说明，不上传照片文件）</label>
      <button class="primary" :disabled="loading" @click="generate">{{ loading ? '正在生成…' : '生成六镜头分镜' }}</button>
      <button class="cloud-save" :disabled="!draft || !cloudReady || cloudSaving" @click="saveCloud">
        {{ cloudSaving ? '保存中…' : '保存到云端' }}
      </button>
      <label class="voice-optin"><input v-model="voiceover" type="checkbox" /> AI 旁白（仅将镜头字幕发送给语音服务；声音为 AI 生成）</label>
      <select v-if="voiceover" v-model="selectedVoice" class="voice-choice" aria-label="AI 旁白音色">
        <option value="coral">豆包 Vivi 2.0 · 女声</option>
<option value="alloy">豆包 大壹 2.0 · 男声</option>
<option value="nova">豆包 流畅女声 2.0</option>
      </select>
      <button :disabled="!draft || videoBusy" class="video-export" @click="renderVideo">{{ videoBusy ? '正在导出…' : '导出 30 秒 MP4' }}</button>
      <button v-if="videoReady" @click="downloadVideo">下载 MP4</button>
      <button :disabled="!draft" @click="exportJson">导出分镜 JSON</button>
    </section>

    <p class="cloud-state" role="status">{{ cloudStatus || (cloudLoading ? '正在检查云端草稿…' : '仅保存在当前浏览器') }}</p>
    <div v-if="cloudConflict && cloudDraft" class="conflict" role="alert">
      <strong>检测到不同的云端版本</strong>
      <span>已保留当前浏览器的草稿。你可以载入云端版本，或者点击“保存到云端”并再次确认覆盖。</span>
      <button @click="restoreCloud">载入云端草稿</button>
    </div>
    <p v-if="videoStatus" class="video-status" role="status">{{ videoStatus }}</p>
    <DirectorVideoLibrary :travel-id="travelId" :job-id="videoReady ? videoJobId : ''" :video-title="draft?.title || '鏃呰鐢靛奖'" />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="draft" class="notice">{{ draft.notice }} 可在预览中检查照片与字幕效果；启用 AI 旁白后，导出的 MP4 将按镜头时间轴配音（编辑器预览暂不播放旁白）。本版无背景音乐。</p>
    <section v-if="draft" class="studio">
      <div class="preview-wrap">
        <DirectorFilmPreview :draft="draft" :travel-id="travelId" :playhead="playhead" />
        <div class="play-controls">
          <button @click="togglePlay">{{ playing ? '❚❚ 暂停' : '▶ 播放' }}</button>
          <input type="range" min="0" max="30000" step="100" v-model.number="playhead" aria-label="播放进度" />
          <span>{{ formatTime(playhead) }}</span>
        </div>
      </div>
      <aside class="editor">
        <h3>镜头 {{ selected?.order }} / 6</h3>
        <p>类型：{{ selected?.type }} · {{ ((selected?.durationMs || 0) / 1000) }} 秒</p>
        <label>字幕 / 旁白草稿</label>
        <textarea v-if="selected" v-model="selected.caption" maxlength="120" rows="4" />
        <label>镜头运动</label>
        <select v-if="selected" v-model="selected.motion" aria-label="镜头运动">
          <option value="SLOW_ZOOM_IN">缓慢推近</option>
          <option value="SLOW_ZOOM_OUT">缓慢拉远</option>
          <option value="PAN_LEFT">向左平移</option>
          <option value="PAN_RIGHT">向右平移</option>
          <option value="STILL">固定镜头</option>
          <option value="CROSSFADE">柔和推进</option>
        </select>
        <label>影片标题</label>
        <input v-model="draft.title" maxlength="100" />
        <p class="hint">画面随时间轴播放照片动效；相邻镜头默认交叉淡化。修改运动参数会保存到当前草稿，云端保存仍由你手动确认。</p>
      </aside>
    </section>
    <section v-if="draft" class="timeline" aria-label="六镜头时间轴">
      <button v-for="(shot, index) in draft.shots" :key="index" :class="{ active: activeIndex === index }" @click="selectShot(index)">
        <strong>{{ String(index+1).padStart(2,'0') }} · {{ names[index] }}</strong>
        <span>{{ formatTime(shot.startMs) }}—{{ formatTime(shot.startMs+shot.durationMs) }}</span>
        <small>{{ shot.caption }}</small>
      </button>
    </section>
    <section v-else-if="!loading" class="empty"><h2>把一次真实旅行，剪成 30 秒的电影</h2><p>点击“生成六镜头分镜”开始。无 API Key 也能先使用规则版。</p></section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DirectorFilmPreview from '@/components/DirectorFilmPreview.vue'
import DirectorVideoLibrary from '@/components/DirectorVideoLibrary.vue'
import { generateDirectorDraft, getSavedDirectorDraft, saveDirectorDraft, type DirectorCloudDraft, type DirectorDraft } from '@/api/aiDirector'
import { createVideoJob, createNarratedVideoJob, getVideoJob, downloadVideoFile, type VideoJob } from '@/api/aiDirectorVideo'

const route = useRoute()
const router = useRouter()
const travelId = Number(route.params.id)
const userId = (() => { try { return Number(JSON.parse(localStorage.getItem('travel_user') || '{}').id) || 0 } catch { return 0 } })()
const draft = ref<DirectorDraft | null>(null)
const error = ref('')
const loading = ref(false)
const useAi = ref(false)
const cloudLoading = ref(false)
const cloudSaving = ref(false)
const cloudReady = ref(false)
const cloudConflict = ref(false)
const cloudStatus = ref('')
const cloudRevision = ref(0)
const cloudDraft = ref<DirectorCloudDraft | null>(null)
const cloudSnapshot = ref('')
const voiceover = ref(false)
const selectedVoice = ref('coral')
const videoBusy = ref(false)
const videoReady = ref(false)
const videoStatus = ref('')
const videoJobId = ref('')
let videoPoll: ReturnType<typeof setInterval> | null = null
let videoPolling = false
let videoEpoch = 0
function stopVideoPoll() {
  if (videoPoll) { clearInterval(videoPoll); videoPoll = null }
  videoPolling = false
}
async function renderVideo() {
  if (!draft.value || videoBusy.value) return
  stopVideoPoll()
  const epoch = ++videoEpoch
  videoBusy.value = true
  videoReady.value = false
  videoStatus.value = '正在提交 720p / 30 秒 MP4 导出任务…'
  error.value = ''
  try {
    // Snapshot: a render must not change when the user continues editing.
    const snapshot = JSON.parse(JSON.stringify(draft.value)) as DirectorDraft
    const response = voiceover.value
      ? await createNarratedVideoJob(travelId, snapshot, selectedVoice.value)
      : await createVideoJob(travelId, snapshot)
    if (response.code !== 200 || !response.data?.jobId) throw new Error(response.message || '创建导出任务失败')
    videoJobId.value = response.data.jobId
    const started = Date.now()
    const poll = async () => {
      if (videoPolling || epoch !== videoEpoch || !videoJobId.value) return
      videoPolling = true
      try {
        const state = await getVideoJob(travelId, videoJobId.value)
        if (epoch !== videoEpoch) return
        if (state.code !== 200 || !state.data) throw new Error(state.message || '查询渲染任务失败')
        const job: VideoJob = state.data
        videoStatus.value = `${job.message} · ${job.progress}%`
        if (job.status === 'SUCCEEDED') {
          stopVideoPoll()
          videoBusy.value = false
          videoReady.value = true
        } else if (job.status === 'FAILED') {
          stopVideoPoll()
          videoBusy.value = false
          error.value = job.message || '视频渲染失败'
        } else if (Date.now() - started > 7 * 60 * 1000) {
          stopVideoPoll()
          videoBusy.value = false
          videoStatus.value = '导出仍在服务器处理中，可稍后在当前页面重试查询。'
        }
      } catch (e) {
        if (epoch !== videoEpoch) return
        stopVideoPoll()
        videoBusy.value = false
        error.value = e instanceof Error ? e.message : '查询视频进度失败'
      } finally { videoPolling = false }
    }
    await poll()
    if (videoBusy.value && epoch === videoEpoch) videoPoll = setInterval(() => { void poll() }, 1500)
  } catch (e) {
    videoBusy.value = false
    error.value = e instanceof Error ? e.message : '导出任务创建失败'
  }
}
async function downloadVideo() {
  if (!videoReady.value || !videoJobId.value) return
  try { await downloadVideoFile(travelId, videoJobId.value) }
  catch (e) { error.value = e instanceof Error ? e.message : 'MP4 下载失败' }
}
const activeIndex = ref(0)
const playhead = ref(0)
const playing = ref(false)
const names = ['情绪引子', '地点建立', '抵达', '记忆细节', '情绪高潮', '回味尾声']
const selected = computed(() => draft.value?.shots[activeIndex.value] ?? null)
const storageKey = `tm-ai-director-v1:${userId}:${travelId}`
const voiceSettingsKey = `tm-ai-director-voice:${userId}:${travelId}`
try {
  const savedVoice = JSON.parse(localStorage.getItem(voiceSettingsKey) || '{}') as { enabled?: boolean; voice?: string }
  voiceover.value = savedVoice.enabled === true
  if (['coral', 'alloy', 'nova'].includes(savedVoice.voice || '')) selectedVoice.value = savedVoice.voice!
} catch { /* Optional preference cache. */ }
watch([voiceover, selectedVoice], ([enabled, voice]) => {
  try { localStorage.setItem(voiceSettingsKey, JSON.stringify({ enabled, voice })) } catch { /* Optional */ }
})
let timer: ReturnType<typeof setInterval> | null = null

function selectShot(index: number) {
  activeIndex.value = index
  if (draft.value) playhead.value = draft.value.shots[index]?.startMs || 0
}
function formatTime(ms: number) { return `00:${String(Math.floor(ms / 1000)).padStart(2, '0')}` }
function stopPlay() { playing.value = false; if (timer) { clearInterval(timer); timer = null } }
function togglePlay() {
  if (!draft.value) return
  if (playing.value) { stopPlay(); return }
  if (playhead.value >= 30000) playhead.value = 0
  playing.value = true
  const started = performance.now() - playhead.value
  timer = setInterval(() => {
    const ms = Math.min(30000, Math.max(0, performance.now() - started))
    playhead.value = ms
    if (ms >= 30000) stopPlay()
  }, 50)
}
watch(playhead, (ms) => {
  if (!draft.value) return
  const idx = draft.value.shots.findIndex(s => ms >= s.startMs && ms < s.startMs + s.durationMs)
  activeIndex.value = idx === -1 ? draft.value.shots.length - 1 : idx
})
watch(draft, value => {
  if (!value) return
  if (cloudReady.value && !cloudConflict.value && JSON.stringify(value) !== cloudSnapshot.value) {
    cloudStatus.value = '本地分镜已修改，点击“保存到云端”同步。'
  }
  try { localStorage.setItem(storageKey, JSON.stringify(value)) } catch { /* Optional local cache. */ }
}, { deep: true })
async function loadCloud() {
  if (!Number.isInteger(travelId) || travelId <= 0) return
  cloudLoading.value = true
  try {
    const response = await getSavedDirectorDraft(travelId)
    if (response.code !== 200) throw new Error(response.message || '云端草稿读取失败')
    cloudReady.value = true
    cloudDraft.value = response.data
    cloudRevision.value = response.data?.revision ?? 0
    cloudSnapshot.value = response.data ? JSON.stringify(response.data.draft) : ''
    if (!response.data) {
      cloudConflict.value = false
      cloudStatus.value = '云端没有草稿。生成后点击“保存到云端”即可跨设备恢复。'
      return
    }
    if (!draft.value) {
      draft.value = response.data.draft
      activeIndex.value = 0
      playhead.value = 0
      cloudConflict.value = false
      cloudStatus.value = `已恢复云端草稿 · 第 ${cloudRevision.value} 版`
    } else if (JSON.stringify(draft.value) === JSON.stringify(response.data.draft)) {
      cloudConflict.value = false
      cloudStatus.value = `本地与云端一致 · 第 ${cloudRevision.value} 版`
    } else {
      // Local changes are never overwritten silently by an older cloud snapshot.
      cloudConflict.value = true
      cloudStatus.value = '本地草稿和云端草稿不同，已保留本地内容。'
    }
  } catch (e) {
    cloudReady.value = false
    cloudStatus.value = `云端不可用，仍可本地编辑：${e instanceof Error ? e.message : '请求失败'}`
  } finally {
    cloudLoading.value = false
  }
}
function restoreCloud() {
  if (!cloudDraft.value) return
  if (!window.confirm('将云端分镜载入编辑器？目前未上传到云端的本地修改将被替换。')) return
  stopPlay()
  draft.value = JSON.parse(JSON.stringify(cloudDraft.value.draft)) as DirectorDraft
  cloudRevision.value = cloudDraft.value.revision
  cloudSnapshot.value = JSON.stringify(draft.value)
  cloudConflict.value = false
  cloudStatus.value = `已载入云端第 ${cloudRevision.value} 版`
  selectShot(0)
}
async function saveCloud() {
  if (!draft.value || !cloudReady.value || cloudSaving.value) return
  if (cloudConflict.value && !window.confirm('云端存在不同版本。确定用当前浏览器中的分镜覆盖云端版本吗？')) return
  cloudSaving.value = true
  error.value = ''
  const snapshot = JSON.parse(JSON.stringify(draft.value)) as DirectorDraft
  try {
    const response = await saveDirectorDraft(travelId, cloudRevision.value, snapshot)
    if (response.code !== 200 || !response.data) {
      if (response.code === 409) {
        cloudConflict.value = true
        cloudReady.value = false
        cloudStatus.value = '云端已被其他页面修改。请刷新页面后核对两份草稿。'
      }
      throw new Error(response.message || '云端保存失败')
    }
    cloudDraft.value = response.data
    cloudRevision.value = response.data.revision
    cloudSnapshot.value = JSON.stringify(snapshot)
    cloudConflict.value = false
    cloudStatus.value = `云端保存成功 · 第 ${cloudRevision.value} 版` +
      (JSON.stringify(draft.value) !== JSON.stringify(snapshot) ? '（保存过程中有新修改，请再次保存）' : '')
  } catch (e) { error.value = e instanceof Error ? e.message : '云端保存失败' }
  finally { cloudSaving.value = false }
}
async function generate() {
  if (!Number.isInteger(travelId) || travelId <= 0) { error.value = '旅行 ID 不正确'; return }
  loading.value = true; error.value = ''; stopPlay()
  try {
    const response = await generateDirectorDraft(travelId, useAi.value)
    if (response.code !== 200 || !response.data || response.data.shots?.length !== 6) throw new Error(response.message || '分镜格式不正确')
    draft.value = response.data
    selectShot(0)
  } catch (e) { error.value = e instanceof Error ? e.message : '分镜生成失败' }
  finally { loading.value = false }
}
function exportJson() {
  if (!draft.value) return
  const blob = new Blob([JSON.stringify(draft.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `travel-director-${travelId}-30s.json`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}
try {
  const saved = localStorage.getItem(storageKey)
  if (saved) {
    const parsed: DirectorDraft = JSON.parse(saved)
    if (parsed.durationMs === 30000 && parsed.shots?.length === 6) draft.value = parsed
  }
} catch { /* Invalid cache is ignored. */ }
onMounted(loadCloud)
onBeforeUnmount(() => { stopPlay(); stopVideoPoll(); ++videoEpoch })
</script>

<style scoped>
.director{min-height:100vh;background:#10131d;color:#e9e7e8;padding:24px max(20px,calc((100vw - 1320px)/2));font:14px/1.55 system-ui,'Microsoft YaHei',sans-serif}
.header{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}.header h1{margin:3px 0;font-size:26px}.header small{color:#a5a0ad;letter-spacing:.14em}
button{cursor:pointer;color:inherit;background:#292d39;border:1px solid #454653;border-radius:10px;padding:10px 14px}button:disabled{opacity:.45;cursor:not-allowed}.primary{background:#ad7188;border-color:#ad7188}
.toolbar{display:flex;align-items:center;gap:12px;margin:24px 0;flex-wrap:wrap}.optin{display:flex;align-items:center;gap:8px;flex:1;min-width:300px}.notice{color:#a5ccbc}.error{color:#ffc0c0}.cloud-state{color:#b9ddc6;margin:10px 0}.cloud-save{background:#416b64;border-color:#6ea89b}.voice-optin{display:flex;align-items:center;gap:6px;color:#dfcbd4;font-size:13px}.voice-choice{background:#292d39;color:#e9e7e8;padding:9px;border:1px solid #454653;border-radius:9px}.video-export{background:#8e557a;border-color:#b66a96}.video-status{color:#e8cb95;margin:8px 0}.conflict{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid #956d4e;background:#40332b;padding:12px;border-radius:10px}.conflict span{flex:1;min-width:250px;color:#f1d9c9}
.studio{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:18px}.play-controls{display:flex;align-items:center;gap:12px;margin:12px 0}.play-controls input{flex:1;accent-color:#cf91ab}.editor{background:#1b1f2a;border:1px solid #343a47;border-radius:15px;padding:20px}.editor label{display:block;margin:16px 0 6px}.editor textarea,.editor input,.editor select{width:100%;box-sizing:border-box;background:#10131d;border:1px solid #484858;border-radius:7px;color:#eee;padding:10px;font:inherit}.hint{color:#a6a8b7;font-size:12px}
.timeline{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:8px;margin-top:18px;overflow-x:auto}.timeline button{text-align:left;display:flex;flex-direction:column;gap:7px;min-height:106px}.timeline button.active{border-color:#e6a6bd;background:#443443}.timeline span,.timeline small{color:#b4b4c2}.timeline small{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.empty{text-align:center;padding:70px 16px;color:#b0b2c0}
@media(max-width:900px){.studio{grid-template-columns:1fr}.timeline{grid-template-columns:repeat(3,1fr)}}@media(max-width:540px){.timeline{grid-template-columns:repeat(2,1fr)}.director{padding:14px}}
</style>
