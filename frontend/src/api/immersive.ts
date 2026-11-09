import {
  apiRequest,
  type ApiResult
} from './request'

export interface ImmersiveScene {
  sceneId: number | null

  pointId: number
  travelId: number
  pointType: 'CUSTOM' | 'REAL'

  mediaId: number | null

  title: string
  subtitle: string | null
  content: string | null
  locationName: string | null
  travelDate: string | null

  sortOrder: number

  cameraScale: number
  moveDuration: number
  stayDuration: number
  easing:
    | 'ease-in-out'
    | 'ease-out'
    | 'linear'

  xRatio: number | null
  yRatio: number | null

  longitude: number | null
  latitude: number | null
}

export interface UpdateImmersiveSceneRequest {
  sortOrder: number
  cameraScale: number
  moveDuration: number
  stayDuration: number
  easing:
    | 'ease-in-out'
    | 'ease-out'
    | 'linear'
}

export const getImmersiveScenesApi = (
  travelId: number
): Promise<ApiResult<ImmersiveScene[]>> =>
  apiRequest<ImmersiveScene[]>(
    `/api/travels/${travelId}/immersive/scenes`,
    {
      method: 'GET'
    }
  )

export const updateImmersiveSceneApi = (
  travelId: number,
  pointId: number,
  data: UpdateImmersiveSceneRequest
): Promise<ApiResult<ImmersiveScene>> =>
  apiRequest<ImmersiveScene>(
    `/api/travels/${travelId}/immersive/scenes/${pointId}`,
    {
      method: 'PUT',
      body: JSON.stringify(data)
    }
  )
