import { apiRequest } from "./request";
export interface SocialState {
  authorId: number;
  liked: boolean;
  following: boolean;
  likeCount: number;
}
export interface TravelComment {
  id: number;
  userId: number;
  author: string;
  content: string;
  createdAt: string;
}
export const socialState = (id: number) =>
  apiRequest<SocialState>(`/api/travels/${id}/social`);
export const likeTravel = (id: number, add: boolean) =>
  apiRequest<SocialState>(`/api/travels/${id}/like`, {
    method: add ? "PUT" : "DELETE",
  });
export const followAuthor = (id: number, add: boolean) =>
  apiRequest<boolean>(`/api/users/${id}/follow`, {
    method: add ? "PUT" : "DELETE",
  });
export const comments = (id: number, page: number) =>
  apiRequest<TravelComment[]>(`/api/travels/${id}/comments?page=${page}`);
export const postComment = (id: number, content: string) =>
  apiRequest<boolean>(`/api/travels/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
export const deleteComment = (id: number, cid: number) =>
  apiRequest<boolean>(`/api/travels/${id}/comments/${cid}`, {
    method: "DELETE",
  });
