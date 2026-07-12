from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter

from ..database import get_connection
from ..mappers import get_all_images

router = APIRouter(prefix="/api/overview", tags=["overview"])


def _health_score(
    *,
    total_images: int,
    clear_images: int,
    labeled_images: int,
    critical_images: int,
    warning_images: int,
    open_urgent_requests: int,
) -> int:
    if total_images == 0:
        return 100

    compliance = clear_images / total_images
    coverage = labeled_images / total_images
    risk_penalty = min(1.0, (critical_images * 0.12) + (warning_images * 0.05) + (open_urgent_requests * 0.08))
    score = (compliance * 0.45 + coverage * 0.35 + (1 - risk_penalty) * 0.20) * 100
    return max(0, min(100, round(score)))


def _executive_summary(
    *,
    health_score: int,
    compliance_rate: int,
    critical_images: int,
    open_requests: int,
    assets: int,
) -> str:
    if health_score >= 85:
        posture = "strong overall program health"
    elif health_score >= 70:
        posture = "stable operations with targeted follow-up needed"
    else:
        posture = "elevated risk requiring executive attention"

    summary = (
        f"The inspection program shows {posture} across {assets} monitored assets "
        f"with {compliance_rate}% fleet compliance"
    )
    extras = []
    if critical_images:
        extras.append(f"{critical_images} critical finding{'s' if critical_images != 1 else ''} on record")
    if open_requests:
        extras.append(f"{open_requests} open service request{'s' if open_requests != 1 else ''}")
    if extras:
        summary += ", including " + ", ".join(extras)
    return summary + "."


@router.get("")
def get_overview():
    conn = get_connection()
    try:
        images = get_all_images(conn)
        total_images = len(images)
        critical_images = sum(1 for image in images if image["status"] == "critical")
        clear_images = sum(1 for image in images if image["status"] == "clear")
        warning_images = sum(1 for image in images if image["status"] == "warning")
        info_images = sum(1 for image in images if image["status"] == "info")

        assets = conn.execute("SELECT COUNT(*) FROM structures").fetchone()[0]
        active_training = conn.execute(
            "SELECT COUNT(*) FROM training_jobs WHERE status = 'running'"
        ).fetchone()[0]

        total_annotations = sum(len(image["boxes"]) for image in images)
        labeled_images = sum(1 for image in images if image["boxes"])
        uploaded_images = sum(1 for image in images if image["uploaded"])

        open_requests = conn.execute(
            "SELECT COUNT(*) FROM service_requests WHERE status != 'closed'"
        ).fetchone()[0]
        urgent_requests = conn.execute(
            """
            SELECT COUNT(*) FROM service_requests
            WHERE status != 'closed' AND priority IN ('urgent', 'emergency')
            """
        ).fetchone()[0]
        emergency_requests = conn.execute(
            """
            SELECT COUNT(*) FROM service_requests
            WHERE status != 'closed' AND priority = 'emergency'
            """
        ).fetchone()[0]

        classification_counts = Counter(
            box.get("classification") or box.get("label") or "Unclassified"
            for image in images
            for box in image["boxes"]
        )
        top_findings = [
            {"label": label, "count": count}
            for label, count in classification_counts.most_common(5)
        ]

        status_breakdown = [
            {"status": "critical", "label": "Critical", "count": critical_images},
            {"status": "warning", "label": "Review", "count": warning_images},
            {"status": "clear", "label": "Clear", "count": clear_images},
            {"status": "info", "label": "Pending", "count": info_images},
        ]

        compliance_rate = round((clear_images / total_images) * 100) if total_images else 100
        inspection_coverage = round((labeled_images / total_images) * 100) if total_images else 0
        health_score = _health_score(
            total_images=total_images,
            clear_images=clear_images,
            labeled_images=labeled_images,
            critical_images=critical_images,
            warning_images=warning_images,
            open_urgent_requests=urgent_requests,
        )

        recent_jobs = conn.execute(
            "SELECT id, model_name, status, started_at FROM training_jobs ORDER BY started_at DESC LIMIT 3"
        ).fetchall()
        recent_uploads = conn.execute(
            "SELECT name, created_at FROM images WHERE uploaded = 1 ORDER BY created_at DESC LIMIT 3"
        ).fetchall()
        recent_requests = conn.execute(
            """
            SELECT id, title, priority, created_at
            FROM service_requests
            ORDER BY created_at DESC
            LIMIT 3
            """
        ).fetchall()

        recent_activity = sorted(
            [
                *[
                    {
                        "id": job["id"],
                        "message": f"{job['model_name']} training {job['status']}",
                        "at": job["started_at"],
                        "kind": "training",
                    }
                    for job in recent_jobs
                ],
                *[
                    {
                        "id": f"upload-{index}",
                        "message": f"Uploaded {upload['name']}",
                        "at": upload["created_at"],
                        "kind": "upload",
                    }
                    for index, upload in enumerate(recent_uploads)
                ],
                *[
                    {
                        "id": request["id"],
                        "message": request["title"],
                        "at": request["created_at"],
                        "kind": "request",
                        "priority": request["priority"],
                    }
                    for request in recent_requests
                ],
            ],
            key=lambda item: item["at"],
            reverse=True,
        )[:6]

        return {
            "totalImages": total_images,
            "criticalImages": critical_images,
            "clearImages": clear_images,
            "warningImages": warning_images,
            "infoImages": info_images,
            "totalAnnotations": total_annotations,
            "labeledImages": labeled_images,
            "assets": assets,
            "structures": assets,
            "activeTrainingJobs": active_training,
            "uploadedImages": uploaded_images,
            "openServiceRequests": open_requests,
            "urgentServiceRequests": urgent_requests,
            "emergencyServiceRequests": emergency_requests,
            "complianceRate": compliance_rate,
            "inspectionCoverage": inspection_coverage,
            "healthScore": health_score,
            "executiveSummary": _executive_summary(
                health_score=health_score,
                compliance_rate=compliance_rate,
                critical_images=critical_images,
                open_requests=open_requests,
                assets=assets,
            ),
            "statusBreakdown": status_breakdown,
            "topFindings": top_findings,
            "recentActivity": recent_activity,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        conn.close()
