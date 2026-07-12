import { PanelRightClose, PanelRightOpen, Sparkles } from 'lucide-react'
import type { ImageFolder, InspectionImage } from '../types'
import type { VisionModel } from '../data/visionModels'

type AIProcessingToolbarProps = {
  activeImage: InspectionImage
  activeIndex: number
  totalImages: number
  stats: { critical: number; clear: number }
  datasets: ImageFolder[]
  datasetId: string | null
  modelCatalog: VisionModel[]
  selectedModelId: string
  processing: boolean
  extractingFrames: boolean
  showMap: boolean
  onDatasetChange: (id: string | null) => void
  onModelChange: (id: string) => void
  onRunInference: () => void
  onExtractFrames: () => void
  onToggleMap: () => void
}

export function AIProcessingToolbar({
  activeImage,
  activeIndex,
  totalImages,
  stats,
  datasets,
  datasetId,
  modelCatalog,
  selectedModelId,
  processing,
  extractingFrames,
  showMap,
  onDatasetChange,
  onModelChange,
  onRunInference,
  onExtractFrames,
  onToggleMap,
}: AIProcessingToolbarProps) {
  const isVideo = activeImage.mediaType === 'video'
  const timestampedAnnotations = activeImage.boxes.filter((box) => box.timestampMs != null).length

  return (
    <div className="ai-toolbar">
      <div className="ai-toolbar-context">
        <span className="ai-toolbar-image">
          {isVideo && <span className="ai-media-badge">Video</span>}
          {activeImage.name}
        </span>
        <span className="ai-toolbar-position">
          {activeIndex + 1} / {totalImages}
        </span>
      </div>

      <div className="ai-toolbar-controls">
        <label className="ai-toolbar-field">
          <span className="sr-only">Dataset</span>
          <select
            value={datasetId ?? ''}
            onChange={(event) => onDatasetChange(event.target.value || null)}
            aria-label="Dataset"
          >
            <option value="">All images</option>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.name}
                {typeof dataset.imageCount === 'number' ? ` (${dataset.imageCount})` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="ai-toolbar-field">
          <span className="sr-only">Model</span>
          <select
            value={selectedModelId}
            onChange={(event) => onModelChange(event.target.value)}
            aria-label="Model"
          >
            {modelCatalog.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
                {model.recommended ? ' · Recommended' : ''}
              </option>
            ))}
          </select>
        </label>

        {isVideo ? (
          <button
            type="button"
            className="ai-run-btn ai-toolbar-run ai-extract-btn"
            onClick={onExtractFrames}
            disabled={extractingFrames || timestampedAnnotations === 0}
            title={
              timestampedAnnotations === 0
                ? 'Add timestamped annotations before extracting frames'
                : 'Save annotated frames as images in the dataset'
            }
          >
            {extractingFrames ? 'Extracting…' : 'Extract Frames'}
          </button>
        ) : (
          <button
            type="button"
            className="ai-run-btn ai-toolbar-run"
            onClick={onRunInference}
            disabled={processing || !selectedModelId}
          >
            <Sparkles size={15} />
            {processing ? 'Processing…' : 'Run AI'}
          </button>
        )}
      </div>

      <div className="ai-toolbar-meta">
        <span className="ai-stat-chip critical">{stats.critical} critical</span>
        <span className="ai-stat-chip clear">{stats.clear} clear</span>
        <button
          type="button"
          className={`ai-toolbar-map${showMap ? ' active' : ''}`}
          onClick={onToggleMap}
          aria-pressed={showMap}
          title={showMap ? 'Hide map' : 'Show map'}
        >
          {showMap ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          Map
        </button>
      </div>
    </div>
  )
}
