VISION_MODELS = [
    {"id": "powerai-detect-v2", "name": "PowerAI Detect v2", "family": "Buzz Solutions", "description": "Fine-tuned detector for transmission and distribution assets.", "task": "Detection", "params": "47M", "recommended": True},
    {"id": "yolov8l", "name": "YOLOv8 Large", "family": "Ultralytics", "description": "Fast single-stage detector for pole and tower components.", "task": "Detection", "params": "43M", "recommended": False},
    {"id": "rtdetr-x", "name": "RT-DETR-X", "family": "Baidu", "description": "Transformer-based real-time detector for small objects.", "task": "Detection", "params": "76M", "recommended": False},
    {"id": "faster-rcnn-r50", "name": "Faster R-CNN R50", "family": "Detectron2", "description": "Two-stage detector for lattice structures.", "task": "Detection", "params": "41M", "recommended": False},
    {"id": "mask-rcnn-r50", "name": "Mask R-CNN R50", "family": "Detectron2", "description": "Instance segmentation for fault regions.", "task": "Segmentation", "params": "44M", "recommended": False},
]
