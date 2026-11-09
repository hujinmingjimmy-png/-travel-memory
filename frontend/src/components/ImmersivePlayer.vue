<template>
  <section
    ref="playerRef"
    class="immersive-player"
    :class="{
      'is-playing': playing,
      'is-paused': phase === 'playing' && !playing,
      'is-fullscreen': isFullscreen,
    }"
    tabindex="0"
    @mousemove="revealControls"
    @keydown.space.prevent="togglePlay"
    @keydown.left.prevent="previous"
    @keydown.right.prevent="next()"
  >
    <div v-if="loading" class="player-state">
      <span class="state-flower">✿</span>
      <h3>正在准备你的旅行电影...</h3>
      <p>正在读取记忆点与照片。</p>
    </div>

    <div v-else-if="error" class="player-state error">
      <span class="state-flower">✦</span>
      <h3>暂时无法播放这段旅行</h3>
      <p>{{ error }}</p>

      <button type="button" @click="loadScenes()">重新加载</button>
    </div>

    <div v-else-if="!scenes.length" class="player-state">
      <span class="state-flower">✿</span>
      <h3>沉浸播放还没有第一幕</h3>
      <p>{{ editable ? '先在地图添加记忆点，并关联旅行照片，开启你的第一幕。' : '创建者还没有添加可播放的记忆点。' }}</p>
      <button v-if="editable" type="button" @click="$emit('create')">去地图补充记忆</button>
    </div>

    <template v-else>
      <div class="film-options" v-if="phase === 'ready'">
        <label
          >转场
          <select v-model="transition">
            <option value="fade">柔和淡入</option>
            <option value="slide">横向旅行</option>
            <option value="zoom">梦幻缩放</option>
          </select></label
        >
        <label
          ><input type="checkbox" v-model="mapEnabled" />真实地图镜头</label
        >
        <label><input type="checkbox" v-model="fullOnStart" />全屏开始</label>
        <label
          >背景音乐 <input type="file" accept="audio/*" @change="chooseMusic"
        /></label>
        <label
          >音量
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            v-model.number="volume"
        /></label>
        <label
          >音乐地址
          <input
            v-model="storedMusicUrl"
            maxlength="500"
            placeholder="https://… 或 /audio/travel.mp3"
        /></label>
        <button
          v-if="editable"
          type="button"
          :disabled="saving"
          @click="savePreferences"
        >
          保存播放设置
        </button>
        <small>{{ audioMessage || "音乐由本机选择，仅用于本次播放。" }}</small>
      </div>
      <audio
        ref="audioRef"
        :src="effectiveMusicUrl || undefined"
        loop
        preload="metadata"
        @error="audioMessage = '音乐无法载入，请检查地址或选择本机文件'"
      ></audio>
      <small class="audio-feedback" v-if="audioMessage && phase !== 'ready'">{{
        audioMessage
      }}</small>
      <div v-if="phase === 'ready'" class="intro-stage" :style="introStyle">
        <div class="intro-glow"></div>

        <p class="intro-eyebrow">TRAVEL MEMORY · IMMERSIVE FILM</p>

        <h2>{{ title }}</h2>

        <p class="intro-subtitle">
          {{ subtitle || "把地图上的每一站，重新播放成一段会呼吸的记忆。" }}
        </p>

        <div class="intro-meta">
          <span> {{ scenes.length }} 个记忆场景 </span>

          <span> 约 {{ estimatedMinutes }} 分钟 </span>
        </div>

        <button class="start-button" type="button" @click="start">
          <span>▶</span>
          开始播放
        </button>
      </div>

      <div v-else class="cinema-stage">
        <template v-if="current">
          <CinemaMap
            v-if="mapEnabled && current.pointType === 'REAL'"
            :longitude="current.longitude"
            :latitude="current.latitude"
            :duration="current.moveDuration"
          />
          <!-- ★★★★★【背景景深层】★★★★★ -->
          <div
            :key="`bg-${current.pointId}-${sceneRunKey}`"
            class="scene-background"
            v-show="!mapEnabled || current.pointType !== 'REAL'"
            :class="{ fallback: !currentImage }"
            :style="backgroundStyle"
          ></div>

          <div class="scene-vignette"></div>
          <div class="scene-grain"></div>

          <!-- ★★★★★【主体照片：始终保持清晰】★★★★★ -->
          <div
            :key="`main-${current.pointId}-${sceneRunKey}`"
            class="scene-main"
            :class="`transition-${transition}`"
            :style="sceneVars"
          >
            <div v-if="currentImage" class="photo-frame">
              <img :src="currentImage" :alt="current.title" draggable="false" />
            </div>

            <div v-else class="text-only-scene">
              <span>
                {{ current.pointType === "REAL" ? "⌖" : "✿" }}
              </span>

              <strong>
                {{ current.locationName || current.title }}
              </strong>
            </div>
          </div>

          <div
            :key="`copy-${current.pointId}-${sceneRunKey}`"
            class="scene-copy"
            :style="sceneVars"
          >
            <p class="scene-counter">
              MEMORY
              {{ String(index + 1).padStart(2, "0") }}
              /
              {{ String(scenes.length).padStart(2, "0") }}
            </p>

            <div class="scene-tags">
              <span v-if="current.travelDate">
                {{ current.travelDate }}
              </span>

              <span>
                {{ current.pointType === "REAL" ? "真实地图" : "手账地图" }}
              </span>
            </div>

            <h2>{{ current.title }}</h2>

            <p v-if="current.locationName" class="scene-location">
              ⌖ {{ current.locationName }}
            </p>

            <blockquote v-if="current.subtitle">
              “{{ current.subtitle }}”
            </blockquote>

            <p v-if="current.content" class="scene-story">
              {{ current.content }}
            </p>
          </div>

          <aside v-if="editable && settingsOpen" class="scene-settings">
            <header>
              <div>
                <small>SCENE SETTINGS</small>
                <b>当前场景参数</b>
              </div>

              <button type="button" @click="settingsOpen = false">×</button>
            </header>

            <label>
              播放顺序
              <input
                v-model.number="draft.sortOrder"
                type="number"
                min="-10000"
                max="10000"
              />
            </label>

            <label>
              最终放大
              <div class="range-row">
                <input
                  v-model.number="draft.cameraScale"
                  type="range"
                  min="1"
                  max="1.8"
                  step="0.01"
                />

                <span> {{ draft.cameraScale.toFixed(2) }}x </span>
              </div>
            </label>

            <label>
              镜头移动
              <div class="range-row">
                <input
                  v-model.number="draft.moveDuration"
                  type="range"
                  min="250"
                  max="5000"
                  step="50"
                />

                <span> {{ draft.moveDuration }}ms </span>
              </div>
            </label>

            <label>
              停留时间
              <div class="range-row">
                <input
                  v-model.number="draft.stayDuration"
                  type="range"
                  min="800"
                  max="12000"
                  step="100"
                />

                <span> {{ (draft.stayDuration / 1000).toFixed(1) }}s </span>
              </div>
            </label>

            <label>
              转场缓动

              <select v-model="draft.easing">
                <option value="ease-in-out">柔和推进</option>

                <option value="ease-out">快入慢停</option>

                <option value="linear">匀速</option>
              </select>
            </label>

            <button
              class="save-settings"
              type="button"
              :disabled="saving"
              @click="saveCurrentSettings"
            >
              {{ saving ? "保存中..." : "保存这一幕" }}
            </button>
          </aside>

          <div class="timeline-progress" :class="{ paused: !playing }">
            <span
              :key="`progress-${sceneRunKey}`"
              :style="progressStyle"
            ></span>
          </div>

          <nav
            class="player-controls"
            :class="{
              hidden: playing && !controlsVisible && !settingsOpen,
            }"
          >
            <div class="control-left">
              <button type="button" title="上一站" @click="previous">◀</button>

              <button class="main-control" type="button" @click="togglePlay">
                {{ playing ? "Ⅱ" : "▶" }}
              </button>

              <button type="button" title="下一站" @click="next()">▶</button>
            </div>

            <div class="control-center">
              <strong>
                {{ current.title }}
              </strong>

              <span>
                {{ index + 1 }}
                /
                {{ scenes.length }}
              </span>
            </div>

            <div class="control-right">
              <button
                v-if="editable"
                type="button"
                title="场景参数"
                @click="settingsOpen = !settingsOpen"
              >
                ⚙
              </button>

              <button type="button" title="全屏" @click="toggleFullscreen">
                {{ isFullscreen ? "↙" : "⛶" }}
              </button>

              <button type="button" title="退出播放" @click="stop">×</button>
            </div>
          </nav>
        </template>

        <div v-if="phase === 'ended'" class="ending-card">
          <span>✿</span>

          <p>JOURNEY COMPLETE</p>

          <h2>
            这一段旅行，
            <br />
            又被认真地走了一遍。
          </h2>

          <div>
            <button type="button" @click="restart">↻ 再播放一次</button>

            <button type="button" @click="stop">返回旅行详情</button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
defineEmits<{create:[]}>()
import {
  playbackSettings,
  savePlaybackSettings,
  type PlaybackSettings,
} from "@/api/playbackSettings";
import CinemaMap from "./CinemaMap.vue";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";

import { createMediaBlobUrl } from "@/api/media";

import {
  getImmersiveScenesApi,
  updateImmersiveSceneApi,
  type ImmersiveScene,
} from "@/api/immersive";

const props = defineProps<{
  travelId: number;
  title: string;
  subtitle?: string | null;
  editable: boolean;
  themeImage?: string | null;
}>();

type PlayerPhase = "ready" | "playing" | "ended";

const playerRef = ref<HTMLElement | null>(null);
const scenes = ref<ImmersiveScene[]>([]);
const loading = ref(true);
const error = ref("");
const phase = ref<PlayerPhase>("ready");
const index = ref(0);
const playing = ref(false);
const sceneRunKey = ref(0);
const settingsOpen = ref(false);
const saving = ref(false);
const controlsVisible = ref(true);
const isFullscreen = ref(false);
const transition = ref<PlaybackSettings["transition"]>("fade"),
  mapEnabled = ref(true),
  fullOnStart = ref(true),
  volume = ref(0.35);
const audioRef = ref<HTMLAudioElement | null>(null),
  musicUrl = ref(""),
  storedMusicUrl = ref(""),
  audioMessage = ref("");
// ★★★★★【图片路径】★★★★★：照片路径仍沿用鉴权媒体接口；音乐独立使用 /audio/。
const effectiveMusicUrl = computed(
  () => musicUrl.value || storedMusicUrl.value,
);
async function loadPreferences() {
  const id = props.travelId;
  try {
    const r = await playbackSettings(id);
    if (!alive || id !== props.travelId) return;
    if (r.code !== 200) throw new Error(r.message);
    transition.value = r.data.transition;
    storedMusicUrl.value = r.data.musicUrl || "";
    volume.value = r.data.volume;
    mapEnabled.value = r.data.mapEnabled;
    fullOnStart.value = r.data.fullOnStart;
  } catch (e) {
    audioMessage.value = e instanceof Error ? e.message : "设置读取失败";
  }
}
async function savePreferences() {
  if (saving.value) return;
  saving.value = true;
  try {
    const r = await savePlaybackSettings(props.travelId, {
      transition: transition.value,
      musicUrl: storedMusicUrl.value,
      volume: volume.value,
      mapEnabled: mapEnabled.value,
      fullOnStart: fullOnStart.value,
    });
    if (r.code !== 200) throw new Error(r.message);
    audioMessage.value = "播放设置已保存；本机文件仅用于本次播放";
  } catch (e) {
    audioMessage.value = e instanceof Error ? e.message : "设置保存失败";
  } finally {
    saving.value = false;
  }
}

function chooseMusic(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) {
    audioMessage.value = "音乐不能超过30MB";
    return;
  }
  if (musicUrl.value) URL.revokeObjectURL(musicUrl.value);
  musicUrl.value = URL.createObjectURL(file);
  audioMessage.value = file.name;
}
watch(volume, (v) => {
  if (audioRef.value) audioRef.value.volume = v;
});
watch(playing, async (v) => {
  const a = audioRef.value;
  if (!a || !effectiveMusicUrl.value) return;
  a.volume = volume.value;
  if (v) {
    try {
      await a.play();
    } catch {
      audioMessage.value = "浏览器未允许音乐播放，请再次点击播放";
    }
  } else a.pause();
});

let timer: ReturnType<typeof setTimeout> | null = null;
let controlTimer: ReturnType<typeof setTimeout> | null = null;
let deadline = 0;
let remainingMs = 0;
let alive = true;
let loadVersion = 0;
let enterVersion = 0;

const imageUrls = reactive<Record<number, string>>({});
const imageLoading = new Set<number>();

const draft = reactive({
  sortOrder: 0,
  cameraScale: 1.12,
  moveDuration: 900,
  stayDuration: 3800,
  easing: "ease-in-out" as "ease-in-out" | "ease-out" | "linear",
});

const current = computed(() => scenes.value[index.value] || null);

const currentImage = computed(() => {
  const mediaId = current.value?.mediaId;
  return mediaId == null ? "" : imageUrls[mediaId] || "";
});

const estimatedMinutes = computed(() => {
  const total = scenes.value.reduce(
    (sum, scene) => sum + scene.moveDuration + scene.stayDuration,
    0,
  );
  return Math.max(1, Math.round(total / 60000));
});

const sceneDuration = computed(() => {
  return current.value
    ? current.value.moveDuration + current.value.stayDuration
    : 0;
});

const sceneVars = computed(() => {
  const scene = current.value;
  const move = scene?.moveDuration || 900;
  const stay = scene?.stayDuration || 3800;

  return {
    "--scene-scale": String(scene?.cameraScale || 1.12),
    "--scene-move": `${move}ms`,
    "--scene-stay": `${stay}ms`,
    "--scene-total": `${move + stay}ms`,
    "--scene-easing": scene?.easing || "ease-in-out",
  };
});

// ★★★★★【图片路径】★★★★★：主题开场使用当前旅行的鉴权照片 Blob 地址。
const introStyle = computed(() =>
  props.themeImage
    ? {
        backgroundImage: `linear-gradient(#2e1726b8,#171019ed),url(${JSON.stringify(props.themeImage)})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }
    : {},
);
const backgroundStyle = computed(() => {
  if (!currentImage.value) return {};
  return {
    backgroundImage: `url(${JSON.stringify(currentImage.value)})`,
  };
});

const progressStyle = computed(() => ({
  "--progress-duration": `${Math.max(500, remainingMs || sceneDuration.value)}ms`,
}));

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function clearControlTimer() {
  if (controlTimer) {
    clearTimeout(controlTimer);
    controlTimer = null;
  }
}

function releaseImages() {
  for (const [key, url] of Object.entries(imageUrls)) {
    URL.revokeObjectURL(url);
    delete imageUrls[Number(key)];
  }
  imageLoading.clear();
}

async function ensureImage(scene: ImmersiveScene | null) {
  const version = loadVersion;
  const mediaId = scene?.mediaId;

  if (mediaId == null || imageUrls[mediaId] || imageLoading.has(mediaId))
    return;

  imageLoading.add(mediaId);

  try {
    const url = await createMediaBlobUrl(props.travelId, mediaId);

    if (!alive || version !== loadVersion) {
      URL.revokeObjectURL(url);
      return;
    }

    imageUrls[mediaId] = url;
  } catch (err) {
    console.debug("沉浸播放照片读取失败：", err);
  } finally {
    imageLoading.delete(mediaId);
  }
}

async function preloadAround() {
  await ensureImage(current.value);
  void ensureImage(scenes.value[index.value + 1] || null);
  void ensureImage(scenes.value[index.value - 1] || null);
  const keep = new Set(
    scenes.value
      .slice(Math.max(0, index.value - 1), index.value + 2)
      .map((s) => s.mediaId),
  );
  for (const [id, url] of Object.entries(imageUrls)) {
    if (!keep.has(Number(id))) {
      URL.revokeObjectURL(url);
      delete imageUrls[Number(id)];
    }
  }
}

function syncDraft() {
  const scene = current.value;
  if (!scene) return;

  draft.sortOrder = scene.sortOrder;
  draft.cameraScale = scene.cameraScale;
  draft.moveDuration = scene.moveDuration;
  draft.stayDuration = scene.stayDuration;
  draft.easing = scene.easing;
}

function schedule(milliseconds = sceneDuration.value) {
  clearTimer();

  if (phase.value !== "playing" || !playing.value || !current.value) return;

  remainingMs = Math.max(100, milliseconds);
  deadline = Date.now() + remainingMs;

  timer = setTimeout(() => {
    next(true);
  }, remainingMs);
}

async function enterScene(targetIndex: number) {
  clearTimer();
  const version = ++enterVersion;
  if (!scenes.value.length) return;

  index.value = Math.max(0, Math.min(scenes.value.length - 1, targetIndex));

  sceneRunKey.value++;
  settingsOpen.value = false;
  syncDraft();

  await preloadAround();
  await nextTick();
  if (!alive || version !== enterVersion || phase.value !== "playing") return;

  remainingMs = sceneDuration.value;

  if (playing.value) {
    schedule(remainingMs);
  }

  revealControls();
}

function start() {
  if (fullOnStart.value) void toggleFullscreen();
  if (!scenes.value.length) return;
  phase.value = "playing";
  playing.value = true;
  void enterScene(0);
}

function stop() {
  enterVersion++;
  if (audioRef.value) audioRef.value.currentTime = 0;
  clearTimer();
  playing.value = false;
  phase.value = "ready";
  settingsOpen.value = false;
  index.value = 0;
  remainingMs = 0;
  void exitFullscreen();
}

function restart() {
  phase.value = "playing";
  playing.value = true;
  void enterScene(0);
}

function togglePlay() {
  if (phase.value === "ready") {
    start();
    return;
  }

  if (phase.value === "ended") {
    restart();
    return;
  }

  if (!playing.value) {
    playing.value = true;
    schedule(remainingMs || sceneDuration.value);
    revealControls();
    return;
  }

  remainingMs = Math.max(100, deadline - Date.now());
  playing.value = false;
  clearTimer();
  revealControls();
}

function previous() {
  if (phase.value !== "playing") return;
  void enterScene(index.value <= 0 ? 0 : index.value - 1);
}

function next(automatic = false) {
  if (phase.value !== "playing") return;

  if (index.value >= scenes.value.length - 1) {
    clearTimer();
    playing.value = false;
    phase.value = "ended";
    return;
  }

  void enterScene(index.value + 1);

  if (!automatic) {
    revealControls();
  }
}

function revealControls() {
  controlsVisible.value = true;
  clearControlTimer();

  if (!playing.value || settingsOpen.value) return;

  controlTimer = setTimeout(() => {
    controlsVisible.value = false;
  }, 2600);
}

async function toggleFullscreen() {
  const element = playerRef.value;
  if (!element) return;

  if (!document.fullscreenElement) {
    try {
      await element.requestFullscreen?.();
    } catch {
      audioMessage.value = "当前浏览器不支持全屏，可继续窗口播放";
    }
    return;
  }

  await document.exitFullscreen?.();
}

async function exitFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen?.();
  }
}

function handleFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === playerRef.value;
}

async function saveCurrentSettings() {
  const scene = current.value;

  if (!scene || !props.editable || saving.value) return;

  saving.value = true;

  try {
    const pointId = scene.pointId;

    const result = await updateImmersiveSceneApi(props.travelId, pointId, {
      sortOrder: draft.sortOrder,
      cameraScale: draft.cameraScale,
      moveDuration: draft.moveDuration,
      stayDuration: draft.stayDuration,
      easing: draft.easing,
    });

    if (result.code !== 200) {
      throw new Error(result.message || "保存场景失败");
    }

    await loadScenes(pointId);
    settingsOpen.value = true;
  } catch (err) {
    alert(err instanceof Error ? err.message : "保存场景失败");
  } finally {
    saving.value = false;
  }
}

async function loadScenes(keepPointId: number | null = null) {
  const version = ++loadVersion;

  clearTimer();
  loading.value = true;
  error.value = "";

  try {
    const result = await getImmersiveScenesApi(props.travelId);

    if (!alive || version !== loadVersion) return;

    if (result.code !== 200) {
      throw new Error(result.message || "读取播放场景失败");
    }

    scenes.value = result.data || [];

    let nextIndex = 0;

    if (keepPointId != null) {
      const found = scenes.value.findIndex(
        (item) => item.pointId === keepPointId,
      );
      if (found >= 0) nextIndex = found;
    }

    index.value = nextIndex;
    syncDraft();

    await preloadAround();

    if (phase.value === "playing" && playing.value && scenes.value.length) {
      sceneRunKey.value++;
      remainingMs = sceneDuration.value;
      schedule(remainingMs);
    }
  } catch (err) {
    if (!alive || version !== loadVersion) return;

    scenes.value = [];
    error.value = err instanceof Error ? err.message : "读取播放场景失败";
  } finally {
    if (alive && version === loadVersion) {
      loading.value = false;
    }
  }
}

watch(
  () => props.travelId,
  () => {
    phase.value = "ready";
    playing.value = false;
    index.value = 0;
    releaseImages();
    void loadPreferences();
    void loadScenes();
  },
);

watch(
  () => current.value?.pointId,
  () => {
    syncDraft();
    void preloadAround();
  },
);

watch(settingsOpen, (open) => {
  if (open) revealControls();
});

onMounted(() => {
  document.addEventListener("fullscreenchange", handleFullscreenChange);

  void loadPreferences();
  void loadScenes();
});

onBeforeUnmount(() => {
  enterVersion++;
  audioRef.value?.pause();
  if (musicUrl.value) URL.revokeObjectURL(musicUrl.value);
  alive = false;
  ++loadVersion;

  clearTimer();
  clearControlTimer();
  releaseImages();

  document.removeEventListener("fullscreenchange", handleFullscreenChange);
});
</script>

<style scoped>
.audio-feedback {
  position: absolute;
  z-index: 25;
  top: 14px;
  left: 20px;
  background: #573047b3;
  padding: 8px;
  border-radius: 10px;
  max-width: 85%;
}
.film-options {
  position: relative;
  z-index: 8;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px;
  color: #ffe3ef;
  background: #57304780;
}
.film-options label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.film-options input[type="file"] {
  max-width: 190px;
}
.film-options select {
  border-radius: 8px;
  padding: 5px;
}
.film-options small {
  width: 100%;
}
.transition-slide {
  animation: film-slide var(--scene-move) ease-out !important;
}
.transition-zoom {
  animation: film-zoom var(--scene-move) ease-out !important;
}
@keyframes film-slide {
  from {
    opacity: 0;
    translate: 8% 0;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}
@keyframes film-zoom {
  from {
    opacity: 0;
    scale: 0.85;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .scene-main,
  .scene-copy,
  .scene-background {
    animation: none !important;
  }
}

.immersive-player {
  position: relative;
  min-height: 610px;
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 30px;
  color: #fff;
  outline: none;
  background: radial-gradient(
    circle at 50% 35%,
    #342532 0%,
    #171319 42%,
    #0e0c10 100%
  );
  box-shadow: 0 28px 80px rgba(81, 37, 60, 0.2);
}
.is-fullscreen .cinema-stage {
  height: 100dvh;
  min-height: 100dvh;
}
.is-fullscreen .intro-stage {
  min-height: calc(100dvh - 160px);
  box-sizing: border-box;
}
.is-paused .scene-main {
  animation-play-state: paused !important;
}
.immersive-player.is-fullscreen {
  width: 100vw;
  height: 100vh;
  min-height: 100vh;
  border-radius: 0;
}
.player-state,
.intro-stage {
  min-height: 610px;
  padding: 70px 30px;
  display: grid;
  place-content: center;
  text-align: center;
  position: relative;
  z-index: 5;
}
.player-state {
  color: #f8dce9;
}
.player-state h3 {
  margin: 12px 0 7px;
  font-size: 27px;
}
.player-state p {
  color: #c8abb9;
  line-height: 1.8;
}
.player-state button {
  justify-self: center;
  margin-top: 15px;
  border: 0;
  border-radius: 999px;
  padding: 11px 18px;
  cursor: pointer;
  color: #6f3e58;
  font-weight: 900;
  background: linear-gradient(120deg, #ffd2e4, #ffe9b8);
}
.state-flower {
  font-size: 48px;
  color: #f2a8c7;
}
.intro-stage {
  overflow: hidden;
}
.intro-glow {
  position: absolute;
  inset: 15%;
  z-index: -1;
  border-radius: 50%;
  filter: blur(55px);
  opacity: 0.5;
  background: radial-gradient(
    circle,
    rgba(237, 131, 178, 0.48),
    transparent 66%
  );
}
.intro-eyebrow {
  margin: 0;
  color: #e5a0bf;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.24em;
}
.intro-stage h2 {
  max-width: 780px;
  margin: 18px auto 10px;
  font-size: clamp(36px, 6vw, 74px);
  line-height: 1.04;
  letter-spacing: -0.045em;
}
.intro-subtitle {
  max-width: 660px;
  margin: 0 auto;
  color: #ceb6c2;
  font-size: 14px;
  line-height: 1.9;
}
.intro-meta {
  margin: 26px 0;
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}
.intro-meta span {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 999px;
  color: #dfc8d3;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.06);
}
.start-button {
  justify-self: center;
  min-width: 180px;
  border: 0;
  border-radius: 999px;
  padding: 15px 23px;
  cursor: pointer;
  color: #75455d;
  font-size: 14px;
  font-weight: 900;
  background: linear-gradient(120deg, #ffc7df, #fff0bf);
  box-shadow: 0 14px 42px rgba(235, 128, 173, 0.25);
}
.start-button span {
  margin-right: 9px;
}
.cinema-stage {
  position: relative;
  min-height: 610px;
  overflow: hidden;
  background: #0d0b0e;
}
.scene-background {
  position: absolute;
  inset: -7%;
  background-position: center;
  background-size: cover;
  filter: blur(22px) brightness(0.36) saturate(0.78);
  transform: scale(1.14);
  opacity: 0.92;
  animation: backgroundDrift var(--scene-total, 4700ms) linear both;
}
.scene-background.fallback {
  background:
    radial-gradient(circle at 25% 30%, #56354d, transparent 42%),
    radial-gradient(circle at 76% 65%, #24354f, transparent 38%), #171319;
}
.scene-vignette {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      circle at center,
      transparent 25%,
      rgba(9, 7, 10, 0.25) 60%,
      rgba(9, 7, 10, 0.82) 100%
    ),
    linear-gradient(to top, rgba(9, 7, 10, 0.65), transparent 45%);
}
.scene-grain {
  position: absolute;
  inset: 0;
  opacity: 0.08;
  pointer-events: none;
  background-image:
    radial-gradient(circle at 20% 30%, #fff 0 1px, transparent 1px),
    radial-gradient(circle at 70% 60%, #fff 0 1px, transparent 1px);
  background-size:
    27px 27px,
    33px 33px;
  animation: grainMove 1.4s steps(2) infinite;
}
.scene-main {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 70px 17% 100px;
  z-index: 3;
  pointer-events: none;
}
.photo-frame {
  position: relative;
  max-width: min(70vw, 780px);
  max-height: min(66vh, 520px);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.52);
  border-radius: 8px;
  background: #151217;
  box-shadow:
    0 25px 80px rgba(0, 0, 0, 0.56),
    0 0 0 8px rgba(255, 255, 255, 0.025);
  animation: kenBurns var(--scene-total) var(--scene-easing) both;
}
.photo-frame:before,
.photo-frame:after {
  content: "";
  position: absolute;
  inset: -12px;
  border: 1px solid rgba(255, 209, 229, 0.2);
  z-index: -1;
  transform: rotate(-2.3deg);
}
.photo-frame:after {
  transform: rotate(1.7deg);
}
.photo-frame img {
  display: block;
  width: 100%;
  max-height: min(66vh, 520px);
  object-fit: contain;
  user-select: none;
}
.text-only-scene {
  width: min(70vw, 650px);
  min-height: 310px;
  display: grid;
  place-content: center;
  gap: 13px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  color: #f2d8e5;
  background: rgba(255, 255, 255, 0.055);
  backdrop-filter: blur(10px);
  animation: kenBurns var(--scene-total) var(--scene-easing) both;
}
.text-only-scene span {
  font-size: 46px;
  color: #e89aba;
}
.text-only-scene strong {
  font-size: clamp(23px, 4vw, 42px);
}
.scene-copy {
  position: absolute;
  z-index: 5;
  left: clamp(25px, 5vw, 76px);
  bottom: 82px;
  max-width: min(500px, 58vw);
  pointer-events: none;
  animation: copyReveal var(--scene-move) ease-out both;
}
.scene-counter {
  margin: 0 0 9px;
  color: #e5a1bf;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.22em;
}
.scene-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 9px;
}
.scene-tags span {
  padding: 5px 8px;
  border-radius: 999px;
  color: #ddc1cf;
  font-size: 9px;
  background: rgba(0, 0, 0, 0.26);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.scene-copy h2 {
  margin: 0;
  font-size: clamp(29px, 5vw, 57px);
  line-height: 1.05;
  text-shadow: 0 5px 24px rgba(0, 0, 0, 0.5);
}
.scene-location {
  margin: 9px 0 0;
  color: #f0c2d6;
  font-size: 12px;
}
.scene-copy blockquote {
  margin: 15px 0 0;
  padding-left: 12px;
  border-left: 2px solid #eaa1c2;
  color: #f4dce7;
  font-size: 14px;
}
.scene-story {
  margin: 12px 0 0;
  display: -webkit-box;
  overflow: hidden;
  color: #d2bac6;
  line-height: 1.8;
  font-size: 11px;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
.scene-settings {
  position: absolute;
  z-index: 20;
  top: 25px;
  right: 25px;
  width: min(320px, calc(100% - 50px));
  padding: 17px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 18px;
  color: #7e4c65;
  background: rgba(255, 246, 251, 0.94);
  backdrop-filter: blur(20px);
  box-shadow: 0 22px 65px rgba(0, 0, 0, 0.28);
}
.scene-settings header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.scene-settings header div {
  display: flex;
  flex-direction: column;
}
.scene-settings header small {
  color: #c47ca0;
  font-size: 8px;
  letter-spacing: 0.14em;
}
.scene-settings header button {
  border: 0;
  background: transparent;
  color: #94607a;
  font-size: 22px;
  cursor: pointer;
}
.scene-settings label {
  margin-top: 10px;
  display: grid;
  gap: 6px;
  color: #93657d;
  font-size: 10px;
}
.scene-settings input[type="number"],
.scene-settings select {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 10px;
  border: 1px solid #f0cddd;
  border-radius: 11px;
  outline: none;
  color: #82506a;
  background: #fff;
}
.range-row {
  display: grid;
  grid-template-columns: 1fr 60px;
  gap: 10px;
  align-items: center;
}
.range-row span {
  text-align: right;
  color: #a06c87;
  font-size: 10px;
}
.range-row input {
  width: 100%;
  accent-color: #e480a8;
}
.save-settings {
  width: 100%;
  margin-top: 15px;
  border: 0;
  border-radius: 999px;
  padding: 11px;
  cursor: pointer;
  color: #75465e;
  font-weight: 900;
  background: linear-gradient(120deg, #ffcce1, #ffefbe);
}
.timeline-progress {
  position: absolute;
  z-index: 12;
  left: 0;
  right: 0;
  bottom: 69px;
  height: 2px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
}
.timeline-progress span {
  display: block;
  height: 100%;
  width: 100%;
  transform-origin: left center;
  background: linear-gradient(90deg, #e77da8, #ffebbc);
  animation: progressRun var(--progress-duration) linear forwards;
}
.timeline-progress.paused span {
  animation-play-state: paused;
}
.player-controls {
  position: absolute;
  z-index: 15;
  left: 18px;
  right: 18px;
  bottom: 12px;
  min-height: 48px;
  padding: 5px 9px;
  display: grid;
  grid-template-columns: 1fr minmax(120px, 1.5fr) 1fr;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 17px;
  background: rgba(11, 9, 12, 0.66);
  backdrop-filter: blur(16px);
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.player-controls.hidden {
  opacity: 0;
  transform: translateY(12px);
  pointer-events: none;
}
.control-left,
.control-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.control-right {
  justify-content: flex-end;
}
.player-controls button {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  color: #eee2e8;
  background: rgba(255, 255, 255, 0.07);
}
.player-controls .main-control {
  color: #5f344b;
  font-weight: 900;
  background: linear-gradient(135deg, #ffcbe0, #ffecb9);
}
.control-center {
  min-width: 0;
  display: flex;
  flex-direction: column;
  text-align: center;
}
.control-center strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
.control-center span {
  color: #a9919d;
  font-size: 9px;
}
.ending-card {
  position: absolute;
  z-index: 25;
  inset: 0;
  display: grid;
  place-content: center;
  text-align: center;
  background: radial-gradient(
    circle,
    rgba(87, 50, 70, 0.7),
    rgba(9, 7, 10, 0.97) 68%
  );
}
.ending-card > span {
  color: #e893b8;
  font-size: 52px;
}
.ending-card p {
  margin: 7px 0;
  color: #e0a7bf;
  font-size: 10px;
  letter-spacing: 0.22em;
}
.ending-card h2 {
  margin: 8px 0 23px;
  font-size: clamp(30px, 5vw, 58px);
  line-height: 1.15;
}
.ending-card div {
  display: flex;
  justify-content: center;
  gap: 9px;
  flex-wrap: wrap;
}
.ending-card button {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 12px 17px;
  cursor: pointer;
  color: #f0dce6;
  background: rgba(255, 255, 255, 0.07);
}
.is-paused .scene-main *,
.is-paused .scene-background,
.is-paused .scene-copy,
.is-paused .scene-grain {
  animation-play-state: paused !important;
}
@keyframes kenBurns {
  0% {
    opacity: 0;
    transform: scale(0.94) translateY(12px);
    filter: blur(5px);
  }
  16% {
    opacity: 1;
    filter: blur(0);
  }
  100% {
    opacity: 1;
    transform: scale(var(--scene-scale)) translateY(0);
    filter: blur(0);
  }
}
@keyframes backgroundDrift {
  from {
    transform: scale(1.1) translate3d(-0.5%, -0.5%, 0);
  }
  to {
    transform: scale(1.2) translate3d(0.8%, 0.5%, 0);
  }
}
@keyframes copyReveal {
  from {
    opacity: 0;
    transform: translateY(17px);
    filter: blur(7px);
  }
  55% {
    opacity: 0.2;
  }
  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}
@keyframes progressRun {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
@keyframes grainMove {
  0% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-5px, 4px);
  }
  100% {
    transform: translate(3px, -4px);
  }
}
@media (max-width: 760px) {
  .immersive-player,
  .player-state,
  .intro-stage,
  .cinema-stage {
    min-height: 72vh;
  }
  .scene-main {
    padding: 60px 7% 128px;
  }
  .photo-frame {
    max-width: 88vw;
  }
  .scene-copy {
    left: 20px;
    right: 20px;
    bottom: 105px;
    max-width: none;
  }
  .scene-story {
    display: none;
  }
  .player-controls {
    grid-template-columns: auto 1fr auto;
  }
  .control-center strong {
    max-width: 120px;
    margin: 0 auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .scene-background,
  .photo-frame,
  .text-only-scene,
  .scene-copy,
  .scene-grain,
  .timeline-progress span {
    animation: none !important;
  }
}
</style>
