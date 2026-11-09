<template>
  <main class="memory-home">


    <section class="home-cover">
      <div class="home-cover-image" aria-hidden="true">
        <img v-if="slides[0]?.coverImage" :key="slides[0].coverImage" :src="slides[0].coverImage" alt="" decoding="async" @error="hideBrokenImage" />
      </div>
      <div class="home-cover-copy">
        <p class="tm-kicker"><span>01 /</span> A World of Memories</p>
        <h1>每个人的世界，<br />都值得被收藏。</h1>
        <p class="home-lead">把旅行做成一段可以播放的回忆。从一张照片、一处足迹，开始你的旅行档案。</p>
        <div class="home-cover-actions">
          <RouterLink class="tm-action light" :to="{ path: '/me', query: { create: '1' } }">开始创作 <span aria-hidden="true">↗</span></RouterLink>
          <RouterLink class="tm-action outline" :to="{ path: '/me', query: { section: 'journeys' } }">查看我的旅程</RouterLink>
        </div>
      </div>
      <span class="cover-edition tm-kicker" aria-hidden="true">{{ slides[0]?.coverImage ? '私人旅行档案' : '封面作品 · 油画' }}</span>
    </section>

    <section class="intro">
      <div>
        <p class="tm-kicker">02 / The Screening Room</p>
        <h2>重放一段回忆</h2>
      </div>
      <p>从你的旅行中抽取一个片段。仅你可见，包括私密旅行和草稿。</p>
    </section>

    <section v-if="loading" class="empty-state" aria-live="polite">
      <span class="empty-spark">✧</span><h2>正在读取你的专属封面……</h2>
      <p>正在准备你的旅行照片。</p>
    </section>
    <section v-else-if="error || slides.length === 0" class="empty-state" aria-live="polite">
      <span class="empty-spark">♡</span>
      <h2>{{ error ? '读取旅行失败' : '还没有可抽选的旅行主题' }}</h2>
      <p>{{ error || '给一段旅行添加照片，就能在这里重新打开它。' }}</p>
      <div class="empty-actions">
        <button class="action-primary" type="button" @click="router.push('/me')">前往我的旅程</button>
        <button class="action-secondary" type="button" @click="loadMemories">重新加载</button>
      </div>
    </section>

    <!--
      ==============================================================
      ★★★★★【参考视频 · 五阶段封面抽选】★★★★★

      ① intro: 先看到第一段旅行的主封面，背景暂不揭晓。
      ② spinning: 多个主题主封面高速运动，带方向性模糊。
      ③ braking: 速度逐步降低，选中框经过哪个主题，顶部标题就跟随更新。
      ④ blackout: 已显著减速后，短暂黑屏，封面停止在被抽中的主题。
      ⑤ reveal: 黑屏消失；主封面瞬间放大，才放出这个主题的背景画面。
         此时仅背景和雪花缓慢运动/虚化，主体和相框保持清晰并摇晃。

      本组件是用户登录后的【个人首页】，不是发现页。
      所有图片由 JWT 认证接口取回，不把私密照片放进 public/images。
      ==============================================================
    -->
    <section v-else class="cinema" :class="`phase-${phase}`" :style="cinemaTuningStyle" aria-label="旅行记忆抽选播放器">
      <!-- 场景 0：基础舞台，不是主题背景。 -->
      <div class="neutral-background" aria-hidden="true"></div>

      <!-- 场景 1：主题专属背景直到最后 reveal 才放出，不随滚动频繁改图。 -->
      <div
        class="theme-background"
        :style="backgroundStyle"
        aria-hidden="true"
      ></div>
      <div class="scene-vignette" aria-hidden="true"></div>

      <!-- 雪花独立层：揭晓时减速 + 景深模糊，不会影响照片清晰度。 -->
      <div ref="snowRef" class="snow-layer" aria-hidden="true">
        <span
          v-for="flake in snowflakes"
          :key="flake.id"
          class="snowflake"
          :style="{
            left: `${flake.left}%`,
            width: `${flake.size}px`,
            height: `${flake.size}px`,
            opacity: flake.opacity,
            animationDuration: `${flake.duration}s`,
            animationDelay: `${flake.delay}s`,
            '--drift': `${flake.drift}px`
          }"
        ></span>
      </div>

      <div class="cinema-topline"><span>TRAVEL MEMORY // MY STORIES</span><span>{{ phaseHint }}</span></div>

      <!-- 中央选中框扫过不同主封面时，主题自动跟随中心卡片改变。 -->
      <div class="title-area" aria-live="off">
        <span class="mini-headline">【 {{ phase === 'reveal' ? '回忆定格' : '正在寻找' }} 】</span>
        <h2 :key="activeTheme?.title" class="theme-title">{{ activeTheme?.title || '旅行记忆' }}</h2>
      </div>

      <div class="film-stage">
        <!-- 旋转空心相框位于主封面背后，揭晓后有独立的轻微摇晃。 -->
        <div class="selection-frame" aria-hidden="true">
          <span class="frame-one"></span><span class="frame-two"></span>
        </div>
        <div class="film-track">
          <button
            v-for="slot in visibleSlots"
            :key="slot.key"
            class="cover-slot"
            :class="{ centered: Math.abs(slot.distance) < 0.46 }"
            :style="slot.style"
            type="button"
            :title="`查看：${slot.theme.title}`"
            :disabled="isDrawing"
            @click="selectTheme(slot.themeIndex)"
          >
            <span class="cover-inner">
              <img v-if="slot.theme.coverImage" :src="slot.theme.coverImage" :alt="slot.theme.title" draggable="false" @error="hideBrokenImage" />
              <span v-else class="cover-fallback">✿</span>
            </span>
          </button>
        </div>
      </div>

      <!-- 左边作者，照片正下方显示一句留言或旁白。 -->
      <div class="author-info">
        <span class="metadata-label">CREATED BY</span>
        <strong>＠{{ activeTheme?.author || '旅行者' }}</strong>
        <small>{{ activeTheme?.visibility === 'PRIVATE' ? '♡ 私密回忆' : '✦ 我发布的旅行' }}</small>
      </div>
      <div class="message-info">
        <span class="metadata-label">THE MESSAGE</span>
        <p :key="activeTheme?.caption" class="memory-caption">{{ activeTheme?.caption || '每一段回忆都值得收藏。' }}</p>
      </div>
      <div class="cinema-footnote">
        <span>{{ String(activeThemeIndex + 1).padStart(2, '0') }} / {{ String(slides.length).padStart(2, '0') }}</span>
        <span class="footnote-line"></span>
        <span>{{ phase === 'reveal' ? '已选中 · 打开这段旅行' : '私人放映 · 旅行记忆选集' }}</span>
      </div>

      <!-- 短暂黑屏真正盖住整个场景；最后才揭晓这个主题的背景。 -->
      <div class="blackout-curtain" aria-hidden="true"></div>
      <div class="reveal-glow" aria-hidden="true"></div>
    </section>

    <div v-if="slides.length > 0" class="player-controls">
      <button class="action-primary" type="button" :disabled="isDrawing" @click="startDraw">▷ {{ isDrawing ? '正在抽选回忆…' : phase === 'reveal' ? '再抽一段' : '抽一段回忆' }}</button>
      <button class="action-secondary" type="button" :disabled="isDrawing" @click="openJourney">进入这段旅程 ↗</button>
      <span class="player-help">一段旅行 = 一张主封面 + 一幅专属背景；可在旅行详情页设置</span>
    </div>
    <!--
      ★★★★★【仅调试使用的电影参数面板】★★★★★
      访问 /home?debug=1 才显示；普通用户看不到。
      这里的参数保存在当前浏览器 localStorage，不影响服务器上的其他用户。
    -->
    <details v-if="debugMode && slides.length" class="tuning-panel">
      <summary>⚙ 调整电影动画参数（仅调试模式）</summary>
      <div class="tuning-grid">
        <label>封面滚动总时长 <strong>{{ tuning.drawMs }}ms</strong>
          <input v-model.number="tuning.drawMs" @input="saveTuning" type="range" min="2200" max="9000" step="100" />
        </label>
        <label>黑屏停留 <strong>{{ tuning.blackoutMs }}ms</strong>
          <input v-model.number="tuning.blackoutMs" @input="saveTuning" type="range" min="200" max="1100" step="20" />
        </label>
        <label>中央封面放大 <strong>{{ tuning.coverScale.toFixed(2) }}×</strong>
          <input v-model.number="tuning.coverScale" @input="saveTuning" type="range" min="1.05" max="1.75" step="0.05" />
        </label>
        <label>高速运动模糊 <strong>{{ tuning.motionBlur }}px</strong>
          <input v-model.number="tuning.motionBlur" @input="saveTuning" type="range" min="0" max="18" step="1" />
        </label>
        <label>揭晓背景模糊 <strong>{{ tuning.backgroundBlur }}px</strong>
          <input v-model.number="tuning.backgroundBlur" @input="saveTuning" type="range" min="0" max="25" step="1" />
        </label>
        <label>雪花渐隐模糊 <strong>{{ tuning.snowBlur.toFixed(1) }}px</strong>
          <input v-model.number="tuning.snowBlur" @input="saveTuning" type="range" min="0" max="7" step="0.5" />
        </label>
        <label>选中后雪花速度 <strong>{{ tuning.snowRate.toFixed(2) }}×</strong>
          <input v-model.number="tuning.snowRate" @input="saveTuning" type="range" min="0.05" max="0.8" step="0.05" />
        </label>
        <label>主封面轻摇角度 <strong>{{ tuning.swayDeg.toFixed(1) }}°</strong>
          <input v-model.number="tuning.swayDeg" @input="saveTuning" type="range" min="0" max="4" step="0.2" />
        </label>
      </div>
      <div class="tuning-actions">
        <label class="autoplay-choice"><input v-model="tuning.autoplay" @change="saveTuning" type="checkbox" /> 进入首页时自动抽选</label>
        <button type="button" :disabled="isDrawing" @click="startDraw">▷ 用新参数重播</button>
        <button type="button" @click="resetTuning">重置为推荐参数</button>
      </div>
      <p class="tuning-status">当前阶段：{{ phase }} · 主题：{{ activeTheme?.title || '无' }} · 调试参数只保存在当前浏览器</p>
    </details>

    <footer>✿ TRAVEL MEMORY · 地图模式 · 故事模式 · 沉浸播放模式</footer>
    <div v-if="notice" class="toast" role="status" @click="notice = ''">{{ notice }}　×</div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createMediaBlobUrl } from '@/api/media'
import { getMyHomeMemories, type HomeMemory } from '@/api/homeMemories'

type Phase = 'intro' | 'spinning' | 'braking' | 'blackout' | 'reveal'
type ThemeSlide = HomeMemory & { coverImage: string | null; backgroundImage: string | null }

const router = useRouter()

/**
 * ★★★★★【电影动画统一调参区】★★★★★
 * 普通观看不显示调参面板；开发时访问：/home?debug=1
 * 参数会自动保存到本机浏览器，下次仍有效。
 * 它们只影响视觉，不改变 JWT 用户隔离、照片或旅行权限。
 */
interface CinemaTuning {
  drawMs: number
  blackoutMs: number
  coverScale: number
  motionBlur: number
  backgroundBlur: number
  snowBlur: number
  snowRate: number
  swayDeg: number
  autoplay: boolean
}
const DEFAULT_TUNING: CinemaTuning = {
  drawMs: 4200,        // 高速到减速的总时长
  blackoutMs: 360,    // 速度停稳后的纯黑时长
  coverScale: 1.35,   // 最终主封面放大比例
  motionBlur: 8,      // 高速时封面队列模糊
  backgroundBlur: 11, // 最终背景景深模糊
  snowBlur: 1.8,      // 选中后雪花模糊
  snowRate: 0.18,     // 揭晓后雪花速度
  swayDeg: 1.2,       // 封面轻轻摇晃的最大幅度
  autoplay: false
}
const TUNING_KEY = 'travel_memory_cinema_tuning_v2_1'
const debugMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1'
const tuning = reactive<CinemaTuning>({ ...DEFAULT_TUNING })

const tuningRanges: Record<Exclude<keyof CinemaTuning, 'autoplay'>, [number, number]> = {
  drawMs: [2200, 9000], blackoutMs: [200, 1100], coverScale: [1.05, 1.75],
  motionBlur: [0, 18], backgroundBlur: [0, 25], snowBlur: [0, 7],
  snowRate: [0.05, 0.8], swayDeg: [0, 4]
}

const loadTuning = () => {
  try {
    const raw = localStorage.getItem(TUNING_KEY)
    if (!raw) return
    const saved: Partial<CinemaTuning> = JSON.parse(raw)
    for (const [name, range] of Object.entries(tuningRanges)) {
      const key = name as Exclude<keyof CinemaTuning, 'autoplay'>
      const value = saved[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        tuning[key] = Math.min(range[1], Math.max(range[0], value))
      }
    }
    if (typeof saved.autoplay === 'boolean') tuning.autoplay = saved.autoplay
  } catch (err) {
    console.warn('本地影院参数不可用，恢复默认设置', err)
  }
}
loadTuning()
const saveTuning = () => localStorage.setItem(TUNING_KEY, JSON.stringify(tuning))
const resetTuning = () => { Object.assign(tuning, DEFAULT_TUNING); saveTuning() }

/**
 * CSS 变量只控制独立的背景、粒子和相框层，不给父舞台整体加 blur。
 * 因此最终选中的封面仍然清晰。
 */
const cinemaTuningStyle = computed(() => ({
  '--cover-scale': String(tuning.coverScale),
  '--background-blur': `${tuning.backgroundBlur}px`,
  '--snow-blur': `${tuning.snowBlur}px`,
  '--sway-deg': `${tuning.swayDeg}deg`,
  '--frame-scale': String(1 + (tuning.coverScale - 1) * 1.28)
}))

const slides = ref<ThemeSlide[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')
const phase = ref<Phase>('intro')
const position = ref(0)
const speedVisual = ref(0)
const revealedTheme = ref<ThemeSlide | null>(null)
const screenWidth = ref(typeof window === 'undefined' ? 1200 : window.innerWidth)
const snowRef = ref<HTMLElement | null>(null)
const blobUrls = new Set<string>()
const timers = new Set<number>()
let frame = 0
let hasUnmounted = false
let loadVersion = 0
let snowTickCount = 0

const isDrawing = computed(() => phase.value === 'spinning' || phase.value === 'braking' || phase.value === 'blackout')
const wrap = (value: number, length: number) => ((value % length) + length) % length
const activeThemeIndex = computed(() => slides.value.length ? wrap(Math.round(position.value), slides.value.length) : 0)
const activeTheme = computed(() => slides.value[activeThemeIndex.value] || null)
const slideGap = computed(() => screenWidth.value < 640 ? 142 : 188)
const phaseHint = computed(() => ({
  intro: '准备开启记忆', spinning: '封面快速穿梭', braking: '速度正在下降', blackout: '将这一刻留给你', reveal: '回忆已经揭晓'
})[phase.value])

const backgroundStyle = computed(() => {
  const url = revealedTheme.value?.backgroundImage
  return url ? { backgroundImage: `url(${JSON.stringify(url)})` } : {}
})

/** 一共只保留中心两侧 6 张封面的 DOM；真实滚动是连续的 translate3d。 */
const visibleSlots = computed(() => {
  const result: Array<{
    key: number
    themeIndex: number
    theme: ThemeSlide
    distance: number
    style: Record<string, string | number>
  }> = []
  const count = slides.value.length
  if (!count) return result
  const nearest = Math.round(position.value)
  for (let offset = -6; offset <= 6; offset++) {
    const absolute = nearest + offset
    const themeIndex = wrap(absolute, count)
    const distance = absolute - position.value
    const abs = Math.abs(distance)
    if (abs > 6.1) continue
    const centered = abs < 0.46
    const scale = centered && phase.value === 'reveal'
      ? tuning.coverScale : centered && phase.value === 'intro' ? 1.12 : Math.max(.75, 1.02 - abs * .065)
    const blur = phase.value === 'spinning' || phase.value === 'braking'
      ? Math.min(tuning.motionBlur, .4 + speedVisual.value * tuning.motionBlur * .75)
      : centered ? 0 : Math.min(8, Math.max(0, abs - .55) * 2.4)
    result.push({
      key: absolute,
      themeIndex,
      theme: slides.value[themeIndex]!,
      distance,
      style: {
        transform: `translate3d(calc(-50% + ${distance * slideGap.value}px), -50%, 0) scale(${scale})`,
        zIndex: Math.round(60 - abs * 8),
        opacity: String(Math.max(.12, Math.min(1, 1.18 - abs * .24))),
        filter: `blur(${blur.toFixed(2)}px)`,
        pointerEvents: isDrawing.value || abs > 4 ? 'none' : 'auto'
      }
    })
  }
  return result
})

/** 粒子位置固定，不会随着 Vue 的每次帧刷新重新随机跳动。 */
const snowflakes = Array.from({ length: 56 }, (_, index) => ({
  id: index,
  left: (index * 37.3 + 4.5) % 100,
  size: 1.6 + ((index * 13) % 11) / 3,
  opacity: .27 + ((index * 17) % 8) / 18,
  duration: 6 + ((index * 11) % 17),
  delay: -((index * 2.71) % 24),
  drift: ((index * 29) % 125) - 60
}))

const schedule = (fn: () => void, delay: number) => {
  const id = window.setTimeout(() => { timers.delete(id); if (!hasUnmounted) fn() }, delay)
  timers.add(id)
}

const showNotice = (message: string) => {
  notice.value = message
  schedule(() => { notice.value = '' }, 2600)
}

/** 独立修改每个雪花 WAAPI 动画的 playbackRate：最终减速，但不会停止。 */
const snowSpeed = (rate: number) => {
  if (!snowRef.value) return
  for (const flake of snowRef.value.querySelectorAll<HTMLElement>('.snowflake')) {
    for (const animation of flake.getAnimations()) animation.playbackRate = rate
  }
}

const releaseImages = () => {
  for (const blob of blobUrls) URL.revokeObjectURL(blob)
  blobUrls.clear()
}

/**
 * 图片受 JWT 保护，必须用 fetch(Authorization) 取得 Blob，再作为 img/background 使用。
 * 首页按主题读取两张图，同一 ID 只请求一次，切换用户不会混用缓存。
 */
const loadMemories = async () => {
  const version = ++loadVersion
  loading.value = true
  error.value = ''
  cancelAnimationFrame(frame)
  for (const timer of timers) clearTimeout(timer)
  timers.clear()
  phase.value = 'intro'
  revealedTheme.value = null
  releaseImages()
  const cache = new Map<string, string>()

  const fetchImage = async (travelId: number, mediaId: number | null, fallback: string | null): Promise<string | null> => {
    if (mediaId == null) return fallback
    const key = `${travelId}:${mediaId}`
    if (cache.has(key)) return cache.get(key)!
    try {
      const url = await createMediaBlobUrl(travelId, mediaId)
      if (hasUnmounted || version !== loadVersion) { URL.revokeObjectURL(url); return null }
      cache.set(key, url)
      blobUrls.add(url)
      return url
    } catch (e) {
      console.warn('某张主题照片暂时无法加载：', key, e)
      return fallback
    }
  }

  try {
    const response = await getMyHomeMemories()
    if (response.code !== 200) throw new Error(response.message || '获取旅行主题失败')
    const data = (response.data || []).slice(0, 24)
    const result: ThemeSlide[] = []
    // 小批次处理：不一次性加载几十张大的图片，避免页面卡顿。
    for (let start = 0; start < data.length; start += 4) {
      const batch = data.slice(start, start + 4)
      const loaded = await Promise.all(batch.map(async item => {
        const coverImage = await fetchImage(item.travelId, item.coverMediaId, item.coverUrl)
        const backgroundImage = await fetchImage(item.travelId, item.backgroundMediaId, item.backgroundUrl || coverImage)
        return { ...item, coverImage, backgroundImage }
      }))
      if (hasUnmounted || version !== loadVersion) return
      result.push(...loaded.filter(item => Boolean(item.coverImage)))
    }
    if (hasUnmounted || version !== loadVersion) return
    slides.value = result
    position.value = 0
    phase.value = 'intro'
    revealedTheme.value = null
    speedVisual.value = 0
    await nextTick()
    snowSpeed(.8)
    if (result.length && tuning.autoplay && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) schedule(() => startDraw(), 1300)
  } catch (e) {
    if (!hasUnmounted && version === loadVersion) error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    if (!hasUnmounted && version === loadVersion) loading.value = false
  }
}

const finishReveal = () => {
  speedVisual.value = 0
  phase.value = 'reveal'
  revealedTheme.value = activeTheme.value
  snowSpeed(tuning.snowRate)
}

/** 惯性曲线：起步高速、后段逐渐减速；完整停稳后才进入黑屏。 */
const easeOutQuart = (progress: number) => 1 - Math.pow(1 - progress, 4)
const runDraw = (target: number, duration = tuning.drawMs) => {
  cancelAnimationFrame(frame)
  const from = position.value
  const distance = target - from
  const started = performance.now()
  phase.value = 'spinning'
  revealedTheme.value = null
  snowSpeed(2.25)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reducedMotion) {
    position.value = target
    finishReveal()
    return
  }

  const tick = (now: number) => {
    if (hasUnmounted) return
    const t = Math.max(0, Math.min(1, (now - started) / duration))
    position.value = from + distance * easeOutQuart(t)
    speedVisual.value = Math.min(1, Math.abs(distance) * 4 * Math.pow(1 - t, 3) / (duration / 1000) / 18)
    // 先让胶片完成减速并真正停稳；严格禁止在运动过程中提前黑屏。
    phase.value = t >= .62 ? 'braking' : 'spinning'
    if (++snowTickCount % 5 === 0) snowSpeed(Math.max(.22, .26 + speedVisual.value * 2.1))
    if (t < 1) frame = requestAnimationFrame(tick)
    else {
      position.value = target
      speedVisual.value = 0
      phase.value = 'blackout'
      snowSpeed(.24)
      // 停稳后黑屏，等结束再揭晓该主题对应的背景画面。
      schedule(finishReveal, tuning.blackoutMs)
    }
  }
  frame = requestAnimationFrame(tick)
}

/** 多个主题滚动多圈，最终准确停在抽中的“旅行主封面”上。 */
const startDraw = () => {
  if (!slides.value.length || isDrawing.value) return
  const total = slides.value.length
  const current = Math.round(position.value)
  if (total === 1) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishReveal()
      return
    }
    phase.value = 'blackout'
    revealedTheme.value = null
    schedule(finishReveal, tuning.blackoutMs)
    return
  }
  let chosen = Math.floor(Math.random() * total)
  if (chosen === wrap(current, total)) chosen = (chosen + 1) % total
  const steps = Math.max(21, total * 3 + 6)
  const turns = Math.ceil((current + steps - chosen) / total)
  runDraw(turns * total + chosen, tuning.drawMs)
}

const selectTheme = (themeIndex: number) => {
  if (isDrawing.value || !slides.value.length) return
  const total = slides.value.length
  const current = Math.round(position.value)
  const forward = wrap(themeIndex - wrap(current, total), total)
  const backward = forward - total
  const step = Math.abs(backward) < forward ? backward : forward
  if (!step) return
  runDraw(current + step, Math.max(900, Math.round(tuning.drawMs * .38)))
}

const openJourney = () => {
  if (activeTheme.value && !isDrawing.value) router.push(`/journey/${activeTheme.value.travelId}`)
}

const hideBrokenImage = (event: Event) => {
  (event.target as HTMLImageElement).style.display = 'none'
}

const onResize = () => { screenWidth.value = window.innerWidth }

onMounted(() => {
  window.addEventListener('resize', onResize)
  void loadMemories()
})
onBeforeUnmount(() => {
  hasUnmounted = true
  ++loadVersion
  cancelAnimationFrame(frame)
  for (const timer of timers) clearTimeout(timer)
  timers.clear()
  window.removeEventListener('resize', onResize)
  releaseImages()
})
</script>

<style scoped>
/* 视觉风格：外层淡粉色，播放器里保留参考视频的暗色景深和清晰主体。 */
 .memory-home{min-height:100vh;padding:0 var(--tm-gutter) 26px;overflow-x:hidden;background:var(--tm-night);color:var(--tm-sheet)}
.home-cover{position:relative;isolation:isolate;min-height:clamp(520px,73svh,810px);display:flex;align-items:flex-end;margin:0 calc(-1 * var(--tm-gutter));overflow:hidden;background:#172331}
.home-cover-image,.home-cover-image::after,.home-cover-image img{position:absolute;inset:0;width:100%;height:100%}
.home-cover-image{z-index:-1;background:var(--tm-overview-art) 64% center / cover no-repeat;animation:arrival .85s ease-out both}
.home-cover-image img{object-fit:cover;object-position:58% center}
.home-cover-image::after{content:'';background:linear-gradient(90deg,#0d1a18e8,#10202380 51%,transparent 88%),linear-gradient(0deg,#0d1a18d6,transparent 67%)}
@keyframes arrival{from{transform:scale(1.035)}to{transform:scale(1)}}
.home-cover-copy{width:min(var(--tm-width),100%);margin-inline:auto;padding:64px var(--tm-gutter) clamp(80px,12vw,150px)}
.home-cover-copy .tm-kicker,.intro .tm-kicker,.cover-edition{color:var(--tm-rose)}
.home-cover-copy .tm-kicker span{margin-right:10px}
.home-cover h1{margin:20px 0;font:700 clamp(2.5rem,6.3vw,6.4rem)/1.08 var(--tm-display);letter-spacing:-.065em}
.home-lead{max-width:31rem;color:#f0eae2;line-height:1.75;font-size:clamp(.95rem,1.7vw,1.15rem)}
.home-cover-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:27px}
.cover-edition{position:absolute;right:var(--tm-gutter);bottom:22px;border-top:1px solid #fffa;padding-top:8px}
.intro{max-width:var(--tm-width);margin:clamp(36px,6vw,84px) auto 22px;display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap}
.intro h2{margin:0;font:700 clamp(1.9rem,4vw,3.3rem)/1.1 var(--tm-display)}
.intro > p{color:#e2e7de;margin:0 0 3px;max-width:26rem;line-height:1.65;font-size:.91rem}
.cinema{position:relative;isolation:isolate;overflow:hidden;max-width:1420px;height:clamp(475px,51vw,628px);margin:0 auto;border-radius:29px;border:1px solid #ffffffb0;background:#313341;box-shadow:0 28px 68px #ae628b64}
/* 基础暗色舞台始终存在。主题照片背景必须等选中后才出现。 */
.neutral-background{position:absolute;inset:-20px;z-index:0;background:radial-gradient(ellipse at 60% 34%,#8190a5,#3c4055 48%,#292337 100%);transform:scale(1.05)}
.theme-background{position:absolute;z-index:1;inset:-20px;background-position:center;background-size:cover;background-repeat:no-repeat;opacity:0;filter:blur(0) brightness(.92);transform:scale(1.05);pointer-events:none}
.cinema.phase-reveal .theme-background{animation:backgroundBurst 1050ms ease-out both}
@keyframes backgroundBurst{0%{opacity:1;filter:blur(0px) brightness(1.1);transform:scale(1.13)}18%{opacity:1;filter:blur(2px) brightness(1)}100%{opacity:1;filter:blur(var(--background-blur)) brightness(.58) saturate(.86);transform:scale(1.07)}}
.scene-vignette{position:absolute;z-index:2;inset:0;pointer-events:none;background:linear-gradient(to bottom,#211b2f99 0%,#15192413 26%,#17152327 62%,#191223b3 100%),radial-gradient(ellipse at center,transparent 32%,#261e374b 100%)}
.snow-layer{position:absolute;z-index:3;inset:0;pointer-events:none;overflow:hidden;filter:blur(0);transition:filter 1050ms ease,opacity 1050ms ease}.cinema.phase-reveal .snow-layer{filter:blur(var(--snow-blur));opacity:.48}
.snowflake{position:absolute;top:-22px;border-radius:50%;background:#fff;box-shadow:0 0 6px #ffffffac;animation:snowfall linear infinite;will-change:transform}
@keyframes snowfall{from{transform:translate3d(0,-22px,0)}to{transform:translate3d(var(--drift),715px,0)}}
.cinema-topline{position:absolute;top:22px;left:5%;right:5%;z-index:8;display:flex;justify-content:space-between;gap:10px;color:#fff7f9cb;font-size:9px;letter-spacing:.15em}.title-area{position:absolute;top:10%;left:12px;right:12px;z-index:10;text-align:center;pointer-events:none;color:white;text-shadow:0 4px 19px #110e21d0}.mini-headline{font-size:12px;letter-spacing:.26em}.theme-title{max-width:88%;margin:8px auto;font-size:clamp(23px,3.1vw,42px);white-space:nowrap;text-overflow:ellipsis;overflow:hidden;letter-spacing:.09em;animation:titleChange .28s ease-out}
@keyframes titleChange{from{opacity:.32;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
.film-stage,.film-track{position:absolute;inset:0;pointer-events:none}.film-stage{z-index:6}.film-track{z-index:2}.cover-slot{position:absolute;top:51%;left:50%;width:156px;height:208px;appearance:none;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto;will-change:transform,filter;transition:opacity .13s linear;transform-origin:center}
.cover-inner{width:100%;height:100%;display:block;border:3px solid #fff9f7e8;box-shadow:0 13px 33px #160d20a6;overflow:hidden;background:linear-gradient(140deg,#f9b9d2,#a3bcd3);transform-origin:center;backface-visibility:hidden}
.cover-slot img{display:block;width:100%;height:100%;object-fit:cover;user-select:none}.cover-fallback{height:100%;display:grid;place-items:center;font-size:68px;color:#fff}.cover-slot.centered .cover-inner{box-shadow:0 24px 54px #0c1017b9,0 0 23px #ffd9f5b0}
/* 定格主体清晰，放大弹出 + 摇晃（与独立背景虚化互不影响）。 */
.cinema.phase-reveal .cover-slot.centered .cover-inner{animation:coverPop 560ms cubic-bezier(.16,1.4,.36,1) both,coverWobble 3.9s ease-in-out 560ms infinite}
@keyframes coverPop{0%{transform:scale(.82) rotate(-5deg);filter:brightness(1.7)}55%{transform:scale(1.09) rotate(2deg)}100%{transform:scale(1) rotate(-1.2deg);filter:brightness(1)}}
@keyframes coverWobble{0%,100%{transform:rotate(calc(var(--sway-deg) * -1)) translateY(0)}50%{transform:rotate(var(--sway-deg)) translateY(-4px)}}
.selection-frame{position:absolute;z-index:1;left:50%;top:51%;width:170px;height:223px;opacity:.74;transform:translate(-50%,-50%);pointer-events:none;transition:transform .38s ease,opacity .38s ease}
.frame-one,.frame-two{position:absolute;inset:0;border:2px solid #fff9f4e6;transform:rotate(-14deg);box-shadow:0 0 15px #ffcde55c}.frame-two{inset:7px;transform:rotate(8deg);opacity:.5}.cinema.phase-reveal .selection-frame{opacity:1;transform:translate(-50%,-50%) scale(var(--frame-scale))}.cinema.phase-reveal .frame-one{animation:frameWobble 4.2s ease-in-out infinite}.cinema.phase-reveal .frame-two{animation:frameCounter 3.8s ease-in-out infinite}
@keyframes frameWobble{0%,100%{transform:rotate(-13deg)}50%{transform:rotate(-17deg) translateY(4px)}}@keyframes frameCounter{0%,100%{transform:rotate(8deg)}50%{transform:rotate(12deg)}}
.author-info{position:absolute;left:6%;bottom:21%;z-index:9;max-width:25%;display:grid;gap:7px;color:white;text-shadow:0 3px 15px #12111fe3}.metadata-label{font-size:9px;letter-spacing:.19em;color:#ffe1eec6}.author-info strong{font-size:clamp(15px,1.8vw,21px);overflow-wrap:anywhere}.author-info small{font-size:10px;color:#ffe2f0}
.message-info{position:absolute;z-index:9;left:27%;right:20%;bottom:11%;text-align:center;color:#fff;text-shadow:0 3px 15px #131324d5}.memory-caption{margin:8px auto 0;max-height:2.8em;overflow:hidden;font-size:clamp(14px,2vw,24px);line-height:1.4;letter-spacing:.07em;animation:titleChange .25s ease}.cinema.phase-spinning .message-info,.cinema.phase-spinning .author-info{opacity:.58}
.cinema-footnote{position:absolute;z-index:9;left:5%;right:5%;bottom:21px;display:flex;align-items:center;gap:14px;font-size:9px;color:#fff9;letter-spacing:.12em}.footnote-line{height:1px;width:62px;background:#fffc}
/* 提前降低移动速度后才遮住舞台，黑屏最后揭晓主题背景。 */
.blackout-curtain{position:absolute;z-index:30;inset:0;pointer-events:none;background:#050407;opacity:0;transition:opacity 150ms ease}.cinema.phase-blackout .blackout-curtain{opacity:1;transition:opacity 160ms ease}.cinema.phase-reveal .blackout-curtain{opacity:0;transition:opacity 140ms ease}
.reveal-glow{position:absolute;z-index:24;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,#fff9df70,transparent 54%)}.cinema.phase-reveal .reveal-glow{animation:glowFlash 740ms ease-out both}@keyframes glowFlash{0%{opacity:.9}100%{opacity:0}}
.player-controls{max-width:1420px;margin:19px auto;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap}.action-primary,.action-secondary{padding:12px 22px;border-radius:14px;border:0;cursor:pointer;font-weight:750;transition:transform .2s}.action-primary{color:#7e4563;background:linear-gradient(115deg,#ffc2dc,#fff0c0);box-shadow:0 12px 25px #cf779b37}.action-secondary{border:1px solid #f2c0d7;color:#8a506d;background:#fff9}.action-primary:hover:not(:disabled),.action-secondary:hover:not(:disabled){transform:translateY(-2px)}.action-primary:disabled,.action-secondary:disabled{opacity:.5;cursor:not-allowed}.player-help{width:100%;text-align:center;font-size:11px;color:#ac8399}.memory-home footer{text-align:center;color:#b9859e;font-size:10px;letter-spacing:.14em;margin:25px 0 3px}
.empty-state{max-width:1420px;min-height:400px;margin:10px auto;padding:26px;border-radius:26px;border:1px solid #fff;background:#fff8;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}.empty-state h2{margin:8px 0}.empty-state p{color:#af839d;max-width:640px;line-height:1.7}.empty-spark{font-size:40px;color:#dd86aa}.empty-actions{display:flex;gap:12px;margin-top:10px}.toast{position:fixed;z-index:40;bottom:27px;right:25px;cursor:pointer;border-radius:14px;padding:15px 18px;color:#8d5071;background:#fff9;box-shadow:0 16px 40px #a57b965a}
/* 仅 /home?debug=1 展示的调试面板。所有参数都能本地实时调整。 */
.tuning-panel{max-width:1120px;margin:20px auto 0;padding:18px 22px;border:1px solid #f6c5da;border-radius:20px;background:#fffdf6e5;box-shadow:0 10px 30px #bb8eaa24}
.tuning-panel summary{cursor:pointer;font-weight:750;color:#915675;user-select:none}
.tuning-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin:18px 0}
.tuning-grid label{display:flex;flex-direction:column;gap:7px;font-size:12px;color:#84536c}
.tuning-grid label strong{font-size:12px;color:#c06594}
.tuning-grid input[type=range]{width:100%;accent-color:#d37aa6;cursor:pointer}
.tuning-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
.tuning-actions button{border:1px solid #e9b7cc;border-radius:12px;padding:10px 14px;background:#ffe8f0;color:#8b4b6c;font-weight:650;cursor:pointer}
.tuning-actions button:disabled{opacity:.45;cursor:not-allowed}
.tuning-actions .autoplay-choice{margin-right:auto;font-size:12px;display:flex;align-items:center;gap:6px;color:#925674}
.tuning-status{font-size:11px;color:#a77e93}
@media(max-width:900px){.tuning-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:700px){.tuning-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.memory-home{padding:12px}.navigation{padding:8px 10px;gap:10px}.brand{font-size:13px}.brand small,.nav-links{display:none}.my-button{font-size:11px;padding:9px}.intro{margin:36px auto 18px}.cinema{height:505px;border-radius:24px}.cinema-topline{left:16px;right:16px;font-size:8px}.title-area{top:15%}.theme-title{font-size:22px}.cover-slot{width:116px;height:164px}.selection-frame{width:135px;height:181px}.author-info{left:14px;bottom:21%;max-width:32%}.author-info strong{font-size:13px}.message-info{left:36%;right:4%;bottom:12%;text-align:center}.memory-caption{font-size:14px}.cinema-footnote{left:15px;right:15px;gap:5px}.cinema-footnote span:last-child{font-size:8px}.action-primary,.action-secondary{padding:11px 13px;font-size:12px}}
@media(prefers-reduced-motion:reduce){.cinema.phase-reveal .cover-slot.centered .cover-inner,.cinema.phase-reveal .frame-one,.cinema.phase-reveal .frame-two,.cinema.phase-reveal .theme-background,.cinema.phase-reveal .reveal-glow,.snowflake{animation:none!important}.cinema.phase-reveal .theme-background{opacity:1;filter:blur(10px) brightness(.6)}}
.cinema{border-color:#627568;border-radius:8px;box-shadow:none}
.neutral-background{background:linear-gradient(0deg,#111e1ced,#1a29336b),var(--tm-overview-art) center / cover}
.empty-state{min-height:235px;border:1px solid #5a6f61;border-radius:8px;background:#1b2f28;padding:24px 15px}
.empty-state p,.player-help{color:#d1ddd2}
.empty-actions{flex-wrap:wrap;justify-content:center}
.action-primary,.action-secondary{min-height:44px;border-radius:5px}
.action-primary{background:var(--tm-sheet);color:var(--tm-night);box-shadow:none}
.action-secondary{background:#1b342a;color:var(--tm-sheet);border-color:#788d7d}
.memory-home footer{color:#bed0c1}
@media(max-width:700px){
 .home-cover{min-height:530px;margin-inline:-12px}
 .home-cover-image::after{background:linear-gradient(0deg,#0d1a18f2,#10202376 59%,transparent)}
 .home-cover-copy{padding:64px 20px 74px}
 .home-cover h1{letter-spacing:-.06em}
}
@media(prefers-reduced-motion:reduce){
 .home-cover-image{animation:none}
 .action-primary,.action-secondary,.cover-slot,.blackout-curtain{transition:none}
}
</style>
