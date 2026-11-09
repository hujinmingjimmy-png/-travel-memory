<template>
  <main class="collab-preview">
    <header><button type="button" @click="router.push('/me')">← 返回我的旅程</button><strong>Travel Memory · 共创旅程</strong></header>
    <section v-if="loading" class="paper">正在读取旅程……</section>
    <section v-else-if="error" class="paper"><h2>无法查看旅程</h2><p>{{ error }}</p></section>
    <section v-else-if="travel" class="paper">
      <div class="cover" :style="coverStyle"><span class="cover-label">共同旅行记忆</span><JourneyMemberStack :members="travel.members" /></div>
      <div class="content"><p class="date">{{ travel.startDate || '出发日期待定' }} — {{ travel.endDate || '归程待定' }}</p>
        <div class="headline"><h1>{{ travel.title }}</h1></div>
        <h3>{{ travel.subtitle }}</h3><p>{{ travel.description || '还没有填写旅行简介。' }}</p>
        <div class="members"><span v-for="member in travel.members" :key="member.userId" class="member"><UserAvatar :user-id="member.userId" :avatar="member.avatar" :name="member.nickname || member.username" :size="32" />{{ member.nickname || member.username }}</span></div>
        <p class="scope">你已加入这段旅程。当前提供成员可见的旅程概要；照片、地图和编辑权限仍遵循原项目的独立鉴权，不会因加入同行而自动开放。</p>
        <!-- TRAVEL_COLLAB_V14_WORKSPACE -->
        <TravelCollabWorkspace :travel-id="id" />
        <button class="leave" type="button" @click="leave">退出共同旅程</button>
      </div>
    </section>
  </main>
</template>
<script setup lang="ts">
import TravelCollabWorkspace from "@/components/TravelCollabWorkspace.vue";
import { computed,ref,watch,onBeforeUnmount } from 'vue'
import { useRoute,useRouter } from 'vue-router'
import JourneyMemberStack from './JourneyMemberStack.vue'
import UserAvatar from './UserAvatar.vue'
import { getCollabPreviewApi,leaveCollabTravelApi,type CollabTravelCard } from '@/api/collab'
const route=useRoute(),router=useRouter(),travel=ref<CollabTravelCard|null>(null),error=ref(''),loading=ref(true)
const id=computed(()=>Number(route.params.id))
let loadVersion=0
const coverStyle=computed(()=>travel.value?.coverUrl?{backgroundImage:`url("${encodeURI(travel.value.coverUrl).replace(/"/g,'%22')}")`}:{})
async function load(){const trip=id.value,version=++loadVersion;loading.value=true;error.value='';travel.value=null;try{if(!Number.isSafeInteger(trip)||trip<1)throw new Error('旅程编号无效');const r=await getCollabPreviewApi(trip);if(version!==loadVersion)return;if(r.code!==200)throw new Error(r.message);travel.value=r.data}catch(e){if(version===loadVersion)error.value=e instanceof Error?e.message:'读取失败'}finally{if(version===loadVersion)loading.value=false}}
async function leave(){if(!confirm('退出后此旅行将从你的主页移除，是否继续？'))return;try{const r=await leaveCollabTravelApi(id.value);if(r.code!==200)throw new Error(r.message);await router.push('/me')}catch(e){error.value=e instanceof Error?e.message:'退出失败'}}
watch(id,()=>void load(),{immediate:true})
onBeforeUnmount(()=>{loadVersion++})
</script>
<style scoped>
.collab-preview{min-height:100vh;background:linear-gradient(140deg,#fff8fb,#fce4ee 65%,#fff1dd);padding:28px 20px;color:#7b4d67}.collab-preview header{max-width:960px;margin:auto;display:flex;justify-content:space-between;align-items:center}.collab-preview button{border:0;border-radius:12px;padding:10px 14px;background:#ffe1ef;color:#85516d;cursor:pointer}.paper{max-width:900px;margin:40px auto;background:#fffafce8;border:1px solid white;border-radius:24px;overflow:hidden;box-shadow:0 15px 45px #a8739422}.cover{min-height:250px;background:linear-gradient(120deg,#e5b5d0,#ffd7e5);background-size:cover;background-position:center;position:relative}.cover-label{position:absolute;top:20px;left:22px;background:#fff9;padding:8px 15px;border-radius:20px}.content{padding:30px}.headline{display:flex;align-items:center;gap:12px}.headline h1{font-size:30px;margin:5px 0}.date{font-size:12px;color:#bb7a9a}.content h3{font-size:17px}.content p{line-height:1.8}.members{display:flex;flex-wrap:wrap;gap:13px;margin:20px 0}.member{display:flex;align-items:center;gap:6px;font-size:12px}.scope{color:#a27a90;font-size:12px;border-top:1px solid #f2dbe6;padding-top:13px}.leave{margin:20px 0;background:#f6d5e4!important}
</style>
