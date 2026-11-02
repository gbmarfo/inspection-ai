import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  Annotorious,
  OpenSeadragonAnnotator,
  OpenSeadragonAnnotationPopup,
  OpenSeadragonViewer,
  UserSelectAction,
  useAnnotations,
  useAnnotator,
  useViewer,
  type AnnotoriousImageAnnotator,
  type ImageAnnotation,
} from '@annotorious/react'
import '@annotorious/react/annotorious-react.css'
import '@annotorious/openseadragon/annotorious-openseadragon.css'
import OpenSeadragon from 'openseadragon'
import { ChevronLeft, ChevronRight, Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import { api } from '../api/client'
import { AnnotationEditorPopup } from './AnnotationEditorPopup'
import { AnnotationToolbar, type AnnotationMode } from './AnnotationToolbar'
import type { BoundingBox } from '../types'
import {
  annotationColor,
  annotationToBox,
  boxesToAnnotations,
  buzzAnnotationStyle,
  defaultBodiesForAnnotation,
  geometryChanged,
  getBodyValue,
  labelsVisibleFilter,
} from '../utils/annotations'

type SegmentClick = { x: number; y: number; label: 1 | -1 }

type SegmentPreview = {
  points: [number, number][]
  x: number
  y: number
  width: number
  height: number
  engine: string
  previewMaskBase64?: string
}

type AnnotatedCanvasProps = {
  src: string
  alt: string
  boxes: BoundingBox[]
  showLabels: boolean
  imageId: string
  mode: AnnotationMode
  focusAnnotationId?: string | null
  onFocusApplied?: () => void
  onCreateBox: (imageId: string, box: BoundingBox) => void | Promise<void>
  onUpdateBox: (
    imageId: string,
    annotationId: string,
    patch: AnnotationUpdatePatch,
  ) => void | Promise<void>
  onDeleteBox: (imageId: string, boxId: string) => void | Promise<void>
  onCreateServiceRequest?: (imageId: string, annotationId: string) => void | Promise<void>
  segmentClicks: SegmentClick[]
  segmentPreview: SegmentPreview | null
  onSegmentClick: (click: SegmentClick) => void
}

type AnnotationUpdatePatch = Partial<
  Pick<
    BoundingBox,
    'classification' | 'severity' | 'label' | 'status' | 'x' | 'y' | 'width' | 'height' | 'points'
  >
>

function contentSize(viewer: OpenSeadragon.Viewer): { width: number; height: number } | null {
  const item = viewer.world.getItemAt(0)
  if (!item) return null
  const size = item.getContentSize()
  if (!size.x || !size.y) return null
  return { width: size.x, height: size.y }
}

function AnnotationSync({
  boxes,
  imageId,
  focusAnnotationId,
  onFocusApplied,
}: {
  boxes: BoundingBox[]
  imageId: string
  focusAnnotationId?: string | null
  onFocusApplied?: () => void
}) {
  const anno = useAnnotator<AnnotoriousImageAnnotator>()
  const viewer = useViewer()
  const boxesRef = useRef(boxes)
  boxesRef.current = boxes
  const focusRef = useRef(focusAnnotationId)
  focusRef.current = focusAnnotationId

  useEffect(() => {
    if (!anno || !viewer) return

    const sync = () => {
      const size = contentSize(viewer)
      if (!size) return
      anno.cancelSelected()
      anno.setAnnotations(boxesToAnnotations(boxesRef.current, size.width, size.height), true)

      const focusId = focusRef.current
      if (focusId && boxesRef.current.some((box) => box.id === focusId)) {
        requestAnimationFrame(() => {
          if (anno.getAnnotationById(focusId)) {
            anno.setSelected(focusId)
            onFocusApplied?.()
          }
        })
      }
    }

    if (viewer.world.getItemCount() > 0) sync()

    viewer.addHandler('open', sync)
    viewer.world.addHandler('add-item', sync)
    return () => {
      viewer.removeHandler('open', sync)
      viewer.world.removeHandler('add-item', sync)
    }
  }, [anno, viewer, imageId, onFocusApplied])

  return null
}

function CreateAnnotationListener({
  imageId,
  onCreateBox,
  enabled,
}: {
  imageId: string
  onCreateBox: (imageId: string, box: BoundingBox) => void | Promise<void>
  enabled: boolean
}) {
  const anno = useAnnotator<AnnotoriousImageAnnotator>()
  const viewer = useViewer()

  useEffect(() => {
    if (!anno || !viewer || !enabled) return

    const handleCreate = (annotation: ImageAnnotation) => {
      const size = contentSize(viewer)
      if (!size) return

      const enriched = {
        ...annotation,
        bodies: defaultBodiesForAnnotation(annotation.id),
      }

      anno.updateAnnotation(enriched)
      anno.setSelected(annotation.id)

      const box = annotationToBox(enriched, size.width, size.height)
      if (box) onCreateBox(imageId, box)
    }

    anno.on('createAnnotation', handleCreate)
    return () => anno.off('createAnnotation', handleCreate)
  }, [anno, viewer, imageId, onCreateBox, enabled])

  return null
}

function AnnotationEditListener({
  imageId,
  onUpdateBox,
}: {
  imageId: string
  onUpdateBox: (
    imageId: string,
    annotationId: string,
    patch: AnnotationUpdatePatch,
  ) => void | Promise<void>
}) {
  const anno = useAnnotator<AnnotoriousImageAnnotator>()
  const viewer = useViewer()

  useEffect(() => {
    if (!anno || !viewer) return

    const timers = new Map<string, ReturnType<typeof setTimeout>>()

    const handleUpdate = (annotation: ImageAnnotation, previous: ImageAnnotation) => {
      if (!geometryChanged(annotation, previous)) return

      const size = contentSize(viewer)
      if (!size) return

      const box = annotationToBox(annotation, size.width, size.height)
      if (!box) return

      const patch: AnnotationUpdatePatch = {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      }
      if (box.points) patch.points = box.points

      const pending = timers.get(annotation.id)
      if (pending) clearTimeout(pending)
      timers.set(
        annotation.id,
        setTimeout(() => {
          timers.delete(annotation.id)
          void onUpdateBox(imageId, annotation.id, patch)
        }, 400),
      )
    }

    anno.on('updateAnnotation', handleUpdate)
    return () => {
      anno.off('updateAnnotation', handleUpdate)
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [anno, viewer, imageId, onUpdateBox])

  return null
}

type LabelPosition = { id: string; left: number; top: number; color: string; text: string }

function LabelOverlay({ boxes, showLabels }: { boxes: BoundingBox[]; showLabels: boolean }) {
  const viewer = useViewer()
  const annotations = useAnnotations<ImageAnnotation>()
  const [positions, setPositions] = useState<LabelPosition[]>([])

  useEffect(() => {
    if (!viewer || !showLabels) {
      setPositions([])
      return
    }

    const fallbackText = new Map(boxes.map((box) => [box.id, box.classification ?? box.label]))
    let frame = 0

    const measure = () => {
      const next: LabelPosition[] = []
      for (const annotation of annotations) {
        const geometry = annotation.target?.selector?.geometry
        const bounds = geometry?.bounds
        if (!bounds) continue

        const point = viewer.viewport.imageToViewerElementCoordinates(
          new OpenSeadragon.Point(bounds.minX, bounds.minY),
        )

        next.push({
          id: annotation.id,
          left: point.x,
          top: point.y,
          color: annotationColor(annotation),
          text: getBodyValue(annotation, 'tagging') ?? fallbackText.get(annotation.id) ?? '',
        })
      }

      setPositions(next)
    }

    const scheduleMeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }

    scheduleMeasure()

    viewer.addHandler('update-viewport', scheduleMeasure)
    viewer.addHandler('open', scheduleMeasure)
    viewer.world.addHandler('add-item', scheduleMeasure)
    window.addEventListener('resize', scheduleMeasure)

    return () => {
      cancelAnimationFrame(frame)
      viewer.removeHandler('update-viewport', scheduleMeasure)
      viewer.removeHandler('open', scheduleMeasure)
      viewer.world.removeHandler('add-item', scheduleMeasure)
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [viewer, annotations, boxes, showLabels])

  if (!viewer || !showLabels || positions.length === 0) return null

  return createPortal(
    <div className="annotation-label-overlay">
      {positions.map((position) => (
        <span
          key={position.id}
          className="annotation-label"
          style={{ left: position.left, top: position.top, backgroundColor: position.color }}
        >
          {position.text}
        </span>
      ))}
    </div>,
    viewer.element,
  )
}

function SelectionSync({ mode }: { mode: AnnotationMode }) {
  const anno = useAnnotator<AnnotoriousImageAnnotator>()

  useEffect(() => {
    if (!anno) return
    anno.cancelSelected()
  }, [anno, mode])

  return null
}

/** RITM-style click capture: left = positive, right / shift+left = negative.
 * Uses a top overlay so Annotorious SVG does not steal pointer events from the OSD canvas. */
function InteractiveSegmentListener({
  enabled,
  onSegmentClick,
}: {
  enabled: boolean
  onSegmentClick: (click: SegmentClick) => void
}) {
  const viewer = useViewer()
  const dragRef = useRef<{
    x: number
    y: number
    button: number
    shiftKey: boolean
    panning: boolean
  } | null>(null)

  const toPercent = useCallback(
    (clientX: number, clientY: number, negative: boolean): SegmentClick | null => {
      if (!viewer) return null
      const size = contentSize(viewer)
      if (!size) return null
      const rect = viewer.element.getBoundingClientRect()
      const viewerPoint = new OpenSeadragon.Point(clientX - rect.left, clientY - rect.top)
      const imagePoint = viewer.viewport.viewerElementToImageCoordinates(viewerPoint)
      const x = (imagePoint.x / size.width) * 100
      const y = (imagePoint.y / size.height) * 100
      if (x < 0 || y < 0 || x > 100 || y > 100) return null
      return {
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
        label: negative ? -1 : 1,
      }
    },
    [viewer],
  )

  if (!enabled || !viewer) return null

  return createPortal(
    <div
      className="segment-click-layer"
      onPointerDown={(event) => {
        if (event.button !== 0 && event.button !== 2) return
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
        dragRef.current = {
          x: event.clientX,
          y: event.clientY,
          button: event.button,
          shiftKey: event.shiftKey,
          panning: false,
        }
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag) return
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        if (!drag.panning && Math.hypot(dx, dy) > 6) drag.panning = true
        if (!drag.panning) return
        const delta = viewer.viewport.deltaPointsFromPixels(new OpenSeadragon.Point(-dx, -dy))
        viewer.viewport.panBy(delta)
        viewer.viewport.applyConstraints()
        drag.x = event.clientX
        drag.y = event.clientY
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current
        dragRef.current = null
        try {
          ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
        } catch {
          /* already released */
        }
        if (!drag || drag.panning) return
        if (drag.button !== 0 && drag.button !== 2) return
        const click = toPercent(event.clientX, event.clientY, drag.button === 2 || drag.shiftKey)
        if (!click) return
        event.preventDefault()
        event.stopPropagation()
        onSegmentClick(click)
      }}
      onPointerCancel={() => {
        dragRef.current = null
      }}
      onWheel={(event) => {
        event.preventDefault()
        const factor = event.deltaY > 0 ? 1 / 1.15 : 1.15
        viewer.viewport.zoomBy(factor)
        viewer.viewport.applyConstraints()
      }}
      onContextMenu={(event) => event.preventDefault()}
    />,
    viewer.element,
  )
}

function SegmentOverlay({
  clicks,
  preview,
}: {
  clicks: SegmentClick[]
  preview: SegmentPreview | null
}) {
  const viewer = useViewer()
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!viewer) return
    const refresh = () => setTick((value) => value + 1)
    viewer.addHandler('update-viewport', refresh)
    viewer.addHandler('open', refresh)
    return () => {
      viewer.removeHandler('update-viewport', refresh)
      viewer.removeHandler('open', refresh)
    }
  }, [viewer])

  if (!viewer) return null
  const size = contentSize(viewer)
  if (!size) return null

  const toViewer = (xPct: number, yPct: number) =>
    viewer.viewport.imageToViewerElementCoordinates(
      new OpenSeadragon.Point((xPct / 100) * size.width, (yPct / 100) * size.height),
    )

  const polygonPoints =
    preview?.points
      .map((point) => {
        const mapped = toViewer(point[0], point[1])
        return `${mapped.x},${mapped.y}`
      })
      .join(' ') ?? ''

  let maskStyle: CSSProperties | undefined
  if (preview?.previewMaskBase64) {
    const topLeft = toViewer(0, 0)
    const bottomRight = toViewer(100, 100)
    maskStyle = {
      left: topLeft.x,
      top: topLeft.y,
      width: Math.max(1, bottomRight.x - topLeft.x),
      height: Math.max(1, bottomRight.y - topLeft.y),
    }
  }

  return createPortal(
    <div className="segment-overlay" aria-hidden>
      {preview?.previewMaskBase64 && maskStyle && (
        <img
          className="segment-mask-preview"
          src={`data:image/png;base64,${preview.previewMaskBase64}`}
          alt=""
          style={maskStyle}
        />
      )}
      {polygonPoints && (
        <svg className="segment-preview-svg">
          <polygon points={polygonPoints} />
        </svg>
      )}
      {clicks.map((click, index) => {
        const point = toViewer(click.x, click.y)
        return (
          <span
            key={`${click.x}-${click.y}-${index}`}
            className={`segment-click-dot ${click.label > 0 ? 'positive' : 'negative'}`}
            style={{ left: point.x, top: point.y }}
          />
        )
      })}
    </div>,
    viewer.element,
  )
}

function ZoomControls() {
  const viewer = useViewer()

  if (!viewer) return null

  const zoom = (factor: number) => {
    viewer.viewport.zoomBy(factor)
    viewer.viewport.applyConstraints()
  }

  return (
    <div className="osd-zoom-controls">
      <button type="button" onClick={() => zoom(1.4)} aria-label="Zoom in">
        <ZoomIn size={16} />
      </button>
      <button type="button" onClick={() => zoom(1 / 1.4)} aria-label="Zoom out">
        <ZoomOut size={16} />
      </button>
      <button type="button" onClick={() => viewer.viewport.goHome()} aria-label="Reset view">
        <Maximize size={16} />
      </button>
    </div>
  )
}

function AnnotatedCanvas({
  src,
  boxes,
  showLabels,
  imageId,
  mode,
  focusAnnotationId,
  onFocusApplied,
  onCreateBox,
  onUpdateBox,
  onDeleteBox,
  onCreateServiceRequest,
  segmentClicks,
  segmentPreview,
  onSegmentClick,
}: AnnotatedCanvasProps) {
  const drawingEnabled = mode === 'rectangle' || mode === 'polygon'
  const osdOptions = useMemo(
    () =>
      ({
        tileSources: { type: 'image', url: src },
        showNavigationControl: false,
        showNavigator: false,
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
        minZoomImageRatio: 0.8,
        maxZoomPixelRatio: 6,
        visibilityRatio: 1,
        constrainDuringPan: true,
        animationTime: 0.4,
      }) as OpenSeadragon.Options,
    [src],
  )

  return (
    <OpenSeadragonAnnotator
      drawingEnabled={drawingEnabled}
      drawingMode={mode === 'polygon' ? 'click' : 'drag'}
      tool={mode === 'polygon' ? 'polygon' : 'rectangle'}
      userSelectAction={mode === 'segment' ? UserSelectAction.NONE : UserSelectAction.EDIT}
      style={buzzAnnotationStyle}
      filter={labelsVisibleFilter(showLabels)}
    >
      <OpenSeadragonViewer className="osd-viewer" options={osdOptions} />
      <OpenSeadragonAnnotationPopup
        arrow={false}
        popup={(props) => {
          const box = boxes.find((candidate) => candidate.id === props.annotation.id)
          return (
            <AnnotationEditorPopup
              {...props}
              fallbackClassification={box?.classification ?? box?.label}
              fallbackSeverity={box?.severity}
              onSaveAnnotation={(annotationId, patch) => onUpdateBox(imageId, annotationId, patch)}
              onDeleteUserAnnotation={(boxId) => onDeleteBox(imageId, boxId)}
              onCreateServiceRequest={
                onCreateServiceRequest
                  ? (annotationId) => onCreateServiceRequest(imageId, annotationId)
                  : undefined
              }
            />
          )
        }}
      />
      <LabelOverlay boxes={boxes} showLabels={showLabels} />
      <AnnotationSync
        boxes={boxes}
        imageId={imageId}
        focusAnnotationId={focusAnnotationId}
        onFocusApplied={onFocusApplied}
      />
      <SelectionSync mode={mode} />
      <CreateAnnotationListener
        imageId={imageId}
        onCreateBox={onCreateBox}
        enabled={drawingEnabled}
      />
      <AnnotationEditListener imageId={imageId} onUpdateBox={onUpdateBox} />
      <InteractiveSegmentListener enabled={mode === 'segment'} onSegmentClick={onSegmentClick} />
      {mode === 'segment' && <SegmentOverlay clicks={segmentClicks} preview={segmentPreview} />}
      <ZoomControls />
    </OpenSeadragonAnnotator>
  )
}

type ImageViewerProps = {
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

export function ImageViewer({
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
}: ImageViewerProps) {
  const [mode, setMode] = useState<AnnotationMode>('select')
  const [segmentClicks, setSegmentClicks] = useState<SegmentClick[]>([])
  const [segmentPreview, setSegmentPreview] = useState<SegmentPreview | null>(null)
  const [segmentBusy, setSegmentBusy] = useState(false)
  const [segmentError, setSegmentError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    setMode('select')
    setSegmentClicks([])
    setSegmentPreview(null)
    setSegmentError(null)
  }, [imageId])

  const runSegmentation = useCallback(
    async (clicks: SegmentClick[], previousPoints?: [number, number][]) => {
      if (clicks.length === 0) {
        setSegmentPreview(null)
        setSegmentError(null)
        return
      }
      const requestId = ++requestIdRef.current
      setSegmentBusy(true)
      setSegmentError(null)
      try {
        const result = await api.interactiveSegment(imageId, {
          clicks,
          previousPoints,
        })
        if (requestId !== requestIdRef.current) return
        setSegmentPreview({
          points: result.points,
          x: result.x,
          y: result.y,
          width: result.width,
          height: result.height,
          engine: result.engine,
          previewMaskBase64: result.previewMaskBase64,
        })
      } catch (err) {
        if (requestId !== requestIdRef.current) return
        setSegmentPreview(null)
        setSegmentError(err instanceof Error ? err.message : 'Interactive segmentation failed')
      } finally {
        if (requestId === requestIdRef.current) setSegmentBusy(false)
      }
    },
    [imageId],
  )

  const handleSegmentClick = useCallback(
    (click: SegmentClick) => {
      setSegmentClicks((current) => {
        const next = [...current, click]
        void runSegmentation(next, segmentPreview?.points)
        return next
      })
    },
    [runSegmentation, segmentPreview?.points],
  )

  const handleUndoSegmentClick = () => {
    setSegmentClicks((current) => {
      const next = current.slice(0, -1)
      void runSegmentation(next)
      return next
    })
  }

  const handleClearSegment = () => {
    requestIdRef.current += 1
    setSegmentClicks([])
    setSegmentPreview(null)
    setSegmentError(null)
    setSegmentBusy(false)
  }

  const handleAcceptSegment = async () => {
    if (!segmentPreview?.points?.length) return
    const box: BoundingBox = {
      id: `seg-${crypto.randomUUID().slice(0, 8)}`,
      label: 'Interactive Segment',
      classification: 'Primary Conductor',
      severity: 'Medium',
      status: 'warning',
      x: segmentPreview.x,
      y: segmentPreview.y,
      width: segmentPreview.width,
      height: segmentPreview.height,
      points: segmentPreview.points,
      aiGenerated: true,
      defaultSelected: true,
    }
    await onCreateBox(imageId, box)
    handleClearSegment()
    setMode('select')
  }

  const handleModeChange = (nextMode: AnnotationMode) => {
    if (nextMode !== 'segment') handleClearSegment()
    setMode(nextMode)
  }

  return (
    <div className="image-viewer">
      <AnnotationToolbar
        mode={mode}
        onModeChange={handleModeChange}
        segmentBusy={segmentBusy}
        segmentClickCount={segmentClicks.length}
        canAcceptSegment={Boolean(segmentPreview?.points?.length)}
        onAcceptSegment={() => void handleAcceptSegment()}
        onUndoSegmentClick={handleUndoSegmentClick}
        onClearSegment={handleClearSegment}
      />

      {mode === 'segment' && (
        <p className="segment-mode-banner">
          RITM interactive segmentation: left-click the object to include, right-click (or
          Shift+click) background to exclude. Accept saves a polygon annotation.
          {segmentPreview?.engine ? ` Engine: ${segmentPreview.engine}.` : ''}
        </p>
      )}
      {segmentError && <p className="segment-mode-error">{segmentError}</p>}

      <button type="button" className="nav-arrow left" onClick={onPrevious} aria-label="Previous image">
        <ChevronLeft size={22} />
      </button>

      <div
        className={`image-stage${mode === 'rectangle' || mode === 'polygon' ? ' drawing-mode' : ''}${mode === 'segment' ? ' segment-mode' : ''}`}
      >
        <Annotorious key={imageId}>
          <AnnotatedCanvas
            imageId={imageId}
            src={src}
            alt={alt}
            boxes={boxes}
            showLabels={showLabels}
            mode={mode}
            focusAnnotationId={focusAnnotationId}
            onFocusApplied={onFocusApplied}
            onCreateBox={onCreateBox}
            onUpdateBox={onUpdateBox}
            onDeleteBox={onDeleteBox}
            onCreateServiceRequest={onCreateServiceRequest}
            segmentClicks={segmentClicks}
            segmentPreview={segmentPreview}
            onSegmentClick={handleSegmentClick}
          />
        </Annotorious>
      </div>

      <button type="button" className="nav-arrow right" onClick={onNext} aria-label="Next image">
        <ChevronRight size={22} />
      </button>
    </div>
  )
}
