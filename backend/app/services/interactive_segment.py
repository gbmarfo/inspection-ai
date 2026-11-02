"""RITM click-based interactive segmentation.

Uses the Samsung / Supervisely RITM (ITER-M) model:
https://github.com/supervisely-ecosystem/ritm-interactive-segmentation

Positive / negative clicks refine a foreground mask. When previous polygon
points are provided, they are fed as the previous-step mask (ITER-M).
"""

from __future__ import annotations

import base64
import logging
import os
import sys
import threading
import urllib.request
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np

from .yolo_dataset import _resolve_image_path

logger = logging.getLogger(__name__)

_VENDOR_DIR = Path(__file__).resolve().parents[2] / "vendor"
if str(_VENDOR_DIR) not in sys.path:
    sys.path.insert(0, str(_VENDOR_DIR))

_WEIGHTS_DIR = Path(__file__).resolve().parents[2] / "weights"
_DEFAULT_CHECKPOINT_NAME = "coco_lvis_h18s_itermask.pth"
_DEFAULT_CHECKPOINT_URL = (
    "https://github.com/supervisely-ecosystem/ritm-interactive-segmentation/"
    "releases/download/v0.1/coco_lvis_h18s_itermask.pth"
)

CLICK_RADIUS = 8  # unused by RITM; kept for API docs symmetry
MAX_POLYGON_POINTS = 80
PROB_THRESH = 0.49
MAX_LONGEST_SIDE = int(os.getenv("POWERAI_RITM_MAX_SIZE", "800"))

_model_lock = threading.Lock()
_predictor = None
_device = None


class InteractiveSegmentError(Exception):
    pass


def _load_bgr(file_path: str) -> np.ndarray:
    path = _resolve_image_path(file_path)
    if path is None:
        raise InteractiveSegmentError(f"Could not resolve image path: {file_path}")
    image = cv2.imread(str(path))
    if image is None:
        raise InteractiveSegmentError(f"Failed to read image: {path}")
    return image


def _percent_to_pixel(x_pct: float, y_pct: float, width: int, height: int) -> tuple[int, int]:
    x = int(round(max(0.0, min(100.0, x_pct)) / 100.0 * (width - 1)))
    y = int(round(max(0.0, min(100.0, y_pct)) / 100.0 * (height - 1)))
    return x, y


def _pixel_to_percent(x: float, y: float, width: int, height: int) -> list[float]:
    return [
        round(x / max(width - 1, 1) * 100.0, 4),
        round(y / max(height - 1, 1) * 100.0, 4),
    ]


def _largest_contour_polygon(binary: np.ndarray) -> Optional[np.ndarray]:
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) < 16:
        return None
    peri = cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, max(1.5, 0.004 * peri), True)
    if len(approx) < 3:
        return None
    while len(approx) > MAX_POLYGON_POINTS:
        peri = cv2.arcLength(approx, True)
        approx = cv2.approxPolyDP(approx, peri * 0.01, True)
        if len(approx) <= 3:
            break
    return approx.reshape(-1, 2)


def _bbox_from_points(points_pct: list[list[float]]) -> dict[str, float]:
    xs = [p[0] for p in points_pct]
    ys = [p[1] for p in points_pct]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    return {
        "x": round(min_x, 4),
        "y": round(min_y, 4),
        "width": round(max(0.1, max_x - min_x), 4),
        "height": round(max(0.1, max_y - min_y), 4),
    }


def _mask_preview_png(binary: np.ndarray) -> str:
    rgba = np.zeros((binary.shape[0], binary.shape[1], 4), dtype=np.uint8)
    rgba[binary > 0] = (34, 197, 94, 110)
    ok, buf = cv2.imencode(".png", rgba)
    if not ok:
        return ""
    return base64.b64encode(buf.tobytes()).decode("ascii")


def _checkpoint_path() -> Path:
    override = os.getenv("POWERAI_RITM_CHECKPOINT", "").strip()
    if override:
        return Path(override).expanduser()
    return _WEIGHTS_DIR / _DEFAULT_CHECKPOINT_NAME


def _ensure_checkpoint(path: Path) -> Path:
    if path.is_file():
        return path
    if path != _WEIGHTS_DIR / _DEFAULT_CHECKPOINT_NAME:
        raise InteractiveSegmentError(
            f"RITM checkpoint not found: {path}. "
            "Set POWERAI_RITM_CHECKPOINT to a valid .pth file."
        )
    _WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".pth.download")
    logger.info("Downloading RITM checkpoint to %s", path)
    try:
        urllib.request.urlretrieve(_DEFAULT_CHECKPOINT_URL, tmp)
        tmp.replace(path)
    except Exception as exc:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        raise InteractiveSegmentError(
            f"Failed to download RITM checkpoint from {_DEFAULT_CHECKPOINT_URL}: {exc}"
        ) from exc
    return path


def _get_predictor():
    global _predictor, _device
    if _predictor is not None:
        return _predictor, _device

    with _model_lock:
        if _predictor is not None:
            return _predictor, _device

        try:
            import torch
            from isegm.inference.predictors import get_predictor
            from isegm.utils.serialization import load_model
        except ImportError as exc:
            raise InteractiveSegmentError(
                "RITM dependencies missing. Install torch/torchvision in the backend venv."
            ) from exc

        ckpt_path = _ensure_checkpoint(_checkpoint_path())
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        state = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        # cpu_dist_maps=False uses the pure-torch distance maps (no Cython build).
        model = load_model(state["config"], cpu_dist_maps=False)
        model.load_state_dict(state["state_dict"], strict=False)
        model.to(device)
        model.eval()

        predictor = get_predictor(
            model,
            brs_mode="NoBRS",
            device=device,
            prob_thresh=PROB_THRESH,
            with_flip=True,
            zoom_in_params=None,
            predictor_params={"max_size": MAX_LONGEST_SIDE},
        )
        _predictor = predictor
        _device = device
        logger.info("Loaded RITM model from %s on %s", ckpt_path, device)
        return _predictor, _device


def _previous_mask_tensor(
    previous_points: Optional[list[list[float]]],
    height: int,
    width: int,
    device,
):
    import torch

    mask = np.zeros((height, width), dtype=np.float32)
    if previous_points and len(previous_points) >= 3:
        pts = np.array(
            [_percent_to_pixel(float(p[0]), float(p[1]), width, height) for p in previous_points],
            dtype=np.int32,
        )
        cv2.fillPoly(mask, [pts], 1.0)
    return torch.from_numpy(mask)[None, None].to(device)


def _run_ritm(
    image_bgr: np.ndarray,
    clicks: list[dict[str, Any]],
    previous_points: Optional[list[list[float]]],
) -> tuple[np.ndarray, str]:
    import torch
    from isegm.inference.clicker import Click, Clicker

    if not any(int(c.get("label", 1)) > 0 for c in clicks):
        raise InteractiveSegmentError("Add at least one positive (foreground) click")

    predictor, device = _get_predictor()
    height, width = image_bgr.shape[:2]
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

    clicker = Clicker()
    for click in clicks:
        x, y = _percent_to_pixel(float(click["x"]), float(click["y"]), width, height)
        # RITM Click coords are (row/y, col/x)
        clicker.add_click(Click(is_positive=int(click.get("label", 1)) > 0, coords=(y, x)))

    prev_mask = _previous_mask_tensor(previous_points, height, width, device)

    with _model_lock:
        predictor.set_input_image(image_rgb)
        with torch.no_grad():
            prob = predictor.get_prediction(clicker, prev_mask=prev_mask)

    binary = (prob > PROB_THRESH).astype(np.uint8) * 255
    kernel = np.ones((3, 3), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)
    return binary, "ritm"


def run_interactive_segmentation(
    file_path: str,
    clicks: list[dict[str, Any]],
    previous_points: Optional[list[list[float]]] = None,
) -> dict[str, Any]:
    if not clicks:
        raise InteractiveSegmentError("At least one click is required")

    image = _load_bgr(file_path)
    height, width = image.shape[:2]

    binary, engine = _run_ritm(image, clicks, previous_points)

    polygon = _largest_contour_polygon(binary)
    if polygon is None:
        raise InteractiveSegmentError(
            "Could not form a segment from the current clicks. Add more positive clicks on the object."
        )

    points = [_pixel_to_percent(float(x), float(y), width, height) for x, y in polygon]
    bbox = _bbox_from_points(points)
    return {
        "points": points,
        **bbox,
        "engine": engine,
        "previewMaskBase64": _mask_preview_png(binary),
        "clickCount": len(clicks),
    }
