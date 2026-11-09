<template>
  <article class="travel-card glass" :class="{featured}">
    <button type="button" class="image-button" :aria-label="`查看 ${travel.title}`" @click="$emit('open',travel.id)">
      <div class="travel-image">
        <JourneyCover :travel-id="travel.id" :media-id="travel.coverMediaId" :direct-url="travel.coverUrl" album-fallback />
        <span class="image-overlay" aria-hidden="true"></span>
        <span class="public-pill tm-kicker">{{ featured ? '本页选读' : '公开旅行' }}</span>
        <span class="image-enter" aria-hidden="true">↗</span>
      </div>
    </button>
    <div class="card-body">
      <div class="card-meta">
        <button type="button" class="author-button" @click="$emit('author',travel.authorId)"><UserAvatar :user-id="travel.authorId" :avatar="travel.authorAvatar" :name="travel.author||'旅行者'" :size="32"/><span>{{ travel.author||'旅行者' }}</span></button>
        <span>{{ displayDate }}</span>
      </div>
      <button type="button" class="title-button" @click="$emit('open',travel.id)"><h3>{{ travel.title }}</h3></button>
      <p class="subtitle">{{ travel.subtitle||travel.description||'一段等待你打开的旅行记忆。' }}</p>
      <div class="social-actions">
        <button type="button" class="like-button" :class="{active:liked}" :disabled="busyLike" :aria-pressed="liked" @click="toggleLike">{{ liked?'♥ 已喜欢':'♡ 喜欢' }} <span>{{ likeCount }}</span></button>
        <button v-if="!isOwnAuthor" type="button" class="follow-button" :class="{active:following}" :disabled="busyFollow" :aria-pressed="following" @click="toggleFollow">{{ following?'✓ 已关注':'＋ 关注' }}</button>
      </div>
      <p v-if="error" class="action-error">{{ error }}</p>
      <div class="card-bottom"><span><i>◉</i> {{ travel.viewCount||0 }} 浏览</span><button type="button" class="journey-link" @click="$emit('open',travel.id)">查看旅程 <span>↗</span></button></div>
    </div>
  </article>
</template>
<script setup lang="ts">
import JourneyCover from '@/components/JourneyCover.vue'
import {computed,ref,watch} from 'vue';import UserAvatar from '@/components/UserAvatar.vue';import {followAuthor,likeTravel} from '@/api/social';import type {DiscoverTravel} from '@/api/discover'
const props=defineProps<{travel:DiscoverTravel;featured?:boolean}>();const emit=defineEmits<{(e:'open',id:number):void;(e:'author',id:number):void;(e:'liked',p:{id:number;liked:boolean;likeCount:number}):void;(e:'followed',p:{authorId:number;following:boolean}):void}>();
const liked=ref(props.travel.liked),following=ref(props.travel.following),likeCount=ref(Number(props.travel.likeCount||0)),busyLike=ref(false),busyFollow=ref(false),error=ref('');const currentUserId=(()=>{try{return Number(JSON.parse(localStorage.getItem('travel_user')||'{}').id||0)}catch{return 0}})();const isOwnAuthor=computed(()=>currentUserId>0&&currentUserId===Number(props.travel.authorId));const displayDate=computed(()=>((props.travel.startDate||props.travel.createdAt||'').slice(0,10).replace(/-/g,'.')||'旅途未完待续'));
watch(()=>props.travel.liked,v=>liked.value=Boolean(v));watch(()=>props.travel.following,v=>following.value=Boolean(v));watch(()=>props.travel.likeCount,v=>likeCount.value=Number(v||0));
async function toggleLike(){if(busyLike.value)return;busyLike.value=true;error.value='';try{const r=await likeTravel(props.travel.id,!liked.value);if(r.code!==200)throw new Error(r.message||'点赞失败');liked.value=r.data.liked;likeCount.value=Number(r.data.likeCount||0);emit('liked',{id:props.travel.id,liked:liked.value,likeCount:likeCount.value})}catch(e){error.value=e instanceof Error?e.message:'点赞失败'}finally{busyLike.value=false}}
async function toggleFollow(){if(busyFollow.value||isOwnAuthor.value)return;busyFollow.value=true;error.value='';try{const r=await followAuthor(props.travel.authorId,!following.value);if(r.code!==200)throw new Error(r.message||'关注失败');following.value=Boolean(r.data);emit('followed',{authorId:props.travel.authorId,following:following.value})}catch(e){error.value=e instanceof Error?e.message:'关注失败'}finally{busyFollow.value=false}}
</script>
<style scoped>
.travel-card{min-width:0;display:flex;flex-direction:column;background:var(--tm-sheet);border:1px solid var(--tm-line);border-radius:5px;box-shadow:var(--tm-lift);transition:transform .22s ease}
.travel-card:hover{transform:translateY(-3px)}
.travel-card.featured{grid-column:span 2;display:grid;grid-template-columns:minmax(0,1.42fr) minmax(0,1fr)}
.image-button{width:100%;min-width:0;display:block;padding:0;border:0;cursor:pointer;background:none}
.travel-image{position:relative;aspect-ratio:16 / 10;overflow:hidden;border-radius:4px 4px 0 0}
.featured .travel-image{height:100%;min-height:265px;border-radius:4px 0 0 4px}
.image-overlay{position:absolute;inset:0;background:linear-gradient(0deg,#111a20a0,transparent 45%)}
.public-pill,.image-enter{position:absolute;border-radius:3px;background:var(--tm-sheet);color:var(--tm-ink);padding:6px 10px}
.public-pill{top:12px;left:12px;font-size:.65rem}
.image-enter{bottom:12px;right:12px;font-size:1.1rem}
.card-body{flex:1;min-width:0;display:flex;flex-direction:column;padding:clamp(13px,2.4vw,28px);background:linear-gradient(110deg,#fffdf5 25%,#fffdf5bd),var(--tm-street) center / cover}
.card-meta,.card-bottom{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;color:var(--tm-muted);font:.75rem/1.4 var(--tm-index)}
.author-button,.title-button,.journey-link{min-width:0;padding:0;border:0;cursor:pointer;background:none;color:var(--tm-accent);text-align:left}
.author-button{display:inline-flex;align-items:center;gap:8px;max-width:100%}
.author-button>span{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.title-button{margin-top:10px;color:var(--tm-ink)}
.title-button h3{margin:0;font:700 clamp(1.35rem,2.8vw,2.2rem)/1.16 var(--tm-display);overflow-wrap:anywhere}
.subtitle{margin:10px 0;color:var(--tm-muted);font-size:.86rem;line-height:1.7;display:-webkit-box;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.social-actions{margin:5px 0 13px;display:flex;flex-wrap:wrap;gap:7px}
.like-button,.follow-button{min-height:36px;padding:6px 9px;border:1px solid var(--tm-line);border-radius:4px;cursor:pointer;color:var(--tm-ink);background:var(--tm-sheet);font-size:.75rem}
.like-button.active,.follow-button.active{background:#dceadf;border-color:#839f8f;color:#244735}
.like-button:disabled,.follow-button:disabled{opacity:.65;cursor:wait}
.action-error{margin:0 0 10px;color:#8e3033;font-size:.77rem}
.card-bottom{margin-top:auto;border-top:1px solid var(--tm-line);padding-top:10px}
.journey-link{min-height:32px;font-weight:700}
@media(max-width:580px){.travel-card.featured{grid-column:auto;display:flex}.featured .travel-image{min-height:0;height:auto;border-radius:4px 4px 0 0}}
@media(prefers-reduced-motion:reduce){.travel-card,.travel-card:hover{transition:none;transform:none}}
</style>
