import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import DIST_DIR, PUBLIC_DIR
from .database import get_connection, init_database
from .routers import assets, folders, images, models, overview, reports, service_requests
from .services.training import stop_all_training_timers
from .storage import MinioStorage, storage

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_database()
    try:
        storage.ensure_bucket()
    except Exception as exc:
        logger.warning("MinIO not available at startup: %s", exc)
    yield
    stop_all_training_timers()


app = FastAPI(title="PowerAI API", lifespan=lifespan)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": "Invalid request", "details": exc.errors()})


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(overview.router)
app.include_router(images.router)
app.include_router(folders.router)
app.include_router(assets.router)
app.include_router(models.router)
app.include_router(reports.router)
app.include_router(service_requests.router)

if PUBLIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=PUBLIC_DIR / "assets"), name="assets")

if os.getenv("NODE_ENV") == "production" and DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="frontend")


@app.get("/api/health")
def health():
    conn = get_connection()
    try:
        count = conn.execute("SELECT COUNT(*) FROM images").fetchone()[0]
        return {"ok": True, "images": {"count": count}}
    finally:
        conn.close()


@app.get("/uploads/{object_path:path}")
def serve_upload(object_path: str):
    object_key = f"uploads/{object_path}" if not object_path.startswith("uploads/") else object_path
    try:
        data, content_type = storage.get_object(object_key)
        return Response(content=data, media_type=content_type or "application/octet-stream")
    except Exception as exc:
        logger.debug("MinIO fetch failed for %s: %s", object_key, exc)
        raise HTTPException(status_code=404, detail="Object not found") from exc
