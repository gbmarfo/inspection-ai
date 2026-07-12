"""Export labeled PowerAI images to Ultralytics YOLO detection format."""

from __future__ import annotations

import random
import shutil
from pathlib import Path
from typing import Any

from ..config import DATA_DIR, PUBLIC_DIR
from ..mappers import get_all_images
from ..storage import MinioStorage, storage


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def _resolve_image_path(file_path: str) -> Path | None:
    if file_path.startswith("/assets/extracted/"):
        local = PUBLIC_DIR / "assets" / "extracted" / Path(file_path).name
        return local if local.is_file() else None

    if file_path.startswith("/assets/"):
        local = PUBLIC_DIR / "assets" / Path(file_path).name
        return local if local.is_file() else None

    if file_path.startswith("/uploads/"):
        try:
            object_key = MinioStorage.path_to_object_key(file_path)
            data, _ = storage.get_object(object_key)
            suffix = Path(file_path).suffix or ".jpg"
            temp_dir = DATA_DIR / "yolo-cache"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_path = temp_dir / Path(file_path).name
            if not temp_path.exists():
                temp_path.write_bytes(data)
            return temp_path
        except Exception:
            return None

    candidate = Path(file_path)
    return candidate if candidate.is_file() else None


def _percent_box_to_yolo(box: dict[str, Any]) -> tuple[float, float, float, float]:
    """Convert percent-based bbox (x,y,w,h in 0–100) to YOLO normalized cx,cy,w,h."""
    x = float(box["x"]) / 100.0
    y = float(box["y"]) / 100.0
    w = float(box["width"]) / 100.0
    h = float(box["height"]) / 100.0
    cx = max(0.0, min(1.0, x + w / 2.0))
    cy = max(0.0, min(1.0, y + h / 2.0))
    w = max(1e-6, min(1.0, w))
    h = max(1e-6, min(1.0, h))
    return cx, cy, w, h


def export_yolo_dataset(
    conn,
    job_id: str,
    train_split: int = 80,
) -> dict[str, Any]:
    """
    Build a YOLO dataset under backend/data/yolo-datasets/{job_id}/.

    Returns paths and class names for Ultralytics train(data=...).
    """
    images = [
        image
        for image in get_all_images(conn)
        if image.get("mediaType", "image") == "image" and image.get("boxes")
    ]
    if len(images) < 2:
        raise ValueError("Need at least 2 labeled images to export a training dataset")

    class_names: list[str] = []
    class_to_id: dict[str, int] = {}
    for image in images:
        for box in image["boxes"]:
            name = box.get("classification") or box.get("label")
            if not name:
                continue
            if name not in class_to_id:
                class_to_id[name] = len(class_names)
                class_names.append(name)

    if not class_names:
        raise ValueError("No class labels found in annotations")

    root = DATA_DIR / "yolo-datasets" / job_id
    if root.exists():
        shutil.rmtree(root)

    for split in ("train", "val"):
        (root / "images" / split).mkdir(parents=True, exist_ok=True)
        (root / "labels" / split).mkdir(parents=True, exist_ok=True)

    rng = random.Random(42)
    shuffled = list(images)
    rng.shuffle(shuffled)

    split_pct = max(50, min(95, int(train_split)))
    train_count = max(1, int(round(len(shuffled) * split_pct / 100)))
    if train_count >= len(shuffled):
        train_count = len(shuffled) - 1

    train_images = shuffled[:train_count]
    val_images = shuffled[train_count:]
    exported = {"train": 0, "val": 0}

    for split_name, split_images in (("train", train_images), ("val", val_images)):
        for image in split_images:
            src = _resolve_image_path(image["src"])
            if src is None:
                continue

            suffix = src.suffix.lower() if src.suffix.lower() in IMAGE_EXTENSIONS else ".jpg"
            stem = image["id"].replace("/", "_")
            dest_image = root / "images" / split_name / f"{stem}{suffix}"
            shutil.copy2(src, dest_image)

            label_lines: list[str] = []
            for box in image["boxes"]:
                name = box.get("classification") or box.get("label")
                if not name or name not in class_to_id:
                    continue
                cx, cy, w, h = _percent_box_to_yolo(box)
                label_lines.append(f"{class_to_id[name]} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")

            if not label_lines:
                dest_image.unlink(missing_ok=True)
                continue

            label_path = root / "labels" / split_name / f"{stem}.txt"
            label_path.write_text("\n".join(label_lines) + "\n", encoding="utf-8")
            exported[split_name] += 1

    if exported["train"] < 1 or exported["val"] < 1:
        raise ValueError(
            "Could not export enough images for train/val splits "
            f"(train={exported['train']}, val={exported['val']})"
        )

    data_yaml = root / "data.yaml"
    names_block = "\n".join(f"  {idx}: {name}" for idx, name in enumerate(class_names))
    data_yaml.write_text(
        (
            f"path: {root.as_posix()}\n"
            f"train: images/train\n"
            f"val: images/val\n"
            f"nc: {len(class_names)}\n"
            f"names:\n{names_block}\n"
        ),
        encoding="utf-8",
    )

    return {
        "root": str(root),
        "dataYaml": str(data_yaml),
        "classNames": class_names,
        "trainImages": exported["train"],
        "valImages": exported["val"],
    }
