"""Asset classes and inspection checklist helpers."""

from __future__ import annotations

import uuid
from typing import Any, Optional

SAMPLE_ASSET_CLASSES = [
    {
        "id": "class-transmission",
        "name": "Transmission Tower",
        "description": "Lattice or tubular transmission structure inspection template.",
        "category": "Transmission",
        "items": [
            {
                "label": "Structure condition",
                "description": "Check tower legs, bracing, and foundations for corrosion, bending, or missing members.",
                "required": True,
                "severityHint": "High",
            },
            {
                "label": "Insulator strings",
                "description": "Inspect porcelain/polymer insulators for flashover, chips, or contamination.",
                "required": True,
                "severityHint": "Critical",
            },
            {
                "label": "Hardware & fittings",
                "description": "Verify clamps, bolts, dampers, and armor rods are secure.",
                "required": True,
                "severityHint": "Medium",
            },
            {
                "label": "Conductors & jumpers",
                "description": "Look for broken strands, bird-caging, and clearance issues.",
                "required": True,
                "severityHint": "High",
            },
            {
                "label": "Grounding & bonding",
                "description": "Confirm grounding connections are intact and corrosion-free.",
                "required": False,
                "severityHint": "Medium",
            },
            {
                "label": "Vegetation / right-of-way",
                "description": "Note encroachment that may contact conductors or restrict access.",
                "required": False,
                "severityHint": "High",
            },
            {
                "label": "Structure identification",
                "description": "Verify structure tag/number is present and readable.",
                "required": True,
                "severityHint": "Low",
            },
        ],
    },
    {
        "id": "class-distribution",
        "name": "Distribution Pole",
        "description": "Wood, steel, or composite distribution pole inspection template.",
        "category": "Distribution",
        "items": [
            {
                "label": "Pole integrity",
                "description": "Check for lean, rot, cracks, insect damage, or impact damage.",
                "required": True,
                "severityHint": "Critical",
            },
            {
                "label": "Crossarm & braces",
                "description": "Inspect crossarm, braces, and mounting hardware for decay or breakage.",
                "required": True,
                "severityHint": "High",
            },
            {
                "label": "Insulators",
                "description": "Check pin/post/polymer insulators for chips, flashover, or missing hardware.",
                "required": True,
                "severityHint": "High",
            },
            {
                "label": "Transformers & attachments",
                "description": "Inspect transformers, cutouts, and attached equipment if present.",
                "required": False,
                "severityHint": "Medium",
            },
            {
                "label": "Guy wires & anchors",
                "description": "Verify guys, anchors, and guards are present and properly tensioned.",
                "required": False,
                "severityHint": "Medium",
            },
            {
                "label": "Vegetation clearance",
                "description": "Record vegetation contact risk around conductors and the pole.",
                "required": True,
                "severityHint": "High",
            },
            {
                "label": "Pole tag / identification",
                "description": "Confirm pole number and hazard markers are readable.",
                "required": True,
                "severityHint": "Low",
            },
        ],
    },
]


def map_checklist_item(row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "classId": row["class_id"],
        "label": row["label"],
        "description": row["description"] or "",
        "required": bool(row["required"]),
        "sortOrder": row["sort_order"],
        "severityHint": row["severity_hint"],
    }


def map_asset_class(row, items: Optional[list[dict[str, Any]]] = None, asset_count: int = 0) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
        "category": row["category"] or "",
        "createdAt": row["created_at"],
        "itemCount": len(items) if items is not None else row["item_count"] if "item_count" in row.keys() else 0,
        "assetCount": asset_count if asset_count is not None else (row["asset_count"] if "asset_count" in row.keys() else 0),
        "checklist": items or [],
    }


def fetch_checklist_items(conn, class_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT *
        FROM checklist_items
        WHERE class_id = ?
        ORDER BY sort_order ASC, label ASC
        """,
        (class_id,),
    ).fetchall()
    return [map_checklist_item(row) for row in rows]


def get_asset_class(conn, class_id: str) -> Optional[dict[str, Any]]:
    row = conn.execute(
        """
        SELECT
          c.*,
          (SELECT COUNT(*) FROM checklist_items i WHERE i.class_id = c.id) AS item_count,
          (SELECT COUNT(*) FROM structures s WHERE s.class_id = c.id) AS asset_count
        FROM asset_classes c
        WHERE c.id = ?
        """,
        (class_id,),
    ).fetchone()
    if not row:
        return None
    items = fetch_checklist_items(conn, class_id)
    return map_asset_class(row, items=items, asset_count=row["asset_count"])


def list_asset_classes(conn) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
          c.*,
          (SELECT COUNT(*) FROM checklist_items i WHERE i.class_id = c.id) AS item_count,
          (SELECT COUNT(*) FROM structures s WHERE s.class_id = c.id) AS asset_count
        FROM asset_classes c
        ORDER BY c.name ASC
        """
    ).fetchall()
    result = []
    for row in rows:
        items = fetch_checklist_items(conn, row["id"])
        result.append(map_asset_class(row, items=items, asset_count=row["asset_count"]))
    return result


def ensure_sample_asset_classes(conn) -> None:
    count = conn.execute("SELECT COUNT(*) FROM asset_classes").fetchone()[0]
    if count > 0:
        # Still backfill class_id on existing seed assets when possible
        _link_seed_assets(conn)
        return

    for class_def in SAMPLE_ASSET_CLASSES:
        conn.execute(
            """
            INSERT INTO asset_classes (id, name, description, category)
            VALUES (?, ?, ?, ?)
            """,
            (
                class_def["id"],
                class_def["name"],
                class_def["description"],
                class_def["category"],
            ),
        )
        for index, item in enumerate(class_def["items"]):
            conn.execute(
                """
                INSERT INTO checklist_items (
                  id, class_id, label, description, required, sort_order, severity_hint
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"cli-{uuid.uuid4().hex[:8]}",
                    class_def["id"],
                    item["label"],
                    item["description"],
                    1 if item["required"] else 0,
                    index,
                    item.get("severityHint"),
                ),
            )

    _link_seed_assets(conn)


def _link_seed_assets(conn) -> None:
    """Map seeded Transmission/Distribution assets onto matching classes when unset."""
    mappings = [
        ("Transmission", "class-transmission"),
        ("Distribution", "class-distribution"),
    ]
    for asset_type, class_id in mappings:
        exists = conn.execute("SELECT id FROM asset_classes WHERE id = ?", (class_id,)).fetchone()
        if not exists:
            continue
        conn.execute(
            """
            UPDATE structures
            SET class_id = ?
            WHERE class_id IS NULL AND lower(type) = lower(?)
            """,
            (class_id, asset_type),
        )
