import uuid
from datetime import datetime, timezone

from fastapi import APIRouter

from ..database import get_connection
from ..mappers import get_all_images

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("")
def list_reports():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM reports ORDER BY created_at DESC").fetchall()
        return [
            {
                "id": row["id"],
                "title": row["title"],
                "summary": row["summary"],
                "criticalCount": row["critical_count"],
                "imageCount": row["image_count"],
                "createdAt": row["created_at"],
            }
            for row in rows
        ]
    finally:
        conn.close()


@router.post("/generate", status_code=201)
def generate_report():
    conn = get_connection()
    try:
        images = get_all_images(conn)
        critical_count = sum(1 for i in images if i["status"] == "critical")
        annotation_count = sum(len(i["boxes"]) for i in images)
        created_at = datetime.now(timezone.utc).isoformat()

        report = {
            "id": f"report-{uuid.uuid4().hex[:8]}",
            "title": f"Inspection Report — {datetime.now().strftime('%m/%d/%Y')}",
            "summary": f"Automated summary for {len(images)} images with {annotation_count} annotations. {critical_count} images flagged critical.",
            "criticalCount": critical_count,
            "imageCount": len(images),
            "createdAt": created_at,
        }

        conn.execute(
            """INSERT INTO reports (id, title, summary, critical_count, image_count, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (report["id"], report["title"], report["summary"], report["criticalCount"], report["imageCount"], created_at),
        )
        conn.commit()
        return report
    finally:
        conn.close()
