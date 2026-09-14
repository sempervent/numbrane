"""Recipe manifest system for reproducibility."""

import hashlib
import json
import platform
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


class RecipeManifest:
    """Recipe manifest for reproducibility."""

    def __init__(
        self,
        sketch: str,
        config: Any,
        seed: int,
        output_file: Path | None = None,
    ):
        """Initialize recipe manifest.

        Args:
            sketch: Sketch name
            config: Configuration object
            seed: Random seed
            output_file: Output file path
        """
        self.sketch = sketch
        self.config = config
        self.seed = seed
        self.output_file = output_file

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary.

        Returns:
            Dictionary representation
        """
        # Get git hash
        git_hash = self._get_git_hash()

        # Get package version
        try:
            import numbrane_python

            package_version = numbrane_python.__version__
        except:
            package_version = "unknown"

        manifest = {
            "version": "1.0",
            "created_at": datetime.now().isoformat(),
            "sketch": self.sketch,
            "seed": self.seed,
            "config": self.config.model_dump()
            if hasattr(self.config, "model_dump")
            else str(self.config),
            "environment": {
                "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
                "platform": platform.system(),
                "platform_release": platform.release(),
                "architecture": platform.machine(),
            },
            "package": {
                "name": "numbrane",
                "version": package_version,
            },
            "git": {
                "hash": git_hash,
            },
        }

        # Add output file hash if available
        if self.output_file and self.output_file.exists():
            manifest["output"] = {
                "file": str(self.output_file),
                "sha256": self._hash_file(self.output_file),
            }

        return manifest

    def save(self, path: Path) -> None:
        """Save manifest to file.

        Args:
            path: Path to save manifest
        """
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @staticmethod
    def load(path: Path) -> dict[str, Any]:
        """Load manifest from file.

        Args:
            path: Path to manifest file

        Returns:
            Manifest dictionary
        """
        with open(path) as f:
            return json.load(f)

    def _get_git_hash(self) -> str | None:
        """Get current git hash."""
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

    def _hash_file(self, path: Path) -> str:
        """Compute SHA256 hash of file.

        Args:
            path: File path

        Returns:
            SHA256 hash
        """
        sha256 = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    @staticmethod
    def verify(manifest_path: Path) -> dict[str, Any]:
        """Verify a recipe manifest.

        Args:
            manifest_path: Path to manifest file

        Returns:
            Dictionary with verification results
        """
        manifest = RecipeManifest.load(manifest_path)
        results = {
            "valid": True,
            "errors": [],
            "warnings": [],
        }

        # Check required fields
        required = ["sketch", "seed", "config", "version"]
        for field in required:
            if field not in manifest:
                results["valid"] = False
                results["errors"].append(f"Missing required field: {field}")

        # Check output file hash if present
        if "output" in manifest:
            output_file = Path(manifest["output"]["file"])
            if output_file.exists():
                expected_hash = manifest["output"]["sha256"]
                actual_hash = RecipeManifest._hash_file_static(output_file)
                if expected_hash != actual_hash:
                    results["warnings"].append(
                        f"Output file hash mismatch: expected {expected_hash[:16]}..., got {actual_hash[:16]}..."
                    )
            else:
                results["warnings"].append(f"Output file not found: {output_file}")

        return results

    @staticmethod
    def _hash_file_static(path: Path) -> str:
        """Static method to hash file."""
        sha256 = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                sha256.update(chunk)
        return sha256.hexdigest()
