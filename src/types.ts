export type LabelStatus = 'critical' | 'clear' | 'warning' | 'info'
export type Severity = 'Low' | 'Medium' | 'High' | 'Critical'

export type BoundingBox = {
  id: string
  label: string
  classification?: string
  severity?: Severity
  status: LabelStatus
  x: number
  y: number
  width: number
  height: number
  // Normalized polygon vertices as [x, y] percentages (0-100). When present the
  // annotation is a polygon; x/y/width/height still hold its bounding box.
  points?: [number, number][]
  aiGenerated?: boolean
  defaultSelected?: boolean
  faultHighlight?: boolean
  timestampMs?: number
}

export type MediaType = 'image' | 'video'

export type InspectionImage = {
  id: string
  name: string
  src: string
  status: LabelStatus
  lat: number
  lng: number
  boxes: BoundingBox[]
  uploaded?: boolean
  assetId?: string
  folderId?: string
  mediaType?: MediaType
  durationMs?: number
}

export type ImageFolder = {
  id: string
  name: string
  parentId: string | null
  createdAt: string
  imageCount: number
  childCount: number
}

export type NavTab =
  | 'Overview'
  | 'Assets'
  | 'Asset Classes'
  | 'Schedule'
  | 'Images'
  | 'Models'
  | 'AI Processing'
  | 'Reports'
  | 'Service Requests'

export type InspectionScheduleStatus = 'scheduled' | 'overdue' | 'completed' | 'cancelled' | 'none'
export type InspectionSchedulePriority = 'routine' | 'urgent'

export type InspectionSchedule = {
  id: string
  assetId: string
  assetName?: string
  assetType?: string
  scheduledAt: string
  frequencyDays?: number
  priority: InspectionSchedulePriority
  status: InspectionScheduleStatus
  notes?: string
  completedAt?: string
  createdAt: string
}

export type Asset = {
  id: string
  name: string
  type: string
  lat: number
  lng: number
  status: string
  imageCount: number
  classId?: string | null
  className?: string | null
  nextInspectionAt?: string
  inspectionStatus?: InspectionScheduleStatus
  inspectionPriority?: InspectionSchedulePriority
}

export type ChecklistItem = {
  id: string
  classId: string
  label: string
  description: string
  required: boolean
  sortOrder: number
  severityHint?: string | null
}

export type AssetClass = {
  id: string
  name: string
  description: string
  category: string
  createdAt: string
  itemCount: number
  assetCount: number
  checklist: ChecklistItem[]
}

export type AssetDetail = Asset & {
  images: InspectionImage[]
  inspectionSchedules?: InspectionSchedule[]
  assetClass?: AssetClass | null
  checklist?: ChecklistItem[]
}

export type OverviewStatusBreakdown = {
  status: LabelStatus
  label: string
  count: number
}

export type OverviewFinding = {
  label: string
  count: number
}

export type OverviewActivity = {
  id: string
  message: string
  at: string
  kind?: 'training' | 'upload' | 'request'
  priority?: ServiceRequestPriority
}

export type OverviewStats = {
  totalImages: number
  criticalImages: number
  clearImages: number
  warningImages: number
  infoImages: number
  totalAnnotations: number
  labeledImages: number
  assets: number
  activeTrainingJobs: number
  uploadedImages: number
  openServiceRequests: number
  urgentServiceRequests: number
  emergencyServiceRequests: number
  complianceRate: number
  inspectionCoverage: number
  healthScore: number
  executiveSummary: string
  statusBreakdown: OverviewStatusBreakdown[]
  topFindings: OverviewFinding[]
  recentActivity: OverviewActivity[]
  generatedAt: string
}

export type InspectionReport = {
  id: string
  title: string
  summary: string
  criticalCount: number
  imageCount: number
  createdAt: string
}

export type ServiceRequestStatus = 'open' | 'scheduled' | 'in_progress' | 'closed'
export type ServiceRequestPriority = 'routine' | 'urgent' | 'emergency'

export type ServiceRequest = {
  id: string
  annotationId: string
  imageId: string
  assetId?: string
  imageName?: string
  classification: string
  severity: Severity
  priority: ServiceRequestPriority
  status: ServiceRequestStatus
  title: string
  description?: string
  slaDays: number
  lat: number
  lng: number
  createdAt: string
}

export type TrainingConfig = {
  epochs: number
  batchSize: number
  imageSize: number
  learningRate: number
  trainSplit: number
  /** Ultralytics freeze depth: null = none, 10 = backbone, 11 = full backbone, 23 = head only */
  freeze: number | null
  patience: number
  optimizer: 'auto' | 'AdamW' | 'SGD'
  twoStage: boolean
  stage1Epochs: number
  stage2Epochs: number
  warmupEpochs: number
}

export type TrainingJobStatus = 'idle' | 'running' | 'completed' | 'failed'

export type TrainingJob = {
  id: string
  modelId: string
  modelName: string
  status: TrainingJobStatus
  progress: number
  currentEpoch: number
  totalEpochs: number
  startedAt: string
  engine?: 'ultralytics' | 'mock'
  freeze?: number | null
  twoStage?: boolean
  error?: string
  weightsPath?: string
  mlflowRunId?: string
  mlflowModelName?: string
  mlflowModelVersion?: string
  mlflowEnabled?: boolean
  ultralyticsAvailable?: boolean
  metrics?: {
    mAP: number
    precision: number
    recall: number
    loss: number
  }
}

export type MlflowRegisteredModel = {
  name: string
  latestVersion: string
  stage: string
  runId: string
  source: string
  description?: string
  updatedAt?: number
}

export type MlflowStatus = {
  enabled: boolean
  trackingUri: string
}

export const CLASSIFICATIONS = [
  'Insulator Porcelain Flashed',
  'Insulator Polymer Damaged',
  'Vegetation Encroachment',
  'Corrosion / Rust',
  'Hardware Loose',
  'Primary Conductor',
  'Crossarm Damage',
  'Structure Tag Missing',
] as const

export const SEVERITIES: Severity[] = ['Low', 'Medium', 'High', 'Critical']
