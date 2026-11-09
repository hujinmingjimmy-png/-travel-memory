import {
  apiRequest,
  type ApiResult
} from './request'

/**
 * travel_project 前端类型。
 */
export interface TravelProject {
  id: number
  userId: number
  title: string
  subtitle: string | null
  description: string | null
  coverUrl: string | null
  backgroundUrl: string | null
  startDate: string | null
  endDate: string | null
  visibility: 'PRIVATE' | 'PUBLIC'
  isPublished: number
  viewCount: number
  likeCount: number
  createdAt: string | null
  updatedAt: string | null
}

/**
 * 创建旅行参数。
 *
 * 注意：
 * 没有 userId。
 *
 * 用户 ID 由 Spring Boot 从 JWT 中读取。
 */
export interface CreateTravelRequest {
  title: string
  subtitle?: string
  description?: string
  coverUrl?: string
  backgroundUrl?: string
  startDate?: string
  endDate?: string
  visibility: 'PRIVATE' | 'PUBLIC'
}

/**
 * 创建旅行。
 */
export const createTravelApi = (
  data: CreateTravelRequest
): Promise<ApiResult<number>> => {

  return apiRequest<number>(
    '/api/travels',
    {
      method: 'POST',
      body: JSON.stringify(data)
    }
  )
}

/**
 * 我的旅程。
 */
export const getMyTravelsApi = (
): Promise<ApiResult<TravelProject[]>> => {

  return apiRequest<TravelProject[]>(
    '/api/travels/my',
    {
      method: 'GET'
    }
  )
}

/**
 * 查询旅行详情。
 */
export const getTravelDetailApi = (
  travelId: number | string
): Promise<ApiResult<TravelProject>> => {

  return apiRequest<TravelProject>(
    `/api/travels/${travelId}`,
    {
      method: 'GET'
    }
  )
}

/**
 * 发布旅行。
 */
export const publishTravelApi = (
  travelId: number
): Promise<ApiResult<boolean>> => {

  return apiRequest<boolean>(
    `/api/travels/${travelId}/publish`,
    {
      method: 'POST'
    }
  )
}

/**
 * 首页随机获取一段公开且已发布的旅行。
 *
 * 当数据库暂时没有符合条件的数据时：
 *
 * data = null
 */
export const getRandomTravelApi = (
): Promise<ApiResult<TravelProject | null>> => {

  return apiRequest<TravelProject | null>(
    '/api/travels/home/random',
    {
      method: 'GET'
    }
  )
}
