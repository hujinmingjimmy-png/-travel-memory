export interface Submission {id:number;status:WorkspacePost['status']}
import { apiRequest, getToken, type ApiResult } from './request'

export interface WorkspaceMember {
  userId: number; username: string; nickname: string | null; avatar: string | null; role: 'OWNER' | 'COLLABORATOR'
}
export interface WorkspaceOverview {
  role: 'OWNER' | 'COLLABORATOR'
  members: WorkspaceMember[]
  groupState: string
  groupMembers: import('./socialHub').GroupMember[]
  hasHistory: boolean
  policy: { enabled: number | boolean;version:number;membersCanSubmit: number | boolean; reviewRequired: number | boolean }
}
export interface WorkspacePost {
  id: number; kind: 'STORY' | 'PHOTO'; title: string; body: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'
  authorId: number; createdAt: string; nickname: string | null; username: string; avatar: string | null; mimeType: string | null
}
const base = (trip: number) => `/api/collab/travels/${encodeURIComponent(String(trip))}/workspace`
async function checked<T>(promise: Promise<ApiResult<T>>): Promise<T> {
  const result = await promise
  if (result.code !== 200) throw Object.assign(new Error(result.message || '服务器未能完成操作'),{code:result.code})
  return result.data
}
const json = (value: unknown) => JSON.stringify(value)
export const workspaceApi = {
  overview: (trip:number) => checked(apiRequest<WorkspaceOverview>(base(trip))),
  posts: (trip:number) => checked(apiRequest<WorkspacePost[]>(`${base(trip)}/posts`)),
  policy: (trip:number,enabled:boolean,membersCanSubmit:boolean,reviewRequired:boolean,version:number) => checked(apiRequest<boolean>(`${base(trip)}/policy`,{method:'PUT',body:json({enabled,membersCanSubmit,reviewRequired,version})})),
  story: (trip:number,title:string,body:string,clientId:string) => checked(apiRequest<Submission>(`${base(trip)}/stories`,{method:'POST',body:json({title,body,clientId})})),
  photo: (trip:number,title:string,file:File,clientId:string) => {
    const form = new FormData(); form.append('title',title); form.append('file',file);form.append('clientId',clientId)
    return checked(apiRequest<Submission>(`${base(trip)}/photos`,{method:'POST',body:form}))
  },
  fromAlbum: (trip:number,mediaId:number,title:string,clientId:string)=>checked(apiRequest<Submission>(`${base(trip)}/photos/from-album`,{method:'POST',body:json({mediaId,title,clientId})})),
  remove: (trip:number,post:number)=>checked(apiRequest<boolean>(`${base(trip)}/posts/${post}`,{method:'DELETE'})),
  review: (trip:number,postId:number,approve:boolean) => checked(apiRequest<boolean>(`${base(trip)}/posts/${postId}/review`,{method:'POST',body:json({approve})}))
}
export async function workspacePhotoUrl(trip:number,postId:number): Promise<string> {
  const resp = await fetch(`${base(trip)}/posts/${postId}/photo`, {headers:{Authorization:`Bearer ${getToken() || ''}`}})
  if (!resp.ok) throw new Error('无法加载私密照片')
  const blob = await resp.blob()
  if (!['image/jpeg','image/png','image/webp'].includes(blob.type)) throw new Error('图片格式异常')
  return URL.createObjectURL(blob)
}
