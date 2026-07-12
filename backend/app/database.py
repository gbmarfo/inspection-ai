import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .config import DATA_DIR

DB_PATH = DATA_DIR / "powerai.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def db_session() -> Iterator[sqlite3.Connection]:
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_database() -> None:
    with db_session() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS structures (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              type TEXT NOT NULL,
              lat REAL NOT NULL,
              lng REAL NOT NULL,
              status TEXT NOT NULL DEFAULT 'active'
            );

            CREATE TABLE IF NOT EXISTS folders (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              parent_id TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS images (
              id TEXT PRIMARY KEY,
              structure_id TEXT,
              folder_id TEXT,
              name TEXT NOT NULL,
              file_path TEXT NOT NULL,
              status TEXT NOT NULL,
              lat REAL NOT NULL,
              lng REAL NOT NULL,
              uploaded INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (structure_id) REFERENCES structures(id),
              FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS annotations (
              id TEXT PRIMARY KEY,
              image_id TEXT NOT NULL,
              label TEXT NOT NULL,
              classification TEXT,
              severity TEXT,
              status TEXT NOT NULL,
              x REAL NOT NULL,
              y REAL NOT NULL,
              width REAL NOT NULL,
              height REAL NOT NULL,
              points TEXT,
              ai_generated INTEGER NOT NULL DEFAULT 0,
              fault_highlight INTEGER NOT NULL DEFAULT 0,
              default_selected INTEGER NOT NULL DEFAULT 0,
              FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS training_jobs (
              id TEXT PRIMARY KEY,
              model_id TEXT NOT NULL,
              model_name TEXT NOT NULL,
              status TEXT NOT NULL,
              progress INTEGER NOT NULL DEFAULT 0,
              current_epoch INTEGER NOT NULL DEFAULT 0,
              total_epochs INTEGER NOT NULL,
              config_json TEXT NOT NULL,
              metrics_json TEXT,
              started_at TEXT NOT NULL,
              completed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS reports (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              summary TEXT NOT NULL,
              critical_count INTEGER NOT NULL,
              image_count INTEGER NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS service_requests (
              id TEXT PRIMARY KEY,
              annotation_id TEXT NOT NULL,
              image_id TEXT NOT NULL,
              structure_id TEXT,
              classification TEXT NOT NULL,
              severity TEXT NOT NULL,
              priority TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'open',
              title TEXT NOT NULL,
              description TEXT,
              sla_days INTEGER NOT NULL,
              lat REAL NOT NULL,
              lng REAL NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              FOREIGN KEY (annotation_id) REFERENCES annotations(id) ON DELETE CASCADE,
              FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
            );
            """
        )
        _migrate_folders(conn)
        _migrate_mlflow(conn)
        _migrate_polygons(conn)
        _migrate_service_requests(conn)
        _migrate_media(conn)
        _migrate_inspection_schedules(conn)
        from .seed import ensure_sample_schedules, ensure_sample_video

        ensure_sample_video(conn)
        ensure_sample_schedules(conn)
        count = conn.execute("SELECT COUNT(*) FROM images").fetchone()[0]
        if count == 0:
            from .seed import seed_database

            seed_database(conn)


def _migrate_folders(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(images)")}
    if "folder_id" not in cols:
        conn.execute(
            "ALTER TABLE images ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL"
        )

    folder_count = conn.execute("SELECT COUNT(*) FROM folders").fetchone()[0]
    image_count = conn.execute("SELECT COUNT(*) FROM images").fetchone()[0]
    if folder_count > 0 or image_count == 0:
        return

    conn.executescript(
        """
        INSERT INTO folders (id, name, parent_id) VALUES
          ('folder-sample', 'Sample Dataset', NULL),
          ('folder-uploads', 'Uploads', NULL);
        UPDATE images SET folder_id = 'folder-sample' WHERE uploaded = 0 AND folder_id IS NULL;
        UPDATE images SET folder_id = 'folder-uploads' WHERE uploaded = 1 AND folder_id IS NULL;
        """
    )


def _migrate_mlflow(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(training_jobs)")}
    if "mlflow_run_id" not in cols:
        conn.execute("ALTER TABLE training_jobs ADD COLUMN mlflow_run_id TEXT")
    if "mlflow_model_name" not in cols:
        conn.execute("ALTER TABLE training_jobs ADD COLUMN mlflow_model_name TEXT")
    if "mlflow_model_version" not in cols:
        conn.execute("ALTER TABLE training_jobs ADD COLUMN mlflow_model_version TEXT")


def _migrate_polygons(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(annotations)")}
    if "points" not in cols:
        conn.execute("ALTER TABLE annotations ADD COLUMN points TEXT")


def _migrate_media(conn: sqlite3.Connection) -> None:
    image_cols = {row[1] for row in conn.execute("PRAGMA table_info(images)")}
    if "media_type" not in image_cols:
        conn.execute("ALTER TABLE images ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image'")
    if "duration_ms" not in image_cols:
        conn.execute("ALTER TABLE images ADD COLUMN duration_ms INTEGER")

    annotation_cols = {row[1] for row in conn.execute("PRAGMA table_info(annotations)")}
    if "timestamp_ms" not in annotation_cols:
        conn.execute("ALTER TABLE annotations ADD COLUMN timestamp_ms INTEGER")


def _migrate_inspection_schedules(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS inspection_schedules (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          scheduled_at TEXT NOT NULL,
          frequency_days INTEGER,
          priority TEXT NOT NULL DEFAULT 'routine',
          status TEXT NOT NULL DEFAULT 'scheduled',
          notes TEXT,
          completed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (asset_id) REFERENCES structures(id) ON DELETE CASCADE
        )
        """
    )


def _migrate_service_requests(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS service_requests (
          id TEXT PRIMARY KEY,
          annotation_id TEXT NOT NULL,
          image_id TEXT NOT NULL,
          structure_id TEXT,
          classification TEXT NOT NULL,
          severity TEXT NOT NULL,
          priority TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          title TEXT NOT NULL,
          description TEXT,
          sla_days INTEGER NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (annotation_id) REFERENCES annotations(id) ON DELETE CASCADE,
          FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
        )
        """
    )
