"""Taste profile system."""

import json
import sqlite3
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from numbrane_python.interpret.parser import IntentParser


@dataclass
class TasteProfile:
    """Taste profile for aesthetic bias."""

    name: str
    description: str = ""
    base_meta: dict[str, float] = field(default_factory=dict)
    parameter_biases: dict[str, Any] = field(default_factory=dict)
    forbidden_zones: dict[str, tuple] = field(default_factory=dict)  # control -> (min, max)
    default_exploration_goals: dict[str, float] = field(default_factory=dict)
    created_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TasteProfile":
        """Create from dictionary."""
        return cls(**data)


class TasteProfileStore:
    """Storage for taste profiles."""

    def __init__(self, db_path: Path):
        """Initialize store.

        Args:
            db_path: Path to SQLite database
        """
        self.db_path = db_path
        self._ensure_table()

    def _ensure_table(self) -> None:
        """Ensure taste_profiles table exists."""
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS taste_profiles (
                name TEXT PRIMARY KEY,
                description TEXT,
                base_meta TEXT NOT NULL,
                parameter_biases TEXT,
                forbidden_zones TEXT,
                default_exploration_goals TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()
        conn.close()

    def create(self, profile: TasteProfile) -> None:
        """Create a taste profile.

        Args:
            profile: Taste profile to create
        """
        if not profile.created_at:
            profile.created_at = datetime.utcnow().isoformat()

        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR REPLACE INTO taste_profiles
            (name, description, base_meta, parameter_biases, forbidden_zones, default_exploration_goals, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
            (
                profile.name,
                profile.description,
                json.dumps(profile.base_meta),
                json.dumps(profile.parameter_biases),
                json.dumps(profile.forbidden_zones),
                json.dumps(profile.default_exploration_goals),
                profile.created_at,
            ),
        )
        conn.commit()
        conn.close()

    def get(self, name: str) -> TasteProfile | None:
        """Get taste profile by name.

        Args:
            name: Profile name

        Returns:
            TasteProfile or None
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM taste_profiles WHERE name = ?", (name,))
        row = cursor.fetchone()
        conn.close()

        if row is None:
            return None

        return TasteProfile(
            name=row["name"],
            description=row["description"],
            base_meta=json.loads(row["base_meta"]),
            parameter_biases=json.loads(row["parameter_biases"]) if row["parameter_biases"] else {},
            forbidden_zones={k: tuple(v) for k, v in json.loads(row["forbidden_zones"]).items()}
            if row["forbidden_zones"]
            else {},
            default_exploration_goals=json.loads(row["default_exploration_goals"])
            if row["default_exploration_goals"]
            else {},
            created_at=row["created_at"],
        )

    def list(self) -> list[str]:
        """List all taste profile names.

        Returns:
            List of profile names
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM taste_profiles ORDER BY name")
        rows = cursor.fetchall()
        conn.close()

        return [row[0] for row in rows]

    def delete(self, name: str) -> bool:
        """Delete taste profile.

        Args:
            name: Profile name

        Returns:
            True if deleted, False if not found
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM taste_profiles WHERE name = ?", (name,))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()

        return deleted

    def apply_to_meta(
        self,
        profile_name: str,
        base_meta: dict[str, float],
        explicit_meta: dict[str, float] | None = None,
    ) -> dict[str, float]:
        """Apply taste profile to meta-controls.

        Args:
            profile_name: Profile name
            base_meta: Base meta-controls
            explicit_meta: Explicit user meta-controls (override profile)

        Returns:
            Combined meta-controls
        """
        profile = self.get(profile_name)
        if not profile:
            return base_meta

        # Start with base meta
        result = base_meta.copy()

        # Apply profile base_meta as bias (weighted average)
        for control, value in profile.base_meta.items():
            if control in result:
                # Blend: 70% explicit, 30% profile (if explicit exists)
                if explicit_meta and control in explicit_meta:
                    result[control] = explicit_meta[control]
                else:
                    # Apply profile bias (weighted average with base)
                    result[control] = 0.7 * result[control] + 0.3 * value

        # Check forbidden zones
        for control, (min_val, max_val) in profile.forbidden_zones.items():
            if control in result:
                if result[control] < min_val:
                    result[control] = min_val
                elif result[control] > max_val:
                    result[control] = max_val

        # Clamp to [0, 1]
        for control in result:
            result[control] = max(0.0, min(1.0, result[control]))

        return result


def create_profile_from_intent(name: str, intent_text: str, description: str = "") -> TasteProfile:
    """Create taste profile from intent text.

    Args:
        name: Profile name
        intent_text: Intent description
        description: Optional description

    Returns:
        TasteProfile
    """
    parser = IntentParser()
    result = parser.parse(intent_text)

    return TasteProfile(
        name=name,
        description=description or f"Generated from intent: {intent_text}",
        base_meta=result.meta,
        default_exploration_goals=result.meta.copy(),
    )
