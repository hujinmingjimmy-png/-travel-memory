import { apiRequest, getToken, type ApiResult } from './request'
import type { DiscoverTravel } from './discover'
export interface UserProfile{id:number;username:string;nickname:string|null;avatar:string|null}
export interface FollowedAuthor{id:number;username:string;displayName:string;avatar:string|null;publicTravelCount:number;followerCount:number}
export interface PublicUserProfile{id:number;username:string;displayName:string;avatar:string|null;publicTravelCount:number;followerCount:number;following:boolean;travels:DiscoverTravel[]}
export const getMyProfileApi=():Promise<ApiResult<UserProfile>>=>apiRequest<UserProfile>('/api/profile/me')
export const uploadAvatarApi=(file:File):Promise<ApiResult<UserProfile>>=>{const form=new FormData();form.append('file',file);return apiRequest<UserProfile>('/api/profile/avatar',{method:'POST',body:form})}
export const deleteAvatarApi=():Promise<ApiResult<UserProfile>>=>apiRequest<UserProfile>('/api/profile/avatar',{method:'DELETE'})
export const getFollowingAuthorsApi=():Promise<ApiResult<FollowedAuthor[]>>=>apiRequest<FollowedAuthor[]>('/api/users/following')
export const getPublicUserProfileApi=(userId:number):Promise<ApiResult<PublicUserProfile>>=>apiRequest<PublicUserProfile>(`/api/users/${userId}/public-profile`)
export function directAvatarUrl(avatar:string|null|undefined):string{const v=avatar?.trim()||'';return /^https:\/\//i.test(v)||v.startsWith('/images/')?v:''}
export async function createUserAvatarBlobUrl(userId:number):Promise<string>{const token=getToken();const response=await fetch(`/api/users/${userId}/avatar/file`,{headers:token?{Authorization:`Bearer ${token}`}:{}});if(response.status===404)return '';if(!response.ok)throw new Error(`头像读取失败，HTTP ${response.status}`);return URL.createObjectURL(await response.blob())}
