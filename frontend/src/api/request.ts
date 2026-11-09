/**
 * ============================================================
 * 前端统一 API 请求工具
 * ============================================================
 *
 * 以后不要在每个页面里重复写：
 *
 * fetch(...)
 * Authorization...
 * JSON.parse...
 * 401 处理...
 *
 * 所有后端请求统一经过这里。
 */

export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

export interface RequestOptions
  extends RequestInit {

  /**
   * true：
   * 自动携带 JWT。
   *
   * false：
   * 不携带 JWT。
   *
   * 登录 / 注册必须传 false。
   */
  auth?: boolean
}

/**
 * 清除本地登录状态。
 */
export const clearLoginSession = () => {
  localStorage.removeItem(
    'travel_user'
  )

  localStorage.removeItem(
    'travel_token'
  )
}

/**
 * 获取当前 JWT。
 */
export const getToken = () => {
  return localStorage.getItem(
    'travel_token'
  )
}

export function redirectToLogin() {
  clearLoginSession()
  const { pathname, search, hash } = window.location
  if (pathname !== '/login') {
    const query = new URLSearchParams({ redirect: pathname + search + hash })
    window.location.replace(`/login?${query}`)
  }
}

/**
 * 统一请求函数。
 */
export async function apiRequest<T>(
  url: string,
  options: RequestOptions = {}
): Promise<ApiResult<T>> {

  const {
    auth = true,
    headers,
    ...fetchOptions
  } = options

  const requestHeaders =
    new Headers(headers || {})

  /**
   * 如果请求体不是 FormData，
   * 默认使用 JSON。
   *
   * 以后上传图片时使用 FormData，
   * 浏览器会自动生成 multipart boundary，
   * 所以不能手动设置 Content-Type。
   */
  if (
    fetchOptions.body
    && !(fetchOptions.body instanceof FormData)
    && !requestHeaders.has('Content-Type')
  ) {
    requestHeaders.set(
      'Content-Type',
      'application/json; charset=utf-8'
    )
  }

  /**
   * 需要身份认证的接口：
   *
   * Authorization:
   * Bearer eyJhbGciOi...
   */
  if (auth) {
    const token = getToken()

    if (token) {
      requestHeaders.set(
        'Authorization',
        `Bearer ${token}`
      )
    }
  }

  let response: Response

  try {
    response = await fetch(
      url,
      {
        ...fetchOptions,
        headers: requestHeaders
      }
    )
  } catch (error) {
    console.error(
      'API 网络请求失败：',
      error
    )

    throw new Error(
      '暂时无法连接服务器，请稍后重试'
    )
  }

  /**
   * 读取 JSON。
   */
  if (response.status === 429) {
    throw new Error('操作太频繁，请稍后再试')
  }

  let result: ApiResult<T>

  try {
    result = await response.json()
  } catch {
    throw new Error(
      `服务器返回格式错误，HTTP ${response.status}`
    )
  }

  /**
   * Spring Boot 当前业务异常可能仍以 HTTP 200 返回，
   * 所以除了 response.status，还要检查业务 code。
   */
  if (
    auth && (response.status === 401 || result.code === 401)
  ) {
    redirectToLogin()
  }

  return result
}
