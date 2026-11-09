import { apiRequest, getToken, type ApiResult } from './request'
import type { DirectorDraft } from './aiDirector'

export interface VideoJob {
  jobId: string
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  progress: number
  message: string
  downloadable: boolean
}

const base = (id: number) => `/api/travels/${id}/ai-director/video`

export const createVideoJob = (travelId: number, draft: DirectorDraft): Promise<ApiResult<VideoJob>> =>
  apiRequest<VideoJob>(`${base(travelId)}/jobs`, { method: 'POST', body: JSON.stringify(draft) })

/** The voice endpoint is opt-in; silent jobs keep the v4 route. */
export const createNarratedVideoJob = (travelId: number, draft: DirectorDraft, voice: string): Promise<ApiResult<VideoJob>> =>
  apiRequest<VideoJob>(`${base(travelId)}/jobs/voice`, {
    method: 'POST', body: JSON.stringify({ draft, voice, voiceover: true })
  })

export const getVideoJob = (travelId: number, jobId: string): Promise<ApiResult<VideoJob>> =>
  apiRequest<VideoJob>(`${base(travelId)}/jobs/${encodeURIComponent(jobId)}`)


type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{
      description: string
      accept: Record<string, string[]>
    }>
  }) => Promise<FileSystemFileHandle>
}

export async function downloadVideoFile(
  travelId: number,
  jobId: string
): Promise<void> {
  const token = getToken()
  if (!token) {
    throw new Error('请重新登录后下载')
  }

  const fileName = `travel-memory-${travelId}-30s.mp4`
  const pickerWindow = window as SavePickerWindow
  let selectedFile: FileSystemFileHandle | null = null

  // 优先让用户选择保存位置。
  // 必须在网络请求前调用，以保留按钮点击的用户授权。
  if (pickerWindow.showSaveFilePicker) {
    try {
      selectedFile = await pickerWindow.showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: 'MP4 视频',
          accept: { 'video/mp4': ['.mp4'] }
        }]
      })
    } catch (e) {
      // 用户取消保存，不算程序错误。
      if (e instanceof DOMException && e.name === 'AbortError') {
        return
      }
      throw e
    }
  }

  // 保留原有 JWT 认证下载。
  const response = await fetch(
    `/api/travels/${travelId}/ai-director/video/jobs/${encodeURIComponent(jobId)}/file`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )

  if (!response.ok) {
    throw new Error(`下载失败（HTTP ${response.status}）`)
  }

  const blob = await response.blob()

  if (!blob.size || !blob.type.includes('video/mp4')) {
    throw new Error('服务器未返回 MP4 文件')
  }

  // 已选择文件位置：直接保存到该位置。
  if (selectedFile) {
    const writer = await selectedFile.createWritable()

    try {
      await writer.write(blob)
      await writer.close()
    } catch (e) {
      try {
        await writer.abort()
      } catch {
        // 忽略清理阶段的次要错误
      }
      throw e
    }
    return
  }

  // 不支持文件选择 API 的浏览器：
  // 自动回退到普通下载方式。
  const url = URL.createObjectURL(blob)

  try {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName

    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}
