import { apiRequest, type ApiResult } from './request'

export type TravelMapSourceType = 'IMAGE' | 'CARTOON_REAL'
export type CartoonMapStyle = 'SAKURA' | 'FRESH' | 'PAPER' | 'NIGHT'

export interface TravelMapSceneConfig {
  travelId: number
  sourceType: TravelMapSourceType
  centerLng: number | null
  centerLat: number | null
  zoom: number
  pitch: number
  rotation: number
  cartoonStyle: CartoonMapStyle
  southWestLng: number | null
  southWestLat: number | null
  northEastLng: number | null
  northEastLat: number | null
}

export type TravelMapSceneSaveRequest = Omit<TravelMapSceneConfig, 'travelId'>

const base = (travelId: number) => `/api/travels/${travelId}/map/scene`

export const defaultTravelMapScene = (travelId: number): TravelMapSceneConfig => ({
  travelId,
  sourceType: 'IMAGE',
  centerLng: 114.3055,
  centerLat: 30.5928,
  zoom: 11,
  pitch: 55,
  rotation: 0,
  cartoonStyle: 'SAKURA',
  southWestLng: null,
  southWestLat: null,
  northEastLng: null,
  northEastLat: null
})

export const getTravelMapSceneApi = (
  travelId: number
): Promise<ApiResult<TravelMapSceneConfig>> =>
  apiRequest<TravelMapSceneConfig>(base(travelId), { method: 'GET' })

export const saveTravelMapSceneApi = (
  travelId: number,
  body: TravelMapSceneSaveRequest
): Promise<ApiResult<TravelMapSceneConfig>> =>
  apiRequest<TravelMapSceneConfig>(base(travelId), {
    method: 'PUT',
    body: JSON.stringify(body)
  })
