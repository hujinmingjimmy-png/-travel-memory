import { apiRequest, type ApiResult } from './request'
export interface HubUser { userId: number; username: string; nickname: string | null; avatar: string | null; isFriend?: number }
export interface HubRequest extends HubUser { id:number; requesterId:number; receiverId:number; status:string; createdAt:string }
export interface HubNotice {id:number;eventType:string;title:string;actorId:number;actorNickname:string|null;actorUsername:string;actorAvatar:string|null;referenceId:number|null;travelId:number|null;isRead:number;createdAt:string}
export interface HubChat {type:'PRIVATE'|'TRAVEL_GROUP';travelId?:number;title?:string;id:number;otherId:number;username:string;nickname:string|null;avatar:string|null;latest:string|null;unread:number;updatedAt:string}
export interface HubMessage {
  id:number; senderId:number; body:string; createdAt:string; nickname?:string|null;username?:string;avatar?:string|null
  kind?: 'TEXT'|'IMAGE'; replyToId?:number|null; replyPreview?:string|null; revokedAt?:string|null
}
export interface HubCounts {notifications:number;friendRequests:number;messages:number}
const base='/api/social-hub'
const req = <T>(path:string, method='GET', body?:unknown):Promise<ApiResult<T>> => apiRequest<T>(base+path,{method,...(body===undefined?{}:{body:JSON.stringify(body)})})
export const hubSearch=(q:string)=>req<HubUser[]>(`/users?query=${encodeURIComponent(q)}`)
export const hubFriends=()=>req<HubUser[]>('/friends')
export const hubFollowers=()=>req<HubUser[]>('/followers')
export const hubFollowing=()=>req<HubUser[]>('/following')
export const hubRequests=()=>req<HubRequest[]>('/requests')
export const hubAsk=(username:string)=>req<boolean>('/requests','POST',{username})
export const hubDecide=(id:number,accept:boolean)=>req<boolean>(`/requests/${id}/decision`,'POST',{accept})
export const hubCancel=(id:number)=>req<boolean>(`/requests/${id}/cancel`,'POST')
export const hubUnfriend=(id:number)=>req<boolean>(`/friends/${id}`,'DELETE')
export const hubNotices=(page=1)=>req<HubNotice[]>(`/notifications?page=${page}`)
export const hubReadNotices=()=>req<boolean>('/notifications/read','POST')
export const hubCounts=()=>req<HubCounts>('/counts')
export const hubConversations=()=>req<HubChat[]>('/conversations')
export const hubMessages=(other:number,before=0)=>req<HubMessage[]>(`/conversations/${other}/messages?before=${before}`)
export const hubSend=(other:number,body:string,clientId:string)=>req<{delivered:boolean}>(`/conversations/${other}/messages`,'POST',{body,clientId})
export const hubRead=(other:number)=>req<boolean>(`/conversations/${other}/read`,'POST')

// TRAVEL_CHAT_V13: authenticated message media, quoted replies, recalls and search.
export const hubReply=(other:number,body:string,clientId:string,replyToId:number|null)=>
  req<{delivered:boolean}>(`/conversations/${other}/replies`,'POST',{body,clientId,replyToId})
export const hubRecall=(other:number,messageId:number)=>
  req<boolean>(`/conversations/${other}/messages/${messageId}/recall`,'POST')
export const hubSearchMessages=(other:number,q:string)=>
  req<HubMessage[]>(`/conversations/${other}/search?q=${encodeURIComponent(q)}`)
export const hubUploadImage=(other:number,file:File,clientId:string)=>{
  const body=new FormData();body.append('file',file);body.append('clientId',clientId)
  return apiRequest<{messageId:number;delivered:boolean}>(`${base}/conversations/${other}/images`,{method:'POST',body})
}
export const hubGetImage=async(other:number,messageId:number):Promise<Blob>=>{
  const {getToken}=await import('./request')
  const token=getToken()
  if(!token)throw new Error('请先登录')
  const response=await fetch(`${base}/conversations/${other}/images/${messageId}`,{
    headers:{Authorization:`Bearer ${token}`},cache:'no-store'
  })
  if(!response.ok)throw new Error(`图片读取失败 (${response.status})`)
  const type=response.headers.get('Content-Type')||''
  if(!/^image\/(jpeg|png|webp)/.test(type))throw new Error('服务器返回的不是图片')
  return response.blob()
}

export interface GroupInvitation {travelId:number;travelTitle:string;status:string;inviteVersion:number;nickname:string|null;username:string;invitedAt:string}
export interface GroupMember {userId:number;status:string;inviteVersion:number;nickname:string|null;username:string;avatar:string|null}
export const groupInvitations=()=>req<GroupInvitation[]>('/travel-groups/invitations')
export const groupDecision=(trip:number,version:number,accept:boolean)=>req<boolean>(`/travel-groups/${trip}/decision`,'POST',{version,accept})
export const groupInvite=(trip:number,userId:number)=>req<boolean>(`/travel-groups/${trip}/invitations`,'POST',{userId})
export const groupJoin=(trip:number)=>req<boolean>(`/travel-groups/${trip}/join`,'POST')
export const groupLeave=(trip:number)=>req<boolean>(`/travel-groups/${trip}/leave`,'POST')
export const groupRemove=(trip:number,user:number)=>req<boolean>(`/travel-groups/${trip}/members/${user}`,'DELETE')
export const groupMessages=(trip:number,before=0)=>req<HubMessage[]>(`/travel-groups/${trip}/messages?before=${before}`)
export const groupSend=(trip:number,body:string,clientId:string)=>req<number>(`/travel-groups/${trip}/messages`,'POST',{body,clientId})
export const groupRead=(trip:number,through:number)=>req<boolean>(`/travel-groups/${trip}/read`,'POST',{through})
