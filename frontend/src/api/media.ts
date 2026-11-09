import { apiRequest, getToken, redirectToLogin, type ApiResult } from './request'

/** travel_media 的公开元数据，服务器真实磁盘路径不会返回到浏览器。 */
export interface TravelMedia {
  id: number
  travelId: number
  originalName: string | null
  mimeType: string
  fileSize: number
  caption: string | null
  sortOrder: number
  createdAt: string | null
}

const mediaBase = (travelId: number) => `/api/travels/${travelId}/media`

/** 列出当前用户有权限查看的照片。 */
export const getTravelMediaApi = (travelId: number): Promise<ApiResult<TravelMedia[]>> =>
  apiRequest<TravelMedia[]>(mediaBase(travelId))

/** 一次上传最多 8 张（JPG / PNG / WEBP，每张 <= 8MB）。 */
export const uploadTravelMediaApi = (
  travelId: number,
  files: File[]
): Promise<ApiResult<TravelMedia[]>> => {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  // ★★★★★ 不能手动设置 multipart Content-Type，浏览器要自动生成 boundary。
  return apiRequest<TravelMedia[]>(mediaBase(travelId), {
    method: 'POST',
    body: form
  })
}

/** 删除自己旅行中的一张照片。 */
export const deleteTravelMediaApi = (
  travelId: number,
  mediaId: number
): Promise<ApiResult<boolean>> =>
  apiRequest<boolean>(`${mediaBase(travelId)}/${mediaId}`, { method: 'DELETE' })

/**
 * 图片读取接口受到 JWT 保护，因此不能直接写：
 * <img src="/api/travels/1/media/5/file">
 * 普通 img 标签不能自动带 Authorization 请求头。
 *
 * 正确方法：用 fetch + JWT 取 Blob，再通过 URL.createObjectURL 返回给 img。
 * 使用结束后记得 URL.revokeObjectURL(blobUrl)，避免占用内存。
 */
export const createMediaBlobUrl = async (
  travelId: number,
  mediaId: number
): Promise<string> => {
  const token = getToken()
  if (!token) throw new Error('尚未登录，请重新登录')

  const response = await fetch(`${mediaBase(travelId)}/${mediaId}/file`, {
    headers: { Authorization: `Bearer ${token}` }
  })

  if (response.status === 401) {
    redirectToLogin()
    throw new Error('登录已过期')
  }

  if (!response.ok) throw new Error(`图片读取失败（HTTP ${response.status}）`)
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error('服务器未返回图片')
  return URL.createObjectURL(blob)
}
