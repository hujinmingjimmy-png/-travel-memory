import { apiRequest, getToken, type ApiResult } from './request'

export interface DirectorVideoWork {
  id: string
  title: string
  fileBytes: number
  createdAt: string
}

const base = (travelId: number) => `/api/travels/${travelId}/ai-director/library/works`

export const listDirectorWorks = (travelId: number): Promise<ApiResult<DirectorVideoWork[]>> =>
  apiRequest<DirectorVideoWork[]>(base(travelId))

export const saveDirectorWork = (travelId: number, jobId: string, title: string): Promise<ApiResult<DirectorVideoWork>> =>
  apiRequest<DirectorVideoWork>(base(travelId), {
    method: 'POST', body: JSON.stringify({ jobId, title })
  })

export const removeDirectorWork = (travelId: number, workId: string): Promise<ApiResult<boolean>> =>
  apiRequest<boolean>(`${base(travelId)}/${encodeURIComponent(workId)}`, { method: 'DELETE' })

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<FileSystemFileHandle>
}

/** Download after JWT auth, allowing save-to-folder on supported Edge/Chrome. */
export async function downloadDirectorWork(travelId: number, workId: string): Promise<void> {
  const token = getToken()
  if (!token) throw new Error('请先登录再下载')
  const name = `travel-memory-${travelId}-${workId.slice(0, 8)}.mp4`
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker
  let selected: FileSystemFileHandle | undefined
  if (picker) {
    try {
      selected = await picker.call(window, {
        suggestedName: name,
        types: [{ description: 'MP4 视频', accept: { 'video/mp4': ['.mp4'] } }]
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      throw e
    }
  }

  const response = await fetch(`${base(travelId)}/${encodeURIComponent(workId)}/file`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`)
  const blob = await response.blob()
  if (blob.size < 10000 || !blob.type.includes('video/mp4')) throw new Error('服务器返回的文件不是有效的 MP4')
  if (selected) {
    const writable = await selected.createWritable()
    try { await writable.write(blob); await writable.close() }
    catch (e) { try { await writable.abort() } catch { /* Ignore cleanup error */ } throw e }
    return
  }
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally { setTimeout(() => URL.revokeObjectURL(url), 60000) }
}
