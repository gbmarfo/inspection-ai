import uuid
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..database import get_connection
from ..mappers import map_annotation, map_image
from ..services.asset_classes import get_asset_class
from ..services.inspection_schedules import derive_schedule_status, map_inspection_schedule
from ..services.shapefile_import import iter_shapefile_features

router = APIRouter(prefix="/api/assets", tags=["assets"])


class InspectionScheduleCreate(BaseModel):
    assetId: str
    scheduledAt: str
    frequencyDays: Optional[int] = None
    priority: Optional[str] = "routine"
    notes: Optional[str] = None


class InspectionSchedulePatch(BaseModel):
    scheduledAt: Optional[str] = None
    frequencyDays: Optional[int] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class AssetPatch(BaseModel):
    classId: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None


def _map_asset(row, image_count: int, next_schedule: Optional[dict] = None) -> dict:
    mapped = {
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "lat": row["lat"],
        "lng": row["lng"],
        "status": row["status"],
        "imageCount": image_count,
        "classId": row["class_id"] if "class_id" in row.keys() else None,
        "className": row["class_name"] if "class_name" in row.keys() else None,
    }
    if next_schedule:
        mapped["nextInspectionAt"] = next_schedule["scheduled_at"]
        mapped["inspectionStatus"] = derive_schedule_status(
            next_schedule["scheduled_at"], next_schedule["status"]
        )
        mapped["inspectionPriority"] = next_schedule["priority"]
    else:
        mapped["inspectionStatus"] = "none"
    return mapped


def _next_schedule_for_asset(conn, asset_id: str):
    return conn.execute(
        """
        SELECT *
        FROM inspection_schedules
        WHERE asset_id = ? AND status NOT IN ('completed', 'cancelled')
        ORDER BY scheduled_at ASC
        LIMIT 1
        """,
        (asset_id,),
    ).fetchone()


@router.get("/inspection-schedules")
def list_inspection_schedules():
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT sch.*, s.name AS asset_name, s.type AS asset_type
            FROM inspection_schedules sch
            JOIN structures s ON s.id = sch.asset_id
            ORDER BY sch.scheduled_at ASC
            """
        ).fetchall()
        return [map_inspection_schedule(row) for row in rows]
    finally:
        conn.close()


@router.post("/inspection-schedules", status_code=201)
def create_inspection_schedule(body: InspectionScheduleCreate):
    conn = get_connection()
    try:
        asset = conn.execute("SELECT id FROM structures WHERE id = ?", (body.assetId,)).fetchone()
        if not asset:
            raise HTTPException(status_code=400, detail="Asset not found")

        schedule_id = f"sch-{uuid.uuid4().hex[:8]}"
        conn.execute(
            """
            INSERT INTO inspection_schedules (
              id, asset_id, scheduled_at, frequency_days, priority, status, notes
            ) VALUES (?, ?, ?, ?, ?, 'scheduled', ?)
            """,
            (
                schedule_id,
                body.assetId,
                body.scheduledAt,
                body.frequencyDays,
                body.priority or "routine",
                body.notes,
            ),
        )
        conn.commit()

        row = conn.execute(
            """
            SELECT sch.*, s.name AS asset_name, s.type AS asset_type
            FROM inspection_schedules sch
            JOIN structures s ON s.id = sch.asset_id
            WHERE sch.id = ?
            """,
            (schedule_id,),
        ).fetchone()
        return map_inspection_schedule(row)
    finally:
        conn.close()


@router.patch("/inspection-schedules/{schedule_id}")
def update_inspection_schedule(schedule_id: str, patch: InspectionSchedulePatch):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM inspection_schedules WHERE id = ?", (schedule_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Inspection schedule not found")

        updates = patch.model_dump(exclude_unset=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        completed_at = row["completed_at"]
        status = updates.get("status", row["status"])
        if status == "completed" and not completed_at:
            completed_at = conn.execute("SELECT datetime('now')").fetchone()[0]

        conn.execute(
            """
            UPDATE inspection_schedules
            SET scheduled_at = COALESCE(?, scheduled_at),
                frequency_days = COALESCE(?, frequency_days),
                priority = COALESCE(?, priority),
                status = COALESCE(?, status),
                notes = COALESCE(?, notes),
                completed_at = ?
            WHERE id = ?
            """,
            (
                updates.get("scheduledAt"),
                updates.get("frequencyDays"),
                updates.get("priority"),
                updates.get("status"),
                updates.get("notes"),
                completed_at,
                schedule_id,
            ),
        )
        conn.commit()

        updated = conn.execute(
            """
            SELECT sch.*, s.name AS asset_name, s.type AS asset_type
            FROM inspection_schedules sch
            JOIN structures s ON s.id = sch.asset_id
            WHERE sch.id = ?
            """,
            (schedule_id,),
        ).fetchone()
        return map_inspection_schedule(updated)
    finally:
        conn.close()


@router.get("")
def list_assets():
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT s.*, ac.name AS class_name, COUNT(i.id) as image_count
            FROM structures s
            LEFT JOIN asset_classes ac ON ac.id = s.class_id
            LEFT JOIN images i ON i.structure_id = s.id
            GROUP BY s.id
            ORDER BY s.name
            """
        ).fetchall()
        return [_map_asset(row, row["image_count"], _next_schedule_for_asset(conn, row["id"])) for row in rows]
    finally:
        conn.close()


@router.patch("/{asset_id}")
def update_asset(asset_id: str, body: AssetPatch):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM structures WHERE id = ?", (asset_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Asset not found")

        updates = body.model_dump(exclude_unset=True)
        if "classId" in updates:
            class_id = updates["classId"]
            if class_id:
                exists = conn.execute(
                    "SELECT id FROM asset_classes WHERE id = ?", (class_id,)
                ).fetchone()
                if not exists:
                    raise HTTPException(status_code=400, detail="Asset class not found")
            conn.execute("UPDATE structures SET class_id = ? WHERE id = ?", (class_id, asset_id))

        if "name" in updates and updates["name"]:
            conn.execute(
                "UPDATE structures SET name = ? WHERE id = ?",
                (updates["name"].strip(), asset_id),
            )
        if "type" in updates and updates["type"]:
            conn.execute(
                "UPDATE structures SET type = ? WHERE id = ?",
                (updates["type"].strip(), asset_id),
            )
        if "status" in updates and updates["status"]:
            conn.execute(
                "UPDATE structures SET status = ? WHERE id = ?",
                (updates["status"].strip(), asset_id),
            )

        conn.commit()
    finally:
        conn.close()
    return get_asset(asset_id)


@router.get("/{asset_id}")
def get_asset(asset_id: str):
    conn = get_connection()
    try:
        row = conn.execute(
            """
            SELECT s.*, ac.name AS class_name, COUNT(i.id) as image_count
            FROM structures s
            LEFT JOIN asset_classes ac ON ac.id = s.class_id
            LEFT JOIN images i ON i.structure_id = s.id
            WHERE s.id = ?
            GROUP BY s.id
            """,
            (asset_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Asset not found")

        images = conn.execute(
            "SELECT * FROM images WHERE structure_id = ? ORDER BY created_at, id",
            (asset_id,),
        ).fetchall()

        mapped_images = []
        for image in images:
            annotations = conn.execute(
                "SELECT * FROM annotations WHERE image_id = ? ORDER BY id", (image["id"],)
            ).fetchall()
            mapped_images.append(map_image(image, [map_annotation(a) for a in annotations]))

        schedules = conn.execute(
            """
            SELECT sch.*, s.name AS asset_name, s.type AS asset_type
            FROM inspection_schedules sch
            JOIN structures s ON s.id = sch.asset_id
            WHERE sch.asset_id = ?
            ORDER BY sch.scheduled_at DESC
            """,
            (asset_id,),
        ).fetchall()

        class_id = row["class_id"] if "class_id" in row.keys() else None
        asset_class = get_asset_class(conn, class_id) if class_id else None
        return {
            **_map_asset(row, row["image_count"], _next_schedule_for_asset(conn, asset_id)),
            "images": mapped_images,
            "inspectionSchedules": [map_inspection_schedule(schedule) for schedule in schedules],
            "assetClass": asset_class,
            "checklist": asset_class["checklist"] if asset_class else [],
        }
    finally:
        conn.close()


@router.post("/import/shapefile")
async def import_shapefile(
    file: UploadFile = File(...),
    defaultType: Optional[str] = Form(None),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        features = list(iter_shapefile_features(data, file.filename))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to read shapefile: {exc}") from exc

    if not features:
        raise HTTPException(status_code=400, detail="No features found in shapefile")

    conn = get_connection()
    created = []
    try:
        for feature in features:
            asset_id = f"asset-{uuid.uuid4().hex[:8]}"
            asset_type = feature["type"] if feature["type"] != "Imported" else (defaultType or "Imported")
            conn.execute(
                """
                INSERT INTO structures (id, name, type, lat, lng, status)
                VALUES (?, ?, ?, ?, ?, 'active')
                """,
                (asset_id, feature["name"], asset_type, feature["lat"], feature["lng"]),
            )
            created.append(
                {
                    "id": asset_id,
                    "name": feature["name"],
                    "type": asset_type,
                    "lat": feature["lat"],
                    "lng": feature["lng"],
                    "status": "active",
                    "imageCount": 0,
                    "inspectionStatus": "none",
                }
            )
        conn.commit()
        return {"imported": len(created), "assets": created}
    finally:
        conn.close()
