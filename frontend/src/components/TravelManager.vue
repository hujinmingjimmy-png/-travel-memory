<template>
  <section class="manager">
    <details>
      <summary>✿ 管理这段旅行 · 编辑 / 排序 / 发布</summary>
      <p v-if="message" role="status">{{ message }}</p>
      <form @submit.prevent="save">
        <label
          >标题<input v-model="draft.title" required maxlength="100" /></label
        ><label>副标题<input v-model="draft.subtitle" maxlength="200" /></label
        ><label
          >简介<textarea
            v-model="draft.description"
            maxlength="20000"
          ></textarea></label
        ><label>开始日期<input v-model="draft.startDate" type="date" /></label
        ><label>结束日期<input v-model="draft.endDate" type="date" /></label
        ><label
          >可见性<select v-model="draft.visibility">
            <option value="PRIVATE">私密</option>
            <option value="PUBLIC">公开</option>
          </select></label
        ><button :disabled="busy">保存信息</button>
      </form>
      <div class="actions">
        <button :disabled="busy" @click="publication">
          {{ travel.isPublished === 1 ? "转回草稿" : "发布旅行" }}</button
        ><button :disabled="busy" @click="loadOrder">
          读取照片和记忆点顺序</button
        ><button :disabled="busy" @click="remove">删除旅行</button>
      </div>
      <p>公开且已发布的旅行才会出现在 Discover。</p>
      <div v-if="ordering" class="orders">
        <div>
          <h4>照片顺序</h4>
          <div v-for="(m, i) in media" :key="m.id" class="row">
            <span>{{ m.caption || m.originalName || `照片 ${m.id}` }}</span
            ><button :disabled="busy || i === 0" @click="move(media, i, -1)">
              ↑</button
            ><button
              :disabled="busy || i === media.length - 1"
              @click="move(media, i, 1)"
            >
              ↓
            </button>
          </div>
          <button :disabled="busy" @click="saveOrder(false)">
            保存照片顺序
          </button>
        </div>
        <div>
          <h4>记忆点顺序（同步故事和播放）</h4>
          <div v-for="(p, i) in points" :key="p.id" class="row">
            <span>{{ p.title }}</span
            ><button :disabled="busy || i === 0" @click="move(points, i, -1)">
              ↑</button
            ><button
              :disabled="busy || i === points.length - 1"
              @click="move(points, i, 1)"
            >
              ↓
            </button>
          </div>
          <button :disabled="busy" @click="saveOrder(true)">
            保存记忆点顺序
          </button>
        </div>
      </div>
    </details>
  </section>
</template>
<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { apiRequest } from "@/api/request";
import { publishTravelApi, type TravelProject } from "@/api/travel";
import { getTravelMediaApi, type TravelMedia } from "@/api/media";
import { getImmersiveScenesApi } from "@/api/immersive";
const props = defineProps<{ travel: TravelProject }>(),
  emit = defineEmits<{ updated: [] }>(),
  router = useRouter();
const draft = reactive({
  title: "",
  subtitle: "",
  description: "",
  startDate: "",
  endDate: "",
  visibility: "PRIVATE",
  coverUrl: "",
  backgroundUrl: "",
});
watch(
  () => props.travel,
  (t) => {
    Object.assign(draft, {
      title: t.title,
      subtitle: t.subtitle || "",
      description: t.description || "",
      startDate: t.startDate || "",
      endDate: t.endDate || "",
      visibility: t.visibility,
      coverUrl: t.coverUrl || "",
      backgroundUrl: t.backgroundUrl || "",
    });
  },
  { immediate: true },
);
const busy = ref(false),
  message = ref(""),
  ordering = ref(false),
  media = ref<TravelMedia[]>([]),
  points = ref<{ id: number; title: string }[]>([]);
async function run(fn: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  message.value = "";
  try {
    await fn();
  } catch (e) {
    message.value = e instanceof Error ? e.message : "操作失败";
  } finally {
    busy.value = false;
  }
}
function save() {
  void run(async () => {
    const r = await apiRequest(`/api/travels/${props.travel.id}`, {
      method: "PUT",
      body: JSON.stringify({
        ...draft,
        startDate: draft.startDate || null,
        endDate: draft.endDate || null,
      }),
    });
    if (r.code !== 200) throw new Error(r.message);
    message.value = "已保存";
    emit("updated");
  });
}
function publication() {
  void run(async () => {
    const r =
      props.travel.isPublished === 1
        ? await apiRequest(`/api/travels/${props.travel.id}/draft`, {
            method: "POST",
          })
        : await publishTravelApi(props.travel.id);
    if (r.code !== 200) throw new Error(r.message);
    emit("updated");
    message.value = "发布状态已更新";
  });
}
function remove() {
  if (!window.confirm("确认永久删除这段旅行、照片、记忆点和评论？")) return;
  void run(async () => {
    const r = await apiRequest(`/api/travels/${props.travel.id}`, {
      method: "DELETE",
    });
    if (r.code !== 200) throw new Error(r.message);
    await router.push("/me");
  });
}
function loadOrder() {
  void run(async () => {
    const [m, p] = await Promise.all([
      getTravelMediaApi(props.travel.id),
      getImmersiveScenesApi(props.travel.id),
    ]);
    if (m.code !== 200 || p.code !== 200)
      throw new Error(m.code !== 200 ? m.message : p.message);
    media.value = m.data;
    points.value = p.data.map((x) => ({ id: x.pointId, title: x.title }));
    ordering.value = true;
  });
}
function move<T>(list: T[], i: number, d: number) {
  const a = list[i],
    b = list[i + d];
  if (a === undefined || b === undefined) return;
  list[i] = b;
  list[i + d] = a;
}
function saveOrder(point: boolean) {
  void run(async () => {
    const ids = (point ? points.value : media.value).map((x) => x.id);
    const r = await apiRequest(
      `/api/travels/${props.travel.id}/${point ? "points" : "media"}/order`,
      { method: "PUT", body: JSON.stringify({ ids }) },
    );
    if (r.code !== 200) throw new Error(r.message);
    message.value = "顺序已保存";
    emit("updated");
  });
}
</script>
<style scoped>
.manager {
  margin: 18px 0;
  background: #fff6fa99;
  border: 1px solid #fff;
  border-radius: 22px;
  padding: 20px;
  color: #804b67;
}
summary {
  cursor: pointer;
  font-weight: 700;
}
form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 20px;
}
label {
  display: grid;
  gap: 6px;
}
input,
textarea,
select {
  min-width: 0;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid #edc0d4;
  background: #fff9fc;
  color: #74425b;
}
button {
  padding: 9px 14px;
  border: 0;
  border-radius: 12px;
  background: #ffd7e6;
  color: #804b67;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}
.orders {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.row {
  display: flex;
  gap: 8px;
  margin: 8px 0;
}
.row span {
  flex: 1;
  overflow-wrap: anywhere;
}
@media (max-width: 600px) {
  form,
  .orders {
    grid-template-columns: 1fr;
  }
}
</style>
