import json
import logging
import subprocess
import tempfile
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Any, Optional

from ..config import PUBLIC_DIR
from ..storage import MinioStorage, storage

logger = logging.getLogger(__name__)


class FrameExtractionError(Exception):
    pass


def _format_timestamp_label(timestamp_ms: int) -> str:
    total_seconds = max(0, timestamp_ms // 1000)
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes:02d}m{seconds:02d}s"


def resolve_video_file(file_path: str) -> tuple[Path, Optional[str]]:
    if file_path.startswith("/assets/"):
        local_path = PUBLIC_DIR / "assets" / Path(file_path).name
        if not local_path.exists():
            raise FrameExtractionError(f"Sample video not found: {file_path}")
        return local_path, None

    if file_path.startswith("/uploads/"):
        object_key = MinioStorage.path_to_object_key(file_path)
        try:
            data, _ = storage.get_object(object_key)
        except Exception as exc:
            raise FrameExtractionError(f"Failed to read uploaded video: {exc}") from exc

        suffix = Path(file_path).suffix or ".mp4"
        temp_file = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        temp_file.write(data)
        temp_file.close()
        return Path(temp_file.name), temp_file.name

    raise FrameExtractionError(f"Unsupported video path: {file_path}")


def _ffmpeg_executable() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def extract_frame_jpeg(video_path: Path, timestamp_ms: int) -> bytes:
    seconds = max(0, timestamp_ms / 1000)
    output_path = Path(tempfile.mkstemp(suffix=".jpg")[1])
    ffmpeg = _ffmpeg_executable()

    try:
        result = subprocess.run(
            [
                ffmpeg,
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                f"{seconds:.3f}",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                "-q:v",
                "2",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "ffmpeg failed").strip()
            raise FrameExtractionError(detail or "Failed to extract video frame")

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise FrameExtractionError("Failed to extract video frame")

        return output_path.read_bytes()
    except FileNotFoundError as exc:
        raise FrameExtractionError("ffmpeg is required to extract video frames") from exc
    finally:
        output_path.unlink(missing_ok=True)


def group_annotations_by_timestamp(annotations: list[dict[str, Any]]) -> dict[int, list[dict[str, Any]]]:
    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for annotation in annotations:
        timestamp_ms = annotation.get("timestampMs")
        if timestamp_ms is None:
            continue
        grouped[int(timestamp_ms)].append(annotation)
    return dict(grouped)


def _store_frame_jpeg(jpeg_bytes: bytes) -> str:
    extracted_dir = PUBLIC_DIR / "assets" / "extracted"
    extracted_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.jpg"
    (extracted_dir / filename).write_bytes(jpeg_bytes)
    return f"/assets/extracted/{filename}"


def build_frame_name(video_name: str, timestamp_ms: int) -> str:
    return f"{video_name}_frame_{_format_timestamp_label(timestamp_ms)}"


def extract_annotated_frames(conn, video_row: Any, annotations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped = group_annotations_by_timestamp(annotations)
    if not grouped:
        raise FrameExtractionError("No timestamped annotations found on this video")

    video_path, temp_path = resolve_video_file(video_row["file_path"])
    created: list[dict[str, Any]] = []

    try:
        from ..mappers import get_image_by_id

        for timestamp_ms in sorted(grouped.keys()):
            frame_name = build_frame_name(video_row["name"], timestamp_ms)
            if video_row["folder_id"] is None:
                existing = conn.execute(
                    "SELECT id FROM images WHERE folder_id IS NULL AND name = ?",
                    (frame_name,),
                ).fetchone()
            else:
                existing = conn.execute(
                    "SELECT id FROM images WHERE folder_id = ? AND name = ?",
                    (video_row["folder_id"], frame_name),
                ).fetchone()
            if existing:
                image = get_image_by_id(conn, existing["id"])
                if image:
                    created.append(image)
                continue

            jpeg_bytes = extract_frame_jpeg(video_path, timestamp_ms)
            file_path = _store_frame_jpeg(jpeg_bytes)
            image_id = f"frame-{uuid.uuid4().hex[:8]}"

            conn.execute(
                """
                INSERT INTO images (
                  id, structure_id, folder_id, name, file_path, status, lat, lng, uploaded, media_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'image')
                """,
                (
                    image_id,
                    video_row["structure_id"],
                    video_row["folder_id"],
                    frame_name,
                    file_path,
                    video_row["status"],
                    video_row["lat"],
                    video_row["lng"],
                ),
            )

            for box in grouped[timestamp_ms]:
                annotation_id = f"framebox-{uuid.uuid4().hex[:8]}"
                points_json = None
                if box.get("points") is not None:
                    points_json = json.dumps(box["points"])

                conn.execute(
                    """
                    INSERT INTO annotations (
                      id, image_id, label, classification, severity, status,
                      x, y, width, height, points, ai_generated, fault_highlight, default_selected
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        annotation_id,
                        image_id,
                        box["label"],
                        box.get("classification", box["label"]),
                        box.get("severity", "Medium"),
                        box.get("status", "warning"),
                        box["x"],
                        box["y"],
                        box["width"],
                        box["height"],
                        points_json,
                        1 if box.get("aiGenerated") else 0,
                        1 if box.get("faultHighlight") else 0,
                        1 if box.get("defaultSelected") else 0,
                    ),
                )

            conn.commit()
            image = get_image_by_id(conn, image_id)
            if image:
                created.append(image)
                logger.info("Extracted frame %s from video %s", frame_name, video_row["id"])

        return created
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
