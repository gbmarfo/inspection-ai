import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..database import get_connection
from ..services.service_requests import (
    build_description,
    build_title,
    fetch_annotation_context,
    map_service_request,
    meets_min_severity,
    priority_for_severity,
)

router = APIRouter(prefix="/api/service-requests", tags=["service-requests"])


class CreateServiceRequestBody(BaseModel):
    annotationId: str
    imageId: str


class BulkCreateBody(BaseModel):
    imageId: Optional[str] = None
    minSeverity: str = "High"


class ServiceRequestPatch(BaseModel):
    status: Optional[str] = None


def _open_request_exists(conn, annotation_id: str) -> bool:
    row = conn.execute(
        """
        SELECT id FROM service_requests
        WHERE annotation_id = ? AND status != 'closed'
        LIMIT 1
        """,
        (annotation_id,),
    ).fetchone()
    return row is not None


def _insert_request(conn, context: dict) -> dict:
    if _open_request_exists(conn, context["annotation_id"]):
        raise HTTPException(status_code=409, detail="An open service request already exists for this annotation")

    priority, sla_days = priority_for_severity(context["severity"])
    request_id = f"sr-{uuid.uuid4().hex[:8]}"
    created_at = datetime.now(timezone.utc).isoformat()
    title = build_title(context["classification"], context["severity"])
    description = build_description(
        context["classification"],
        context["severity"],
        context["image_name"],
        sla_days,
    )

    conn.execute(
        """
        INSERT INTO service_requests
          (id, annotation_id, image_id, structure_id, classification, severity,
           priority, status, title, description, sla_days, lat, lng, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
        """,
        (
            request_id,
            context["annotation_id"],
            context["image_id"],
            context["structure_id"],
            context["classification"],
            context["severity"],
            priority,
            title,
            description,
            sla_days,
            context["lat"],
            context["lng"],
            created_at,
        ),
    )

    row = conn.execute(
        """
        SELECT sr.*, i.name AS image_name
        FROM service_requests sr
        JOIN images i ON i.id = sr.image_id
        WHERE sr.id = ?
        """,
        (request_id,),
    ).fetchone()
    return map_service_request(row)


@router.get("")
def list_service_requests():
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT sr.*, i.name AS image_name
            FROM service_requests sr
            JOIN images i ON i.id = sr.image_id
            ORDER BY sr.created_at DESC
            """
        ).fetchall()
        return [map_service_request(row) for row in rows]
    finally:
        conn.close()


@router.post("", status_code=201)
def create_service_request(body: CreateServiceRequestBody):
    conn = get_connection()
    try:
        context = fetch_annotation_context(conn, body.annotationId, body.imageId)
        if not context:
            raise HTTPException(status_code=404, detail="Annotation not found")

        request = _insert_request(conn, context)
        conn.commit()
        return request
    finally:
        conn.close()


@router.post("/bulk", status_code=201)
def bulk_create_service_requests(body: BulkCreateBody):
    conn = get_connection()
    try:
        query = """
            SELECT a.id AS annotation_id, a.classification, a.severity, a.label,
                   i.id AS image_id, i.name AS image_name, i.structure_id, i.lat, i.lng
            FROM annotations a
            JOIN images i ON i.id = a.image_id
        """
        params: tuple = ()
        if body.imageId:
            query += " WHERE i.id = ?"
            params = (body.imageId,)

        rows = conn.execute(query, params).fetchall()
        created = []
        skipped = 0

        for row in rows:
            severity = row["severity"] or "Medium"
            if not meets_min_severity(severity, body.minSeverity):
                continue

            classification = row["classification"] or row["label"]
            context = {
                "annotation_id": row["annotation_id"],
                "classification": classification,
                "severity": severity,
                "image_id": row["image_id"],
                "image_name": row["image_name"],
                "structure_id": row["structure_id"],
                "lat": row["lat"],
                "lng": row["lng"],
            }

            if _open_request_exists(conn, context["annotation_id"]):
                skipped += 1
                continue

            try:
                created.append(_insert_request(conn, context))
            except HTTPException:
                skipped += 1

        conn.commit()
        return {"created": created, "count": len(created), "skipped": skipped}
    finally:
        conn.close()


@router.patch("/{request_id}")
def update_service_request(request_id: str, patch: ServiceRequestPatch):
    conn = get_connection()
    try:
        if patch.status is None:
            raise HTTPException(status_code=400, detail="No fields to update")

        conn.execute(
            "UPDATE service_requests SET status = ? WHERE id = ?",
            (patch.status, request_id),
        )
        conn.commit()

        row = conn.execute(
            """
            SELECT sr.*, i.name AS image_name
            FROM service_requests sr
            JOIN images i ON i.id = sr.image_id
            WHERE sr.id = ?
            """,
            (request_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Service request not found")
        return map_service_request(row)
    finally:
        conn.close()
