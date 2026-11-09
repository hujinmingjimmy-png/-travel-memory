import { apiRequest, type ApiResult } from './request'

export interface ThemeArtSelection {
  coverMediaId: number | null
  backgroundMediaId: number | null
}

/** 当前登录用户读取自己这段旅行配置的主封面/背景。 */
export const getThemeArtApi = (travelId: number): Promise<ApiResult<ThemeArtSelection>> =>
  apiRequest<ThemeArtSelection>(`/api/travels/${travelId}/theme`)

/** 设置两张图片；服务端验证 JWT 创建者身份和两张照片所属旅行。 */
export const saveThemeArtApi = (
  travelId: number,
  selection: { coverMediaId: number; backgroundMediaId: number }
): Promise<ApiResult<boolean>> =>
  apiRequest<boolean>(`/api/travels/${travelId}/theme`, {
    method: 'PUT',
    body: JSON.stringify(selection)
  })
