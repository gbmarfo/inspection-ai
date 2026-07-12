from typing import Any, Optional

SEVERITY_RANK = {"Low": 0, "Medium": 1, "High": 2, "Critical": 3}

PRIORITY_BY_SEVERITY: dict[str, tuple[str, int]] = {
    "Low": ("routine", 90),
    "Medium": ("routine", 30),
    "High": ("urgent", 7),
    "Critical": ("emergency", 1),
}

SLA_LABELS = {
    1: "24 hours",
    7: "7 days",
    30: "30 days",
    90: "90 days",
}


def priority_for_severity(severity: str) -> tuple[str, int]:
    return PRIORITY_BY_SEVERITY.get(severity, ("routine", 30))


def sla_label(days: int) -> str:
    return SLA_LABELS.get(days, f"{days} days")


def meets_min_severity(severity: str, min_severity: str) -> bool:
    return SEVERITY_RANK.get(severity, 0) >= SEVERITY_RANK.get(min_severity, 0)


def build_title(classification: str, severity: str) -> str:
    return f"{classification} — {severity} severity"


def build_description(classification: str, severity: str, image_name: str, sla_days: int) -> str:
    sla = sla_label(sla_days)
    return (
        f"Field inspection on {image_name} identified {classification} "
        f"({severity} severity). Recommended response within {sla}."
    )


def map_service_request(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "annotationId": row["annotation_id"],
        "imageId": row["image_id"],
        "structureId": row["structure_id"],
        "assetId": row["structure_id"],
        "imageName": row["image_name"] if "image_name" in row.keys() else None,
        "classification": row["classification"],
        "severity": row["severity"],
        "priority": row["priority"],
        "status": row["status"],
        "title": row["title"],
        "description": row["description"],
        "slaDays": row["sla_days"],
        "lat": row["lat"],
        "lng": row["lng"],
        "createdAt": row["created_at"],
    }


def fetch_annotation_context(conn, annotation_id: str, image_id: str) -> Optional[dict[str, Any]]:
    row = conn.execute(
        """
        SELECT a.id AS annotation_id, a.classification, a.severity, a.label,
               i.id AS image_id, i.name AS image_name, i.structure_id, i.lat, i.lng
        FROM annotations a
        JOIN images i ON i.id = a.image_id
        WHERE a.id = ? AND a.image_id = ?
        """,
        (annotation_id, image_id),
    ).fetchone()
    if not row:
        return None
    classification = row["classification"] or row["label"]
    return {
        "annotation_id": row["annotation_id"],
        "classification": classification,
        "severity": row["severity"] or "Medium",
        "image_id": row["image_id"],
        "image_name": row["image_name"],
        "structure_id": row["structure_id"],
        "lat": row["lat"],
        "lng": row["lng"],
    }
