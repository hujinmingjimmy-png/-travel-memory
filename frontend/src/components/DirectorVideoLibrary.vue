<template>
  <details class="library" open>
    <summary>我的旅行视频作品库 <span>· 私有保存 / 历史下载</span></summary>
    <p class="tip">生成成功后点击“保存这部视频”，视频会从临时导出任务复制到服务器长期存储。不会自动公开。</p>
    <div class="actions">
      <button class="save" :disabled="!jobId || saving" @click="save">
        {{ saving ? '正在保存…' : '保存这部视频到作品库' }}
      </button>
      <button :disabled="loading" @click="load">刷新作品列表</button>
    </div>
    <p v-if="message" class="message" role="status">{{ message }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="!loading && works.length === 0" class="tip">暂无已保存作品。请先完成一次 MP4 导出。</p>
    <ul v-else class="work-list">
      <li v-for="work in works" :key="work.id">
        <div class="meta">
          <strong>{{ work.title }}</strong>
          <small>{{ formatDate(work.createdAt) }} · {{ (work.fileBytes / 1024 / 1024).toFixed(1) }} MB</small>
          <small v-if="listedInDiscover[work.id]" class="listed-badge">✦ 已在发现页展示</small>
        </div>
        <button :disabled="downloading === work.id" @click="download(work)">
          {{ downloading === work.id ? '正在下载…' : '下载 MP4' }}
        </button>
        <template v-if="shareTokens[work.id]">
          <a :href="shareLink(work.id)" target="_blank" rel="noopener noreferrer">公开播放</a>
          <button @click="copyLink(work.id)">复制分享链接</button>
          <button :disabled="discovering === work.id" @click="listedInDiscover[work.id] ? leaveDiscover(work) : joinDiscover(work)">{{ listedInDiscover[work.id] ? '移出发现页' : '展示到发现页' }}</button>
          <button :disabled="sharing === work.id" @click="unpublish(work)">取消公开</button>
        </template>
        <button v-else :disabled="sharing === work.id" @click="publish(work)">公开分享</button>
        <button class="danger" :disabled="removing === work.id" @click="remove(work)">删除</button>
      </li>
    </ul>
  </details>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getPublishedFilms, publishFilm, unpublishFilm, filmShareUrl } from '@/api/aiDirectorShares'
import { myDiscoverListings, includeFilmInDiscover, removeFilmFromDiscover } from '@/api/aiDirectorDiscover' 
import {
  listDirectorWorks, saveDirectorWork, removeDirectorWork, downloadDirectorWork,
  type DirectorVideoWork
} from '@/api/aiDirectorWorks'

const props = defineProps<{ travelId: number; jobId: string; videoTitle: string }>()
const works = ref<DirectorVideoWork[]>([])
const loading = ref(false)
const saving = ref(false)
const removing = ref('')
const downloading = ref('')
const message = ref('')
const shareTokens = ref<Record<string, string>>({})
const sharing = ref('')
const discovering = ref('')
const listedInDiscover = ref<Record<string, boolean>>({})
const error = ref('')

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN')
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const r = await listDirectorWorks(props.travelId)
    if (r.code !== 200 || !Array.isArray(r.data)) throw new Error(r.message || '无法读取作品库')
    works.value = r.data
    try {
      const published = await getPublishedFilms(props.travelId)
      if (published.code !== 200 || !Array.isArray(published.data)) throw new Error(published.message || '分享列表不可用')
      shareTokens.value = Object.fromEntries(published.data.filter(item => item.published && item.shareToken).map(item => [item.workId, item.shareToken!]))
      const discover = await myDiscoverListings(props.travelId)
      if (discover.code !== 200 || !Array.isArray(discover.data)) throw new Error(discover.message || '发现页授权状态获取失败')
      listedInDiscover.value = Object.fromEntries(discover.data.map(id => [id, true]))
    } catch (e) {
      error.value = e instanceof Error ? `分享状态获取失败：${e.message}` : '分享状态获取失败'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '作品库加载失败'
  } finally { loading.value = false }
}

async function save() {
  if (!props.jobId || saving.value) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    const r = await saveDirectorWork(props.travelId, props.jobId, props.videoTitle || '旅行电影')
    if (r.code !== 200 || !r.data) throw new Error(r.message || '无法保存视频')
    message.value = '已保存到私人作品库，可以再次下载。'
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '视频保存失败'
  } finally { saving.value = false }
}

async function download(work: DirectorVideoWork) {
  downloading.value = work.id
  error.value = ''
  try { await downloadDirectorWork(props.travelId, work.id) }
  catch (e) { error.value = e instanceof Error ? e.message : '作品下载失败' }
  finally { downloading.value = '' }
}

function shareLink(workId: string): string {
  const token = shareTokens.value[workId]
  return token ? filmShareUrl(token) : '#'
}

async function copyLink(workId: string) {
  const url = shareLink(workId)
  try {
    await navigator.clipboard.writeText(url)
    message.value = '分享链接已复制。拥有链接的任何人都可以播放这部视频。'
  } catch {
    window.prompt('请复制分享链接', url)
  }
}

async function publish(work: DirectorVideoWork) {
  if (!window.confirm(`确认公开《${work.title}》吗？\n拥有链接的任何人（无需登录）都可以观看，影片中的照片、地点和声音可能包含私人信息。`)) return
  sharing.value = work.id
  error.value = ''
  try {
    const res = await publishFilm(props.travelId, work.id)
    if (res.code !== 200 || !res.data?.published || !res.data.shareToken) throw new Error(res.message || '发布失败')
    shareTokens.value = { ...shareTokens.value, [work.id]: res.data.shareToken }
    message.value = '发布成功。点击“复制分享链接”即可分享给其他人。'
  } catch (e) { error.value = e instanceof Error ? e.message : '发布失败' }
  finally { sharing.value = '' }
}

async function unpublish(work: DirectorVideoWork) {
  if (!window.confirm(`确定取消公开《${work.title}》吗？当前分享链接会立即失效。`)) return
  sharing.value = work.id
  error.value = ''
  try {
    const res = await unpublishFilm(props.travelId, work.id)
    if (res.code !== 200) throw new Error(res.message || '取消公开失败')
    const next = { ...shareTokens.value }; delete next[work.id]; shareTokens.value = next
    const discover = { ...listedInDiscover.value }; delete discover[work.id]; listedInDiscover.value = discover
    message.value = '已取消公开。原分享链接失效；其他人已下载的文件无法撤回。'
  } catch (e) { error.value = e instanceof Error ? e.message : '取消公开失败' }
  finally { sharing.value = '' }
}

// Publishing a share link does NOT grant community-feed visibility.
async function joinDiscover(work: DirectorVideoWork) {
  if (!window.confirm(`确定把《${work.title}》展示在“发现 · 旅行电影”吗？\n所有进入发现页的用户都能找到并播放这部视频。`)) return
  discovering.value = work.id
  error.value = ''
  try {
    const result = await includeFilmInDiscover(props.travelId, work.id)
    if (result.code !== 200 || !result.data?.listed) throw new Error(result.message || '加入发现页失败')
    listedInDiscover.value = { ...listedInDiscover.value, [work.id]: true }
    message.value = '已加入发现页，你可以随时移除。'
  } catch (e) { error.value = e instanceof Error ? e.message : '加入发现页失败' }
  finally { discovering.value = '' }
}

async function leaveDiscover(work: DirectorVideoWork) {
  if (!window.confirm(`确定将《${work.title}》从发现页移除吗？分享链接仍可使用。`)) return
  discovering.value = work.id
  error.value = ''
  try {
    const result = await removeFilmFromDiscover(props.travelId, work.id)
    if (result.code !== 200) throw new Error(result.message || '移除发现页失败')
    const next = { ...listedInDiscover.value }; delete next[work.id]; listedInDiscover.value = next
    message.value = '已从发现页移除，原分享链接仍然有效。'
  } catch (e) { error.value = e instanceof Error ? e.message : '移除发现页失败' }
  finally { discovering.value = '' }
}

async function remove(work: DirectorVideoWork) {
  if (!window.confirm(`确定永久删除《${work.title}》吗？删除后无法恢复。`)) return
  removing.value = work.id
  error.value = ''
  try {
    const r = await removeDirectorWork(props.travelId, work.id)
    if (r.code !== 200) throw new Error(r.message || '删除失败')
    message.value = '作品已删除'
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '作品删除失败' }
  finally { removing.value = '' }
}

onMounted(load)
</script>

<style scoped>
.library{background:#1a1d29;border:1px solid #414653;border-radius:14px;padding:17px;margin:14px 0 18px;color:#e9e7e8}
.library summary{font-weight:650;font-size:16px;cursor:pointer}.library summary span{color:#aeb0bd;font-size:12px;font-weight:400}
.tip{color:#b9bac6;font-size:13px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}
button{background:#303548;border:1px solid #4d5266;padding:8px 13px;color:#fff;border-radius:8px;cursor:pointer}
button:disabled{opacity:.5;cursor:not-allowed}.save{background:#476b63;border-color:#699b8f}
.danger{color:#fac2c2}.work-list a{color:#b5d9ff;font-size:13px}.message{color:#a6e4c8}.error{color:#ffb9b9}
.work-list{list-style:none;padding:0;margin:0}.work-list li{display:flex;align-items:center;gap:10px;border-top:1px solid #34394a;padding:10px 0;flex-wrap:wrap}
.meta{display:flex;flex-direction:column;gap:3px;flex:1;min-width:180px}.meta small{color:#afb1bd}.meta .listed-badge{color:#9ee6c7;font-weight:700}
</style>
