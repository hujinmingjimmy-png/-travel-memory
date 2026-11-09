<template>
  <section class="photo-library">
    <header class="library-header">
      <div>
        <p class="tm-kicker">Contact Sheet / 旅行相册</p>
        <h2>旅行照片 <span>({{ photos.length }})</span></h2>
        <p>{{ editable ? '上传一次，可用于封面、背景或共同作品；分享哪些照片由你选择。' : '浏览这段旅行已公开的照片。' }}</p>
      </div>
      <label v-if="editable" class="upload-label" :class="{ disabled: uploading }">
        <span>✿ {{ uploading ? '正在上传...' : '上传旅行照片' }}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          :disabled="uploading"
          @change="handleFiles"
        />
      </label>
    </header>

    <p v-if="message" class="feedback" role="status">{{ message }}</p>

    <div v-if="loading" class="empty">正在加载照片，请稍候…</div>
    <div v-else-if="photos.length === 0" class="empty">
      <span>✧</span>
      <strong>这段旅行还没有照片</strong>
      <p>{{ editable ? '点击右上角上传多张照片，让旅程真正鲜活起来。' : '创作者还没有上传照片。' }}</p>
    </div>
    <div v-else class="photo-grid">
      <article v-for="(photo, index) in photos" :key="photo.id" class="photo-card">
        <button class="image-button" type="button" @click="openPreview(index)">
          <img v-if="photo.blobUrl" :src="photo.blobUrl" :alt="photo.originalName || '旅行照片'" loading="lazy" decoding="async" />
          <div v-else class="image-fallback">照片暂时无法显示</div>
        </button>
        <div class="photo-footer">
          <span :title="photo.originalName || '照片'">{{ photo.originalName || `照片 ${index + 1}` }}</span>
          <button v-if="editable" type="button" :disabled="deletingId === photo.id" @click="removePhoto(photo.id)">
            {{ deletingId === photo.id ? '删除中…' : '删除' }}
          </button>
        </div>
      </article>
    </div>

    <Teleport to="body">
      <dialog ref="lightbox" class="lightbox" aria-label="照片预览" @cancel.prevent="closePreview" @click.self="closePreview" @keydown.left.prevent="stepPreview(-1)" @keydown.right.prevent="stepPreview(1)">
        <template v-if="previewPhoto">
          <button class="lightbox-close" type="button" autofocus aria-label="关闭预览" @click="closePreview">×</button>
          <button class="lightbox-nav" type="button" aria-label="上一张" @click="stepPreview(-1)">‹</button>
          <img v-if="previewPhoto.blobUrl" :src="previewPhoto.blobUrl" :alt="previewPhoto.originalName || '旅行照片'" />
          <p v-else>照片暂时无法显示</p>
          <button class="lightbox-nav" type="button" aria-label="下一张" @click="stepPreview(1)">›</button>
          <p class="frame-counter tm-kicker" aria-live="polite">{{ (previewIndex ?? 0) + 1 }} / {{ photos.length }}</p>
        </template>
      </dialog>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  getTravelMediaApi,
  uploadTravelMediaApi,
  deleteTravelMediaApi,
  createMediaBlobUrl,
  type TravelMedia
} from '@/api/media'

const props = defineProps<{
  travelId: number
  editable: boolean
}>()

const emit = defineEmits<{
  updated: []
}>()

type PhotoItem = TravelMedia & { blobUrl: string }
const photos = ref<PhotoItem[]>([])
const loading = ref(false)
const uploading = ref(false)
const deletingId = ref<number | null>(null)
const message = ref('')
const previewIndex = ref<number | null>(null)
const lightbox = ref<HTMLDialogElement | null>(null)
const previewPhoto = computed(() => previewIndex.value === null ? null : (photos.value[previewIndex.value] ?? null))

watch(() => Boolean(previewPhoto.value), open => {
  if (open && !lightbox.value?.open) lightbox.value?.showModal()
  if (!open && lightbox.value?.open) lightbox.value.close()
}, { flush: 'post' })

// 序列号用于防止切换旅行 / 离开页面时迟到请求覆盖新数据。
let loadVersion = 0
let disposed = false

const releaseUrls = (items: PhotoItem[]) => {
  for (const item of items) if (item.blobUrl) URL.revokeObjectURL(item.blobUrl)
}

const refresh = async () => {
  const version = ++loadVersion
  loading.value = true
  message.value = ''
  previewIndex.value = null
  try {
    const result = await getTravelMediaApi(props.travelId)
    if (result.code !== 200) throw new Error(result.message || '照片列表读取失败')
    const loaded = await Promise.all((result.data || []).map(async media => {
      try {
        const blobUrl = await createMediaBlobUrl(props.travelId, media.id)
        return { ...media, blobUrl }
      } catch (error) {
        console.warn('照片读取失败：', media.id, error)
        return { ...media, blobUrl: '' }
      }
    }))
    if (disposed || version !== loadVersion) {
      releaseUrls(loaded)
      return
    }
    releaseUrls(photos.value)
    photos.value = loaded
  } catch (error) {
    if (!disposed && version === loadVersion) {
      message.value = error instanceof Error ? error.message : '加载照片失败'
    }
  } finally {
    if (!disposed && version === loadVersion) loading.value = false
  }
}

const handleFiles = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (files.length === 0) return
  if (files.length > 8) { message.value = '一次最多选择 8 张照片'; return }
  if (files.some(file => file.size === 0 || file.size > 8 * 1024 * 1024)) {
    message.value = '每张照片必须大于 0 且不超过 8MB'
    return
  }
  if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
    message.value = '只能选择 JPG、PNG、WEBP 图片'
    return
  }

  uploading.value = true
  message.value = ''
  try {
    const result = await uploadTravelMediaApi(props.travelId, files)
    if (result.code !== 200) throw new Error(result.message || '上传失败')
    await refresh()
    message.value = `已成功上传 ${files.length} 张照片`
    emit('updated')
  } catch (error) {
    message.value = error instanceof Error ? error.message : '上传失败'
  } finally {
    uploading.value = false
  }
}

const removePhoto = async (mediaId: number) => {
  if (!window.confirm('确定删除这张照片吗？删除后无法恢复。')) return
  deletingId.value = mediaId
  message.value = ''
  try {
    const result = await deleteTravelMediaApi(props.travelId, mediaId)
    if (result.code !== 200) throw new Error(result.message || '删除失败')
    await refresh()
    message.value = '照片已删除'
    emit('updated')
  } catch (error) {
    message.value = error instanceof Error ? error.message : '删除失败'
  } finally {
    deletingId.value = null
  }
}

const openPreview = (index: number) => { previewIndex.value = index }
const closePreview = () => { previewIndex.value = null }
const stepPreview = (step: number) => {
  if (previewIndex.value !== null && photos.value.length) {
    previewIndex.value = (previewIndex.value + step + photos.value.length) % photos.value.length
  }
}

watch(() => props.travelId, () => { void refresh() }, { immediate: true })
onBeforeUnmount(() => {
  if (lightbox.value?.open) lightbox.value.close()
  disposed = true
  ++loadVersion
  releaseUrls(photos.value)
})
</script>

<style scoped>
.photo-library{margin-top:20px;padding:clamp(14px,3vw,30px);border:1px solid var(--tm-line);border-radius:5px;background:var(--tm-sheet);color:var(--tm-ink)}
.library-header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:13px}
.library-header h2{margin:0;font:700 1.9rem/1.2 var(--tm-display)}
.library-header h2 span,.library-header p{color:var(--tm-muted);font-size:.82rem}
.library-header .tm-kicker{margin:0 0 7px;color:var(--tm-accent);font-size:.73rem}
.upload-label{position:relative;display:flex;align-items:center;justify-content:center;min-height:44px;padding:8px 14px;border-radius:4px;cursor:pointer;font-weight:700;white-space:nowrap;background:var(--tm-accent);color:var(--tm-sheet);font-size:.87rem}
.upload-label input{position:absolute;inset:0;width:100%;opacity:0;cursor:pointer}
.upload-label:focus-within{outline:2px solid #8e5836;outline-offset:3px}
.upload-label.disabled{opacity:.6;cursor:wait}
.feedback{margin:14px 0;color:var(--tm-muted);font-size:.84rem}
.empty{min-height:160px;display:grid;place-content:center;justify-items:center;padding:16px;text-align:center;border:1px dashed var(--tm-line);border-radius:4px;background:var(--tm-paper);color:var(--tm-muted)}
.empty span{font-size:1.9rem}.empty p{margin:8px 0;font-size:.81rem}
.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(175px,100%),1fr));gap:12px}
.photo-card{min-width:0;padding:5px;border:1px solid var(--tm-line);border-radius:3px;background:var(--tm-paper)}
.image-button{display:block;width:100%;padding:0;border:0;background:var(--tm-night);cursor:zoom-in}
.image-button img,.image-fallback{width:100%;aspect-ratio:4 / 3;display:block;object-fit:cover}
.image-fallback{display:grid;place-items:center;color:#fff;font-size:.76rem}
.photo-footer{display:flex;align-items:center;justify-content:space-between;gap:5px;padding:7px 3px 2px}
.photo-footer span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.75rem;color:var(--tm-muted)}
.photo-footer button{border:1px solid var(--tm-line);border-radius:3px;background:var(--tm-sheet);color:#793331;cursor:pointer;padding:6px;white-space:nowrap}
.lightbox{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;border:0;padding:12px;color:var(--tm-sheet);background:#101b18f5}
.lightbox[open]{display:flex;align-items:center;justify-content:center;gap:clamp(3px,2vw,24px)}
.lightbox img{max-width:calc(100% - 93px);max-height:81vh;object-fit:contain}
.lightbox button{border:1px solid #ffffff58;cursor:pointer;color:white;background:#ffffff20;border-radius:4px;min-width:40px;min-height:42px;font-size:1.65rem}
.lightbox-close{position:absolute;right:16px;top:14px}
.frame-counter{position:absolute;bottom:10px;left:50%;transform:translateX(-50%)}
@media(max-width:690px){.library-header{flex-direction:column;align-items:flex-start}}
@media(max-width:530px){.photo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
