import io
import logging
from typing import Optional

from minio import Minio
from minio.error import S3Error

from .config import (
    MINIO_ACCESS_KEY,
    MINIO_BUCKET,
    MINIO_ENDPOINT,
    MINIO_SECRET_KEY,
    MINIO_SECURE,
)

logger = logging.getLogger(__name__)


class MinioStorage:
    def __init__(self) -> None:
        self.client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )
        self.bucket = MINIO_BUCKET

    def ensure_bucket(self) -> None:
        try:
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)
                logger.info("Created MinIO bucket: %s", self.bucket)
        except S3Error as exc:
            logger.warning("MinIO bucket setup failed: %s", exc)
            raise

    def upload(self, object_key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(
            self.bucket,
            object_key,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

    def get_object(self, object_key: str) -> tuple[bytes, Optional[str]]:
        response = self.client.get_object(self.bucket, object_key)
        try:
            data = response.read()
            content_type = response.headers.get("Content-Type")
            return data, content_type
        finally:
            response.close()
            response.release_conn()

    def delete(self, object_key: str) -> None:
        try:
            self.client.remove_object(self.bucket, object_key)
        except S3Error as exc:
            logger.warning("Failed to delete MinIO object %s: %s", object_key, exc)

    @staticmethod
    def path_to_object_key(file_path: str) -> str:
        return file_path.lstrip("/")

    @staticmethod
    def object_key_to_path(object_key: str) -> str:
        return f"/{object_key}"


storage = MinioStorage()
