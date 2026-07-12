import io
import os
import tempfile
import zipfile
from typing import Any, Iterator

import shapefile

NAME_FIELDS = [
    "name",
    "NAME",
    "Name",
    "ASSET_NAME",
    "asset_name",
    "STRUCTURE",
    "STRUCT_ID",
    "structure_id",
    "ID",
    "id",
    "FACILITY",
]
TYPE_FIELDS = ["type", "TYPE", "Type", "ASSET_TYPE", "asset_type", "class", "CLASS", "CATEGORY"]


def _pick_field(record: dict[str, Any], candidates: list[str]) -> str | None:
    for key in candidates:
        if key in record and record[key] not in (None, ""):
            value = str(record[key]).strip()
            if value:
                return value
    return None


def _records_as_dicts(reader: shapefile.Reader) -> list[dict[str, Any]]:
    fields = [field[0] for field in reader.fields[1:]]
    return [dict(zip(fields, record)) for record in reader.records()]


def _lat_lng_from_shape(shape: shapefile._Shape) -> tuple[float, float]:
    if not shape.points:
        raise ValueError("Geometry has no coordinates")

    if shape.shapeType in (
        shapefile.POINT,
        shapefile.POINTZ,
        shapefile.POINTM,
        shapefile.MULTIPOINT,
        shapefile.MULTIPOINTZ,
        shapefile.MULTIPOINTM,
    ):
        lng, lat = shape.points[0]
        return lat, lng

    lngs = [point[0] for point in shape.points]
    lats = [point[1] for point in shape.points]
    return sum(lats) / len(lats), sum(lngs) / len(lngs)


def _iter_reader(reader: shapefile.Reader) -> Iterator[dict[str, Any]]:
    records = _records_as_dicts(reader)
    for index, shape in enumerate(reader.shapes()):
        if shape.shapeType == shapefile.NULL:
            continue
        record = records[index] if index < len(records) else {}
        lat, lng = _lat_lng_from_shape(shape)
        yield {
            "name": _pick_field(record, NAME_FIELDS) or f"Asset {index + 1}",
            "type": _pick_field(record, TYPE_FIELDS) or "Imported",
            "lat": lat,
            "lng": lng,
        }


def _open_reader_from_directory(directory: str) -> shapefile.Reader:
    shp_files = [name for name in os.listdir(directory) if name.lower().endswith(".shp")]
    if not shp_files:
        raise ValueError("Archive does not contain a .shp file")
    base_path = os.path.join(directory, os.path.splitext(shp_files[0])[0])
    return shapefile.Reader(base_path)


def iter_shapefile_features(data: bytes, filename: str) -> Iterator[dict[str, Any]]:
    lower_name = (filename or "").lower()
    if lower_name.endswith(".zip"):
        with tempfile.TemporaryDirectory() as temp_dir:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                archive.extractall(temp_dir)
            reader = _open_reader_from_directory(temp_dir)
            yield from _iter_reader(reader)
        return

    if lower_name.endswith(".shp"):
        with tempfile.TemporaryDirectory() as temp_dir:
            shp_path = os.path.join(temp_dir, "upload.shp")
            with open(shp_path, "wb") as handle:
                handle.write(data)
            reader = shapefile.Reader(os.path.join(temp_dir, "upload"))
            yield from _iter_reader(reader)
        return

    raise ValueError("Upload a .zip shapefile bundle or a .shp file with its sidecar files in a zip")
