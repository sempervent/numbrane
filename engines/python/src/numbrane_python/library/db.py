"""Library database operations."""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from numbrane_python.library.models import RunFeatures, RunMetrics, RunRecord
from numbrane_python.library.paths import get_library_db_path


class LibraryDB:
    """Library database interface."""

    def __init__(self, db_path: Path | None = None):
        """Initialize database.

        Args:
            db_path: Path to database file (default: library root)
        """
        self.db_path = db_path or get_library_db_path()
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        """Ensure database schema exists."""
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        # Main runs table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                sketch_name TEXT NOT NULL,
                seed INTEGER NOT NULL,
                param_hash TEXT NOT NULL,
                provenance_hash TEXT NOT NULL,
                output_hash TEXT,

                output_path TEXT NOT NULL,
                thumb_path TEXT NOT NULL,
                preview_path TEXT,

                base_config TEXT NOT NULL,
                meta_controls TEXT NOT NULL,
                resolved_config TEXT NOT NULL,

                tags TEXT,
                notes TEXT,
                title TEXT,

                metrics TEXT,
                features TEXT,

                provenance TEXT NOT NULL,

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,

                sketch_version TEXT,
                genart_version TEXT,
                git_commit TEXT,
                platform_info TEXT
            )
        """)

        # Tags table for efficient tag queries
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS run_tags (
                run_id TEXT NOT NULL,
                tag TEXT NOT NULL,
                PRIMARY KEY (run_id, tag),
                FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
            )
        """)

        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sketch ON runs(sketch_name)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_param_hash ON runs(param_hash)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON runs(created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tag ON run_tags(tag)")

        # Check for JSON1 support
        cursor.execute("PRAGMA compile_options")
        compile_options = [row[0] for row in cursor.fetchall()]
        has_json1 = any("JSON1" in opt for opt in compile_options)

        conn.commit()
        conn.close()

    def add_run(self, record: RunRecord) -> None:
        """Add a run record.

        Args:
            record: Run record to add
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        # Convert to dict for storage
        data = record.to_dict()

        # Insert or replace
        cursor.execute(
            """
            INSERT OR REPLACE INTO runs (
                run_id, sketch_name, seed, param_hash, provenance_hash, output_hash,
                output_path, thumb_path, preview_path,
                base_config, meta_controls, resolved_config,
                tags, notes, title,
                metrics, features,
                provenance,
                created_at, updated_at,
                sketch_version, genart_version, git_commit, platform_info
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                record.run_id,
                record.sketch_name,
                record.seed,
                record.param_hash,
                record.provenance_hash,
                record.output_hash,
                record.output_path,
                record.thumb_path,
                record.preview_path or "",
                json.dumps(record.base_config),
                json.dumps(record.meta_controls),
                json.dumps(record.resolved_config),
                json.dumps(record.tags),
                record.notes,
                record.title,
                json.dumps(record.metrics.to_dict()) if record.metrics else None,
                json.dumps(record.features.to_dict()) if record.features else None,
                json.dumps(record.provenance),
                data["created_at"],
                data["updated_at"],
                record.sketch_version,
                record.genart_version,
                record.git_commit,
                json.dumps(record.platform_info),
            ),
        )

        # Update tags
        cursor.execute("DELETE FROM run_tags WHERE run_id = ?", (record.run_id,))
        for tag in record.tags:
            cursor.execute("INSERT INTO run_tags (run_id, tag) VALUES (?, ?)", (record.run_id, tag))

        conn.commit()
        conn.close()

    def get_run(self, run_id: str) -> RunRecord | None:
        """Get a run record.

        Args:
            run_id: Run identifier

        Returns:
            Run record or None
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,))
        row = cursor.fetchone()

        if not row:
            conn.close()
            return None

        # Fetch tags
        cursor.execute("SELECT tag FROM run_tags WHERE run_id = ?", (run_id,))
        tags = [r[0] for r in cursor.fetchall()]

        conn.close()

        # Convert row to dict
        data = dict(row)
        data["tags"] = tags

        # Parse JSON fields
        data["base_config"] = json.loads(data["base_config"])
        data["meta_controls"] = json.loads(data["meta_controls"])
        data["resolved_config"] = json.loads(data["resolved_config"])
        if data["metrics"]:
            data["metrics"] = RunMetrics.from_dict(json.loads(data["metrics"]))
        if data["features"]:
            data["features"] = RunFeatures.from_dict(json.loads(data["features"]))
        data["provenance"] = json.loads(data["provenance"])
        if data["tags"]:
            data["tags"] = (
                json.loads(data["tags"]) if isinstance(data["tags"], str) else data["tags"]
            )
        if data["platform_info"]:
            data["platform_info"] = json.loads(data["platform_info"])

        return RunRecord.from_dict(data)

    def list_runs(
        self,
        sketch_name: str | None = None,
        tags: list[str] | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[RunRecord]:
        """List runs with filters.

        Args:
            sketch_name: Filter by sketch name
            tags: Filter by tags
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of run records
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        query = "SELECT DISTINCT r.* FROM runs r"
        params = []

        if tags:
            query += " JOIN run_tags rt ON r.run_id = rt.run_id"
            query += " WHERE rt.tag IN (" + ",".join("?" * len(tags)) + ")"
            params.extend(tags)
            if sketch_name:
                query += " AND r.sketch_name = ?"
                params.append(sketch_name)
        elif sketch_name:
            query += " WHERE r.sketch_name = ?"
            params.append(sketch_name)

        query += " ORDER BY r.created_at DESC"

        if limit:
            query += " LIMIT ? OFFSET ?"
            params.extend([limit, offset])

        cursor.execute(query, params)
        rows = cursor.fetchall()

        # Fetch tags for each run
        run_ids = [row["run_id"] for row in rows]
        tags_map = {}
        if run_ids:
            placeholders = ",".join("?" * len(run_ids))
            cursor.execute(
                f"SELECT run_id, tag FROM run_tags WHERE run_id IN ({placeholders})", run_ids
            )
            for row in cursor.fetchall():
                if row[0] not in tags_map:
                    tags_map[row[0]] = []
                tags_map[row[0]].append(row[1])

        conn.close()

        # Convert to records
        records = []
        for row in rows:
            data = dict(row)
            data["tags"] = tags_map.get(data["run_id"], [])

            # Parse JSON
            data["base_config"] = json.loads(data["base_config"])
            data["meta_controls"] = json.loads(data["meta_controls"])
            data["resolved_config"] = json.loads(data["resolved_config"])
            if data["metrics"]:
                data["metrics"] = RunMetrics.from_dict(json.loads(data["metrics"]))
            if data["features"]:
                data["features"] = RunFeatures.from_dict(json.loads(data["features"]))
            data["provenance"] = json.loads(data["provenance"])
            if data["platform_info"]:
                data["platform_info"] = json.loads(data["platform_info"])

            records.append(RunRecord.from_dict(data))

        return records

    def search_runs(
        self, where_clause: str, params: list[Any], limit: int | None = None
    ) -> list[RunRecord]:
        """Search runs with custom WHERE clause.

        Args:
            where_clause: SQL WHERE clause
            params: Query parameters
            limit: Maximum results

        Returns:
            List of run records
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        query = f"SELECT * FROM runs WHERE {where_clause} ORDER BY created_at DESC"
        if limit:
            query += f" LIMIT {limit}"

        cursor.execute(query, params)
        rows = cursor.fetchall()

        # Fetch tags
        run_ids = [row["run_id"] for row in rows]
        tags_map = {}
        if run_ids:
            placeholders = ",".join("?" * len(run_ids))
            cursor.execute(
                f"SELECT run_id, tag FROM run_tags WHERE run_id IN ({placeholders})", run_ids
            )
            for row in cursor.fetchall():
                if row[0] not in tags_map:
                    tags_map[row[0]] = []
                tags_map[row[0]].append(row[1])

        conn.close()

        # Convert to records
        records = []
        for row in rows:
            data = dict(row)
            data["tags"] = tags_map.get(data["run_id"], [])

            # Parse JSON
            data["base_config"] = json.loads(data["base_config"])
            data["meta_controls"] = json.loads(data["meta_controls"])
            data["resolved_config"] = json.loads(data["resolved_config"])
            if data["metrics"]:
                data["metrics"] = RunMetrics.from_dict(json.loads(data["metrics"]))
            if data["features"]:
                data["features"] = RunFeatures.from_dict(json.loads(data["features"]))
            data["provenance"] = json.loads(data["provenance"])
            if data["platform_info"]:
                data["platform_info"] = json.loads(data["platform_info"])

            records.append(RunRecord.from_dict(data))

        return records

    def update_run_tags(self, run_id: str, tags: list[str]) -> None:
        """Update tags for a run.

        Args:
            run_id: Run identifier
            tags: New tags list
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        cursor.execute("DELETE FROM run_tags WHERE run_id = ?", (run_id,))
        for tag in tags:
            cursor.execute("INSERT INTO run_tags (run_id, tag) VALUES (?, ?)", (run_id, tag))

        # Update updated_at
        cursor.execute(
            "UPDATE runs SET updated_at = ? WHERE run_id = ?", (datetime.now().isoformat(), run_id)
        )

        conn.commit()
        conn.close()

    def update_run_notes(self, run_id: str, notes: str | None) -> None:
        """Update notes for a run.

        Args:
            run_id: Run identifier
            notes: New notes
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        cursor.execute(
            "UPDATE runs SET notes = ?, updated_at = ? WHERE run_id = ?",
            (notes, datetime.now().isoformat(), run_id),
        )

        conn.commit()
        conn.close()

    def get_all_feature_vectors(self) -> dict[str, list[float]]:
        """Get all feature vectors for similarity search.

        Returns:
            Dictionary mapping run_id to feature vector
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()

        cursor.execute("SELECT run_id, features FROM runs WHERE features IS NOT NULL")
        vectors = {}

        for row in cursor.fetchall():
            run_id, features_json = row
            if features_json:
                features = RunFeatures.from_dict(json.loads(features_json))
                vectors[run_id] = features.to_vector()

        conn.close()
        return vectors


# Global instance
_db_instance = None


def get_library_db() -> LibraryDB:
    """Get global library database instance.

    Returns:
        LibraryDB instance
    """
    global _db_instance
    if _db_instance is None:
        _db_instance = LibraryDB()
    return _db_instance
