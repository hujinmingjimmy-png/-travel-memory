import { apiRequest, type ApiResult } from './request'
export interface DiscoverTravel {id:number;title:string;subtitle:string|null;description:string|null;authorId:number;author:string|null;authorAvatar:string|null;coverMediaId:number|null;coverUrl:string|null;startDate:string|null;endDate:string|null;viewCount:number|null;likeCount:number|null;liked:boolean;following:boolean;createdAt:string|null}
export interface DiscoverPage {items:DiscoverTravel[];page:number;size:number;hasMore:boolean}
export type DiscoverSort='newest'|'popular'
export function getDiscoverTravels(options:{page?:number;size?:number;sort?:DiscoverSort;section?:'recommend'|'follow'|'likes';q?:string}={}):Promise<ApiResult<DiscoverPage>>{const p=new URLSearchParams({page:String(options.page??1),size:String(options.size??9),sort:options.sort??'newest',q:options.q??'',section:options.section??'recommend'});return apiRequest<DiscoverPage>(`/api/discover/travels?${p.toString()}`)}
