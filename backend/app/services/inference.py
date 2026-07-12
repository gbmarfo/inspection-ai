import uuid

MOCK_DETECTIONS = [
    {"label": "Vegetation Encroachment", "classification": "Vegetation Encroachment", "severity": "Medium", "status": "warning", "x": 15, "y": 20, "width": 35, "height": 40},
    {"label": "Insulator", "classification": "Insulator Porcelain Flashed", "severity": "Low", "status": "clear", "x": 45, "y": 10, "width": 18, "height": 14},
    {"label": "Hardware", "classification": "Hardware Loose", "severity": "Medium", "status": "warning", "x": 55, "y": 30, "width": 16, "height": 12},
    {"label": "Corrosion", "classification": "Corrosion / Rust", "severity": "High", "status": "critical", "x": 28, "y": 55, "width": 20, "height": 18},
    {"label": "Conductor", "classification": "Primary Conductor", "severity": "Low", "status": "clear", "x": 10, "y": 6, "width": 62, "height": 10},
]


def run_mock_inference(conn, image_id: str, model_id: str | None = None) -> list[str]:
    """Regenerate AI detections for an image.

    Existing AI-generated detections are cleared so the run is idempotent and the
    result reflects the currently selected model. Manual annotations are kept.
    The chosen model deterministically influences how many detections are found.
    """
    conn.execute(
        "DELETE FROM annotations WHERE image_id = ? AND ai_generated = 1", (image_id,)
    )

    seed = sum(ord(char) for char in (model_id or "default"))
    count = 3 + (seed % (len(MOCK_DETECTIONS) - 2))  # 3..len(MOCK_DETECTIONS)
    detections = MOCK_DETECTIONS[:count]

    created_ids = []
    for detection in detections:
        box_id = f"ai-{uuid.uuid4().hex[:8]}"
        conn.execute(
            """INSERT INTO annotations
               (id, image_id, label, classification, severity, status, x, y, width, height,
                ai_generated, fault_highlight, default_selected)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0)""",
            (
                box_id,
                image_id,
                detection["classification"],
                detection["classification"],
                detection["severity"],
                detection["status"],
                detection["x"],
                detection["y"],
                detection["width"],
                detection["height"],
            ),
        )
        created_ids.append(box_id)

    status = "warning" if any(d["status"] in ("warning", "critical") for d in detections) else "clear"
    conn.execute("UPDATE images SET status = ? WHERE id = ?", (status, image_id))

    return created_ids
