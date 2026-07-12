from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import MLFLOW_TRACKING_URI
from ..data.vision_models import VISION_MODELS
from ..database import get_connection
from ..mappers import get_all_images
from ..services.mlflow_tracking import is_mlflow_enabled, list_recent_runs, list_registered_models
from ..services.finetune import MODEL_WEIGHTS, ultralytics_available
from ..services.training import map_training_job, start_training_job

router = APIRouter(prefix="/api/models", tags=["models"])


class TrainingStartBody(BaseModel):
    modelId: str
    config: dict


@router.get("/catalog")
def get_catalog():
    available = ultralytics_available()
    catalog = []
    for model in VISION_MODELS:
        entry = dict(model)
        weights = MODEL_WEIGHTS.get(model["id"])
        entry["finetuneSupported"] = bool(weights) and available
        entry["baseWeights"] = weights
        catalog.append(entry)
    return catalog


@router.get("/finetune/capabilities")
def finetune_capabilities():
    return {
        "ultralyticsAvailable": ultralytics_available(),
        "supportedModels": list(MODEL_WEIGHTS.keys()),
        "freezePresets": [
            {"value": None, "label": "None (full model)", "hint": "Large dataset or domain far from COCO"},
            {"value": 10, "label": "Backbone (freeze=10)", "hint": "Small dataset, similar domain — recommended"},
            {"value": 11, "label": "Full backbone (freeze=11)", "hint": "Freeze entire backbone including C2PSA"},
            {"value": 23, "label": "Head only (freeze=23)", "hint": "Very small dataset — only detection head trains"},
        ],
        "guideUrl": "https://docs.ultralytics.com/guides/finetuning-guide",
    }


@router.get("/dataset")
def get_dataset():
    conn = get_connection()
    try:
        images = get_all_images(conn)
        class_counts: dict[str, int] = {}
        labeled_images = 0
        total_annotations = 0

        for image in images:
            if image["boxes"]:
                labeled_images += 1
            total_annotations += len(image["boxes"])
            for box in image["boxes"]:
                key = box.get("classification") or box["label"]
                class_counts[key] = class_counts.get(key, 0) + 1

        return {
            "totalImages": len(images),
            "labeledImages": labeled_images,
            "totalAnnotations": total_annotations,
            "uploadedImages": sum(1 for i in images if i["uploaded"]),
            "classCounts": class_counts,
            "ready": labeled_images >= 2 and total_annotations >= 5,
        }
    finally:
        conn.close()


@router.get("/training/jobs")
def list_training_jobs():
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM training_jobs ORDER BY started_at DESC LIMIT 10"
        ).fetchall()
        return [map_training_job(row) for row in rows]
    finally:
        conn.close()


@router.get("/training/jobs/{job_id}")
def get_training_job(job_id: str):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM training_jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        return map_training_job(row)
    finally:
        conn.close()


@router.post("/training/jobs", status_code=201)
def create_training_job(body: TrainingStartBody):
    model = next((m for m in VISION_MODELS if m["id"] == body.modelId), None)
    if not model:
        raise HTTPException(status_code=400, detail="Unknown model")

    conn = get_connection()
    try:
        try:
            job = start_training_job(conn, model["id"], model["name"], body.config)
            return job
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    finally:
        conn.close()


@router.get("/mlflow/status")
def mlflow_status():
    return {
        "enabled": is_mlflow_enabled(),
        "trackingUri": MLFLOW_TRACKING_URI,
    }


@router.get("/mlflow/runs")
def mlflow_runs():
    return list_recent_runs()


@router.get("/mlflow/registered")
def mlflow_registered():
    return list_registered_models()
