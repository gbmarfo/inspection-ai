"""MLflow experiment tracking and model registry integration."""

from __future__ import annotations

import logging
from typing import Any

from ..config import MLFLOW_ARTIFACT_ROOT, MLFLOW_ENABLED, MLFLOW_EXPERIMENT_NAME, MLFLOW_TRACKING_URI

logger = logging.getLogger(__name__)

_client: Any | None = None
_available: bool | None = None


def is_mlflow_enabled() -> bool:
    return MLFLOW_ENABLED


def _ensure_client() -> Any | None:
    global _client, _available
    if not MLFLOW_ENABLED:
        return None
    if _available is False:
        return None
    if _client is not None:
        return _client

    try:
        import mlflow
        from mlflow.tracking import MlflowClient

        mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
        experiment = mlflow.get_experiment_by_name(MLFLOW_EXPERIMENT_NAME)
        if experiment is None:
            mlflow.create_experiment(MLFLOW_EXPERIMENT_NAME, artifact_location=MLFLOW_ARTIFACT_ROOT)
        mlflow.set_experiment(MLFLOW_EXPERIMENT_NAME)
        _client = MlflowClient(tracking_uri=MLFLOW_TRACKING_URI)
        _available = True
        return _client
    except Exception as exc:
        logger.warning("MLflow unavailable (%s): %s", MLFLOW_TRACKING_URI, exc)
        _available = False
        return None


def start_training_run(
    job_id: str,
    model_id: str,
    model_name: str,
    config: dict[str, Any],
) -> str | None:
    client = _ensure_client()
    if client is None:
        return None

    try:
        import mlflow

        run = mlflow.start_run(run_name=job_id, tags={"job_id": job_id, "model_id": model_id})
        mlflow.set_tag("model_name", model_name)
        mlflow.log_param("model_id", model_id)
        mlflow.log_param("model_name", model_name)
        for key, value in config.items():
            mlflow.log_param(key, value)
        return run.info.run_id
    except Exception as exc:
        logger.warning("Failed to start MLflow run for %s: %s", job_id, exc)
        return None


def log_epoch_metrics(run_id: str, epoch: int, metrics: dict[str, float]) -> None:
    if not run_id or _ensure_client() is None:
        return

    try:
        import mlflow

        with mlflow.start_run(run_id=run_id):
            for name, value in metrics.items():
                mlflow.log_metric(name, value, step=epoch)
    except Exception as exc:
        logger.warning("Failed to log MLflow metrics for run %s: %s", run_id, exc)


def finish_training_run(
    run_id: str,
    model_id: str,
    model_name: str,
    config: dict[str, Any],
    metrics: dict[str, float],
    class_labels: list[str],
) -> dict[str, str] | None:
    if not run_id or _ensure_client() is None:
        return None

    try:
        import mlflow
        from mlflow.tracking import MlflowClient

        from .powerai_model import PowerAIVisionPyFunc

        with mlflow.start_run(run_id=run_id):
            for name, value in metrics.items():
                mlflow.log_metric(name, value)

            pyfunc_model = PowerAIVisionPyFunc(
                model_id=model_id,
                model_name=model_name,
                class_labels=class_labels,
            )
            mlflow.pyfunc.log_model(
                name="model",
                python_model=pyfunc_model,
                pip_requirements=["pandas"],
            )

        registered_name = f"powerai-{model_id}"
        model_uri = f"runs:/{run_id}/model"
        result = mlflow.register_model(model_uri, registered_name)

        client = MlflowClient(tracking_uri=MLFLOW_TRACKING_URI)
        client.update_model_version(
            name=registered_name,
            version=result.version,
            description=(
                f"PowerAI vision detector trained from job run {run_id}. "
                f"Architecture: {model_name}."
            ),
        )

        return {
            "runId": run_id,
            "modelName": registered_name,
            "modelVersion": str(result.version),
            "modelUri": model_uri,
        }
    except Exception as exc:
        logger.warning("Failed to register MLflow model for run %s: %s", run_id, exc)
        try:
            import mlflow

            with mlflow.start_run(run_id=run_id):
                mlflow.set_tag("registration_status", "failed")
        except Exception:
            pass
        return None


def list_registered_models(limit: int = 20) -> list[dict[str, Any]]:
    client = _ensure_client()
    if client is None:
        return []

    try:
        models = client.search_registered_models(max_results=limit)
        results: list[dict[str, Any]] = []
        for model in models:
            versions = client.search_model_versions(f"name='{model.name}'")
            latest = max(versions, key=lambda version: int(version.version)) if versions else None
            if latest is None:
                continue
            results.append(
                {
                    "name": model.name,
                    "latestVersion": str(latest.version),
                    "stage": latest.current_stage,
                    "runId": latest.run_id,
                    "source": latest.source,
                    "description": latest.description or model.description,
                    "updatedAt": latest.last_updated_timestamp,
                }
            )
        return sorted(results, key=lambda item: item.get("updatedAt") or 0, reverse=True)
    except Exception as exc:
        logger.warning("Failed to list registered MLflow models: %s", exc)
        return []


def list_recent_runs(limit: int = 10) -> list[dict[str, Any]]:
    client = _ensure_client()
    if client is None:
        return []

    try:
        import mlflow

        experiment = mlflow.get_experiment_by_name(MLFLOW_EXPERIMENT_NAME)
        if experiment is None:
            return []

        runs = client.search_runs(
            experiment_ids=[experiment.experiment_id],
            order_by=["start_time DESC"],
            max_results=limit,
        )
        return [
            {
                "runId": run.info.run_id,
                "jobId": run.data.tags.get("job_id"),
                "modelId": run.data.params.get("model_id"),
                "modelName": run.data.tags.get("model_name"),
                "status": run.info.status,
                "startTime": run.info.start_time,
                "metrics": {key: value for key, value in run.data.metrics.items()},
            }
            for run in runs
        ]
    except Exception as exc:
        logger.warning("Failed to list MLflow runs: %s", exc)
        return []
