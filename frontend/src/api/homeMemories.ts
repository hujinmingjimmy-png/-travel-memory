import { apiRequest, type ApiResult } from './request'

/**
 * ★★★★★【一段旅行 = 一个主题 = 主封面 + 背景画面】★★★★★
 * 来自当前 JWT 用户自己的旅行；PRIVATE、PUBLIC、草稿都可以出现在 /home。
 */
export interface HomeMemory {
  travelId: number
  title: string
  subtitle: string | null
  caption: string
  author: string
  visibility: 'PRIVATE' | 'PUBLIC'
  coverMediaId: number | null
  backgroundMediaId: number | null
  coverUrl: string | null
  backgroundUrl: string | null
}

export const getMyHomeMemories = (): Promise<ApiResult<HomeMemory[]>> =>
  apiRequest<HomeMemory[]>('/api/home/memories')
