"""Render result and metadata."""

import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np


class RenderResult:
    """Result of a render operation."""

    def __init__(
        self,
        image: np.ndarray,
        seed: int,
        sketch_name: str,
        config: Any,
        frame: int = 0,
        time: float = 0.0,
    ):
        """Initialize render result.

        Args:
            image: Rendered image as (H, W, 3) or (H, W, 4) uint8 array
            seed: Random seed used
            sketch_name: Name of the sketch
            config: Configuration object (Pydantic model)
            frame: Frame number (for animations)
            time: Normalized time (for animations)
        """
        self.image = image
        self.seed = seed
        self.sketch_name = sketch_name
        self.config = config
        self.frame = frame
        self.time = time

    @property
    def metadata(self) -> dict[str, Any]:
        """Generate metadata dictionary."""
        git_hash = self._get_git_hash()

        return {
            "seed": self.seed,
            "sketch": self.sketch_name,
            "frame": self.frame,
            "time": self.time,
            "timestamp": datetime.now().isoformat(),
            "git_hash": git_hash,
            "config": self.config.model_dump()
            if hasattr(self.config, "model_dump")
            else str(self.config),
        }

    def _get_git_hash(self) -> str | None:
        """Get current git hash if available."""
        try:
            result = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                capture_output=True,
                text=True,
                cwd=Path(__file__).parent.parent.parent,
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception:
            pass
        return None

    def save(self, path: Path, save_metadata: bool = True) -> None:
        """Save image and optionally metadata.

        Args:
            path: Path to save image
            save_metadata: Whether to save metadata JSON alongside image
        """
        from PIL import Image

        # Ensure directory exists
        path.parent.mkdir(parents=True, exist_ok=True)

        # Save image
        if self.image.shape[2] == 4:
            mode = "RGBA"
        else:
            mode = "RGB"

        img = Image.fromarray(self.image, mode=mode)
        img.save(path)

        # Save metadata
        if save_metadata:
            metadata_path = path.with_suffix(".json")
            with open(metadata_path, "w") as f:
                json.dump(self.metadata, f, indent=2)


class FrameResult:
    """Result for a single animation frame."""

    def __init__(self, image: np.ndarray, frame: int, time: float):
        """Initialize frame result.

        Args:
            image: Frame image
            frame: Frame number
            time: Normalized time
        """
        self.image = image
        self.frame = frame
        self.time = time
