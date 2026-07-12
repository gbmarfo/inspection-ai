STRUCTURES = [
    {"id": "s1", "name": "Tower T-1042", "type": "Transmission", "lat": 37.7812, "lng": -122.4051},
    {"id": "s2", "name": "Pole P-2201", "type": "Distribution", "lat": 37.7698, "lng": -122.4312},
    {"id": "s3", "name": "Tower T-1188", "type": "Transmission", "lat": 37.7921, "lng": -122.4188},
    {"id": "s4", "name": "Pole P-3310", "type": "Distribution", "lat": 37.7614, "lng": -122.4099},
    {"id": "s5", "name": "Tower T-1290", "type": "Transmission", "lat": 37.7855, "lng": -122.4377},
]

IMAGES = [
    {
        "id": "img-1",
        "structureId": "s1",
        "name": "TRANS_11",
        "filePath": "/assets/transmission-tower.png",
        "status": "critical",
        "lat": 37.7812,
        "lng": -122.4051,
        "boxes": [
            {"id": "b1", "label": "Transmission Structure", "classification": "Primary Conductor", "severity": "Low", "status": "clear", "x": 22, "y": 8, "width": 32, "height": 82, "aiGenerated": True},
            {"id": "b2", "label": "Insulator String", "classification": "Insulator Porcelain Flashed", "severity": "Low", "status": "clear", "x": 56, "y": 18, "width": 8, "height": 10, "aiGenerated": True},
            {"id": "b3", "label": "Insulator String", "classification": "Insulator Porcelain Flashed", "severity": "Low", "status": "clear", "x": 62, "y": 28, "width": 8, "height": 10, "aiGenerated": True},
            {"id": "b4", "label": "Insulator String", "classification": "Insulator Porcelain Flashed", "severity": "Low", "status": "clear", "x": 68, "y": 38, "width": 8, "height": 10, "aiGenerated": True},
            {"id": "b5", "label": "Insulator String", "classification": "Insulator Porcelain Flashed", "severity": "Medium", "status": "warning", "x": 72, "y": 8, "width": 12, "height": 16, "aiGenerated": True, "defaultSelected": True, "faultHighlight": True},
            {"id": "b6", "label": "Insulator String", "classification": "Insulator Porcelain Flashed", "severity": "Low", "status": "clear", "x": 74, "y": 48, "width": 8, "height": 10, "aiGenerated": True},
        ],
    },
    {"id": "img-2", "structureId": "s2", "name": "IMG_1043", "filePath": "/assets/hero-pole.png", "status": "clear", "lat": 37.7698, "lng": -122.4312, "boxes": [
        {"id": "b7", "label": "Insulator", "classification": "Insulator Porcelain Flashed", "severity": "Low", "status": "clear", "x": 35, "y": 8, "width": 18, "height": 14, "aiGenerated": True},
        {"id": "b8", "label": "Hardware", "classification": "Hardware Loose", "severity": "Low", "status": "clear", "x": 52, "y": 12, "width": 16, "height": 10, "aiGenerated": True},
    ]},
    {"id": "img-3", "structureId": "s3", "name": "IMG_1044", "filePath": "/assets/hero-pole.png", "status": "warning", "lat": 37.7921, "lng": -122.4188, "boxes": [
        {"id": "b9", "label": "Corrosion", "classification": "Corrosion / Rust", "severity": "Medium", "status": "warning", "x": 44, "y": 28, "width": 22, "height": 18, "aiGenerated": True},
        {"id": "b10", "label": "Pole Tag", "classification": "Structure Tag Missing", "severity": "Low", "status": "info", "x": 62, "y": 42, "width": 12, "height": 8, "aiGenerated": True},
    ]},
    {"id": "img-4", "structureId": "s4", "name": "IMG_1045", "filePath": "/assets/hero-pole.png", "status": "clear", "lat": 37.7614, "lng": -122.4099, "boxes": [
        {"id": "b11", "label": "Conductor", "classification": "Primary Conductor", "severity": "Low", "status": "clear", "x": 30, "y": 6, "width": 40, "height": 10, "aiGenerated": True},
    ]},
    {"id": "img-5", "structureId": "s5", "name": "IMG_1046", "filePath": "/assets/hero-pole.png", "status": "critical", "lat": 37.7855, "lng": -122.4377, "boxes": [
        {"id": "b12", "label": "Broken Insulator", "classification": "Insulator Polymer Damaged", "severity": "High", "status": "critical", "x": 40, "y": 10, "width": 20, "height": 16, "aiGenerated": True},
    ]},
    {"id": "img-6", "structureId": "s2", "name": "IMG_1047", "filePath": "/assets/hero-pole.png", "status": "info", "lat": 37.7788, "lng": -122.4255, "boxes": [
        {"id": "b13", "label": "Nameplate", "classification": "Structure Tag Missing", "severity": "Low", "status": "info", "x": 55, "y": 50, "width": 14, "height": 10, "aiGenerated": True},
    ]},
    {"id": "img-7", "structureId": "s4", "name": "IMG_1048", "filePath": "/assets/hero-pole.png", "status": "clear", "lat": 37.7733, "lng": -122.4122, "boxes": [
        {"id": "b14", "label": "Crossarm", "classification": "Crossarm Damage", "severity": "Low", "status": "clear", "x": 46, "y": 14, "width": 24, "height": 8, "aiGenerated": True},
    ]},
    {"id": "img-8", "structureId": "s2", "name": "IMG_1049", "filePath": "/assets/hero-pole.png", "status": "warning", "lat": 37.7666, "lng": -122.4288, "boxes": [
        {"id": "b15", "label": "Loose Hardware", "classification": "Hardware Loose", "severity": "Medium", "status": "warning", "x": 50, "y": 20, "width": 16, "height": 12, "aiGenerated": True},
    ]},
    {"id": "img-9", "structureId": "s3", "name": "IMG_1050", "filePath": "/assets/hero-pole.png", "status": "clear", "lat": 37.7899, "lng": -122.4011, "boxes": [
        {"id": "b16", "label": "Insulator", "classification": "Insulator Porcelain Flashed", "severity": "Low", "status": "clear", "x": 38, "y": 9, "width": 16, "height": 12, "aiGenerated": True},
    ]},
    {"id": "img-10", "structureId": "s4", "name": "IMG_1051", "filePath": "/assets/hero-pole.png", "status": "critical", "lat": 37.7644, "lng": -122.4166, "boxes": [
        {"id": "b17", "label": "Vegetation", "classification": "Vegetation Encroachment", "severity": "High", "status": "critical", "x": 10, "y": 22, "width": 48, "height": 60, "aiGenerated": True},
    ]},
]

SAMPLE_VIDEO = {
    "id": "vid-1",
    "structureId": "s1",
    "name": "TWR_1042_walkthrough",
    "filePath": "/assets/sample-inspection.mp4",
    "mediaType": "video",
    "durationMs": 13000,
    "status": "warning",
    "lat": 37.7812,
    "lng": -122.4051,
    "boxes": [
        {
            "id": "vb1",
            "label": "Insulator String",
            "classification": "Insulator Porcelain Flashed",
            "severity": "Medium",
            "status": "warning",
            "x": 42,
            "y": 18,
            "width": 14,
            "height": 12,
            "timestampMs": 2000,
            "aiGenerated": True,
        },
        {
            "id": "vb2",
            "label": "Vegetation",
            "classification": "Vegetation Encroachment",
            "severity": "High",
            "status": "warning",
            "x": 8,
            "y": 35,
            "width": 36,
            "height": 45,
            "timestampMs": 7800,
            "aiGenerated": True,
        },
        {
            "id": "vb3",
            "label": "Hardware",
            "classification": "Hardware Loose",
            "severity": "Low",
            "status": "clear",
            "x": 58,
            "y": 28,
            "width": 12,
            "height": 10,
            "timestampMs": 11200,
            "aiGenerated": True,
        },
    ],
}


INSPECTION_SCHEDULES = [
    {
        "id": "sch-1",
        "assetId": "s1",
        "scheduledAt": "2026-07-15",
        "frequencyDays": 365,
        "priority": "urgent",
        "status": "scheduled",
        "notes": "Annual transmission tower inspection",
    },
    {
        "id": "sch-2",
        "assetId": "s2",
        "scheduledAt": "2026-07-12",
        "frequencyDays": 180,
        "priority": "routine",
        "status": "scheduled",
        "notes": "Routine pole walkdown",
    },
    {
        "id": "sch-3",
        "assetId": "s5",
        "scheduledAt": "2026-07-05",
        "frequencyDays": 90,
        "priority": "urgent",
        "status": "scheduled",
        "notes": "Follow-up on critical insulator finding",
    },
    {
        "id": "sch-4",
        "assetId": "s3",
        "scheduledAt": "2026-06-20",
        "frequencyDays": 365,
        "priority": "routine",
        "status": "completed",
        "notes": "Completed Q2 inspection",
    },
]


def _insert_schedule(conn, schedule: dict) -> None:
    conn.execute(
        """
        INSERT INTO inspection_schedules (
          id, asset_id, scheduled_at, frequency_days, priority, status, notes, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            schedule["id"],
            schedule["assetId"],
            schedule["scheduledAt"],
            schedule.get("frequencyDays"),
            schedule.get("priority", "routine"),
            schedule.get("status", "scheduled"),
            schedule.get("notes"),
            schedule.get("completedAt"),
        ),
    )


def ensure_sample_schedules(conn) -> None:
    count = conn.execute("SELECT COUNT(*) FROM inspection_schedules").fetchone()[0]
    if count > 0:
        return

    for schedule in INSPECTION_SCHEDULES:
        asset = conn.execute("SELECT id FROM structures WHERE id = ?", (schedule["assetId"],)).fetchone()
        if asset:
            _insert_schedule(conn, schedule)


def _insert_media(conn, media: dict) -> None:
    media_type = media.get("mediaType", "image")
    duration_ms = media.get("durationMs")
    conn.execute(
        """INSERT INTO images (id, structure_id, folder_id, name, file_path, status, lat, lng, uploaded, media_type, duration_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
        (
            media["id"],
            media["structureId"],
            "folder-sample",
            media["name"],
            media["filePath"],
            media["status"],
            media["lat"],
            media["lng"],
            media_type,
            duration_ms,
        ),
    )
    for box in media["boxes"]:
        conn.execute(
            """INSERT INTO annotations
               (id, image_id, label, classification, severity, status, x, y, width, height,
                ai_generated, fault_highlight, default_selected, timestamp_ms)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                box["id"],
                media["id"],
                box["label"],
                box.get("classification", box["label"]),
                box.get("severity", "Low"),
                box["status"],
                box["x"],
                box["y"],
                box["width"],
                box["height"],
                1 if box.get("aiGenerated") else 0,
                1 if box.get("faultHighlight") else 0,
                1 if box.get("defaultSelected") else 0,
                box.get("timestampMs"),
            ),
        )


def ensure_sample_video(conn) -> None:
    exists = conn.execute("SELECT 1 FROM images WHERE id = ?", (SAMPLE_VIDEO["id"],)).fetchone()
    if exists:
        return

    structure = conn.execute(
        "SELECT id FROM structures WHERE id = ?", (SAMPLE_VIDEO["structureId"],)
    ).fetchone()
    if not structure:
        return

    folder = conn.execute("SELECT id FROM folders WHERE id = 'folder-sample'").fetchone()
    if not folder:
        conn.execute(
            "INSERT INTO folders (id, name, parent_id) VALUES (?, ?, ?)",
            ("folder-sample", "Sample Dataset", None),
        )

    _insert_media(conn, SAMPLE_VIDEO)


def seed_database(conn) -> None:
    conn.execute("INSERT INTO folders (id, name, parent_id) VALUES (?, ?, ?)", ("folder-sample", "Sample Dataset", None))
    conn.execute("INSERT INTO folders (id, name, parent_id) VALUES (?, ?, ?)", ("folder-uploads", "Uploads", None))

    for s in STRUCTURES:
        conn.execute(
            "INSERT INTO structures (id, name, type, lat, lng, status) VALUES (?, ?, ?, ?, ?, ?)",
            (s["id"], s["name"], s["type"], s["lat"], s["lng"], "active"),
        )

    for image in IMAGES:
        _insert_media(conn, image)

    _insert_media(conn, SAMPLE_VIDEO)

    for schedule in INSPECTION_SCHEDULES:
        _insert_schedule(conn, schedule)

    conn.execute(
        """INSERT INTO reports (id, title, summary, critical_count, image_count)
           VALUES (?, ?, ?, ?, ?)""",
        (
            "report-1",
            "Q2 Transmission Inspection Summary",
            "Critical vegetation and insulator faults identified across 3 structures. Recommended maintenance within 30 days.",
            3,
            11,
        ),
    )
