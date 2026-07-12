export type VisionModel = {
  id: string
  name: string
  family: string
  description: string
  task: 'Detection' | 'Segmentation' | 'Classification'
  params: string
  recommended: boolean
  finetuneSupported?: boolean
  baseWeights?: string | null
}

export const visionModels: VisionModel[] = [
  {
    id: 'powerai-detect-v2',
    name: 'PowerAI Detect v2',
    family: 'Buzz Solutions',
    description: 'Fine-tuned detector for transmission and distribution assets — insulators, hardware, vegetation.',
    task: 'Detection',
    params: '47M',
    recommended: true,
  },
  {
    id: 'yolov8l',
    name: 'YOLOv8 Large',
    family: 'Ultralytics',
    description: 'Fast single-stage detector. Strong baseline for pole and tower component localization.',
    task: 'Detection',
    params: '43M',
    recommended: false,
  },
  {
    id: 'rtdetr-x',
    name: 'RT-DETR-X',
    family: 'Baidu',
    description: 'Transformer-based real-time detector with high accuracy on small objects like insulators.',
    task: 'Detection',
    params: '76M',
    recommended: false,
  },
  {
    id: 'faster-rcnn-r50',
    name: 'Faster R-CNN R50',
    family: 'Detectron2',
    description: 'Two-stage detector suited for precise bounding boxes on complex lattice structures.',
    task: 'Detection',
    params: '41M',
    recommended: false,
  },
  {
    id: 'mask-rcnn-r50',
    name: 'Mask R-CNN R50',
    family: 'Detectron2',
    description: 'Instance segmentation for pixel-level fault regions such as flashover and corrosion.',
    task: 'Segmentation',
    params: '44M',
    recommended: false,
  },
]
