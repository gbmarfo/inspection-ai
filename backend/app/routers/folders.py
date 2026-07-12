import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..database import get_connection

router = APIRouter(prefix="/api/folders", tags=["folders"])


class FolderCreate(BaseModel):
    name: str
    parentId: Optional[str] = None


class FolderRename(BaseModel):
    name: str


def _folder_counts(conn, folder_id: str) -> tuple[int, int]:
    image_count = conn.execute(
        "SELECT COUNT(*) FROM images WHERE folder_id = ?", (folder_id,)
    ).fetchone()[0]
    child_count = conn.execute(
        "SELECT COUNT(*) FROM folders WHERE parent_id = ?", (folder_id,)
    ).fetchone()[0]
    return image_count, child_count


def _map_folder(row, image_count: int, child_count: int) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "parentId": row["parent_id"],
        "createdAt": row["created_at"],
        "imageCount": image_count,
        "childCount": child_count,
    }


def _breadcrumbs(conn, folder_id: Optional[str]) -> list[dict]:
    crumbs = []
    current = folder_id
    while current:
        row = conn.execute(
            "SELECT id, name, parent_id FROM folders WHERE id = ?", (current,)
        ).fetchone()
        if not row:
            break
        crumbs.insert(0, {"id": row["id"], "name": row["name"]})
        current = row["parent_id"]
    return crumbs


@router.get("")
def list_folders(parentId: Optional[str] = None):
    conn = get_connection()
    try:
        parent = None if parentId in (None, "root", "") else parentId
        rows = conn.execute(
            "SELECT * FROM folders WHERE parent_id IS ? ORDER BY name", (parent,)
        ).fetchall()
        return [_map_folder(row, *_folder_counts(conn, row["id"])) for row in rows]
    finally:
        conn.close()


@router.get("/{folder_id}")
def get_folder(folder_id: str):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM folders WHERE id = ?", (folder_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Folder not found")
        counts = _folder_counts(conn, folder_id)
        return {**_map_folder(row, *counts), "breadcrumbs": _breadcrumbs(conn, folder_id)}
    finally:
        conn.close()


@router.post("", status_code=201)
def create_folder(body: FolderCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")

    conn = get_connection()
    try:
        if body.parentId:
            parent = conn.execute("SELECT id FROM folders WHERE id = ?", (body.parentId,)).fetchone()
            if not parent:
                raise HTTPException(status_code=400, detail="Parent folder not found")

        folder_id = f"folder-{uuid.uuid4().hex[:8]}"
        conn.execute(
            "INSERT INTO folders (id, name, parent_id) VALUES (?, ?, ?)",
            (folder_id, name, body.parentId),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM folders WHERE id = ?", (folder_id,)).fetchone()
        return _map_folder(row, 0, 0)
    finally:
        conn.close()


@router.patch("/{folder_id}")
def rename_folder(folder_id: str, body: FolderRename):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")

    conn = get_connection()
    try:
        result = conn.execute("UPDATE folders SET name = ? WHERE id = ?", (name, folder_id))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Folder not found")
        conn.commit()
        row = conn.execute("SELECT * FROM folders WHERE id = ?", (folder_id,)).fetchone()
        return _map_folder(row, *_folder_counts(conn, folder_id))
    finally:
        conn.close()


@router.delete("/{folder_id}", status_code=204)
def delete_folder(folder_id: str):
    conn = get_connection()
    try:
        image_count, child_count = _folder_counts(conn, folder_id)
        if image_count > 0 or child_count > 0:
            raise HTTPException(status_code=409, detail="Folder must be empty before deleting")
        result = conn.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Folder not found")
        conn.commit()
    finally:
        conn.close()
