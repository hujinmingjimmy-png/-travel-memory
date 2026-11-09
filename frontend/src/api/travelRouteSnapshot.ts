import { apiRequest, type ApiResult } from './request'
import type { TravelRoute } from '@/utils/travelRoute'

export interface TravelRouteState {
  revision: number
  /** SHA-256 computed by the backend using current REAL point IDs/order/coordinates. */
  pointSignature: string
  cacheState: 'READY' | 'STALE' | 'NOT_BUILT'
  route: TravelRoute | null
}

export function getRouteSnapshotApi(travelId: number, signal?: AbortSignal): Promise<ApiResult<TravelRouteState>> {
  return apiRequest<TravelRouteState>(`/api/travels/${travelId}/route`, { signal })
}

export function saveRouteSnapshotApi(
  travelId: number, route: TravelRoute, pointSignature: string, expectedRevision: number, signal?: AbortSignal
): Promise<ApiResult<TravelRouteState>> {
  const persisted = {
    travelId: route.travelId, coordinateSystem: route.coordinateSystem, source: route.source,
    sourceSignature: route.sourceSignature, geometry: route.geometry, stopIds: route.stopIds,
    stopPointIndices: route.stopPointIndices, distanceMeters: route.distanceMeters
  }
  return apiRequest<TravelRouteState>(`/api/travels/${travelId}/route`, {
    method: 'PUT', signal,
    body: JSON.stringify({ expectedRevision, pointSignature, route: persisted })
  })
}
