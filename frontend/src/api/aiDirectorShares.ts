import { apiRequest, type ApiResult } from './request'

export interface PublishedFilm {
  workId: string
  published: boolean
  shareToken: string | null
}

const ownerPath = (travelId: number) => `/api/travels/${travelId}/ai-director/library`

export const getPublishedFilms = (travelId: number): Promise<ApiResult<PublishedFilm[]>> =>
  apiRequest<PublishedFilm[]>(`${ownerPath(travelId)}/publications`)

export const publishFilm = (travelId: number, workId: string): Promise<ApiResult<PublishedFilm>> =>
  apiRequest<PublishedFilm>(`${ownerPath(travelId)}/works/${encodeURIComponent(workId)}/publish`, { method: 'POST' })

export const unpublishFilm = (travelId: number, workId: string): Promise<ApiResult<PublishedFilm>> =>
  apiRequest<PublishedFilm>(`${ownerPath(travelId)}/works/${encodeURIComponent(workId)}/publish`, { method: 'DELETE' })

export function filmShareUrl(token: string): string {
  return new URL(`/film/${encodeURIComponent(token)}`, window.location.origin).toString()
}

export interface PublicFilmInfo { title: string; fileBytes: number }
export const getPublicFilm = (token: string): Promise<ApiResult<PublicFilmInfo>> =>
  apiRequest<PublicFilmInfo>(`/api/public/films/${encodeURIComponent(token)}`, { auth: false })

export const publicVideoSrc = (token: string): string =>
  `/api/public/films/${encodeURIComponent(token)}/video`
