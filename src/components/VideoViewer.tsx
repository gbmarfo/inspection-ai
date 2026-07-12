import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { AnnotationToolbar, type AnnotationMode } from './AnnotationToolbar'
import { VideoAnnotationEditor } from './VideoAnnotationEditor'
import { CLASSIFICATIONS, type BoundingBox } from '../types'
import { severityColor } from '../utils/annotations'
import {
  boxToOverlayStyle,
  clientToVideoPercent,
  formatTimestamp,
  getVideoLayout,
  isBoxVisibleAtTime,
} from '../utils/videoAnnotations'

type AnnotationUpdatePatch = Partial<
  Pick<
    BoundingBox,
    'classification' | 'severity' | 'label' | 'status' | 'x' | 'y' | 'width' | 'height' | 'points' | 'timestampMs'
  >
>

type VideoViewerProps = {
  imageId: string
  src: string
  alt: string
  boxes: BoundingBox[]
  showLabels: boolean
  onCreateBox: (imageId: string, box: BoundingBox) => void | Promise<void>
  onUpdateBox: (
    imageId: string,
    annotationId: string,
    patch: AnnotationUpdatePatch,
  ) => void | Promise<void>
  onDeleteBox: (imageId: string, boxId: string) => void | Promise<void>
  onCreateServiceRequest?: (imageId: string, annotationId: string) => void | Promise<void>
  focusAnnotationId?: string | null
  onFocusApplied?: () => void
  onPrevious: () => void
  onNext: () => void
}

type DrawState = {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

function normalizeRect(draw: DrawState) {
  const x1 = Math.min(draw.startX, draw.currentX)
  const y1 = Math.min(draw.startY, draw.currentY)
  const x2 = Math.max(draw.startX, draw.currentX)
  const y2 = Math.max(draw.startY, draw.currentY)
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

export function VideoViewer({
  imageId,
  src,
  alt,
  boxes,
  showLabels,
  onCreateBox,
  onUpdateBox,
  onDeleteBox,
  onCreateServiceRequest,
  focusAnnotationId,
  onFocusApplied,
  onPrevious,
  onNext,
}: VideoViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<AnnotationMode>('select')
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [layout, setLayout] = useState<ReturnType<typeof getVideoLayout>>(null)
  const [drawState, setDrawState] = useState<DrawState | null>(null)
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null)
  const [editorPosition, setEditorPosition] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    setMode('select')
    setSelectedBoxId(null)
    setEditorPosition(null)
    setDrawState(null)
    setCurrentTimeMs(0)
    setDurationMs(0)
    setIsPlaying(false)
  }, [imageId, src])

  useEffect(() => {
    if (!focusAnnotationId) return
    const box = boxes.find((candidate) => candidate.id === focusAnnotationId)
    const video = videoRef.current
    if (!box || !video) return

    if (box.timestampMs != null) {
      video.currentTime = box.timestampMs / 1000
      setCurrentTimeMs(box.timestampMs)
    }
    video.pause()
    setIsPlaying(false)
    setSelectedBoxId(box.id)
    onFocusApplied?.()
  }, [focusAnnotationId, boxes, onFocusApplied])

  const measureLayout = useCallback(() => {
    const video = videoRef.current
    const stage = stageRef.current
    if (!video || !stage || !video.videoWidth || !video.videoHeight) return
    setLayout(getVideoLayout(stage.clientWidth, stage.clientHeight, video.videoWidth, video.videoHeight))
  }, [])

  useEffect(() => {
    measureLayout()
    window.addEventListener('resize', measureLayout)
    return () => window.removeEventListener('resize', measureLayout)
  }, [measureLayout])

  const visibleBoxes = useMemo(
    () => boxes.filter((box) => isBoxVisibleAtTime(box, currentTimeMs)),
    [boxes, currentTimeMs],
  )

  const selectedBox = boxes.find((box) => box.id === selectedBoxId) ?? null
  const annotationMarkers = useMemo(
    () =>
      boxes
        .filter((box) => box.timestampMs != null && durationMs > 0)
        .map((box) => ({
          id: box.id,
          left: ((box.timestampMs ?? 0) / durationMs) * 100,
        })),
    [boxes, durationMs],
  )

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  const handleLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return
    setDurationMs(Math.round(video.duration * 1000))
    measureLayout()
  }

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return
    setCurrentTimeMs(Math.round(video.currentTime * 1000))
  }

  const handleSeek = (value: number) => {
    const video = videoRef.current
    if (!video || !durationMs) return
    const nextTime = (value / 100) * (durationMs / 1000)
    video.currentTime = nextTime
    setCurrentTimeMs(Math.round(nextTime * 1000))
  }

  const closeEditor = () => {
    setSelectedBoxId(null)
    setEditorPosition(null)
  }

  const startDrawing = (clientX: number, clientY: number) => {
    const stage = stageRef.current
    const video = videoRef.current
    if (!stage || !layout || mode !== 'rectangle') return

    video?.pause()
    setIsPlaying(false)

    const point = clientToVideoPercent(clientX, clientY, stage.getBoundingClientRect(), layout)
    if (!point) return

    setDrawState({
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    })
  }

  const updateDrawing = (clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (!stage || !layout || !drawState) return

    const point = clientToVideoPercent(clientX, clientY, stage.getBoundingClientRect(), layout)
    if (!point) return

    setDrawState((current) =>
      current
        ? {
            ...current,
            currentX: point.x,
            currentY: point.y,
          }
        : current,
    )
  }

  const finishDrawing = () => {
    if (!drawState) return

    const rect = normalizeRect(drawState)
    setDrawState(null)

    if (rect.width < 1 || rect.height < 1) return

    const video = videoRef.current
    const timestampMs = video ? Math.round(video.currentTime * 1000) : 0
    const id = `manual-${crypto.randomUUID().slice(0, 8)}`

    const box: BoundingBox = {
      id,
      label: CLASSIFICATIONS[0],
      classification: CLASSIFICATIONS[0],
      severity: 'Medium',
      status: 'warning',
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      timestampMs,
      aiGenerated: false,
    }

    void onCreateBox(imageId, box)
    setSelectedBoxId(id)
  }

  const handleBoxClick = (box: BoundingBox, event: React.MouseEvent) => {
    event.stopPropagation()
    if (mode !== 'select') return

    const stage = stageRef.current
    if (!stage) return

    setSelectedBoxId(box.id)
    const rect = stage.getBoundingClientRect()
    setEditorPosition({
      left: event.clientX - rect.left + 12,
      top: event.clientY - rect.top + 12,
    })
  }

  const draftRect = drawState ? normalizeRect(drawState) : null

  return (
    <div className="image-viewer video-viewer">
      <AnnotationToolbar
        mode={mode}
        modes={['select', 'rectangle']}
        onModeChange={(nextMode) => {
          setMode(nextMode)
          closeEditor()
          if (nextMode !== 'select') {
            videoRef.current?.pause()
            setIsPlaying(false)
          }
        }}
      />

      <button type="button" className="nav-arrow left" onClick={onPrevious} aria-label="Previous item">
        <ChevronLeft size={22} />
      </button>

      <div className={`image-stage video-stage${mode !== 'select' ? ' drawing-mode' : ''}`} ref={stageRef}>
        <video
          ref={videoRef}
          className="video-player"
          src={src}
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onClick={undefined}
        >
          <track kind="captions" />
        </video>

        {layout && (
          <div
            className="video-annotation-layer"
            onClick={(event) => {
              if (mode === 'select' && event.target === event.currentTarget) {
                togglePlayback()
              }
            }}
            onMouseDown={(event) => {
              if (mode !== 'rectangle') return
              event.preventDefault()
              startDrawing(event.clientX, event.clientY)
            }}
            onMouseMove={(event) => {
              if (!drawState) return
              updateDrawing(event.clientX, event.clientY)
            }}
            onMouseUp={() => finishDrawing()}
            onMouseLeave={() => {
              if (drawState) finishDrawing()
            }}
          >
            {visibleBoxes.map((box) => {
              const style = boxToOverlayStyle(box, layout)
              const color = severityColor(box)
              const selected = selectedBoxId === box.id
              return (
                <button
                  key={box.id}
                  type="button"
                  className={`video-annotation-box${selected ? ' selected' : ''}`}
                  style={{
                    ...style,
                    borderColor: color,
                    backgroundColor: selected ? `${color}33` : 'transparent',
                  }}
                  onClick={(event) => handleBoxClick(box, event)}
                  aria-label={box.classification ?? box.label}
                >
                  {showLabels && (
                    <span className="video-annotation-label" style={{ backgroundColor: color }}>
                      {box.classification ?? box.label}
                      {box.timestampMs != null && (
                        <em>{formatTimestamp(box.timestampMs)}</em>
                      )}
                    </span>
                  )}
                </button>
              )
            })}

            {draftRect && layout && (
              <div
                className="video-annotation-box draft"
                style={{
                  left: `${layout.offsetX + (draftRect.x / 100) * layout.renderedWidth}px`,
                  top: `${layout.offsetY + (draftRect.y / 100) * layout.renderedHeight}px`,
                  width: `${(draftRect.width / 100) * layout.renderedWidth}px`,
                  height: `${(draftRect.height / 100) * layout.renderedHeight}px`,
                }}
              />
            )}

            {selectedBox && editorPosition && (
              <div
                className="video-annotation-editor-anchor"
                style={{ left: editorPosition.left, top: editorPosition.top }}
              >
                <VideoAnnotationEditor
                  box={selectedBox}
                  onSave={(annotationId, patch) => onUpdateBox(imageId, annotationId, patch)}
                  onDelete={(boxId) => onDeleteBox(imageId, boxId)}
                  onClose={closeEditor}
                  onCreateServiceRequest={
                    onCreateServiceRequest
                      ? (annotationId) => onCreateServiceRequest(imageId, annotationId)
                      : undefined
                  }
                />
              </div>
            )}
          </div>
        )}

        <div className="video-controls">
          <button type="button" className="video-play-btn" onClick={togglePlayback} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <span className="video-time">
            {formatTimestamp(currentTimeMs)} / {formatTimestamp(durationMs)}
          </span>
          <div className="video-scrubber">
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={durationMs ? (currentTimeMs / durationMs) * 100 : 0}
              onChange={(event) => handleSeek(Number(event.target.value))}
              aria-label="Seek video"
            />
            <div className="video-scrubber-markers">
              {annotationMarkers.map((marker) => (
                <span key={marker.id} className="video-marker" style={{ left: `${marker.left}%` }} />
              ))}
            </div>
          </div>
          <span className="video-frame-label">Frame annotations</span>
        </div>
      </div>

      <button type="button" className="nav-arrow right" onClick={onNext} aria-label="Next item">
        <ChevronRight size={22} />
      </button>

      <span className="sr-only">{alt}</span>
    </div>
  )
}
