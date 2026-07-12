from datetime import date, datetime
from typing import Any, Optional


def _parse_date(value: str) -> date:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date() if "T" in value else date.fromisoformat(value[:10])


def derive_schedule_status(scheduled_at: str, status: str) -> str:
    if status in ("completed", "cancelled"):
        return status
    try:
        scheduled_date = _parse_date(scheduled_at)
    except ValueError:
        return status
    if scheduled_date < date.today():
        return "overdue"
    return "scheduled"


def map_inspection_schedule(row: Any, asset_name: Optional[str] = None) -> dict[str, Any]:
    status = derive_schedule_status(row["scheduled_at"], row["status"])
    return {
        "id": row["id"],
        "assetId": row["asset_id"],
        "assetName": asset_name or row["asset_name"],
        "assetType": row["asset_type"] if "asset_type" in row.keys() else None,
        "scheduledAt": row["scheduled_at"],
        "frequencyDays": row["frequency_days"],
        "priority": row["priority"],
        "status": status,
        "notes": row["notes"],
        "completedAt": row["completed_at"],
        "createdAt": row["created_at"],
    }
