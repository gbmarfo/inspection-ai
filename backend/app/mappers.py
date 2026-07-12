import json
from typing import Any, Optional


def _row_keys(row: Any) -> set:
    try:
        return set(row.keys())
    except Exception:
        return set()


def map_annotation(row: Any) -> dict[str, Any]:
    # The popup shows `classification`, so the label must always mirror it to stay
    # consistent for every class. Fall back to the stored label only when a row has
    # no classification at all.
    classification = row["classification"] or row["label"]

    points = None
    if "points" in _row_keys(row) and row["points"]:
        try:
            points = json.loads(row["points"])
        except (TypeError, ValueError):
            points = None

    annotation = {
        "id": row["id"],
        "label": classification,
        "classification": classification,
        "severity": row["severity"],
        "status": row["status"],
        "x": row["x"],
        "y": row["y"],
        "width": row["width"],
        "height": row["height"],
        "aiGenerated": bool(row["ai_generated"]),
        "faultHighlight": bool(row["fault_highlight"]),
        "defaultSelected": bool(row["default_selected"]),
    }
    if points is not None:
        annotation["points"] = points
    if "timestamp_ms" in _row_keys(row) and row["timestamp_ms"] is not None:
        annotation["timestampMs"] = row["timestamp_ms"]
    return annotation


def map_image(row: Any, boxes: list[dict[str, Any]]) -> dict[str, Any]:
    media_type = row["media_type"] if "media_type" in _row_keys(row) else "image"
    mapped = {
        "id": row["id"],
        "name": row["name"],
        "src": row["file_path"],
        "status": row["status"],
        "lat": row["lat"],
        "lng": row["lng"],
        "boxes": boxes,
        "uploaded": bool(row["uploaded"]),
        "structureId": row["structure_id"],
        "assetId": row["structure_id"],
        "folderId": row["folder_id"],
        "mediaType": media_type,
    }
    if "duration_ms" in _row_keys(row) and row["duration_ms"] is not None:
        mapped["durationMs"] = row["duration_ms"]
    return mapped


def get_image_by_id(conn, image_id: str) -> Optional[dict[str, Any]]:
    row = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
    if not row:
        return None
    annotations = conn.execute(
        "SELECT * FROM annotations WHERE image_id = ? ORDER BY id", (image_id,)
    ).fetchall()
    return map_image(row, [map_annotation(a) for a in annotations])


def get_all_images(
    conn,
    folder_id: Optional[str] = ...,
    structure_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    if structure_id is not None:
        rows = conn.execute(
            "SELECT * FROM images WHERE structure_id = ? ORDER BY created_at, id",
            (structure_id,),
        ).fetchall()
    elif folder_id is ...:
        rows = conn.execute("SELECT * FROM images ORDER BY created_at, id").fetchall()
    elif folder_id is None:
        rows = conn.execute(
            "SELECT * FROM images WHERE folder_id IS NULL ORDER BY created_at, id"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM images WHERE folder_id = ? ORDER BY created_at, id", (folder_id,)
        ).fetchall()

    result = []
    for row in rows:
        annotations = conn.execute(
            "SELECT * FROM annotations WHERE image_id = ? ORDER BY id", (row["id"],)
        ).fetchall()
        result.append(map_image(row, [map_annotation(a) for a in annotations]))
    return result
