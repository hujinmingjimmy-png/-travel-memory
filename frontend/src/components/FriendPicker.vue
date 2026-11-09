<template>
  <div class="friend-picker">
    <button type="button" class="choose" @click="open=!open">♡ 选择好友</button>
    <div v-if="open" class="dropdown">
      <header>从好友中邀请同行者 <button type="button" @click="open=false">×</button></header>
      <input v-model="keyword" placeholder="搜索好友昵称或用户名" />
      <p v-if="loading">加载好友中…</p>
      <label v-for="f in visible" :key="f.userId" class="item">
        <input type="checkbox" :value="f.username" v-model="chosen" :disabled="status(f)!==''" />
        <UserAvatar :user-id="f.userId" :avatar="f.avatar" :name="f.nickname||f.username" :size="32"/>
        <span>{{f.nickname||f.username}}<small>@{{f.username}}</small></span>
        <em v-if="status(f)">{{status(f)}}</em>
      </label>
      <p v-if="!visible.length" class="empty">没有符合条件的好友</p>
      <button type="button" class="confirm" :disabled="!chosen.length||disabled" @click="send">邀请所选 {{chosen.length}} 位好友</button>
    </div>
  </div>
</template>
<script setup lang="ts">
import {computed,onMounted,ref} from 'vue'
import UserAvatar from './UserAvatar.vue'
import {hubFriends,type HubUser} from '@/api/socialHub'
import type {CollabMember,SentInvite} from '@/api/collab'
const props=defineProps<{members:CollabMember[];sent:SentInvite[];disabled?:boolean}>()
const emit=defineEmits<{picked:[usernames:string[]]}>()
const open=ref(false),loading=ref(false),friends=ref<HubUser[]>([]),keyword=ref(''),chosen=ref<string[]>([])
const visible=computed(()=>friends.value.filter(f=>(f.nickname||f.username).toLowerCase().includes(keyword.value.toLowerCase())))
function status(f:HubUser){if(props.members.some(m=>m.userId===f.userId))return '已加入';if(props.sent.some(s=>s.userId===f.userId&&s.status==='PENDING'))return '待接受';return ''}
function send(){if(!chosen.value.length)return;emit('picked',chosen.value);chosen.value=[];open.value=false}
onMounted(async()=>{loading.value=true;try{const r=await hubFriends();if(r.code===200)friends.value=r.data||[]}catch{}finally{loading.value=false}})
</script>
<style scoped>
.friend-picker{position:relative}.choose,.confirm{border:0;border-radius:12px;padding:11px;background:#ffe2ef;color:#955273;cursor:pointer}.dropdown{position:absolute;z-index:100;right:0;top:110%;width:min(350px,80vw);padding:14px;border:1px solid #f1d6e2;border-radius:18px;background:#fffafd;box-shadow:0 12px 28px #af729d45}.dropdown header{display:flex;justify-content:space-between;font-size:13px;font-weight:700}.dropdown header button{border:0;background:transparent;font-size:19px}.dropdown>input{width:100%;box-sizing:border-box;border:1px solid #edd7e1;padding:9px;border-radius:9px;margin:12px 0}.item{display:flex;gap:9px;align-items:center;border-bottom:1px solid #f5e2ea;padding:8px 0;font-size:12px}.item input{flex:0 0 16px}.item>span:nth-of-type(2){flex:1}.item small{display:block;color:#b794a4}.item em{font-size:10px;font-style:normal;color:#b77f98}.confirm{margin-top:12px;width:100%}.confirm:disabled{opacity:.5}.empty{font-size:12px;color:#b794a4}
</style>
