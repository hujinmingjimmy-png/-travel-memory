import { apiRequest, type ApiResult } from './request'
import type { TravelProject } from './travel'

export interface CollabMember {
  userId: number
  username: string
  nickname: string | null
  avatar: string | null
  role: 'OWNER' | 'COLLABORATOR'
}
export interface CollabTravelCard extends TravelProject {
  myRole: 'OWNER' | 'COLLABORATOR'
  members: CollabMember[]
  collabEnabled: boolean
  memberCount: number
}
export interface CollabInvite {
  id: number
  travelId: number
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELED'
  createdAt: string
  travelTitle: string
  inviterNickname: string | null
  inviterUsername: string
}
export interface SentInvite {
  id: number
  status: CollabInvite['status']
  createdAt: string
  userId: number
  username: string
  nickname: string | null
  avatar: string | null
}
const base = '/api/collab'
export const getCollabMyTravelsApi = (): Promise<ApiResult<CollabTravelCard[]>> =>
  apiRequest(`${base}/my-travels`)
export const getCollabInboxApi = (): Promise<ApiResult<CollabInvite[]>> =>
  apiRequest(`${base}/inbox`)
export const getSentInvitesApi = (id: number): Promise<ApiResult<SentInvite[]>> =>
  apiRequest(`${base}/travels/${id}/invites`)
export const sendCollabInviteApi = (id: number, username: string): Promise<ApiResult<boolean>> =>
  apiRequest(`${base}/travels/${id}/invite`, { method: 'POST', body: JSON.stringify({ username }) })
export const decideCollabInviteApi = (id: number, decision: 'ACCEPTED' | 'REJECTED'): Promise<ApiResult<boolean>> =>
  apiRequest(`${base}/invites/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) })
export const cancelCollabInviteApi = (id: number): Promise<ApiResult<boolean>> =>
  apiRequest(`${base}/invites/${id}/cancel`, { method: 'POST' })
export const removeCollabMemberApi = (travelId: number, memberId: number): Promise<ApiResult<boolean>> =>
  apiRequest(`${base}/travels/${travelId}/members/${memberId}`, { method: 'DELETE' })
export const leaveCollabTravelApi = (travelId: number): Promise<ApiResult<boolean>> =>
  apiRequest(`${base}/travels/${travelId}/leave`, { method: 'POST' })
export const getCollabPreviewApi = (travelId: number): Promise<ApiResult<CollabTravelCard>> =>
  apiRequest(`${base}/travels/${travelId}/preview`)
