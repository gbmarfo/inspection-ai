import type { BoundingBox, InspectionImage } from '../types'
import { CLASSIFICATIONS } from '../types'

export type DatasetStats = {
  totalImages: number
  labeledImages: number
  totalAnnotations: number
  uploadedImages: number
  classCounts: Record<string, number>
}

export function buildDatasetStats(
  images: InspectionImage[],
  userBoxesByImage: Record<string, BoundingBox[]>,
): DatasetStats {
  const classCounts = Object.fromEntries(CLASSIFICATIONS.map((label) => [label, 0])) as Record<string, number>

  let labeledImages = 0
  let totalAnnotations = 0

  for (const image of images) {
    const boxes = [...image.boxes, ...(userBoxesByImage[image.id] ?? [])]
    if (boxes.length > 0) labeledImages += 1
    totalAnnotations += boxes.length

    for (const box of boxes) {
      const label = box.classification ?? box.label
      if (label in classCounts) {
        classCounts[label] += 1
      }
    }
  }

  return {
    totalImages: images.length,
    labeledImages,
    totalAnnotations,
    uploadedImages: images.filter((image) => image.uploaded).length,
    classCounts,
  }
}

export function canStartTraining(stats: DatasetStats) {
  return stats.labeledImages >= 2 && stats.totalAnnotations >= 5
}
