<template>
  <Teleport to="body">
    <div class="invite-shade" role="presentation" @click.self="$emit('close')">
      <section class="invite-dialog" role="dialog" aria-modal="true" aria-label="邀请同行者">
        <header><div><small>JOURNEY COLLABORATION</small><h2>邀请同行者</h2><p>{{ travel.title }}</p></div><button class="close" type="button" @click="$emit('close')">×</button></header>
        <p class="info">请输入对方的登录用户名。邀请会进入对方的站内收件箱；必须接受后才成为共创成员。</p>
        <form @submit.prevent="send" class="invite-form"><input v-model.trim="username" maxlength="50" placeholder="同行者的用户名" aria-label="同行者用户名" required/><button :disabled="busy || username.length < 2" type="submit">{{ busy ? '发送中…' : '发送邀请' }}</button></form>
        <!-- TRAVEL_SOCIAL_V12: choose one or more friends -->
        <FriendPicker :members="travel.members" :sent="sent" :disabled="busy" @picked="invitePicked" />
        <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>
        <h3>当前成员</h3>
        <div v-for="member in travel.members" :key="member.userId" class="person-row">
          <UserAvatar :user-id="Number(member.userId)" :avatar="member.avatar" :name="member.nickname || member.username" :size="34" />
          <span>{{ member.nickname || member.username }} <small>({{ member.role === 'OWNER' ? '创建者' : '同行者' }})</small></span>
          <button v-if="member.role !== 'OWNER'" type="button" :disabled="busy" class="plain" @click="removeMember(member.userId)">移出</button>
        </div>
        <h3>邀请记录</h3>
        <p v-if="!sent.length" class="info">暂无邀请记录</p>
        <div v-for="item in sent" :key="item.id" class="person-row"><UserAvatar :user-id="Number(item.userId)" :avatar="item.avatar" :name="item.nickname || item.username" :size="28"/><span>{{ item.nickname || item.username }} · {{ statusName(item.status) }}</span><button v-if="item.status === 'PENDING'" class="plain" :disabled="busy" @click="cancel(item.id)">撤回</button></div>
      </section>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import UserAvatar from './UserAvatar.vue'
import FriendPicker from './FriendPicker.vue'
import { getSentInvitesApi, sendCollabInviteApi, cancelCollabInviteApi, removeCollabMemberApi, type CollabTravelCard, type SentInvite } from '@/api/collab'
const props=defineProps<{ travel: CollabTravelCard }>()
const emit=defineEmits<{ close: []; changed: [] }>()
const username=ref(''),sent=ref<SentInvite[]>([]),busy=ref(false),feedback=ref('')
function statusName(s:string){return ({PENDING:'待确认',ACCEPTED:'已加入',REJECTED:'已拒绝',CANCELED:'已撤回'} as Record<string,string>)[s] || s}
async function load(){try{const r=await getSentInvitesApi(props.travel.id);if(r.code!==200)throw new Error(r.message);sent.value=r.data||[]}catch(e){feedback.value=e instanceof Error?e.message:'读取失败'}}
async function send(){busy.value=true;feedback.value='';try{const r=await sendCollabInviteApi(props.travel.id,username.value);if(r.code!==200)throw new Error(r.message);feedback.value='邀请已发送，对方可在“同行邀请”中处理';username.value='';await load()}catch(e){feedback.value=e instanceof Error?e.message:'邀请失败'}finally{busy.value=false}}
async function cancel(id:number){if(!confirm('撤回这条邀请？'))return;busy.value=true;try{const r=await cancelCollabInviteApi(id);if(r.code!==200)throw new Error(r.message);await load()}catch(e){feedback.value=e instanceof Error?e.message:'撤回失败'}finally{busy.value=false}}
async function removeMember(userId:number){if(!confirm('移出后对方将不再看到这段共创旅程，确定吗？'))return;busy.value=true;try{const r=await removeCollabMemberApi(props.travel.id,userId);if(r.code!==200)throw new Error(r.message);emit('changed');feedback.value='成员已移出'}catch(e){feedback.value=e instanceof Error?e.message:'移出失败'}finally{busy.value=false}}
async function invitePicked(names:string[]){
  if(busy.value||!names.length)return
  busy.value=true;feedback.value=''
  let count=0;const failures:string[]=[]
  try {for(const name of names){try{const r=await sendCollabInviteApi(props.travel.id,name);if(r.code!==200)throw new Error(r.message);count++}catch(e){failures.push(`${name}: ${e instanceof Error?e.message:'失败'}`)}}await load();feedback.value=`已发送 ${count} 份邀请。${failures.join('; ')}`}
  finally{busy.value=false}
}
onMounted(()=>void load())
</script>
<style scoped>
.invite-shade{position:fixed;inset:0;z-index:100100;display:grid;place-items:center;padding:16px;background:rgba(72,38,62,.38);backdrop-filter:blur(8px)}.invite-dialog{box-sizing:border-box;width:min(510px,100%);max-height:85vh;overflow-y:auto;padding:25px;border-radius:26px;background:#fff9fc;color:#7f4b68;box-shadow:0 22px 70px #723b6670}.invite-dialog header{display:flex;justify-content:space-between}.invite-dialog h2{margin:7px 0;font-size:24px}.invite-dialog h3{font-size:14px;margin:22px 0 12px}.invite-dialog small{font-size:10px;color:#b17798}.invite-dialog header p,.info{font-size:12px;color:#ae7d99}.close,.plain{background:none;border:0;cursor:pointer;color:#a45f84}.close{font-size:24px}.invite-form{display:flex;gap:9px;margin:17px 0}.invite-form input{flex:1;min-width:0;padding:12px;border:1px solid #e8c1d4;border-radius:12px;background:white}.invite-form button{padding:12px;border:0;border-radius:12px;background:#f8bfdb;color:#74425b;cursor:pointer}.invite-form button:disabled{opacity:.5}.feedback{font-size:12px;color:#b05481}.person-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f4e0e9;font-size:12px}.person-row>span:not(.user-avatar){flex:1}.person-row>:deep(.user-avatar){flex:0 0 40px!important;width:40px!important;height:40px!important;aspect-ratio:1/1}.person-row>:deep(.user-avatar img){object-fit:cover;aspect-ratio:1}/* TRAVEL_SOCIAL_V12 */
</style>
