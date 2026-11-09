<template>
  <section class="collab-inbox glass" aria-label="旅行共创邀请">
    <div class="heading"><div><small>TRAVEL INVITATIONS</small><h2>同行邀请 · 收件箱</h2></div><button type="button" @click="load">↻ 刷新</button></div>
    <p class="hint">邀请直接发送到此账号的站内收件箱，只有你接受后旅程才会出现在主页。</p>
    <p v-if="notice" class="feedback" role="status">{{ notice }}</p>
    <p v-if="loading">正在读取邀请……</p>
    <p v-else-if="!inbox.length" class="empty">暂时没有同行邀请 ♡</p>
    <div v-for="item in inbox" :key="item.id" class="invite-row">
      <div><strong>{{ item.travelTitle }}</strong><p>来自 @{{ item.inviterNickname || item.inviterUsername }} 的旅行共创邀请</p></div>
      <div class="buttons" v-if="item.status === 'PENDING'"><button :disabled="busyId===item.id" @click="decide(item,'ACCEPTED')">接受同行</button><button :disabled="busyId===item.id" class="soft" @click="decide(item,'REJECTED')">婉拒</button></div>
      <span v-else class="state">{{ statusLabel(item.status) }}</span>
    </div>
  </section>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getCollabInboxApi, decideCollabInviteApi, type CollabInvite } from '@/api/collab'
const emit = defineEmits<{ changed: [] }>()
const inbox = ref<CollabInvite[]>([]), loading = ref(false), busyId = ref<number | null>(null), notice = ref('')
function statusLabel(s:string){return ({ ACCEPTED:'已加入', REJECTED:'已拒绝', CANCELED:'已取消', PENDING:'待确认' } as Record<string,string>)[s] || s}
async function load(){loading.value=true;try{const r=await getCollabInboxApi();if(r.code!==200)throw new Error(r.message);inbox.value=r.data||[]}catch(e){notice.value=e instanceof Error?e.message:'读取邀请失败'}finally{loading.value=false}}
async function decide(item:CollabInvite,decision:'ACCEPTED'|'REJECTED'){
 if(busyId.value)return;busyId.value=item.id;notice.value=''
 try{const r=await decideCollabInviteApi(item.id,decision);if(r.code!==200)throw new Error(r.message);notice.value=decision==='ACCEPTED'?'已加入这段旅程，将同步显示在你的主页':'已拒绝邀请';await load();emit('changed')}
 catch(e){notice.value=e instanceof Error?e.message:'操作失败'}finally{busyId.value=null}
}
onMounted(()=>void load())
</script>
<style scoped>
.collab-inbox{padding:22px;margin:22px 0;border-radius:25px;color:#7d4b67}.heading{display:flex;align-items:center;justify-content:space-between;gap:15px}.heading small{color:#bc779c;letter-spacing:.13em;font-size:10px}.heading h2{margin:5px 0;font-size:21px}.heading button,.buttons button{cursor:pointer;border:0;border-radius:12px;padding:10px 15px;background:#ffd5e3;color:#825273}.hint,.invite-row p,.empty{font-size:12px;color:#9c748c}.feedback{color:#b34b80;font-size:12px}.invite-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #f4d5e3;padding:13px 0}.invite-row p{margin:5px 0 0}.buttons{display:flex;gap:8px}.buttons .soft{background:#f8eef4}.state{white-space:nowrap;color:#b46c91;font-size:12px}@media(max-width:700px){.invite-row{flex-direction:column;align-items:flex-start}}
</style>
