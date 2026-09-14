"""Preset storage and management."""

import json
from pathlib import Path
from typing import Any

from platformdirs import user_config_dir


class PresetStore:
    """Storage for presets."""

    def __init__(self, base_dir: Path | None = None):
        """Initialize preset store.

        Args:
            base_dir: Base directory for presets (default: ~/.config/numbrane/presets)
        """
        if base_dir is None:
            config_dir = Path(user_config_dir("numbrane", appauthor=False))
            base_dir = config_dir / "presets"
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save(self, name: str, preset_data: dict[str, Any]) -> None:
        """Save a preset.

        Args:
            name: Preset name
            preset_data: Preset data (sketch, config, etc.)
        """
        preset_path = self.base_dir / f"{name}.json"
        preset_data["name"] = name
        preset_data["version"] = "1.0"  # Version for future migrations
        with open(preset_path, "w") as f:
            json.dump(preset_data, f, indent=2)

    def load(self, name: str) -> dict[str, Any] | None:
        """Load a preset.

        Args:
            name: Preset name

        Returns:
            Preset data or None if not found
        """
        preset_path = self.base_dir / f"{name}.json"
        if not preset_path.exists():
            return None

        with open(preset_path) as f:
            return json.load(f)

    def list(self) -> list[str]:
        """List all preset names.

        Returns:
            List of preset names
        """
        return sorted([p.stem for p in self.base_dir.glob("*.json")])

    def remove(self, name: str) -> bool:
        """Remove a preset.

        Args:
            name: Preset name

        Returns:
            True if removed, False if not found
        """
        preset_path = self.base_dir / f"{name}.json"
        if preset_path.exists():
            preset_path.unlink()
            return True
        return False

    def exists(self, name: str) -> bool:
        """Check if preset exists.

        Args:
            name: Preset name

        Returns:
            True if exists
        """
        return (self.base_dir / f"{name}.json").exists()


# Global preset store instance
_preset_store: PresetStore | None = None


def get_preset_store(base_dir: Path | None = None) -> PresetStore:
    """Get the global preset store.

    Args:
        base_dir: Optional base directory override

    Returns:
        PresetStore instance
    """
    global _preset_store
    if _preset_store is None or base_dir is not None:
        _preset_store = PresetStore(base_dir)
    return _preset_store


def load_preset(name: str, base_dir: Path | None = None) -> dict[str, Any] | None:
    """Load a preset by name.

    Args:
        name: Preset name
        base_dir: Optional base directory

    Returns:
        Preset data or None
    """
    store = get_preset_store(base_dir)
    return store.load(name)
