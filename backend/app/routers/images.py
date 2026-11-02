import json
import mimetypes
import random
import re
import uuid
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..database import get_connection
from ..mappers import get_all_images, get_image_by_id
from ..services.inference import run_mock_inference
from ..services.interactive_segment import InteractiveSegmentError, run_interactive_segmentation
from ..services.video_frames import FrameExtractionError, extract_annotated_frames
from ..storage import MinioStorage, storage

router = APIRouter(prefix="/api/images", tags=["images"])


class BoundingBoxBody(BaseModel):
    id: Optional[str] = None
    label: str
    classification: Optional[str] = None
    severity: Optional[str] = "Medium"
    status: Optional[str] = "warning"
    x: float
    y: float
    width: float
    height: float
    points: Optional[list[list[float]]] = None
    timestampMs: Optional[int] = None
    aiGenerated: Optional[bool] = False
    faultHighlight: Optional[bool] = False
    defaultSelected: Optional[bool] = False


class AnnotationPatch(BaseModel):
    classification: Optional[str] = None
    severity: Optional[str] = None
    label: Optional[str] = None
    status: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    points: Optional[list[list[float]]] = None
    timestampMs: Optional[int] = None


class InferRequest(BaseModel):
    modelId: Optional[str] = None


class SegmentClick(BaseModel):
    x: float
    y: float
    label: int  # 1 = positive / foreground, -1 = negative / background


class InteractiveSegmentRequest(BaseModel):
    clicks: list[SegmentClick]
    previousPoints: Optional[list[list[float]]] = None


class ImagePatch(BaseModel):
    assetId: Optional[str] = None
    structureId: Optional[str] = None


@router.get("")
def list_images(folderId: Optional[str] = None, assetId: Optional[str] = None, structureId: Optional[str] = None):
    conn = get_connection()
    try:
        linked_asset = assetId or structureId
        if linked_asset:
            return get_all_images(conn, structure_id=linked_asset)
        if folderId is None:
            return get_all_images(conn)
        parsed = None if folderId in ("root", "") else folderId
        return get_all_images(conn, parsed)
    finally:
        conn.close()


@router.post("/upload")
async def upload_images(
    files: list[UploadFile] = File(...),
    folderId: Optional[str] = Form(None),
    assetId: Optional[str] = Form(None),
    structureId: Optional[str] = Form(None),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    conn = get_connection()
    try:
        folder_id: Optional[str] = folderId if folderId and folderId != "root" else None
        if folder_id:
            if not conn.execute("SELECT id FROM folders WHERE id = ?", (folder_id,)).fetchone():
                raise HTTPException(status_code=400, detail="Folder not found")
        else:
            row = conn.execute("SELECT id FROM folders WHERE id = 'folder-uploads'").fetchone()
            folder_id = row["id"] if row else None

        linked_asset = assetId or structureId
        if linked_asset:
            asset = conn.execute(
                "SELECT id, lat, lng FROM structures WHERE id = ?", (linked_asset,)
            ).fetchone()
            if not asset:
                raise HTTPException(status_code=400, detail="Asset not found")
        else:
            asset = None

        created = []
        for upload in files:
            content_type = upload.content_type or ""
            is_image = content_type.startswith("image/")
            is_video = content_type.startswith("video/")
            if not is_image and not is_video:
                continue

            data = await upload.read()
            ext = mimetypes.guess_extension(content_type) or (".mp4" if is_video else ".jpg")
            object_name = f"uploads/{uuid.uuid4().hex}{ext}"
            storage.upload(object_name, data, content_type)
            file_path = MinioStorage.object_key_to_path(object_name)

            image_id = f"upload-{uuid.uuid4().hex[:8]}"
            name = re.sub(r"\.[^.]+$", "", upload.filename or "upload")
            media_type = "video" if is_video else "image"

            conn.execute(
                """INSERT INTO images (id, structure_id, folder_id, name, file_path, status, lat, lng, uploaded, media_type)
                   VALUES (?, ?, ?, ?, ?, 'info', ?, ?, 1, ?)""",
                (
                    image_id,
                    asset["id"] if asset else None,
                    folder_id,
                    name,
                    file_path,
                    asset["lat"] if asset else 37.7749 + (random.random() - 0.5) * 0.04,
                    asset["lng"] if asset else -122.4194 + (random.random() - 0.5) * 0.04,
                    media_type,
                ),
            )
            if media_type == "image":
                run_mock_inference(conn, image_id)
            conn.commit()
            image = get_image_by_id(conn, image_id)
            if image:
                created.append(image)

        if not created:
            raise HTTPException(status_code=400, detail="No valid image or video files uploaded")
        return created
    finally:
        conn.close()


@router.get("/{image_id}")
def get_image(image_id: str):
    conn = get_connection()
    try:
        image = get_image_by_id(conn, image_id)
        if not image:
            raise HTTPException(status_code=404, detail="Image not found")
        return image
    finally:
        conn.close()


@router.patch("/{image_id}")
def patch_image(image_id: str, patch: ImagePatch):
    conn = get_connection()
    try:
        if not get_image_by_id(conn, image_id):
            raise HTTPException(status_code=404, detail="Image not found")

        updates = patch.model_dump(exclude_unset=True)
        if "assetId" not in updates and "structureId" not in updates:
            return get_image_by_id(conn, image_id)

        linked_asset = updates.get("assetId") if "assetId" in updates else updates.get("structureId")
        asset = None
        if linked_asset:
            asset = conn.execute(
                "SELECT id, lat, lng FROM structures WHERE id = ?", (linked_asset,)
            ).fetchone()
            if not asset:
                raise HTTPException(status_code=400, detail="Asset not found")

        if asset:
            conn.execute(
                "UPDATE images SET structure_id = ?, lat = ?, lng = ? WHERE id = ?",
                (linked_asset, asset["lat"], asset["lng"], image_id),
            )
        else:
            conn.execute("UPDATE images SET structure_id = NULL WHERE id = ?", (image_id,))

        conn.commit()
        return get_image_by_id(conn, image_id)
    finally:
        conn.close()


@router.delete("/{image_id}", status_code=204)
def delete_image(image_id: str):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT file_path FROM images WHERE id = ? AND uploaded = 1", (image_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Uploaded image not found")

        file_path = row["file_path"]
        if file_path.startswith("/uploads/"):
            storage.delete(MinioStorage.path_to_object_key(file_path))

        conn.execute("DELETE FROM images WHERE id = ?", (image_id,))
        conn.commit()
    finally:
        conn.close()


@router.post("/{image_id}/extract-frames")
def extract_video_frames(image_id: str):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Video not found")
        if row["media_type"] != "video":
            raise HTTPException(status_code=400, detail="Frame extraction is only available for videos")

        from ..mappers import get_image_by_id

        video = get_image_by_id(conn, image_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        try:
            created = extract_annotated_frames(conn, row, video["boxes"])
        except FrameExtractionError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return {"extracted": len(created), "images": created}
    finally:
        conn.close()


@router.post("/{image_id}/interactive-segment")
def interactive_segment(image_id: str, body: InteractiveSegmentRequest):
    """RITM-style click interactive segmentation (pos/neg clicks → polygon mask)."""
    conn = get_connection()
    try:
        image = get_image_by_id(conn, image_id)
        if not image:
            raise HTTPException(status_code=404, detail="Image not found")
        if image.get("mediaType") == "video":
            raise HTTPException(
                status_code=400,
                detail="Interactive segmentation is only available for still images",
            )
        row = conn.execute("SELECT file_path FROM images WHERE id = ?", (image_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Image not found")

        try:
            result = run_interactive_segmentation(
                file_path=row["file_path"],
                clicks=[click.model_dump() for click in body.clicks],
                previous_points=body.previousPoints,
            )
        except InteractiveSegmentError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return result
    finally:
        conn.close()


@router.post("/{image_id}/infer")
def infer_image(image_id: str, body: Optional[InferRequest] = None):
    conn = get_connection()
    try:
        if not get_image_by_id(conn, image_id):
            raise HTTPException(status_code=404, detail="Image not found")
        row = conn.execute("SELECT media_type FROM images WHERE id = ?", (image_id,)).fetchone()
        if row and row["media_type"] == "video":
            return get_image_by_id(conn, image_id)
        model_id = body.modelId if body else None
        run_mock_inference(conn, image_id, model_id)
        conn.commit()
        return get_image_by_id(conn, image_id)
    finally:
        conn.close()


@router.post("/{image_id}/annotations", status_code=201)
def create_annotation(image_id: str, box: BoundingBoxBody):
    conn = get_connection()
    try:
        annotation_id = box.id or f"manual-{uuid.uuid4().hex[:8]}"
        points_json = json.dumps(box.points) if box.points else None
        conn.execute(
            """INSERT INTO annotations
               (id, image_id, label, classification, severity, status, x, y, width, height, points,
                ai_generated, fault_highlight, default_selected, timestamp_ms)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                annotation_id,
                image_id,
                box.label,
                box.classification or box.label,
                box.severity,
                box.status,
                box.x,
                box.y,
                box.width,
                box.height,
                points_json,
                1 if box.aiGenerated else 0,
                1 if box.faultHighlight else 0,
                1 if box.defaultSelected else 0,
                box.timestampMs,
            ),
        )
        conn.commit()
        return get_image_by_id(conn, image_id)
    finally:
        conn.close()


@router.put("/{image_id}/annotations/{annotation_id}")
def update_annotation(image_id: str, annotation_id: str, patch: AnnotationPatch):
    conn = get_connection()
    try:
        points_json = json.dumps(patch.points) if patch.points is not None else None
        conn.execute(
            """UPDATE annotations
               SET classification = COALESCE(?, classification),
                   severity = COALESCE(?, severity),
                   label = COALESCE(?, label),
                   status = COALESCE(?, status),
                   x = COALESCE(?, x),
                   y = COALESCE(?, y),
                   width = COALESCE(?, width),
                   height = COALESCE(?, height),
                   points = COALESCE(?, points),
                   timestamp_ms = COALESCE(?, timestamp_ms)
               WHERE id = ? AND image_id = ?""",
            (
                patch.classification,
                patch.severity,
                patch.label,
                patch.status,
                patch.x,
                patch.y,
                patch.width,
                patch.height,
                points_json,
                patch.timestampMs,
                annotation_id,
                image_id,
            ),
        )
        conn.commit()
        return get_image_by_id(conn, image_id)
    finally:
        conn.close()


@router.delete("/{image_id}/annotations/{annotation_id}")
def delete_annotation(image_id: str, annotation_id: str):
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM annotations WHERE id = ? AND image_id = ?", (annotation_id, image_id)
        )
        conn.commit()
        return get_image_by_id(conn, image_id)
    finally:
        conn.close()
