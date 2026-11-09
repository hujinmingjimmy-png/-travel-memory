import {
  apiRequest,
  type ApiResult
} from './request'

/**
 * 登录请求参数。
 */
export interface LoginRequest {
  username: string
  password: string
}

/**
 * 注册请求参数。
 */
export interface RegisterRequest {
  username: string
  password: string
  nickname?: string
}

/**
 * 后端登录成功返回的数据。
 */
export interface LoginUser {
  id: number
  username: string
  nickname: string | null
  avatar: string | null

  /**
   * Spring Boot JWT 登录接口新增字段。
   */
  token: string
}

/**
 * /api/auth/me 返回的数据。
 */
export interface CurrentUserTokenInfo {
  userId: number
  username: string
}

/**
 * 用户登录。
 *
 * 登录接口本身不需要 JWT，
 * 所以 auth: false。
 */
export const loginApi = (
  data: LoginRequest
): Promise<ApiResult<LoginUser>> => {

  return apiRequest<LoginUser>(
    '/api/auth/login',
    {
      method: 'POST',
      auth: false,
      body: JSON.stringify(data)
    }
  )
}

/**
 * 用户注册。
 *
 * 注册接口也不需要 JWT。
 */
export const registerApi = (
  data: RegisterRequest
): Promise<ApiResult<number>> => {

  return apiRequest<number>(
    '/api/auth/register',
    {
      method: 'POST',
      auth: false,
      body: JSON.stringify(data)
    }
  )
}

/**
 * JWT 验证接口。
 *
 * 这里没有写 Authorization。
 *
 * 因为 apiRequest 默认：
 *
 * auth = true
 *
 * 会自动读取 travel_token，
 * 然后添加：
 *
 * Authorization: Bearer <token>
 */
export const getMeApi = (
): Promise<ApiResult<CurrentUserTokenInfo>> => {

  return apiRequest<CurrentUserTokenInfo>(
    '/api/auth/me',
    {
      method: 'GET'
    }
  )
}
