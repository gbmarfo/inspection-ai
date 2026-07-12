import type {
  BoundingBox,
  ImageFolder,
  InspectionImage,
  InspectionReport,
  MlflowRegisteredModel,
  MlflowStatus,
  OverviewStats,
  ServiceRequest,
  ServiceRequestStatus,
  Asset,
  AssetDetail,
  InspectionSchedule,
  InspectionSchedulePriority,
  InspectionScheduleStatus,
  TrainingConfig,
  TrainingJob,
} from '../types'
import type { VisionModel } from '../data/visionModels'

const API = '/api'
const REQUEST_TIMEOUT_MS = 15_000

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${API}${path}`, { ...init, signal: controller.signal })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(error.error ?? 'Request failed')
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('API request timed out. Is the backend running on port 3001?')
    }
    throw err
  } finally {
    window.clearTimeout(timeout)
  }
}

export const api = {
  getOverview: () => request<OverviewStats>('/overview'),
  getImages: (options?: { folderId?: string | null; assetId?: string | null }) => {
    const params = new URLSearchParams()
    if (options?.assetId) {
      params.set('assetId', options.assetId)
    } else if (options?.folderId !== undefined) {
      params.set('folderId', options.folderId === null ? 'root' : options.folderId)
    }
    const query = params.toString()
    return request<InspectionImage[]>(`/images${query ? `?${query}` : ''}`)
  },
  getImage: (id: string) => request<InspectionImage>(`/images/${id}`),
  assignImageAsset: (id: string, assetId: string | null) =>
    request<InspectionImage>(`/images/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId }),
    }),
  uploadImages: (files: FileList, options?: { folderId?: string | null; assetId?: string | null }) => {
    const body = new FormData()
    Array.from(files).forEach((file) => body.append('files', file))
    if (options?.folderId !== undefined) {
      body.append('folderId', options.folderId ?? 'root')
    }
    if (options?.assetId) {
      body.append('assetId', options.assetId)
    }
    return request<InspectionImage[]>('/images/upload', { method: 'POST', body })
  },
  getFolders: (parentId?: string | null) => {
    const query =
      parentId === undefined ? '' : `?parentId=${parentId === null ? 'root' : encodeURIComponent(parentId)}`
    return request<ImageFolder[]>(`/folders${query}`)
  },
  getFolder: (id: string) =>
    request<ImageFolder & { breadcrumbs: { id: string; name: string }[] }>(`/folders/${id}`),
  createFolder: (name: string, parentId?: string | null) =>
    request<ImageFolder>('/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId: parentId ?? null }),
    }),
  renameFolder: (id: string, name: string) =>
    request<ImageFolder>(`/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  deleteFolder: (id: string) => request<void>(`/folders/${id}`, { method: 'DELETE' }),
  deleteImage: (id: string) => request<void>(`/images/${id}`, { method: 'DELETE' }),
  runInference: (id: string, modelId?: string) =>
    request<InspectionImage>(`/images/${id}/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: modelId ?? null }),
    }),
  createAnnotation: (imageId: string, box: BoundingBox) =>
    request<InspectionImage>(`/images/${imageId}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(box),
    }),
  updateAnnotation: (
    imageId: string,
    annotationId: string,
    patch: Partial<
      Pick<
        BoundingBox,
        'classification' | 'severity' | 'label' | 'status' | 'x' | 'y' | 'width' | 'height' | 'points'
      >
    >,
  ) =>
    request<InspectionImage>(`/images/${imageId}/annotations/${annotationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteAnnotation: (imageId: string, annotationId: string) =>
    request<InspectionImage>(`/images/${imageId}/annotations/${annotationId}`, { method: 'DELETE' }),
  getAssets: () => request<Asset[]>('/assets'),
  getAsset: (id: string) => request<AssetDetail>(`/assets/${id}`),
  getInspectionSchedules: () => request<InspectionSchedule[]>('/assets/inspection-schedules'),
  createInspectionSchedule: (payload: {
    assetId: string
    scheduledAt: string
    frequencyDays?: number
    priority?: InspectionSchedulePriority
    notes?: string
  }) =>
    request<InspectionSchedule>('/assets/inspection-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  updateInspectionSchedule: (
    id: string,
    patch: Partial<{
      scheduledAt: string
      frequencyDays: number
      priority: InspectionSchedulePriority
      status: InspectionScheduleStatus
      notes: string
    }>,
  ) =>
    request<InspectionSchedule>(`/assets/inspection-schedules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  importAssetsShapefile: (file: File, defaultType?: string) => {
    const body = new FormData()
    body.append('file', file)
    if (defaultType) {
      body.append('defaultType', defaultType)
    }
    return request<{ imported: number; assets: Asset[] }>('/assets/import/shapefile', {
      method: 'POST',
      body,
    })
  },
  extractVideoFrames: (id: string) =>
    request<{ extracted: number; images: InspectionImage[] }>(`/images/${id}/extract-frames`, {
      method: 'POST',
    }),
  getModelCatalog: () => request<VisionModel[]>('/models/catalog'),
  getDatasetStats: () =>
    request<{
      totalImages: number
      labeledImages: number
      totalAnnotations: number
      uploadedImages: number
      classCounts: Record<string, number>
      ready: boolean
    }>('/models/dataset'),
  getTrainingJobs: () => request<TrainingJob[]>('/models/training/jobs'),
  getTrainingJob: (id: string) => request<TrainingJob>(`/models/training/jobs/${id}`),
  startTraining: (modelId: string, config: TrainingConfig) =>
    request<TrainingJob>('/models/training/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId, config }),
    }),
  getMlflowStatus: () => request<MlflowStatus>('/models/mlflow/status'),
  getFinetuneCapabilities: () =>
    request<{
      ultralyticsAvailable: boolean
      supportedModels: string[]
      freezePresets: Array<{ value: number | null; label: string; hint: string }>
      guideUrl: string
    }>('/models/finetune/capabilities'),
  getMlflowRegisteredModels: () => request<MlflowRegisteredModel[]>('/models/mlflow/registered'),
  getReports: () => request<InspectionReport[]>('/reports'),
  generateReport: () => request<InspectionReport>('/reports/generate', { method: 'POST' }),
  getServiceRequests: () => request<ServiceRequest[]>('/service-requests'),
  createServiceRequest: (annotationId: string, imageId: string) =>
    request<ServiceRequest>('/service-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotationId, imageId }),
    }),
  bulkCreateServiceRequests: (imageId?: string, minSeverity = 'High') =>
    request<{ created: ServiceRequest[]; count: number; skipped: number }>('/service-requests/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId: imageId ?? null, minSeverity }),
    }),
  updateServiceRequest: (id: string, status: ServiceRequestStatus) =>
    request<ServiceRequest>(`/service-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
}
