<template>
  <section class="social-panel">
    <header>
      <h3>♡ 旅行的回声</h3>
      <button :disabled="busy || !state" @click="act('like')">
        {{ state?.liked ? "♥ 取消喜欢" : "♡ 喜欢" }} ·
        {{ state?.likeCount || 0 }}</button
      ><button v-if="state && !owner" :disabled="busy" @click="act('follow')">
        {{ state.following ? "取消关注" : "＋ 关注作者" }}
      </button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <form @submit.prevent="send">
      <textarea
        v-model="text"
        maxlength="1000"
        placeholder="留下你的旅行回声…"
        required
      ></textarea
      ><button :disabled="busy || !text.trim()">发送评论</button>
    </form>
    <article v-for="c in items" :key="c.id">
      <b>{{ c.author }}</b
      ><small>{{ c.createdAt }}</small>
      <p>{{ c.content }}</p>
      <button
        v-if="owner || c.userId === userId"
        :disabled="busy"
        @click="remove(c.id)"
      >
        删除评论
      </button>
    </article>
    <button
      v-if="more"
      :disabled="busy"
      @click="run(() => loadComments(false))"
    >
      更多评论
    </button>
  </section>
</template>
<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
  socialState,
  likeTravel,
  followAuthor,
  comments,
  postComment,
  deleteComment,
  type SocialState,
  type TravelComment,
} from "@/api/social";
const props = defineProps<{ travelId: number; owner: boolean }>();
const state = ref<SocialState | null>(null),
  items = ref<TravelComment[]>([]),
  text = ref(""),
  error = ref(""),
  busy = ref(false),
  more = ref(false);
let page = 0;
let userId = 0;
try {
  userId = Number(JSON.parse(localStorage.getItem("travel_user") || "{}").id);
} catch {}
async function loadComments(reset = true) {
  const p = reset ? 1 : page + 1;
  const r = await comments(props.travelId, p);
  if (r.code !== 200) throw new Error(r.message);
  items.value = reset ? r.data : [...items.value, ...r.data];
  page = p;
  more.value = r.data.length === 20;
}
async function run(fn: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "操作失败";
  } finally {
    busy.value = false;
  }
}
function act(kind: string) {
  void run(async () => {
    if (!state.value) return;
    if (kind === "like") {
      const r = await likeTravel(props.travelId, !state.value.liked);
      if (r.code !== 200) throw new Error(r.message);
      state.value = r.data;
    } else {
      const r = await followAuthor(
        state.value.authorId,
        !state.value.following,
      );
      if (r.code !== 200) throw new Error(r.message);
      state.value.following = r.data;
    }
  });
}
function send() {
  void run(async () => {
    const r = await postComment(props.travelId, text.value);
    if (r.code !== 200) throw new Error(r.message);
    text.value = "";
    await loadComments();
  });
}
function remove(id: number) {
  void run(async () => {
    const r = await deleteComment(props.travelId, id);
    if (r.code !== 200) throw new Error(r.message);
    await loadComments();
  });
}
onMounted(() =>
  run(async () => {
    const r = await socialState(props.travelId);
    if (r.code !== 200) throw new Error(r.message);
    state.value = r.data;
    await loadComments();
  }),
);
</script>
<style scoped>
.social-panel {
  margin: 20px 0;
  padding: 22px;
  border-radius: 24px;
  color: #844768;
  background: #fff5fa99;
  border: 1px solid #ffffffaa;
  backdrop-filter: blur(18px);
}
header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
h3 {
  margin-right: auto;
}
button {
  border: 0;
  padding: 9px 14px;
  border-radius: 14px;
  background: #ffd7e6;
  color: #804b67;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
}
form {
  display: flex;
  gap: 10px;
  align-items: center;
}
textarea {
  flex: 1;
  min-width: 0;
  border: 1px solid #edc0d4;
  border-radius: 14px;
  padding: 12px;
  resize: vertical;
  background: #fff9fc;
  color: #74425b;
}
article {
  border-top: 1px solid #efcbdc;
  padding: 14px 0;
}
article p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
small {
  margin-left: 15px;
  opacity: 0.65;
}
@media (max-width: 600px) {
  form {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
