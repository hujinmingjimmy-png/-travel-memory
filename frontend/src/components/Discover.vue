<template>
  <main class="discover-page">
    <div class="tm-street-backdrop" aria-hidden="true"></div>
    <div class="content-shell">
      <header class="hero">
        <div class="hero-copy">
          <p class="tm-kicker">02 / The Open Journal</p>
          <h1>{{ heroTitle }} <span>{{ heroAccent }}</span></h1>
          <p class="hero-description">从陌生人的取景框出发，遇见另一种看世界的方式。</p>
        </div>
        <span class="edition tm-kicker" aria-hidden="true">Travel Memory / 公开卷</span>
      </header>

      <div class="discover-layout">
        <aside class="discover-sidebar glass" aria-label="发现侧边栏">
          <div class="sidebar-heading">
            <p class="tm-kicker">Browse / 目录</p>
            <h2>翻阅故事</h2>
          </div>

          <nav class="sidebar-menu" aria-label="发现分类">
            <button
              type="button"
              :aria-pressed="activeCategory === 'recommend'"
              :class="{ selected: activeCategory === 'recommend' }"
              @click="selectCategory('recommend')"
            >
              <span>✦</span>
              <b>推荐</b>
              <small>For you</small>
            </button>

            <button
              type="button"
              :aria-pressed="activeCategory === 'follow'"
              :class="{ selected: activeCategory === 'follow' }"
              @click="selectCategory('follow')"
            >
              <span>✿</span>
              <b>关注</b>
              <small>Following</small>
            </button>

            <button
              type="button"
              :aria-pressed="activeCategory === 'likes'"
              :class="{ selected: activeCategory === 'likes' }"
              @click="selectCategory('likes')"
            >
              <span>♡</span>
              <b>喜欢</b>
              <small>Liked stories</small>
            </button>
          </nav>

        </aside>

        <section class="discover-main" :aria-busy="loading">
          <FollowedAuthorsPanel
            v-if="activeCategory === 'follow'"
            @open-author="openAuthor"
          />

          <template v-else>
            <section class="toolbar glass" aria-label="搜索与排序">
              <form class="search-form" @submit.prevent="searchTravels">
                <span aria-hidden="true">⌕</span>
                <input
                  v-model="searchInput"
                  maxlength="50"
                  aria-label="搜索旅行标题或故事"
                  placeholder="搜索旅行标题或故事..."
                />
                <button type="submit" :disabled="loading">搜索</button>
              </form>

              <div class="sort-tabs">
                <button
                  type="button"
                  :aria-pressed="sort === 'newest'"
                  :class="{ active: sort === 'newest' }"
                  @click="changeSort('newest')"
                >
                  ✦ 最新
                </button>
                <button
                  type="button"
                  :aria-pressed="sort === 'popular'"
                  :class="{ active: sort === 'popular' }"
                  @click="changeSort('popular')"
                >
                  ♡ 热门
                </button>
              </div>
            </section>

            <div class="section-head">
              <div>
                <p class="tm-kicker">
                  {{ activeCategory === 'likes' ? 'LIKED JOURNEYS' : 'PUBLIC TRAVEL STORIES' }}
                </p>
                <h2>
                  {{ activeCategory === 'likes' ? '我喜欢的旅行' : '世界的旅行手账' }}
                </h2>
              </div>
              <button v-if="query" type="button" class="clear" @click="clearSearch">
                清除“{{ query }}”
              </button>
            </div>

            <section v-if="error && cards.length === 0" class="state glass">
              <strong>暂时无法加载</strong>
              <p>{{ error }}</p>
              <button type="button" @click="load(true)">重试</button>
            </section>

            <section v-else-if="loading && cards.length === 0" class="state glass" role="status">
              <span class="loading-symbol">✿</span>
              <strong>正在寻找旅行记忆…</strong>
            </section>

            <section v-else-if="cards.length === 0" class="state glass">
              <span class="empty-symbol">♡</span>
              <strong>
                {{ activeCategory === 'likes' ? '还没有喜欢的旅行' : '还没有找到公开旅行' }}
              </strong>
              <p>
                {{ query ? '试试其他关键词，或清除搜索。' : activeCategory === 'likes'
                  ? '在推荐页点下“喜欢”，旅行就会收藏到这里。'
                  : '等有人把旅行设为公开并发布，这里就会出现。' }}
              </p>
            </section>

            <template v-else>
              <div class="travel-grid">
                <DiscoverTravelCard
                  v-for="(travel, index) in cards"
                  :key="travel.id"
                  :travel="travel"
                  :featured="index === 0 && !query"
                  @open="openJourney"
                  @author="openAuthor"
                  @liked="onTravelLiked"
                  @followed="onAuthorFollowed"
                />
              </div>

              <div class="load-more">
                <button
                  v-if="hasMore"
                  type="button"
                  :disabled="loading"
                  @click="load(false)"
                >
                  {{ loading ? '加载中…' : '继续发现更多旅行' }}
                </button>
                <span v-else>✿ 已经看到这里啦</span>
              </div>
            </template>
          </template>
        </section>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'

import {
  useRoute,
  useRouter
} from 'vue-router'

import DiscoverTravelCard from '@/components/DiscoverTravelCard.vue'
import FollowedAuthorsPanel from '@/components/FollowedAuthorsPanel.vue'

import {
  getDiscoverTravels,
  type DiscoverSort,
  type DiscoverTravel
} from '@/api/discover'


const router = useRouter()
const route = useRoute()

type DiscoverCategory =
  | 'recommend'
  | 'follow'
  | 'likes'

const activeCategory = computed<DiscoverCategory>(() => {
  const value = route.query.section
  return value === 'follow' || value === 'likes'
    ? value
    : 'recommend'
})

const heroTitle = computed(() => {
  if (activeCategory.value === 'follow') return '关注的旅人，'
  if (activeCategory.value === 'likes') return '喜欢的故事，'
  return '去发现，'
})

const heroAccent = computed(() => {
  if (activeCategory.value === 'follow') return '继续他们的旅程。'
  if (activeCategory.value === 'likes') return '重温心动的记忆。'
  return '别人的旅行故事。'
})

const cards = ref<DiscoverTravel[]>([])
const loading = ref(false)
const error = ref('')
const hasMore = ref(false)
const page = ref(0)
const searchInput = ref('')
const query = ref('')
const sort = ref<DiscoverSort>('newest')

let requestSerial = 0
let disposed = false

function selectCategory(category: DiscoverCategory) {
  if (category === activeCategory.value) return

  void router.push({
    path: '/discover',
    query:
      category === 'recommend'
        ? {}
        : { section: category }
  })
}

async function load(reset: boolean) {
  if (activeCategory.value === 'follow') return
  if (loading.value && !reset) return

  const serial = ++requestSerial

  if (reset) {
    cards.value = []
    page.value = 0
    hasMore.value = false
  }

  loading.value = true
  error.value = ''

  try {
    const result = await getDiscoverTravels({
      page: page.value + 1,
      size: 9,
      sort: sort.value,
      q: query.value,
      section: activeCategory.value
    })

    if (disposed || serial !== requestSerial) return

    if (result.code !== 200 || !result.data) {
      throw new Error(result.message || '查询发现页失败')
    }

    const newItems = result.data.items || []
    cards.value = reset
      ? newItems
      : [...cards.value, ...newItems]

    page.value = result.data.page
    hasMore.value = result.data.hasMore

  } catch (cause) {
    if (disposed || serial !== requestSerial) return
    error.value = cause instanceof Error ? cause.message : '加载失败，请重试'
  } finally {
    if (serial === requestSerial) loading.value = false
  }
}

function searchTravels() {
  query.value = searchInput.value.trim().slice(0, 50)
  void load(true)
}

function clearSearch() {
  searchInput.value = ''
  query.value = ''
  void load(true)
}

function changeSort(value: DiscoverSort) {
  if (sort.value === value) return
  sort.value = value
  void load(true)
}

function openJourney(id: number) {
  void router.push(`/journey/${id}`)
}

function openAuthor(id: number) {
  if (!id) return
  void router.push(`/author/${id}`)
}

function onTravelLiked(payload: {
  id: number
  liked: boolean
  likeCount: number
}) {
  const travel = cards.value.find(item => item.id === payload.id)

  if (travel) {
    travel.liked = payload.liked
    travel.likeCount = payload.likeCount
  }

  if (activeCategory.value === 'likes' && !payload.liked) {
    cards.value = cards.value.filter(item => item.id !== payload.id)
  }
}

function onAuthorFollowed(payload: {
  authorId: number
  following: boolean
}) {
  for (const travel of cards.value) {
    if (Number(travel.authorId) === Number(payload.authorId)) {
      travel.following = payload.following
    }
  }
}

watch(activeCategory, category => {
  requestSerial++
  cards.value = []
  page.value = 0
  hasMore.value = false
  error.value = ''
  loading.value = false

  if (category !== 'follow') {
    void load(true)
  }
})

onMounted(() => {
  if (activeCategory.value !== 'follow') {
    void load(true)
  }
})

onBeforeUnmount(() => {
  disposed = true
  requestSerial++
})
</script>

<style scoped>
.discover-page{position:relative;isolation:isolate;min-height:100vh;padding:var(--tm-gutter);color:var(--tm-ink);background:var(--tm-night)}
.discover-page > .tm-street-backdrop::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,#14241f10,#14241f9c)}
.content-shell{position:relative;width:min(var(--tm-width),100%);margin:auto}
.hero{position:relative;display:flex;align-items:end;justify-content:space-between;gap:24px;min-height:clamp(250px,32vw,420px);padding:clamp(22px,4vw,60px);overflow:hidden;border-radius:5px;color:var(--tm-sheet);background:linear-gradient(90deg,#101f1fe8,#101f1f87 54%,#101f1f29),var(--tm-street) center 32% / cover;box-shadow:var(--tm-lift)}
.hero h1{margin:10px 0 16px;font:700 clamp(2rem,5vw,4.75rem)/1.1 var(--tm-display);letter-spacing:-.055em}
.hero h1 span{display:block;color:#f4d2c7}
.hero .tm-kicker{color:#ffe1d6}
.hero-description{margin:0;line-height:1.7;color:#fff9f1}
.edition{min-width:max-content;border-top:1px solid #fff8;padding-top:7px}
.discover-layout{margin-top:clamp(16px,2.8vw,36px);display:grid;grid-template-columns:clamp(156px,16vw,220px) minmax(0,1fr);gap:clamp(14px,2.4vw,34px);align-items:start}
.discover-sidebar{position:sticky;top:calc(var(--tm-nav-height) + 14px);padding:17px;border-top:4px solid var(--tm-accent)}
.glass{background:var(--tm-sheet);box-shadow:var(--tm-lift)}
.sidebar-heading p{margin:0 0 8px;color:var(--tm-muted)}
.sidebar-heading h2{margin:0;font:700 1.45rem/1.2 var(--tm-display)}
.sidebar-menu{display:grid;margin-top:16px;gap:3px}
.sidebar-menu button{display:grid;grid-template-columns:20px minmax(0,1fr);gap:2px 8px;min-height:44px;padding:9px 8px;border:0;border-left:2px solid transparent;background:transparent;color:var(--tm-ink);cursor:pointer;text-align:left}
.sidebar-menu button small{grid-column:2;color:var(--tm-muted);font-size:.68rem}
.sidebar-menu button.selected,.sidebar-menu button:hover{background:#e8ede4;border-left-color:var(--tm-accent)}
.discover-main{min-width:0}
.toolbar{display:flex;flex-wrap:wrap;gap:9px;padding:10px;border-radius:4px}
.search-form{flex:1 1 240px;min-width:0;display:flex;align-items:center;gap:8px;border:1px solid var(--tm-line);padding:3px 3px 3px 10px;border-radius:4px}
.search-form:focus-within{border-color:var(--tm-accent)}
.search-form input{flex:1;min-width:0;border:0;background:transparent;color:var(--tm-ink)}
.search-form input:focus-visible{outline-offset:0}
.search-form button,.sort-tabs button,.state button,.load-more button,.clear{border:1px solid var(--tm-line);border-radius:4px;padding:8px 13px;min-height:40px;cursor:pointer;background:var(--tm-paper);color:var(--tm-ink);font-size:.86rem;font-weight:700}
.search-form button,.sort-tabs button.active{background:var(--tm-accent);color:var(--tm-sheet)}
.sort-tabs{display:flex;gap:6px}
.section-head{margin:20px 0 12px;padding:14px 17px;display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--tm-paper);border-top:1px solid var(--tm-line)}
.section-head p{margin:0 0 4px;color:var(--tm-muted)}
.section-head h2{margin:0;font:700 clamp(1.25rem,3vw,2rem)/1.18 var(--tm-display)}
.clear{overflow-wrap:anywhere;max-width:42%}
.travel-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(12px,2vw,25px)}
.state{min-height:240px;padding:22px;display:grid;place-content:center;justify-items:center;gap:9px;border-radius:4px;text-align:center;color:var(--tm-muted)}
.state p{margin:0 0 8px}
.loading-symbol,.empty-symbol{font-size:1.8rem;color:var(--tm-accent)}
.load-more{padding:24px 0 8px;display:flex;justify-content:center}
.load-more > span{padding:8px 14px;background:var(--tm-paper);color:var(--tm-muted);border-radius:4px}
@media(max-width:760px){
 .discover-layout{grid-template-columns:minmax(0,1fr)}
 .discover-sidebar{position:static;padding:10px}
 .sidebar-heading{display:none}
 .sidebar-menu{grid-template-columns:repeat(3,minmax(0,1fr));margin:0}
 .sidebar-menu button{grid-template-columns:auto auto;justify-content:center;border-left:0;border-bottom:2px solid transparent}
 .sidebar-menu button.selected{border-bottom-color:var(--tm-accent)}
 .sidebar-menu button small{display:none}
 .hero{min-height:270px}
 .edition{display:none}
}
@media(max-width:580px){
 .travel-grid{grid-template-columns:minmax(0,1fr)}
 .hero{background-image:linear-gradient(0deg,#101f1fed,#101f1f75 80%),var(--tm-street)}
 .sort-tabs{width:100%}.sort-tabs button{flex:1}
}
</style>
