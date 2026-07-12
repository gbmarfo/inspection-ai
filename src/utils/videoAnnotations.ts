import type { BoundingBox } from '../types'

export type VideoLayout = {
  offsetX: number
  offsetY: number
  renderedWidth: number
  renderedHeight: number
}

export function getVideoLayout(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
): VideoLayout | null {
  if (!containerWidth || !containerHeight || !videoWidth || !videoHeight) return null

  const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight)
  const renderedWidth = videoWidth * scale
  const renderedHeight = videoHeight * scale

  return {
    offsetX: (containerWidth - renderedWidth) / 2,
    offsetY: (containerHeight - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
  }
}

export function clientToVideoPercent(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  layout: VideoLayout,
): { x: number; y: number } | null {
  const localX = clientX - containerRect.left - layout.offsetX
  const localY = clientY - containerRect.top - layout.offsetY

  if (
    localX < 0 ||
    localY < 0 ||
    localX > layout.renderedWidth ||
    localY > layout.renderedHeight
  ) {
    return null
  }

  return {
    x: (localX / layout.renderedWidth) * 100,
    y: (localY / layout.renderedHeight) * 100,
  }
}

export function boxToOverlayStyle(box: BoundingBox, layout: VideoLayout) {
  return {
    left: `${layout.offsetX + (box.x / 100) * layout.renderedWidth}px`,
    top: `${layout.offsetY + (box.y / 100) * layout.renderedHeight}px`,
    width: `${(box.width / 100) * layout.renderedWidth}px`,
    height: `${(box.height / 100) * layout.renderedHeight}px`,
  }
}

export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export const FRAME_TOLERANCE_MS = 500

export function isBoxVisibleAtTime(box: BoundingBox, currentTimeMs: number): boolean {
  if (box.timestampMs == null) return true
  return Math.abs(box.timestampMs - currentTimeMs) <= FRAME_TOLERANCE_MS
}
