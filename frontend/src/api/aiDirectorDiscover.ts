import { apiRequest, type ApiResult } from './request'

export interface FilmDiscoveryStatus { workId: string; listed: boolean }

const base = (travelId: number) => `/api/travels/${travelId}/ai-director/library`

export function myDiscoverListings(travelId: number): Promise<ApiResult<string[]>> {
  return apiRequest<string[]>(`${base(travelId)}/discovery`)
}
export function includeFilmInDiscover(travelId: number, workId: string): Promise<ApiResult<FilmDiscoveryStatus>> {
  return apiRequest<FilmDiscoveryStatus>(`${base(travelId)}/works/${encodeURIComponent(workId)}/discover`, { method: 'POST' })
}
export function removeFilmFromDiscover(travelId: number, workId: string): Promise<ApiResult<FilmDiscoveryStatus>> {
  return apiRequest<FilmDiscoveryStatus>(`${base(travelId)}/works/${encodeURIComponent(workId)}/discover`, { method: 'DELETE' })
}
