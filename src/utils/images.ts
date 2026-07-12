import type { InspectionImage } from '../types'
import { mapCenter } from '../data/mockData'

export function createImageFromFile(file: File): InspectionImage {
  const baseName = file.name.replace(/\.[^.]+$/, '')

  return {
    id: `upload-${crypto.randomUUID()}`,
    name: baseName,
    src: URL.createObjectURL(file),
    status: 'info',
    lat: mapCenter.lat + (Math.random() - 0.5) * 0.04,
    lng: mapCenter.lng + (Math.random() - 0.5) * 0.04,
    boxes: [],
    uploaded: true,
  }
}

export function isBlobUrl(src: string) {
  return src.startsWith('blob:')
}
