<template>
  <section class="theme-picker">
    <div class="theme-heading">
      <div>
        <p class="mini-title">THEME ART · 主题图片</p>
        <h2>设置本次旅行的主封面和背景</h2>
        <p>主封面参与首页高速抽选；背景画面直到最后选中、短暂黑屏结束才显示。</p>
      </div>
      <button type="button" class="reload" :disabled="loading" @click="refresh">↻ 刷新</button>
    </div>

    <p v-if="loading" class="tip">正在读取相册……</p>
    <p v-else-if="!photos.length" class="tip">请先在上方相册上传照片，再回来选取主封面和背景画面。</p>
    <template v-else>
      <div class="current-choices">
        <div class="selection-label">✦ 主封面：{{ selectedName(coverMediaId) }}</div>
        <div class="selection-label">✧ 背景画面：{{ selectedName(backgroundMediaId) }}</div>
      </div>

      <div class="photo-grid">
        <div v-for="photo in photos" :key="photo.id" class="choice-card">
          <img v-if="photo.blobUrl" :src="photo.blobUrl" :alt="photo.originalName || '旅行照片'" />
          <span v-else class="missing">图片不可用</span>
          <div class="choice-buttons">
            <button type="button" :class="{ chosen: coverMediaId === photo.id }" @click="coverMediaId = photo.id">
              {{ coverMediaId === photo.id ? '✓ 主封面' : '设为主封面' }}
            </button>
            <button type="button" :class="{ chosen: backgroundMediaId === photo.id }" @click="backgroundMediaId = photo.id">
              {{ backgroundMediaId === photo.id ? '✓ 背景画面' : '设为背景' }}
            </button>
          </div>
        </div>
      </div>
      <div class="save-row">
        <p>可用同一张图片兼任两种角色，但上传两张以上效果更明显。</p>
        <button type="button" class="save-button" :disabled="saving || coverMediaId == null || backgroundMediaId == null" @click="save">
          {{ saving ? '保存中…' : '保存主题设置' }}
        </button>
      </div>
    </template>
    <p v-if="message" class="feedback" role="status">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { createMediaBlobUrl, getTravelMediaApi, type TravelMedia } from '@/api/media'
import { getThemeArtApi, saveThemeArtApi } from '@/api/themeArt'

const emit=defineEmits<{saved:[]}>()
const props = defineProps<{ travelId: number }>()
type PreviewPhoto = TravelMedia & { blobUrl: string }
const photos = ref<PreviewPhoto[]>([])
const loading = ref(false)
const saving = ref(false)
const coverMediaId = ref<number | null>(null)
const backgroundMediaId = ref<number | null>(null)
const message = ref('')
let seq = 0
let disposed = false

const selectedName = (id: number | null) => {
  if (id == null) return '未选择'
  const matching = photos.value.find(photo => photo.id === id)
  return matching?.originalName || `照片 #${id}`
}

const release = (arr: PreviewPhoto[]) => {
  for (const item of arr) if (item.blobUrl) URL.revokeObjectURL(item.blobUrl)
}

const refresh = async () => {
  const version = ++seq
  loading.value = true
  message.value = ''
  const loaded: PreviewPhoto[] = []
  try {
    const [photosResult, themeResult] = await Promise.all([
      getTravelMediaApi(props.travelId),
      getThemeArtApi(props.travelId)
    ])
    if (photosResult.code !== 200) throw new Error(photosResult.message || '读取相册失败')
    if (themeResult.code !== 200) throw new Error(themeResult.message || '读取主题设置失败')

    for (const photo of photosResult.data || []) {
      let blobUrl = ''
      try { blobUrl = await createMediaBlobUrl(props.travelId, photo.id) }
      catch (e) { console.warn('无法载入缩略图', e) }
      loaded.push({ ...photo, blobUrl })
    }
    if (disposed || version !== seq) { release(loaded); return }
    release(photos.value)
    photos.value = loaded
    const ids = new Set(loaded.map(photo => photo.id))
    coverMediaId.value = ids.has(themeResult.data?.coverMediaId ?? -1)
      ? themeResult.data!.coverMediaId : (loaded[0]?.id ?? null)
    backgroundMediaId.value = ids.has(themeResult.data?.backgroundMediaId ?? -1)
      ? themeResult.data!.backgroundMediaId : (loaded[1]?.id ?? loaded[0]?.id ?? null)
  } catch (e) {
    release(loaded)
    if (!disposed && version === seq) message.value = e instanceof Error ? e.message : '读取失败'
  } finally {
    if (!disposed && version === seq) loading.value = false
  }
}

const save = async () => {
  if (coverMediaId.value == null || backgroundMediaId.value == null) return
  saving.value = true
  message.value = ''
  try {
    const response = await saveThemeArtApi(props.travelId, {
      coverMediaId: coverMediaId.value,
      backgroundMediaId: backgroundMediaId.value
    })
    if (response.code !== 200) throw new Error(response.message || '保存失败')
    emit('saved')
    message.value = '✓ 已保存！回到首页重新抽选时即可看到两张图片分别发挥作用。'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存失败'
  } finally { saving.value = false }
}

watch(() => props.travelId, () => { void refresh() }, { immediate: true })
onBeforeUnmount(() => { disposed = true; ++seq; release(photos.value) })
</script>

<style scoped>
.theme-picker{margin:17px 0;padding:25px;border-radius:25px;border:1px solid #fff9;background:#fff9;box-shadow:0 15px 42px #c56f9523;color:#76455d}
.theme-heading{display:flex;justify-content:space-between;align-items:start;gap:14px}.theme-heading h2{margin:5px 0 9px;font-size:21px}.theme-heading p{margin:0;color:#aa7c96;font-size:12px;line-height:1.7}.mini-title{color:#d17fa0!important;letter-spacing:.08em!important;font-size:10px!important}.reload{border:0;border-radius:10px;background:#fce2ee;color:#8e4c6c;padding:9px;cursor:pointer}.tip{padding:20px;text-align:center;color:#af83a0}.current-choices{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 15px}.selection-label{padding:9px 13px;border-radius:999px;background:#ffdae9;color:#905071;font-size:12px}.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(146px,1fr));gap:14px}.choice-card{padding:8px;border-radius:17px;border:1px solid #f5c6dc;background:white}.choice-card img,.missing{width:100%;height:132px;display:grid;place-items:center;object-fit:cover;border-radius:12px;background:#fbd4e3;color:#955d7d}.choice-buttons{margin-top:9px;display:grid;gap:5px}.choice-buttons button{padding:8px 3px;border:1px solid #f3c5d9;border-radius:9px;background:#fff7fa;color:#a36a88;font-size:11px;cursor:pointer}.choice-buttons button.chosen{background:linear-gradient(120deg,#ffbfda,#ffe7c2);color:#75405c;font-weight:800}.save-row{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-top:19px}.save-row p{font-size:11px;color:#a17c91}.save-button{flex:none;padding:12px 20px;border:0;border-radius:12px;background:linear-gradient(115deg,#ffbbd6,#ffedc0);color:#79435d;font-weight:800;cursor:pointer}.save-button:disabled{opacity:.45;cursor:not-allowed}.feedback{color:#a14c78;font-size:12px}@media(max-width:660px){.theme-picker{padding:16px}.save-row{align-items:stretch;flex-direction:column}}
</style>
