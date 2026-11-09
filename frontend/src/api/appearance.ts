import { apiRequest, getToken, type ApiResult } from './request'

export interface Appearance {
  overlayPercent: number
  positionX: number
  positionY: number
  hasOverviewImage: boolean
}
const base='/api/profile/appearance'
export const getAppearance=():Promise<ApiResult<Appearance>>=>apiRequest<Appearance>(base)
export const updateAppearance=(v:Pick<Appearance,'overlayPercent'|'positionX'|'positionY'>):Promise<ApiResult<Appearance>>=>
  apiRequest<Appearance>(base,{method:'PUT',body:JSON.stringify(v)})
export const uploadOverviewImage=(file:File):Promise<ApiResult<Appearance>>=>{
  const form=new FormData();form.append('file',file)
  return apiRequest<Appearance>(`${base}/image`,{method:'POST',body:form})
}
export const removeOverviewImage=():Promise<ApiResult<Appearance>>=>apiRequest<Appearance>(`${base}/image`,{method:'DELETE'})
/** Private user image: never expose an unauthenticated URL to the DOM. */
export async function getOverviewBlobUrl():Promise<string>{
  const token=getToken();if(!token)throw new Error('请重新登录')
  const r=await fetch(`${base}/image`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'})
  if(!r.ok)throw new Error(`读取背景图失败 (${r.status})`)
  const type=r.headers.get('Content-Type')||''
  if(!/^image\/(jpeg|png)/.test(type))throw new Error('背景图片格式无效')
  return URL.createObjectURL(await r.blob())
}
