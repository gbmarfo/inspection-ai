import json
import random
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from ..database import get_connection
from .finetune import (
    MODEL_WEIGHTS,
    _normalize_config,
    start_finetune_thread,
    supports_finetune,
    ultralytics_available,
)
from .mlflow_tracking import (
    finish_training_run,
    is_mlflow_enabled,
    log_epoch_metrics,
    start_training_run,
)

_active_timers: dict[str, threading.Timer] = {}
_job_runs: dict[str, str] = {}


def map_training_job(row: Any) -> dict[str, Any]:
    config = json.loads(row["config_json"]) if row["config_json"] else {}
    job = {
        "id": row["id"],
        "modelId": row["model_id"],
        "modelName": row["model_name"],
        "status": row["status"],
        "progress": row["progress"],
        "currentEpoch": row["current_epoch"],
        "totalEpochs": row["total_epochs"],
        "startedAt": row["started_at"],
        "engine": config.get("engine", "mock"),
        "freeze": config.get("freeze"),
        "twoStage": bool(config.get("twoStage", False)),
    }
    if row["metrics_json"]:
        job["metrics"] = json.loads(row["metrics_json"])
    if row["mlflow_run_id"]:
        job["mlflowRunId"] = row["mlflow_run_id"]
    if row["mlflow_model_name"]:
        job["mlflowModelName"] = row["mlflow_model_name"]
    if row["mlflow_model_version"]:
        job["mlflowModelVersion"] = row["mlflow_model_version"]
    if config.get("error"):
        job["error"] = config["error"]
    if config.get("weightsPath"):
        job["weightsPath"] = config["weightsPath"]
    return job


def _epoch_metrics(epoch: int, total_epochs: int) -> dict[str, float]:
    progress = epoch / total_epochs
    return {
        "loss": round(0.45 - progress * 0.3 + random.random() * 0.04, 4),
        "mAP": round(0.55 + progress * 0.3 + random.random() * 0.03, 4),
        "precision": round(0.6 + progress * 0.25 + random.random() * 0.03, 4),
        "recall": round(0.55 + progress * 0.28 + random.random() * 0.03, 4),
    }


def _class_labels(conn) -> list[str]:
    rows = conn.execute(
        "SELECT DISTINCT COALESCE(classification, label) AS class_name FROM annotations ORDER BY class_name"
    ).fetchall()
    return [row["class_name"] for row in rows if row["class_name"]]


def _tick_job(job_id: str) -> None:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM training_jobs WHERE id = ?", (job_id,)).fetchone()
        if not row or row["status"] != "running":
            return

        next_epoch = min(row["current_epoch"] + 1, row["total_epochs"])
        progress = round((next_epoch / row["total_epochs"]) * 100)
        run_id = row["mlflow_run_id"] or _job_runs.get(job_id)

        if next_epoch < row["total_epochs"]:
            epoch_metrics = _epoch_metrics(next_epoch, row["total_epochs"])
            if run_id:
                log_epoch_metrics(run_id, next_epoch, epoch_metrics)

            conn.execute(
                "UPDATE training_jobs SET current_epoch = ?, progress = ?, metrics_json = ? WHERE id = ?",
                (next_epoch, progress, json.dumps(epoch_metrics), job_id),
            )
            conn.commit()

            timer = threading.Timer(0.15, _tick_job, args=[job_id])
            timer.daemon = True
            timer.start()
            _active_timers[job_id] = timer
            return

        metrics = _epoch_metrics(row["total_epochs"], row["total_epochs"])
        config = json.loads(row["config_json"])
        mlflow_model_name = row["mlflow_model_name"]
        mlflow_model_version = row["mlflow_model_version"]

        if run_id:
            registration = finish_training_run(
                run_id=run_id,
                model_id=row["model_id"],
                model_name=row["model_name"],
                config=config,
                metrics=metrics,
                class_labels=_class_labels(conn),
            )
            if registration:
                mlflow_model_name = registration["modelName"]
                mlflow_model_version = registration["modelVersion"]

        conn.execute(
            """UPDATE training_jobs
               SET status = 'completed', progress = 100, current_epoch = ?,
                   metrics_json = ?, completed_at = ?,
                   mlflow_model_name = ?, mlflow_model_version = ?
               WHERE id = ?""",
            (
                row["total_epochs"],
                json.dumps(metrics),
                datetime.now(timezone.utc).isoformat(),
                mlflow_model_name,
                mlflow_model_version,
                job_id,
            ),
        )
        conn.commit()
        _active_timers.pop(job_id, None)
        _job_runs.pop(job_id, None)
    finally:
        conn.close()


def _total_epochs(config: dict[str, Any]) -> int:
    cfg = _normalize_config(config)
    if cfg["twoStage"]:
        return cfg["stage1Epochs"] + cfg["stage2Epochs"]
    return cfg["epochs"]


def start_training_job(conn, model_id: str, model_name: str, config: dict[str, Any]) -> dict[str, Any]:
    running = conn.execute("SELECT id FROM training_jobs WHERE status = 'running' LIMIT 1").fetchone()
    if running:
        raise ValueError("A training job is already running")

    cfg = _normalize_config(config)
    use_ultralytics = supports_finetune(model_id)
    engine = "ultralytics" if use_ultralytics else "mock"

    stored_config = {
        **config,
        **cfg,
        "engine": engine,
        "baseWeights": MODEL_WEIGHTS.get(model_id),
    }

    job_id = f"job-{uuid.uuid4().hex[:8]}"
    started_at = datetime.now(timezone.utc).isoformat()
    total_epochs = _total_epochs(stored_config)
    stored_config["epochs"] = total_epochs if stored_config.get("twoStage") else cfg["epochs"]
    mlflow_run_id = start_training_run(job_id, model_id, model_name, stored_config)

    conn.execute(
        """INSERT INTO training_jobs
           (id, model_id, model_name, status, progress, current_epoch, total_epochs,
            config_json, started_at, mlflow_run_id)
           VALUES (?, ?, ?, 'running', 0, 0, ?, ?, ?, ?)""",
        (job_id, model_id, model_name, total_epochs, json.dumps(stored_config), started_at, mlflow_run_id),
    )
    conn.commit()

    if mlflow_run_id:
        _job_runs[job_id] = mlflow_run_id

    if use_ultralytics:
        start_finetune_thread(job_id, model_id, model_name, stored_config, mlflow_run_id)
    else:
        timer = threading.Timer(0.15, _tick_job, args=[job_id])
        timer.daemon = True
        timer.start()
        _active_timers[job_id] = timer

    job = {
        "id": job_id,
        "modelId": model_id,
        "modelName": model_name,
        "status": "running",
        "progress": 0,
        "currentEpoch": 0,
        "totalEpochs": total_epochs,
        "startedAt": started_at,
        "engine": engine,
        "freeze": cfg["freeze"],
        "twoStage": cfg["twoStage"],
        "ultralyticsAvailable": ultralytics_available(),
    }
    if mlflow_run_id:
        job["mlflowRunId"] = mlflow_run_id
    if is_mlflow_enabled():
        job["mlflowEnabled"] = True
    return job


def stop_all_training_timers() -> None:
    for timer in _active_timers.values():
        timer.cancel()
    _active_timers.clear()
    _job_runs.clear()
