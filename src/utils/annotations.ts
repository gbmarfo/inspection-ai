import {
  ShapeType,
  type ImageAnnotation,
  type Polygon,
  type PolygonGeometry,
  type Rectangle,
  type RectangleGeometry,
} from '@annotorious/react'
import type { AnnotationState, DrawingStyle } from '@annotorious/react'
import type { BoundingBox, Severity } from '../types'
import { CLASSIFICATIONS } from '../types'

export const SEVERITY_COLORS: Record<Severity, `#${string}`> = {
  Low: '#16a34a',
  Medium: '#d97706',
  High: '#ea580c',
  Critical: '#dc2626',
}

export function severityColor(box: Pick<BoundingBox, 'severity' | 'status'>): string {
  return SEVERITY_COLORS[box.severity ?? severityFromStatus(box.status)]
}

export function annotationSeverity(annotation: ImageAnnotation): Severity {
  return (getBodyValue(annotation, 'describing') as Severity) ?? 'Low'
}

// Single source of truth for the color of an annotation, so the box outline and
// the label chip always resolve to the same color for a given severity.
export function annotationColor(annotation: ImageAnnotation): `#${string}` {
  return SEVERITY_COLORS[annotationSeverity(annotation)] ?? SEVERITY_COLORS.Low
}

export function severityFromStatus(status: BoundingBox['status']): Severity {
  switch (status) {
    case 'critical':
      return 'Critical'
    case 'warning':
      return 'Medium'
    case 'info':
      return 'Low'
    default:
      return 'Low'
  }
}

function boxBodies(box: BoundingBox) {
  return [
    {
      id: `${box.id}-class`,
      annotation: box.id,
      purpose: 'tagging',
      value: box.classification ?? box.label,
    },
    {
      id: `${box.id}-severity`,
      annotation: box.id,
      purpose: 'describing',
      value: box.severity ?? severityFromStatus(box.status),
    },
    {
      id: `${box.id}-meta`,
      annotation: box.id,
      purpose: 'commenting',
      value: JSON.stringify({
        aiGenerated: box.aiGenerated ?? true,
        faultHighlight: box.faultHighlight ?? false,
      }),
    },
  ]
}

function polygonSelector(box: BoundingBox, naturalWidth: number, naturalHeight: number): Polygon {
  const points = (box.points ?? []).map(
    ([px, py]) => [(px / 100) * naturalWidth, (py / 100) * naturalHeight] as [number, number],
  )
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])

  return {
    type: ShapeType.POLYGON,
    geometry: {
      bounds: {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      },
      points,
    },
  } as Polygon
}

function rectangleSelector(box: BoundingBox, naturalWidth: number, naturalHeight: number): Rectangle {
  const x = (box.x / 100) * naturalWidth
  const y = (box.y / 100) * naturalHeight
  const w = (box.width / 100) * naturalWidth
  const h = (box.height / 100) * naturalHeight

  return {
    type: ShapeType.RECTANGLE,
    geometry: {
      bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h },
      x,
      y,
      w,
      h,
    },
  } as Rectangle
}

export function boxesToAnnotations(
  boxes: BoundingBox[],
  naturalWidth: number,
  naturalHeight: number,
): Partial<ImageAnnotation>[] {
  return boxes.map((box) => {
    const isPolygon = Array.isArray(box.points) && box.points.length >= 3
    const selector = isPolygon
      ? polygonSelector(box, naturalWidth, naturalHeight)
      : rectangleSelector(box, naturalWidth, naturalHeight)

    return {
      id: box.id,
      bodies: boxBodies(box),
      target: {
        annotation: box.id,
        selector,
      },
    } as Partial<ImageAnnotation>
  })
}

export function defaultBodiesForAnnotation(annotationId: string) {
  return [
    {
      id: `${annotationId}-class`,
      annotation: annotationId,
      purpose: 'tagging' as const,
      value: CLASSIFICATIONS[0],
    },
    {
      id: `${annotationId}-severity`,
      annotation: annotationId,
      purpose: 'describing' as const,
      value: 'Medium' as Severity,
    },
    {
      id: `${annotationId}-meta`,
      annotation: annotationId,
      purpose: 'commenting' as const,
      value: JSON.stringify({ aiGenerated: false, faultHighlight: false }),
    },
  ]
}

export function annotationToBox(
  annotation: ImageAnnotation,
  naturalWidth: number,
  naturalHeight: number,
): BoundingBox | null {
  const selector = annotation.target?.selector
  const classification = getBodyValue(annotation, 'tagging') ?? CLASSIFICATIONS[0]
  const severity = (getBodyValue(annotation, 'describing') as Severity) ?? 'Medium'
  const aiGenerated = getAnnotationMeta(annotation).aiGenerated

  if (selector?.type === ShapeType.POLYGON) {
    const geometry = (selector as Polygon).geometry as PolygonGeometry
    const points = geometry.points ?? []
    if (points.length < 3) return null

    const { minX, minY, maxX, maxY } = geometry.bounds
    return {
      id: annotation.id,
      label: classification,
      classification,
      severity,
      status: 'warning',
      x: (minX / naturalWidth) * 100,
      y: (minY / naturalHeight) * 100,
      width: ((maxX - minX) / naturalWidth) * 100,
      height: ((maxY - minY) / naturalHeight) * 100,
      points: points.map(
        ([px, py]) => [(px / naturalWidth) * 100, (py / naturalHeight) * 100] as [number, number],
      ),
      aiGenerated,
    }
  }

  if (selector?.type !== ShapeType.RECTANGLE) return null

  const geometry = (selector as Rectangle).geometry as RectangleGeometry
  const { x, y, w, h } = geometry

  return {
    id: annotation.id,
    label: classification,
    classification,
    severity,
    status: 'warning',
    x: (x / naturalWidth) * 100,
    y: (y / naturalHeight) * 100,
    width: (w / naturalWidth) * 100,
    height: (h / naturalHeight) * 100,
    aiGenerated,
  }
}

export function getBodyValue(annotation: ImageAnnotation, purpose: string): string | undefined {
  return annotation.bodies?.find((body) => body.purpose === purpose)?.value
}

// Detects whether an annotation's shape changed between two lifecycle snapshots,
// so we only persist geometry when the user actually moved/resized/reshaped it
// (and not on body-only edits like classification/severity).
export function geometryChanged(a: ImageAnnotation, b: ImageAnnotation): boolean {
  const ga = a.target?.selector?.geometry
  const gb = b.target?.selector?.geometry
  if (!ga || !gb) return false

  const pa = (ga as PolygonGeometry).points as number[][] | undefined
  const pb = (gb as PolygonGeometry).points as number[][] | undefined
  if (pa || pb) {
    if (!pa || !pb || pa.length !== pb.length) return true
    return pa.some((point, i) => point[0] !== pb[i][0] || point[1] !== pb[i][1])
  }

  const ba = ga.bounds
  const bb = gb.bounds
  return (
    ba.minX !== bb.minX || ba.minY !== bb.minY || ba.maxX !== bb.maxX || ba.maxY !== bb.maxY
  )
}

export function getAnnotationMeta(annotation: ImageAnnotation) {
  const raw = getBodyValue(annotation, 'commenting')
  if (!raw) return { aiGenerated: true, faultHighlight: false }

  try {
    return JSON.parse(raw) as { aiGenerated: boolean; faultHighlight: boolean }
  } catch {
    return { aiGenerated: true, faultHighlight: false }
  }
}

export function buzzAnnotationStyle(annotation: ImageAnnotation, state?: AnnotationState): DrawingStyle {
  const meta = getAnnotationMeta(annotation)
  const severity = annotationSeverity(annotation)
  const selected = state?.selected
  const showFaultFill = meta.faultHighlight || severity === 'Critical' || severity === 'High'
  const color = annotationColor(annotation)

  if (selected) {
    return {
      stroke: color,
      strokeWidth: 3,
      fill: color,
      fillOpacity: showFaultFill ? 0.4 : 0.18,
      strokeOpacity: 1,
    }
  }

  return {
    stroke: color,
    strokeWidth: 2,
    fill: color,
    fillOpacity: 0,
    strokeOpacity: 1,
  }
}

export function labelsVisibleFilter(showLabels: boolean) {
  return () => showLabels
}
