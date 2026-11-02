import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..database import get_connection
from ..services.asset_classes import (
    fetch_checklist_items,
    get_asset_class,
    list_asset_classes,
    map_checklist_item,
)

router = APIRouter(prefix="/api/asset-classes", tags=["asset-classes"])


class AssetClassCreate(BaseModel):
    name: str = Field(min_length=1)
    description: Optional[str] = ""
    category: Optional[str] = ""


class AssetClassPatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None


class ChecklistItemCreate(BaseModel):
    label: str = Field(min_length=1)
    description: Optional[str] = ""
    required: Optional[bool] = True
    severityHint: Optional[str] = None
    sortOrder: Optional[int] = None


class ChecklistItemPatch(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    required: Optional[bool] = None
    severityHint: Optional[str] = None
    sortOrder: Optional[int] = None


@router.get("")
def get_asset_classes():
    conn = get_connection()
    try:
        return list_asset_classes(conn)
    finally:
        conn.close()


@router.get("/{class_id}")
def get_one_asset_class(class_id: str):
    conn = get_connection()
    try:
        asset_class = get_asset_class(conn, class_id)
        if not asset_class:
            raise HTTPException(status_code=404, detail="Asset class not found")
        return asset_class
    finally:
        conn.close()


@router.post("", status_code=201)
def create_asset_class(body: AssetClassCreate):
    conn = get_connection()
    try:
        class_id = f"class-{uuid.uuid4().hex[:8]}"
        conn.execute(
            """
            INSERT INTO asset_classes (id, name, description, category)
            VALUES (?, ?, ?, ?)
            """,
            (class_id, body.name.strip(), (body.description or "").strip(), (body.category or "").strip()),
        )
        conn.commit()
        asset_class = get_asset_class(conn, class_id)
        return asset_class
    finally:
        conn.close()


@router.patch("/{class_id}")
def update_asset_class(class_id: str, body: AssetClassPatch):
    conn = get_connection()
    try:
        existing = conn.execute("SELECT id FROM asset_classes WHERE id = ?", (class_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Asset class not found")

        fields = []
        values = []
        if body.name is not None:
            fields.append("name = ?")
            values.append(body.name.strip())
        if body.description is not None:
            fields.append("description = ?")
            values.append(body.description.strip())
        if body.category is not None:
            fields.append("category = ?")
            values.append(body.category.strip())
        if not fields:
            return get_asset_class(conn, class_id)

        values.append(class_id)
        conn.execute(f"UPDATE asset_classes SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
        return get_asset_class(conn, class_id)
    finally:
        conn.close()


@router.delete("/{class_id}", status_code=204)
def delete_asset_class(class_id: str):
    conn = get_connection()
    try:
        existing = conn.execute("SELECT id FROM asset_classes WHERE id = ?", (class_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Asset class not found")
        conn.execute("UPDATE structures SET class_id = NULL WHERE class_id = ?", (class_id,))
        conn.execute("DELETE FROM asset_classes WHERE id = ?", (class_id,))
        conn.commit()
    finally:
        conn.close()


@router.post("/{class_id}/checklist-items", status_code=201)
def create_checklist_item(class_id: str, body: ChecklistItemCreate):
    conn = get_connection()
    try:
        existing = conn.execute("SELECT id FROM asset_classes WHERE id = ?", (class_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Asset class not found")

        if body.sortOrder is None:
            row = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM checklist_items WHERE class_id = ?",
                (class_id,),
            ).fetchone()
            sort_order = int(row["next_order"])
        else:
            sort_order = body.sortOrder

        item_id = f"cli-{uuid.uuid4().hex[:8]}"
        conn.execute(
            """
            INSERT INTO checklist_items (
              id, class_id, label, description, required, sort_order, severity_hint
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                class_id,
                body.label.strip(),
                (body.description or "").strip(),
                1 if body.required else 0,
                sort_order,
                body.severityHint,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM checklist_items WHERE id = ?", (item_id,)).fetchone()
        return map_checklist_item(row)
    finally:
        conn.close()


@router.patch("/{class_id}/checklist-items/{item_id}")
def update_checklist_item(class_id: str, item_id: str, body: ChecklistItemPatch):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT * FROM checklist_items WHERE id = ? AND class_id = ?",
            (item_id, class_id),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Checklist item not found")

        fields = []
        values = []
        if body.label is not None:
            fields.append("label = ?")
            values.append(body.label.strip())
        if body.description is not None:
            fields.append("description = ?")
            values.append(body.description.strip())
        if body.required is not None:
            fields.append("required = ?")
            values.append(1 if body.required else 0)
        if body.severityHint is not None:
            fields.append("severity_hint = ?")
            values.append(body.severityHint)
        if body.sortOrder is not None:
            fields.append("sort_order = ?")
            values.append(body.sortOrder)
        if fields:
            values.extend([item_id, class_id])
            conn.execute(
                f"UPDATE checklist_items SET {', '.join(fields)} WHERE id = ? AND class_id = ?",
                values,
            )
            conn.commit()

        row = conn.execute(
            "SELECT * FROM checklist_items WHERE id = ? AND class_id = ?",
            (item_id, class_id),
        ).fetchone()
        return map_checklist_item(row)
    finally:
        conn.close()


@router.delete("/{class_id}/checklist-items/{item_id}", status_code=204)
def delete_checklist_item(class_id: str, item_id: str):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM checklist_items WHERE id = ? AND class_id = ?",
            (item_id, class_id),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Checklist item not found")
        conn.execute(
            "DELETE FROM checklist_items WHERE id = ? AND class_id = ?",
            (item_id, class_id),
        )
        conn.commit()
    finally:
        conn.close()


@router.get("/{class_id}/checklist")
def get_class_checklist(class_id: str):
    conn = get_connection()
    try:
        existing = conn.execute("SELECT id FROM asset_classes WHERE id = ?", (class_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Asset class not found")
        return fetch_checklist_items(conn, class_id)
    finally:
        conn.close()
