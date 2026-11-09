<template>
  <main class="shared-film">
    <div class="topbar"><span>TRAVEL MEMORY</span><span>旅行电影分享</span></div>
    <section class="content">
      <div v-if="loading" class="placeholder">正在读取分享作品…</div>
      <div v-else-if="error" class="placeholder error" role="alert">
        <h2>无法播放这部旅行电影</h2>
        <p>{{ error }}</p>
        <p>该链接可能已被作者取消公开。</p>
      </div>
      <template v-else-if="film">
        <h1>{{ film.title }}</h1>
        <p class="subtitle">这段旅行记忆由作者主动分享 · 30 秒电影</p>
        <video :src="videoSource" controls playsinline preload="metadata" class="video" @error="mediaFailed = true">
          当前浏览器无法播放 MP4 视频。
        </video>
        <p v-if="mediaFailed" class="error">视频加载失败，可能已取消分享或服务器视频文件不可用。</p>
        <p class="tip">公开链接不要求登录，但作者可以随时取消分享。</p>
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { getPublicFilm, publicVideoSrc, type PublicFilmInfo } from '@/api/aiDirectorShares'
const route = useRoute()
const token = typeof route.params.token === 'string' ? route.params.token : ''
const film = ref<PublicFilmInfo | null>(null)
const loading = ref(true)
const error = ref('')
const mediaFailed = ref(false)
const videoSource = computed(() => film.value ? publicVideoSrc(token) : '')

onMounted(async () => {
  try {
    if (!/^[a-zA-Z0-9_-]{43}$/.test(token)) throw new Error('链接格式不正确')
    const result = await getPublicFilm(token)
    if (result.code !== 200 || !result.data) throw new Error(result.message || '分享不存在或已失效')
    film.value = result.data
    document.title = `${result.data.title} · Travel Memory`
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex,nofollow'
    document.head.appendChild(robots)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '无法打开分享'
  } finally { loading.value = false }
})
</script>

<style scoped>
.shared-film{min-height:100vh;background:#10121b;color:#f2f1f4;padding:24px;font-family:system-ui,sans-serif}
.topbar{display:flex;justify-content:space-between;gap:12px;color:#c99caf;letter-spacing:2px;font-size:12px;max-width:1100px;margin:0 auto 40px}
.content{max-width:1100px;margin:0 auto;text-align:center}
h1{font-size:clamp(22px,4vw,36px);margin-bottom:5px}.subtitle,.tip{color:#a5a9b6;font-size:14px}
.video{width:100%;aspect-ratio:16/9;object-fit:contain;background:#05060a;border-radius:18px;margin-top:22px;box-shadow:0 12px 60px #0007}
.placeholder{padding:55px 12px;color:#ced0d8;background:#1a1e29;border-radius:16px}
.error{color:#ffb8bb}
</style>
