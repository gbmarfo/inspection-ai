import { useEffect, useMemo, useRef, useState } from 'react'
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

// Rebuilds the Annotorious annotations from app state whenever the underlying
// OpenSeadragon image finishes loading (initial load or navigation swap).
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
}: {
  imageId: string
  onCreateBox: (imageId: string, box: BoundingBox) => void | Promise<void>
}) {
  const anno = useAnnotator<AnnotoriousImageAnnotator>()
  const viewer = useViewer()

  useEffect(() => {
    if (!anno || !viewer) return

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
  }, [anno, viewer, imageId, onCreateBox])

  return null
}

// Persists shape edits (move/resize/reshape) back to the backend. Saves are
// debounced per annotation so dragging fires a single request when it settles,
// and body-only edits are ignored via geometryChanged().
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

// Positions the classification chips by converting each annotation's image-pixel
// coordinates into viewer-element coordinates, so labels track zoom and pan.
//
// Chips are derived from the LIVE annotation store (useAnnotations), not app
// state, so a chip exists only while its annotation is present. When any
// annotation is deleted (user or AI) it leaves the store, the hook re-renders,
// and its chip is dropped — even if app-state boxes haven't updated.
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
}: AnnotatedCanvasProps) {
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
      drawingEnabled={mode !== 'select'}
      drawingMode={mode === 'polygon' ? 'click' : 'drag'}
      tool={mode === 'polygon' ? 'polygon' : 'rectangle'}
      userSelectAction={UserSelectAction.EDIT}
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
      <CreateAnnotationListener imageId={imageId} onCreateBox={onCreateBox} />
      <AnnotationEditListener imageId={imageId} onUpdateBox={onUpdateBox} />
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

  useEffect(() => {
    setMode('select')
  }, [imageId])

  const handleModeChange = (nextMode: AnnotationMode) => {
    setMode(nextMode)
  }

  return (
    <div className="image-viewer">
      <AnnotationToolbar mode={mode} onModeChange={handleModeChange} />

      <button type="button" className="nav-arrow left" onClick={onPrevious} aria-label="Previous image">
        <ChevronLeft size={22} />
      </button>

      <div className={`image-stage${mode !== 'select' ? ' drawing-mode' : ''}`}>
        <Annotorious>
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
          />
        </Annotorious>
      </div>

      <button type="button" className="nav-arrow right" onClick={onNext} aria-label="Next image">
        <ChevronRight size={22} />
      </button>
    </div>
  )
}
