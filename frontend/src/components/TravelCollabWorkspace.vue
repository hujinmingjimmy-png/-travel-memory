<template>
  <section v-if="eligible" class="workspace" aria-label="旅行共创">
    <p v-if="loading" class="tip" role="status">正在读取共创状态…</p>
    <p v-if="error" class="feedback" role="alert">{{ error }} <button type="button" @click="reload">重试</button></p>
    <template v-if="overview">
      <div v-if="!enabled" class="closed-row">
        <div><strong>{{ overview.hasHistory ? '共创已关闭' : '邀请同行，一起留下旅行记忆' }}</strong><p>{{ overview.hasHistory ? '已有作品与署名保留，停止新增投稿和邀请。' : '开启后可邀请同行、分享选定照片和共同写故事。' }}</p></div>
        <div class="actions"><button v-if="isOwner" :disabled="busy" @click="toggleEnabled(true)">{{ overview.hasHistory ? '重新开启共创' : '开启共创' }}</button><button v-if="overview.hasHistory" class="secondary" @click="showHistory=!showHistory;loadPosts()">{{ showHistory ? '收起已有作品' : '查看已有共同作品' }}</button><button v-if="overview.groupState==='ACTIVE'" class="secondary" @click="enterGroup">进入群聊</button></div>
      </div>
      <template v-if="enabled || showHistory">
        <header class="heading"><div><small>SHARED JOURNEY · 共同记忆</small><h2>一起写下这段旅程</h2><p>分享选定的照片，保留每个人真实的故事与署名。</p></div><button v-if="isOwner" class="secondary" @click="showSettings=!showSettings">{{ showSettings ? '收起管理' : '管理共创' }}<span v-if="pendingCount"> · {{ pendingCount }} 待审核</span></button></header>
        <div class="member-line"><div v-for="m in overview.members" :key="m.userId" class="member"><UserAvatar :user-id="m.userId" :avatar="m.avatar" :name="m.nickname||m.username" :size="32"/><span>{{ m.nickname||m.username }}<small>{{ m.role==='OWNER'?'创建者':'同行者' }}</small></span></div><button class="text-button" @click="copyCredits">复制联合署名</button></div>
        <div v-if="isOwner && showSettings" class="settings">
          <template v-if="enabled"><label><input v-model="allowDraft" type="checkbox">允许同行投稿</label><label><input v-model="reviewDraft" type="checkbox">投稿需审核</label><button :disabled="busy" @click="saveSettings">保存设置</button><button class="secondary" :disabled="busy" @click="toggleEnabled(false)">关闭共创</button></template>
          <p>关闭后停止新增投稿和邀请；保留成员、作品、署名和既有群聊，可继续处理待审投稿。</p>
        </div>
        <div v-if="enabled" class="actions toolbar">
          <template v-if="canSubmit"><button :disabled="busy" v-if="isOwner" @click="openComposer('ALBUM')">从旅行相册选择</button><button v-else :disabled="busy" @click="openComposer('PHOTO')">投稿照片</button><button class="secondary" :disabled="busy" @click="openComposer('STORY')">写故事</button></template>
          <button v-if="isOwner" class="secondary" :disabled="busy" @click="openTravelInvite">邀请同行</button>
          <button v-if="isOwner && overview.groupState==='ACTIVE' && collaborators.length" class="secondary" :aria-expanded="showGroups" @click="showGroups=!showGroups">{{ showGroups ? '收起群聊邀请' : '邀请加入群聊' }}</button>
          <button v-if="overview.groupState==='ACTIVE'" class="secondary" @click="enterGroup">进入群聊</button>
          <button v-else-if="overview.groupState==='INVITED'" class="secondary" @click="goInvitations">群聊邀请待接受</button>
          <button v-else-if="isOwner" class="secondary" :disabled="busy" @click="startGroup">{{ overview.groupState==='LEFT'?'重新加入群聊':'开启群聊' }}</button>
          <span v-else class="tip">{{ overview.groupState==='LEFT'?'你已退出群聊，可请创建者重新邀请。':overview.groupState==='REMOVED'?'你已被移出群聊。':'加入群聊需创建者邀请。' }}</span>
        </div>
        <p v-if="enabled && !canSubmit" class="tip">创建者已暂停同行投稿，你仍可查看已发布的共同作品。</p>
        <div v-if="isOwner && enabled && showGroups && overview.groupState==='ACTIVE'" class="settings group-list">
          <p>仅可邀请已加入旅行的同行者，对方接受后才入群。</p>
          <p v-if="!collaborators.length" class="tip">还没有同行者，请先邀请同行。</p>
          <div v-for="m in collaborators" :key="m.userId" class="group-person"><span>{{ m.nickname||m.username }} · {{ groupLabel(m.userId) }}</span><button :disabled="busy || ['ACTIVE','INVITED'].includes(memberState(m.userId))" @click="inviteGroup(m.userId)">{{ memberState(m.userId)==='INVITED'?'等待接受':memberState(m.userId)==='ACTIVE'?'已加入':'发送群聊邀请' }}</button><button v-if="['ACTIVE','INVITED'].includes(memberState(m.userId))" class="text-button" :disabled="busy" @click="removeGroupMember(m.userId)">移出／撤回</button></div>
        </div>
        <form v-if="composer && enabled && canSubmit" class="composer" @submit.prevent="submit">
          <h3>{{ composer==='ALBUM'?'选择要分享的旅行照片':composer==='PHOTO'?'投稿照片':'写下共同故事' }}</h3>
          <p v-if="composer==='ALBUM'" class="tip">只有你选中的照片会对共创成员开放，不影响其他照片。</p>
          <div v-if="composer==='ALBUM'" class="album-grid"><button v-for="p in album" :key="p.id" type="button" :class="{selected:selectedMedia===p.id}" :aria-pressed="selectedMedia===p.id" :disabled="!p.url || busy" @click="selectedMedia=p.id"><img v-if="p.url" :src="p.url" :alt="p.originalName||'旅行照片'"><span>{{ p.caption||p.originalName||'旅行照片' }}</span></button><p v-if="!album.length">相册还没有照片，请先在旅行相册上传。</p></div>
          <label>标题／照片说明<input v-model.trim="title" maxlength="100" placeholder="为这一刻起个名字" required :disabled="busy"></label>
          <label v-if="composer==='STORY'">故事内容<textarea v-model.trim="body" maxlength="1500" placeholder="写下共同的回忆……" required :disabled="busy" /></label>
          <label v-if="composer==='PHOTO'">选择照片<input type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy" @change="pickFile"><small>JPEG、PNG、WebP，最大 5MB</small></label>
          <footer><span>{{ !isOwner && requiresReview ? '提交后待创建者审核，通过前仅你和创建者可见。' : '发布后共创成员可查看。' }}</span><div class="actions"><button type="button" class="secondary" :disabled="busy" @click="closeComposer">取消</button><button :disabled="busy || !title || (composer==='STORY'?!body:composer==='PHOTO'?!file:!selectedMedia)">{{ busy?'提交中…':!isOwner&&requiresReview?'提交审核':'发布共同作品' }}</button></div></footer>
        </form>
        <div v-if="isOwner && pendingCount" class="review-summary"><span>{{ pendingCount }} 条投稿待审核</span><button class="text-button" @click="onlyPending=!onlyPending">{{ onlyPending?'显示全部作品':'只看待审核' }}</button></div>
        <div v-if="visiblePosts.length" class="posts"><article v-for="p in visiblePosts" :key="p.id" class="post"><div class="post-author"><UserAvatar :user-id="p.authorId" :avatar="p.avatar" :name="p.nickname||p.username" :size="30"/><span>{{ p.nickname||p.username }}<small>{{ p.createdAt }}</small></span><span v-if="p.status!=='APPROVED'" class="status">{{ p.status==='PENDING'?'待审核':'已退回' }}</span></div><h3>{{ p.title }}</h3><img v-if="p.kind==='PHOTO' && photos[p.id]" class="shared-photo" :src="photos[p.id]" :alt="p.title"><p v-else-if="p.kind==='PHOTO'" class="tip">{{ photoErrors[p.id]||'照片加载中…' }}</p><p v-else class="story">{{ p.body }}</p><div v-if="isOwner" class="actions"><template v-if="p.status==='PENDING'"><button :disabled="busy" @click="review(p.id,true)">通过</button><button class="secondary" :disabled="busy" @click="review(p.id,false)">退回</button></template><button class="text-button" :disabled="busy" @click="removePost(p.id)">移除共同作品</button></div></article></div>
        <p v-else class="empty">{{ onlyPending?'暂无待审核投稿。':canSubmit?'还没有共同作品，选择照片或写下第一段故事吧。':'还没有已发布的共同作品。' }}</p>
      </template>
      <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>
    </template>
    <CollabInviteDialog v-if="inviteTravel" :travel="inviteTravel" @close="inviteTravel=null" @changed="reloadInvites" />
  </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {useRouter} from 'vue-router'
import UserAvatar from './UserAvatar.vue'
import CollabInviteDialog from './CollabInviteDialog.vue'
import {workspaceApi,workspacePhotoUrl,type WorkspaceOverview,type WorkspacePost} from '@/api/journeyWorkspace'
import {getTravelMediaApi,createMediaBlobUrl,type TravelMedia} from '@/api/media'
import {getCollabPreviewApi,type CollabTravelCard} from '@/api/collab'
import {groupInvite,groupJoin,groupRemove} from '@/api/socialHub'
const props=defineProps<{travelId:number}>(),router=useRouter()
const overview=ref<WorkspaceOverview|null>(null),posts=ref<WorkspacePost[]>([]),photos=ref<Record<number,string>>({}),photoErrors=ref<Record<number,string>>({})
const eligible=ref(true),loading=ref(true),busy=ref(false),error=ref(''),feedback=ref(''),showHistory=ref(false),showSettings=ref(false),showGroups=ref(false),onlyPending=ref(false)
const allowDraft=ref(true),reviewDraft=ref(true),composer=ref<''|'STORY'|'PHOTO'|'ALBUM'>(''),title=ref(''),body=ref(''),file=ref<File|null>(null),selectedMedia=ref<number|null>(null),clientId=ref('')
const album=ref<(TravelMedia&{url:string})[]>([]),inviteTravel=ref<CollabTravelCard|null>(null)
const flag=(v:unknown)=>v===true||v===1||v==='1'
const enabled=computed(()=>flag(overview.value?.policy.enabled)),isOwner=computed(()=>overview.value?.role==='OWNER'),requiresReview=computed(()=>flag(overview.value?.policy.reviewRequired))
const canSubmit=computed(()=>enabled.value && (isOwner.value||flag(overview.value?.policy.membersCanSubmit)))
const collaborators=computed(()=>overview.value?.members.filter(m=>m.role!=='OWNER')||[])
const pendingCount=computed(()=>posts.value.filter(p=>p.status==='PENDING').length)
const visiblePosts=computed(()=>onlyPending.value?posts.value.filter(p=>p.status==='PENDING'):posts.value)
let generation=0,timer:number|undefined,disposed=false
function release(){Object.values(photos.value).forEach(URL.revokeObjectURL);photos.value={};album.value.forEach(p=>URL.revokeObjectURL(p.url));album.value=[]}
async function loadPosts(){if(!overview.value || (!enabled.value&&!showHistory.value))return;const trip=props.travelId,g= generation;const data=await workspaceApi.posts(trip);if(g!==generation||disposed)return;posts.value=data;const keep=new Set(data.map(p=>p.id));for(const id of Object.keys(photos.value)){if(!keep.has(Number(id))){URL.revokeObjectURL(photos.value[Number(id)]!);delete photos.value[Number(id)]}}await Promise.all(data.filter(p=>p.kind==='PHOTO'&&!photos.value[p.id]).map(async p=>{try{const url=await workspacePhotoUrl(trip,p.id);if(g!==generation||disposed){URL.revokeObjectURL(url);return}photos.value[p.id]=url}catch{if(g===generation)photoErrors.value[p.id]='照片暂时无法加载，请重试。'}}))}
async function reload(){const g=generation,trip=props.travelId;try{error.value='';const data=await workspaceApi.overview(trip);if(g!==generation||disposed)return;overview.value=data;eligible.value=true;if(!showSettings.value){allowDraft.value=flag(data.policy.membersCanSubmit);reviewDraft.value=flag(data.policy.reviewRequired)}if(!canSubmit.value)closeComposer();await loadPosts()}catch(e){if(g!==generation||disposed)return;if((e as {code?:number}).code===403){eligible.value=false;release();overview.value=null}else error.value=e instanceof Error?e.message:'读取失败'}finally{if(g===generation)loading.value=false}}
async function action(fn:()=>Promise<void>){if(busy.value)return;busy.value=true;feedback.value='';try{await fn()}catch(e){feedback.value=e instanceof Error?e.message:'操作失败，请重试'}finally{busy.value=false}}
async function toggleEnabled(on:boolean){if(!overview.value)return;if(!on&&!confirm('关闭后停止新增投稿和邀请；保留已有作品、署名、成员及群聊历史，既有群聊可继续使用。确定关闭？'))return;await action(async()=>{const p=overview.value!.policy;await workspaceApi.policy(props.travelId,on,flag(p.membersCanSubmit),flag(p.reviewRequired),p.version);showSettings.value=false;showGroups.value=false;showHistory.value=false;closeComposer();await reload();feedback.value=on?'共创已开启，可邀请同行一起记录。':'共创已关闭，已有内容与群聊记录保留。'})}
async function saveSettings(){await action(async()=>{const p=overview.value!.policy;await workspaceApi.policy(props.travelId,enabled.value,allowDraft.value,reviewDraft.value,p.version);showSettings.value=false;await reload();feedback.value='设置已保存。'})}
async function openComposer(kind:'STORY'|'PHOTO'|'ALBUM'){if(busy.value)return;closeComposer();composer.value=kind;clientId.value=crypto.randomUUID();if(kind==='ALBUM')await action(async()=>{const g=generation,trip=props.travelId;const r=await getTravelMediaApi(trip);if(g!==generation||disposed)return;if(r.code!==200)throw new Error(r.message);const data=await Promise.all(r.data.map(async p=>({...p,url:await createMediaBlobUrl(trip,p.id).catch(()=>'')})));if(g!==generation||disposed){data.forEach(p=>URL.revokeObjectURL(p.url));return}album.value=data})}
function closeComposer(){composer.value='';title.value='';body.value='';file.value=null;selectedMedia.value=null;album.value.forEach(p=>URL.revokeObjectURL(p.url));album.value=[]}
function pickFile(e:Event){file.value=(e.target as HTMLInputElement).files?.[0]||null}
async function submit(){if(!canSubmit.value||!composer.value)return;await action(async()=>{const result=composer.value==='STORY'?await workspaceApi.story(props.travelId,title.value,body.value,clientId.value):composer.value==='ALBUM'?await workspaceApi.fromAlbum(props.travelId,selectedMedia.value!,title.value,clientId.value):await workspaceApi.photo(props.travelId,title.value,file.value!,clientId.value);closeComposer();await reload();feedback.value=result.status==='PENDING'?'已提交，等待创建者审核；通过前仅你和创建者可见。':'已发布，共创成员可查看。'})}
async function review(id:number,approve:boolean){await action(async()=>{await workspaceApi.review(props.travelId,id,approve);await reload();feedback.value=approve?'投稿已通过并发布。':'投稿已退回，仅作者和创建者可见。'})}
async function removePost(id:number){if(!confirm('移除这条共同作品？原旅行相册照片不会删除。'))return;await action(async()=>{await workspaceApi.remove(props.travelId,id);await reload()})}
async function copyCredits(){try{await navigator.clipboard.writeText((overview.value?.members||[]).map(m=>`${m.nickname||m.username}（${m.role==='OWNER'?'创建者':'同行者'}）`).join(' · '));feedback.value='联合署名已复制。'}catch{feedback.value='复制失败，请手动选取成员署名。'}}
async function checked(p:Promise<{code:number;message:string}>){const r=await p;if(r.code!==200)throw new Error(r.message)}
async function openTravelInvite(){await action(async()=>{const r=await getCollabPreviewApi(props.travelId);if(r.code!==200)throw new Error(r.message);inviteTravel.value=r.data})}
async function reloadInvites(){await reload();if(inviteTravel.value){const r=await getCollabPreviewApi(props.travelId);if(r.code===200)inviteTravel.value=r.data}}
function memberState(user:number){return overview.value?.groupMembers.find(m=>m.userId===user)?.status||'NONE'}
function groupLabel(user:number){return ({NONE:'未邀请',INVITED:'待接受',ACTIVE:'已加入',LEFT:'已退出',REMOVED:'已移出',DECLINED:'已拒绝',CANCELED:'已取消'} as Record<string,string>)[memberState(user)]||'未邀请'}
async function inviteGroup(user:number){await action(async()=>{await checked(groupInvite(props.travelId,user));await reload();feedback.value='群聊邀请已发送，对方接受后才会加入。'})}
async function removeGroupMember(user:number){if(!confirm('移出群聊或撤回邀请？旅行成员身份不受影响。'))return;await action(async()=>{await checked(groupRemove(props.travelId,user));await reload()})}
async function startGroup(){await action(async()=>{await checked(groupJoin(props.travelId));await reload();enterGroup()})}
function enterGroup(){void router.push({path:'/me',query:{section:'messages',type:'travel',travelId:String(props.travelId)}})}
function goInvitations(){void router.push({path:'/me',query:{section:'messages',view:'invitations'}})}
watch(()=>props.travelId,()=>{generation++;release();closeComposer();overview.value=null;posts.value=[];photoErrors.value={};showHistory.value=false;showSettings.value=false;showGroups.value=false;eligible.value=true;loading.value=true;void reload()},{immediate:true})
onMounted(()=>{timer=window.setInterval(()=>{if(!busy.value&&!document.hidden)void reload()},15000)})
onBeforeUnmount(()=>{disposed=true;generation++;if(timer)clearInterval(timer);release()})
</script>
<style scoped>
.workspace{margin:22px 0;padding:clamp(18px,3vw,30px);background:#fff9fce8;border:1px solid #f5dce9;border-radius:25px;color:#84516c}.heading,.closed-row{display:flex;align-items:center;justify-content:space-between;gap:18px}.heading h2{font-size:24px;margin:7px 0}.heading small{letter-spacing:.1em;color:#c77d9f;font-size:11px}.heading p,.closed-row p{font-size:13px;color:#aa7b94;line-height:1.7;margin:8px 0}.workspace button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;border:1px solid transparent;border-radius:13px;padding:9px 15px;background:linear-gradient(125deg,#d87da5,#bf6995);color:#fff;cursor:pointer;font:inherit;font-size:13px;font-weight:650;white-space:nowrap;word-break:keep-all;writing-mode:horizontal-tb;box-shadow:0 5px 13px rgba(183,91,136,.14);transition:background .18s,transform .18s,box-shadow .18s}.workspace button.secondary{background:#fff5fa;color:#965773;border-color:#eac5d7;box-shadow:none}.workspace button.text-button{background:transparent;color:#aa6488;padding:7px}.workspace button:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 9px 19px rgba(183,91,136,.20)}.workspace button:active:not(:disabled){transform:translateY(0);box-shadow:0 2px 6px rgba(183,91,136,.15)}.workspace button:disabled{opacity:.52;cursor:not-allowed;box-shadow:none}.workspace button:focus-visible{outline:3px solid #ad648d;outline-offset:3px}.member-line,.member,.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.member-line{margin:20px 0}.member{font-size:13px}.member small,.post-author small{display:block;font-size:11px;color:#b28b9f;margin-top:3px}.toolbar{padding-top:16px;border-top:1px solid #f0dae5}.settings{display:flex;align-items:center;gap:15px;flex-wrap:wrap;padding:16px;background:#fff0f6;border-radius:17px;margin:15px 0;font-size:13px}.settings p{width:100%;margin:0;color:#a27b90;font-size:12px;line-height:1.7}.settings label{display:flex;gap:5px;align-items:center}.group-list{display:block}.group-person{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}.group-person>span{flex:1}.composer{margin:20px 0;background:white;padding:20px;border:1px solid #f2d9e6;border-radius:20px}.composer h3{margin:0 0 15px}.composer label{display:block;font-size:13px;margin:15px 0}.composer input:not([type=file]),.composer textarea{display:block;box-sizing:border-box;width:100%;padding:13px;margin-top:7px;border:1px solid #ebc9dc;border-radius:12px;font:inherit;color:#80516a;background:#fffbfd}.composer textarea{min-height:110px;resize:vertical}.composer footer{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.composer footer>span{font-size:12px;color:#ad8099}.tip{font-size:13px;color:#ae849b;line-height:1.7}.feedback{padding:12px 0 0;color:#a95c84;font-size:13px}.posts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px;margin-top:20px}.post{padding:18px;background:white;border:1px solid #f4e0ea;border-radius:18px;min-width:0}.post h3{font-size:16px;overflow-wrap:anywhere}.post-author{display:flex;align-items:center;gap:8px;font-size:13px}.status{margin-left:auto;color:#b4678e;font-size:12px}.shared-photo{width:100%;max-height:300px;object-fit:contain;border-radius:12px}.story{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;font-size:14px}.empty{text-align:center;font-size:14px;color:#b38d9f;padding:30px 10px}.review-summary{display:flex;align-items:center;gap:12px;font-size:13px;margin-top:20px}.album-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}.album-grid button{background:#fff1f7;border:2px solid transparent;color:#986b83;padding:6px}.album-grid button.selected{border-color:#cd77a1;background:#ffe1ee}.album-grid img{width:100%;height:90px;object-fit:cover;border-radius:8px}.album-grid span{display:block;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:650px){.heading,.closed-row{align-items:flex-start;flex-direction:column}.heading h2{font-size:20px}.workspace{padding:17px}.composer{padding:14px}.settings{gap:10px}}
</style>
