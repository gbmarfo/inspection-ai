import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")
BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
PUBLIC_DIR = ROOT_DIR / "public"
DIST_DIR = ROOT_DIR / "dist"

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "powerai")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"
PORT = int(os.getenv("PORT", "3001"))

MLFLOW_TRACKING_URI = os.getenv(
    "MLFLOW_TRACKING_URI",
    f"sqlite:///{(DATA_DIR / 'mlflow.db').as_posix()}",
)
MLFLOW_ARTIFACT_ROOT = os.getenv(
    "MLFLOW_ARTIFACT_ROOT",
    str((DATA_DIR / "mlflow-artifacts").resolve()),
)
MLFLOW_EXPERIMENT_NAME = os.getenv("MLFLOW_EXPERIMENT_NAME", "powerai-vision")
MLFLOW_ENABLED = os.getenv("MLFLOW_ENABLED", "true").lower() == "true"

DATA_DIR.mkdir(parents=True, exist_ok=True)
(DATA_DIR / "mlflow-artifacts").mkdir(parents=True, exist_ok=True)
