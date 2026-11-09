<template><div class="group-invites"><h3>群聊邀请</h3><p v-if="error" role="alert">{{error}}</p><p v-if="!rows.length" class="empty">暂无待处理的群聊邀请</p><article v-for="r in rows" :key="`${r.travelId}:${r.inviteVersion}`"><div><strong>{{r.travelTitle}}</strong><small>{{r.nickname||r.username}} 邀请你加入同行群聊</small></div><button :disabled="busy" @click="decide(r,true)">接受并进入</button><button class="secondary" :disabled="busy" @click="decide(r,false)">拒绝</button></article></div></template>
<script setup lang="ts">
import {onMounted,ref,watch} from 'vue'
import {useRouter} from 'vue-router'
import {groupInvitations,groupDecision,type GroupInvitation} from '@/api/socialHub'
const props=defineProps<{refreshKey?:number}>(),emit=defineEmits<{changed:[]}>(),router=useRouter()
const rows=ref<GroupInvitation[]>([]),error=ref(''),busy=ref(false)
async function load(){try{const r=await groupInvitations();if(r.code!==200)throw new Error(r.message);rows.value=r.data;error.value=''}catch(e){error.value=e instanceof Error?e.message:'读取群聊邀请失败'}}
async function decide(row:GroupInvitation,accept:boolean){if(busy.value)return;busy.value=true;try{const r=await groupDecision(row.travelId,row.inviteVersion,accept);if(r.code!==200)throw new Error(r.message);await load();emit('changed');if(accept)await router.push({path:'/me',query:{section:'messages',type:'travel',travelId:String(row.travelId)}})}catch(e){error.value=e instanceof Error?e.message:'处理失败';await load()}finally{busy.value=false}}
onMounted(load);watch(()=>props.refreshKey,()=>void load())
</script>
<style scoped>
.group-invites{border-top:1px solid #f0dae6;margin-top:22px;padding-top:4px;color:#88536e}.group-invites h3{font-size:16px}.group-invites article{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:15px 0;border-bottom:1px solid #f3dfe9}.group-invites article>div{flex:1;min-width:140px}.group-invites small{display:block;color:#ac8599;margin-top:5px;font-size:12px}.group-invites button{border:0;background:#f6cee0;border-radius:12px;color:#89516c;padding:10px 14px;cursor:pointer}.group-invites button:disabled{opacity:.5}.group-invites .secondary{background:#fff0f6}.empty{font-size:13px;color:#b28b9f}
</style>
