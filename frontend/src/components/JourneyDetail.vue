<template>
  <main class="detail-page">
    <div class="tm-street-backdrop" aria-hidden="true"></div>

    <section class="shell">
      <div class="detail-back"><button type="button" @click="goMe">{{ isOwner ? "← 我的旅程" : "← 返回发现" }}</button></div>

      <section v-if="loading" class="state glass">正在读取旅行详情...</section>

      <section v-else-if="!travel" class="state glass">
        <h1>没有找到这段旅行</h1>

        <button @click="goHome">返回首页</button>
      </section>

      <template v-else>
        <section class="hero">
          <JourneyCover
            :travel-id="Number(travel.id)"
            :direct-url="travel.coverUrl"
            :background-url="travel.backgroundUrl"
            :revision="coverRevision"
            lookup-theme album-fallback eager
          />
          <div class="hero-mask"></div>

          <div class="hero-copy">
            <p class="tm-kicker">Journey File / {{ String(travel.id).padStart(3, "0") }}</p>

            <h1>{{ travel.title }}</h1>

            <p v-if="travel.subtitle" class="hero-subtitle">{{ travel.subtitle }}</p>
            <p v-if="travel.description" class="hero-description">{{ travel.description }}</p>

            <div class="meta">
              <span>
                {{ dateRange }}
              </span>

              <span>
                {{ travel.visibility === "PUBLIC" ? "公开" : "私密" }}
              </span>

              <span>
                {{ travel.isPublished === 1 ? "已发布" : "草稿" }}
              </span>
            </div>
            <a class="tm-action outline album-link" href="#travel-album" @click.prevent="openAlbum">
              {{ isOwner ? "整理旅行照片" : "查看旅行相册" }} ↓
            </a>
          </div>
        </section>

        <section id="travel-modes" class="mode-tabs" role="group" aria-label="旅行观看模式">
          <button
            :aria-pressed="activeMode === 'map'"
            :class="{ active: activeMode === 'map' }"
            @click="activeMode = 'map'"
          >
            <span>01</span> 旅行地图
          </button>

          <button
            :aria-pressed="activeMode === 'story'"
            :class="{ active: activeMode === 'story' }"
            @click="activeMode = 'story'"
          >
            <span>02</span> 故事时间线
          </button>

          <button
            :aria-pressed="activeMode === 'cinema'"
            :class="{ active: activeMode === 'cinema' }"
            @click="activeMode = 'cinema'"
          >
            <span>03</span> 沉浸播放
          </button>
        </section>

        <!-- ★★★★★【真正的地图编辑器】★★★★★ -->

        <TravelMapModes
        v-if="activeMode === 'map'"
        :key="`map-${contentVersion}`"
        :travel-id="Number(travel.id)"
        :editable="isOwner"
        :focus-point="focusPoint"
      />

      <TravelStoryTimeline
        v-else-if="activeMode === 'story'"
        :key="`story-${contentVersion}`"
        :travel-id="Number(travel.id)"
        :editable="isOwner"
        @create="activeMode = 'map'"
        @locate="locateStoryPoint"
      />

      <ImmersivePlayer
        v-else
        :key="`cinema-${contentVersion}`"
        :travel-id="Number(travel.id)"
        :title="travel.title"
        :subtitle="travel.subtitle"
        :theme-image="heroImage"
        :editable="isOwner"
        @create="activeMode = 'map'"
      />
        <!--
          ★★★★★【旅行多图上传 / 照片相册】★★★★★
          当前旅行的创建者可以上传和删除，其他授权用户只可浏览。
          照片依靠 JWT 接口读取，不直接放在 public/images 目录。
        -->
        <TravelPhotoGallery
          id="travel-album"
          :key="contentVersion"
          :travel-id="Number(travel.id)"
          :editable="isOwner"
          @updated="themePickerKey++; refreshCover()"
        />

        <!-- ★★★★★【每次旅行独立设置主封面 + 背景画面】★★★★★ -->
        <details v-if="isOwner" class="detail-settings"><summary>设置封面与背景 · 从旅行相册选择</summary>
        <ThemeArtPicker
          v-if="isOwner"
          :key="themePickerKey"
          @saved="refreshCover"
          :travel-id="Number(travel.id)"
        />

        </details>
        <TravelManager
          v-if="isOwner"
          class="detail-settings"
          :travel="travel"
          @updated="refreshTravel"
        />
        <TravelSocial
          :key="travel.id"
          :travel-id="Number(travel.id)"
          :owner="isOwner"
        />
        <div v-if="isOwner" class="director-link">
          <button type="button" class="tm-action" @click="router.push(`/journey/${travel.id}/director`)">
            ✨ AI 旅行导演 · 30 秒电影
          </button>
        </div>
      <TravelCollabWorkspace :key="travel.id" :travel-id="Number(travel.id)" />
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
import JourneyCover from "@/components/JourneyCover.vue";
import TravelCollabWorkspace from "@/components/TravelCollabWorkspace.vue";
import TravelManager from "@/components/TravelManager.vue";
import TravelSocial from "@/components/TravelSocial.vue";
import TravelMapModes from "@/components/TravelMapModes.vue";
import TravelStoryTimeline from "@/components/TravelStoryTimeline.vue";
import ImmersivePlayer from "@/components/ImmersivePlayer.vue";
import { computed, nextTick, onBeforeUnmount, watch, ref } from "vue";

import { useRoute, useRouter } from "vue-router";

import { getTravelDetailApi, type TravelProject } from "@/api/travel";

import { getThemeArtApi } from "@/api/themeArt";
import { createMediaBlobUrl, getTravelMediaApi } from "@/api/media";
import TravelPhotoGallery from "@/components/TravelPhotoGallery.vue";
import ThemeArtPicker from "@/components/ThemeArtPicker.vue";

// PHASE9_DETAIL_STORY · 故事卡片可跳回对应地图记忆点
const focusPoint = ref<{
  pointId: number;
  pointType: "CUSTOM" | "REAL";
} | null>(null);

async function locateStoryPoint(point: {
  pointId: number;
  pointType: "CUSTOM" | "REAL";
}) {
  focusPoint.value = point;
  await router.push({ path: route.path, query: { ...route.query, mode: "map" } });
  await nextTick();
  document.getElementById("travel-modes")?.scrollIntoView({ block: "start" });
}

const contentVersion = ref(0);
async function refreshTravel() {
  await loadTravel(false);
  contentVersion.value++;
  themePickerKey.value++;
  refreshCover();
}

function openAlbum() {
  document.getElementById("travel-album")?.scrollIntoView({ block: "start" });
}
const themePickerKey = ref(0);
const coverRevision = ref(0);
function refreshCover() {
  coverRevision.value++;
  if (activeMode.value === "cinema") void loadHero();
}

const route = useRoute();
const router = useRouter();

const currentUserId = (() => {
  try {
    return Number(
      JSON.parse(localStorage.getItem("travel_user") || "{}").id || 0,
    );
  } catch {
    return 0;
  }
})();

/** 仅用来决定是否显示上传按钮；实际上传权限由后端 JWT 校验。 */
const isOwner = computed(
  () => travel.value !== null && Number(travel.value.userId) === currentUserId,
);

const travel = ref<TravelProject | null>(null);

const loading = ref(true);
let travelVersion = 0;

const activeMode = computed<"map" | "story" | "cinema">({
  get: () => route.query.mode === "story" || route.query.mode === "cinema" ? route.query.mode : "map",
  set: mode => {void router.push({path:route.path,query:{...route.query,mode}});},
});

const travelId = computed(() => {
  return String(route.params.id || "");
});

const themeHero = ref("");
let heroVersion = 0;
async function loadHero() {
  const version = ++heroVersion;
  const id = Number(travelId.value);
  try {
    const [theme, media] = await Promise.all([
      getThemeArtApi(id),
      getTravelMediaApi(id),
    ]);
    if (version !== heroVersion || theme.code !== 200 || media.code !== 200) return;
    const available = new Set(media.data.map((x) => x.id));
    const preferred = theme.data.backgroundMediaId || theme.data.coverMediaId;
    const image =
      preferred && available.has(preferred) ? preferred : media.data[0]?.id;
    if (!image) {
      if (themeHero.value) URL.revokeObjectURL(themeHero.value);
      themeHero.value = "";
      return;
    }
    // ★★★★★【图片路径】★★★★★：由当前旅行照片接口生成，禁止使用服务器磁盘路径。
    const url = await createMediaBlobUrl(id, image);
    if (version !== heroVersion) {
      URL.revokeObjectURL(url);
      return;
    }
    if (themeHero.value) URL.revokeObjectURL(themeHero.value);
    themeHero.value = url;
  } catch {}
}
const heroImage = computed(() => {
  return (
    themeHero.value ||
    travel.value?.backgroundUrl ||
    travel.value?.coverUrl ||
    null
  );
});

const dateRange = computed(() => {
  if (!travel.value) {
    return "";
  }

  if (travel.value.startDate && travel.value.endDate) {
    return `${travel.value.startDate}` + ` → ${travel.value.endDate}`;
  }

  return travel.value.startDate || "日期待补充";
});

const loadTravel = async (showLoading = true) => {
  const version = ++travelVersion;
  loading.value = showLoading;

  try {
    const result = await getTravelDetailApi(travelId.value);

    if (version !== travelVersion) return;
    if (result.code !== 200) {
      travel.value = null;
      return;
    }

    travel.value = result.data;
    if (activeMode.value === "cinema") void loadHero();
  } catch (error) {
    if (version !== travelVersion) return;
    console.error("读取旅行详情失败：", error);

    if (showLoading) travel.value = null;
  } finally {
    if (version === travelVersion) loading.value = false;
  }
};

const goHome = async () => {
  await router.push("/home");
};

const goMe = async () => {
  await router.push(isOwner.value ? { path: "/me", query: { section: "journeys" } } : "/discover");
};

watch(
  travelId,
  () => {
    if (themeHero.value) URL.revokeObjectURL(themeHero.value);
    themeHero.value = "";
    heroVersion++;
    focusPoint.value = null;
    travel.value = null;
    void loadTravel();
  },
  { immediate: true },
);
watch(activeMode, mode => { if (mode === "cinema" && travel.value) void loadHero(); });
onBeforeUnmount(() => {
  travelVersion++;
  heroVersion++;
  if (themeHero.value) URL.revokeObjectURL(themeHero.value);
});
</script>

<style scoped>
.detail-page{position:relative;min-height:100vh;padding:var(--tm-gutter);color:var(--tm-ink);background:var(--tm-paper)}
.detail-page > .tm-street-backdrop::after{content:'';position:absolute;inset:0;background:#f7f4eadd}
.shell{position:relative;width:min(1240px,100%);margin:auto}
.detail-back{margin-bottom:14px}
.detail-back button,.state button{min-height:44px;padding:8px 15px;border:1px solid var(--tm-line);border-radius:4px;background:var(--tm-sheet);color:var(--tm-accent);cursor:pointer}
.state{min-height:320px;display:grid;place-content:center;justify-items:center;background:var(--tm-sheet);border:1px solid var(--tm-line)}
.hero{position:relative;min-height:clamp(390px,49vw,650px);display:flex;align-items:flex-end;overflow:hidden;isolation:isolate;border-radius:6px;background:var(--tm-night);color:var(--tm-sheet);box-shadow:var(--tm-lift)}
.hero-mask{position:absolute;inset:0;pointer-events:none;background:linear-gradient(0deg,#101c1bf5,#101c1b82 58%,#101c1b09)}
.hero-copy{position:relative;width:min(780px,100%);padding:clamp(22px,5vw,68px);overflow-wrap:anywhere}
.hero .tm-kicker{color:var(--tm-rose);margin:0}
.hero h1{margin:11px 0;font:700 clamp(2.5rem,6.8vw,6rem)/1.05 var(--tm-display);letter-spacing:-.05em}
.hero-subtitle{color:#f4d6cd;font-size:clamp(1rem,2.6vw,1.45rem);margin:10px 0}
.hero-description{max-width:60ch;line-height:1.8;color:#f4f0e9}
.meta{margin-top:20px;display:flex;flex-wrap:wrap;gap:8px}
.meta span{padding:7px 10px;border:1px solid #fff7;border-radius:3px;background:#17242086;color:#fff;font:.77rem/1.4 var(--tm-index)}
.album-link{margin-top:16px}
.mode-tabs{margin-top:18px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--tm-line);border:1px solid var(--tm-line)}
.mode-tabs button{min-height:52px;padding:10px 7px;border:0;border-bottom:3px solid transparent;background:var(--tm-sheet);color:var(--tm-ink);cursor:pointer;font-weight:700}
.mode-tabs button span{margin-right:6px;color:var(--tm-muted);font:600 .69rem var(--tm-index)}
.mode-tabs button.active{border-bottom-color:var(--tm-accent);background:#dfebe0;color:var(--tm-accent)}
.detail-settings{margin:13px 0;border:1px solid var(--tm-line);border-radius:4px;background:var(--tm-sheet);padding:15px 18px;color:var(--tm-accent)}
.detail-settings summary{cursor:pointer;font-size:.9rem;font-weight:700}
.detail-settings[open] summary{margin-bottom:12px}
.director-link{margin:16px 0}
@media(max-width:560px){.hero{min-height:360px}.mode-tabs button span{display:block;margin:0 0 4px}.mode-tabs button{font-size:.79rem}}
</style>
