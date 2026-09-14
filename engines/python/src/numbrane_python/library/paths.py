"""Library path management."""

import os
from pathlib import Path

import platformdirs


def get_library_root() -> Path:
    """Get library root directory.

    Returns:
        Path to library root
    """
    # Check environment variable first
    env_root = os.getenv("GENART_LIBRARY_ROOT")
    if env_root:
        return Path(env_root)

    # Use platform-appropriate cache directory
    cache_dir = platformdirs.user_cache_dir("numbrane", "numbrane")
    return Path(cache_dir) / "library"


def get_library_db_path() -> Path:
    """Get library database path.

    Returns:
        Path to SQLite database
    """
    root = get_library_root()
    root.mkdir(parents=True, exist_ok=True)
    return root / "library.sqlite"


def get_runs_dir() -> Path:
    """Get runs directory.

    Returns:
        Path to runs directory
    """
    root = get_library_root()
    runs_dir = root / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    return runs_dir


def get_run_path(run_id: str) -> Path:
    """Get path for a specific run.

    Args:
        run_id: Run identifier

    Returns:
        Path to run directory
    """
    runs_dir = get_runs_dir()
    return runs_dir / run_id


def ensure_run_path(run_id: str) -> Path:
    """Ensure run directory exists.

    Args:
        run_id: Run identifier

    Returns:
        Path to run directory
    """
    run_path = get_run_path(run_id)
    run_path.mkdir(parents=True, exist_ok=True)
    return run_path


def get_output_path(run_id: str, format: str = "png") -> Path:
    """Get output file path for a run.

    Args:
        run_id: Run identifier
        format: File format (png, gif, mp4)

    Returns:
        Path to output file
    """
    run_path = get_run_path(run_id)
    return run_path / f"output.{format}"


def get_thumb_path(run_id: str) -> Path:
    """Get thumbnail path for a run.

    Args:
        run_id: Run identifier

    Returns:
        Path to thumbnail file
    """
    run_path = get_run_path(run_id)
    return run_path / "thumb.png"


def get_preview_path(run_id: str, format: str = "gif") -> Path:
    """Get preview path for a run.

    Args:
        run_id: Run identifier
        format: Preview format (gif, mp4)

    Returns:
        Path to preview file
    """
    run_path = get_run_path(run_id)
    return run_path / f"preview.{format}"


def get_provenance_path(run_id: str) -> Path:
    """Get provenance JSON path for a run.

    Args:
        run_id: Run identifier

    Returns:
        Path to provenance file
    """
    run_path = get_run_path(run_id)
    return run_path / "provenance.json"


def get_config_path(run_id: str) -> Path:
    """Get resolved config JSON path for a run.

    Args:
        run_id: Run identifier

    Returns:
        Path to config file
    """
    run_path = get_run_path(run_id)
    return run_path / "resolved_config.json"


def get_metrics_path(run_id: str) -> Path:
    """Get metrics JSON path for a run.

    Args:
        run_id: Run identifier

    Returns:
        Path to metrics file
    """
    run_path = get_run_path(run_id)
    return run_path / "metrics.json"


def get_features_path(run_id: str) -> Path:
    """Get features JSON path for a run.

    Args:
        run_id: Run identifier

    Returns:
        Path to features file
    """
    run_path = get_run_path(run_id)
    return run_path / "features.json"


def get_notes_path(run_id: str) -> Path:
    """Get notes markdown path for a run.

    Args:
        run_id: Run identifier

    Returns:
        Path to notes file
    """
    run_path = get_run_path(run_id)
    return run_path / "notes.md"
