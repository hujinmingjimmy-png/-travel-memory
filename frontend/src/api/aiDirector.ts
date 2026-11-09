import { apiRequest, type ApiResult } from './request'

export interface DirectorShot {
  order: number
  type: string
  startMs: number
  durationMs: number
  pointId: number | null
  mediaId: number | null
  caption: string
  motion: string
}

export interface DirectorDraft {
  title: string
  style: 'CINEMATIC'
  aspectRatio: '16:9'
  durationMs: 30000
  mode: 'RULES' | 'AI_TEXT' | 'RULES_FALLBACK'
  notice: string
  shots: DirectorShot[]
}

export const generateDirectorDraft = (travelId: number, useAi: boolean): Promise<ApiResult<DirectorDraft>> =>
  apiRequest<DirectorDraft>(`/api/travels/${travelId}/ai-director/draft`, {
    method: 'POST', body: JSON.stringify({ useAi })
  })

// v2: one revisioned cloud draft for each owned travel.
export interface DirectorCloudDraft {
  revision: number
  updatedAt: string
  draft: DirectorDraft
}

export const getSavedDirectorDraft = (travelId: number): Promise<ApiResult<DirectorCloudDraft | null>> =>
  apiRequest<DirectorCloudDraft | null>(`/api/travels/${travelId}/ai-director/saved`)

export const saveDirectorDraft = (
  travelId: number,
  expectedRevision: number,
  draft: DirectorDraft
): Promise<ApiResult<DirectorCloudDraft>> =>
  apiRequest<DirectorCloudDraft>(`/api/travels/${travelId}/ai-director/saved`, {
    method: 'PUT',
    body: JSON.stringify({ expectedRevision, draft })
  })
