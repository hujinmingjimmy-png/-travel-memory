import { apiRequest } from "./request";
export interface PlaybackSettings {
  transition: "fade" | "slide" | "zoom";
  musicUrl: string;
  volume: number;
  mapEnabled: boolean;
  fullOnStart: boolean;
}
export const playbackSettings = (id: number) =>
  apiRequest<PlaybackSettings>(`/api/travels/${id}/immersive/settings`);
export const savePlaybackSettings = (id: number, data: PlaybackSettings) =>
  apiRequest<boolean>(`/api/travels/${id}/immersive/settings`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
