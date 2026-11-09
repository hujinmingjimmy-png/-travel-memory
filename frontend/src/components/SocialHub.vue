<template>
  <div class="hub-page" :class="{'hub-inline':embedded}">
    <aside v-if="!embedded" class="hub-side">
      <button class="back" @click="router.push('/me')">← 返回我的旅行空间</button>
      <div class="head"><span>✿ Travel Memory</span><h1>好友与消息</h1><p>和同行的人，把故事聊成回忆。</p></div>
      <nav aria-label="社交导航">
        <button :class="{on:tab==='friends'}" @click="setTab('friends')">♡ 我的好友</button>
        <button :class="{on:tab==='messages'}" @click="setTab('messages')">✉ 消息中心 <b v-if="noticeTotal">{{noticeTotal}}</b></button>
        <button :class="{on:tab==='messages'&&messageGroup==='private'}" @click="openPrivate">☏ 私信 <b v-if="counts.messages">{{counts.messages}}</b></button>
      </nav>
      <p class="hint">私信仅对已互相确认的好友开放，旅行群聊需单独接受邀请。新消息由 WebSocket 提醒，连接中断时自动补拉。</p>
    </aside>
    <section class="hub-main">
      <div v-if="notice" class="alert" role="status">{{notice}} <button @click="notice=''">×</button></div>
      <section v-if="tab==='friends'" class="panel">
        <header class="friends-head"><div><small>FRIENDS</small><h2>我的好友</h2></div><div class="friends-head-actions"><button class="primary" type="button" @click="openSearch">＋ 添加好友</button><button type="button" @click="reload">↻ 刷新</button></div></header>
        <form v-if="searchOpen" ref="searchForm" class="search" role="search" @submit.prevent="search"><input ref="searchInput" v-model.trim="query" placeholder="搜索用户名或昵称" maxlength="40" aria-label="搜索用户名或昵称"><button class="primary" type="submit" :disabled="searchBusy || query.trim().length<1">{{searchBusy?'搜索中…':'搜索'}}</button></form>
        <p v-if="searchOpen && searchError" role="alert" class="empty">{{searchError}} <button type="button" @click="search">重试</button></p>
        <p v-if="searchOpen && searched && !searchBusy && !searchError && !results.length" class="empty">没有找到匹配的用户，请核对用户名或昵称。</p>
        <div v-if="searchOpen && results.length" class="search-results">
          <h3>搜索结果</h3>
          <div class="person" v-for="u in results" :key="u.userId"><UserAvatar :user-id="u.userId" :avatar="u.avatar" :name="u.nickname||u.username" :size="42"/><span>{{u.nickname||u.username}}<small>@{{u.username}}</small></span><span v-if="u.userId===myId" class="dim">这是你自己</span><span v-else-if="Number(u.isFriend)" class="dim">已是好友</span><button v-else-if="pendingIncoming(u)" type="button" @click="openIncomingRequests">处理对方申请</button><span v-else-if="pendingOutgoing(u) || askingUserId===u.userId" class="dim">{{askingUserId===u.userId?'发送中…':'申请已发送'}}</span><button v-else type="button" :disabled="askingUserId!==null" @click="ask(u)">添加好友</button></div>
        </div>
        <h3>关注我的 · {{followers.length}}</h3>
        <p class="empty">相互关注会自动成为好友；尚未互关的用户也会在这里显示。</p>
        <div class="person" v-for="u in followers" :key="'follower'+u.userId"><UserAvatar :user-id="u.userId" :avatar="u.avatar" :name="u.nickname||u.username" :size="38"/><span>{{u.nickname||u.username}}<small>@{{u.username}}</small></span><span v-if="Number(u.isFriend)" class="dim">已互关 · 好友</span><button v-else @click="followBack(u)">关注回去</button></div>
        <h3>我关注的 · {{following.length}}</h3>
        <div class="person" v-for="u in following" :key="'following'+u.userId"><UserAvatar :user-id="u.userId" :avatar="u.avatar" :name="u.nickname||u.username" :size="38"/><span>{{u.nickname||u.username}}<small>@{{u.username}}</small></span><span class="dim">{{Number(u.isFriend)?'互关好友':'已关注'}}</span></div>
        <h3>好友列表 · {{friends.length}}</h3>
        <p v-if="!friends.length" class="empty">还没有好友，先搜索一个用户名吧 ♡</p>
        <div class="person" v-for="u in friends" :key="u.userId"><UserAvatar :user-id="u.userId" :avatar="u.avatar" :name="u.nickname||u.username" :size="44"/><span>{{u.nickname||u.username}}<small>@{{u.username}}</small></span><button @click="openChat(u)">发送私信</button><button class="secondary" @click="router.push(`/author/${u.userId}`)">主页</button><button class="subtle" @click="remove(u)">解除</button></div>
      </section>
      <section v-if="tab==='messages'&&messageGroup!=='private'" class="panel">
        <header><div><small>MESSAGE CENTER</small><h2>消息中心</h2></div><button @click="markNotices">全部已读</button></header>
        <div class="msg-groups"><button :class="{on:messageGroup==='all'}" @click="messageGroup='all'">全部</button><button :class="{on:messageGroup==='requests'}" @click="messageGroup='requests'">好友申请</button><button :class="{on:messageGroup==='travel'}" @click="messageGroup='travel'">同行邀请</button><button :class="{on:messageGroup==='social'}" @click="messageGroup='social'">互动通知</button><button @click="openPrivate">聊天会话 <b v-if="counts.messages">{{counts.messages}}</b></button></div>
        <div v-if="messageGroup==='requests'||messageGroup==='all'" class="block"><h3>好友申请</h3><div class="person" v-for="r in requests" :key="r.id"><UserAvatar :user-id="r.userId" :avatar="r.avatar" :name="r.nickname||r.username" :size="39"/><span>{{r.nickname||r.username}}<small>{{r.requesterId===myId?'我发出的申请':'发来的好友申请'}} · {{r.status}}</small></span><template v-if="r.status==='PENDING'"><button v-if="r.receiverId===myId" @click="decide(r,true)">同意</button><button v-if="r.receiverId===myId" class="secondary" @click="decide(r,false)">拒绝</button><button v-if="r.requesterId===myId" class="secondary" @click="cancel(r)">撤回</button></template></div><p v-if="!requests.length" class="empty">暂无好友申请</p></div>
        <div v-if="messageGroup==='travel'||messageGroup==='all'" class="block"><h3>同行邀请</h3><CollabInbox @changed="collaborationChanged" /><GroupInviteInbox :refresh-key="syncTick" @changed="reload"/></div>
        <div v-if="messageGroup==='social'||messageGroup==='all'" class="block"><h3>互动通知</h3><div v-for="n in filteredNotices" :key="n.id" class="person notice-row" @click="openNotice(n)"><UserAvatar :user-id="n.actorId" :avatar="n.actorAvatar" :name="n.actorNickname||n.actorUsername" :size="38"/><span><strong>{{n.actorNickname||n.actorUsername}}</strong> {{n.title}}<small>{{n.createdAt}}</small></span><span v-if="!Number(n.isRead)" class="unread">●</span></div><p v-if="!filteredNotices.length" class="empty">暂无互动通知</p><button v-if="notices.length===30" class="more" @click="moreNotices">查看更多</button></div>
      </section>
      <section v-if="tab==='messages'&&messageGroup==='private'" class="chat-layout">
        <aside class="chats"><header><h2>聊天会话</h2><button @click="messageGroup='all'">← 通知</button><button @click="reload">↻</button></header><input v-model.trim="chatSearch" placeholder="搜索会话或好友"><button class="chat-item" v-for="c in chatCandidates" :key="`${c.type}:${c.id}`" :class="{selected:c.type==='TRAVEL_GROUP'?selectedGroup?.travelId===c.travelId:selected?.userId===c.otherId}" @click="chooseConversation(c)"><span v-if="c.type==='TRAVEL_GROUP'" class="group-icon">♧</span><UserAvatar v-else :user-id="c.otherId" :avatar="c.avatar" :name="c.nickname||c.username" :size="41"/><span><strong>{{c.nickname||c.username}}<small v-if="c.type==='TRAVEL_GROUP'">旅行群聊</small></strong><small>{{c.latest||'开始聊聊吧 ♡'}}</small></span><b v-if="c.unread">{{c.unread}}</b></button></aside>
        <section class="chat-room" v-if="selected"><header><UserAvatar :user-id="selected.userId" :avatar="selected.avatar" :name="selected.nickname||selected.username" :size="38"/><strong>{{selected.nickname||selected.username}}</strong></header><div class="history" ref="historyRef">
          <div class="chat-search"><input v-model.trim="messageSearch" placeholder="搜索当前会话消息" maxlength="80" @keydown.enter.prevent="findMessages"/><button @click="findMessages">搜索</button><button v-if="searchMatches.length" @click="searchMatches=[]">收起</button></div>
          <div v-if="searchMatches.length" class="chat-search-results">
            <button v-for="hit in searchMatches" :key="hit.id" @click="locateMessage(hit)">{{hit.body.slice(0,100)}} · {{hit.createdAt}}</button>
          </div>
          <button v-if="hasOlder" @click="loadOlder">加载更早消息</button>
          <div v-for="m in messages" :key="m.id" :id="`chat-msg-${m.id}`" class="bubble-row" :class="{mine:m.senderId===myId}">
            <UserAvatar :user-id="m.senderId" :avatar="m.senderId===myId?myAvatar:selected.avatar" :name="m.senderId===myId?'我':selected.nickname||selected.username" :size="30"/>
            <div>
              <div class="bubble">
                <span v-if="m.revokedAt">消息已撤回</span>
                <template v-else>
                  <div v-if="m.replyToId" class="reply-preview">回复：{{m.replyPreview||'原消息不可用'}}</div>
                  <img v-if="m.kind==='IMAGE'&&imageUrls[m.id]" class="chat-photo" :src="imageUrls[m.id]" alt="私信图片" />
                  <span v-else-if="m.kind==='IMAGE'">图片加载中…</span>
                  <span v-else>{{m.body}}</span>
                </template>
              </div>
              <div class="chat-meta"><time>{{m.createdAt}}</time><button v-if="!m.revokedAt" type="button" @click="quoteMessage(m)">引用</button><button v-if="canRecall(m)" type="button" @click="recallMessage(m)">撤回</button></div>
            </div>
          </div>
        </div>
        <form class="composer" @submit.prevent="sendMessage">
          <div v-if="quoting" class="quoted-draft">引用：{{quoting.body.slice(0,80)}} <button type="button" @click="quoting=null">取消</button></div>
          <textarea v-model="draft" maxlength="2000" placeholder="发送消息…（Enter 发送，Shift+Enter 换行）" @keydown.enter.exact.prevent="sendMessage"/>
          <input ref="imageInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="sendImage"/>
          <div class="chat-actions"><div><button type="button" @click="draft+=' 😊'">😊 表情</button><button type="button" :disabled="sending" @click="imageInput?.click()">图片</button></div><button :disabled="!draft.trim()||sending">{{sending?'发送中…':'发送'}}</button></div>
        </form></section>
        <JourneyGroupChat v-else-if="selectedGroup" :key="selectedGroup.travelId" :travel-id="selectedGroup.travelId!" :title="selectedGroup.title||selectedGroup.nickname||'旅行群聊'" :refresh-key="syncTick" @changed="updateGroupCounts" @left="closeGroup"/><section v-else class="chat-empty">选择好友或旅行群聊，继续你们的对话 ✿</section>
      </section>
    </section>
  </div>
</template>
<script setup lang="ts">
const emit=defineEmits<{travelsChanged:[]}>()
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UserAvatar from './UserAvatar.vue'
import JourneyGroupChat from './JourneyGroupChat.vue'
import GroupInviteInbox from './GroupInviteInbox.vue'
import CollabInbox from './CollabInbox.vue'
import {getCollabPreviewApi} from '@/api/collab'
import {getToken} from '@/api/request'
import {followAuthor} from '@/api/social'
import {hubSearch,hubFriends,hubFollowers,hubFollowing,hubRequests,hubAsk,hubDecide,hubCancel,hubUnfriend,hubNotices,hubReadNotices,hubCounts,hubConversations,hubMessages,hubSend,hubRead,hubReply,hubRecall,hubSearchMessages,hubUploadImage,hubGetImage,
 type HubUser,type HubRequest,type HubNotice,type HubChat,type HubMessage,type HubCounts} from '@/api/socialHub'
const props=withDefaults(defineProps<{ embedded?:boolean;initialTab?:'friends'|'messages' }>(),{embedded:false,initialTab:'friends'})
const router=useRouter(), route=useRoute()
const myUser=JSON.parse(localStorage.getItem('travel_user')||'{}') as {id?:number;avatar?:string|null}
const myId=Number(myUser.id||0),myAvatar=myUser.avatar||null
const searchOpen=ref(false),searched=ref(false),searchBusy=ref(false),searchError=ref(''),askingUserId=ref<number|null>(null),searchInput=ref<HTMLInputElement|null>(null)
const pendingIncoming=(u:HubUser)=>requests.value.some(r=>r.userId===u.userId&&r.status==='PENDING'&&r.receiverId===myId)
const pendingOutgoing=(u:HubUser)=>requests.value.some(r=>r.userId===u.userId&&r.status==='PENDING'&&r.requesterId===myId)
async function openSearch(){searchOpen.value=true;await nextTick();searchInput.value?.focus()}
function openIncomingRequests(){void router.push({path:'/me',query:{section:'messages',view:'requests'}})}
const validTabs=['friends','messages','chat'] as const
type Tab=(typeof validTabs)[number]
const tab=ref<Tab>(props.initialTab),notice=ref(''),query=ref(''),results=ref<HubUser[]>([]),friends=ref<HubUser[]>([]),requests=ref<HubRequest[]>([]),notices=ref<HubNotice[]>([]),conversations=ref<HubChat[]>([]),counts=ref<HubCounts>({notifications:0,friendRequests:0,messages:0})
const messageGroup=ref<'all'|'requests'|'travel'|'social'|'private'>('all'),chatSearch=ref(''),selected=ref<HubUser|null>(null),messages=ref<HubMessage[]>([]),draft=ref(''),sending=ref(false),hasOlder=ref(false),historyRef=ref<HTMLElement|null>(null)
const followers=ref<HubUser[]>([]),following=ref<HubUser[]>([])
// TRAVEL_CHAT_V13: keep private image blobs in memory; revoke on chat switch/unmount.
const quoting=ref<HubMessage|null>(null),imageInput=ref<HTMLInputElement|null>(null)
const imageUrls=ref<Record<number,string>>({}),messageSearch=ref(''),searchMatches=ref<HubMessage[]>([])
function releaseImages(){Object.values(imageUrls.value).forEach(url=>URL.revokeObjectURL(url));imageUrls.value={}}
async function loadImages(other:number,rows:HubMessage[]){
  const ids=rows.filter(m=>m.kind==='IMAGE'&&!m.revokedAt&&!imageUrls.value[m.id]).map(m=>m.id)
  for(const id of ids){
    try{const blob=await hubGetImage(other,id);if(selected.value?.userId!==other)return;
      imageUrls.value[id]=URL.createObjectURL(blob)
    }catch{} // The message remains visible even if an individual attachment is unavailable.
  }
}
function quoteMessage(m:HubMessage){quoting.value=m}
function canRecall(m:HubMessage){
  if(m.revokedAt||m.senderId!==myId)return false
  const at=Date.parse(String(m.createdAt).replace(' ','T'))
  return Number.isFinite(at)&&Date.now()-at<=120000&&Date.now()>=at
}
async function recallMessage(m:HubMessage){
  if(!selected.value||!confirm('确定撤回这条消息？'))return
  await execute(async()=>{await api(hubRecall(selected.value!.userId,m.id));await refreshMessages()})
}
async function findMessages(){
  if(!selected.value||messageSearch.value.trim().length<2){notice.value='至少输入两个字搜索';return}
  await execute(async()=>{searchMatches.value=await api(hubSearchMessages(selected.value!.userId,messageSearch.value.trim()))})
}
async function locateMessage(hit:HubMessage){
  if(!selected.value)return
  await execute(async()=>{
    const data=await api(hubMessages(selected.value!.userId,hit.id+1));messages.value=data.slice().reverse();
    hasOlder.value=data.length===40;await loadImages(selected.value!.userId,messages.value);
    await nextTick();document.getElementById(`chat-msg-${hit.id}`)?.scrollIntoView({block:'center',behavior:'smooth'})
  })
}
async function sendImage(event:Event){
  const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value=''
  if(!file||!selected.value||sending.value)return
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){notice.value='仅支持 5MB 以内的 JPG、PNG、WebP 图片';return}
  sending.value=true;const other=selected.value.userId
  await execute(async()=>{await api(hubUploadImage(other,file,crypto.randomUUID()));await refreshMessages(true)})
  sending.value=false
}
const selectedGroup=ref<HubChat|null>(null),syncTick=ref(0)
const noticeTotal=computed(()=>counts.value.notifications+counts.value.friendRequests+counts.value.messages)
const filteredNotices=computed(()=>notices.value.filter(n=>n.eventType!=='FRIEND_REQUEST'&&n.eventType!=='TRAVEL_INVITE'))
const chatCandidates=computed(()=>{
  const existing=conversations.value.slice()
  for(const f of friends.value)if(!existing.some(c=>c.type!=='TRAVEL_GROUP'&&c.otherId===f.userId))existing.push({...f,id:f.userId,otherId:f.userId,type:'PRIVATE',latest:null,unread:0,updatedAt:''})
  return existing.filter(c=>(c.nickname||c.username||c.title||'').toLowerCase().includes(chatSearch.value.toLowerCase())).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))
})
function conversationOf(id:number){return conversations.value.find(c=>c.type!=='TRAVEL_GROUP'&&c.otherId===id)}
async function api<T>(promise:Promise<{code:number;message:string;data:T}>):Promise<T>{const r=await promise;if(r.code!==200)throw new Error(r.message);return r.data}
async function execute(fn:()=>Promise<void>){try{notice.value='';await fn()}catch(e){notice.value=e instanceof Error?e.message:'操作失败，请重试'}}
async function reload(){
  // One broken endpoint must not make every social section disappear.
  const jobs:[string,Promise<unknown>,(v:any)=>void][]=[
    ['好友',api(hubFriends()),v=>friends.value=v],
    ['关注我的',api(hubFollowers()),v=>followers.value=v],
    ['我关注的',api(hubFollowing()),v=>following.value=v],
    ['好友申请',api(hubRequests()),v=>requests.value=v],
    ['通知',api(hubNotices()),v=>notices.value=v],
    ['未读统计',api(hubCounts()),v=>counts.value=v],
    ['会话',api(hubConversations()),v=>conversations.value=v]
  ]
  const settled=await Promise.allSettled(jobs.map(j=>j[1]));
  const failed:string[]=[];
  settled.forEach((r,i)=>{if(r.status==='fulfilled')jobs[i]![2](r.value);else failed.push(jobs[i]![0]+': '+(r.reason instanceof Error?r.reason.message:'服务器错误'))});
  syncTick.value++;window.dispatchEvent(new CustomEvent('tm-social-counts',{detail:counts.value}));
  if(failed.length)notice.value='部分数据读取失败：'+failed.join('；')
}
async function collaborationChanged(){emit('travelsChanged');await reload()}
async function search(){
  if(searchBusy.value || !query.value.trim()) return
  searchBusy.value=true;searched.value=false;searchError.value=''
  try{results.value=await api(hubSearch(query.value));searched.value=true;await reload()}
  catch(e){results.value=[];searchError.value=e instanceof Error?e.message:'搜索失败，请重试'}
  finally{searchBusy.value=false}
}
async function followBack(u:HubUser){await execute(async()=>{await api(followAuthor(u.userId,true));notice.value='已关注对方，互关将自动成为好友';await reload()})}
async function ask(u:HubUser){
  if(askingUserId.value!==null || u.userId===myId || Number(u.isFriend) || pendingIncoming(u) || pendingOutgoing(u))return
  askingUserId.value=u.userId
  await execute(async()=>{await api(hubAsk(u.username));await reload();notice.value='好友申请已发送，等待对方接受'})
  askingUserId.value=null
}
async function decide(r:HubRequest,accept:boolean){await execute(async()=>{await api(hubDecide(r.id,accept));await reload()})}
async function cancel(r:HubRequest){await execute(async()=>{await api(hubCancel(r.id));await reload()})}
async function remove(u:HubUser){if(!confirm(`解除与 ${u.nickname||u.username} 的好友关系？`))return;await execute(async()=>{await api(hubUnfriend(u.userId));if(selected.value?.userId===u.userId)selected.value=null;await reload()})}
async function markNotices(){await execute(async()=>{await api(hubReadNotices());await reload()})}
async function moreNotices(){await execute(async()=>{const page=Math.floor(notices.value.length/30)+1;notices.value.push(...await api(hubNotices(page)))})}
async function openNotice(n:HubNotice){
  if(n.eventType==='GROUP_INVITE'){void router.push({path:'/me',query:{section:'messages',view:'invitations'}})}
  else if(n.travelId){
    if(n.eventType==='GROUP_ACCEPTED'){await router.push({path:'/me',query:{section:'messages',type:'travel',travelId:String(n.travelId)}});return}
    await execute(async()=>{const trip=await api(getCollabPreviewApi(n.travelId!));await router.push(trip.myRole==='OWNER'?`/journey/${n.travelId}`:`/collab/journey/${n.travelId}`)})
  }
  else if(n.eventType.startsWith('FRIEND')){void router.push({path:'/me',query:{section:'messages',view:'invitations'}})}
  else{void router.push(`/author/${n.actorId}`)}
}
function setTab(t:Tab){void router.push({path:'/me',query:{section:t==='friends'?'friends':'messages',...(t==='chat'?{view:'conversations'}:{})}})}
function openPrivate(){void router.push({path:'/me',query:{section:'messages',view:'conversations'}})}
async function chooseConversation(c:HubChat){
  if(c.type==='TRAVEL_GROUP'){await router.push({path:'/me',query:{section:'messages',type:'travel',travelId:String(c.travelId)}})}
  else{await router.push({path:'/me',query:{section:'messages',type:'private',user:String(c.otherId)}})}
}
async function openChat(u:HubUser){await router.push({path:'/me',query:{section:'messages',type:'private',user:String(u.userId)}})}
async function applyLocation(){
  tab.value=props.initialTab;const q=route.query
  messageGroup.value=q.type||q.view==='conversations'?'private':q.view==='invitations'?'travel':q.view==='requests'?'requests':'all'
  if(q.type==='travel'){
    const trip=Number(q.travelId);if(!Number.isSafeInteger(trip)||trip<1){notice.value='无效旅行群聊';return}
    if(selectedGroup.value?.travelId===trip)return
    releaseImages();selected.value=null;messages.value=[];draft.value='';quoting.value=null
    selectedGroup.value=conversations.value.find(c=>c.type==='TRAVEL_GROUP'&&c.travelId===trip)||{type:'TRAVEL_GROUP',travelId:trip,id:trip,otherId:0,username:'',nickname:`旅行群聊 #${trip}`,avatar:null,latest:null,unread:0,updatedAt:''}
  }else if(q.type==='private'||q.user){
    const id=Number(q.user);if(selected.value?.userId===id)return
    const user=friends.value.find(f=>f.userId===id)
    selectedGroup.value=null;releaseImages();selected.value=null;messages.value=[];draft.value='';quoting.value=null;messageSearch.value='';searchMatches.value=[]
    if(user){selected.value=user;await refreshMessages(true)}else notice.value='该好友会话暂时不可用。'
  }else{selectedGroup.value=null;selected.value=null;releaseImages()}
}
function closeGroup(){selectedGroup.value=null;void router.replace({path:'/me',query:{section:'messages',view:'conversations'}});void reload()}
async function updateGroupCounts(){await Promise.all([updateCounts(),updateConversations()])}

async function refreshMessages(scroll=false){const u=selected.value;if(!u)return;await execute(async()=>{const data=await api(hubMessages(u.userId));if(selected.value?.userId!==u.userId)return;messages.value=data.slice().reverse();hasOlder.value=data.length===40;await loadImages(u.userId,messages.value);await api(hubRead(u.userId));await Promise.all([updateCounts(),updateConversations()]);if(scroll){await nextTick();historyRef.value?.scrollTo({top:historyRef.value.scrollHeight,behavior:'smooth'})}})}
async function loadOlder(){const first=messages.value[0],user=selected.value;if(!user||!first)return;await execute(async()=>{const data=await api(hubMessages(user.userId,first.id));messages.value=[...data.reverse(),...messages.value];hasOlder.value=data.length===40;await loadImages(user.userId,data)})}
async function sendMessage(){if(sending.value||!draft.value.trim()||!selected.value)return;sending.value=true;const body=draft.value.trim(),user=selected.value;await execute(async()=>{const clientId=crypto.randomUUID();if(quoting.value)await api(hubReply(user.userId,body,clientId,quoting.value.id));else await api(hubSend(user.userId,body,clientId));draft.value='';quoting.value=null;await refreshMessages(true)});sending.value=false}
async function updateCounts(){try{counts.value=await api(hubCounts());window.dispatchEvent(new CustomEvent('tm-social-counts',{detail:counts.value}))}catch{}}
async function updateConversations(){try{conversations.value=await api(hubConversations())}catch{}}
let socket:WebSocket|null=null,pollId:number|undefined,reconnectId:number|undefined,closed=false
function connect(){if(closed||!getToken())return;const p=location.protocol==='https:'?'wss:':'ws:';socket=new WebSocket(`${p}//${location.host}/ws/social`);socket.onopen=()=>socket?.send(JSON.stringify({type:'AUTH',token:getToken()}));socket.onmessage=async ev=>{try{const msg=JSON.parse(String(ev.data));if(msg.type==='SYNC'){await reload();if(tab.value==='messages'&&messageGroup.value==='private'&&selected.value)await refreshMessages()}}catch{}};socket.onclose=()=>{socket=null;if(!closed)reconnectId=window.setTimeout(connect,4000)};socket.onerror=()=>socket?.close()}
watch(()=>[props.initialTab,route.query.type,route.query.travelId,route.query.user,route.query.view],()=>void applyLocation())
onMounted(async()=>{await reload();await applyLocation();pollId=window.setInterval(async()=>{if(document.hidden)return;await reload();if(tab.value==='messages'&&messageGroup.value==='private'&&selected.value)await refreshMessages()},9000);connect()})
onBeforeUnmount(()=>{closed=true;releaseImages();if(pollId)clearInterval(pollId);if(reconnectId)clearTimeout(reconnectId);socket?.close()})
</script>
<style scoped>
.hub-page{min-height:100vh;display:grid;grid-template-columns:270px 1fr;gap:22px;padding:26px;background:linear-gradient(145deg,#fff5fb,#ffe0eb 60%,#fff8ed);color:#85506d;font-family:system-ui,"Microsoft YaHei",sans-serif}.hub-side,.hub-main{background:#fffafcce;border:1px solid #fff;border-radius:28px;box-shadow:0 15px 45px #c2719d1c}.hub-side{padding:28px 18px}.back{border:0;background:none;color:#a26a87;cursor:pointer}.head{padding:26px 8px}.head span,.head p{font-size:12px;color:#b18ca1}.head h1{font-size:23px}.hub-side nav{display:grid;gap:8px}.hub-side nav button,.msg-groups button{padding:14px 17px;border:0;text-align:left;background:transparent;color:#a4748f;border-radius:15px;cursor:pointer}.hub-side nav .on,.msg-groups .on{background:#fff0f6;color:#8b466d;font-weight:700}.hub-side nav b{float:right;border-radius:20px;background:#ffd4e7;padding:2px 8px}.hint{font-size:12px;line-height:1.8;margin:25px 8px;color:#b88aa3}.hub-main{min-width:0;overflow:hidden}.panel{padding:26px;max-height:calc(100vh - 60px);overflow:auto}.panel header,.chats header{display:flex;justify-content:space-between;align-items:center}.panel header small{letter-spacing:.12em;font-size:11px;color:#ba8eaa}.panel h2{font-size:25px;margin:5px 0 20px}.panel h3{font-size:16px;margin-top:30px}.panel button,.composer button,.chats header button{cursor:pointer;border:0;border-radius:13px;background:#f9dce9;color:#914d73;padding:10px 15px}.panel .secondary{background:#faedf3}.friends-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.friends-head-actions .primary,.search .primary{background:linear-gradient(125deg,#d679a2,#c76896);color:#fff;font-weight:750;white-space:nowrap}.panel .search button{flex:0 0 auto;white-space:nowrap;min-width:90px}.panel .search input{flex:1 1 200px}.friends-head{gap:12px;flex-wrap:wrap}.panel button:focus-visible{outline:3px solid #b45b8a;outline-offset:3px}.panel .subtle{background:transparent}.person{min-height:66px;display:flex;align-items:center;gap:13px;padding:12px 0;border-bottom:1px solid #f4e1e9}.person>span:nth-child(2){flex:1;min-width:0}.person small{display:block;font-size:11px;color:#ad8b9c;margin-top:4px}.dim,.empty{color:#b68ba2;font-size:13px}.search{display:flex;gap:8px;flex-wrap:wrap}.search button{word-break:keep-all;writing-mode:horizontal-tb}.search input,.chats input{width:100%;min-width:0;border:1px solid #f0d8e5;border-radius:14px;background:white;padding:12px;color:#85506d}.search-results{margin:18px 0;padding:16px;border-radius:20px;background:#fff3f8}.msg-groups{display:flex;gap:7px;flex-wrap:wrap}.msg-groups button{padding:9px 13px}.block{border-top:1px solid #f4dce8;margin:22px 0}.notice-row{cursor:pointer}.unread{color:#f477af}.alert{padding:12px 26px;background:#ffd4e7;display:flex;justify-content:space-between}.alert button{border:0;background:none;cursor:pointer}.chat-layout{display:grid;grid-template-columns:280px minmax(0,1fr);height:calc(100vh - 54px);min-height:560px}.chats{border-right:1px solid #f2d9e5;padding:20px;overflow-y:auto}.chats input{margin-bottom:17px}.chats h2{margin:0}.chat-item{display:flex;align-items:center;gap:8px;padding:12px 7px;border:0;border-radius:14px;background:transparent;width:100%;text-align:left;cursor:pointer;color:#865473}.chat-item.selected{background:#fff0f7}.chat-item span{flex:1;min-width:0}.chat-item small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:#b091a2}.chat-item b{border-radius:20px;background:#ffd0e5;padding:3px 7px}.chat-room{display:flex;flex-direction:column;min-width:0}.chat-room>header{height:78px;display:flex;align-items:center;gap:10px;padding:0 24px;border-bottom:1px solid #efdce7}.history{flex:1;min-height:0;overflow-y:auto;padding:23px;background:linear-gradient(180deg,#fff7fb,#fff0f7)}.history>button{display:block;margin:0 auto 16px;border:0;background:#ffe5f2;border-radius:18px;padding:10px}.bubble-row{display:flex;align-items:flex-start;gap:8px;margin:13px 0}.bubble-row.mine{flex-direction:row-reverse}.bubble{padding:11px 15px;background:#fff;border-radius:17px;max-width:min(440px,63vw);overflow-wrap:anywhere;white-space:pre-wrap;box-shadow:0 2px 8px #ae779321;color:#78516c}.mine .bubble{background:#ffdce9}.bubble-row time{display:block;font-size:10px;color:#ba9bac;padding:4px}.mine time{text-align:right}.composer{padding:14px;background:#fffafd}.composer textarea{resize:none;height:76px;box-sizing:border-box;width:100%;border:0;outline:none;background:transparent;color:#78516c;font:inherit}.composer>div{display:flex;align-items:center;justify-content:space-between}.composer span{font-size:11px;color:#ad91a0}.chat-empty{display:grid;place-items:center;color:#b991a5}.more{margin-top:10px}@media(max-width:850px){.hub-page{grid-template-columns:1fr;padding:10px}.hub-side{padding:10px}.hub-side nav{display:flex;flex-wrap:wrap}.hint,.head p{display:none}.head{padding:5px}.chat-layout{grid-template-columns:125px 1fr;height:75vh;min-height:460px}.chats{padding:8px}.chat-item span small{display:none}.panel{padding:16px}.person{flex-wrap:wrap}}
.hub-inline{min-height:0;display:block;padding:0;background:transparent}
.hub-inline .hub-side{display:none}
.hub-inline .hub-main{min-height:550px;border-radius:26px}
.hub-inline .panel{max-height:none;min-height:550px}
.hub-inline .chat-layout{height:min(76vh,720px);min-height:560px}
/* TRAVEL_CHAT_V13 */
.chat-search{display:flex;gap:6px;margin-bottom:12px}
.chat-search input{flex:1;min-width:0;border:1px solid #f0d8e5;border-radius:12px;padding:9px;color:#85506d}
.chat-search button,.chat-search-results button,.chat-meta button,.chat-actions button,.quoted-draft button{border:0;background:#ffe7f1;border-radius:11px;padding:6px 10px;color:#985c7d;cursor:pointer}
.chat-search-results{display:grid;gap:5px;max-height:145px;overflow-y:auto;margin-bottom:10px}
.chat-search-results button{text-align:left}
.chat-photo{display:block;max-width:min(280px,100%);max-height:300px;object-fit:contain;border-radius:12px}
.reply-preview{padding:7px 9px;margin-bottom:7px;border-left:3px solid #dba4c3;background:#fff4f8;border-radius:5px;font-size:12px;white-space:normal}
.chat-meta{display:flex;align-items:center;gap:7px}
.chat-meta button{background:transparent;font-size:11px;padding:2px 3px}
.quoted-draft{padding:7px 9px;border-radius:11px;background:#fff0f7;display:flex;justify-content:space-between;gap:10px}
.chat-actions{display:flex;justify-content:space-between;align-items:center}
.chat-actions>div{display:flex;gap:5px}

.group-icon{display:grid;place-items:center;flex:0 0 41px!important;width:41px;height:41px;background:#fce0ed;border-radius:15px;color:#b16a91;font-size:24px}.chat-layout{min-height:0;height:calc(100dvh - var(--tm-nav-height) - 100px)}.hub-inline .chat-layout{height:calc(100dvh - var(--tm-nav-height) - 100px);min-height:440px}.panel{max-height:calc(100dvh - var(--tm-nav-height) - 90px)}@media(max-width:650px){.chat-layout{grid-template-columns:110px minmax(0,1fr)}.chat-item{flex-wrap:wrap;gap:5px}.chat-item strong{font-size:12px}.chats h2{font-size:14px}.chats header{flex-wrap:wrap;gap:5px}.chats header button{font-size:11px;padding:6px}.hub-inline .chat-layout{height:calc(100dvh - var(--tm-nav-height) - 170px);min-height:400px}}
</style>
