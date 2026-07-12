"""Ultralytics YOLO fine-tuning following the official fine-tuning guide.

Reference: https://docs.ultralytics.com/guides/finetuning-guide
- Load pretrained .pt weights (not .yaml) for transfer learning
- freeze backbone layers for small datasets
- patience for early stopping
- optional two-stage: freeze backbone then unfreeze with lower lr
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from ..config import DATA_DIR
from ..database import get_connection
from .mlflow_tracking import finish_training_run, log_epoch_metrics
from .yolo_dataset import export_yolo_dataset

# Keep Ultralytics settings writable inside the project data dir
os.environ.setdefault("YOLO_CONFIG_DIR", str(DATA_DIR / "ultralytics"))
os.environ.setdefault("MPLCONFIGDIR", str(DATA_DIR / "matplotlib"))

# Map catalog model ids → Ultralytics pretrained weights
MODEL_WEIGHTS: dict[str, str] = {
    "powerai-detect-v2": "yolov8n.pt",
    "yolov8l": "yolov8l.pt",
    "rtdetr-x": "rtdetr-l.pt",
}

# Models without an Ultralytics detection checkpoint fall back to mock training
ULTRALYTICS_SUPPORTED = set(MODEL_WEIGHTS.keys())


def ultralytics_available() -> bool:
    try:
        import ultralytics  # noqa: F401

        return True
    except ImportError:
        return False


def supports_finetune(model_id: str) -> bool:
    return model_id in ULTRALYTICS_SUPPORTED and ultralytics_available()


def _normalize_config(config: dict[str, Any]) -> dict[str, Any]:
    freeze = config.get("freeze")
    if freeze in (None, "", "none", "None"):
        freeze_value: Optional[int] = None
    else:
        freeze_value = int(freeze)

    return {
        "epochs": int(config.get("epochs", 50)),
        "batchSize": int(config.get("batchSize", 16)),
        "imageSize": int(config.get("imageSize", 640)),
        "learningRate": float(config.get("learningRate", 0.001)),
        "trainSplit": int(config.get("trainSplit", 80)),
        "freeze": freeze_value,
        "patience": int(config.get("patience", 15)),
        "optimizer": str(config.get("optimizer", "AdamW")),
        "twoStage": bool(config.get("twoStage", False)),
        "stage1Epochs": int(config.get("stage1Epochs", 20)),
        "stage2Epochs": int(config.get("stage2Epochs", 30)),
        "warmupEpochs": float(config.get("warmupEpochs", 3.0)),
    }


def _update_job(
    job_id: str,
    *,
    current_epoch: Optional[int] = None,
    progress: Optional[int] = None,
    status: Optional[str] = None,
    metrics: Optional[dict[str, float]] = None,
    mlflow_model_name: Optional[str] = None,
    mlflow_model_version: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM training_jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            return

        fields: list[str] = []
        values: list[Any] = []

        if current_epoch is not None:
            fields.append("current_epoch = ?")
            values.append(current_epoch)
        if progress is not None:
            fields.append("progress = ?")
            values.append(progress)
        if status is not None:
            fields.append("status = ?")
            values.append(status)
            if status in ("completed", "failed"):
                fields.append("completed_at = ?")
                values.append(datetime.now(timezone.utc).isoformat())
        if metrics is not None:
            fields.append("metrics_json = ?")
            values.append(json.dumps(metrics))
        if mlflow_model_name is not None:
            fields.append("mlflow_model_name = ?")
            values.append(mlflow_model_name)
        if mlflow_model_version is not None:
            fields.append("mlflow_model_version = ?")
            values.append(mlflow_model_version)

        config = json.loads(row["config_json"])
        if error is not None:
            config["error"] = error
            fields.append("config_json = ?")
            values.append(json.dumps(config))

        if not fields:
            return

        values.append(job_id)
        conn.execute(f"UPDATE training_jobs SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    finally:
        conn.close()


def _extract_metrics(results: Any) -> dict[str, float]:
    metrics = {"mAP": 0.0, "precision": 0.0, "recall": 0.0, "loss": 0.0}
    try:
        box = getattr(results, "box", None)
        if box is not None:
            map50 = float(getattr(box, "map50", 0) or 0)
            metrics["mAP"] = round(map50, 4)
            metrics["precision"] = round(float(getattr(box, "mp", 0) or 0), 4)
            metrics["recall"] = round(float(getattr(box, "mr", 0) or 0), 4)
        results_dict = getattr(results, "results_dict", None) or {}
        for key, value in results_dict.items():
            lowered = str(key).lower()
            if "loss" in lowered and isinstance(value, (int, float)):
                metrics["loss"] = round(float(value), 4)
                break
    except Exception:
        pass
    return metrics


def _run_ultralytics_train(
    job_id: str,
    model_id: str,
    model_name: str,
    config: dict[str, Any],
    mlflow_run_id: Optional[str],
) -> None:
    from ultralytics import YOLO

    cfg = _normalize_config(config)
    weights = MODEL_WEIGHTS[model_id]
    project_dir = DATA_DIR / "yolo-runs" / job_id
    project_dir.mkdir(parents=True, exist_ok=True)

    conn = get_connection()
    try:
        dataset = export_yolo_dataset(conn, job_id, train_split=cfg["trainSplit"])
    finally:
        conn.close()

    config["dataset"] = {
        "dataYaml": dataset["dataYaml"],
        "classNames": dataset["classNames"],
        "trainImages": dataset["trainImages"],
        "valImages": dataset["valImages"],
    }
    conn = get_connection()
    try:
        row = conn.execute("SELECT config_json FROM training_jobs WHERE id = ?", (job_id,)).fetchone()
        stored = json.loads(row["config_json"]) if row else {}
        stored.update(config)
        conn.execute(
            "UPDATE training_jobs SET config_json = ? WHERE id = ?",
            (json.dumps(stored), job_id),
        )
        conn.commit()
    finally:
        conn.close()

    total_epochs = cfg["stage1Epochs"] + cfg["stage2Epochs"] if cfg["twoStage"] else cfg["epochs"]
    epoch_offset = 0

    def on_fit_epoch_end(trainer: Any) -> None:
        nonlocal epoch_offset
        epoch = int(getattr(trainer, "epoch", 0)) + 1 + epoch_offset
        progress = min(99, round((epoch / max(total_epochs, 1)) * 100))
        metrics = {
            "mAP": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "loss": 0.0,
        }
        try:
            loss_items = getattr(trainer, "loss_items", None)
            if loss_items is not None and len(loss_items):
                metrics["loss"] = round(float(sum(float(x) for x in loss_items)), 4)
            metrics_obj = getattr(trainer, "metrics", None) or {}
            if isinstance(metrics_obj, dict):
                for key, value in metrics_obj.items():
                    lowered = str(key).lower()
                    if "map50" in lowered and isinstance(value, (int, float)):
                        metrics["mAP"] = round(float(value), 4)
                    elif lowered.endswith("/p") or "precision" in lowered:
                        if isinstance(value, (int, float)):
                            metrics["precision"] = round(float(value), 4)
                    elif lowered.endswith("/r") or "recall" in lowered:
                        if isinstance(value, (int, float)):
                            metrics["recall"] = round(float(value), 4)
        except Exception:
            pass

        _update_job(job_id, current_epoch=epoch, progress=progress, metrics=metrics)
        if mlflow_run_id:
            log_epoch_metrics(mlflow_run_id, epoch, metrics)

    try:
        if cfg["twoStage"]:
            # Stage 1: freeze backbone, train head/neck (Ultralytics guide)
            model = YOLO(weights)
            model.add_callback("on_fit_epoch_end", on_fit_epoch_end)
            stage1_kwargs: dict[str, Any] = {
                "data": dataset["dataYaml"],
                "epochs": cfg["stage1Epochs"],
                "imgsz": cfg["imageSize"],
                "batch": cfg["batchSize"],
                "patience": cfg["patience"],
                "warmup_epochs": cfg["warmupEpochs"],
                "freeze": cfg["freeze"] if cfg["freeze"] is not None else 10,
                "project": str(project_dir),
                "name": "stage1",
                "exist_ok": True,
                "verbose": False,
            }
            if cfg["optimizer"] and cfg["optimizer"].lower() != "auto":
                stage1_kwargs["optimizer"] = cfg["optimizer"]
                stage1_kwargs["lr0"] = cfg["learningRate"]

            model.train(**stage1_kwargs)
            epoch_offset = cfg["stage1Epochs"]

            # Stage 2: unfreeze all, lower learning rate
            best_stage1 = project_dir / "stage1" / "weights" / "best.pt"
            model = YOLO(str(best_stage1 if best_stage1.exists() else weights))
            model.add_callback("on_fit_epoch_end", on_fit_epoch_end)
            stage2_kwargs: dict[str, Any] = {
                "data": dataset["dataYaml"],
                "epochs": cfg["stage2Epochs"],
                "imgsz": cfg["imageSize"],
                "batch": cfg["batchSize"],
                "patience": cfg["patience"],
                "warmup_epochs": cfg["warmupEpochs"],
                "optimizer": "AdamW" if cfg["optimizer"].lower() == "auto" else cfg["optimizer"],
                "lr0": min(cfg["learningRate"], 0.001),
                "project": str(project_dir),
                "name": "stage2",
                "exist_ok": True,
                "verbose": False,
            }
            results = model.train(**stage2_kwargs)
            best_weights = project_dir / "stage2" / "weights" / "best.pt"
        else:
            model = YOLO(weights)
            model.add_callback("on_fit_epoch_end", on_fit_epoch_end)
            train_kwargs: dict[str, Any] = {
                "data": dataset["dataYaml"],
                "epochs": cfg["epochs"],
                "imgsz": cfg["imageSize"],
                "batch": cfg["batchSize"],
                "patience": cfg["patience"],
                "warmup_epochs": cfg["warmupEpochs"],
                "project": str(project_dir),
                "name": "finetune",
                "exist_ok": True,
                "verbose": False,
            }
            if cfg["freeze"] is not None:
                train_kwargs["freeze"] = cfg["freeze"]
            if cfg["optimizer"] and cfg["optimizer"].lower() != "auto":
                train_kwargs["optimizer"] = cfg["optimizer"]
                train_kwargs["lr0"] = cfg["learningRate"]

            results = model.train(**train_kwargs)
            best_weights = project_dir / "finetune" / "weights" / "best.pt"

        metrics = _extract_metrics(results)
        weights_path = str(best_weights) if best_weights.exists() else None
        if weights_path:
            config["weightsPath"] = weights_path
            conn = get_connection()
            try:
                row = conn.execute(
                    "SELECT config_json FROM training_jobs WHERE id = ?", (job_id,)
                ).fetchone()
                stored = json.loads(row["config_json"]) if row else {}
                stored["weightsPath"] = weights_path
                stored["dataset"] = config.get("dataset")
                conn.execute(
                    "UPDATE training_jobs SET config_json = ? WHERE id = ?",
                    (json.dumps(stored), job_id),
                )
                conn.commit()
            finally:
                conn.close()

        mlflow_model_name = None
        mlflow_model_version = None
        if mlflow_run_id:
            registration = finish_training_run(
                run_id=mlflow_run_id,
                model_id=model_id,
                model_name=model_name,
                config={**cfg, "weightsPath": weights_path, "engine": "ultralytics"},
                metrics=metrics,
                class_labels=dataset["classNames"],
            )
            if registration:
                mlflow_model_name = registration["modelName"]
                mlflow_model_version = registration["modelVersion"]

        _update_job(
            job_id,
            current_epoch=total_epochs,
            progress=100,
            status="completed",
            metrics=metrics,
            mlflow_model_name=mlflow_model_name,
            mlflow_model_version=mlflow_model_version,
        )
    except Exception as exc:
        _update_job(job_id, status="failed", progress=100, error=str(exc))


def start_finetune_thread(
    job_id: str,
    model_id: str,
    model_name: str,
    config: dict[str, Any],
    mlflow_run_id: Optional[str],
) -> None:
    thread = threading.Thread(
        target=_run_ultralytics_train,
        args=(job_id, model_id, model_name, config, mlflow_run_id),
        daemon=True,
        name=f"finetune-{job_id}",
    )
    thread.start()
