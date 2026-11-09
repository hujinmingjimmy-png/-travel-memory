import AMapLoader from '@amap/amap-jsapi-loader'

let amapPromise: Promise<any> | null = null

export function loadTravelAMap(): Promise<any> {
  if (amapPromise) return amapPromise

  const key = String(import.meta.env.VITE_AMAP_KEY || '').trim()
  const securityCode = String(
    import.meta.env.VITE_AMAP_SECURITY_CODE || ''
  ).trim()
  const useProxy = import.meta.env.MODE === 'release'

  if (!key) {
    return Promise.reject(
      new Error(
        useProxy ? '真实地图暂未配置，仍可查看旅行故事和照片。' : '缺少高德 Key，请配置 VITE_AMAP_KEY 后重启。'
      )
    )
  }

  if (!useProxy && !securityCode) {
    return Promise.reject(
      new Error(
        '缺少高德安全密钥：请在 .env.local 中填写 VITE_AMAP_SECURITY_CODE'
      )
    )
  }

  ;(window as any)._AMapSecurityConfig = useProxy
    ? { serviceHost: new URL('/_AMapService', window.location.origin).href }
    : { securityJsCode: securityCode }

  amapPromise = AMapLoader.load({
    key,
    version: '2.0',
    plugins: [
      'AMap.Scale',
      'AMap.ToolBar',
      'AMap.PlaceSearch'
    ]
  }).catch((cause: unknown) => {
    amapPromise = null

    console.error('高德地图加载失败：', cause)

    const detail =
      cause instanceof Error
        ? cause.message
        : String(cause || '未知错误')

    throw new Error(`高德地图加载失败：${detail}`)
  })

  return amapPromise
}
